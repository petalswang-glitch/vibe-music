export type ManagedUser = {
  userId: number;
  username: string;
  phone: string | null;
  email: string;
  userAvatar: string | null;
  introduction: string | null;
  userStatus: "ENABLE" | "DISABLE";
  createTime: string;
  updateTime: string;
};
export type UserFormValues = {
  username: string;
  password: string;
  email: string;
  phone: string;
  introduction: string;
  enabled: boolean;
};
export function userPayload(value: UserFormValues, userId?: number) {
  const common = {
    username: value.username,
    email: value.email,
    phone: value.phone,
    introduction: value.introduction,
  };
  // Keep the legacy add-only switch inversion out of the rest of the UI.
  return userId === undefined
    ? { ...common, password: value.password, userStatus: value.enabled ? 1 : 0 }
    : { ...common, userId };
}
export function maskedPhone(phone: string | null) {
  return phone ? `${phone.slice(0, 3)}****${phone.slice(7)}` : "—";
}
