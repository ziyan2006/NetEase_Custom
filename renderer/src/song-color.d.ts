export type SongColorPalette = {
  primary: [number, number, number];
  secondary: [number, number, number];
  primaryShare: number;
  secondaryShare: number;
};
export function paletteFromPixels(pixels: ArrayLike<number> | Uint8ClampedArray): SongColorPalette | null;
export function songPaletteUsesDarkSurface(palette: SongColorPalette): boolean;
export function songPaletteNeutralWhiteWeight(palette: SongColorPalette): number;
export type SongAmbientLight = {
  rgb: [number, number, number]; strength: number;
  keyRgb: [number, number, number]; keyStrength: number;
};
export function songPaletteAmbientLight(palette: SongColorPalette): SongAmbientLight;
export function readSongCoverPalette(url: string | null | undefined): Promise<SongColorPalette | null>;
