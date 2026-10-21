export function formatDuration(value: string | null): string {
  const seconds = Number(value ?? 0);
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const parts = [Math.floor((wholeSeconds % 3600) / 60), wholeSeconds % 60];
  if (hours > 0) parts.unshift(hours);
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}
