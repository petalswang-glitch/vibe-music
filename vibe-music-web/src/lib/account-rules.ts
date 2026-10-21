export type AccountRule = { text: string; met: boolean };
export type AccountFieldKind = "username" | "password";

export function accountRules(kind: AccountFieldKind, value: string): AccountRule[] {
  const length = Array.from(value).length;
  if (kind === "username") {
    return [
      { text: "长度为 4～16 位", met: length >= 4 && length <= 16 },
      { text: "仅使用英文字母、数字、下划线或连字符", met: value.length > 0 && !/[^a-zA-Z0-9_-]/.test(value) },
    ];
  }
  // Match the backend's existing password expression, including its legacy
  // symbol-only acceptance and exclusion of underscores; do not change policy.
  return [
    { text: "长度为 8～18 位", met: length >= 8 && length <= 18 },
    { text: "不能仅含数字或仅含英文字母", met: value.length > 0 && !/^[0-9]+$/.test(value) && !/^[a-zA-Z]+$/.test(value) },
    { text: "不包含下划线（_）", met: value.length > 0 && !value.includes("_") },
  ];
}

export function accountFieldValid(kind: AccountFieldKind, value: string): boolean {
  return accountRules(kind, value).every((rule) => rule.met);
}

export function loginErrorMessage(message: string): string {
  return ["邮箱错误", "邮箱不存在", "密码错误", "邮箱格式不正确", "密码格式不正确"].includes(message)
    ? "邮箱或密码错误"
    : message;
}
