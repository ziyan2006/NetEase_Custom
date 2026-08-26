import test from "node:test";
import assert from "node:assert/strict";
import { defaultSkillRegistry, crateDiggerSkill } from "../lib/dj-agent/skills/index.js";
import { reorderSetByCamelot, findDoubleDropPairs } from "../lib/dj-agent/camelot-engine.js";

test("DJ Crate Digger: Skill Registry Registration", () => {
  assert.ok(defaultSkillRegistry.get("dj_crate_digger"), "dj_crate_digger should be registered in registry");
  assert.equal(crateDiggerSkill.name, "dj_crate_digger");
  assert.ok(crateDiggerSkill.displayName.includes("Crate Digger"));

  const catalogPrompt = defaultSkillRegistry.getLightweightCatalogPrompt();
  assert.ok(catalogPrompt.includes("dj_crate_digger"), "Catalog prompt must include dj_crate_digger");
});

test("DJ Crate Digger: Two-round Intake Questionnaire State Machine", async () => {
  // 1. 触发词但未答复 -> 返回第 1 轮问卷
  const streamEvents1 = [];
  const res1 = await crateDiggerSkill.execute(
    { message: "我想挖歌排个 set" },
    {
      onStream: (evt) => streamEvents1.push(evt),
      history: [],
    }
  );

  assert.equal(res1.type, "intake_form");
  assert.equal(res1.round, 1);
  assert.ok(streamEvents1.some((e) => e.data.includes("【第一轮：必要信息】")));

  // 2. 填写了第 1 轮问卷 -> 返回第 2 轮问卷
  const round1Answer = "```markdown\n场景：地下俱乐部\n目标国家 / 地区：中国大陆\n核心声音方向：Skream, UK Bass\n歌曲数量或 Set 时长：30 首\n输出版本：简要版\n其他限制：不要口水歌\n```";

  const streamEvents2 = [];
  const res2 = await crateDiggerSkill.execute(
    { message: round1Answer },
    {
      onStream: (evt) => streamEvents2.push(evt),
      history: [{ role: "assistant", content: "【第一轮：必要信息】..." }],
    }
  );

  assert.equal(res2.type, "intake_form");
  assert.equal(res2.round, 2);
  assert.ok(streamEvents2.some((e) => e.data.includes("【第二轮：需求细化】")));
});

test("DJ Crate Digger: Circle of Fifths Harmonic Reordering", () => {
  const unorderedTracks = [
    { trackNumber: 1, artist: "Artist A", name: "Track 1", musical_key: "11A", bpm: 130 },
    { trackNumber: 2, artist: "Artist B", name: "Track 2", musical_key: "8A", bpm: 128 },
    { trackNumber: 3, artist: "Artist C", name: "Track 3", musical_key: "10A", bpm: 130 },
    { trackNumber: 4, artist: "Artist D", name: "Track 4", musical_key: "9A", bpm: 129 },
    { trackNumber: 5, artist: "Artist E", name: "Track 5", musical_key: "8B", bpm: 128 },
    { trackNumber: 6, artist: "Artist F", name: "Track 6", musical_key: "Unknown", bpm: 128 },
  ];

  const reordered = reorderSetByCamelot(unorderedTracks);
  assert.equal(reordered.length, 6);

  // 验证未知调性的曲目保留在末尾作为“待试听定位”组
  const lastTrack = reordered[reordered.length - 1];
  assert.equal(lastTrack.musical_key, "Unknown");

  // 验证前 5 首已知调性的曲目按五度圈相邻关系排列
  const keys = reordered.slice(0, 5).map((t) => t.musical_key);
  // 从 8A 出发，相邻过渡应当为 8B/9A, 10A, 11A 等连续环
  assert.ok(keys.includes("8A"));
  assert.ok(keys.includes("9A"));
  assert.ok(keys.includes("10A"));
  assert.ok(keys.includes("11A"));
});

test("DJ Crate Digger: Double Drop Pair Detection", () => {
  const setTracks = [
    { trackNumber: 1, artist: "Skream", name: "Midnight Request Line", musical_key: "8A", bpm: 140 },
    { trackNumber: 2, artist: "Benga", name: "Night", musical_key: "8A", bpm: 140 },
    { trackNumber: 3, artist: "Hamdi", name: "Skanka", musical_key: "9A", bpm: 140 },
    { trackNumber: 4, artist: "Sub Focus", name: "Desire", musical_key: "9A", bpm: 174 },
    { trackNumber: 5, artist: "Dimension", name: "DJ Turn It Up", musical_key: "9A", bpm: 174 },
  ];

  const doubleDrops = findDoubleDropPairs(setTracks);
  assert.ok(doubleDrops.length >= 2, "Should find at least 2 double drop pairs");

  // 1. Skream (8A/140) & Benga (8A/140) -> 完美同调同速 Double Drop
  const pair1 = doubleDrops.find((p) => p.trackIndexA === 1 && p.trackIndexB === 2);
  assert.ok(pair1, "Track 1 & Track 2 should be a valid double drop candidate");
  assert.ok(pair1.keyMatch.includes("完美同调"));
  assert.ok(pair1.bpmMatch.includes("0.0%"));

  // 2. Sub Focus (9A/174) & Dimension (9A/174) -> 同调同速 DnB Double Drop
  const pair2 = doubleDrops.find((p) => p.trackIndexA === 4 && p.trackIndexB === 5);
  assert.ok(pair2, "Track 4 & Track 5 should be a valid double drop candidate");
  assert.ok(pair2.bpmMatch.includes("0.0%"));
});
