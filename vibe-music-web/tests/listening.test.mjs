import assert from "node:assert/strict";
import test from "node:test";
import { createListeningRecorder } from "../src/lib/listening-recorder.ts";
import { downloadSong } from "../src/lib/download-song.ts";
import { setBrowserToken } from "../src/lib/api-client.ts";

class Audio extends EventTarget {
  currentTime = 0;
  duration = 100;
  paused = false;
  tick(time) { this.currentTime = time; this.dispatchEvent(new Event("timeupdate")); }
}

test("only meaningful playback records, once per track and authenticated owner", () => {
  const audio = new Audio();
  let owner = null;
  const calls = [];
  const dispose = createListeningRecorder(audio, () => owner, async (...args) => { calls.push(args); });
  for (let i=0; i<=35; i++) audio.tick(i);
  assert.equal(calls.length, 0);
  owner = { songId: 1, token: "user-a", revision: 1 };
  audio.tick(0);
  for (let i=1; i<=29; i++) audio.tick(i);
  assert.equal(calls.length, 0);
  audio.tick(30); audio.tick(31);
  assert.deepEqual(calls, [[1, "user-a"]]);
  owner = { songId: 1, token: "user-b", revision: 1 };
  audio.tick(32);
  for (let i=33; i<=62; i++) audio.tick(i);
  assert.deepEqual(calls, [[1, "user-a"], [1, "user-b"]]);
  dispose(); audio.tick(63);
});

test("seeks and pauses do not count as listening; short audio uses 80 percent", () => {
  const audio = new Audio();
  const calls=[];
  const dispose=createListeningRecorder(audio, () => ({songId:1,token:"a",revision:1}), async (...v) => {calls.push(v);});
  audio.tick(0);
  audio.dispatchEvent(new Event("seeking")); audio.tick(90);
  audio.dispatchEvent(new Event("seeked"));
  audio.paused=true; audio.tick(100);
  assert.equal(calls.length,0);
  audio.paused=false; audio.duration=10; audio.tick(0);
  for(let i=1;i<8;i++) audio.tick(i);
  assert.equal(calls.length,0);
  audio.tick(8);
  assert.equal(calls.length,1);
  dispose();
});

test("a failed history request backs off rather than sending on each timeupdate", async () => {
  const audio=new Audio(); let attempts=0;
  const dispose=createListeningRecorder(audio, () => ({songId:1,token:"a",revision:1}), async () => {attempts++;throw new Error("offline");});
  audio.tick(0);
  for(let i=1;i<=30;i++) audio.tick(i);
  await Promise.resolve(); await Promise.resolve();
  for(let i=31;i<=50;i++) audio.tick(i);
  assert.equal(attempts,1);
  dispose();
});

test("download requires login and captures the current bearer token", async () => {
  const previousWindow=globalThis.window; const previousFetch=globalThis.fetch;
  globalThis.window=new EventTarget();
  let expirations=0;
  window.addEventListener("vibe-auth-expired",()=>{expirations++;});
  const calls=[];
  globalThis.fetch=async (url,options) => {calls.push([url,options]);return new Response("expired",{status:401});};
  try {
    setBrowserToken(null);
    await assert.rejects(downloadSong({songId:1,audioUrl:"/media/songs/a.mp3"}),/登录/);
    assert.equal(calls.length,0);
    setBrowserToken("user-a");
    const pending=downloadSong({songId:1,audioUrl:"/media/songs/a.mp3"});
    setBrowserToken("user-b");
    await assert.rejects(pending,/登录已失效/);
    assert.equal(calls[0][0],"/api/song/1/download");
    assert.equal(calls[0][1].headers.Authorization,"Bearer user-a");
    assert.equal(expirations,0);
    await assert.rejects(downloadSong({songId:1,audioUrl:"/media/songs/a.mp3"}),/登录已失效/);
    assert.equal(expirations,1);
  } finally {setBrowserToken(null);globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
});
