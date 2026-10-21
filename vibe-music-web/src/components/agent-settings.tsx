"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApi, getBrowserSessionRevision } from "@/lib/api-client";
import {
  modelProviders,
  saveAgentConfiguration,
  removeAgentConfiguration,
  type AgentConfiguration,
  type ModelProvider,
} from "@/lib/agent-config";
import { viewerKey } from "@/lib/favorite-cache";
import { authError } from "@/providers/auth-provider";

const providerNames = {
  siliconflow: "硅基流动",
  deepseek: "DeepSeek",
  openai: "OpenAI",
  dashscope: "阿里云百炼",
};

export function AgentSettings({ userId }: { userId: number }) {
  const query = useQuery({
    queryKey: ["agent-config", viewerKey(userId)],
    queryFn: ({ signal }) =>
      getApi<AgentConfiguration>("/user/agent-config", signal),
  });
  return (
    <section
      id="agent-settings"
      aria-labelledby="agent-settings-title"
      className="mt-10 scroll-mt-8 border-t pt-8"
    >
      <h2 id="agent-settings-title" className="text-lg font-semibold">
        我的 Agent 配置
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        填写你在模型平台申请的 API Key，调用费用由该 Key 所属账号承担。Key
        由服务端加密保存，不会回显。
      </p>
      {query.isPending ? (
        <p role="status" className="mt-4 text-sm">
          正在加载配置...
        </p>
      ) : query.isError ? (
        <div role="alert" className="mt-4 text-sm">
          <p>无法加载 Agent 配置</p>
          <button
            onClick={() => void query.refetch()}
            className="mt-2 text-primary"
          >
            重新加载
          </button>
        </div>
      ) : (
        <ConfigurationForm
          key={`${userId}:${query.data.provider}:${query.data.modelName}:${query.data.configured}`}
          userId={userId}
          initial={query.data}
        />
      )}
    </section>
  );
}

function ConfigurationForm({
  userId,
  initial,
}: {
  userId: number;
  initial: AgentConfiguration;
}) {
  const client = useQueryClient();
  const [provider, setProvider] = useState<ModelProvider>(initial.provider);
  const [modelName, setModelName] = useState(initial.modelName);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function update(event?: FormEvent) {
    event?.preventDefault();
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const revision = getBrowserSessionRevision();
    const current = () =>
      !controller.signal.aborted && revision === getBrowserSessionRevision();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (event) {
        const result = await saveAgentConfiguration(
          { provider, modelName, ...(apiKey ? { apiKey } : {}) },
          controller.signal,
        );
        if (!current()) return;
        setApiKey("");
        client.setQueryData(["agent-config", viewerKey(userId)], result);
        setNotice("配置已保存，下次对话将使用你的 Key。");
      } else {
        await removeAgentConfiguration(controller.signal);
        if (!current()) return;
        setApiKey("");
        await client.invalidateQueries({
          queryKey: ["agent-config", viewerKey(userId)],
        });
      }
    } catch (cause) {
      if (current()) setError(authError(cause, "Agent 配置保存失败，请重试"));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (current()) setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void update(event)} className="mt-5 space-y-4">
      <p className="text-sm text-muted-foreground">
        {initial.configured
          ? "已保存 Key；留空可继续使用，仅调整模型。"
          : "尚未配置 Key，配置后即可使用 VibeAgent。"}
      </p>
      <label className="block text-sm">
        模型厂商
        <select
          value={provider}
          disabled={busy}
          onChange={(event) => {
            setProvider(event.target.value as ModelProvider);
            setApiKey("");
            setModelName("");
          }}
          className="mt-2 block w-full rounded-lg border bg-background px-4 py-3"
        >
          {modelProviders.map((item) => (
            <option key={item} value={item}>
              {providerNames[item]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        模型名称
        <input
          value={modelName}
          required
          maxLength={200}
          disabled={busy}
          onChange={(event) => setModelName(event.target.value)}
          placeholder="填写该厂商支持的模型 ID"
          className="mt-2 block w-full rounded-lg border bg-background px-4 py-3"
        />
      </label>
      <label className="block text-sm">
        模型 API Key
        <input
          type="password"
          value={apiKey}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          minLength={20}
          maxLength={4096}
          required={!initial.configured || provider !== initial.provider}
          disabled={busy}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            initial.configured
              ? "留空表示保持已保存的 Key"
              : "仅填写你自己的 API Key"
          }
          className="mt-2 block w-full rounded-lg border bg-background px-4 py-3"
        />
      </label>
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          disabled={busy}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm text-white disabled:opacity-40"
        >
          {busy ? "处理中..." : "保存 Agent 配置"}
        </button>
        <button
          type="button"
          disabled={busy || !initial.configured}
          onClick={() => void update()}
          className="rounded-lg border px-5 py-2.5 text-sm disabled:opacity-40"
        >
          移除我的 Key
        </button>
      </div>
    </form>
  );
}
