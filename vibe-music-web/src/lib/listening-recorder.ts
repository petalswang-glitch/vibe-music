type ListeningContext = { songId: number; token: string; revision: number } | null;
type ListeningAudio = Pick<HTMLAudioElement,
  "currentTime" | "duration" | "paused" | "addEventListener" | "removeEventListener"
>;

// Record elapsed playback, not seeks or simply clicking the play button.
export function createListeningRecorder(
  audio: ListeningAudio,
  context: () => ListeningContext,
  record: (songId: number, token: string) => Promise<void>,
) {
  let key = "";
  let elapsed = 0;
  let position = audio.currentTime;
  let submitted = false;
  let seeking = false;
  let disposed = false;
  let retryAfter = 0;
  function resetPosition() { position = audio.currentTime; }
  function seek() { seeking = true; resetPosition(); }
  function seeked() { seeking = false; resetPosition(); }
  function progress() {
    const owner = context();
    const nextKey = owner ? `${owner.token}:${owner.songId}:${owner.revision}` : "";
    if (key !== nextKey) {
      key = nextKey; elapsed = 0; submitted = false; retryAfter = 0; resetPosition();
    }
    const delta = audio.currentTime - position;
    resetPosition();
    if (!owner || seeking || audio.paused || delta <= 0 || delta > 5) return;
    elapsed += delta;
    const threshold = Number.isFinite(audio.duration) && audio.duration > 0
      ? Math.max(1, Math.min(30, audio.duration * 0.8)) : 30;
    if (!submitted && elapsed >= threshold && Date.now() >= retryAfter) {
      submitted = true;
      const submittedKey = key;
      void record(owner.songId, owner.token).catch(() => {
        // Retry on a later progress event without attributing it to another owner.
        if (!disposed && submittedKey === key) {
          submitted = false;
          retryAfter = Date.now() + 60_000;
        }
      });
    }
  }
  const events: [string, EventListener][] = [
    ["timeupdate", progress], ["playing", resetPosition], ["pause", resetPosition],
    ["seeking", seek], ["seeked", seeked],
  ];
  for (const [name, listener] of events) audio.addEventListener(name, listener);
  return () => {
    disposed = true;
    for (const [name, listener] of events) audio.removeEventListener(name, listener);
  };
}
