import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerStore, playerSnapshot, restorePlayer, trackIndex } from "../src/lib/player-store.ts";
import { createAudioController } from "../src/lib/audio-controller.ts";
import { mediaUrl } from "../src/lib/media-url.ts";
import { downloadFilename } from "../src/lib/download-song.ts";

test("logging out clears favorite flags without interrupting playback", () => {
  const store = createPlayerStore();
  store.getState().playQueue([{ ...song(1), likeStatus: 1 }, { ...song(2), likeStatus: 1 }], 2);
  store.setState({ currentTime: 42, isPlaying: true });
  const before = store.getState();
  store.getState().resetLikes();
  const after = store.getState();
  assert.deepEqual(after.queue.map((track) => track.likeStatus), [0, 0]);
  for (const key of ["currentIndex", "currentTime", "isPlaying", "wantsToPlay", "loadRevision", "mode", "volume"]) {
    assert.equal(after[key], before[key], key);
  }
});

function song(id, audioUrl = `/media/songs/${id}.mp3`) {
  return {
    songId: id, songName: `Song ${id}`, artistName: "Artist", album: "Album", duration: "196.98",
    coverUrl: null, audioUrl, likeStatus: 0, releaseTime: "2025-04-30",
  };
}

class FakeAudio extends EventTarget {
  src = "";
  currentSrc = "";
  currentTime = 0;
  duration = 200;
  volume = 1;
  error = null;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;
  nextPlay = null;
  play() { this.playCalls++; this.paused = false; return this.nextPlay ?? Promise.resolve(); }
  pause() { this.pauseCalls++; this.paused = true; this.dispatchEvent(new Event("pause")); }
  load() { this.loadCalls++; this.error = null; this.currentSrc = this.src; }
  removeAttribute(name) { if (name === "src") this.src = ""; }
  emit(name) { this.dispatchEvent(new Event(name)); }
}

test("playing a table row uses that page's deduplicated queue and selects by ID", () => {
  const store = createPlayerStore();
  store.getState().playQueue([song(1, null), song(2), song(2), song(3)], 2);
  assert.deepEqual(store.getState().queue.map((item) => item.songId), [1, 2, 3]);
  assert.equal(store.getState().currentIndex, 1);
  assert.equal(store.getState().wantsToPlay, true);
});

test("single-song selection appends without duplicates and refreshes metadata", () => {
  const store = createPlayerStore();
  store.getState().playSong(song(1));
  store.getState().playSong(song(2));
  store.getState().playSong({ ...song(1), songName: "Updated" });
  assert.equal(store.getState().queue.length, 2);
  assert.equal(store.getState().currentIndex, 0);
  assert.equal(store.getState().queue[0].songName, "Updated");
});

test("removing a preceding track preserves the current song without reloading it", () => {
  const store = createPlayerStore();
  store.getState().playQueue([song(1), song(2), song(3)], 2);
  const revision = store.getState().loadRevision;
  store.getState().removeTrack(1);
  assert.equal(store.getState().currentIndex, 0);
  assert.equal(store.getState().queue[0].songId, 2);
  assert.equal(store.getState().loadRevision, revision);
});

test("removing the current track chooses its successor and clearing resets playback", () => {
  const store = createPlayerStore();
  store.getState().playQueue([song(1), song(2), song(3)], 2);
  store.getState().removeTrack(2);
  assert.equal(store.getState().queue[store.getState().currentIndex].songId, 3);
  store.getState().clear();
  assert.equal(store.getState().currentIndex, -1);
  assert.equal(store.getState().wantsToPlay, false);
  assert.equal(store.getState().currentTime, 0);
});

test("legacy order/loop wrap, single repeats, and shuffle chooses an in-range track", () => {
  assert.equal(trackIndex(2, 3, "order", 1), 0);
  assert.equal(trackIndex(0, 3, "loop", -1), 2);
  assert.equal(trackIndex(1, 3, "single", 1), 1);
  assert.equal(trackIndex(1, 3, "shuffle", 1, () => 0.9), 2);
  assert.equal(trackIndex(-1, 0, "order", 1), -1);
});

test("volume zero survives persistence and mute restores the last nonzero level", () => {
  const store = createPlayerStore();
  store.getState().setVolume(72);
  store.getState().toggleMute();
  assert.equal(store.getState().volume, 0);
  store.getState().toggleMute();
  assert.equal(store.getState().volume, 72);
  store.getState().setVolume(0);
  store.getState().playSong(song(1));
  const restored = createPlayerStore();
  restorePlayer(restored, JSON.parse(JSON.stringify(playerSnapshot(store.getState()))));
  assert.equal(restored.getState().volume, 0);
  assert.equal(restored.getState().queue.length, 1);
  assert.equal(restored.getState().wantsToPlay, false);
  assert.equal(restored.getState().isPlaying, false);
});

test("corrupt persisted entries and invalid volume values do not corrupt state", () => {
  const store = createPlayerStore();
  restorePlayer(store, { version: 1, queue: [null, {}, song(1), song(1)], currentIndex: 999, volume: NaN });
  assert.equal(store.getState().queue.length, 1);
  assert.equal(store.getState().currentIndex, 0);
  assert.equal(store.getState().volume, 50);
  store.getState().setVolume(200);
  assert.equal(store.getState().volume, 100);
});

