import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCamelotKey,
  camelotToStandardKey,
  getCompatibleKeys,
  analyzeTransition,
} from "../lib/dj-agent/camelot-engine.js";

test("Camelot Key Engine: Key Normalization", () => {
  assert.equal(normalizeCamelotKey("8A"), "8A");
  assert.equal(normalizeCamelotKey("8a"), "8A");
  assert.equal(normalizeCamelotKey("Am"), "8A");
  assert.equal(normalizeCamelotKey("A minor"), "8A");
  assert.equal(normalizeCamelotKey("C"), "8B");
  assert.equal(normalizeCamelotKey("C Major"), "8B");
  assert.equal(normalizeCamelotKey("F#m"), "11A");
  assert.equal(normalizeCamelotKey("Gbm"), "11A");
  assert.equal(normalizeCamelotKey("12B"), "12B");
  assert.equal(normalizeCamelotKey("invalid_key"), null);
});

test("Camelot Key Engine: Conversion to Standard Key", () => {
  assert.equal(camelotToStandardKey("8A"), "Am");
  assert.equal(camelotToStandardKey("8B"), "C");
  assert.equal(camelotToStandardKey("11A"), "F#m");
});

test("Camelot Key Engine: Compatible Keys Generator", () => {
  const compatible = getCompatibleKeys("8A");
  assert.equal(compatible.length, 6);
  assert.equal(compatible[0].camelot, "8A"); // Same key
  assert.equal(compatible[1].camelot, "9A"); // +1
  assert.equal(compatible[2].camelot, "7A"); // -1
  assert.equal(compatible[3].camelot, "8B"); // Relative Major
  assert.equal(compatible[4].camelot, "10A"); // +2 Energy boost
  assert.equal(compatible[5].camelot, "3A"); // +7 Semitone modulation ((8+7-1)%12 + 1 = 3)
});

test("Camelot Key Engine: Transition Analysis (Harmonic & BPM)", () => {
  // 1. Same Key & Matching BPM
  const perfect = analyzeTransition("8A", 126, "8A", 126);
  assert.equal(perfect.keyScore, 100);
  assert.equal(perfect.bpmStatus, "safe");
  assert.equal(perfect.totalScore, 100);
  assert.equal(perfect.isRecommended, true);

  // 2. Adjacent +1 & Slight BPM difference (126 -> 128 = ~1.6%)
  const smooth = analyzeTransition("Am", 126, "Em", 128);
  assert.equal(smooth.from.key, "8A");
  assert.equal(smooth.to.key, "9A");
  assert.equal(smooth.keyScore, 95);
  assert.equal(smooth.bpmStatus, "safe");
  assert.ok(smooth.totalScore >= 90);

  // 3. Double Time mix (70 -> 140)
  const doubleTime = analyzeTransition("8A", 70, "8A", 140);
  assert.equal(doubleTime.bpmStatus, "double_half");
  assert.ok(doubleTime.totalScore >= 90);

  // 4. Dissonant key & large BPM gap
  const clash = analyzeTransition("8A", 120, "2A", 150);
  assert.ok(clash.totalScore < 60);
  assert.equal(clash.isRecommended, false);
});
