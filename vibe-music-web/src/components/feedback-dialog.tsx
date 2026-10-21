"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, MessageSquarePlus, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { authError } from "@/providers/auth-provider";

export function FeedbackEntry() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!submitted) return;
    const timer = window.setTimeout(() => setSubmitted(false), 4000);
    return () => window.clearTimeout(timer);
  }, [submitted]);
  return (
    <>
      <button
        type="button"
        aria-label="意见反馈"
        title="意见反馈"
        onClick={() => {
          setSubmitted(false);
          setOpen(true);
        }}
        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary"
      >
        <MessageSquarePlus size={18} />
      </button>
      {open && (
        <FeedbackDialog
          onClose={() => setOpen(false)}
          onSubmitted={() => {
            setSubmitted(true);
            setOpen(false);
          }}
        />
      )}
      {submitted && (
        <p
          role="status"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border bg-card p-3 text-sm text-primary shadow-paper"
        >
          反馈提交成功，感谢您的意见！
        </p>
      )}
    </>
  );
}

function FeedbackDialog({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    alive.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => {
      alive.current = false;
      element?.close();
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (content.length < 10 || content.length > 200) {
      setError("反馈内容需要 10～200 个字符");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post("/feedback/addFeedback", null, {
        params: { content },
      });
      if (data.code !== 0) throw new Error(data.message);
      if (alive.current) onSubmitted();
    } catch (cause) {
      if (alive.current) setError(authError(cause, "提交失败，请稍后重试"));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="feedback-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-card p-6 text-foreground shadow-paper backdrop:bg-black/40"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id="feedback-title" className="text-xl font-semibold">
          意见反馈
        </h2>
        <button
          type="button"
          aria-label="关闭意见反馈"
          disabled={busy}
          onClick={onClose}
          className="rounded-lg p-2 hover:bg-muted disabled:opacity-40"
        >
          <X size={19} />
        </button>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="feedback-content" className="sr-only">
          反馈内容
        </label>
        <textarea
          id="feedback-content"
          rows={7}
          maxLength={200}
          value={content}
          disabled={busy}
          placeholder="请输入您的宝贵意见或建议（10-200字）"
          onChange={(event) => {
            setContent(event.target.value);
            setError(null);
          }}
          className="w-full resize-none rounded-xl border bg-background px-4 py-3 text-sm leading-6 outline-none focus:border-primary disabled:opacity-50"
        />
        <p className="mt-2 text-right text-xs tabular-nums text-muted-foreground">
          {content.length} / 200
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {busy && <LoaderCircle size={15} className="animate-spin" />}
            提交反馈
          </button>
        </div>
      </form>
    </dialog>
  );
}
