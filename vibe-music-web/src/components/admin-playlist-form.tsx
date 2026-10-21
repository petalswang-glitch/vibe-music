"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AdminDialog } from "@/components/admin-dialog";
import { adminClient, adminPost, adminRevision } from "@/lib/admin-api";
import { songStyles } from "@/lib/admin-songs";
import {
  playlistPayload,
  type ManagedPlaylist,
  type PlaylistValues,
} from "@/lib/admin-playlists";
import { authError } from "@/providers/auth-provider";

export function AdminPlaylistForm({
  playlist,
  onClose,
  onSaved,
}: {
  playlist: ManagedPlaylist | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<PlaylistValues>(() => ({
    title: playlist?.title ?? "",
    style: playlist?.style ?? "",
    introduction: playlist?.introduction ?? "",
  }));
  const mutation = useMutation({
    mutationFn: async () => {
      const revision = adminRevision();
      const body = playlistPayload(values, playlist?.playlistId);
      if (playlist) {
        const { data } = await adminClient.put("/admin/updatePlaylist", body);
        if (data.code !== 0) throw new Error(data.message);
      } else await adminPost("/admin/addPlaylist", body);
      return revision;
    },
    onSuccess: async (revision) => {
      if (revision === adminRevision()) await onSaved();
    },
  });
  function change(key: keyof PlaylistValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    mutation.reset();
  }
  const field =
    "mt-2 w-full rounded-md border bg-background px-3 py-2 outline-none focus:border-primary disabled:opacity-50";
  const styles = [
    ...new Set([...songStyles, ...(playlist?.style ? [playlist.style] : [])]),
  ];
  return (
    <AdminDialog
      title={playlist ? "修改歌单" : "新增歌单"}
      wide
      busy={mutation.isPending}
      error={
        mutation.isError ? authError(mutation.error, "保存失败，请重试") : null
      }
      onClose={onClose}
      onConfirm={() => {
        if (form.current?.reportValidity()) mutation.mutate();
      }}
    >
      <form
        ref={form}
        className="grid gap-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending) mutation.mutate();
        }}
      >
        {playlist && (
          <label className="text-sm">
            歌单编号
            <input value={playlist.playlistId} disabled className={field} />
          </label>
        )}
        <label className="text-sm">
          歌单
          <input
            required
            maxLength={255}
            value={values.title}
            disabled={mutation.isPending}
            onChange={(e) => change("title", e.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm">
          风格
          <select
            value={values.style}
            disabled={mutation.isPending}
            onChange={(e) => change("style", e.target.value)}
            className={field}
          >
            <option value="">请选择风格</option>
            {styles.map((style) => (
              <option key={style}>{style}</option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          简介
          <textarea
            rows={5}
            value={values.introduction}
            disabled={mutation.isPending}
            onChange={(e) => change("introduction", e.target.value)}
            className={`${field} resize-y`}
          />
        </label>
        <button type="submit" className="sr-only" tabIndex={-1}>
          保存歌单
        </button>
      </form>
    </AdminDialog>
  );
}
