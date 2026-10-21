import { createStore } from "zustand/vanilla";
import type { Song } from "../types/song.ts";

export type PlayMode = "order" | "shuffle" | "loop" | "single";
export const playModes: PlayMode[] = ["order", "shuffle", "loop", "single"];
export const modeLabels: Record<PlayMode, string> = {
  order: "顺序播放",
  shuffle: "随机播放",
  loop: "列表循环",
  single: "单曲循环",
};

export function trackIndex(
  index: number,
  length: number,
  mode: PlayMode,
  direction: 1 | -1,
  random = Math.random,
): number {
  if (length < 1) return -1;
  if (mode === "single") return Math.max(0, Math.min(index, length - 1));
  if (mode === "shuffle")
    return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
  // Both legacy order and loop modes wrap at the end of the queue.
  return (((index + direction) % length) + length) % length;
}

export type PlayerState = {
  queue: Song[];
  currentIndex: number;
  mode: PlayMode;
  volume: number;
  previousVolume: number;
  currentTime: number;
  duration: number;
  wantsToPlay: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  loadRevision: number;
  seekRevision: number;
  seekTarget: number;
  playSong: (song: Song) => void;
  playQueue: (songs: Song[], selectedId?: number) => void;
  selectTrack: (songId: number) => void;
  removeTrack: (songId: number) => void;
  clear: () => void;
  toggle: () => void;
  advance: (direction: 1 | -1) => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  cycleMode: () => void;
  resetLikes: () => void;
  setSongLike: (id: number, liked: boolean) => void;
};

