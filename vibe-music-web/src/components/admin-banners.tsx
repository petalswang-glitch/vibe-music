"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { AdminDataTable } from "@/components/admin-data-table";
import { AdminDialog } from "@/components/admin-dialog";
import { AdminCoverUpload } from "@/components/admin-cover-upload";
import { adminClient, adminPost, adminRevision } from "@/lib/admin-api";
import type { AdminColumn } from "@/lib/admin-columns";
import { mediaUrl } from "@/lib/media-url";
import { useAdmin } from "@/providers/admin-provider";
import { authError } from "@/providers/auth-provider";
import type { Page } from "@/types/catalogue";

type Banner = {
  bannerId: number;
  bannerUrl: string;
  bannerStatus: "ENABLE" | "DISABLE";
};
const columns: AdminColumn[] = [
  { id: "select", label: "勾选列", visible: true, fixed: true },
  { id: "id", label: "轮播图编号", visible: true },
  { id: "image", label: "轮播图", visible: true },
  { id: "status", label: "状态", visible: true },
  { id: "action", label: "操作", visible: true, fixed: true },
];

function BannerImage({
  src,
  preview = false,
}: {
  src: string;
  preview?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = mediaUrl(src) ?? "/images/default-cover.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt="轮播图"
      src={failed === url ? "/images/default-cover.png" : url}
      onError={() => setFailed(url)}
      className={
        preview
          ? "mx-auto max-h-[65dvh] max-w-full object-contain"
          : "h-[195px] w-[500px] max-w-none rounded-lg object-cover"
      }
    />
  );
}

