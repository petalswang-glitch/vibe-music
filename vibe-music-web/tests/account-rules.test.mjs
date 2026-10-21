import assert from "node:assert/strict";
import test from "node:test";
import { accountRules, accountFieldValid, loginErrorMessage } from "../src/lib/account-rules.ts";

test("username requirements respond separately to length and allowed characters", () => {
  assert.deepEqual(accountRules("username", "123").map(r => r.met), [false, true]);
  assert.equal(accountFieldValid("username", "1234"), true);
  assert.equal(accountFieldValid("username", "user-name_1"), true);
  for (const value of ["", "中文名字", "user name", "user\n", "abcdefghijklmnopq"]) {
    assert.equal(accountFieldValid("username", value), false, value);
  }
});

test("login combines credential errors while keeping availability and account status messages", () => {
  for (const message of ["邮箱错误", "邮箱不存在", "密码错误", "邮箱格式不正确", "密码格式不正确"]) {
    assert.equal(loginErrorMessage(message), "邮箱或密码错误");
  }
  for (const message of ["账号被锁定", "请求过于频繁", "会话服务暂时不可用", "Network Error"]) {
    assert.equal(loginErrorMessage(message), message);
  }
});

test("password checklist matches the existing backend expression including symbols", () => {
  const expression=/^(?![0-9]+$)(?![a-zA-Z]+$)[0-9A-Za-z\W]{8,18}$/u;
  for (const value of ["", "abc123", "12345678", "abcdefgh", "abc_1234", "Abcd123!", "!!!!!!!!", "密".repeat(8), "😀".repeat(8), "😀".repeat(10), "a1".repeat(10)]) {
    assert.equal(accountFieldValid("password", value), expression.test(value), value);
  }
  assert.deepEqual(accountRules("password", "12345678").map(r=>r.met), [true,false,true]);
  assert.deepEqual(accountRules("password", "Abcd123!").map(r=>r.met), [true,true,true]);
  assert.equal(accountFieldValid("password", ""),false);
});
