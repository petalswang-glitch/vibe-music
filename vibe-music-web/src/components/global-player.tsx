"use client";

import { QueueTracks } from "@/components/queue-tracks";

import { useEffect, useRef, useState } from "react";
import {
  Disc3,
  ListMusic,
  LoaderCircle,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { CoverImage } from "@/components/cover-image";
import { formatDuration } from "@/lib/format-duration";
import { modeLabels } from "@/lib/player-store";
import { usePlayer } from "@/providers/player-provider";
import { PlayerDetail } from "@/components/player-detail";
import { PlayerFavorite } from "@/components/favorite-button";

export function GlobalPlayer({
  isDark,
  onToggleTheme,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const state = usePlayer((value) => value);
  const [queueOpen, setQueueOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const queueRef = useRef<HTMLElement>(null);
  const queueButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!queueOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !queueRef.current?.contains(event.target) &&
        !queueButtonRef.current?.contains(event.target)
      )
        setQueueOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQueueOpen(false);
        queueButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [queueOpen]);
  const song = state.queue[state.currentIndex];
  const ModeIcon =
    state.mode === "shuffle"
      ? Shuffle
      : state.mode === "single"
        ? Repeat1
        : state.mode === "loop"
          ? Repeat
          : ListMusic;
  const time = formatDuration(String(state.currentTime));
  const total = formatDuration(String(state.duration));

  return (
    <footer className="sticky bottom-0 z-30 shrink-0 border-t bg-background/95 shadow-player backdrop-blur-md">
      {state.error && (
        <p
          role="alert"
          className="border-b px-5 py-2 text-center text-sm text-destructive"
        >
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 md:px-7">
        <button
          type="button"
          aria-label="打开歌曲详情"
          disabled={!song}
          onClick={() => {
            setQueueOpen(false);
            setDetailOpen(true);
          }}
          className="flex w-40 min-w-0 items-center gap-3 rounded-lg text-left disabled:cursor-default lg:w-56"
        >
          <div className="w-11 shrink-0">
            {song ? (
              <CoverImage src={song.coverUrl} alt="" round />
            ) : (
              <Disc3 size={32} className="text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {song?.songName ?? "暂无播放歌曲"}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {song?.artistName ?? ""}
            </p>
          </div>
        </button>
        {song && <PlayerFavorite key={song.songId} song={song} />}
        <div className="flex items-center gap-1">
          <button
            aria-label="上一首"
            disabled={!song}
            onClick={() => state.advance(-1)}
            className="rounded-full p-2 hover:bg-muted disabled:opacity-30"
          >
            <SkipBack size={19} />
          </button>
          <button
            aria-label={state.wantsToPlay ? "暂停" : "播放"}
            disabled={!song}
            onClick={state.toggle}
            className="rounded-full bg-primary p-2.5 text-white disabled:opacity-30"
          >
            {state.isLoading ? (
              <LoaderCircle size={23} className="animate-spin" />
            ) : state.wantsToPlay ? (
              <Pause size={23} />
            ) : (
              <Play size={23} />
            )}
          </button>
          <button
            aria-label="下一首"
            disabled={!song}
            onClick={() => state.advance(1)}
            className="rounded-full p-2 hover:bg-muted disabled:opacity-30"
          >
            <SkipForward size={19} />
          </button>
        </div>
        <div className="order-last flex w-full items-center gap-3 md:order-none md:min-w-20 md:flex-1">
          <input
            type="range"
            aria-label="播放进度"
            aria-valuetext={`${time} / ${total}`}
            min={0}
            max={state.duration || 0}
            step={0.1}
            value={Math.min(state.currentTime, state.duration)}
            disabled={!song || !state.duration}
            onChange={(event) => state.seek(Number(event.target.value))}
            className="min-w-0 flex-1 accent-primary"
          />
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {time} / {total}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            aria-label={`播放模式：${modeLabels[state.mode]}，点击切换`}
            title={modeLabels[state.mode]}
            onClick={state.cycleMode}
            className="rounded-full p-2 hover:bg-muted"
          >
            <ModeIcon size={19} />
          </button>
          <button
            aria-label={state.volume === 0 ? "取消静音" : "静音"}
            onClick={state.toggleMute}
            className="rounded-full p-2 hover:bg-muted"
          >
            {state.volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          <input
            type="range"
            aria-label="音量"
            min={0}
            max={100}
            value={state.volume}
            onChange={(event) => state.setVolume(Number(event.target.value))}
            className="w-16 accent-primary sm:w-20"
          />
          <button
            ref={queueButtonRef}
            aria-label="播放队列"
            aria-expanded={queueOpen}
            aria-controls="player-queue"
            onClick={() => setQueueOpen((value) => !value)}
            className="rounded-full p-2 hover:bg-muted"
          >
            <ListMusic size={20} />
          </button>
        </div>
      </div>
      {queueOpen && (
        <section
          ref={queueRef}
          id="player-queue"
          aria-label="播放队列"
          className="absolute bottom-full right-3 mb-3 w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border bg-popover p-4 shadow-paper"
        >
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              播放列表 · {state.queue.length} 首
            </h2>
            <div className="flex gap-1">
              <button
                aria-label="清空播放队列"
                disabled={!state.queue.length}
                onClick={state.clear}
                className="rounded-lg p-2 hover:bg-muted disabled:opacity-30"
              >
                <Trash2 size={16} />
              </button>
              <button
                aria-label="关闭播放队列"
                onClick={() => setQueueOpen(false)}
                className="rounded-lg p-2 hover:bg-muted"
              >
                <X size={17} />
              </button>
            </div>
          </header>
          <QueueTracks />
        </section>
      )}
      {detailOpen && (
        <PlayerDetail
          onClose={() => setDetailOpen(false)}
          isDark={isDark}
          onToggleTheme={onToggleTheme}
        />
      )}
    </footer>
  );
}
