"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { AdminDataTable } from "@/components/admin-data-table";
import { AdminSongForm } from "@/components/admin-song-form";
import { AdminCoverUpload } from "@/components/admin-cover-upload";
import { AdminAudioUpload } from "@/components/admin-audio-upload";
import { AdminDialog } from "@/components/admin-dialog";
import {
  adminClient,
  adminGet,
  adminPost,
  adminRevision,
} from "@/lib/admin-api";
import type { ManagedSong, ArtistOption } from "@/lib/admin-songs";
import type { AdminColumn } from "@/lib/admin-columns";
import { mediaUrl } from "@/lib/media-url";
import { useAdmin } from "@/providers/admin-provider";
import { authError } from "@/providers/auth-provider";
import type { Page } from "@/types/catalogue";

const columns: AdminColumn[] = [
  { id: "select", label: "勾选列", visible: true, fixed: true },
  ...["歌曲编号", "封面", "歌名", "歌手", "专辑", "曲风", "发行日期"].map(
    (label, index) => ({
      id: ["id", "cover", "name", "artist", "album", "style", "release"][index],
      label,
      visible: true,
    }),
  ),
  { id: "action", label: "操作", visible: true, fixed: true },
];
const empty = { songName: "", album: "" };
function CoverImage({
  src,
  large = false,
}: {
  src: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = mediaUrl(src) ?? "/images/default-cover.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed === url ? "/images/default-cover.png" : url}
      alt="歌曲封面"
      onError={() => setFailed(url)}
      className={
        large
          ? "mx-auto max-h-[60dvh] max-w-full object-contain"
          : "h-16 w-16 max-w-none rounded object-cover"
      }
    />
  );
}

