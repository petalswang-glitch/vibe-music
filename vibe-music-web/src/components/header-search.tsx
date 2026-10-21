"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";

export function HeaderSearch() {
  const query = useSearchParams().get("query") ?? "";
  return <SearchForm key={query} query={query} />;
}
function SearchForm({ query }: { query: string }) {
  const [draft, setDraft] = useState(query);
  const router = useRouter();
  function submit(event: FormEvent) {
    event.preventDefault();
    router.push(`/library?${new URLSearchParams({ query: draft.trim() })}`);
  }
  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex w-full min-w-0 items-center gap-2 rounded-full border bg-card px-3 py-2 sm:max-w-xs"
    >
      <Search
        size={16}
        className="shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        aria-label="全站搜索歌曲"
        placeholder="搜索歌曲..."
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      <button className="shrink-0 text-sm text-primary">搜索</button>
    </form>
  );
}
