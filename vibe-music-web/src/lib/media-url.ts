export function mediaUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "9000") {
      const prefix = "/vibe-music-data/";
      if (!url.pathname.startsWith(prefix) || url.search || url.hash) return null;
      const segments = url.pathname.slice(prefix.length).split("/").map(decodeURIComponent);
      if (segments.some((part) => !part || part === "." || part === ".." || /[\\/\u0000-\u001f]/.test(part))) return null;
      return `/media/${segments.map(encodeURIComponent).join("/")}`;
    }
    return value;
  } catch {
    return null;
  }
}