export function AdminSongs() {
  const { admin, ready } = useAdmin();
  const client = useQueryClient();
  const [artistSearch, setArtistSearch] = useState("");
  const [query, setQuery] = useState({
    ...empty,
    artistId: null as number | null,
    pageNum: 1,
    pageSize: 10,
  });
  const [draft, setDraft] = useState(empty);
  const [selected, setSelected] = useState<number[]>([]);
  const [edit, setEdit] = useState<{ song: ManagedSong | null } | null>(null);
  const [cover, setCover] = useState<ManagedSong | null>(null);
  const [audio, setAudio] = useState<ManagedSong | null>(null);
  const [preview, setPreview] = useState<{
    song: ManagedSong;
    kind: "cover" | "audio";
  } | null>(null);
  const [deleting, setDeleting] = useState<number[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const enabled = ready && !!admin;
  const names = useQuery({
    queryKey: ["admin", admin?.adminId, "artist-names"],
    enabled,
    queryFn: ({ signal }) =>
      adminGet<ArtistOption[] | null>("/admin/getAllArtistNames", signal),
  });
  const result = useQuery({
    queryKey: ["admin", admin?.adminId, "songs", query],
    enabled,
    queryFn: ({ signal }) =>
      adminPost<Page<ManagedSong>>(
        "/admin/getAllSongsByArtist",
        {
          ...query,
          songName: query.songName || null,
          album: query.album || null,
        },
        signal,
      ),
  });
  const chosenArtist =
    names.data?.find((row) => row.artistId === query.artistId) ?? null;
  async function refresh() {
    setSelected([]);
    setQuery((value) => ({ ...value, pageNum: 1 }));
    await Promise.all([
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "dashboard"],
      }),
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "songs"],
      }),
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "songs-count"],
      }),
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "playlist-bindings"],
      }),
      client.invalidateQueries({
        predicate: (q) =>
          ["artist", "song", "songs", "playlist", "favorite"].includes(
            String(q.queryKey[0]),
          ),
      }),
    ]);
  }
  const mutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const revision = adminRevision();
      const { data } =
        ids.length === 1
          ? await adminClient.delete(`/admin/deleteSong/${ids[0]}`)
          : await adminClient.delete("/admin/deleteSongs", { data: ids });
      if (data.code !== 0) throw new Error(data.message);
      return revision;
    },
    onSuccess: async (revision) => {
      if (revision !== adminRevision()) return;
      setDeleting(null);
      setMessage("删除成功");
      await refresh();
    },
  });
  const busy = result.isFetching || mutation.isPending;
  function remove(ids: number[]) {
    mutation.reset();
    setDeleting(ids);
  }
  function search(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setQuery({ ...query, ...draft, pageNum: 1 });
    if (
      query.pageNum === 1 &&
      draft.songName === query.songName &&
      draft.album === query.album
    )
      void result.refetch();
  }
  function cell(row: ManagedSong, column: string): ReactNode {
    switch (column) {
      case "id":
        return row.songId;
      case "cover":
        return (
          <button
            type="button"
            aria-label={`预览歌曲封面 ${row.songName}`}
            onClick={() => setPreview({ song: row, kind: "cover" })}
          >
            <CoverImage src={row.coverUrl} />
          </button>
        );
      case "name":
        return <span className="whitespace-nowrap">{row.songName}</span>;
      case "artist":
        return <span className="whitespace-nowrap">{row.artistName}</span>;
      case "album":
        return <span className="whitespace-nowrap">{row.album}</span>;
      case "style":
        return (
          <div className="flex w-44 flex-wrap gap-1">
            {row.style
              ?.split(",")
              .filter(Boolean)
              .map((style, index) => (
                <span
                  key={`${style}:${index}`}
                  className="rounded border px-2 py-1 text-xs text-primary"
                >
                  {style}
                </span>
              ))}
          </div>
        );
      case "release":
        return <span className="whitespace-nowrap">{row.releaseTime}</span>;
      default:
        return (
          <div className="flex flex-wrap gap-2 text-primary">
            <button
              type="button"
              disabled={busy}
              aria-label={`修改歌曲 ${row.songId}`}
              onClick={() => setEdit({ song: row })}
            >
              修改
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`删除歌曲 ${row.songId}`}
              onClick={() => remove([row.songId])}
            >
              删除
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`上传歌曲封面 ${row.songId}`}
              onClick={() => setCover(row)}
            >
              上传封面
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`上传歌曲音频 ${row.songId}`}
              onClick={() => setAudio(row)}
            >
              上传音频
            </button>
            <button
              type="button"
              aria-label={`试听歌曲 ${row.songId}`}
              onClick={() => setPreview({ song: row, kind: "audio" })}
            >
              试听
            </button>
          </div>
        );
    }
  }
  const field =
    "ml-2 max-w-full rounded-md border bg-background px-3 py-2 outline-none focus:border-primary";
  return (
    <div className="flex min-w-0 flex-col gap-4 xl:flex-row">
      <aside className="shrink-0 rounded-lg border bg-card p-3 xl:w-48">
        <label className="text-sm">
          搜索歌手
          <input
            value={artistSearch}
            onChange={(event) => setArtistSearch(event.target.value)}
            placeholder="请输入歌手"
            className="mt-2 w-full rounded border bg-background p-2 text-sm"
          />
        </label>
        {names.isPending ? (
          <p role="status" className="mt-4 text-sm">
            正在加载歌手...
          </p>
        ) : names.isError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {authError(names.error, "无法加载歌手")}
            <button
              type="button"
              onClick={() => void names.refetch()}
              className="mt-3 block text-primary"
            >
              重新加载歌手
            </button>
          </p>
        ) : (
          <nav
            aria-label="歌曲歌手筛选"
            className="mt-3 max-h-60 space-y-1 overflow-y-auto xl:max-h-[70dvh]"
          >
            {(names.data ?? [])
              .filter((row) =>
                row.artistName
                  .toLowerCase()
                  .includes(artistSearch.toLowerCase()),
              )
              .map((row) => (
                <button
                  type="button"
                  key={row.artistId}
                  disabled={busy}
                  aria-pressed={query.artistId === row.artistId}
                  onClick={() => {
                    setQuery({
                      ...query,
                      pageNum: 1,
                      artistId:
                        query.artistId === row.artistId ? null : row.artistId,
                    });
                    setSelected([]);
                  }}
                  className={`block w-full truncate rounded px-2 py-2 text-left text-sm ${query.artistId === row.artistId ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                  title={row.artistName}
                >
                  {row.artistName}
                </button>
              ))}
          </nav>
        )}
      </aside>
      <section className="min-w-0 flex-1 space-y-5">
        <form
          onSubmit={search}
          className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-5 text-sm"
        >
          <label>
            歌名
            <input
              value={draft.songName}
              onChange={(e) => setDraft({ ...draft, songName: e.target.value })}
              className={field}
              placeholder="请输入歌名"
            />
          </label>
          <label>
            专辑
            <input
              value={draft.album}
              onChange={(e) => setDraft({ ...draft, album: e.target.value })}
              className={field}
              placeholder="请输入专辑"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-white disabled:opacity-40"
          >
            <Search size={15} />
            搜索
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(empty);
              setArtistSearch("");
              setQuery({ ...empty, artistId: null, pageNum: 1, pageSize: 10 });
              setSelected([]);
              setMessage(null);
            }}
            className="rounded border px-4 py-2"
          >
            重置
          </button>
        </form>
        <p className="text-sm text-muted-foreground">
          {chosenArtist
            ? `当前歌手：${chosenArtist.artistName}`
            : "新增歌曲前，请在歌手列表选择歌手；当前展示全部歌曲。"}
        </p>
        <AdminDataTable
          name="歌曲"
          columns={columns}
          rows={result.data?.items ?? []}
          total={result.data?.total ?? 0}
          page={query.pageNum}
          size={query.pageSize}
          busy={busy}
          loading={result.isPending}
          error={
            result.isError ? authError(result.error, "暂时无法加载歌曲") : null
          }
          selected={selected}
          onSelected={setSelected}
          onPage={(pageNum) => setQuery({ ...query, pageNum })}
          onSize={(pageSize) => setQuery({ ...query, pageNum: 1, pageSize })}
          onRefresh={() => void result.refetch()}
          onDelete={() => remove([...selected])}
          getId={(row) => row.songId}
          render={cell}
          message={message}
          actions={
            <button
              type="button"
              disabled={busy || !chosenArtist}
              onClick={() => setEdit({ song: null })}
              className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm text-white disabled:opacity-40"
            >
              <Plus size={15} />
              新增歌曲
            </button>
          }
        />
        {edit && (
          <AdminSongForm
            song={edit.song}
            artist={chosenArtist}
            onClose={() => setEdit(null)}
            onSaved={async () => {
              setMessage(edit.song ? "更新成功" : "添加成功");
              setEdit(null);
              await refresh();
            }}
          />
        )}
        {cover && (
          <AdminCoverUpload
            src={cover.coverUrl}
            path={`/admin/updateSongCover/${cover.songId}`}
            onClose={() => setCover(null)}
            onSaved={async () => {
              setMessage("封面上传成功");
              await refresh();
            }}
          />
        )}
        {audio && (
          <AdminAudioUpload
            songId={audio.songId}
            onClose={() => setAudio(null)}
            onSaved={async () => {
              setMessage("音频上传成功");
              await refresh();
            }}
          />
        )}
        {deleting && (
          <AdminDialog
            title="系统提示"
            busy={mutation.isPending}
            error={
              mutation.isError
                ? authError(mutation.error, "删除失败，请重试")
                : null
            }
            onClose={() => setDeleting(null)}
            onConfirm={() => mutation.mutate(deleting)}
          >
            <p className="text-sm leading-7">
              {deleting.length === 1
                ? `是否确认删除歌曲编号为 ${deleting[0]} 的这条数据？`
                : `确认要批量删除 ${deleting.length} 首歌曲吗？`}
              歌曲的收藏、评论和歌单关联也会删除。
            </p>
          </AdminDialog>
        )}
        {preview && (
          <AdminDialog
            title={preview.kind === "cover" ? "歌曲封面" : "预览音频"}
            wide
            onClose={() => setPreview(null)}
          >
            {preview.kind === "cover" ? (
              <CoverImage src={preview.song.coverUrl} large />
            ) : (
              <>
                <h3 className="mb-4 text-center">{preview.song.songName}</h3>
                {mediaUrl(preview.song.audioUrl) ? (
                  <audio
                    controls
                    preload="metadata"
                    aria-label="歌曲试听"
                    src={mediaUrl(preview.song.audioUrl)!}
                    className="w-full"
                  />
                ) : (
                  <p className="text-center text-sm text-muted-foreground">
                    请先上传音频文件
                  </p>
                )}
              </>
            )}
          </AdminDialog>
        )}
      </section>
    </div>
  );
}
