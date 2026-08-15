import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { resolveChromeExecutablePath } from "../lib/dj-agent/chrome-resolver.js";

test("Chrome Resolver: Should resolve valid Chrome path or fallback gracefully", () => {
  const resolved = resolveChromeExecutablePath();
  console.log("Resolved Chrome executable path on this machine:", resolved);

  if (resolved) {
    assert.strictEqual(typeof resolved, "string");
    assert.strictEqual(fs.existsSync(resolved), true, `Resolved path must exist: ${resolved}`);
  }
});
