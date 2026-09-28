const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const DJ_SPECTRUM_BANDS = 48;

/** Archive lanes run along the visible diagonal strip; choose the one in front of the raised lane. */
export function cameraFacingSpectrumLane(raisedLane, cameraIsPositiveX) {
  return Math.round(raisedLane) + (cameraIsPositiveX ? 1 : -1);
}

/** Keep live audio displacement confined to that single, camera-facing lane. */
export function djSpectrumLaneDisplacement(lane, targetLane, level) {
  if (Math.abs(lane - targetLane) > .001 || level <= .012) return 0;
  return Math.pow(level, .82) * 1.55;
}

/** The same visible strip always runs bass on the left to treble on the right. */
export function djSpectrumBandAtScreenX(x, leftX, rightX, bandCount) {
  const progress = rightX > leftX ? (x - leftX) / (rightX - leftX) : 0;
  return Math.round(clamp01(progress) * (bandCount - 1));
}

/** Reads a playing media element into smoothed, logarithmic frequency bands. */
export class DjSpectrumAnalyzer {
  constructor(audio, createAudioContext = () => {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error("Web Audio API is unavailable");
    return new Context();
  }) {
    this.audio = audio;
    this.context = createAudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -20;
    this.analyser.smoothingTimeConstant = .58;
    this.source = this.context.createMediaElementSource(audio);
    this.source.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.frame = { active: false, bins: new Float32Array(DJ_SPECTRUM_BANDS) };
    this.lastRead = 0;
  }

  resume() {
    if (this.context.state !== "suspended") return;
    void this.context.resume().catch(() => {});
  }

  read(playing, now = performance.now()) {
    const dt = this.lastRead ? Math.max(0, Math.min(.1, (now - this.lastRead) / 1000)) : 1 / 60;
    this.lastRead = now;
    const active = Boolean(playing && !this.audio.paused && !this.audio.ended);
    this.frame.active = active;
    if (active) this.analyser.getByteFrequencyData(this.frequencyData);

    const binHz = this.context.sampleRate / this.analyser.fftSize;
    const minimumHz = 35;
    const maximumHz = Math.min(16000, this.context.sampleRate * .46);
    const ratio = maximumHz / minimumHz;
    for (let band = 0; band < DJ_SPECTRUM_BANDS; band++) {
      const lowHz = minimumHz * ratio ** (band / DJ_SPECTRUM_BANDS);
      const highHz = minimumHz * ratio ** ((band + 1) / DJ_SPECTRUM_BANDS);
      const start = Math.max(1, Math.min(this.frequencyData.length - 1, Math.floor(lowHz / binHz)));
      const end = Math.max(start + 1, Math.min(this.frequencyData.length, Math.ceil(highHz / binHz)));
      let energy = 0;
      for (let index = start; index < end; index++) {
        const sample = this.frequencyData[index] / 255;
        energy += sample * sample;
      }
      const level = active ? Math.sqrt(energy / (end - start)) : 0;
      const target = clamp01((level - .035) / .7);
      const current = this.frame.bins[band];
      const rate = target > current ? 24 : 8;
      this.frame.bins[band] = current + (target - current) * (1 - Math.exp(-dt * rate));
    }
    return this.frame;
  }
}
