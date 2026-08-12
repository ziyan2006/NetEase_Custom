import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sanitizeFolderName, formatSongFilename } from "./playlist-exporter.js";
import { decodeNcmBuffer } from "./ncm-decoder.js";

export function resolvePlaylistOutputPath(outputRoot, playlistName, artist, title) {
  const safeRoot = resolve(outputRoot || "DJ_Music_Library");
  const safePlaylist = sanitizeFolderName(playlistName);
  const playlistDir = join(safeRoot, safePlaylist);
  const filename = formatSongFilename(artist, title);
  const filePath = join(playlistDir, filename);
  return { playlistDir, filename, filePath };
}

export async function exportPlaylistTrack({ outputRoot, playlistName, artist, title, audioBuffer, format = "mp3" }) {
  const { playlistDir, filePath } = resolvePlaylistOutputPath(outputRoot, playlistName, artist, title);
  await mkdir(playlistDir, { recursive: true });

  let processedBuffer = audioBuffer;
  const isNcm = audioBuffer.length > 8 && audioBuffer.subarray(0, 8).toString("ascii") === "CTENFDAM";
  
  if (isNcm) {
    const decoded = decodeNcmBuffer(audioBuffer);
    processedBuffer = decoded.audioBuffer;
  }

  await writeFile(filePath, processedBuffer);
  return { playlistDir, filePath };
}
