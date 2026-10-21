"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Maximize,
  Minimize,
  RefreshCw,
} from "lucide-react";
import { moveAdminColumn, type AdminColumn } from "@/lib/admin-columns";

export function AdminTableControls({
  columns,
  defaults,
  onColumns,
  density,
  onDensity,
  full,
  onFull,
  refreshing,
  onRefresh,
  refreshLabel = "刷新反馈",
}: {
  columns: AdminColumn[];
  defaults: AdminColumn[];
  onColumns: (columns: AdminColumn[]) => void;
  density: string;
  onDensity: (density: string) => void;
  full: boolean;
  onFull: (full: boolean) => void;
  refreshing: boolean;
  onRefresh: () => void;
  refreshLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!full) return;
    const leave = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFull(false);
    };
    window.addEventListener("keydown", leave);
    return () => window.removeEventListener("keydown", leave);
  }, [full, onFull]);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={refreshLabel}
        disabled={refreshing}
        onClick={onRefresh}
        className="rounded-lg p-2 hover:bg-muted disabled:opacity-40"
      >
        <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
      </button>
      <select
        aria-label="表格密度"
        value={density}
        onChange={(event) => onDensity(event.target.value)}
        className="min-w-0 rounded border bg-card px-1 py-1.5 text-xs"
      >
        <option value="large">宽松</option>
        <option value="default">默认</option>
        <option value="small">紧凑</option>
      </select>
      <div className="relative">
        <button
          type="button"
          aria-label="列设置"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="rounded-lg p-2 hover:bg-muted"
        >
          <Columns3 size={17} />
        </button>
        {open && (
          <div
            role="group"
            aria-label="列展示"
            className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border bg-card p-3 text-sm shadow-lg"
          >
            <div className="mb-3 flex justify-between border-b pb-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label="显示全部列"
                  checked={columns.every((column) => column.visible)}
                  onChange={(event) =>
                    onColumns(
                      columns.map((column) => ({
                        ...column,
                        visible: event.target.checked,
                      })),
                    )
                  }
                />
                列展示
              </label>
              <button
                type="button"
                onClick={() => onColumns(defaults)}
                className="text-primary"
              >
                重置列
              </button>
            </div>
            {columns.map((column, index) => (
              <div
                key={column.id}
                draggable={!column.fixed}
                onDragStart={(event) =>
                  event.dataTransfer.setData("text/plain", column.id)
                }
                onDragOver={(event) => {
                  if (!column.fixed) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onColumns(
                    moveAdminColumn(
                      columns,
                      event.dataTransfer.getData("text/plain"),
                      column.id,
                    ),
                  );
                }}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`显示${column.label}`}
                    checked={column.visible}
                    onChange={(event) =>
                      onColumns(
                        columns.map((value) =>
                          value.id === column.id
                            ? { ...value, visible: event.target.checked }
                            : value,
                        ),
                      )
                    }
                  />
                  {column.label}
                </label>
                {!column.fixed && (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      aria-label={`上移${column.label}`}
                      disabled={index === 0 || columns[index - 1].fixed}
                      onClick={() =>
                        onColumns(
                          moveAdminColumn(
                            columns,
                            column.id,
                            columns[index - 1].id,
                          ),
                        )
                      }
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={`下移${column.label}`}
                      disabled={
                        index === columns.length - 1 || columns[index + 1].fixed
                      }
                      onClick={() =>
                        onColumns(
                          moveAdminColumn(
                            columns,
                            column.id,
                            columns[index + 1].id,
                          ),
                        )
                      }
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                    >
                      <ArrowDown size={13} />
                    </button>
                  </span>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2 w-full rounded border py-1.5 text-xs"
            >
              完成列设置
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={full ? "退出表格全屏" : "表格全屏"}
        onClick={() => onFull(!full)}
        className="rounded-lg p-2 hover:bg-muted"
      >
        {full ? <Minimize size={17} /> : <Maximize size={17} />}
      </button>
    </div>
  );
}
