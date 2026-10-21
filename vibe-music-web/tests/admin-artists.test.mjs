import assert from "node:assert/strict";
import test from "node:test";
import { artistPayload, artistGender } from "../src/lib/admin-artists.ts";

test("artist gender zero survives the form; empty optional date/type remain null", () => {
  const values = {
    artistName: "Test",
    gender: "0",
    birth: "1988-01-02",
    area: "",
    introduction: "",
  };
  assert.deepEqual(artistPayload(values), {
    artistName: "Test",
    gender: 0,
    birth: "1988-01-02",
    area: "",
    introduction: "",
  });
  assert.equal(
    artistPayload({ ...values, gender: "", birth: "" }, 4).artistId,
    4,
  );
  assert.equal(
    artistPayload({ ...values, gender: "", birth: "" }).gender,
    null,
  );
  assert.equal(artistPayload({ ...values, gender: "", birth: "" }).birth, null);
  assert.deepEqual([0, 1, 2, null, 5].map(artistGender), [
    "男歌手",
    "女歌手",
    "组合/乐队",
    "未知",
    "未知",
  ]);
});
