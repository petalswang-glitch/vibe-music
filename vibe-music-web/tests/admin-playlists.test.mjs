import assert from "node:assert/strict";
import test from "node:test";
import { playlistPayload } from "../src/lib/admin-playlists.ts";
test("playlist forms keep a single style and explicit empty optional fields, without media URLs", () => {
  const values = {
    title: "Test",
    style: "摇滚",
    introduction: "Hello",
    coverUrl: "/media/not-editable",
  };
  assert.deepEqual(playlistPayload(values), {
    title: "Test",
    style: "摇滚",
    introduction: "Hello",
  });
  assert.deepEqual(
    playlistPayload({ ...values, style: "", introduction: "" }, 8),
    { playlistId: 8, title: "Test", style: "", introduction: "" },
  );
});
