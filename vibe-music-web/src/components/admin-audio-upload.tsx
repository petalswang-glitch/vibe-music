"use client";

import { useEffect, useRef, useState } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { adminClient, adminRevision } from "@/lib/admin-api";
import { audioDuration } from "@/lib/admin-songs";
import { authError } from "@/providers/auth-provider";

export function AdminAudioUpload({
  songId,
  onClose,
  onSaved,
}: {
  songId: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<{
    file: File;
    url: string;
    duration: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = selection?.url;
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  function choose(file: File | undefined) {
    if (!file || busy) return;
    if (!file.name.toLowerCase().endsWith(".mp3")) {
      setSelection(null);
      setError("只能上传.mp3格式的音频文件");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setSelection(null);
      setError("音频文件不能超过100MB");
      return;
    }
    setError(null);
    setSelection({ file, url: URL.createObjectURL(file), duration: null });
  }
  async function upload() {
    if (!selection?.duration) {
      setError(
        selection ? "音频时长解析中，请稍候再提交" : "请先选择一个音频文件",
      );
      return;
    }
    setBusy(true);
    setError(null);
    const revision = adminRevision();
    try {
      const body = new FormData();
      body.append("audio", selection.file);
      body.append("duration", selection.duration);
      const { data } = await adminClient.patch(
        `/admin/updateSongAudio/${songId}`,
        body,
        { timeout: 120000 },
      );
      if (data.code !== 0) throw new Error(data.message);
      if (revision === adminRevision()) {
        await onSaved();
        onClose();
      }
    } catch (cause) {
      setError(authError(cause, "上传失败，请重试"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminDialog
      title="上传音频"
      wide
      busy={busy}
      error={error}
      onClose={onClose}
      onConfirm={() => void upload()}
    >
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          choose(event.dataTransfer.files[0]);
        }}
        className="rounded-lg border-2 border-dashed p-8 text-center"
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="text-sm text-primary"
        >
          点击或拖拽上传（仅支持.mp3格式）
        </button>
        <input
          type="file"
          accept=".mp3,audio/mpeg"
          ref={input}
          className="sr-only"
          tabIndex={-1}
          aria-label="选择MP3音频"
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {selection && (
          <p className="mt-3 break-all text-sm">{selection.file.name}</p>
        )}
      </div>
      {selection && (
        <>
          <audio
            key={selection.url}
            aria-label="待上传音频预览"
            controls
            preload="metadata"
            src={selection.url}
            className="mt-4 w-full"
            onLoadedMetadata={(event) => {
              const currentUrl = selection.url;
              const duration = audioDuration(event.currentTarget.duration);
              setSelection((current) =>
                current?.url === currentUrl
                  ? { ...current, duration }
                  : current,
              );
              if (!duration) setError("音频时长解析失败，请重新选择");
            }}
            onError={() => {
              setSelection((current) =>
                current?.url === selection.url
                  ? { ...current, duration: null }
                  : current,
              );
              setError("无法读取音频，请选择有效的MP3文件");
            }}
          />
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {selection.duration
              ? `音频时长：${selection.duration} 秒`
              : "正在解析音频时长..."}
          </p>
        </>
      )}
    </AdminDialog>
  );
}
