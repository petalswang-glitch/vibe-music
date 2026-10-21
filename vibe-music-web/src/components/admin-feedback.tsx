"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Search, Trash2, X } from "lucide-react";
import { AdminTableControls } from "@/components/admin-table-controls";
import type { AdminColumn } from "@/lib/admin-columns";
import { adminClient, adminPost, adminRevision } from "@/lib/admin-api";
import { useAdmin } from "@/providers/admin-provider";
import { authError } from "@/providers/auth-provider";
import type { Page } from "@/types/catalogue";

type Feedback = {
  feedbackId: number;
  userId: number;
  feedback: string;
  createTime: string;
};

const defaultColumns: AdminColumn[] = [
  { id: "select", label: "勾选列", visible: true, fixed: true },
  { id: "id", label: "反馈编号", visible: true },
  { id: "user", label: "用户编号", visible: true },
  { id: "content", label: "反馈内容", visible: true },
  { id: "time", label: "反馈时间", visible: true },
  { id: "action", label: "操作", visible: true, fixed: true },
];

export function AdminFeedback() {
  const { admin, ready } = useAdmin();
  const client = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 20, keyword: "" });
  const [selected, setSelected] = useState<number[]>([]);
  const [deleting, setDeleting] = useState<number[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [columns, setColumns] = useState(defaultColumns);
  const [density, setDensity] = useState("default");
  const [full, setFull] = useState(false);
  const result = useQuery({
    queryKey: ["admin", admin?.adminId, "feedback", query],
    enabled: ready && Boolean(admin),
    queryFn: ({ signal }) =>
      adminPost<Page<Feedback>>("/admin/getAllFeedbacks", query, signal),
  });
  const mutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const revision = adminRevision();
      const { data } =
        ids.length === 1
          ? await adminClient.delete(`/admin/deleteFeedback/${ids[0]}`)
          : await adminClient.delete("/admin/deleteFeedbacks", { data: ids });
      if (data.code !== 0) throw new Error(data.message);
      return revision;
    },
    onSuccess: async (revision) => {
      if (revision !== adminRevision()) return;
      setSelected([]);
      setDeleting(null);
      setMessage("删除成功");
      await client.cancelQueries({
        queryKey: ["admin", admin?.adminId, "feedback"],
      });
      if (revision !== adminRevision()) return;
      setQuery((value) => ({ ...value, pageNum: 1 }));
      await client.invalidateQueries({
        queryKey: ["admin", admin?.adminId, "feedback"],
      });
    },
  });
  function search(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setQuery((value) => ({ ...value, pageNum: 1, keyword }));
    if (query.pageNum === 1 && query.keyword === keyword) void result.refetch();
  }
  const rows = result.data?.items ?? [];
  const total = result.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const allSelected =
    rows.length > 0 && rows.every((row) => selected.includes(row.feedbackId));
  function selectOne(id: number, checked: boolean) {
    setSelected((value) =>
      checked
        ? [...new Set([...value, id])]
        : value.filter((item) => item !== id),
    );
  }
  const busy = mutation.isPending || result.isFetching;
  const visibleColumns = columns.filter((column) => column.visible);
  function cell(row: Feedback, column: AdminColumn) {
    switch (column.id) {
      case "select":
        return (
          <input
            type="checkbox"
            aria-label={`选择反馈 ${row.feedbackId}`}
            checked={selected.includes(row.feedbackId)}
            disabled={busy}
            onChange={(event) =>
              selectOne(row.feedbackId, event.target.checked)
            }
          />
        );
      case "id":
        return row.feedbackId;
      case "user":
        return row.userId;
      case "content":
        return row.feedback;
      case "time":
        return row.createTime;
      default:
        return (
          <button
            type="button"
            aria-label={`删除反馈 ${row.feedbackId}`}
            disabled={busy}
            onClick={() => {
              mutation.reset();
              setDeleting([row.feedbackId]);
            }}
            className="inline-flex items-center gap-1 whitespace-nowrap text-primary disabled:opacity-40"
          >
            <Trash2 size={14} />
            删除
          </button>
        );
    }
  }
  return (
    <section className="space-y-5">
      <form
        onSubmit={search}
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-5"
      >
        <label className="text-sm">
          关键词
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="请输入反馈内容关键词"
            className="ml-3 rounded-md border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          <Search size={15} />
          搜索
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setKeyword("");
            setQuery({ pageNum: 1, pageSize: 20, keyword: "" });
            setSelected([]);
            setMessage(null);
          }}
          className="rounded-md border px-4 py-2 text-sm disabled:opacity-40"
        >
          重置
        </button>
      </form>
      <div
        className={
          full
            ? "fixed inset-0 z-50 !m-0 overflow-auto bg-card"
            : "rounded-lg border bg-card"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <h1 className="text-lg font-semibold">反馈管理</h1>
          <AdminTableControls
            columns={columns}
            defaults={defaultColumns}
            onColumns={setColumns}
            density={density}
            onDensity={setDensity}
            full={full}
            onFull={setFull}
            refreshing={busy}
            onRefresh={() => void result.refetch()}
          />
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 border-b bg-muted px-5 py-3 text-sm">
            <span>已选 {selected.length} 项</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected([])}
              className="text-primary"
            >
              取消选择
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                mutation.reset();
                setDeleting([...selected]);
              }}
              className="ml-auto text-destructive"
            >
              批量删除
            </button>
          </div>
        )}
        {message && (
          <p role="status" className="px-5 pt-4 text-sm text-primary">
            {message}
          </p>
        )}
        {result.isError ? (
          <div role="alert" className="p-10 text-center">
            <p className="text-sm text-destructive">
              {authError(result.error, "暂时无法加载反馈")}
            </p>
            <button
              type="button"
              onClick={() => void result.refetch()}
              className="mt-4 text-sm text-primary"
            >
              重新加载反馈
            </button>
          </div>
        ) : result.isPending ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 p-14 text-sm text-muted-foreground"
          >
            <LoaderCircle size={18} className="animate-spin" />
            正在加载反馈...
          </p>
        ) : !rows.length ? (
          <p className="p-14 text-center text-sm text-muted-foreground">
            暂无反馈数据
          </p>
        ) : (
          <div className="overflow-x-auto">
            {!visibleColumns.length ? (
              <p className="p-12 text-center text-sm text-muted-foreground">
                请在列设置中选择要显示的列
              </p>
            ) : (
              <table
                data-density={density}
                className="admin-data-table w-full min-w-[760px] text-left text-sm"
              >
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th
                        key={column.id}
                        className={`p-4 ${column.id === "content" ? "min-w-64" : "whitespace-nowrap"} ${column.id === "select" ? "sticky left-0 z-10 bg-muted" : column.id === "action" ? "sticky right-0 z-10 bg-muted" : ""}`}
                      >
                        {column.id === "select" ? (
                          <input
                            type="checkbox"
                            aria-label="选择当前页全部反馈"
                            checked={allSelected}
                            disabled={busy}
                            onChange={(event) => {
                              const ids = rows.map((row) => row.feedbackId);
                              setSelected((value) =>
                                event.target.checked
                                  ? [...new Set([...value, ...ids])]
                                  : value.filter((id) => !ids.includes(id)),
                              );
                            }}
                          />
                        ) : (
                          column.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.feedbackId} className="hover:bg-muted/40">
                      {visibleColumns.map((column) => (
                        <td
                          key={column.id}
                          className={`p-4 ${column.id === "content" ? "max-w-xl whitespace-pre-wrap break-all leading-6" : "whitespace-nowrap tabular-nums"} ${column.id === "select" ? "sticky left-0 bg-card" : column.id === "action" ? "sticky right-0 bg-card" : ""}`}
                        >
                          {cell(row, column)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t p-4 text-sm">
          <span className="mr-auto text-muted-foreground">共 {total} 条</span>
          <label>
            每页{" "}
            <select
              aria-label="反馈每页数量"
              value={query.pageSize}
              disabled={busy}
              onChange={(event) =>
                setQuery((value) => ({
                  ...value,
                  pageNum: 1,
                  pageSize: Number(event.target.value),
                }))
              }
              className="rounded border bg-card p-1"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>{" "}
            条
          </label>
          <button
            type="button"
            disabled={busy || query.pageNum <= 1}
            onClick={() =>
              setQuery((value) => ({ ...value, pageNum: value.pageNum - 1 }))
            }
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            上一页
          </button>
          <span>
            {query.pageNum} / {pages}
          </span>
          <button
            type="button"
            disabled={busy || query.pageNum >= pages}
            onClick={() =>
              setQuery((value) => ({ ...value, pageNum: value.pageNum + 1 }))
            }
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>
      {deleting && (
        <DeleteDialog
          ids={deleting}
          busy={mutation.isPending}
          error={
            mutation.isError
              ? authError(mutation.error, "删除失败，请重试")
              : null
          }
          onCancel={() => setDeleting(null)}
          onConfirm={() => mutation.mutate(deleting)}
        />
      )}
    </section>
  );
}

function DeleteDialog({
  ids,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  ids: number[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="delete-feedback-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="w-[calc(100%-2rem)] max-w-md rounded-xl border bg-card p-6 text-foreground shadow-lg backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between">
        <h2 id="delete-feedback-title" className="text-lg font-semibold">
          系统提示
        </h2>
        <button
          type="button"
          aria-label="关闭删除确认"
          disabled={busy}
          onClick={onCancel}
          className="rounded p-1 hover:bg-muted"
        >
          <X size={18} />
        </button>
      </div>
      <p className="mt-5 text-sm leading-7">
        {ids.length === 1
          ? `是否确认删除反馈编号为 ${ids[0]} 的这条数据？`
          : `确认要批量删除 ${ids.length} 条反馈吗？`}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-md border px-4 py-2 text-sm"
        >
          取消
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {busy && <LoaderCircle size={15} className="animate-spin" />}确定
        </button>
      </div>
    </dialog>
  );
}
