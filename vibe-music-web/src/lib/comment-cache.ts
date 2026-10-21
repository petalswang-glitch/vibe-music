import type { QueryClient } from "@tanstack/react-query";

export async function refreshComments(
  client: QueryClient,
  kind: "song" | "playlist",
  id: number,
) {
  // Comments are public. Invalidate this target for every viewer, without
  // touching the playback queue or unrelated random recommendations.
  const predicate = (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[0] === kind &&
    query.queryKey[1] === "detail" &&
    query.queryKey[2] === id;
  await client.cancelQueries({ predicate });
  await client.invalidateQueries({ predicate });
}
