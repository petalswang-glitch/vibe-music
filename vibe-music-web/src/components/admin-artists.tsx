"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { AdminDataTable } from "@/components/admin-data-table";
import { AdminArtistForm } from "@/components/admin-artist-form";
import { AdminDialog } from "@/components/admin-dialog";
import { AvatarCropper } from "@/components/avatar-cropper";
import { adminClient, adminPost, adminRevision } from "@/lib/admin-api";
import { artistGender, type ManagedArtist } from "@/lib/admin-artists";
import type { AdminColumn } from "@/lib/admin-columns";
import { mediaUrl } from "@/lib/media-url";
import { useAdmin } from "@/providers/admin-provider";
import { authError } from "@/providers/auth-provider";
import type { Page } from "@/types/catalogue";

const columns: AdminColumn[] = [
  { id: "select", label: "勾选列", visible: true, fixed: true },
  ...["歌手编号", "歌手头像", "歌手", "类型", "生日", "国籍", "简介"].map(
    (label, index) => ({
      id: ["id", "avatar", "name", "gender", "birth", "area", "introduction"][
        index
      ],
      label,
      visible: true,
    }),
  ),
  { id: "action", label: "操作", visible: true, fixed: true },
];
const empty = { artistName: "", area: "", gender: "" };

function ArtistImage({
  src,
  large = false,
}: {
  src: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = mediaUrl(src) ?? "/images/default-user.jpg";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed === url ? "/images/default-user.jpg" : url}
      alt="歌手头像"
      onError={() => setFailed(url)}
      className={
        large
          ? "mx-auto max-h-[60dvh] max-w-full object-contain"
          : "h-16 w-16 max-w-none rounded-full object-cover"
      }
    />
  );
}

