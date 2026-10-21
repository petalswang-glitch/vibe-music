"use client";

import { useState } from "react";
import { Disc3, Download, Play } from "lucide-react";
import { formatDuration } from "@/lib/format-duration";
import { downloadSong } from "@/lib/download-song";
import { usePlayer } from "@/providers/player-provider";
import type { Song } from "@/types/song";
import { FavoriteButton } from "@/components/favorite-button";

export function SongTable({
  songs,
  offset = 0,
}: {
  songs: Song[];
  offset?: number;
}) {
  const playQueue = usePlayer((state) => state.playQueue);
  const currentId = usePlayer(
    (state) => state.queue[state.currentIndex]?.songId,
  );
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  async function download(song: Song) {
    setDownloadError(null);
    setDownloading(song.songId);
    try {
      await downloadSong(song);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "下载失败");
    } finally {
      setDownloading(null);
    }
  }
  if (!songs.length)
    return (
      <p className="py-14 text-center text-sm text-muted-foreground">
        暂无歌曲
      </p>
    );
  return (
    <>
      {downloadError && (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {downloadError}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-14 px-5 py-4">#</th>
              <th className="px-4 py-4">歌曲</th>
              <th className="px-4 py-4">歌手</th>
              <th className="px-4 py-4">专辑</th>
              <th className="px-4 py-4 text-right">时长</th>
              <th className="relative px-4 py-4">
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {songs.map((song, index) => (
              <tr
                key={song.songId}
                aria-current={currentId === song.songId ? "true" : undefined}
                onClick={(event) => {
                  if (
                    event.target instanceof Element &&
                    event.target.closest("button, a, input, select, textarea, dialog, [role='dialog']")
                  )
                    return;
                  playQueue(songs, song.songId);
                }}
                className={`border-b last:border-0 hover:bg-muted/40 ${currentId === song.songId ? "bg-primary/5" : ""}`}
              >
                <td className="px-5 py-4 text-muted-foreground">
                  {offset + index + 1}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <button
                      aria-label={`播放 ${song.songName}`}
                      onClick={() => playQueue(songs, song.songId)}
                      className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"
                    >
                      <Disc3
                        aria-hidden="true"
                        size={22}
                        className="group-hover:hidden"
                      />
                      <Play
                        aria-hidden="true"
                        size={20}
                        className="hidden group-hover:block"
                      />
                    </button>
                    <span
                      className={`font-medium ${currentId === song.songId ? "text-primary" : ""}`}
                    >
                      {song.songName}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-muted-foreground">
                  {song.artistName ?? "未知歌手"}
                </td>
                <td className="px-4 py-4 text-muted-foreground">
                  {song.album}
                </td>
                <td className="px-4 py-4 text-right tabular-nums text-muted-foreground">
                  {formatDuration(song.duration)}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center">
                    <FavoriteButton
                      id={song.songId}
                      name={song.songName}
                      likeStatus={song.likeStatus}
                    />
                    <button
                      aria-label={`下载 ${song.songName}`}
                      title={!song.audioUrl ? "音频资源不可用" : "下载歌曲"}
                      disabled={!song.audioUrl || downloading !== null}
                      onDoubleClick={(event) => event.stopPropagation()}
                      onClick={() => void download(song)}
                      className="rounded-lg p-2 hover:bg-muted disabled:opacity-30"
                    >
                      <Download size={17} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
