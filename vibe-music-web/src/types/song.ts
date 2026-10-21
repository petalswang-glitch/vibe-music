export type Song = {
  songId: number;
  songName: string;
  artistName: string | null;
  album: string;
  duration: string | null;
  coverUrl: string | null;
  audioUrl: string | null;
  likeStatus: number | null;
  releaseTime: string;
};

export type SongPage = { total: number; items: Song[] | null };
