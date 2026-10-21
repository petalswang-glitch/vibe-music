"use client";

import { useEffect, useRef, useState } from "react";
import {
  drawAvatar,
  initialCrop,
  cropTransform,
  type CropView,
} from "@/lib/avatar-crop";
import { authError } from "@/providers/auth-provider";

export function AvatarCropper({
  file,
  upload,
  close,
  chooseFile,
  title = "裁剪头像",
  square = false,
  externalError = null,
  banner = false,
}: {
  file: File;
  upload: (blob: Blob) => Promise<void>;
  close: () => void;
  chooseFile?: () => void;
  title?: string;
  square?: boolean;
  externalError?: string | null;
  banner?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; start: CropView } | null>(null);
  const [view, setView] = useState(initialCrop);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBytes, setPreviewBytes] = useState<number | null>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const url = URL.createObjectURL(file);
    const picture = new Image();
    let active = true;
    picture.onload = () => {
      if (active) {
        if (picture.naturalWidth * picture.naturalHeight > 16_000_000) {
          setError("头像图片像素过大");
          return;
        }
        image.current = picture;
        setLoaded(true);
      }
    };
    picture.onerror = () => {
      if (active) setError("无法读取图片，请选择有效的图片文件");
    };
    picture.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
      element?.close();
    };
  }, [file]);
  useEffect(() => {
    let active = true;
    if (loaded && canvas.current && image.current) {
      drawAvatar(canvas.current, image.current, view);
      if (banner)
        canvas.current.toBlob((blob) => {
          if (active && blob) setPreviewBytes(blob.size);
        }, "image/png");
    }
    return () => {
      active = false;
    };
  }, [view, loaded, banner]);
  async function confirm() {
    if (!image.current) return;
    setBusy(true);
    setError(null);
    try {
      const output = document.createElement("canvas");
      output.width = banner ? 1080 : 512;
      output.height = banner ? 420 : 512;
      drawAvatar(output, image.current, view);
      const blob = await new Promise<Blob>((resolve, reject) =>
        output.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("图片裁剪失败")),
          "image/png",
        ),
      );
      await upload(blob);
      close();
    } catch (cause) {
      setError(authError(cause, "头像上传失败"));
      setBusy(false);
    }
  }
  function adjustZoom(delta: number) {
    setView((current) => ({
      ...current,
      zoom: Math.max(1, Math.min(4, current.zoom + delta)),
    }));
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="crop-title"
      onCancel={(event) => event.preventDefault()}
      className="w-[min(38rem,calc(100%-2rem))] rounded-2xl border bg-card p-5 text-card-foreground shadow-player backdrop:bg-black/40"
    >
      <h2 id="crop-title" className="mb-4 text-lg">
        {title}
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        拖动图片调整位置，支持缩放和旋转
      </p>
      <canvas
        ref={canvas}
        width={banner ? 1080 : 320}
        height={banner ? 420 : 320}
        aria-label={square ? "封面裁剪预览" : "头像裁剪预览"}
        role="img"
        tabIndex={0}
        onKeyDown={(event) => {
          if (busy || !loaded) return;
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-10, 0],
            ArrowRight: [10, 0],
            ArrowUp: [0, -10],
            ArrowDown: [0, 10],
          };
          const delta = directions[event.key];
          if (!delta || !image.current) return;
          event.preventDefault();
          const transform = cropTransform(
            image.current.naturalWidth,
            image.current.naturalHeight,
            view,
            320,
            banner ? (320 * 420) / 1080 : 320,
          );
          setView({
            ...view,
            x: transform.x + delta[0],
            y: transform.y + delta[1],
          });
        }}
        className={`mx-auto w-full ${banner ? "max-w-full" : "aspect-square max-w-80"} touch-none cursor-move ${square ? "rounded-lg" : "rounded-full"} bg-muted`}
        onPointerDown={(event) => {
          if (!loaded || busy || !image.current) return;
          const transform = cropTransform(
            image.current.naturalWidth,
            image.current.naturalHeight,
            view,
            320,
            banner ? (320 * 420) / 1080 : 320,
          );
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            start: { ...view, x: transform.x, y: transform.y },
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || busy) return;
          const ratio = 320 / event.currentTarget.getBoundingClientRect().width;
          setView({
            ...current.start,
            x: current.start.x + (event.clientX - current.x) * ratio,
            y: current.start.y + (event.clientY - current.y) * ratio,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />
      {banner && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          图像大小：1080 × 420 像素
          {previewBytes !== null
            ? ` · 文件大小：${(previewBytes / 1024).toFixed(1)} KB (${previewBytes} 字节)`
            : ""}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {chooseFile && (
          <button
            type="button"
            disabled={busy}
            onClick={chooseFile}
            className="rounded-lg border px-3 py-2 disabled:opacity-40"
          >
            选择图片
          </button>
        )}
        {[
          ["重置", () => setView(initialCrop)],
          ["放大", () => adjustZoom(0.2)],
          ["缩小", () => adjustZoom(-0.2)],
          [
            "左旋转",
            () =>
              setView((current) => ({
                ...current,
                rotation: current.rotation - (banner ? 45 : 90),
                x: 0,
                y: 0,
              })),
          ],
          [
            "右旋转",
            () =>
              setView((current) => ({
                ...current,
                rotation: current.rotation + (banner ? 45 : 90),
                x: 0,
                y: 0,
              })),
          ],
        ].map(([label, action]) => (
          <button
            key={label as string}
            disabled={busy || !loaded}
            onClick={action as () => void}
            className="rounded-lg border px-3 py-2 disabled:opacity-40"
          >
            {label as string}
          </button>
        ))}
        {banner &&
          (
            [
              ["水平翻转", "flipX"],
              ["垂直翻转", "flipY"],
            ] as const
          ).map(([label, key]) => (
            <button
              key={key}
              type="button"
              disabled={busy || !loaded}
              onClick={() =>
                setView((current) => ({ ...current, [key]: !current[key] }))
              }
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        {banner && (
          <button
            type="button"
            disabled={busy || !loaded}
            aria-pressed={!!view.circle}
            onClick={() =>
              setView((current) => ({ ...current, circle: !current.circle }))
            }
            className="rounded-lg border px-3 py-2 disabled:opacity-40"
          >
            圆形裁剪
          </button>
        )}
      </div>
      <label className="mt-4 flex items-center gap-3 text-sm">
        缩放
        <input
          aria-label={square ? "封面缩放" : "头像缩放"}
          type="range"
          min="1"
          max="4"
          step="0.05"
          value={view.zoom}
          disabled={busy || !loaded}
          onChange={(event) =>
            setView((current) => ({
              ...current,
              zoom: Number(event.target.value),
            }))
          }
          className="min-w-0 flex-1 accent-primary"
        />
      </label>
      {(error || externalError) && (
        <p role="alert" className="mt-3 text-sm text-primary">
          {error ?? externalError}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-3">
        <button
          disabled={busy}
          onClick={close}
          className="rounded-lg border px-4 py-2"
        >
          取消
        </button>
        <button
          disabled={busy || !loaded || !!externalError}
          onClick={() => void confirm()}
          className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-40"
        >
          {busy ? "上传中..." : "确认"}
        </button>
      </div>
    </dialog>
  );
}
