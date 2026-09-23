import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildYesMusicOverlay } from "../harness/yesmusic-overlay.mjs";

const skillsRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "harness", "skills");

test("DSH overlay enables tool-skill and pins YesMusic skill dir", () => {
  const yaml = buildYesMusicOverlay({
    pluginPath: "file:///plugin.mjs",
    skillsDir: "D:/skills",
  });
  assert.equal(yaml.includes("tool-skill"), false);
  assert.match(yaml, /id: skill-filesystem/);
  assert.match(yaml, /includeDefaultRoots: false/);
  assert.match(yaml, /D:\/skills/);
  assert.match(yaml, /id: tool-bash/);
  assert.match(yaml, /disabled: true/);
});

test("YesMusic DSH skills have kebab-case names and descriptions", () => {
  const expected = [
    "search-live-sets",
    "parse-setlist",
    "camelot-mixing",
    "plan-dj-crate",
    "verify-1001tl",
  ];
  const dirs = readdirSync(skillsRoot).filter((name) => !name.startsWith("."));
  assert.deepEqual([...dirs].sort(), [...expected].sort());
  for (const name of expected) {
    const body = readFileSync(join(skillsRoot, name, "SKILL.md"), "utf8");
    assert.match(body, new RegExp(`^---\\r?\\nname: ${name}\\r?\\n`, "m"));
    assert.match(body, /^description:/m);
  }
});
