"use client";

import { useEffect, useRef, useState } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { AvatarCropper } from "@/components/avatar-cropper";
import { adminClient, adminRevision } from "@/lib/admin-api";
import { mediaUrl } from "@/lib/media-url";

export function AdminCoverUpload({
  src,
  path,
  onClose,
  onSaved,
  banner = false,
}: {
  src: string | null;
  path: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  banner?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const [file, setFile] = useState<{ value: File; version: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const revision = adminRevision();
    const initialVersion = sequence.current;
    async function load() {
      try {
        let response = await fetch(
          mediaUrl(src) ?? "/images/default-cover.png",
          { signal: controller.signal, credentials: "omit" },
        );
        if (!response.ok)
          response = await fetch("/images/default-cover.png", {
            signal: controller.signal,
          });
        if (!response.ok) throw new Error("无法读取当前封面");
        const blob = await response.blob();
        if (
          !controller.signal.aborted &&
          revision === adminRevision() &&
          sequence.current === initialVersion
        )
          setFile({
            value: new File([blob], "current-cover.png", { type: blob.type }),
            version: ++sequence.current,
          });
      } catch {
        if (
          !controller.signal.aborted &&
          revision === adminRevision() &&
          sequence.current === initialVersion
        )
          setError("无法读取当前封面，请选择图片");
      }
    }
    void load();
    return () => controller.abort();
  }, [src]);
  return (
    <>
      {!file && (
        <AdminDialog title="裁剪封面" onClose={onClose}>
          <p className="text-sm">{error ?? "正在读取封面..."}</p>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="mt-4 rounded border px-3 py-2 text-sm"
          >
            选择图片
          </button>
        </AdminDialog>
      )}
      <input
        type="file"
        ref={input}
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label="选择封面图片"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (!chosen) return;
          if (chosen.size > 100 * 1024 * 1024) {
            setError("图片不能超过100MB");
            return;
          }
          setError(null);
          setFile({ value: chosen, version: ++sequence.current });
        }}
      />
      {file && (
        <AvatarCropper
          key={file.version}
          file={file.value}
          title="裁剪封面"
          square
          banner={banner}
          externalError={error}
          chooseFile={() => input.current?.click()}
          close={onClose}
          upload={async (blob) => {
            const revision = adminRevision();
            const body = new FormData();
            body.append(
              banner ? "banner" : "cover",
              blob,
              banner ? "banner.png" : "cover.png",
            );
            const { data } =
              banner && path === "/admin/addBanner"
                ? await adminClient.post(path, body)
                : await adminClient.patch(path, body);
            if (data.code !== 0) throw new Error(data.message);
            if (revision === adminRevision()) {
              await onSaved();
            }
          }}
        />
      )}
    </>
  );
}
