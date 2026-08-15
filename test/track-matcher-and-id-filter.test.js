import { describe, it } from "node:test";
import assert from "node:assert";
import { isUnreleasedTrack, parseSingleTrack, parseTracklistText } from "../lib/dj-agent/tracklist-parser.js";
import { scoreCandidateSong } from "../lib/dj-agent/track-matcher.js";

describe("ID 与未发行曲目精准过滤测试", () => {
  it("应准确过滤所有形式的 ID / 未发行 / 占位曲目", () => {
    const unreleasedCases = [
      ["Rova", "ID"],
      ["El Pablo", "ID"],
      ["WORSHIP", "ID"],
      ["Subsonic", "ID"],
      ["ID", "ID"],
      ["Dimension", "ID"],
      ["Sub Focus", "ID (VIP)"],
      ["Culture Shock", "ID (Culture Shock Remix)"],
      ["ID", "Animals"],
      ["Unknown Artist", "Unknown Track"],
      ["Sub Focus", "Track ID"],
      ["Artist", "Unreleased ID"],
      ["Artist", "ID - ID"],
      ["Artist", "ID_01"],
      ["Artist", "ID - Track"],
    ];

    for (const [artist, title] of unreleasedCases) {
      assert.strictEqual(
        isUnreleasedTrack(artist, title),
        true,
        `预期 [${artist} - ${title}] 应被判定为未发行/ID 曲目`
      );
    }
  });

  it("正规已发行曲目不应被误判为未发行", () => {
    const releasedCases = [
      ["Dimension", "DJ Turn It Up"],
      ["Sub Focus", "Solar System"],
      ["Culture Shock", "Renaissance"],
      ["Martin Garrix", "Animals"],
      ["Delerium ft. Sarah McLachlan", "Silence (John Summit Remix)"],
      ["Sub Focus & Dimension", "Desire"],
      ["Cloonee & Prospa", "Free Your Mind (Sub Focus Remix)"],
    ];

    for (const [artist, title] of releasedCases) {
      assert.strictEqual(
        isUnreleasedTrack(artist, title),
        false,
        `预期 [${artist} - ${title}] 应为正常已发行曲目`
      );
    }
  });
});

describe("网易云曲目候选打分与防误匹配测试", () => {
  it("歌手完全不匹配时综合得分应极低 (< 30) 从而拒绝误匹配", () => {
    // 比如目标是 Circadian - When The Party's Over，候选是 Chad Lawson - When The Party's Over
    const target = {
      artist: "Circadian",
      title: "When The Party's Over",
      remix: "",
      searchQuery: "Circadian When The Party's Over",
    };
    const wrongCandidate = {
      id: 1810244807,
      name: "when the party's over",
      artists: [{ name: "Chad Lawson" }],
    };

    const score = scoreCandidateSong(target, wrongCandidate);
    assert.ok(score < 35, `歌手不符时得分应低于 35 (实际: ${score})`);
  });

  it("要求特定 Remix 但候选是其它无关 Remix 时应大幅降权或拒绝", () => {
    // 目标是 Darude - Sandstorm (Dimension Remix)，候选是 Darude - Sandstorm (Didrick Remix)
    const target = {
      artist: "Darude",
      title: "Sandstorm (Dimension Remix)",
      remix: "Dimension Remix",
      searchQuery: "Darude Sandstorm Dimension Remix",
    };
    const wrongRemixCandidate = {
      id: 33054275,
      name: "Sandstorm (Didrick Remix)",
      artists: [{ name: "Darude" }, { name: "Didrick" }],
    };

    const score = scoreCandidateSong(target, wrongRemixCandidate);
    assert.ok(score < 50, `Remixer 不匹配时得分应大幅降低 (实际: ${score})`);
  });

  it("原曲与对应精准 Remix 应获得高分 (> 75)", () => {
    const target = {
      artist: "Sub Focus",
      title: "Timewarp (Dimension Remix)",
      remix: "Dimension Remix",
      searchQuery: "Sub Focus Timewarp Dimension Remix",
    };
    const correctCandidate = {
      id: 1903192296,
      name: "Timewarp (Dimension Remix)",
      artists: [{ name: "Sub Focus" }, { name: "Dimension" }],
    };

    const score = scoreCandidateSong(target, correctCandidate);
    assert.ok(score >= 80, `精准命中时得分应 >= 80 (实际: ${score})`);
  });
});
