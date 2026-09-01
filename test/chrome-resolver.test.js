import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { resolveChromeExecutablePath, resolveChromeUserDataDir } from "../lib/dj-agent/chrome-resolver.js";

test("Chrome Resolver: Should resolve valid Chrome path or fallback gracefully", () => {
  const resolved = resolveChromeExecutablePath();
  console.log("Resolved Chrome executable path on this machine:", resolved);

  if (resolved) {
    assert.strictEqual(typeof resolved, "string");
    assert.strictEqual(fs.existsSync(resolved), true, `Resolved path must exist: ${resolved}`);
  }
});

test("Chrome Resolver: user data dir is cwd-relative and has no drive colon", () => {
  const dir = resolveChromeUserDataDir();
  assert.equal(dir, "data/chrome-profile");
  assert.equal(dir.includes(":"), false);
  assert.equal(fs.existsSync(path.resolve(process.cwd(), "data", "chrome-profile")), true);
});
