"use client";

import { useEffect, useSyncExternalStore } from "react";

const key = "vibe-music-theme-v1";
const changed = "vibe-music-theme-change";
function snapshot() {
  try {
    return localStorage.getItem(key) === "dark";
  } catch {
    return fallback;
  }
}
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(changed, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(changed, notify);
  };
}
let fallback = false;
export function useTheme() {
  const dark = useSyncExternalStore(subscribe, snapshot, () => false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  function toggle() {
    fallback = !dark;
    try {
      localStorage.setItem(key, fallback ? "dark" : "light");
    } catch {
      /* Storage is optional. */
    }
    window.dispatchEvent(new Event(changed));
  }
  return [dark, toggle] as const;
}
