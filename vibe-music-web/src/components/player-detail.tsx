"use client";

import { QueueTracks } from "@/components/queue-tracks";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Clock3,
  LoaderCircle,
  Moon,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sun,
} from "lucide-react";
import { CoverImage } from "@/components/cover-image";
import { getApi } from "@/lib/api-client";
import { formatDuration } from "@/lib/format-duration";
import { modeLabels } from "@/lib/player-store";
import { usePlayer } from "@/providers/player-provider";
import type { Comment } from "@/types/catalogue";
import type { Song } from "@/types/song";
import { useAuth } from "@/providers/auth-provider";
import { viewerKey } from "@/lib/favorite-cache";
import { FavoriteButton } from "@/components/favorite-button";
import { CommunityComments } from "@/components/community-comments";

type SongDetail = Song & { lyric: string | null; comments: Comment[] };
const clockFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function PlayerDetail({
  onClose,
  isDark,
  onToggleTheme,
}: {
  onClose: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const state = usePlayer((value) => value);
  const { user, ready } = useAuth();
  const song = state.queue[state.currentIndex];
  const dialog = useRef<HTMLDialogElement>(null);
  const [clock, setClock] = useState(() => clockFormat.format(new Date()));
  const detail = useQuery({
    queryKey: ["song", "detail", song?.songId, viewerKey(user?.userId)],
    queryFn: ({ signal }) =>
      getApi<SongDetail | null>(`/song/getSongDetail/${song!.songId}`, signal),
    enabled: ready && Boolean(song),
  });
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    const timer = setInterval(
      () => setClock(clockFormat.format(new Date())),
      1000,
    );
    return () => {
      clearInterval(timer);
      element?.close();
    };
  }, []);
  const comments = [...(detail.data?.comments ?? [])].sort(
    (left, right) => right.commentId - left.commentId,
  );

  return (
    <dialog
      ref={dialog}
      aria-labelledby="player-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-background p-0 text-foreground"
    >
      <header className="flex items-center justify-between border-b px-5 py-4">
        <button
          autoFocus
          aria-label="收起歌曲详情"
          onClick={onClose}
          className="rounded-full p-2 hover:bg-muted"
        >
          <ChevronDown size={23} />
        </button>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock3 size={15} aria-hidden="true" />
          {clock}
        </span>
        <button
          aria-label={isDark ? "切换浅色模式" : "切换深色模式"}
          onClick={onToggleTheme}
          className="rounded-full p-2 hover:bg-muted"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>
      <div className="mx-auto grid min-h-[75vh] max-w-7xl items-start gap-10 px-6 py-10 md:grid-cols-2 md:px-10 md:py-14">
        <section className="flex flex-col items-center text-center">
          <div
            className={`w-48 sm:w-64 ${state.isPlaying ? "animate-spin-slow" : ""}`}
          >
            <CoverImage
              src={detail.data?.coverUrl ?? song?.coverUrl ?? null}
              alt=""
              round
            />
          </div>
          <h1 id="player-detail-title" className="mt-8 text-3xl font-semibold">
            {detail.data?.songName ?? song?.songName ?? "暂无播放歌曲"}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {detail.data?.artistName ?? song?.artistName ?? ""}
          </p>
          <div className="mt-8 flex w-full max-w-md items-center gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatDuration(String(state.currentTime))}
            </span>
            <input
              type="range"
              aria-label="详情播放进度"
              min={0}
              max={state.duration || 0}
              step={0.1}
              value={Math.min(state.currentTime, state.duration)}
              disabled={!song || !state.duration}
              onChange={(event) => state.seek(Number(event.target.value))}
              className="min-w-0 flex-1 accent-primary"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatDuration(String(state.duration))}
            </span>
          </div>
          <div className="mt-7 flex items-center gap-6">
            <button
              aria-label="上一首"
              disabled={!song}
              onClick={() => state.advance(-1)}
              className="rounded-full p-3 hover:bg-muted disabled:opacity-30"
            >
              <SkipBack size={25} />
            </button>
            <button
              aria-label={state.wantsToPlay ? "暂停" : "播放"}
              disabled={!song}
              onClick={state.toggle}
              className="rounded-full bg-primary p-4 text-white disabled:opacity-30"
            >
              {state.isLoading ? (
                <LoaderCircle className="animate-spin" size={30} />
              ) : state.wantsToPlay ? (
                <Pause size={30} />
              ) : (
                <Play size={30} />
              )}
            </button>
            <button
              aria-label="下一首"
              disabled={!song}
              onClick={() => state.advance(1)}
              className="rounded-full p-3 hover:bg-muted disabled:opacity-30"
            >
              <SkipForward size={25} />
            </button>
          </div>
          <button
            onClick={state.cycleMode}
            className="mt-5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            {modeLabels[state.mode]}
          </button>
          {song && (
            <FavoriteButton
              id={song.songId}
              name={song.songName}
              likeStatus={detail.data?.likeStatus}
              disabled={Boolean(user) && (detail.isPending || detail.isError)}
            />
          )}
          <section
            aria-label="详情播放队列"
            className="mt-8 w-full max-w-md rounded-xl border p-4 text-left"
          >
            <header className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">
                播放列表 · {state.queue.length} 首
              </h2>
              <button
                disabled={!state.queue.length}
                onClick={state.clear}
                className="rounded-lg px-3 py-2 text-sm hover:bg-muted disabled:opacity-30"
              >
                清空播放队列
              </button>
            </header>
            <QueueTracks />
          </section>
          {state.error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {state.error}
            </p>
          )}
        </section>
        <section aria-label="歌曲评论" className="min-w-0">
          {detail.isPending && song ? (
            <p
              role="status"
              className="py-10 text-center text-sm text-muted-foreground"
            >
              正在加载歌曲信息...
            </p>
          ) : detail.isError ? (
            <div role="alert" className="py-10 text-center">
              <p>暂时无法加载歌曲信息</p>
              <button
                onClick={() => void detail.refetch()}
                className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-white"
              >
                重新加载
              </button>
            </div>
          ) : detail.data && song ? (
            <CommunityComments
              key={`song-${song.songId}-${user?.userId ?? "anonymous"}`}
              kind="song"
              id={song.songId}
              comments={comments}
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              暂无歌曲信息
            </p>
          )}
        </section>
      </div>
    </dialog>
  );
}
