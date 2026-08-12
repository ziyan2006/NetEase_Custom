export function sanitizeFolderName(name) {
  const cleaned = (name || "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "Unassigned";
}

export function formatSongFilename(artist, title) {
  const safeArtist = (artist || "Unknown Artist").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "Unknown Artist";
  const safeTitle = (title || "Unknown Title").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "Unknown Title";
  return `${safeArtist} - ${safeTitle}.mp3`;
}
