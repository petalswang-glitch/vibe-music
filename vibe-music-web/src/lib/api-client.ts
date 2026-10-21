import axios from "axios";

export const apiClient = axios.create({ baseURL: "/api", timeout: 10_000 });
export const authStorageKey = "vibe-music-session-v1";
let browserToken: string | null = null;
let browserSessionRevision = 0;

export function getBrowserSessionRevision() {
  return browserSessionRevision;
}

export function getBrowserToken() {
  return browserToken;
}

export function setBrowserToken(value: string | null) {
  if (typeof window === "undefined")
    throw new Error("Authentication is client-only");
  if (browserToken !== value) browserSessionRevision++;
  browserToken = value;
}

apiClient.interceptors.request.use((config) => {
  if (
    typeof window !== "undefined" &&
    browserToken &&
    !config.headers.Authorization
  ) {
    config.headers.Authorization = `Bearer ${browserToken}`;
  }
  return config;
});
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      typeof window !== "undefined" &&
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      browserToken &&
      error.config?.headers.Authorization === `Bearer ${browserToken}`
    ) {
      window.dispatchEvent(new Event("vibe-auth-expired"));
    }
    return Promise.reject(error);
  },
);

export type ApiResult<T> = { code: number; message: string; data: T };

export async function getApi<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const { data } = await apiClient.get<ApiResult<T>>(path, { signal });
  if (data.code !== 0) throw new Error(data.message || "请求失败");
  return data.data;
}

export async function postApi<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const { data } = await apiClient.post<ApiResult<T>>(path, body, { signal });
  if (data.code !== 0) throw new Error(data.message || "请求失败");
  return data.data;
}
