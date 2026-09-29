import test from "node:test";
import assert from "node:assert/strict";
import { djCoverSlots, djCoverLaneState, djCoverStepDirection, djVisibleCoverSlots, DJ_COVER_RADIUS, DJ_COVER_ROW_STEP } from "./dj-cover-lane.js";

test("the full raised lane cycles through short queues with the active track centered", () => {
  const slots = djCoverSlots(12, 5, 2, 20);
  assert.equal(slots.length, DJ_COVER_RADIUS * 2 + 1);
  assert.equal(slots[DJ_COVER_RADIUS].trackIndex, 5);
  assert.deepEqual(slots.filter(slot => slot.active), [{ lane: 2, row: 20, trackIndex: 5, active: true }]);
  assert.equal(slots[DJ_COVER_RADIUS + 1].row - slots[DJ_COVER_RADIUS].row, DJ_COVER_ROW_STEP);
  assert.deepEqual(slots.slice(22, 27).map(slot => slot.trackIndex), [3, 4, 5, 6, 7]);
  assert.ok(slots.every(slot => slot.lane === 2));
  const twoTrackSlots = djCoverSlots(2, 0, 2, 20);
  assert.equal(twoTrackSlots.length, DJ_COVER_RADIUS * 2 + 1);
  assert.deepEqual(twoTrackSlots.slice(23, 26).map(slot => slot.trackIndex), [1, 0, 1]);
  assert.deepEqual(djCoverSlots(0, -1, 2, 20), []);
});

test("long queues fill the visible lane without duplicating a song", () => {
  const slots = djCoverSlots(232, 0, 2, 20);
  assert.equal(slots.length, DJ_COVER_RADIUS * 2 + 1);
  assert.equal(new Set(slots.map(slot => slot.trackIndex)).size, slots.length);
  assert.deepEqual(slots.filter(slot => slot.active), [{ lane: 2, row: 20, trackIndex: 0, active: true }]);
  assert.equal(slots[0].trackIndex, 208);
  assert.equal(slots.at(-1).trackIndex, 24);
});

test("visible cover culling keeps the active track anchored at the selected row", () => {
  const visibleRows = Array.from({ length: 201 }, (_, index) => 400 + index);
  const visibleSlots = djVisibleCoverSlots(232, 7, 2, 500, visibleRows);
  const active = visibleSlots.find(({ slot }) => slot.active);
  assert.deepEqual(active, { slot: { lane: 2, row: 500, trackIndex: 7, active: true }, cardIndex: DJ_COVER_RADIUS });
  assert.equal(visibleSlots.length, DJ_COVER_RADIUS * 2 + 1);
  assert.deepEqual(visibleSlots.map(({ slot }) => slot.row), Array.from({ length: 49 }, (_, index) => 476 + index));
});

test("the full cover lane stays mounted through archive entry, focus, and return", () => {
  const shared = { prototype: true, cinematic: false, looping: true, presence: 1, hasCurrentTrack: true, exportFocus: false };
  assert.deepEqual(djCoverLaneState({ ...shared, targetDetail: true, detail: .4, workbench: false, archivePinned: true, archiveReturning: false }), { visible: true, workbenchReady: false });
  assert.deepEqual(djCoverLaneState({ ...shared, targetDetail: true, detail: 1, workbench: false, archivePinned: true, archiveReturning: false }), { visible: true, workbenchReady: false });
  assert.deepEqual(djCoverLaneState({ ...shared, targetDetail: false, detail: .4, workbench: true, archivePinned: false, archiveReturning: true }), { visible: true, workbenchReady: false });
  assert.deepEqual(djCoverLaneState({ ...shared, targetDetail: false, detail: .02, workbench: false, archivePinned: false, archiveReturning: true }), { visible: true, workbenchReady: false });
  assert.deepEqual(djCoverLaneState({ ...shared, targetDetail: false, detail: 0, workbench: true, archivePinned: false, archiveReturning: true }), { visible: true, workbenchReady: true });
  assert.equal(djCoverLaneState({ ...shared, targetDetail: false, detail: .4, workbench: false, archivePinned: false, archiveReturning: false }).visible, true);
  assert.equal(djCoverLaneState({ ...shared, targetDetail: true, detail: 1, workbench: false, exportFocus: true, archivePinned: true, archiveReturning: false }).visible, false);
});

test("single-track steps animate forward and backward, including queue wraparound", () => {
  assert.equal(djCoverStepDirection(3, 4, 8), 1);
  assert.equal(djCoverStepDirection(4, 3, 8), -1);
  assert.equal(djCoverStepDirection(7, 0, 8), 1);
  assert.equal(djCoverStepDirection(0, 7, 8), -1);
  assert.equal(djCoverStepDirection(3, 6, 8), 0);
  assert.equal(djCoverStepDirection(0, 0, 1), 0);
});
