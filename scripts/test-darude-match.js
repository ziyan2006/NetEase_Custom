import { matchSingleTrack } from "../lib/dj-agent/track-matcher.js";

async function test() {
  const track = {
    trackNumber: 15,
    artist: "Darude",
    title: "Sandstorm (Dimension Remix)",
    remix: "Dimension Remix",
    searchQuery: "Darude Sandstorm Dimension Remix",
    raw: "Darude - Sandstorm (Dimension Remix)",
  };

  const res = await matchSingleTrack(track);
  console.log("Match Result:", JSON.stringify(res, null, 2));
}

test();
