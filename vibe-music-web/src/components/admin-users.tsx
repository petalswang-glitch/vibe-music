"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Search } from "lucide-react";
import { AdminDialog } from "@/components/admin-dialog";
import { AdminTableControls } from "@/components/admin-table-controls";
import { AdminUserForm } from "@/components/admin-user-form";
import { adminClient, adminPost, adminRevision } from "@/lib/admin-api";
import type { AdminColumn } from "@/lib/admin-columns";
import { maskedPhone, type ManagedUser } from "@/lib/admin-users";
import { mediaUrl } from "@/lib/media-url";
import { useAdmin } from "@/providers/admin-provider";
import { authError } from "@/providers/auth-provider";
import type { Page } from "@/types/catalogue";

const defaults: AdminColumn[] = [
  { id: "select", label: "勾选列", visible: true, fixed: true },
  { id: "id", label: "用户编号", visible: true },
  { id: "avatar", label: "用户头像", visible: true },
  { id: "username", label: "用户名", visible: true },
  { id: "phone", label: "手机号码", visible: true },
  { id: "email", label: "邮箱", visible: true },
  { id: "status", label: "状态", visible: true },
  { id: "created", label: "创建时间", visible: true },
  { id: "updated", label: "修改时间", visible: true },
  { id: "action", label: "操作", visible: true, fixed: true },
];
type Filters = { username: string; phone: string; userStatus: string };
type Action =
  | { kind: "status"; user: ManagedUser }
  | { kind: "delete"; ids: number[] };
const empty: Filters = { username: "", phone: "", userStatus: "" };

function Avatar({
  src,
  large = false,
}: {
  src: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = mediaUrl(src) ?? "/images/default-user.jpg";
  // Native image handles historical missing media with the same default avatar.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed === url ? "/images/default-user.jpg" : url}
      alt="用户头像"
      onError={() => setFailed(url)}
      className={
        large
          ? "mx-auto max-h-[60dvh] max-w-full object-contain"
          : "h-9 w-9 rounded-full object-cover"
      }
    />
  );
}

