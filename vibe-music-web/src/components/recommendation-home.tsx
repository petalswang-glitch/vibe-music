"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AudioLines,
  ChevronRight,
  LoaderCircle,
  Play,
  RefreshCw,
} from "lucide-react";
import { BannerCarousel } from "@/components/banner-carousel";
import { CoverImage } from "@/components/cover-image";
import { getApi } from "@/lib/api-client";
import { formatDuration } from "@/lib/format-duration";
import { usePlayer } from "@/providers/player-provider";
import type { Banner, Playlist } from "@/types/catalogue";
import type { Song } from "@/types/song";
import { useAuth } from "@/providers/auth-provider";
import { viewerKey } from "@/lib/favorite-cache";

function SectionError({ name, retry }: { name: string; retry: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border bg-card"
    >
      <p className="text-sm text-muted-foreground">暂时无法加载{name}</p>
      <button
        onClick={retry}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-white"
      >
        重新加载{name}
      </button>
    </div>
  );
}

function BannerSection() {
  const result = useQuery({
    queryKey: ["banner", "public"],
    queryFn: ({ signal }) => getApi<Banner[]>("/banner/getBannerList", signal),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  if (result.isPending)
    return (
      <div
        role="status"
        className="flex h-[280px] items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground motion-safe:animate-pulse"
      >
        正在加载轮播图...
      </div>
    );
  if (result.isError)
    return <SectionError name="轮播图" retry={() => void result.refetch()} />;
  return <BannerCarousel banners={result.data} />;
}

function PlaylistSection() {
  const { user, ready } = useAuth();
  const result = useQuery({
    queryKey: ["playlist", "recommended", viewerKey(user?.userId)],
    enabled: ready,
    queryFn: ({ signal }) =>
      getApi<Playlist[]>("/playlist/getRecommendedPlaylists", signal),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  return (
    <section aria-labelledby="recommended-playlists">
      <div className="mb-6 flex items-end justify-between gap-3 border-b pb-4">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold tracking-[.3em] text-primary">
            WEEKLY SELECTION
          </p>
          <h2
            id="recommended-playlists"
            className="font-serif-display text-2xl font-bold tracking-tight"
          >
            今日为你推荐{" "}
            <span className="ml-2 font-sans text-[11px] font-normal tracking-[.2em] text-muted-foreground">
              No.01
            </span>
          </h2>
        </div>
        <Link
          href="/playlist"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          更多
          <ChevronRight size={16} />
        </Link>
      </div>
      {result.isPending ? (
        <div role="status" className="grid grid-cols-3 gap-5 md:grid-cols-5">
          <span className="sr-only">正在加载推荐歌单...</span>
          {[0, 1, 2, 3, 4].map((key) => (
            <div
              key={key}
              aria-hidden="true"
              className="aspect-square rounded-xl border bg-muted motion-safe:animate-pulse"
            />
          ))}
        </div>
      ) : result.isError ? (
        <SectionError name="推荐歌单" retry={() => void result.refetch()} />
      ) : !result.data.length ? (
        <p
          role="status"
          className="py-14 text-center text-sm text-muted-foreground"
        >
          暂无推荐歌单
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-5 md:grid-cols-5">
          {result.data.slice(0, 5).map((playlist) => (
            <Link
              key={playlist.playlistId}
              href={`/playlist/${playlist.playlistId}`}
              className="group min-w-0 overflow-hidden rounded-xl border border-border/60 bg-card shadow-paper transition-transform duration-300 hover:-translate-y-1 hover:shadow-paper-lg motion-reduce:transition-none"
            >
              <div className="relative">
                <CoverImage src={playlist.coverUrl} alt="" />
                <span
                  aria-hidden="true"
                  className="absolute bottom-2.5 right-2.5 rounded-full bg-primary p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  <Play size={18} />
                </span>
              </div>
              <h3 className="line-clamp-2 min-h-[3.75rem] p-3 text-sm font-medium leading-tight">
                {playlist.title}
              </h3>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function SongSection() {
  const { user, ready } = useAuth();
  const playQueue = usePlayer((state) => state.playQueue);
  const currentId = usePlayer(
    (state) => state.queue[state.currentIndex]?.songId,
  );
  const playing = usePlayer((state) => state.isPlaying);
  const result = useQuery({
    queryKey: ["song", "recommended", viewerKey(user?.userId)],
    enabled: ready,
    queryFn: ({ signal }) =>
      getApi<Song[]>("/song/getRecommendedSongs", signal),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  return (
    <section aria-labelledby="recommended-songs" aria-busy={result.isFetching}>
      <div className="mb-6 flex items-end justify-between gap-3 border-b pb-4">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold tracking-[.3em] text-primary">
            FOR YOUR TASTE
          </p>
          <h2
            id="recommended-songs"
            className="font-serif-display text-2xl font-bold tracking-tight"
          >
            相似推荐{" "}
            <span className="ml-2 font-sans text-[11px] font-normal tracking-[.2em] text-muted-foreground">
              No.02
            </span>
          </h2>
        </div>
        <button
          onClick={() => void result.refetch()}
          disabled={result.isFetching}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-primary disabled:opacity-40"
        >
          刷新
          <RefreshCw
            size={16}
            className={
              result.isFetching ? "animate-spin motion-reduce:animate-none" : ""
            }
          />
        </button>
      </div>
      {result.isPending ? (
        <div
          role="status"
          className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground"
        >
          <LoaderCircle
            size={18}
            className="animate-spin motion-reduce:animate-none"
          />
          正在加载推荐歌曲...
        </div>
      ) : result.isError ? (
        <SectionError name="推荐歌曲" retry={() => void result.refetch()} />
      ) : !result.data.length ? (
        <p
          role="status"
          className="py-14 text-center text-sm text-muted-foreground"
        >
          暂无推荐歌曲
        </p>
      ) : (
        <ol className="grid grid-cols-1 gap-x-16 gap-y-1 md:grid-cols-2">
          {result.data.map((song, index) => (
            <li key={song.songId}>
              <button
                aria-label={`播放 ${song.songName}`}
                aria-current={currentId === song.songId ? "true" : undefined}
                onClick={() => playQueue(result.data, song.songId)}
                className={`group grid w-full grid-cols-[1.5rem_3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl p-2 text-left transition-colors ${currentId === song.songId ? "bg-primary/10" : "hover:bg-muted"}`}
              >
                <span className="text-right font-serif-display text-xs tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="relative">
                  <CoverImage src={song.coverUrl} alt="" />
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    <Play size={20} />
                  </span>
                </span>
                <span className="min-w-0">
                  <span
                    className={`flex items-center gap-2 font-medium ${currentId === song.songId ? "text-primary" : ""}`}
                  >
                    <span className="truncate">{song.songName}</span>
                    {currentId === song.songId && (
                      <AudioLines
                        aria-label={playing ? "正在播放" : "已暂停"}
                        size={16}
                        className={`shrink-0 text-primary ${playing ? "animate-pulse motion-reduce:animate-none" : ""}`}
                      />
                    )}
                  </span>
                  <span className="mt-1 block truncate text-sm text-muted-foreground">
                    {song.artistName ?? "未知歌手"}
                  </span>
                </span>
                <span className="pr-1 text-right text-sm tabular-nums text-muted-foreground">
                  {formatDuration(song.duration)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function RecommendationHome() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-12">
      <h1 className="sr-only">推荐</h1>
      <BannerSection />
      <PlaylistSection />
      <SongSection />
    </div>
  );
}
