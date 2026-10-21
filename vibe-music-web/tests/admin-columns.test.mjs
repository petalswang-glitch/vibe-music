import assert from "node:assert/strict";
import test from "node:test";
import { moveAdminColumn } from "../src/lib/admin-columns.ts";

test("column reordering preserves visibility, fixed action/selection boundaries, and the original settings", () => {
  const columns = [
    { id: "select", label: "选择", visible: true, fixed: true },
    { id: "id", label: "编号", visible: true },
    { id: "user", label: "用户", visible: false },
    { id: "content", label: "内容", visible: true },
    { id: "action", label: "操作", visible: true, fixed: true },
  ];
  const moved = moveAdminColumn(columns, "content", "id");
  assert.deepEqual(
    moved.map((value) => value.id),
    ["select", "content", "id", "user", "action"],
  );
  assert.equal(moved[3].visible, false);
  assert.equal(columns[1].id, "id");
  for (const [from, to] of [
    ["select", "id"],
    ["id", "action"],
    ["unknown", "id"],
    ["id", "id"],
  ])
    assert.equal(moveAdminColumn(columns, from, to), columns);
});
