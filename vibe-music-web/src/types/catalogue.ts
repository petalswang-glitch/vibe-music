import type { Song } from "./song";

export type Page<T> = { total: number; items: T[] | null };
export type Artist = {
  artistId: number;
  artistName: string;
  avatar: string | null;
};
export type Playlist = {
  playlistId: number;
  title: string;
  coverUrl: string | null;
};
export type Banner = { bannerId: number; bannerUrl: string };
export type Comment = {
  commentId: number;
  username: string | null;
  userAvatar: string | null;
  content: string;
  createTime: string;
  likeCount: number | null;
};
export type ArtistDetail = Artist & {
  gender: number | null;
  birth: string | null;
  area: string | null;
  introduction: string | null;
  songs: Song[];
};
export type PlaylistDetail = Playlist & {
  introduction: string | null;
  songs: Song[];
  likeStatus: number;
  comments: Comment[];
};
