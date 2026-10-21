import assert from "node:assert/strict";
import test from "node:test";
import { fetchDashboardCounts } from "../src/lib/admin-dashboard.ts";

test("dashboard starts all 22 original counts concurrently and maps totals and distributions correctly", async () => {
  const calls = [];
  const pending = [];
  const controller = new AbortController();
  const result = fetchDashboardCounts((path, signal) => {
    assert.equal(signal, controller.signal);
    calls.push(decodeURIComponent(path));
    return new Promise((resolve) => pending.push(resolve));
  }, controller.signal);
  assert.equal(calls.length, 22);
  assert.deepEqual(calls.slice(0, 4), [
    "/admin/getAllUsersCount",
    "/admin/getAllArtistsCount",
    "/admin/getAllSongsCount",
    "/admin/getAllPlaylistsCount",
  ]);
  assert.equal(calls[4], "/admin/getAllSongsCount?style=欧美流行");
  assert.equal(calls[13], "/admin/getAllSongsCount?style=轻音乐");
  assert.equal(calls[14], "/admin/getAllArtistsCount?area=美国");
  assert.equal(calls[19], "/admin/getAllArtistsCount?area=英国");
  assert.deepEqual(calls.slice(20), [
    "/admin/getAllArtistsCount?gender=0",
    "/admin/getAllArtistsCount?gender=1",
  ]);
  pending.forEach((resolve, index) => resolve(index + 10));
  const counts = await result;
  assert.deepEqual(counts.totals, {
    users: 10,
    artists: 11,
    songs: 12,
    playlists: 13,
  });
  assert.deepEqual(
    counts.styles.map((row) => row.value),
    [14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  );
  assert.deepEqual(
    counts.areas.map((row) => row.value),
    [24, 25, 26, 27, 28, 29],
  );
  assert.deepEqual(counts.genders, [
    { name: "男", value: 30 },
    { name: "女", value: 31 },
  ]);
});

test("real zero counts stay valid without inventing categories or totals", async () => {
  const counts = await fetchDashboardCounts(async () => 0);
  assert.deepEqual(counts.totals, {
    users: 0,
    artists: 0,
    songs: 0,
    playlists: 0,
  });
  assert.equal(counts.styles.length, 10);
  assert.equal(counts.areas.length, 6);
  assert.equal(counts.genders.length, 2);
  assert.ok(
    [...counts.styles, ...counts.areas, ...counts.genders].every(
      (row) => row.value === 0,
    ),
  );
});

test("a failed count or invalid response never produces a partially zeroed dashboard", async () => {
  await assert.rejects(
    fetchDashboardCounts(async (path) => {
      if (path.includes("gender=0")) throw new Error("network unavailable");
      return 30;
    }),
    /network unavailable/,
  );
  for (const invalid of [null, undefined, "5", -1, 1.2, Infinity, NaN]) {
    await assert.rejects(
      fetchDashboardCounts(async () => invalid),
      /统计数据无效/,
    );
  }
});

test("session cancellation reaches every count request and cannot return a dashboard", async () => {
  const controller = new AbortController();
  let cancelled = 0;
  const result = fetchDashboardCounts(
    (path, signal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            cancelled++;
            reject(new Error("aborted"));
          },
          { once: true },
        );
      }),
    controller.signal,
  );
  controller.abort();
  await assert.rejects(result, /aborted/);
  assert.equal(cancelled, 22);
});
