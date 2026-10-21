"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { postApi } from "@/lib/api-client";
import { viewerKey } from "@/lib/favorite-cache";
import { useAuth } from "@/providers/auth-provider";
import type { Page, Playlist } from "@/types/catalogue";

export function SidebarFavorites() {
  const { user, ready } = useAuth();
  const result = useQuery({
    queryKey: ["favorite", "playlists", "sidebar", viewerKey(user?.userId)],
    queryFn: ({ signal }) =>
      postApi<Page<Playlist>>(
        "/favorite/getFavoritePlaylists",
        { pageNum: 1, pageSize: 50, title: null, style: null },
        signal,
      ),
    enabled: ready && Boolean(user),
  });
  if (!ready || !user) return null;
  return (
    <section aria-label="收藏的歌单" className="mt-8 border-t pt-5">
      <h2 className="px-4 text-xs text-muted-foreground">
        收藏的歌单（{result.data?.total ?? 0}）
      </h2>
      {result.isError ? (
        <button
          onClick={() => void result.refetch()}
          className="px-4 py-3 text-sm text-primary"
        >
          加载失败，重试
        </button>
      ) : result.isPending ? (
        <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
          正在加载...
        </p>
      ) : (
        <ul className="mt-2 max-h-96 overflow-y-auto">
          {result.data.items?.map((playlist) => (
            <li key={playlist.playlistId}>
              <Link
                href={`/playlist/${playlist.playlistId}`}
                className="block truncate rounded-lg px-4 py-3 text-sm hover:bg-muted"
                title={playlist.title}
              >
                {playlist.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
