import axios from "axios";
import type { ApiResult } from "./api-client";

export const adminStorageKey = "vibe-music-admin-session-v1";
export const adminClient = axios.create({ baseURL: "/api", timeout: 10_000 });
let token: string | null = null;
let revision = 0;
export function setAdminToken(value: string | null) {
  if (typeof window === "undefined")
    throw new Error("Authentication is client-only");
  if (value !== token) revision++;
  token = value;
}
export function adminRevision() {
  return revision;
}
adminClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined" && token)
    config.headers.Authorization = `Bearer ${token}`;
  return config;
});
adminClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      typeof window !== "undefined" &&
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      token &&
      error.config?.headers.Authorization === `Bearer ${token}`
    )
      window.dispatchEvent(new Event("vibe-admin-expired"));
    return Promise.reject(error);
  },
);
export async function adminGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const { data } = await adminClient.get<ApiResult<T>>(path, { signal });
  if (data.code !== 0) throw new Error(data.message || "请求失败");
  return data.data;
}
export async function adminPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const { data } = await adminClient.post<ApiResult<T>>(path, body, { signal });
  if (data.code !== 0) throw new Error(data.message || "请求失败");
  return data.data;
}
