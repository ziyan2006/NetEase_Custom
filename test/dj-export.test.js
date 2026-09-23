import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlaylistExportState,
  failPlaylistExport,
  reducePlaylistExportEvent,
  toSceneExportProgress,
} from "../renderer/src/dj-export.js";

const playlist = { id: "123", name: "Peak Hour Reference", trackCount: 2, coverUrl: "https://fixture.invalid/cover.jpg" };

test("playlist export consumes server overall progress monotonically and counts each track once", () => {
  let state = createPlaylistExportState(playlist, "running");
  state = reducePlaylistExportEvent(state, { type: "start", total: 2, overall: 0 });
  state = reducePlaylistExportEvent(state, { type: "progress", index: 0, overall: 62 });
  state = reducePlaylistExportEvent(state, { type: "track-done", index: 0, completed: 1, overall: 38 });
  state = reducePlaylistExportEvent(state, { type: "track-done", index: 0, completed: 1, overall: 38 });

  assert.equal(state.overallPercent, 62);
  assert.equal(state.completed, 1);
  assert.equal(state.success, 1);
});

test("playlist export reports partial success only after the server done event", () => {
  let state = createPlaylistExportState(playlist, "running");
  state = reducePlaylistExportEvent(state, { type: "track-done", index: 0, completed: 1, overall: 40 });
  assert.equal(state.phase, "running");
  assert.equal(state.overallPercent, 40);

  state = reducePlaylistExportEvent(state, {
    type: "done", total: 2, completed: 2, successCount: 1, failedCount: 1, overall: 100,
  });
  assert.equal(state.phase, "done");
  assert.equal(state.overallPercent, 100);
  assert.equal(state.success, 1);
  assert.equal(state.failed, 1);
  assert.match(state.message, /部分完成/);
  assert.equal(toSceneExportProgress(state).coverUrl, playlist.coverUrl);
});

test("empty playlist done event is a valid complete result even without start", () => {
  let state = createPlaylistExportState({ ...playlist, trackCount: 0 }, "running");
  state = reducePlaylistExportEvent(state, { type: "done", total: 0, completed: 0, successCount: 0, failedCount: 0, overall: 100 });
  assert.equal(state.phase, "done");
  assert.equal(state.total, 0);
  assert.equal(state.completed, 0);
  assert.equal(state.overallPercent, 100);
  assert.match(state.message, /已完成/);
});

test("error event and stream interruption never claim 100 percent", () => {
  let state = createPlaylistExportState(playlist, "running");
  state = reducePlaylistExportEvent(state, { type: "progress", overall: 99.8 });
  state = failPlaylistExport(state, new Error("connection lost"));
  assert.equal(state.phase, "error");
  assert.equal(state.overallPercent, 99);
  assert.match(state.message, /connection lost/);

  state = reducePlaylistExportEvent(state, { type: "error", overall: 100, message: "server error" });
  assert.equal(state.phase, "error");
  assert.equal(state.overallPercent, 99);
});
