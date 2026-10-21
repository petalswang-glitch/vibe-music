"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminDialog } from "@/components/admin-dialog";
import {
  adminClient,
  adminGet,
  adminPost,
  adminRevision,
} from "@/lib/admin-api";
import type { ManagedPlaylist } from "@/lib/admin-playlists";
import type { ManagedSong } from "@/lib/admin-songs";
import { authError } from "@/providers/auth-provider";
import { useAdmin } from "@/providers/admin-provider";
import type { PlaylistDetail, Page } from "@/types/catalogue";

export function AdminPlaylistSongs({
  playlist,
  onClose,
}: {
  playlist: ManagedPlaylist;
  onClose: () => void;
}) {
  const { admin } = useAdmin();
  const client = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState({
    pageNum: 1,
    pageSize: 10,
    songName: "",
    artistId: null,
    album: null,
  });
  const [removing, setRemoving] = useState<{
    songId: number;
    songName: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const key = [
    "admin",
    admin?.adminId,
    "playlist-bindings",
    playlist.playlistId,
  ];
  const bound = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const data = await adminGet<PlaylistDetail | null>(
        `/playlist/getPlaylistDetail/${playlist.playlistId}`,
        signal,
      );
      if (!data) throw new Error("歌单不存在或已删除");
      return data;
    },
  });
  const candidates = useQuery({
    queryKey: ["admin", admin?.adminId, "songs", query],
    queryFn: ({ signal }) =>
      adminPost<Page<ManagedSong>>(
        "/admin/getAllSongsByArtist",
        { ...query, songName: query.songName || null },
        signal,
      ),
  });
  const mutation = useMutation({
    mutationFn: async (value: { songId: number; remove: boolean }) => {
      const revision = adminRevision();
      const params = { playlistId: playlist.playlistId, songId: value.songId };
      const { data } = value.remove
        ? await adminClient.delete("/playlist-binding/removeSong", { params })
        : await adminClient.post("/playlist-binding/addSong", null, { params });
      if (data.code !== 0) throw new Error(data.message);
      return { revision, remove: value.remove };
    },
    onSuccess: async (value) => {
      if (value.revision !== adminRevision()) return;
      setMessage(value.remove ? "已移出歌曲" : "已加入歌曲");
      setRemoving(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({
          predicate: (q) =>
            q.queryKey[0] === "playlist" &&
            q.queryKey[1] === "detail" &&
            q.queryKey[2] === playlist.playlistId,
        }),
      ]);
    },
  });
  const songs = bound.data?.songs ?? [];
  const ids = new Set(songs.map((song) => song.songId));
  const busy =
    mutation.isPending || bound.isFetching || !bound.data || bound.isError;
  const pages = Math.max(
    1,
    Math.ceil((candidates.data?.total ?? 0) / query.pageSize),
  );
  function search(event: FormEvent) {
    event.preventDefault();
    setQuery({ ...query, pageNum: 1, songName: keyword });
    if (query.pageNum === 1 && query.songName === keyword)
      void candidates.refetch();
  }
  const cell = "border-b px-3 py-2 text-left text-sm";
  return (
    <AdminDialog
      title={`绑定歌曲 - ${playlist.title}`}
      wide
      extraWide
      busy={mutation.isPending}
      onClose={onClose}
    >
      <p className="mb-4 rounded bg-muted p-3 text-sm">
        歌单：{playlist.title}（编号 {playlist.playlistId}）
      </p>
      {message && (
        <p role="status" className="mb-3 text-sm text-primary">
          {message}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {authError(mutation.error, "操作失败，请重试")}
        </p>
      )}
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <h3 className="mb-3 text-sm font-medium">
            歌单内歌曲（{songs.length}）
          </h3>
          {bound.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {authError(bound.error, "无法加载歌单歌曲")}
              <button
                type="button"
                className="ml-3 text-primary"
                onClick={() => void bound.refetch()}
              >
                重试歌单歌曲
              </button>
            </p>
          ) : bound.isPending ? (
            <p role="status" className="text-sm">
              正在加载歌单歌曲...
            </p>
          ) : (
            <div className="max-h-96 overflow-auto rounded border">
              <table aria-label="歌单内歌曲" className="w-full min-w-[320px]">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {["歌名", "歌手", "操作"].map((label) => (
                      <th key={label} className={cell}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {songs.map((song) => (
                    <tr key={song.songId}>
                      <td className={cell}>{song.songName}</td>
                      <td className={cell}>{song.artistName}</td>
                      <td className={cell}>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`移出歌曲 ${song.songId}`}
                          onClick={() => {
                            mutation.reset();
                            setRemoving(song);
                          }}
                          className="whitespace-nowrap text-destructive disabled:opacity-40"
                        >
                          移出
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!songs.length && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  歌单内暂无歌曲
                </p>
              )}
            </div>
          )}
        </section>
        <section className="min-w-0">
          <h3 className="mb-3 text-sm font-medium">添加歌曲</h3>
          <form onSubmit={search} className="mb-3 flex gap-2">
            <input
              aria-label="候选歌名"
              placeholder="请输入歌名"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="min-w-0 flex-1 rounded border bg-background p-2 text-sm"
            />
            <button
              type="submit"
              disabled={candidates.isFetching}
              className="rounded bg-primary px-3 py-2 text-sm text-white disabled:opacity-40"
            >
              搜索候选歌曲
            </button>
          </form>
          {candidates.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {authError(candidates.error, "无法加载候选歌曲")}
              <button
                type="button"
                className="ml-3 text-primary"
                onClick={() => void candidates.refetch()}
              >
                重试候选歌曲
              </button>
            </p>
          ) : candidates.isPending ? (
            <p role="status" className="text-sm">
              正在加载候选歌曲...
            </p>
          ) : (
            <div className="max-h-80 overflow-auto rounded border">
              <table aria-label="候选歌曲" className="w-full min-w-[320px]">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {["歌名", "歌手", "操作"].map((label) => (
                      <th key={label} className={cell}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(candidates.data?.items ?? []).map((song) => (
                    <tr key={song.songId}>
                      <td className={cell}>{song.songName}</td>
                      <td className={cell}>{song.artistName}</td>
                      <td className={cell}>
                        <button
                          type="button"
                          disabled={busy || ids.has(song.songId)}
                          aria-label={`加入歌曲 ${song.songId}`}
                          onClick={() => {
                            mutation.reset();
                            mutation.mutate({
                              songId: song.songId,
                              remove: false,
                            });
                          }}
                          className="whitespace-nowrap text-primary disabled:opacity-40"
                        >
                          {ids.has(song.songId) ? "已加入" : "加入"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!candidates.data?.items?.length && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  没有匹配歌曲
                </p>
              )}
            </div>
          )}
          <footer className="mt-3 flex flex-wrap items-center justify-end gap-3 text-sm">
            <span className="mr-auto">共 {candidates.data?.total ?? 0} 条</span>
            <button
              type="button"
              disabled={candidates.isFetching || query.pageNum <= 1}
              onClick={() => setQuery({ ...query, pageNum: query.pageNum - 1 })}
              className="rounded border px-2 py-1 disabled:opacity-40"
            >
              候选上一页
            </button>
            <span>
              {query.pageNum} / {pages}
            </span>
            <button
              type="button"
              disabled={candidates.isFetching || query.pageNum >= pages}
              onClick={() => setQuery({ ...query, pageNum: query.pageNum + 1 })}
              className="rounded border px-2 py-1 disabled:opacity-40"
            >
              候选下一页
            </button>
          </footer>
        </section>
      </div>
      {removing && (
        <AdminDialog
          title="移出歌曲确认"
          busy={mutation.isPending}
          error={
            mutation.isError
              ? authError(mutation.error, "移出失败，请重试")
              : null
          }
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            mutation.mutate({ songId: removing.songId, remove: true })
          }
        >
          <p className="text-sm">
            是否确认将「{removing.songName}」移出歌单？歌曲仍会保留在曲库中。
          </p>
        </AdminDialog>
      )}
    </AdminDialog>
  );
}
