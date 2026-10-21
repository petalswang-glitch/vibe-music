"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pagination } from "@/components/pagination";

import { postApi } from "@/lib/api-client";
import { SongTable } from "@/components/song-table";
import type { SongPage } from "@/types/song";
import { useAuth } from "@/providers/auth-provider";
import { viewerKey } from "@/lib/favorite-cache";

export function MusicLibrary() {
  const keyword = useSearchParams().get("query") ?? "";
  return <LibraryResults key={keyword} keyword={keyword} />;
}
function LibraryResults({ keyword }: { keyword: string }) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [draft, setDraft] = useState(keyword);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const songs = useQuery({
    queryKey: ["songs", keyword, page, size, viewerKey(user?.userId)],
    queryFn: ({ signal }) =>
      postApi<SongPage>(
        "/song/getAllSongs",
        {
          pageNum: page,
          pageSize: size,
          songName: keyword,
          artistName: "",
          album: "",
        },
        signal,
      ),
    enabled: ready,
  });

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    router.push(`/library?${new URLSearchParams({ query: draft.trim() })}`);
  }

  return (
    <section
      aria-labelledby="library-title"
      className="mx-auto w-full max-w-6xl"
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1
            id="library-title"
            className="font-serif-display text-3xl font-semibold"
          >
            曲库
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            发现你的下一首心动音乐
          </p>
        </div>
        <form
          onSubmit={search}
          role="search"
          className="flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 shadow-paper focus-within:ring-2 focus-within:ring-primary/40"
        >
          <Search
            aria-hidden="true"
            size={18}
            className="text-muted-foreground"
          />
          <label htmlFor="song-search" className="sr-only">
            搜索歌曲
          </label>
          <input
            id="song-search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="搜索歌曲..."
            className="w-40 bg-transparent text-sm outline-none sm:w-56"
          />
          <button type="submit" className="text-sm font-medium text-primary">
            搜索
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-paper">
        {songs.isPending ? (
          <div
            role="status"
            className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground"
          >
            <LoaderCircle className="animate-spin" size={20} />
            正在加载歌曲...
          </div>
        ) : songs.isError ? (
          <div
            role="alert"
            className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 text-center"
          >
            <p>暂时无法加载曲库，请稍后重试</p>
            <button
              onClick={() => void songs.refetch()}
              className="rounded-lg bg-primary px-5 py-2 text-sm text-white"
            >
              重新加载
            </button>
          </div>
        ) : !songs.data.items?.length ? (
          <div
            role="status"
            className="flex min-h-64 items-center justify-center text-muted-foreground"
          >
            未找到相关歌曲
          </div>
        ) : (
          <div className="overflow-x-auto" aria-busy={songs.isFetching}>
            <SongTable songs={songs.data.items} offset={(page - 1) * size} />
          </div>
        )}
      </div>

      {!songs.isError && !songs.isPending && (
        <Pagination
          label={"歌曲分页"}
          total={songs.data.total}
          page={page}
          size={size}
          sizes={[20, 30, 50]}
          busy={songs.isFetching}
          onPage={setPage}
          onSize={(value) => {
            setSize(value);
            setPage(1);
          }}
        />
      )}
    </section>
  );
}
