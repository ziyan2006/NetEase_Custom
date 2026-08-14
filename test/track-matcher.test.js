import test from "node:test";
import assert from "node:assert/strict";
import {
  stringSimilarity,
  scoreCandidateSong,
} from "../lib/dj-agent/track-matcher.js";

test("Track Matcher: String Similarity", () => {
  assert.equal(stringSimilarity("Martin Garrix", "Martin Garrix"), 100);
  assert.ok(stringSimilarity("Martin Garrix", "Martin Garrix & Brooks") >= 70);
  assert.ok(stringSimilarity("The Business", "The Business (Remix)") >= 70);
  assert.ok(stringSimilarity("Anyma", "Taylor Swift") < 30);
});

test("Track Matcher: Candidate Scoring (Exact match vs Remix vs Instrumental)", () => {
  const target1 = {
    artist: "Tiësto",
    title: "The Business",
    remix: "220 KID Remix",
  };

  const candExactRemix = {
    name: "The Business (220 KID Remix)",
    artists: [{ name: "Tiësto" }, { name: "220 KID" }],
  };

  const candOtherRemix = {
    name: "The Business (Vintage Culture Remix)",
    artists: [{ name: "Tiësto" }],
  };

  const candInstrumental = {
    name: "The Business (伴奏)",
    artists: [{ name: "Tiësto" }],
  };

  const scoreExact = scoreCandidateSong(target1, candExactRemix);
  const scoreOther = scoreCandidateSong(target1, candOtherRemix);
  const scoreInst = scoreCandidateSong(target1, candInstrumental);

  assert.ok(scoreExact >= 90, `Expected scoreExact >= 90, got ${scoreExact}`);
  assert.ok(scoreExact > scoreOther, "Exact remix should score higher than other remix");
  assert.ok(scoreOther > scoreInst, "Instrumental should be heavily penalized");
  assert.ok(scoreInst < 50, "Instrumental score should be low");
});

test("Track Matcher: Extended Mix preference for DJ", () => {
  const target = {
    artist: "Anyma",
    title: "Syren",
    remix: "",
  };

  const candExtended = {
    name: "Syren (Extended Mix)",
    artists: [{ name: "Anyma" }, { name: "Rebūke" }],
  };

  const candCover = {
    name: "Syren (Cover 翻唱)",
    artists: [{ name: "Someone Else" }],
  };

  const scoreExt = scoreCandidateSong(target, candExtended);
  const scoreCover = scoreCandidateSong(target, candCover);

  assert.ok(scoreExt >= 85);
  assert.ok(scoreCover < 50);
});
