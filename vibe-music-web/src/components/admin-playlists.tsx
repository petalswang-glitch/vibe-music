"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { AdminDataTable } from "@/components/admin-data-table";
import { AdminDialog } from "@/components/admin-dialog";
import { AdminPlaylistForm } from "@/components/admin-playlist-form";
import { AdminPlaylistSongs } from "@/components/admin-playlist-songs";
import { AdminCoverUpload } from "@/components/admin-cover-upload";
import { adminClient, adminPost, adminRevision } from "@/lib/admin-api";
import type { ManagedPlaylist } from "@/lib/admin-playlists";
import { songStyles } from "@/lib/admin-songs";
import type { AdminColumn } from "@/lib/admin-columns";
import { mediaUrl } from "@/lib/media-url";
import { useAdmin } from "@/providers/admin-provider";
import { authError } from "@/providers/auth-provider";
import type { Page } from "@/types/catalogue";

const columns: AdminColumn[] = [
  { id: "select", label: "勾选列", visible: true, fixed: true },
  ...["歌单编号", "封面", "歌单", "风格", "简介"].map((label, index) => ({
    id: ["id", "cover", "title", "style", "introduction"][index],
    label,
    visible: true,
  })),
  { id: "action", label: "操作", visible: true, fixed: true },
];
const empty = { title: "", style: "" };
function Cover({
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
      alt="歌单封面"
      onError={() => setFailed(url)}
      className={
        large
          ? "mx-auto max-h-[60dvh] max-w-full object-contain"
          : "h-[72px] w-[72px] max-w-none rounded-lg object-cover"
      }
    />
  );
}

