"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { apiClient, getApi, postApi } from "@/lib/api-client";
import { authError, useAuth } from "@/providers/auth-provider";
import { AccountRuleInput } from "@/components/account-rule-input";
import { accountFieldValid, loginErrorMessage } from "@/lib/account-rules";

type Mode = "login" | "register" | "reset";
const titles = { login: "登录", register: "注册", reset: "重置密码" };

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => {
      alive.current = false;
      element?.close();
    };
  }, []);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [seconds]);
  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
    setPassword("");
    setRepeat("");
    setCode("");
  }
  async function sendCode() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("请输入正确的邮箱");
      return;
    }
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      await getApi(
        `/user/sendVerificationCode?email=${encodeURIComponent(email)}`,
      );
      if (alive.current) {
        setSeconds(60);
        setMessage("验证码已发送，请查收邮件");
      }
    } catch (cause) {
      if (alive.current) setError(authError(cause, "发送验证码失败"));
    } finally {
      if (alive.current) setSending(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (mode === "register" && !accountFieldValid("username", username)) {
      setError("用户名需要 4～16 位，仅支持英文字母、数字、下划线或连字符");
      return;
    }
    if (mode !== "login" && !accountFieldValid("password", password)) {
      setError("密码需要 8～18 位，不能仅含数字或仅含英文字母，且不能包含下划线");
      return;
    }
    if (mode === "reset" && repeat !== password) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
        if (alive.current) onClose();
      } else if (mode === "register") {
        await postApi("/user/register", {
          username,
          email,
          password,
          verificationCode: code,
        });
        if (alive.current) {
          switchMode("login");
          setMessage("注册成功，请登录");
        }
      } else {
        const result = await apiClient.patch("/user/resetUserPassword", {
          email,
          verificationCode: code,
          newPassword: password,
          repeatPassword: repeat,
        });
        if (result.data.code !== 0) throw new Error(result.data.message);
        if (alive.current) {
          switchMode("login");
          setMessage("密码重置成功，请登录");
        }
      }
    } catch (cause) {
      if (alive.current) {
        const detail = authError(cause);
        setError(mode === "login" ? loginErrorMessage(detail) : detail);
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const inputClass = "w-full rounded-lg border bg-background px-3 py-3 text-sm";
  return (
    <dialog
      ref={dialog}
      aria-labelledby="auth-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(26rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border bg-background p-6 text-foreground shadow-paper-lg backdrop:bg-black/40"
    >
      <header className="mb-5 flex items-center justify-between">
        <h2
          id="auth-title"
          className="font-serif-display text-2xl font-semibold"
        >
          {titles[mode]}
        </h2>
        <button
          aria-label="关闭账号窗口"
          onClick={onClose}
          className="rounded-full p-2 hover:bg-muted"
        >
          <X size={19} />
        </button>
      </header>
      <p className="mb-5 text-sm text-muted-foreground">
        {mode === "login"
          ? "输入您的邮箱以登录您的账户"
          : mode === "register"
            ? "创建一个新账户"
            : "通过邮箱验证码重置密码"}
      </p>
      <form
        onSubmit={submit}
        onInvalidCapture={(event) => {
          // Keep our persistent guidance instead of the browser's generic popup.
          event.preventDefault();
          setError(mode === "register"
            ? "注册尚未完成，请检查并补全表单中的要求。"
            : mode === "login" ? "邮箱或密码错误" : "请检查并补全表单中的要求。");
          const firstInvalid = event.currentTarget.querySelector<HTMLInputElement>("input:invalid");
          if (event.target === firstInvalid) firstInvalid?.focus();
        }}
        className="space-y-4"
      >
        {mode === "register" && error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {mode === "register" && (
          <AccountRuleInput kind="username" label="用户名" value={username} onChange={setUsername} autoComplete="username" />
        )}
        <label className="block text-sm">
          邮箱
          <input
            required
            type="email"
            autoComplete="email"
            maxLength={128}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`${inputClass} mt-1.5`}
          />
        </label>
        {mode !== "login" && (
          <div>
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={!!seconds || sending || busy}
              className="mb-3 rounded-lg border px-3 py-2 text-sm text-primary disabled:opacity-40"
            >
              {sending
                ? "正在发送..."
                : seconds
                  ? `${seconds}s后重试`
                  : "获取验证码"}
            </button>
            <label className="block text-sm">
              验证码
              <input
                required
                pattern="[0-9a-zA-Z]{6}"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className={`${inputClass} mt-1.5`}
              />
            </label>
          </div>
        )}
        {mode === "login" ? (
          <label className="block text-sm">
            密码
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
          </label>
        ) : (
          <AccountRuleInput
            key={mode}
            kind="password"
            label={mode === "reset" ? "新密码" : "密码"}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
        )}
        {mode === "reset" && (
          <label className="block text-sm">
            确认密码
            <input
              required
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
          </label>
        )}
        {error && mode !== "register" && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-primary">
            {message}
          </p>
        )}
        <button
          disabled={busy || sending}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm text-white disabled:opacity-40"
        >
          {busy ? "正在处理..." : titles[mode]}
        </button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
        {mode !== "login" ? (
          <button
            disabled={busy || sending}
            onClick={() => switchMode("login")}
            className="text-primary"
          >
            返回登录
          </button>
        ) : (
          <>
            <button
              disabled={busy || sending}
              onClick={() => switchMode("register")}
              className="text-primary"
            >
              没有账户？注册
            </button>
            <button
              disabled={busy || sending}
              onClick={() => switchMode("reset")}
              className="text-muted-foreground hover:text-primary"
            >
              忘记密码？
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
