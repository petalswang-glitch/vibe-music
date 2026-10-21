import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { refreshComments } from "../src/lib/comment-cache.ts";

test("public comment changes invalidate every viewer of the target, without random recommendation refresh", async () => {
  const client = new QueryClient();
  const affected = [
    ["song", "detail", 1, { viewer: 10 }],
    ["song", "detail", 1, { viewer: 20 }],
    ["song", "detail", 1, { viewer: null }],
  ];
  const unrelated = [
    ["song", "detail", 2, { viewer: 10 }],
    ["playlist", "detail", 1, { viewer: 10 }],
    ["song", "recommended", { viewer: 10 }],
    ["favorite", "songs", { viewer: 10 }],
  ];
  for (const key of [...affected, ...unrelated]) client.setQueryData(key, { comments: [] });
  try {
    await refreshComments(client, "song", 1);
    for (const key of affected) assert.equal(client.getQueryState(key).isInvalidated, true);
    for (const key of unrelated) assert.equal(client.getQueryState(key).isInvalidated, false);
  } finally { client.clear(); }
});

test("an old detail response cannot restore deleted comments after refresh", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = ["playlist", "detail", 1, { viewer: 10 }];
  let calls = 0;
  let finishOld;
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: () => {
      calls++;
      return calls === 1 ? new Promise((resolve) => { finishOld = resolve; }) : Promise.resolve({ comments: [] });
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await refreshComments(client, "playlist", 1);
    assert.equal(calls, 2);
    assert.equal(client.getQueryState(key).status, "success");
    finishOld({ comments: [{ commentId: 1, content: "Deleted" }] });
    await Promise.resolve();
    assert.deepEqual(client.getQueryData(key).comments, []);
  } finally { unsubscribe(); client.clear(); }
});
