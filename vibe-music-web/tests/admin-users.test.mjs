import assert from "node:assert/strict";
import test from "node:test";
import { userPayload, maskedPhone } from "../src/lib/admin-users.ts";

test("new-user switch uses the legacy reversed wire value without leaking it into edits", () => {
  const input = {
    username: "tester",
    password: "Secret123!",
    phone: "",
    email: "tester@example.com",
    introduction: "Hello",
    enabled: true,
  };
  assert.equal(userPayload(input).userStatus, 1);
  assert.equal(userPayload({ ...input, enabled: false }).userStatus, 0);
  const updated = userPayload(input, 12);
  assert.equal(updated.userId, 12);
  assert.equal("password" in updated, false);
  assert.equal("userStatus" in updated, false);
  assert.equal(updated.phone, "");
});
test("phone display masks the four middle digits while optional phone stays empty", () => {
  assert.equal(maskedPhone("13800138000"), "138****8000");
  assert.equal(maskedPhone(null), "—");
});
