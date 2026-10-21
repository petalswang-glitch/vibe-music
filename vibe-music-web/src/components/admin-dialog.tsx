"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Maximize, Minimize, X } from "lucide-react";

export function AdminDialog({
  title,
  children,
  busy = false,
  error,
  onClose,
  onConfirm,
  wide = false,
  extraWide = false,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm?: () => void;
  wide?: boolean;
  extraWide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className={`${full ? "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none rounded-none" : `max-h-[90dvh] w-[calc(100%-2rem)] ${extraWide ? "max-w-5xl" : wide ? "max-w-2xl" : "max-w-md"} rounded-xl`} overflow-y-auto border bg-card p-6 text-foreground shadow-lg backdrop:bg-black/40`}
    >
      <header className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          {wide && (
            <button
              type="button"
              aria-label={full ? "还原表单" : "表单全屏"}
              onClick={() => setFull(!full)}
              className="rounded p-1 hover:bg-muted"
            >
              {full ? <Minimize size={17} /> : <Maximize size={17} />}
            </button>
          )}
          <button
            type="button"
            aria-label="关闭管理弹窗"
            disabled={busy}
            onClick={onClose}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>
      </header>
      {children}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <footer className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-md border px-4 py-2 text-sm disabled:opacity-40"
        >
          {onConfirm ? "取消" : "关闭"}
        </button>
        {onConfirm && (
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {busy && <LoaderCircle size={15} className="animate-spin" />}确定
          </button>
        )}
      </footer>
    </dialog>
  );
}
