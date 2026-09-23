import type { NeteaseTrack } from "./yesmusic-api";

export type DjPlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";
export type DjPlayerState = {
  queue: NeteaseTrack[];
  index: number;
  status: DjPlayerStatus;
  currentTime: number;
  duration: number;
  error: string;
  track: NeteaseTrack | null;
};

export class DjPlayer {
  readonly audio: HTMLAudioElement;
  constructor(options: {
    resolveAudioUrl: (trackId: string) => Promise<string | null>;
    onChange?: (state: DjPlayerState) => void;
    audio?: HTMLAudioElement;
  });
  getState(): DjPlayerState;
  setQueue(queue: NeteaseTrack[], index?: number, autoplay?: boolean): Promise<void>;
  toggle(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(value: number): void;
  clear(): void;
}
