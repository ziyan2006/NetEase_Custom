export const DJ_SPECTRUM_BANDS: number;
export function cameraFacingSpectrumLane(raisedLane: number, cameraIsPositiveX: boolean): number;
export function djSpectrumLaneDisplacement(lane: number, targetLane: number, level: number): number;
export function djSpectrumBandAtScreenX(x: number, leftX: number, rightX: number, bandCount: number): number;
export type PlayerSpectrumFrame = { active: boolean; bins: Float32Array };
export class DjSpectrumAnalyzer {
  constructor(audio: HTMLMediaElement, createAudioContext?: () => AudioContext);
  resume(): void;
  read(playing: boolean, now?: number): PlayerSpectrumFrame;
}
