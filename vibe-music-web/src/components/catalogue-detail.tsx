"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Play } from "lucide-react";
import { useState } from "react";

import { CoverImage } from "@/components/cover-image";
import { getApi } from "@/lib/api-client";
import { SongTable } from "@/components/song-table";
import type { ArtistDetail, PlaylistDetail } from "@/types/catalogue";
import type { Song } from "@/types/song";
import { usePlayer } from "@/providers/player-provider";
import { useAuth } from "@/providers/auth-provider";
import { viewerKey } from "@/lib/favorite-cache";
import { FavoriteButton } from "@/components/favorite-button";
import { CommunityComments } from "@/components/community-comments";

export function DetailSongs({ songs }: { songs: Song[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-paper">
      <SongTable songs={songs} />
    </div>
  );
}

export function CatalogueDetail({
  kind,
  id,
}: {
  kind: "artist" | "playlist";
  id: number;
}) {
  const { user, ready } = useAuth();
  const playQueue = usePlayer((state) => state.playQueue);
  const [tab, setTab] = useState<"songs" | "comments">("songs");
  const result = useQuery({
    queryKey: [kind, "detail", id, viewerKey(user?.userId)],
    enabled: ready,
    queryFn: ({ signal }) =>
      getApi<ArtistDetail | PlaylistDetail | null>(
        kind === "artist"
          ? `/artist/getArtistDetail/${id}`
          : `/playlist/getPlaylistDetail/${id}`,
        signal,
      ),
  });
  if (result.isPending)
    return (
      <div
        role="status"
        className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground"
      >
        <LoaderCircle size={20} className="animate-spin" />
        正在加载...
      </div>
    );
  if (result.isError)
    return (
      <div
        role="alert"
        className="flex min-h-64 flex-col items-center justify-center gap-4"
      >
        <p>暂时无法加载详情</p>
        <button
          onClick={() => void result.refetch()}
          className="rounded-lg bg-primary px-5 py-2 text-sm text-white"
        >
          重新加载
        </button>
      </div>
    );
  const info = result.data;
  if (!info)
    return (
      <p className="py-20 text-center text-muted-foreground">未找到相关内容</p>
    );
  const artist = "artistId" in info;
  const name = artist ? info.artistName : info.title;
  const comments = artist
    ? []
    : [...info.comments].sort(
        (left, right) => right.commentId - left.commentId,
      );

  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-9 flex flex-col items-center gap-8 sm:flex-row sm:items-start">
        <div className="w-48 shrink-0">
          <CoverImage
            src={artist ? info.avatar : info.coverUrl}
            alt={name}
            round={artist}
          />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h1 className="font-serif-display text-3xl font-semibold">{name}</h1>
          {artist && (
            <p className="mt-3 text-sm text-muted-foreground">
              {info.area ?? "未知地区"}
              {info.birth ? ` · ${info.birth}` : ""}
            </p>
          )}
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
            {info.introduction || "暂无简介"}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            {info.songs.length} 首歌曲
          </p>
          {!artist && (
            <button
              disabled={!info.songs.length}
              onClick={() => playQueue(info.songs)}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm text-white disabled:opacity-30"
            >
              <Play size={16} />
              播放全部
            </button>
          )}
          {!artist && (
            <FavoriteButton
              kind="playlist"
              id={info.playlistId}
              name={info.title}
              likeStatus={info.likeStatus}
            />
          )}
        </div>
      </header>
      {artist ? (
        <h2 className="mb-5 text-xl font-semibold">歌曲</h2>
      ) : (
        <div
          role="tablist"
          aria-label="歌单内容"
          className="mb-5 flex gap-6 border-b"
        >
          <button
            id="playlist-songs-tab"
            role="tab"
            aria-selected={tab === "songs"}
            aria-controls="playlist-songs-panel"
            onClick={() => setTab("songs")}
            className={`border-b-2 py-3 text-sm ${tab === "songs" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            歌曲列表
          </button>
          <button
            id="playlist-comments-tab"
            role="tab"
            aria-selected={tab === "comments"}
            aria-controls="playlist-comments-panel"
            onClick={() => setTab("comments")}
            className={`border-b-2 py-3 text-sm ${tab === "comments" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            评论（{comments.length}）
          </button>
        </div>
      )}
      {(artist || tab === "songs") && (
        <div
          id="playlist-songs-panel"
          role={artist ? undefined : "tabpanel"}
          aria-labelledby={artist ? undefined : "playlist-songs-tab"}
        >
          <DetailSongs songs={info.songs} />
        </div>
      )}
      {!artist && tab === "comments" && (
        <div
          id="playlist-comments-panel"
          role="tabpanel"
          aria-labelledby="playlist-comments-tab"
          className="rounded-xl border bg-card px-5 py-5"
        >
          <CommunityComments
            key={`playlist-${id}-${user?.userId ?? "anonymous"}`}
            kind="playlist"
            id={id}
            comments={comments}
            heading={false}
          />
        </div>
      )}
    </section>
  );
}
