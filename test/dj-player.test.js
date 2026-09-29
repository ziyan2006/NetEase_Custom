import assert from "node:assert/strict";
import test from "node:test";
import { DjPlayer } from "../renderer/src/dj-player.js";

class MockAudio extends EventTarget {
  constructor() {
    super();
    this.duration = 120;
    this.currentTime = 0;
    this.readyState = 0;
    this.paused = true;
    this.ended = false;
    this.src = "";
    this.error = null;
  }
  async play() { this.paused = false; this.dispatchEvent(new Event("play")); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event("pause")); } }
  load() { if (this.src) { this.readyState = 1; this.dispatchEvent(new Event("loadedmetadata")); } }
  removeAttribute(name) { if (name === "src") { this.src = ""; this.readyState = 0; } }
  fail(message) { this.error = { message }; this.dispatchEvent(new Event("error")); }
  finish() { this.ended = true; this.paused = true; this.dispatchEvent(new Event("ended")); }
}

const tracks = [
  { id: "track-1", title: "One" },
  { id: "track-2", title: "Two" },
  { id: "track-3", title: "Three" },
];

test("player uses one media element and previous/next replace the queue track", async () => {
  const audio = new MockAudio();
  const requested = [];
  const player = new DjPlayer({ audio, resolveAudioUrl: async id => { requested.push(id); return `https://audio/${id}.mp3`; } });
  await player.setQueue(tracks, 1);
  assert.equal(player.getState().track.id, "track-2");
  assert.equal(player.getState().stepDirection, 0);
  assert.equal(audio.src, "https://audio/track-2.mp3");
  await player.next();
  assert.equal(player.getState().track.id, "track-3");
  assert.equal(player.getState().stepDirection, 1);
  await player.next();
  assert.equal(player.getState().track.id, "track-1");
  await player.previous();
  assert.equal(player.getState().track.id, "track-3");
  assert.equal(player.getState().stepDirection, -1);
  assert.deepEqual(requested, ["track-2", "track-3", "track-1", "track-3"]);
});

test("player reports unavailable sources and media errors instead of claiming playback", async () => {
  const audio = new MockAudio();
  const states = [];
  const player = new DjPlayer({ audio, resolveAudioUrl: async id => id === "track-1" ? null : `https://audio/${id}.mp3`, onChange: state => states.push(state) });
  await player.setQueue([tracks[0]]);
  assert.equal(player.getState().status, "error");
  assert.match(player.getState().error, /暂无可播放音源/);
  await player.setQueue([tracks[1]]);
  audio.fail("测试音频损坏");
  assert.equal(player.getState().status, "error");
  assert.equal(player.getState().error, "测试音频损坏");
  assert.ok(states.some(state => state.status === "loading"));
  assert.ok(states.every(state => state.status !== "playing" || state.track?.id === "track-2"));
});

test("audio duration and seek are taken from the HTMLAudioElement", async () => {
  const audio = new MockAudio();
  const player = new DjPlayer({ audio, resolveAudioUrl: async () => "https://audio/track.mp3" });
  await player.setQueue([tracks[0]]);
  audio.currentTime = 48;
  audio.dispatchEvent(new Event("timeupdate"));
  assert.equal(player.getState().duration, 120);
  assert.equal(player.getState().currentTime, 48);
  player.seek(83);
  assert.equal(audio.currentTime, 83);
  assert.equal(player.getState().currentTime, 83);
});

test("restores the last queue paused and seeks to its saved position only after explicit play", async () => {
  const audio = new MockAudio();
  const requested = [];
  let playRequested = 0;
  const player = new DjPlayer({ audio, resolveAudioUrl: async id => { requested.push(id); return `https://audio/${id}.mp3`; }, onPlayRequested: () => { playRequested++; } });
  player.restoreQueue(tracks, 1, 54, 120);
  assert.equal(player.getState().track.id, "track-2");
  assert.equal(player.getState().status, "paused");
  assert.equal(player.getState().currentTime, 54);
  assert.equal(audio.src, "");
  assert.deepEqual(requested, [], "refresh restoration must never autoplay or request audio before user input");
  await player.toggle();
  assert.equal(audio.src, "https://audio/track-2.mp3");
  assert.equal(audio.currentTime, 54);
  assert.equal(player.getState().status, "playing");
  assert.deepEqual(requested, ["track-2"]);
  assert.equal(playRequested, 1, "the media analyzer should resume synchronously from the explicit play gesture");
});