test("native playing/metadata/timeupdate events are authoritative; seeks are clamped", () => {
  const store = createPlayerStore();
  const audio = new FakeAudio();
  const dispose = createAudioController(store, audio);
  store.getState().playSong(song(1));
  assert.equal(audio.src, "/media/songs/1.mp3");
  assert.equal(store.getState().isPlaying, false);
  audio.emit("playing");
  assert.equal(store.getState().isPlaying, true);
  audio.emit("loadedmetadata");
  assert.equal(store.getState().duration, 200);
  audio.currentTime = 45;
  audio.emit("timeupdate");
  assert.equal(store.getState().currentTime, 45);
  store.getState().seek(999);
  assert.equal(audio.currentTime, 200);
  store.getState().toggle();
  assert.equal(store.getState().wantsToPlay, false);
  assert.equal(store.getState().isPlaying, false);
  dispose();
});

test("missing media and native errors stop without looping through a missing queue", () => {
  const store = createPlayerStore();
  const audio = new FakeAudio();
  const dispose = createAudioController(store, audio);
  store.getState().playSong(song(1, null));
  assert.equal(audio.playCalls, 0);
  assert.equal(store.getState().wantsToPlay, false);
  assert.match(store.getState().error, /资源不可用/);
  store.getState().playSong(song(2));
  audio.emit("error");
  assert.equal(store.getState().wantsToPlay, false);
  assert.equal(store.getState().currentIndex, 1);
  dispose();
});

test("a superseded play rejection cannot stop a newly selected song", async () => {
  const store = createPlayerStore();
  const audio = new FakeAudio();
  const dispose = createAudioController(store, audio);
  let rejectOld;
  audio.nextPlay = new Promise((_, reject) => { rejectOld = reject; });
  store.getState().playSong(song(1));
  audio.nextPlay = null;
  store.getState().playSong(song(2));
  audio.emit("playing");
  rejectOld(new Error("old aborted request"));
  await Promise.resolve();
  assert.equal(store.getState().isPlaying, true);
  assert.equal(store.getState().error, null);
  assert.equal(store.getState().queue[store.getState().currentIndex].songId, 2);
  dispose();
});

test("autoplay denial is recoverable by a subsequent user gesture", async () => {
  const store = createPlayerStore();
  const audio = new FakeAudio();
  const dispose = createAudioController(store, audio);
  audio.nextPlay = Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
  store.getState().playSong(song(1));
  await Promise.resolve();
  assert.match(store.getState().error, /点击播放重试/);
  assert.equal(store.getState().isPlaying, false);
  audio.nextPlay = null;
  store.getState().toggle();
  audio.emit("playing");
  assert.equal(store.getState().isPlaying, true);
  dispose();
});

test("ended advances through the queue; dispose removes listeners and releases source", () => {
  const store = createPlayerStore();
  const audio = new FakeAudio();
  const dispose = createAudioController(store, audio);
  store.getState().playQueue([song(1), song(2)], 1);
  audio.emit("ended");
  assert.equal(store.getState().currentIndex, 1);
  const revision = store.getState().loadRevision;
  dispose();
  audio.emit("ended");
  assert.equal(store.getState().loadRevision, revision);
  assert.equal(audio.src, "");
  assert.equal(store.getState().wantsToPlay, false);
});

test("a stale pause event cannot cancel a new track, but a native buffering pause does", () => {
  const store = createPlayerStore();
  const audio = new FakeAudio();
  const dispose = createAudioController(store, audio);
  store.getState().playSong(song(1));
  store.getState().playSong(song(2));
  audio.emit("pause"); // queued notification; the new source is no longer paused
  assert.equal(store.getState().wantsToPlay, true);
  audio.pause();
  assert.equal(store.getState().wantsToPlay, false);
  assert.equal(store.getState().isLoading, false);
  dispose();
});

test("retry after a native media error reloads the resource before playing", () => {
  const store = createPlayerStore();
  const audio = new FakeAudio();
  const dispose = createAudioController(store, audio);
  store.getState().playSong(song(1));
  audio.error = { code: 4 };
  audio.emit("error");
  const loads = audio.loadCalls;
  store.getState().toggle();
  assert.equal(audio.loadCalls, loads + 1);
  assert.equal(store.getState().wantsToPlay, true);
  audio.emit("playing");
  assert.equal(store.getState().isPlaying, true);
  dispose();
});

test("known legacy MinIO addresses become same-origin keys; signed or unsafe addresses are not rewritten", () => {
  assert.equal(mediaUrl("http://localhost:9000/vibe-music-data/songs/a%20b.mp3"), "/media/songs/a%20b.mp3");
  assert.equal(mediaUrl("http://127.0.0.1:9000/vibe-music-data/cover/夜曲.jpg"), "/media/cover/%E5%A4%9C%E6%9B%B2.jpg");
  assert.equal(mediaUrl("http://localhost:9000/vibe-music-data/song.mp3?signature=old"), null);
  assert.equal(mediaUrl("javascript:alert(1)"), null);
  assert.equal(mediaUrl("//example.test/song.mp3"), null);
  assert.equal(mediaUrl("https://example.test/song.mp3?signature=valid"), "https://example.test/song.mp3?signature=valid");
});

test("download filename keeps the audio extension and removes filesystem control characters", () => {
  assert.equal(downloadFilename({ ...song(1, "/media/a.flac"), songName: "A/B?" }), "A_B_ - Artist.flac");
});
