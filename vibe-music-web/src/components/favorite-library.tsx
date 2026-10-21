"use client";

import { Pagination } from "@/components/pagination";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { AuthDialog } from "@/components/auth-dialog";
import { CoverImage } from "@/components/cover-image";
import { SongTable } from "@/components/song-table";
import { postApi } from "@/lib/api-client";
import { viewerKey } from "@/lib/favorite-cache";
import { useAuth } from "@/providers/auth-provider";
import { usePlayer } from "@/providers/player-provider";
import type { SongPage } from "@/types/song";

export function FavoriteLibrary() {
  const { user, ready } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  if (!ready) return <p role="status">正在验证登录状态...</p>;
  if (!user)
    return (
      <section>
        <h1 className="font-serif-display text-3xl">我喜欢的音乐</h1>
        <p className="my-5 text-muted-foreground">请登录查看收藏歌曲</p>
        <button
          onClick={() => setDismissed(false)}
          className="rounded-lg bg-primary px-5 py-2 text-white"
        >
          登录 / 注册
        </button>
        {!dismissed && <AuthDialog onClose={() => setDismissed(true)} />}
      </section>
    );
  return <LikedSongs key={user.userId} userId={user.userId} />;
}

function LikedSongs({ userId }: { userId: number }) {
  const playQueue = usePlayer((state) => state.playQueue);
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const result = useQuery({
    queryKey: ["favorite", "songs", keyword, page, size, viewerKey(userId)],
    queryFn: ({ signal }) =>
      postApi<SongPage>(
        "/favorite/getFavoriteSongs",
        {
          pageNum: page,
          pageSize: size,
          songName: keyword,
          artistName: "",
          album: "",
        },
        signal,
      ),
    refetchOnMount: "always",
  });
  const songs = result.data?.items ?? [];
  function search(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setKeyword(draft);
  }
  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-col gap-6 sm:flex-row">
        <div className="w-48 shrink-0">
          <CoverImage
            src={songs[0]?.coverUrl ?? "/images/default-cover.png"}
            alt="我喜欢的音乐"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-6">
          <div>
            <h1 className="font-serif-display text-3xl font-semibold">
              我喜欢的音乐
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {result.data?.total ?? 0} 首歌曲
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              disabled={!songs.length || result.isFetching}
              onClick={() => playQueue(songs)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm text-white disabled:opacity-40"
            >
              <Play size={17} />
              播放全部
            </button>
            <form
              role="search"
              onSubmit={search}
              className="flex min-w-0 gap-2"
            >
              <input
                aria-label="搜索收藏歌曲"
                placeholder="搜索"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="min-w-0 rounded-lg border bg-card px-3 py-2 text-sm"
              />
              <button className="shrink-0 text-sm text-primary">搜索</button>
            </form>
          </div>
        </div>
      </header>
      <div className="overflow-hidden rounded-xl border bg-card shadow-paper">
        {result.isPending ? (
          <p role="status" className="py-20 text-center text-muted-foreground">
            正在加载收藏歌曲...
          </p>
        ) : result.isError ? (
          <div role="alert" className="py-20 text-center">
            <p>暂时无法加载收藏歌曲</p>
            <button
              onClick={() => void result.refetch()}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-white"
            >
              重新加载
            </button>
          </div>
        ) : (
          <SongTable songs={songs} offset={(page - 1) * size} />
        )}
      </div>
      {!result.isPending && !result.isError && (
        <Pagination
          label={"收藏歌曲分页"}
          total={result.data.total}
          page={page}
          size={size}
          sizes={[10, 20, 30, 50]}
          busy={result.isFetching}
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
