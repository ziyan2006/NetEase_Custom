import test from "node:test";
import assert from "node:assert/strict";
import { djCoverSlots, DJ_COVER_RADIUS, DJ_COVER_ROW_STEP } from "./dj-cover-lane.js";

test("every song in a short queue occupies a consecutive file in the raised lane", () => {
  const slots = djCoverSlots(12, 5, 2, 20);
  assert.equal(slots.length, 12);
  assert.deepEqual(slots.map(slot => slot.trackIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(slots.filter(slot => slot.active), [{ lane: 2, row: 20, trackIndex: 5, active: true }]);
  assert.equal(slots[6].row - slots[5].row, DJ_COVER_ROW_STEP);
  assert.ok(slots.every(slot => slot.lane === 2));
  assert.deepEqual(djCoverSlots(2, 0, 2, 20).map(slot => slot.trackIndex), [0, 1]);
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
