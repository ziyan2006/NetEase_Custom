import { parseTracklistText, parse1001TracklistHtml } from "../lib/dj-agent/tracklist-parser.js";

const line = "Darude - Sandstorm (Dimension Remix)";
const parsed = parseTracklistText(line);
console.log("Parsed track:", JSON.stringify(parsed.tracks[0], null, 2));
