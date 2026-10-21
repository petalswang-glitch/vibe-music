/** POST SSE: preserve UTF-8, multiline data and a single optional field separator space. */
export async function readAgentResponse(
  response: Response,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.ok) {
    let message = `请求失败（${response.status}），请稍后重试`;
    try {
      const body = await response.json();
      if (typeof body?.message === "string") message = body.message;
    } catch {
      /* A proxy can return a non-JSON error. */
    }
    throw new Error(message);
  }
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  )
    throw new Error("未收到有效的流式响应，请重试");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  let finished = false;
  function line(value: string) {
    if (value === "") {
      if (data.length) {
        const text = data.join("\n");
        if (event === "error")
          throw new Error(text || "模型服务暂时不可用，请稍后重试");
        if (event === "done" || text === "[DONE]") finished = true;
        else if (event === "text" || event === "message") onDelta(text);
      }
      event = "message";
      data = [];
      return;
    }
    if (value.startsWith(":")) return;
    const colon = value.indexOf(":");
    const name = colon < 0 ? value : value.slice(0, colon);
    let field = colon < 0 ? "" : value.slice(colon + 1);
    if (field.startsWith(" ")) field = field.slice(1);
    if (name === "event") event = field;
    if (name === "data") data.push(field);
  }
  function parse(text: string) {
    buffer += text;
    let end: number;
    while (!finished && (end = buffer.indexOf("\n")) >= 0) {
      const value = buffer.slice(0, end).replace(/\r$/, "");
      buffer = buffer.slice(end + 1);
      line(value);
    }
  }
  const aborted = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", aborted, { once: true });
  try {
    while (!finished) {
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      parse(done ? decoder.decode() : decoder.decode(value, { stream: true }));
      if (done) break;
    }
    if (!finished) throw new Error("连接已中断，回复可能不完整，请重试");
  } finally {
    signal?.removeEventListener("abort", aborted);
    try {
      await reader.cancel();
    } catch {
      /* Already aborted or failed. */
    }
    reader.releaseLock();
  }
}

export async function streamAgentChat(
  conversationId: string,
  query: string,
  onDelta: (text: string) => void,
  options: {
    token: string | null;
    signal: AbortSignal;
    onUnauthorized: () => void;
  },
) {
  const response = await fetch("/api/agent/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify({ conversationId, query }),
    signal: options.signal,
  });
  if (response.status === 401) options.onUnauthorized();
  return readAgentResponse(response, onDelta, options.signal);
}
