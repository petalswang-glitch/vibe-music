import { mediaUrl } from "./media-url.ts";
import type { PlayerState, PlayerStore } from "./player-store.ts";

export type AudioPort = Pick<HTMLAudioElement,
  "src" | "volume" | "currentTime" | "duration" | "currentSrc" | "error" | "paused"
  | "play" | "pause" | "load" | "removeAttribute" | "addEventListener" | "removeEventListener"
>;

export function createAudioController(store: PlayerStore, audio: AudioPort) {
  let disposed = false;
  let applying = false;
  let playVersion = 0;
  const events: [string, EventListener][] = [];

  function update(patch: Partial<PlayerState>) {
    const previous = applying;
    applying = true;
    store.setState(patch);
    applying = previous;
  }
  function unavailable(message = "音频资源不可用，请尝试其他歌曲") {
    playVersion++;
    update({ wantsToPlay: false, isPlaying: false, isLoading: false, error: message });
    audio.pause();
  }
  function play() {
    const version = ++playVersion;
    const song = store.getState().queue[store.getState().currentIndex];
    if (!song || !mediaUrl(song.audioUrl)) { unavailable(); return; }
    update({ isLoading: true });
    try {
      if (audio.error) { audio.load(); update({ currentTime: 0 }); }
      void audio.play().catch((error: unknown) => {
        if (disposed || version !== playVersion) return;
        const denied = error instanceof Error && error.name === "NotAllowedError";
        unavailable(denied ? "浏览器已暂停播放，请点击播放重试" : undefined);
      });
    } catch {
      if (!disposed && version === playVersion) unavailable();
    }
  }
  function load() {
    playVersion++;
    const state = store.getState();
    const song = state.queue[state.currentIndex];
    audio.pause();
    const url = song ? mediaUrl(song.audioUrl) : null;
    if (!url) {
      audio.removeAttribute("src");
      audio.load();
      if (song && state.wantsToPlay) unavailable();
      return;
    }
    audio.src = url;
    audio.load();
    if (state.wantsToPlay) play();
  }

  const unsubscribe = store.subscribe((state, previous) => {
    if (disposed || applying) return;
    applying = true;
    try {
      if (state.volume !== previous.volume) audio.volume = state.volume / 100;
      if (state.loadRevision !== previous.loadRevision) {
        load();
      } else if (state.wantsToPlay !== previous.wantsToPlay) {
        if (state.wantsToPlay) play();
        else { playVersion++; audio.pause(); update({ isPlaying: false, isLoading: false }); }
      }
      if (state.seekRevision !== previous.seekRevision) {
        try { audio.currentTime = state.seekTarget; } catch { unavailable("暂时无法调整播放进度"); }
      }
    } finally {
      applying = false;
    }
  });

  function listen(name: string, listener: EventListener) {
    events.push([name, listener]);
    audio.addEventListener(name, listener);
  }
  listen("playing", () => {
    if (!store.getState().wantsToPlay) { audio.pause(); return; }
    update({ isPlaying: true, isLoading: false, error: null });
  });
  listen("pause", () => {
    if (!audio.paused) return; // A queued pause from an old load must not cancel new playback.
    if (applying) update({ isPlaying: false });
    else {
      playVersion++;
      update({ isPlaying: false, wantsToPlay: false, isLoading: false });
    }
  });
  listen("waiting", () => { if (store.getState().wantsToPlay) update({ isLoading: true }); });
  listen("timeupdate", () => {
    if (Number.isFinite(audio.currentTime)) update({ currentTime: Math.max(0, audio.currentTime) });
  });
  listen("loadedmetadata", () => {
    if (Number.isFinite(audio.duration) && audio.duration >= 0) update({ duration: audio.duration });
  });
  listen("ended", () => { store.getState().advance(1); });
  listen("error", () => {
    if (store.getState().currentIndex < 0) return;
    // Ignore an event still associated with a superseded resource.
    if (audio.currentSrc && audio.currentSrc !== audio.src) return;
    playVersion++;
    unavailable();
  });
  audio.volume = store.getState().volume / 100;
  applying = true;
  try { load(); } finally { applying = false; }

  return () => {
    disposed = true;
    playVersion++;
    unsubscribe();
    for (const [name, listener] of events) audio.removeEventListener(name, listener);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    update({ wantsToPlay: false, isPlaying: false, isLoading: false });
  };
}