export function AdminBanners() {
  const { admin, ready } = useAdmin();
  const client = useQueryClient();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState({
    pageNum: 1,
    pageSize: 5,
    bannerStatus: "",
  });
  const [selected, setSelected] = useState<number[]>([]);
  const [upload, setUpload] = useState<{ row: Banner | null } | null>(null);
  const [preview, setPreview] = useState<Banner | null>(null);
  const [confirm, setConfirm] = useState<{
    ids: number[];
    status?: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const result = useQuery({
    queryKey: ["admin", admin?.adminId, "banners", query],
    enabled: ready && !!admin,
    queryFn: ({ signal }) =>
      adminPost<Page<Banner>>(
        "/admin/getAllBanners",
        {
          ...query,
          bannerStatus:
            query.bannerStatus === "" ? null : Number(query.bannerStatus),
        },
        signal,
      ),
  });
  async function refresh() {
    setSelected([]);
    setQuery((value) => ({ ...value, pageNum: 1 }));
    await Promise.all([
      client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "banners"],
      }),
      client.invalidateQueries({ queryKey: ["banner"] }),
    ]);
  }
  const mutation = useMutation({
    mutationFn: async (value: { ids: number[]; status?: number }) => {
      const revision = adminRevision();
      const { data } =
        value.status !== undefined
          ? await adminClient.patch(
              `/admin/updateBannerStatus/${value.ids[0]}`,
              null,
              { params: { status: value.status } },
            )
          : value.ids.length === 1
            ? await adminClient.delete(`/admin/deleteBanner/${value.ids[0]}`)
            : await adminClient.delete("/admin/deleteBanners", {
                data: value.ids,
              });
      if (data.code !== 0) throw new Error(data.message);
      return { revision, status: value.status };
    },
    onSuccess: async (value) => {
      if (value.revision !== adminRevision()) return;
      setConfirm(null);
      setMessage(
        value.status !== undefined ? "已成功修改轮播图状态" : "删除成功",
      );
      await refresh();
    },
  });
  const busy = result.isFetching || mutation.isPending;
  function openConfirm(value: { ids: number[]; status?: number }) {
    mutation.reset();
    setConfirm(value);
  }
  function search(event: FormEvent) {
    event.preventDefault();
    setSelected([]);
    setQuery((value) => ({ ...value, pageNum: 1, bannerStatus: draft }));
    if (query.pageNum === 1 && query.bannerStatus === draft)
      void result.refetch();
  }
  function render(row: Banner, column: string): ReactNode {
    if (column === "id") return row.bannerId;
    if (column === "image")
      return (
        <button
          type="button"
          aria-label={`预览轮播图 ${row.bannerId}`}
          onClick={() => setPreview(row)}
        >
          <BannerImage src={row.bannerUrl} />
        </button>
      );
    if (column === "status")
      return (
        <button
          type="button"
          role="switch"
          aria-label={`轮播图状态 ${row.bannerId}`}
          aria-checked={row.bannerStatus === "ENABLE"}
          disabled={busy}
          onClick={() =>
            openConfirm({
              ids: [row.bannerId],
              status: row.bannerStatus === "ENABLE" ? 1 : 0,
            })
          }
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${row.bannerStatus === "ENABLE" ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-500"}`}
        >
          {row.bannerStatus === "ENABLE" ? "启用" : "禁用"}
        </button>
      );
    if (column === "action")
      return (
        <div className="flex gap-3 whitespace-nowrap text-xs">
          <button
            type="button"
            aria-label={`编辑轮播图 ${row.bannerId}`}
            disabled={busy}
            onClick={() => setUpload({ row })}
            className="text-primary"
          >
            编辑
          </button>
          <button
            type="button"
            aria-label={`删除轮播图 ${row.bannerId}`}
            disabled={busy}
            onClick={() => openConfirm({ ids: [row.bannerId] })}
            className="text-destructive"
          >
            删除
          </button>
        </div>
      );
    return null;
  }
  return (
    <div className="space-y-5">
      <form
        onSubmit={search}
        className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-5 text-sm"
      >
        <label>
          状态
          <select
            aria-label="轮播图状态筛选"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="ml-3 min-w-40 rounded border bg-background p-2"
          >
            <option value="">全部</option>
            <option value="0">启用</option>
            <option value="1">禁用</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-white disabled:opacity-40"
        >
          <Search size={15} />
          搜索
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft("");
            setSelected([]);
            setQuery({
              pageNum: 1,
              pageSize: query.pageSize,
              bannerStatus: "",
            });
          }}
          className="rounded border px-4 py-2"
        >
          重置
        </button>
      </form>
      <AdminDataTable
        name="轮播图"
        minWidth={900}
        columns={columns}
        rows={result.data?.items ?? []}
        total={result.data?.total ?? 0}
        page={query.pageNum}
        size={query.pageSize}
        sizes={[5, 10, 20, 50, 100]}
        busy={busy}
        loading={result.isPending}
        error={
          result.isError ? (
            <>
              {authError(result.error, "无法加载轮播图")}
              <button
                type="button"
                className="ml-3 text-primary"
                onClick={() => void result.refetch()}
              >
                重试
              </button>
            </>
          ) : null
        }
        selected={selected}
        onSelected={setSelected}
        onPage={(pageNum) => setQuery({ ...query, pageNum })}
        onSize={(pageSize) => {
          setSelected([]);
          setQuery({ ...query, pageNum: 1, pageSize });
        }}
        onRefresh={() => void refresh()}
        onDelete={() => openConfirm({ ids: selected })}
        getId={(row) => row.bannerId}
        render={render}
        message={message}
        actions={
          <button
            type="button"
            disabled={busy}
            onClick={() => setUpload({ row: null })}
            className="flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            <Plus size={16} />
            新增轮播图
          </button>
        }
      />
      {upload && (
        <AdminCoverUpload
          banner
          src={upload.row?.bannerUrl ?? null}
          path={
            upload.row
              ? `/admin/updateBanner/${upload.row.bannerId}`
              : "/admin/addBanner"
          }
          onClose={() => setUpload(null)}
          onSaved={async () => {
            setUpload(null);
            setMessage(upload.row ? "更新成功" : "添加成功");
            await refresh();
          }}
        />
      )}
      {preview && (
        <AdminDialog
          title={`轮播图预览 ${preview.bannerId}`}
          wide
          onClose={() => setPreview(null)}
        >
          <BannerImage src={preview.bannerUrl} preview />
        </AdminDialog>
      )}
      {confirm && (
        <AdminDialog
          title="系统提示"
          busy={mutation.isPending}
          error={
            mutation.isError
              ? authError(mutation.error, "操作失败，请重试")
              : null
          }
          onClose={() => setConfirm(null)}
          onConfirm={() => mutation.mutate(confirm)}
        >
          <p className="text-sm">
            {confirm.status !== undefined
              ? `确认要${confirm.status === 0 ? "启用" : "禁用"}编号为 ${confirm.ids[0]} 的轮播图吗？`
              : confirm.ids.length === 1
                ? `确认要删除编号为 ${confirm.ids[0]} 的轮播图吗？`
                : `确认要批量删除 ${confirm.ids.length} 张轮播图吗？`}
          </p>
        </AdminDialog>
      )}
    </div>
  );
}