export function AdminArtists() {
  const { admin, ready } = useAdmin();
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const cropVersion = useRef(0);
  const [draft, setDraft] = useState(empty);
  const [query, setQuery] = useState({ ...empty, pageNum: 1, pageSize: 10 });
  const [selected, setSelected] = useState<number[]>([]);
  const [edit, setEdit] = useState<{ artist: ManagedArtist | null } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<number[] | null>(null);
  const [preview, setPreview] = useState<ManagedArtist | null>(null);
  const [uploadTarget, setUploadTarget] = useState<ManagedArtist | null>(null);
  const [preparingAvatar, setPreparingAvatar] = useState(false);
  const [crop, setCrop] = useState<{
    artist: ManagedArtist;
    file: File;
    version: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const result = useQuery({
    queryKey: ["admin", admin?.adminId, "artists", query],
    enabled: ready && !!admin,
    queryFn: ({ signal }) =>
      adminPost<Page<ManagedArtist>>(
        "/admin/getAllArtists",
        {
          ...query,
          artistName: query.artistName || null,
          area: query.area || null,
          gender: query.gender === "" ? null : Number(query.gender),
        },
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
        queryKey: ["admin", admin?.adminId, "artists"],
      }),
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "artist-names"],
      }),
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "artists-count"],
      }),
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "songs"],
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
          ? await adminClient.delete(`/admin/deleteArtist/${ids[0]}`)
          : await adminClient.delete("/admin/deleteArtists", { data: ids });
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
  const busy = result.isFetching || mutation.isPending || preparingAvatar;
  async function openAvatar(row: ManagedArtist) {
    const revision = adminRevision();
    setUploadTarget(row);
    setPreparingAvatar(true);
    setMessage(null);
    try {
      let response = await fetch(
        mediaUrl(row.avatar) ?? "/images/default-user.jpg",
        { credentials: "omit", signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) response = await fetch("/images/default-user.jpg");
      if (!response.ok) throw new Error("无法读取当前头像，请选择图片");
      const blob = await response.blob();
      if (revision !== adminRevision()) return;
      setCrop({
        artist: row,
        version: ++cropVersion.current,
        file: new File([blob], "current-avatar.png", { type: blob.type }),
      });
    } catch {
      if (revision === adminRevision()) {
        setMessage("无法读取当前头像，请选择图片");
        fileInput.current?.click();
      }
    } finally {
      setPreparingAvatar(false);
    }
  }
  function search(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setQuery({ ...draft, pageNum: 1, pageSize: query.pageSize });
    if (
      query.pageNum === 1 &&
      draft.artistName === query.artistName &&
      draft.area === query.area &&
      draft.gender === query.gender
    )
      void result.refetch();
  }
  function remove(ids: number[]) {
    mutation.reset();
    setDeleting(ids);
  }
  function cell(row: ManagedArtist, column: string): ReactNode {
    switch (column) {
      case "id":
        return row.artistId;
      case "avatar":
        return (
          <button
            type="button"
            aria-label={`预览歌手头像 ${row.artistName}`}
            onClick={() => setPreview(row)}
          >
            <ArtistImage src={row.avatar} />
          </button>
        );
      case "name":
        return <span className="whitespace-nowrap">{row.artistName}</span>;
      case "gender":
        return (
          <span className="whitespace-nowrap rounded border px-2 py-1 text-xs text-primary">
            {artistGender(row.gender)}
          </span>
        );
      case "birth":
        return <span className="whitespace-nowrap">{row.birth ?? ""}</span>;
      case "area":
        return <span className="whitespace-nowrap">{row.area ?? ""}</span>;
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
          <div className="flex items-center gap-3 whitespace-nowrap text-primary">
            <button
              type="button"
              disabled={busy}
              aria-label={`修改歌手 ${row.artistId}`}
              onClick={() => setEdit({ artist: row })}
            >
              修改
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`删除歌手 ${row.artistId}`}
              onClick={() => remove([row.artistId])}
            >
              删除
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`上传歌手头像 ${row.artistId}`}
              onClick={() => {
                void openAvatar(row);
              }}
            >
              上传头像
            </button>
          </div>
        );
    }
  }
  const input =
    "ml-2 max-w-full rounded-md border bg-background px-3 py-2 outline-none focus:border-primary";
  return (
    <section className="space-y-5">
      <form
        onSubmit={search}
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-5 text-sm"
      >
        <label>
          歌手
          <input
            placeholder="请输入歌手"
            value={draft.artistName}
            onChange={(e) => setDraft({ ...draft, artistName: e.target.value })}
            className={input}
          />
        </label>
        <label>
          国籍
          <input
            placeholder="请输入国籍"
            value={draft.area}
            onChange={(e) => setDraft({ ...draft, area: e.target.value })}
            className={input}
          />
        </label>
        <label>
          类型
          <select
            value={draft.gender}
            onChange={(e) => setDraft({ ...draft, gender: e.target.value })}
            className={input}
          >
            <option value="">全部</option>
            <option value="0">男歌手</option>
            <option value="1">女歌手</option>
            <option value="2">组合/乐队</option>
          </select>
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
            setQuery({ ...empty, pageNum: 1, pageSize: 10 });
            setSelected([]);
            setMessage(null);
          }}
          className="rounded-md border px-4 py-2 disabled:opacity-40"
        >
          重置
        </button>
      </form>
      <AdminDataTable
        name="歌手"
        columns={columns}
        rows={result.data?.items ?? []}
        total={result.data?.total ?? 0}
        page={query.pageNum}
        size={query.pageSize}
        busy={busy}
        loading={result.isPending}
        error={
          result.isError ? authError(result.error, "暂时无法加载歌手") : null
        }
        selected={selected}
        onSelected={setSelected}
        onPage={(pageNum) => setQuery({ ...query, pageNum })}
        onSize={(pageSize) => setQuery({ ...query, pageNum: 1, pageSize })}
        onRefresh={() => void result.refetch()}
        onDelete={() => remove([...selected])}
        getId={(row) => row.artistId}
        render={cell}
        message={message}
        actions={
          <button
            type="button"
            disabled={busy}
            onClick={() => setEdit({ artist: null })}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            <Plus size={15} />
            新增歌手
          </button>
        }
      />
      {edit && (
        <AdminArtistForm
          artist={edit.artist}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setMessage(edit.artist ? "更新成功" : "添加成功");
            setEdit(null);
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
              ? `是否确认删除歌手编号为 ${deleting[0]} 的这条数据？`
              : `确认要批量删除 ${deleting.length} 名歌手吗？`}
            该歌手的歌曲及相关收藏、评论和歌单关联也会删除。
          </p>
        </AdminDialog>
      )}
      {preview && (
        <AdminDialog
          title={`${preview.artistName} 的头像`}
          onClose={() => setPreview(null)}
        >
          <ArtistImage src={preview.avatar} large />
        </AdminDialog>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        aria-label="选择歌手头像"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || !uploadTarget) return;
          if (file.size > 100 * 1024 * 1024) {
            setMessage("头像文件不能超过100MB");
            return;
          }
          setCrop({
            artist: uploadTarget,
            file,
            version: ++cropVersion.current,
          });
        }}
      />
      {crop && (
        <AvatarCropper
          key={crop.version}
          file={crop.file}
          chooseFile={() => fileInput.current?.click()}
          close={() => setCrop(null)}
          upload={async (blob) => {
            const revision = adminRevision();
            const form = new FormData();
            form.append("avatar", blob, "avatar.png");
            const { data } = await adminClient.patch(
              `/admin/updateArtistAvatar/${crop.artist.artistId}`,
              form,
            );
            if (data.code !== 0) throw new Error(data.message);
            if (revision !== adminRevision()) return;
            setMessage("头像上传成功");
            await refresh();
          }}
        />
      )}
    </section>
  );
}
