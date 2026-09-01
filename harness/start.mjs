import { access, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const harnessDirectory = dirname(fileURLToPath(import.meta.url));
const pluginPath = join(harnessDirectory, "dj-crate-plugin.mjs");
const profileHome = process.env.DSH_HOME || join(harnessDirectory, ".dsh-home");
const runtimeDirectory = process.env.YESMUSIC_HARNESS_RUNTIME_DIR || join(profileHome, "runtime");
const overlayPath = join(runtimeDirectory, "yesmusic-dj-crate.overlay.yml");
const defaultBridgeUrl = "http://127.0.0.1:4178";

try {
  await access(join(harnessDirectory, "node_modules", "@deepseek-ai", "dsh-tools"));
} catch {
  throw new Error("Harness 插件依赖未安装。请先执行 npm --prefix harness install。");
}

await mkdir(runtimeDirectory, { recursive: true });
const pluginPathForYaml = pathToFileURL(pluginPath).href;
await writeFile(
  overlayPath,
  [
    "- insert:",
    "    - id: yesmusic-dj-crate-tools",
    `      name: ${JSON.stringify(pluginPathForYaml)}`,
    "- id: tool-bash",
    "  disabled: true",
    "- id: tool-pwsh",
    "  disabled: true",
    "- id: tool-fs",
    "  disabled: true",
    "- id: tool-fs-search",
    "  disabled: true",
    "- id: tool-web",
    "  disabled: true",
    "- id: web-search-deepseek",
    "  disabled: true",
    "- id: tool-skill",
    "  disabled: true",
    "- id: skill-filesystem",
    "  disabled: true",
    "- id: tool-subagent",
    "  disabled: true",
    "- id: tool-subagent-fork",
    "  disabled: true",
    "- id: tool-subagent-control",
    "  disabled: true",
  ].join("\n") + "\n",
  "utf8",
);

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(
  npxCommand,
  ["--yes", "@deepseek-ai/dsh@0.1.0-rc.6", "--profile", "web", "--patch", overlayPath, ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DSH_HOME: profileHome,
      YESMUSIC_AGENT_BRIDGE_URL: process.env.YESMUSIC_AGENT_BRIDGE_URL || defaultBridgeUrl,
    },
  },
);

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
