"use client";
import { X } from "lucide-react";
import { usePlayer } from "@/providers/player-provider";
import { formatDuration } from "@/lib/format-duration";

export function QueueTracks() {
  const state = usePlayer((value) => value);
  return (
    <>
      {" "}
      {!state.queue.length ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          暂无播放歌曲
        </p>
      ) : (
        <ol className="max-h-80 space-y-1 overflow-y-auto">
          {state.queue.map((item, index) => (
            <li
              key={item.songId}
              className={`flex items-center gap-2 rounded-lg px-2 ${index === state.currentIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
            >
              <button
                aria-label={`播放 ${item.songName}`}
                onClick={() => state.selectTrack(item.songId)}
                className="min-w-0 flex-1 py-3 text-left"
              >
                <span className="block truncate text-sm">{item.songName}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {item.artistName ?? "未知歌手"}
                </span>
              </button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDuration(item.duration)}
              </span>
              <button
                aria-label={`移除 ${item.songName}`}
                onClick={() => state.removeTrack(item.songId)}
                className="rounded-lg p-2 hover:bg-muted"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
