"use client";

import { useState } from "react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Heart, LoaderCircle } from "lucide-react";
import { AuthDialog } from "@/components/auth-dialog";
import { apiClient, getApi, getBrowserSessionRevision } from "@/lib/api-client";
import {
  synchronizeFavorite,
  viewerKey,
  type FavoriteKind,
} from "@/lib/favorite-cache";
import { authError, useAuth } from "@/providers/auth-provider";
import { usePlayer } from "@/providers/player-provider";
import type { Song } from "@/types/song";

export function FavoriteButton({
  kind = "song",
  id,
  name,
  likeStatus,
  disabled = false,
}: {
  kind?: FavoriteKind;
  id: number;
  name: string;
  likeStatus: number | null | undefined;
  disabled?: boolean;
}) {
  const { user, ready } = useAuth();
  const queryClient = useQueryClient();
  const setSongLike = usePlayer((state) => state.setSongLike);
  const [authOpen, setAuthOpen] = useState(false);
  const key = ["favorite", "mutation", kind, id, user?.userId];
  const pending = useIsMutating({ mutationKey: key }) > 0;
  const liked = Boolean(user && likeStatus === 1);
  const mutation = useMutation({
    mutationKey: key,
    mutationFn: async () => {
      const owner = user!.userId;
      const revision = getBrowserSessionRevision();
      const action = liked ? "cancelCollect" : "collect";
      const target = kind === "song" ? "Song" : "Playlist";
      const url = `/favorite/${action}${target}?${kind}Id=${id}`;
      const { data } = liked
        ? await apiClient.delete(url)
        : await apiClient.post(url);
      if (data.code !== 0) throw new Error(data.message);
      return { owner, value: !liked, revision };
    },
    onSuccess: async ({ owner, value, revision }) => {
      await synchronizeFavorite(queryClient, {
        owner,
        kind,
        id,
        liked: value,
        isCurrent: () => getBrowserSessionRevision() === revision,
        applyQueue: () => {
          if (kind === "song") setSongLike(id, value);
        },
      });
    },
  });
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        disabled={disabled || !ready || pending}
        aria-label={`${liked ? "取消收藏" : "收藏"} ${name}`}
        aria-pressed={liked}
        title={liked ? "取消收藏" : "收藏"}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={() => {
          if (!user) setAuthOpen(true);
          else mutation.mutate();
        }}
        className={`rounded-lg p-2 hover:bg-muted disabled:opacity-40 ${liked ? "text-primary" : "text-muted-foreground"}`}
      >
        {pending ? (
          <LoaderCircle size={18} className="animate-spin" />
        ) : (
          <Heart size={18} fill={liked ? "currentColor" : "none"} />
        )}
      </button>
      {mutation.isError && (
        <span
          role="alert"
          className="absolute bottom-full right-0 z-40 mb-2 w-48 rounded-lg border bg-popover p-3 text-xs text-destructive shadow-paper"
        >
          {authError(mutation.error, "收藏操作失败，请重试")}
        </span>
      )}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
    </span>
  );
}

export function PlayerFavorite({ song }: { song: Song }) {
  const { user, ready } = useAuth();
  const detail = useQuery({
    queryKey: ["song", "detail", song.songId, viewerKey(user?.userId)],
    queryFn: ({ signal }) =>
      getApi<Song | null>(`/song/getSongDetail/${song.songId}`, signal),
    enabled: ready && Boolean(user),
  });
  return (
    <FavoriteButton
      id={song.songId}
      name={song.songName}
      likeStatus={detail.data?.likeStatus}
      disabled={Boolean(user) && (detail.isPending || detail.isError)}
    />
  );
}
