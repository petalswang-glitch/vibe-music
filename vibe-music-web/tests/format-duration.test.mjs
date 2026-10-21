import assert from "node:assert/strict";
import test from "node:test";
import { formatDuration } from "../src/lib/format-duration.ts";

test("legacy fractional seconds render as mm:ss", () => {
  assert.equal(formatDuration("196.98"), "03:16");
});

test("hour-long audio preserves the old hh:mm:ss format", () => {
  assert.equal(formatDuration("3661.5"), "01:01:01");
});

test("legacy zero and null durations render as 00:00", () => {
  assert.equal(formatDuration("0"), "00:00");
  assert.equal(formatDuration(null), "00:00");
});

test("invalid durations do not expose NaN to the page", () => {
  assert.equal(formatDuration("not-a-duration"), "—");
  assert.equal(formatDuration("-1"), "—");
});
