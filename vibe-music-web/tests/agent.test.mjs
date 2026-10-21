import assert from "node:assert/strict";
import test from "node:test";
import { readAgentResponse, streamAgentChat } from "../src/lib/agent-stream.ts";
import {
  parseAgentContent,
  conversationStorageKey,
} from "../src/lib/agent-content.ts";
import { renderAgentMarkdown } from "../src/lib/agent-markdown.ts";

function response(text, oneByte = false) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        if (oneByte)
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        else controller.enqueue(bytes);
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream; charset=utf-8" } },
  );
}

test("SSE parses byte-split UTF-8, CRLF, multiline/empty data and leading spaces", async () => {
  const deltas = [];
  await readAgentResponse(
    response(
      ": heartbeat\r\nevent: text\r\ndata:你好\r\ndata:\r\ndata:  保留空格\r\n\r\nevent: text\ndata:\n\nevent: done\ndata:[DONE]\n\n",
      true,
    ),
    (part) => deltas.push(part),
  );
  assert.deepEqual(deltas, ["你好\n\n 保留空格", ""]);
});

test("SSE ignores unknown events and supports the original data-only DONE marker", async () => {
  const deltas = [];
  await readAgentResponse(
    response(
      "event: metadata\ndata:invisible\n\ndata:answer\n\ndata:[DONE]\n\ndata:late\n\n",
    ),
    (part) => deltas.push(part),
  );
  assert.deepEqual(deltas, ["answer"]);
});

test("SSE reports server errors and broken connections without treating partial output as success", async () => {
  const deltas = [];
  await assert.rejects(
    readAgentResponse(
      response(
        "event: text\ndata:partial\n\nevent: error\ndata:模型服务暂时不可用\n\n",
      ),
      (part) => deltas.push(part),
    ),
    /模型服务暂时不可用/,
  );
  assert.deepEqual(deltas, ["partial"]);
  await assert.rejects(
    readAgentResponse(response("event: text\ndata:partial\n\n"), () => {}),
    /回复可能不完整/,
  );
  await assert.rejects(
    readAgentResponse(
      new Response(JSON.stringify({ message: "尚未配置模型密钥" }), {
        status: 503,
      }),
      () => {},
    ),
    /尚未配置模型密钥/,
  );
  await assert.rejects(
    readAgentResponse(new Response("proxy error", { status: 502 }), () => {}),
    /502/,
  );
  await assert.rejects(
    readAgentResponse(new Response("html"), () => {}),
    /有效的流式响应/,
  );
});

test("aborting a pending SSE read cancels and releases its reader", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const abort = new AbortController();
  const promise = readAgentResponse(
    new Response(body, { headers: { "content-type": "text/event-stream" } }),
    () => {},
    abort.signal,
  );
  abort.abort();
  await assert.rejects(promise, { name: "AbortError" });
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test("chat requests use same-origin POST, Bearer only when present, and notify 401", async () => {
  const originalFetch = globalThis.fetch;
  const abort = new AbortController();
  const calls = [];
  let unauthorized = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1
      ? response("event: done\ndata:[DONE]\n\n")
      : new Response(JSON.stringify({ message: "登录已失效" }), {
          status: 401,
        });
  };
  try {
    await streamAgentChat("conversation", "question", () => {}, {
      token: null,
      signal: abort.signal,
      onUnauthorized: () => unauthorized++,
    });
    assert.equal(calls[0].url, "/api/agent/chat");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.credentials, "same-origin");
    assert.equal(calls[0].init.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      conversationId: "conversation",
      query: "question",
    });
    await assert.rejects(
      streamAgentChat("conversation", "question", () => {}, {
        token: "test-token",
        signal: abort.signal,
        onUnauthorized: () => unauthorized++,
      }),
      /登录已失效/,
    );
    assert.equal(calls[1].init.headers.Authorization, "Bearer test-token");
    assert.equal(unauthorized, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("song tags validate/deduplicate five cards and conceal fragmented JSON", () => {
  const rows = [
    { songId: true, songName: "bad" },
    { songId: "1", songName: "bad" },
    ...Array.from({ length: 8 }, (_, i) => ({
      songId: i + 1,
      songName: `Song ${i}`,
      likeStatus: 1,
    })),
    { songId: 1, songName: "duplicate" },
  ];
  const content = `正文<vibe-songs>${JSON.stringify(rows)}</vibe-songs>结尾<vibe-songs>{"songId":123`;
  const parsed = parseAgentContent(content);
  assert.equal(parsed.text, "正文结尾");
  assert.deepEqual(
    parsed.songs.map((song) => song.songId),
    [1, 2, 3, 4, 5],
  );
  assert.equal(parsed.songs[0].likeStatus, null);
  assert.equal(parseAgentContent("正文<vibe-").text, "正文");
  assert.deepEqual(parseAgentContent("<vibe-songs>bad</vibe-songs>"), {
    text: "",
    songs: [],
  });
  assert.notEqual(
    conversationStorageKey("guest"),
    conversationStorageKey("user-1"),
  );
  assert.notEqual(
    conversationStorageKey("user-1"),
    conversationStorageKey("user-2"),
  );
});

test("Markdown preserves formatting and links but escapes HTML and unsafe protocols", () => {
  const html = renderAgentMarkdown(
    "**推荐**\n下一行\n\n- 一\n- 二\n\nhttps://example.com\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))\n\n[bad](data:text/html,test)",
  );
  assert.match(html, /<strong>推荐<\/strong>/);
  assert.match(html, /<br>/);
  assert.match(html, /<ul>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /<script|<img|href="javascript:|href="data:/i);
});
