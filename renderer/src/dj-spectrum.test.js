import assert from "node:assert/strict";
import test from "node:test";
import { cameraFacingSpectrumLane, djSpectrumBandAtScreenX, DJ_SPECTRUM_BANDS, DjSpectrumAnalyzer, djSpectrumLaneDisplacement } from "./dj-spectrum.js";

function makeAnalyzer(frequencies) {
  const audio = { paused: false, ended: false };
  let frequencyData;
  const analyser = {
    fftSize: 4096,
    minDecibels: -100,
    maxDecibels: -20,
    smoothingTimeConstant: 0,
    get frequencyBinCount() { return this.fftSize / 2; },
    connect() {},
    getByteFrequencyData(target) {
      target.fill(0);
      for (const [frequency, value] of frequencies) {
        const index = Math.round(frequency * 4096 / 48_000);
        target[index] = value;
      }
      frequencyData = target;
    },
  };
  const context = {
    sampleRate: 48_000,
    state: "running",
    destination: {},
    createAnalyser: () => analyser,
    createMediaElementSource: () => ({ connect() {} }),
    resume: async () => {},
  };
  return {
    audio,
    analyzer: new DjSpectrumAnalyzer(audio, () => context),
    get frequencyData() { return frequencyData; },
  };
}

test("DJ spectrum has 48 logarithmic bands ordered from bass on the left to treble on the right", () => {
  const bass = makeAnalyzer([[90, 255]]);
  const treble = makeAnalyzer([[8_000, 255]]);
  const bassFrame = bass.analyzer.read(true, 100);
  const trebleFrame = treble.analyzer.read(true, 100);
  const centroid = bins => bins.reduce((weighted, value, index) => weighted + value * index, 0) / bins.reduce((sum, value) => sum + value, 0);

  assert.equal(bassFrame.bins.length, DJ_SPECTRUM_BANDS);
  assert.equal(bassFrame.active, true);
  assert.ok(centroid(bassFrame.bins) < centroid(trebleFrame.bins), "bass should register left of treble");
  assert.ok(centroid(bassFrame.bins) < DJ_SPECTRUM_BANDS / 2);
  assert.ok(centroid(trebleFrame.bins) > DJ_SPECTRUM_BANDS / 2);
});

test("DJ spectrum smooths changes and releases to silence after playback pauses", () => {
  const fixture = makeAnalyzer([[440, 230]]);
  const playing = fixture.analyzer.read(true, 100);
  const energyWhilePlaying = Math.max(...playing.bins);
  assert.ok(energyWhilePlaying > 0);

  fixture.audio.paused = true;
  const paused = fixture.analyzer.read(true, 200);
  assert.equal(paused.active, false);
  const energyAfterPause = Math.max(...paused.bins);
  assert.ok(energyAfterPause < energyWhilePlaying, "paused levels should decay instead of freezing");
  let now = 300;
  for (let frame = 0; frame < 90; frame++) fixture.analyzer.read(false, now += 16);
  assert.ok(energyAfterPause > Math.max(...fixture.analyzer.frame.bins));
  assert.ok(Math.max(...fixture.analyzer.frame.bins) < 0.001, "released levels should settle back to silence");
});

test("live DJ spectrum moves every file in the camera-facing lane and no other lane", () => {
  assert.equal(cameraFacingSpectrumLane(2, false), 1);
  assert.equal(cameraFacingSpectrumLane(2, true), 3);
  assert.equal(cameraFacingSpectrumLane(2.2, false), 1);

  const targetLane = cameraFacingSpectrumLane(2, false);
  assert.equal(djSpectrumLaneDisplacement(targetLane, targetLane, 1), 1.55);
  assert.equal(djSpectrumLaneDisplacement(2, targetLane, 1), 0, "the raised lane stays still");
  assert.equal(djSpectrumLaneDisplacement(0, targetLane, 1), 0, "the other neighbor stays still");
  assert.equal(djSpectrumLaneDisplacement(targetLane, targetLane, .012), 0, "silence does not lift the lane");
});

test("DJ spectrum maps the visible width from bass left to treble right", () => {
  assert.equal(djSpectrumBandAtScreenX(.1, .1, .9, DJ_SPECTRUM_BANDS), 0);
  assert.equal(djSpectrumBandAtScreenX(.5, .1, .9, DJ_SPECTRUM_BANDS), 24);
  assert.equal(djSpectrumBandAtScreenX(.9, .1, .9, DJ_SPECTRUM_BANDS), DJ_SPECTRUM_BANDS - 1);
  assert.equal(djSpectrumBandAtScreenX(0, .1, .9, DJ_SPECTRUM_BANDS), 0);
  assert.equal(djSpectrumBandAtScreenX(1, .1, .9, DJ_SPECTRUM_BANDS), DJ_SPECTRUM_BANDS - 1);
});
