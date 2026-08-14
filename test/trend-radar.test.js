import test from "node:test";
import assert from "node:assert/strict";
import {
  GENRE_PROFILES,
  getAvailableGenres,
  getTrendingTracksByGenre,
} from "../lib/dj-agent/trend-radar.js";

test("Trend Radar: Available Genres", () => {
  const genres = getAvailableGenres();
  assert.ok(genres.length >= 5);
  const melodic = genres.find((g) => g.id === "melodic_techno");
  assert.ok(melodic);
  assert.equal(melodic.name, "Melodic House & Techno");
  assert.ok(melodic.bpmRange[0] === 122);
});

test("Trend Radar: Fetching Tracks by Genre", async () => {
  const techHouse = await getTrendingTracksByGenre("tech_house");
  assert.equal(techHouse.genreId, "tech_house");
  assert.ok(techHouse.tracks.length >= 6);
  assert.ok(techHouse.tracks[0].artist);
  assert.ok(techHouse.tracks[0].title);

  // Fallback test
  const unknown = await getTrendingTracksByGenre("non_existent_genre");
  assert.ok(unknown.tracks.length > 0);
});
