import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { buildYesMusicOverlay } from "./yesmusic-overlay.mjs";

const harnessDirectory = dirname(fileURLToPath(import.meta.url));
const sdkHome = process.env.DSH_HOME || join(harnessDirectory, ".sdk-home");
const profileDirectory = join(sdkHome, "profiles", "sdk");
const runtimeDirectory = process.env.YESMUSIC_HARNESS_RUNTIME_DIR || join(sdkHome, "runtime");
const overlayPath = join(runtimeDirectory, "sdk.overlay.yml");
const pluginPath = join(harnessDirectory, "dj-crate-plugin.mjs");
const skillsDir = join(harnessDirectory, "skills");

await mkdir(profileDirectory, { recursive: true });
await mkdir(runtimeDirectory, { recursive: true });
await writeFile(join(profileDirectory, "cordis.yml"), "[]\n", "utf8");
await writeFile(join(profileDirectory, "cordis.patch.yml"), "[]\n", "utf8");
await writeFile(join(profileDirectory, "pnpm-workspace.yaml"), "packages:\n  - .\n\nnodeLinker: hoisted\n", "utf8");
await writeFile(
  join(profileDirectory, "package.json"),
  JSON.stringify({
    name: "yesmusic-dj-harness-sdk-profile",
    private: true,
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } },
  }, null, 2) + "\n",
  "utf8",
);

const require = createRequire(import.meta.url);
const dshPackage = dirname(require.resolve("@deepseek-ai/dsh/package.json"));
const sdkServerPackage = dirname(require.resolve("@deepseek-ai/dsh-sdk-jsonrpc-server/package.json"));
const pluginPathForYaml = pathToFileURL(pluginPath).href;
const sdkServerPathForYaml = pathToFileURL(join(sdkServerPackage, "lib", "index.js")).href;
await writeFile(
  overlayPath,
  buildYesMusicOverlay({
    pluginPath: pluginPathForYaml,
    skillsDir,
    extraInsert: [
      "    - id: sdk-jsonrpc-server",
      `      name: ${JSON.stringify(sdkServerPathForYaml)}`,
    ],
  }),
  "utf8",
);

const child = spawn(
  process.execPath,
  [join(dshPackage, "lib", "bin.js"), "--profile", "sdk", "--patch", overlayPath],
  {
    cwd: runtimeDirectory,
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      DSH_HOME: sdkHome,
      DSH_BUNDLED_SKILL_DIR: skillsDir,
      DSH_PERMISSION_MODE: "read-only",
      DSH_TOOLS_MODE: "restricted",
      DSH_TELEMETRY_MODE: "DISABLED",
    },
  },
);

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
