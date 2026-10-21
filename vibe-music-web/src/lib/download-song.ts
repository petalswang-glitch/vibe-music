import { getBrowserToken } from "./api-client.ts";
import type { Song } from "../types/song.ts";

export function downloadFilename(song: Song): string {
  const extension = song.audioUrl?.split(/[?#]/)[0].match(/\.(mp3|flac|wav|ogg|m4a|aac)$/i)?.[1] ?? "mp3";
  const name = `${song.songName} - ${song.artistName ?? "未知歌手"}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return `${name}.${extension}`;
}

export async function downloadSong(song: Song): Promise<void> {
  const token = getBrowserToken();
  if (!token) throw new Error("请登录后下载歌曲");
  if (!song.audioUrl) throw new Error("音频资源不可用");
  const response = await fetch(`/api/song/${song.songId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401) {
    if (typeof window !== "undefined" && getBrowserToken() === token) {
      window.dispatchEvent(new Event("vibe-auth-expired"));
    }
    throw new Error("登录已失效，请重新登录");
  }
  if (!response.ok || !(response.headers.get("content-type") ?? "").toLowerCase().startsWith("audio/")) {
    throw new Error("音频资源不可用，无法下载");
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = downloadFilename(song);
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    // Allow the browser to consume the object URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }
}
