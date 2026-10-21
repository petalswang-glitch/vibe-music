"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AdminDialog } from "@/components/admin-dialog";
import { adminClient, adminPost, adminRevision } from "@/lib/admin-api";
import {
  artistPayload,
  type ArtistValues,
  type ManagedArtist,
} from "@/lib/admin-artists";
import { authError } from "@/providers/auth-provider";

export function AdminArtistForm({
  artist,
  onClose,
  onSaved,
}: {
  artist: ManagedArtist | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<ArtistValues>(() => ({
    artistName: artist?.artistName ?? "",
    gender: artist?.gender == null ? "" : String(artist.gender),
    birth: artist?.birth ?? "",
    area: artist?.area ?? "",
    introduction: artist?.introduction ?? "",
  }));
  const mutation = useMutation({
    mutationFn: async () => {
      const revision = adminRevision();
      const body = artistPayload(values, artist?.artistId);
      if (artist) {
        const { data } = await adminClient.put("/admin/updateArtist", body);
        if (data.code !== 0) throw new Error(data.message);
      } else await adminPost("/admin/addArtist", body);
      return revision;
    },
    onSuccess: async (revision) => {
      if (revision === adminRevision()) await onSaved();
    },
  });
  function change(key: keyof ArtistValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    mutation.reset();
  }
  const field =
    "mt-2 w-full rounded-md border bg-background px-3 py-2 outline-none focus:border-primary disabled:opacity-50";
  return (
    <AdminDialog
      title={artist ? "修改歌手" : "新增歌手"}
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
        {artist && (
          <label className="text-sm">
            歌手编号
            <input disabled value={artist.artistId} className={field} />
          </label>
        )}
        <label className="text-sm">
          歌手
          <input
            required
            maxLength={100}
            value={values.artistName}
            disabled={mutation.isPending}
            onChange={(e) => change("artistName", e.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm">
          类型
          <select
            value={values.gender}
            disabled={mutation.isPending}
            onChange={(e) => change("gender", e.target.value)}
            className={field}
          >
            <option value="">请选择类型</option>
            <option value="0">男歌手</option>
            <option value="1">女歌手</option>
            <option value="2">组合/乐队</option>
            {values.gender && !["0", "1", "2"].includes(values.gender) && (
              <option value={values.gender}>未知</option>
            )}
          </select>
        </label>
        <label className="text-sm">
          生日
          <input
            type="date"
            value={values.birth}
            disabled={mutation.isPending}
            onChange={(e) => change("birth", e.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm">
          国籍
          <input
            maxLength={30}
            value={values.area}
            disabled={mutation.isPending}
            onChange={(e) => change("area", e.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          简介
          <textarea
            maxLength={255}
            rows={5}
            value={values.introduction}
            disabled={mutation.isPending}
            onChange={(e) => change("introduction", e.target.value)}
            className={`${field} resize-y`}
          />
        </label>
        <button type="submit" className="sr-only" tabIndex={-1}>
          保存歌手
        </button>
      </form>
    </AdminDialog>
  );
}
