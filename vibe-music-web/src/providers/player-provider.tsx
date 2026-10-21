"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createAudioController } from "@/lib/audio-controller";
import { createPlayerStore, playerSnapshot, restorePlayer, type PlayerState, type PlayerStore } from "@/lib/player-store";

const PlayerContext = createContext<PlayerStore | null>(null);
const storageKey = "vibe-music-player-v1";

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createPlayerStore);
  useEffect(() => {
    try {
      const value = localStorage.getItem(storageKey);
      if (value) restorePlayer(store, JSON.parse(value));
    } catch {
      // Private browsing, full storage or corrupt data must not disable playback.
    }
    const audio = new Audio();
    audio.preload = "metadata";
    const dispose = createAudioController(store, audio);
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.queue === previous.queue && state.currentIndex === previous.currentIndex && state.volume === previous.volume) return;
      try { localStorage.setItem(storageKey, JSON.stringify(playerSnapshot(state))); } catch { /* Optional persistence. */ }
    });
    return () => { unsubscribe(); dispose(); };
  }, [store]);
  return <PlayerContext.Provider value={store}>{children}</PlayerContext.Provider>;
}

export function usePlayer<T>(selector: (state: PlayerState) => T): T {
  const store = useContext(PlayerContext);
  if (!store) throw new Error("usePlayer requires PlayerProvider");
  return useStore(store, selector);
}
