import type { Song } from "../types/song.ts";

export function parseAgentContent(content: string): {
  text: string;
  songs: Song[];
} {
  const songs: Song[] = [];
  const seen = new Set<number>();
  const text = content
    .replace(/<vibe-songs>([\s\S]*?)<\/vibe-songs>/g, (_tag, body) => {
      try {
        const parsed = JSON.parse(body);
        for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
          if (
            !row ||
            !Number.isSafeInteger(row.songId) ||
            row.songId <= 0 ||
            typeof row.songName !== "string" ||
            seen.has(row.songId) ||
            songs.length >= 5
          )
            continue;
          const nullable = (value: unknown) =>
            typeof value === "string" ? value : null;
          songs.push({
            songId: row.songId,
            songName: row.songName,
            artistName: nullable(row.artistName),
            album: nullable(row.album) ?? "",
            duration: nullable(row.duration),
            coverUrl: nullable(row.coverUrl),
            audioUrl: nullable(row.audioUrl),
            releaseTime: nullable(row.releaseTime) ?? "",
            likeStatus: null,
          });
          seen.add(row.songId);
        }
      } catch {
        /* Invalid model tags cannot become playable cards. */
      }
      return "";
    })
    .replace(/<vibe-songs>[\s\S]*$/, "");
  // Hide an opening tag split across SSE events, rather than flashing JSON markup.
  const opening = "<vibe-songs>";
  const suffix =
    Array.from({ length: opening.length - 1 }, (_, i) => i + 1)
      .reverse()
      .find((n) => text.endsWith(opening.slice(0, n))) ?? 0;
  return { text: (suffix ? text.slice(0, -suffix) : text).trim(), songs };
}

export function conversationStorageKey(viewer: string) {
  return viewer === "guest"
    ? "vibe-agent-conversation-id"
    : `vibe-agent-conversation-id:${viewer}`;
}

export function newConversationId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
}

export function loadConversation(viewer: string): string {
  try {
    const existing = localStorage.getItem(conversationStorageKey(viewer));
    if (existing && /^[a-zA-Z0-9_-]{1,128}$/.test(existing)) return existing;
  } catch {
    /* Persistence is optional. */
  }
  const id = newConversationId();
  saveConversation(viewer, id);
  return id;
}

export function saveConversation(viewer: string, id: string) {
  try {
    localStorage.setItem(conversationStorageKey(viewer), id);
  } catch {
    /* Optional persistence. */
  }
}