export function AdminUsers() {
  const { admin, ready } = useAdmin();
  const client = useQueryClient();
  const [draft, setDraft] = useState(empty);
  const [query, setQuery] = useState({ ...empty, pageNum: 1, pageSize: 15 });
  const [selected, setSelected] = useState<number[]>([]);
  const [columns, setColumns] = useState(defaults);
  const [density, setDensity] = useState("default");
  const [full, setFull] = useState(false);
  const [edit, setEdit] = useState<{ user: ManagedUser | null } | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [preview, setPreview] = useState<ManagedUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const result = useQuery({
    queryKey: ["admin", admin?.adminId, "users", query],
    enabled: ready && Boolean(admin),
    queryFn: ({ signal }) =>
      adminPost<Page<ManagedUser>>(
        "/admin/getAllUsers",
        {
          ...query,
          phone: query.phone || null,
          username: query.username || null,
          userStatus: query.userStatus === "" ? null : Number(query.userStatus),
        },
        signal,
      ),
  });
  async function refresh() {
    const revision = adminRevision();
    await client.cancelQueries({
      queryKey: ["admin", admin?.adminId, "users"],
    });
    if (revision !== adminRevision()) return;
    setQuery((value) => ({ ...value, pageNum: 1 }));
    await client.invalidateQueries({
      queryKey: ["admin", admin?.adminId, "users"],
    });
    await client.invalidateQueries({
      queryKey: ["admin", admin?.adminId, "users-count"],
    });
    await client.invalidateQueries({
      queryKey: ["admin", admin?.adminId, "dashboard"],
    });
    await client.invalidateQueries({
      queryKey: ["admin", admin?.adminId, "feedback"],
    });
  }
  const mutation = useMutation({
    mutationFn: async (value: Action) => {
      const revision = adminRevision();
      const { data } =
        value.kind === "status"
          ? await adminClient.patch(
              `/admin/updateUserStatus/${value.user.userId}/${value.user.userStatus === "ENABLE" ? 1 : 0}`,
            )
          : value.ids.length === 1
            ? await adminClient.delete(`/admin/deleteUser/${value.ids[0]}`)
            : await adminClient.delete("/admin/deleteUsers", {
                data: value.ids,
              });
      if (data.code !== 0) throw new Error(data.message);
      return revision;
    },
    onSuccess: async (revision) => {
      if (revision !== adminRevision()) return;
      setMessage(action?.kind === "status" ? "已成功修改用户状态" : "删除成功");
      setAction(null);
      setSelected([]);
      await refresh();
    },
  });
  function search(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setQuery({ ...draft, pageNum: 1, pageSize: query.pageSize });
    if (
      query.pageNum === 1 &&
      JSON.stringify(draft) ===
        JSON.stringify({
          username: query.username,
          phone: query.phone,
          userStatus: query.userStatus,
        })
    )
      void result.refetch();
  }
  const rows = result.data?.items ?? [];
  const total = result.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const busy = result.isFetching || mutation.isPending;
  const visible = columns.filter((column) => column.visible);
  const allSelected =
    rows.length > 0 && rows.every((row) => selected.includes(row.userId));
  function choose(id: number, checked: boolean) {
    setSelected((value) =>
      checked
        ? [...new Set([...value, id])]
        : value.filter((item) => item !== id),
    );
  }
  function confirm(value: Action) {
    mutation.reset();
    setAction(value);
  }
  function cell(row: ManagedUser, column: AdminColumn) {
    switch (column.id) {
      case "select":
        return (
          <input
            type="checkbox"
            aria-label={`选择用户 ${row.userId}`}
            checked={selected.includes(row.userId)}
            disabled={busy}
            onChange={(event) => choose(row.userId, event.target.checked)}
          />
        );
      case "id":
        return row.userId;
      case "avatar":
        return (
          <button
            type="button"
            aria-label={`预览头像 ${row.username}`}
            onClick={() => setPreview(row)}
          >
            <Avatar src={row.userAvatar} />
          </button>
        );
      case "username":
        return row.username;
      case "phone":
        return maskedPhone(row.phone);
      case "email":
        return row.email;
      case "status":
        return (
          <button
            type="button"
            role="switch"
            aria-label={`启用用户 ${row.userId}`}
            aria-checked={row.userStatus === "ENABLE"}
            disabled={busy}
            onClick={() => confirm({ kind: "status", user: row })}
            className={`rounded-full px-3 py-1 text-xs disabled:opacity-40 ${row.userStatus === "ENABLE" ? "bg-blue-500/10 text-primary" : "bg-muted text-muted-foreground"}`}
          >
            {row.userStatus === "ENABLE" ? "启用" : "禁用"}
          </button>
        );
      case "created":
        return row.createTime.replace("T", " ").slice(0, 19);
      case "updated":
        return row.updateTime.replace("T", " ").slice(0, 19);
      default:
        return (
          <div className="flex gap-3 text-primary">
            <button
              type="button"
              aria-label={`修改用户 ${row.userId}`}
              disabled={busy}
              onClick={() => setEdit({ user: row })}
            >
              修改
            </button>
            <button
              type="button"
              aria-label={`删除用户 ${row.userId}`}
              disabled={busy}
              onClick={() => confirm({ kind: "delete", ids: [row.userId] })}
            >
              删除
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
          用户名
          <input
            className={input}
            placeholder="请输入用户名"
            value={draft.username}
            onChange={(event) =>
              setDraft({ ...draft, username: event.target.value })
            }
          />
        </label>
        <label>
          手机号码
          <input
            className={input}
            placeholder="请输入手机号码"
            value={draft.phone}
            onChange={(event) =>
              setDraft({ ...draft, phone: event.target.value })
            }
          />
        </label>
        <label>
          状态
          <select
            className={input}
            value={draft.userStatus}
            onChange={(event) =>
              setDraft({ ...draft, userStatus: event.target.value })
            }
          >
            <option value="">全部</option>
            <option value="0">启用</option>
            <option value="1">禁用</option>
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
            setQuery({ ...empty, pageNum: 1, pageSize: 15 });
            setSelected([]);
            setMessage(null);
          }}
          className="rounded-md border px-4 py-2 disabled:opacity-40"
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
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <h1 className="text-lg font-semibold">用户管理</h1>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setEdit({ user: null })}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-white disabled:opacity-40"
            >
              <Plus size={15} />
              新增用户
            </button>
            <AdminTableControls
              columns={columns}
              defaults={defaults}
              onColumns={setColumns}
              density={density}
              onDensity={setDensity}
              full={full}
              onFull={setFull}
              refreshing={busy}
              onRefresh={() => void result.refetch()}
              refreshLabel="刷新用户"
            />
          </div>
        </header>
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
              onClick={() => confirm({ kind: "delete", ids: [...selected] })}
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
              {authError(result.error, "暂时无法加载用户")}
            </p>
            <button
              type="button"
              onClick={() => void result.refetch()}
              className="mt-4 text-sm text-primary"
            >
              重新加载用户
            </button>
          </div>
        ) : result.isPending ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 p-14 text-sm text-muted-foreground"
          >
            <LoaderCircle size={18} className="animate-spin" />
            正在加载用户...
          </p>
        ) : !rows.length ? (
          <p className="p-14 text-center text-sm text-muted-foreground">
            暂无用户数据
          </p>
        ) : !visible.length ? (
          <p className="p-12 text-center text-sm text-muted-foreground">
            请在列设置中选择要显示的列
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              data-density={density}
              className="admin-data-table w-full min-w-[1250px] text-left text-sm"
            >
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {visible.map((column) => (
                    <th
                      key={column.id}
                      className={`whitespace-nowrap p-4 ${column.id === "select" ? "sticky left-0 z-10 bg-muted" : column.id === "action" ? "sticky right-0 z-10 bg-muted" : ""}`}
                    >
                      {column.id === "select" ? (
                        <input
                          type="checkbox"
                          aria-label="选择当前页全部用户"
                          checked={allSelected}
                          disabled={busy}
                          onChange={(event) => {
                            const ids = rows.map((row) => row.userId);
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
                  <tr key={row.userId} className="hover:bg-muted/40">
                    {visible.map((column) => (
                      <td
                        key={column.id}
                        className={`whitespace-nowrap p-4 tabular-nums ${column.id === "select" ? "sticky left-0 bg-card" : column.id === "action" ? "sticky right-0 bg-card" : ""}`}
                      >
                        {cell(row, column)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-end gap-3 border-t p-4 text-sm">
          <span className="mr-auto text-muted-foreground">共 {total} 条</span>
          <label>
            每页{" "}
            <select
              aria-label="用户每页数量"
              value={query.pageSize}
              disabled={busy}
              onChange={(event) =>
                setQuery({
                  ...query,
                  pageNum: 1,
                  pageSize: Number(event.target.value),
                })
              }
              className="rounded border bg-card p-1"
            >
              {[10, 15, 20, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>{" "}
            条
          </label>
          <button
            type="button"
            disabled={busy || query.pageNum <= 1}
            onClick={() => setQuery({ ...query, pageNum: query.pageNum - 1 })}
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
            onClick={() => setQuery({ ...query, pageNum: query.pageNum + 1 })}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            下一页
          </button>
        </footer>
      </div>
      {edit && (
        <AdminUserForm
          user={edit.user}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setEdit(null);
            setMessage(edit.user ? "更新成功" : "添加成功");
            await refresh();
          }}
        />
      )}
      {action && (
        <AdminDialog
          title="系统提示"
          busy={mutation.isPending}
          error={
            mutation.isError
              ? authError(mutation.error, "操作失败，请重试")
              : null
          }
          onClose={() => setAction(null)}
          onConfirm={() => mutation.mutate(action)}
        >
          <p className="text-sm leading-7">
            {action.kind === "status"
              ? `确认要${action.user.userStatus === "ENABLE" ? "禁用" : "启用"} ${action.user.username} 用户吗？`
              : action.ids.length === 1
                ? `是否确认删除用户编号为 ${action.ids[0]} 的这条数据？`
                : `确认要批量删除 ${action.ids.length} 名用户吗？`}
          </p>
        </AdminDialog>
      )}
      {preview && (
        <AdminDialog
          title={`${preview.username} 的头像`}
          onClose={() => setPreview(null)}
        >
          <Avatar src={preview.userAvatar} large />
        </AdminDialog>
      )}
    </section>
  );
}
