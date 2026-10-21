"use client";

import { useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { AdminTableControls } from "@/components/admin-table-controls";
import type { AdminColumn } from "@/lib/admin-columns";

export function AdminDataTable<T>({
  name,
  columns: defaults,
  rows,
  total,
  page,
  size,
  busy,
  loading,
  error,
  selected,
  onSelected,
  onPage,
  onSize,
  onRefresh,
  onDelete,
  getId,
  render,
  actions,
  message,
  sizes = [10, 20, 50, 100],
  minWidth = 1250,
}: {
  name: string;
  columns: AdminColumn[];
  rows: T[];
  total: number;
  page: number;
  size: number;
  busy: boolean;
  loading: boolean;
  error: ReactNode;
  selected: number[];
  onSelected: (ids: number[]) => void;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  onRefresh: () => void;
  onDelete: () => void;
  getId: (row: T) => number;
  render: (row: T, column: string) => ReactNode;
  actions: ReactNode;
  message: string | null;
  sizes?: number[];
  minWidth?: number;
}) {
  const [columns, setColumns] = useState(defaults);
  const [density, setDensity] = useState("default");
  const [full, setFull] = useState(false);
  const visible = columns.filter((column) => column.visible);
  const pages = Math.max(1, Math.ceil(total / size));
  const all =
    rows.length > 0 && rows.every((row) => selected.includes(getId(row)));
  return (
    <div
      className={
        full
          ? "fixed inset-0 z-50 !m-0 overflow-auto bg-card"
          : "rounded-lg border bg-card"
      }
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <h1 className="text-lg font-semibold">{name}管理</h1>
        <div className="flex flex-wrap items-center gap-3">
          {actions}
          <AdminTableControls
            columns={columns}
            defaults={defaults}
            onColumns={setColumns}
            density={density}
            onDensity={setDensity}
            full={full}
            onFull={setFull}
            refreshing={busy}
            onRefresh={onRefresh}
            refreshLabel={`刷新${name}`}
          />
        </div>
      </header>
      {!!selected.length && (
        <div className="flex flex-wrap items-center gap-4 border-b bg-muted px-5 py-3 text-sm">
          <span>已选 {selected.length} 项</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSelected([])}
            className="text-primary"
          >
            取消选择
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
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
      {error ? (
        <div role="alert" className="p-10 text-center text-sm text-destructive">
          {error}
          <button
            type="button"
            onClick={onRefresh}
            className="mt-4 block w-full text-primary"
          >
            重新加载{name}
          </button>
        </div>
      ) : loading ? (
        <p
          role="status"
          className="flex items-center justify-center gap-2 p-14 text-sm text-muted-foreground"
        >
          <LoaderCircle size={18} className="animate-spin" />
          正在加载{name}...
        </p>
      ) : !rows.length ? (
        <p className="p-14 text-center text-sm text-muted-foreground">
          暂无{name}数据
        </p>
      ) : !visible.length ? (
        <p className="p-12 text-center text-sm text-muted-foreground">
          请在列设置中选择要显示的列
        </p>
      ) : (
        <div
          className="overflow-x-auto"
          tabIndex={0}
          aria-label={`${name}表格滚动区域`}
        >
          <table
            data-density={density}
            className="admin-data-table w-full text-left text-sm"
            style={{ minWidth }}
          >
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {visible.map((column) => (
                  <th
                    key={column.id}
                    className={`whitespace-nowrap p-4 font-medium ${column.id === "select" ? "sticky left-0 z-10 bg-muted" : column.id === "action" ? "sticky right-0 z-10 bg-muted" : ""}`}
                  >
                    {column.id === "select" ? (
                      <input
                        type="checkbox"
                        aria-label={`选择当前页全部${name}`}
                        checked={all}
                        disabled={busy}
                        onChange={(event) =>
                          onSelected(
                            event.target.checked
                              ? [...new Set([...selected, ...rows.map(getId)])]
                              : selected.filter(
                                  (id) =>
                                    !rows.some((row) => getId(row) === id),
                                ),
                          )
                        }
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
                <tr key={getId(row)} className="hover:bg-muted/40">
                  {visible.map((column) => (
                    <td
                      key={column.id}
                      className={`p-4 ${column.id === "select" ? "sticky left-0 bg-card" : column.id === "action" ? "sticky right-0 bg-card" : ""}`}
                    >
                      {column.id === "select" ? (
                        <input
                          type="checkbox"
                          aria-label={`选择${name} ${getId(row)}`}
                          checked={selected.includes(getId(row))}
                          disabled={busy}
                          onChange={(event) =>
                            onSelected(
                              event.target.checked
                                ? [...new Set([...selected, getId(row)])]
                                : selected.filter((id) => id !== getId(row)),
                            )
                          }
                        />
                      ) : (
                        render(row, column.id)
                      )}
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
            aria-label={`${name}每页数量`}
            disabled={busy}
            value={size}
            onChange={(event) => onSize(Number(event.target.value))}
            className="rounded border bg-card p-1"
          >
            {sizes.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>{" "}
          条
        </label>
        <button
          type="button"
          disabled={busy || page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          上一页
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          type="button"
          disabled={busy || page >= pages}
          onClick={() => onPage(page + 1)}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          下一页
        </button>
      </footer>
    </div>
  );
}
