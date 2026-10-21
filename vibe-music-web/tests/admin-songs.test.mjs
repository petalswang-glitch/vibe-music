import assert from "node:assert/strict";
import test from "node:test";
import { songPayload, audioDuration } from "../src/lib/admin-songs.ts";

test("song metadata preserves styles while editing never reassigns the currently selected artist", () => {
  const values = {
    songName: "Test",
    album: "Album",
    releaseTime: "2026-01-02",
    styles: ["摇滚", "古典"],
  };
  assert.deepEqual(songPayload(values, 7), {
    artistId: 7,
    songName: "Test",
    album: "Album",
    releaseTime: "2026-01-02",
    style: "摇滚,古典",
  });
  assert.deepEqual(songPayload({ ...values, styles: [] }, 9, 11), {
    songId: 11,
    songName: "Test",
    album: "Album",
    releaseTime: "2026-01-02",
    style: "",
  });
});
test("audio duration keeps the legacy two decimals and rejects unresolved metadata", () => {
  assert.equal(audioDuration(2.612), "2.61");
  for (const value of [NaN, Infinity, -1, 0, 1e12])
    assert.equal(audioDuration(value), null);
});