function durationOf(song?: Song): number {
  const seconds = Number(song?.duration ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function distinct(songs: Song[]): Song[] {
  const seen = new Set<number>();
  return songs.filter((song) => {
    if (seen.has(song.songId)) return false;
    seen.add(song.songId);
    return true;
  });
}

export function createPlayerStore() {
  return createStore<PlayerState>((set, get) => ({
    queue: [],
    currentIndex: -1,
    mode: "order",
    volume: 50,
    previousVolume: 50,
    currentTime: 0,
    duration: 0,
    wantsToPlay: false,
    isPlaying: false,
    isLoading: false,
    error: null,
    loadRevision: 0,
    seekRevision: 0,
    seekTarget: 0,
    playSong(song) {
      const state = get();
      const index = state.queue.findIndex(
        (item) => item.songId === song.songId,
      );
      const queue =
        index < 0
          ? [...state.queue, song]
          : state.queue.map((item) =>
              item.songId === song.songId ? song : item,
            );
      set({
        queue,
        currentIndex: index < 0 ? queue.length - 1 : index,
        currentTime: 0,
        duration: durationOf(song),
        wantsToPlay: true,
        isPlaying: false,
        isLoading: true,
        error: null,
        loadRevision: state.loadRevision + 1,
      });
    },
    playQueue(songs, selectedId) {
      const queue = distinct(songs);
      if (!queue.length) {
        get().clear();
        return;
      }
      const selected = queue.findIndex((song) => song.songId === selectedId);
      const index = selected < 0 ? 0 : selected;
      set((state) => ({
        queue,
        currentIndex: index,
        currentTime: 0,
        duration: durationOf(queue[index]),
        wantsToPlay: true,
        isPlaying: false,
        isLoading: true,
        error: null,
        loadRevision: state.loadRevision + 1,
      }));
    },
    selectTrack(songId) {
      const song = get().queue.find((item) => item.songId === songId);
      if (song) get().playSong(song);
    },
    removeTrack(songId) {
      const state = get();
      const current = state.queue[state.currentIndex];
      const queue = state.queue.filter((song) => song.songId !== songId);
      if (queue.length === state.queue.length) return;
      if (!queue.length) {
        get().clear();
        return;
      }
      if (current?.songId !== songId) {
        set({
          queue,
          currentIndex: queue.findIndex(
            (song) => song.songId === current?.songId,
          ),
        });
        return;
      }
      const index = Math.min(state.currentIndex, queue.length - 1);
      set({
        queue,
        currentIndex: index,
        currentTime: 0,
        duration: durationOf(queue[index]),
        isPlaying: false,
        isLoading: state.wantsToPlay,
        error: null,
        loadRevision: state.loadRevision + 1,
      });
    },
    clear() {
      set((state) => ({
        queue: [],
        currentIndex: -1,
        currentTime: 0,
        duration: 0,
        wantsToPlay: false,
        isPlaying: false,
        isLoading: false,
        error: null,
        loadRevision: state.loadRevision + 1,
      }));
    },
    toggle() {
      if (get().currentIndex < 0) return;
      set((state) => ({ wantsToPlay: !state.wantsToPlay, error: null }));
    },
    advance(direction) {
      const state = get();
      const index = trackIndex(
        state.currentIndex,
        state.queue.length,
        state.mode,
        direction,
      );
      if (index < 0) return;
      set({
        currentIndex: index,
        currentTime: 0,
        duration: durationOf(state.queue[index]),
        wantsToPlay: true,
        isPlaying: false,
        isLoading: true,
        error: null,
        loadRevision: state.loadRevision + 1,
      });
    },
    seek(seconds) {
      if (!Number.isFinite(seconds)) return;
      const target = Math.max(0, Math.min(seconds, get().duration));
      set((state) => ({
        seekTarget: target,
        currentTime: target,
        seekRevision: state.seekRevision + 1,
      }));
    },
    setVolume(value) {
      if (!Number.isFinite(value)) return;
      const volume = Math.max(0, Math.min(100, value));
      set((state) => ({
        volume,
        previousVolume: volume > 0 ? volume : state.previousVolume,
      }));
    },
    toggleMute() {
      const state = get();
      state.setVolume(state.volume === 0 ? state.previousVolume : 0);
    },
    cycleMode() {
      set((state) => ({
        mode: playModes[(playModes.indexOf(state.mode) + 1) % playModes.length],
      }));
    },
    resetLikes() {
      set((state) => ({
        queue: state.queue.map((song) => ({ ...song, likeStatus: 0 })),
      }));
    },
    setSongLike(id, liked) {
      set((state) => ({
        queue: state.queue.map((song) =>
          song.songId === id ? { ...song, likeStatus: Number(liked) } : song,
        ),
      }));
    },
  }));
}

export type PlayerStore = ReturnType<typeof createPlayerStore>;

export function restorePlayer(store: PlayerStore, value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1
  )
    return;
  const record = value as {
    queue?: unknown;
    currentIndex?: unknown;
    volume?: unknown;
  };
  if (!Array.isArray(record.queue)) return;
  const queue = distinct(
    record.queue.filter((item): item is Song => {
      if (!item || typeof item !== "object") return false;
      const row = item as Partial<Song>;
      return (
        Number.isSafeInteger(row.songId) &&
        Number(row.songId) > 0 &&
        typeof row.songName === "string" &&
        typeof row.album === "string" &&
        (row.audioUrl === null || typeof row.audioUrl === "string") &&
        (row.artistName === null || typeof row.artistName === "string") &&
        (row.coverUrl === null || typeof row.coverUrl === "string") &&
        (row.duration === null || typeof row.duration === "string") &&
        typeof row.releaseTime === "string" &&
        (row.likeStatus === null ||
          row.likeStatus === 0 ||
          row.likeStatus === 1)
      );
    }),
  );
  const index =
    typeof record.currentIndex === "number" &&
    Number.isInteger(record.currentIndex)
      ? Math.max(0, Math.min(record.currentIndex, queue.length - 1))
      : 0;
  store.setState({
    queue,
    currentIndex: queue.length ? index : -1,
    currentTime: 0,
    duration: durationOf(queue[index]),
    wantsToPlay: false,
    isPlaying: false,
  });
  if (typeof record.volume === "number")
    store.getState().setVolume(record.volume);
}

export function playerSnapshot(state: PlayerState) {
  return {
    version: 1,
    queue: state.queue,
    currentIndex: state.currentIndex,
    volume: state.volume,
  };
}
