export type ManagedSong = {
  songId: number;
  songName: string;
  artistName: string | null;
  album: string;
  lyric: string | null;
  duration: string | null;
  style: string | null;
  coverUrl: string | null;
  audioUrl: string | null;
  releaseTime: string;
};
export type ArtistOption = { artistId: number; artistName: string };
export type SongValues = {
  songName: string;
  album: string;
  releaseTime: string;
  styles: string[];
};
export const songStyles = [
  "节奏布鲁斯",
  "欧美流行",
  "华语流行",
  "粤语流行",
  "国风流行",
  "韩国流行",
  "日本流行",
  "嘻哈说唱",
  "非洲节拍",
  "原声带",
  "轻音乐",
  "摇滚",
  "朋克",
  "电子",
  "国风",
  "乡村",
  "古典",
];
export function songPayload(
  values: SongValues,
  artistId: number | null,
  songId?: number,
) {
  return {
    songName: values.songName,
    album: values.album,
    releaseTime: values.releaseTime,
    style: values.styles.join(","),
    ...(songId === undefined ? { artistId } : { songId }),
  };
}
export function audioDuration(seconds: number): string | null {
  return Number.isFinite(seconds) &&
    seconds > 0 &&
    seconds.toFixed(2).length <= 10
    ? seconds.toFixed(2)
    : null;
}
