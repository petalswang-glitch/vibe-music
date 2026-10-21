import { apiClient, getBrowserToken, type ApiResult } from "./api-client.ts";

export const modelProviders = [
  "siliconflow",
  "deepseek",
  "openai",
  "dashscope",
] as const;
export type ModelProvider = (typeof modelProviders)[number];
export type AgentConfiguration = {
  configured: boolean;
  provider: ModelProvider;
  modelName: string;
};

export async function saveAgentConfiguration(
  body: { provider: ModelProvider; modelName: string; apiKey?: string },
  signal: AbortSignal,
) {
  const token = getBrowserToken();
  if (!token) throw new Error("请先登录");
  // Capture this identity before Axios schedules interceptors. A later login must
  // never upload the previous user's provider key into the new user's account.
  const { data } = await apiClient.put<ApiResult<AgentConfiguration>>(
    "/user/agent-config",
    body,
    {
      signal,
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (data.code !== 0) throw new Error(data.message);
  return data.data;
}

export async function removeAgentConfiguration(signal: AbortSignal) {
  const token = getBrowserToken();
  if (!token) throw new Error("请先登录");
  const { data } = await apiClient.delete<ApiResult<null>>(
    "/user/agent-config",
    {
      signal,
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (data.code !== 0) throw new Error(data.message);
}