export function AdminPlaylists() {
  const { admin, ready } = useAdmin();
  const client = useQueryClient();
  const [draft, setDraft] = useState(empty);
  const [query, setQuery] = useState({ ...empty, pageNum: 1, pageSize: 10 });
  const [selected, setSelected] = useState<number[]>([]);
  const [edit, setEdit] = useState<{ playlist: ManagedPlaylist | null } | null>(
    null,
  );
  const [binding, setBinding] = useState<ManagedPlaylist | null>(null);
  const [cover, setCover] = useState<ManagedPlaylist | null>(null);
  const [preview, setPreview] = useState<ManagedPlaylist | null>(null);
  const [deleting, setDeleting] = useState<number[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const result = useQuery({
    queryKey: ["admin", admin?.adminId, "playlists", query],
    enabled: ready && !!admin,
    queryFn: ({ signal }) =>
      adminPost<Page<ManagedPlaylist>>(
        "/admin/getAllPlaylists",
        { ...query, title: query.title || null, style: query.style || null },
        signal,
      ),
  });
  async function refresh() {
    setSelected([]);
    setQuery((value) => ({ ...value, pageNum: 1 }));
    await Promise.all([
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "dashboard"],
      }),
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "playlists"],
      }),
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "playlists-count"],
      }),
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "playlist-bindings"],
      }),
      client.invalidateQueries({
        predicate: (q) =>
          ["playlist", "favorite"].includes(String(q.queryKey[0])),
      }),
    ]);
  }
  const mutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const revision = adminRevision();
      const { data } =
        ids.length === 1
          ? await adminClient.delete(`/admin/deletePlaylist/${ids[0]}`)
          : await adminClient.delete("/admin/deletePlaylists", { data: ids });
      if (data.code !== 0) throw new Error(data.message);
      return revision;
    },
    onSuccess: async (revision) => {
      if (revision !== adminRevision()) return;
      setMessage("删除成功");
      setDeleting(null);
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
    setQuery({ ...draft, pageNum: 1, pageSize: query.pageSize });
    if (
      query.pageNum === 1 &&
      query.title === draft.title &&
      query.style === draft.style
    )
      void result.refetch();
  }
  function cell(row: ManagedPlaylist, column: string): ReactNode {
    switch (column) {
      case "id":
        return row.playlistId;
      case "cover":
        return (
          <button
            type="button"
            aria-label={`预览歌单封面 ${row.title}`}
            onClick={() => setPreview(row)}
          >
            <Cover src={row.coverUrl} />
          </button>
        );
      case "title":
        return <span className="whitespace-nowrap">{row.title}</span>;
      case "style":
        return (
          row.style && (
            <span className="whitespace-nowrap rounded border px-2 py-1 text-xs text-primary">
              {row.style}
            </span>
          )
        );
      case "introduction":
        return (
          <p className="w-96 break-words" title={row.introduction ?? ""}>
            {(row.introduction?.length ?? 0) > 60
              ? row.introduction!.slice(0, 60) + "..."
              : row.introduction}
          </p>
        );
      default:
        return (
          <div className="flex flex-wrap gap-2 text-primary">
            <button
              type="button"
              disabled={busy}
              aria-label={`修改歌单 ${row.playlistId}`}
              onClick={() => setEdit({ playlist: row })}
            >
              修改
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`删除歌单 ${row.playlistId}`}
              onClick={() => remove([row.playlistId])}
            >
              删除
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`上传歌单封面 ${row.playlistId}`}
              onClick={() => setCover(row)}
            >
              上传封面
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`绑定歌单歌曲 ${row.playlistId}`}
              onClick={() => setBinding(row)}
            >
              绑定歌曲
            </button>
          </div>
        );
    }
  }
  const field =
    "ml-2 max-w-full rounded-md border bg-background px-3 py-2 outline-none focus:border-primary";
  return (
    <section className="space-y-5">
      <form
        onSubmit={search}
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-5 text-sm"
      >
        <label>
          歌单
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className={field}
            placeholder="请输入歌单"
          />
        </label>
        <label>
          风格
          <select
            value={draft.style}
            onChange={(e) => setDraft({ ...draft, style: e.target.value })}
            className={field}
          >
            <option value="">全部</option>
            {songStyles.map((style) => (
              <option key={style}>{style}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-white disabled:opacity-40"
        >
          <Search size={15} />
          搜索
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft(empty);
            setQuery({ ...empty, pageNum: 1, pageSize: 10 });
            setSelected([]);
            setMessage(null);
          }}
          className="rounded border px-4 py-2"
        >
          重置
        </button>
      </form>
      <AdminDataTable
        name="歌单"
        columns={columns}
        rows={result.data?.items ?? []}
        total={result.data?.total ?? 0}
        page={query.pageNum}
        size={query.pageSize}
        busy={busy}
        loading={result.isPending}
        error={
          result.isError ? authError(result.error, "暂时无法加载歌单") : null
        }
        selected={selected}
        onSelected={setSelected}
        onPage={(pageNum) => setQuery({ ...query, pageNum })}
        onSize={(pageSize) => setQuery({ ...query, pageNum: 1, pageSize })}
        onRefresh={() => void result.refetch()}
        onDelete={() => remove([...selected])}
        getId={(row) => row.playlistId}
        render={cell}
        message={message}
        actions={
          <button
            type="button"
            disabled={busy}
            onClick={() => setEdit({ playlist: null })}
            className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            <Plus size={15} />
            新增歌单
          </button>
        }
      />
      {edit && (
        <AdminPlaylistForm
          playlist={edit.playlist}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setMessage(edit.playlist ? "更新成功" : "添加成功");
            setEdit(null);
            await refresh();
          }}
        />
      )}
      {binding && (
        <AdminPlaylistSongs
          key={binding.playlistId}
          playlist={binding}
          onClose={() => setBinding(null)}
        />
      )}
      {cover && (
        <AdminCoverUpload
          src={cover.coverUrl}
          path={`/admin/updatePlaylistCover/${cover.playlistId}`}
          onClose={() => setCover(null)}
          onSaved={async () => {
            setMessage("封面上传成功");
            await refresh();
          }}
        />
      )}
      {preview && (
        <AdminDialog title="歌单封面" onClose={() => setPreview(null)}>
          <Cover src={preview.coverUrl} large />
        </AdminDialog>
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
              ? `是否确认删除歌单编号为 ${deleting[0]} 的这条数据？`
              : `确认要批量删除 ${deleting.length} 个歌单吗？`}
            歌单关联、收藏和评论也会删除，歌曲仍保留在曲库中。
          </p>
        </AdminDialog>
      )}
    </section>
  );
}
