"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AdminDialog } from "@/components/admin-dialog";
import { adminClient, adminPost, adminRevision } from "@/lib/admin-api";
import {
  songStyles,
  songPayload,
  type ManagedSong,
  type SongValues,
  type ArtistOption,
} from "@/lib/admin-songs";
import { authError } from "@/providers/auth-provider";

export function AdminSongForm({
  song,
  artist,
  onClose,
  onSaved,
}: {
  song: ManagedSong | null;
  artist: ArtistOption | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<SongValues>(() => ({
    songName: song?.songName ?? "",
    album: song?.album ?? "",
    releaseTime: song?.releaseTime ?? "",
    styles: song?.style?.split(",").filter(Boolean) ?? [],
  }));
  const mutation = useMutation({
    mutationFn: async () => {
      const revision = adminRevision();
      const body = songPayload(values, artist?.artistId ?? null, song?.songId);
      if (song) {
        const { data } = await adminClient.put("/admin/updateSong", body);
        if (data.code !== 0) throw new Error(data.message);
      } else await adminPost("/admin/addSong", body);
      return revision;
    },
    onSuccess: async (revision) => {
      if (revision === adminRevision()) await onSaved();
    },
  });
  const field =
    "mt-2 w-full rounded-md border bg-background px-3 py-2 outline-none focus:border-primary disabled:opacity-50";
  function change(key: "songName" | "album" | "releaseTime", value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    mutation.reset();
  }
  return (
    <AdminDialog
      title={song ? "修改歌曲" : "新增歌曲"}
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
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending) mutation.mutate();
        }}
        className="grid gap-5 sm:grid-cols-2"
      >
        <label className="text-sm">
          歌手
          <input
            value={song?.artistName ?? artist?.artistName ?? ""}
            disabled
            className={field}
          />
        </label>
        {song ? (
          <label className="text-sm">
            歌曲编号
            <input value={song.songId} disabled className={field} />
          </label>
        ) : (
          <label className="text-sm">
            歌手编号
            <input value={artist?.artistId ?? ""} disabled className={field} />
          </label>
        )}
        <label className="text-sm">
          歌名
          <input
            required
            maxLength={255}
            value={values.songName}
            disabled={mutation.isPending}
            onChange={(e) => change("songName", e.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm">
          专辑
          <input
            required
            maxLength={255}
            value={values.album}
            disabled={mutation.isPending}
            onChange={(e) => change("album", e.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm">
          发行日期
          <input
            type="date"
            required
            value={values.releaseTime}
            disabled={mutation.isPending}
            onChange={(e) => change("releaseTime", e.target.value)}
            className={field}
          />
        </label>
        <fieldset disabled={mutation.isPending} className="sm:col-span-2">
          <legend className="text-sm">曲风（可多选）</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ...new Set([
                ...songStyles,
                ...(song?.style?.split(",").filter(Boolean) ?? []),
              ]),
            ].map((style) => (
              <label
                key={style}
                className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={values.styles.includes(style)}
                  onChange={(event) => {
                    setValues((current) => ({
                      ...current,
                      styles: event.target.checked
                        ? [...current.styles, style]
                        : current.styles.filter((item) => item !== style),
                    }));
                    mutation.reset();
                  }}
                />
                {style}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="sr-only" tabIndex={-1}>
          保存歌曲
        </button>
      </form>
    </AdminDialog>
  );
}
