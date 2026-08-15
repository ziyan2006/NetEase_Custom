import { scoreCandidateSong } from "../lib/dj-agent/track-matcher.js";

const target = {
  artist: "Darude",
  title: "Sandstorm (Dimension Remix)",
  remix: "Dimension Remix",
  searchQuery: "Darude Sandstorm Dimension Remix",
};

const cand = {
  id: 33054275,
  name: "Sandstorm (Didrick Remix)",
  artists: [{ name: "Darude" }, { name: "Didrick" }],
};

console.log("Score for Darude Didrick Remix:", scoreCandidateSong(target, cand));
