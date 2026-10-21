import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  belongsToViewer,
  patchFavorite,
  synchronizeFavorite,
  viewerKey,
} from "../src/lib/favorite-cache.ts";
import { createPlayerStore } from "../src/lib/player-store.ts";

test("favorite success restarts a cancelled initial detail request", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let calls = 0;
  let finishOldRequest;
  const key = ["song", "detail", 1, viewerKey(10)];
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: () => {
      calls++;
      return calls === 1
        ? new Promise((resolve) => {
            finishOldRequest = resolve;
          })
        : Promise.resolve({ songId: 1, likeStatus: 1 });
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    assert.equal(client.getQueryState(key).fetchStatus, "fetching");
    await synchronizeFavorite(client, {
      owner: 10,
      kind: "song",
      id: 1,
      liked: true,
      isCurrent: () => true,
      applyQueue: () => {},
    });
    assert.equal(calls, 2);
    assert.equal(client.getQueryState(key).status, "success");
    assert.equal(client.getQueryData(key).likeStatus, 1);
    finishOldRequest({ songId: 1, likeStatus: 0 });
    await Promise.resolve();
    assert.equal(client.getQueryData(key).likeStatus, 1);
  } finally {
    unsubscribe();
    client.clear();
  }
});

test("completed nonfavorite results are patched without refetching or invalidating", async () => {
  const client = new QueryClient();
  const own = ["songs", viewerKey(10)];
  const other = ["songs", viewerKey(20)];
  client.setQueryData(own, [{ songId: 1, likeStatus: 0 }]);
  client.setQueryData(other, [{ songId: 1, likeStatus: 0 }]);
  let updates = 0;
  try {
    await synchronizeFavorite(client, {
      owner: 10,
      kind: "song",
      id: 1,
      liked: true,
      isCurrent: () => true,
      applyQueue: () => {
        updates++;
      },
    });
    assert.equal(client.getQueryData(own)[0].likeStatus, 1);
    assert.equal(client.getQueryState(own).isInvalidated, false);
    assert.equal(client.getQueryData(other)[0].likeStatus, 0);
    assert.equal(updates, 1);
    await synchronizeFavorite(client, {
      owner: 10,
      kind: "song",
      id: 1,
      liked: false,
      isCurrent: () => false,
      applyQueue: () => {
        updates++;
      },
    });
    assert.equal(updates, 1);
    assert.equal(client.getQueryData(own)[0].likeStatus, 1);
  } finally {
    client.clear();
  }
});

test("query ownership distinguishes anonymous and different users", () => {
  assert.deepEqual(viewerKey(undefined), { viewer: null });
  assert.equal(belongsToViewer(["songs", 1, viewerKey(10)], 10), true);
  assert.equal(belongsToViewer(["songs", 10, viewerKey(20)], 10), false);
  assert.equal(belongsToViewer(["songs", viewerKey(null)], 10), false);
});

test("favorite changes invalidate only the owner's corresponding recommendation", async () => {
  const client = new QueryClient();
  const song = ["song", "recommended", viewerKey(10)];
  const playlist = ["playlist", "recommended", viewerKey(10)];
  const other = ["song", "recommended", viewerKey(20)];
  const anonymous = ["song", "recommended", viewerKey(null)];
  for (const key of [song, playlist, other, anonymous]) client.setQueryData(key, []);
  try {
    await synchronizeFavorite(client, {
      owner: 10,
      kind: "song",
      id: 1,
      liked: true,
      isCurrent: () => true,
      applyQueue: () => {},
    });
    assert.equal(client.getQueryState(song).isInvalidated, true);
    for (const key of [playlist, other, anonymous])
      assert.equal(client.getQueryState(key).isInvalidated, false);
    await synchronizeFavorite(client, {
      owner: 10,
      kind: "playlist",
      id: 1,
      liked: true,
      isCurrent: () => true,
      applyQueue: () => {},
    });
    assert.equal(client.getQueryState(playlist).isInvalidated, true);
  } finally {
    client.clear();
  }
});

test("favorite changes update all matching songs without changing playlist IDs", () => {
  const unchanged = { songId: 2, likeStatus: 0 };
  const data = {
    playlistId: 1,
    likeStatus: 0,
    songs: [{ songId: 1, likeStatus: null }, unchanged],
  };
  const next = patchFavorite(data, "song", 1, true);
  assert.equal(next.likeStatus, 0);
  assert.equal(next.songs[0].likeStatus, 1);
  assert.equal(next.songs[1], unchanged);
  assert.equal(data.songs[0].likeStatus, null);
  assert.equal(patchFavorite(next, "song", 1, true), next);
});

test("playlist changes do not add fields to legacy list responses", () => {
  const listing = [{ playlistId: 1, title: "List" }];
  assert.equal(patchFavorite(listing, "playlist", 1, true), listing);
  assert.deepEqual(
    patchFavorite({ playlistId: 1, likeStatus: 1 }, "playlist", 1, false),
    { playlistId: 1, likeStatus: 0 },
  );
});

test("changing a queue favorite preserves audio state and unrelated tracks", () => {
  const store = createPlayerStore();
  store.getState().playQueue(
    [
      { songId: 1, likeStatus: 0, duration: "100" },
      { songId: 2, likeStatus: 0, duration: "100" },
    ],
    1,
  );
  store.setState({ currentTime: 35, isPlaying: true });
  const before = store.getState();
  store.getState().setSongLike(1, true);
  const after = store.getState();
  assert.equal(after.queue[0].likeStatus, 1);
  assert.equal(after.queue[1], before.queue[1]);
  for (const key of [
    "currentTime",
    "isPlaying",
    "currentIndex",
    "wantsToPlay",
    "loadRevision",
    "volume",
  ])
    assert.equal(after[key], before[key], key);
});
