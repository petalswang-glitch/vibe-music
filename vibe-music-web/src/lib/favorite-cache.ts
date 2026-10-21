import type { QueryClient } from "@tanstack/react-query";

export type FavoriteKind = "song" | "playlist";

export function viewerKey(userId: number | null | undefined) {
  return { viewer: userId ?? null };
}

export function belongsToViewer(key: readonly unknown[], userId: number) {
  return key.some(
    (value) =>
      value !== null &&
      typeof value === "object" &&
      "viewer" in value &&
      value.viewer === userId,
  );
}

// Update every occurrence of a typed song/playlist in a JSON query result.
// Preserve unrelated rows and avoid song/playlist numeric ID collisions.
export function patchFavorite(
  data: unknown,
  kind: FavoriteKind,
  id: number,
  liked: boolean,
): unknown {
  if (Array.isArray(data)) {
    const next = data.map((value) => patchFavorite(value, kind, id, liked));
    return next.some((value, index) => value !== data[index]) ? next : data;
  }
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  let next = record;
  for (const [key, value] of Object.entries(record)) {
    const patched = patchFavorite(value, kind, id, liked);
    if (patched !== value) {
      if (next === record) next = { ...record };
      next[key] = patched;
    }
  }
  if (
    record[kind === "song" ? "songId" : "playlistId"] === id &&
    "likeStatus" in record &&
    record.likeStatus !== Number(liked)
  ) {
    next = { ...next, likeStatus: Number(liked) };
  }
  return next;
}

export async function synchronizeFavorite(
  client: QueryClient,
  options: {
    owner: number;
    kind: FavoriteKind;
    id: number;
    liked: boolean;
    isCurrent: () => boolean;
    applyQueue: () => void;
  },
) {
  if (!options.isCurrent()) return;
  const predicate = (query: { queryKey: readonly unknown[] }) =>
    belongsToViewer(query.queryKey, options.owner);
  const interrupted = new Set(
    client
      .getQueryCache()
      .findAll({ predicate })
      .filter((query) => query.state.fetchStatus === "fetching")
      .map((query) => query.queryHash),
  );
  await client.cancelQueries({ predicate });
  if (!options.isCurrent()) return;
  client.setQueriesData({ predicate }, (data) =>
    patchFavorite(data, options.kind, options.id, options.liked),
  );
  options.applyQueue();
  // A cancelled initial detail request has no cached result to patch. Restart
  // every interrupted query as well as favorites, or it stays pending/idle.
  // Preferences also change recommendations, while the playing queue stays intact.
  await client.invalidateQueries({
    predicate: (query) =>
      predicate(query) &&
      (query.queryKey[0] === "favorite" ||
        (query.queryKey[0] === options.kind && query.queryKey[1] === "recommended") ||
        interrupted.has(query.queryHash)),
  });
}
