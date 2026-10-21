"use client";

import { useEffect, useState, type FormEvent } from "react";

export function Pagination({
  label,
  total,
  page,
  size,
  sizes,
  busy,
  onPage,
  onSize,
}: {
  label: string;
  total: number;
  page: number;
  size: number;
  sizes: number[];
  busy: boolean;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => {
    if (page > pages) onPage(pages);
  }, [page, pages, onPage]);
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from(
    { length: Math.min(5, pages) },
    (_, index) => start + index,
  );
  return (
    <nav
      aria-label={label}
      className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <span>共 {total} 条</span>
      <div className="flex flex-wrap items-center gap-2">
        <label>
          每页数量{" "}
          <select
            value={size}
            disabled={busy}
            onChange={(event) => onSize(Number(event.target.value))}
            className="rounded-lg border bg-card px-2 py-1.5"
          >
            {sizes.map((value) => (
              <option key={value} value={value}>
                {value} / 页
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label="上一页"
          disabled={page <= 1 || busy}
          onClick={() => onPage(page - 1)}
          className="rounded-lg border px-2 py-1.5 disabled:opacity-30"
        >
          上一页
        </button>
        {start > 1 && <span aria-hidden="true">…</span>}
        {numbers.map((number) => (
          <button
            key={number}
            aria-label={`第 ${number} 页`}
            aria-current={number === page ? "page" : undefined}
            disabled={busy}
            onClick={() => onPage(number)}
            className={`rounded-lg border px-3 py-1.5 ${number === page ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
          >
            {number}
          </button>
        ))}
        {numbers.at(-1)! < pages && <span aria-hidden="true">…</span>}
        <button
          aria-label="下一页"
          disabled={page >= pages || busy}
          onClick={() => onPage(page + 1)}
          className="rounded-lg border px-2 py-1.5 disabled:opacity-30"
        >
          下一页
        </button>
        <Jump
          key={`${page}:${pages}`}
          page={page}
          pages={pages}
          busy={busy}
          onPage={onPage}
        />
      </div>
    </nav>
  );
}
function Jump({
  page,
  pages,
  busy,
  onPage,
}: {
  page: number;
  pages: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  const [draft, setDraft] = useState(String(page));
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = Number(draft);
    if (Number.isInteger(next) && next >= 1 && next <= pages) onPage(next);
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <label>
        跳至{" "}
        <input
          type="number"
          aria-label="跳转页码"
          min={1}
          max={pages}
          required
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          className="w-16 rounded-lg border bg-card px-2 py-1.5"
        />{" "}
        页
      </label>
      <button disabled={busy} className="rounded-lg border px-2 py-1.5">
        跳转
      </button>
      <span>/ {pages} 页</span>
    </form>
  );
}
