"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthDialog } from "@/components/auth-dialog";
import { FeedbackEntry } from "@/components/feedback-dialog";
import { authError, useAuth } from "@/providers/auth-provider";

export function AccountEntry() {
  const { user, ready, error: sessionError, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function leave() {
    setBusy(true);
    setError(null);
    try {
      await logout();
    } catch (cause) {
      setError(authError(cause, "退出失败，请重试"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="relative flex min-w-0 items-center gap-2 text-sm">
      {user ? (
        <>
          <Link
            href="/user"
            aria-label="个人中心"
            className="max-w-12 truncate hover:text-primary sm:max-w-28"
            title="个人中心"
          >
            {user.username}
          </Link>
          <FeedbackEntry key={user.userId} />
          <button
            disabled={busy}
            onClick={() => void leave()}
            className="shrink-0 text-muted-foreground hover:text-primary disabled:opacity-40"
          >
            {busy ? "退出中..." : "退出登录"}
          </button>
        </>
      ) : (
        <button
          disabled={!ready}
          onClick={() => setOpen(true)}
          className="whitespace-nowrap rounded-lg border px-3 py-2 text-primary disabled:opacity-40"
        >
          {ready ? "登录 / 注册" : "正在验证..."}
        </button>
      )}
      {(error || sessionError) && (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border bg-card p-3 text-sm text-destructive shadow-paper"
        >
          {error ?? sessionError}
        </p>
      )}
      {open && <AuthDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
