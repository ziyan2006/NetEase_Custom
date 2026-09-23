/**
 * Shared Cordis overlay for YesMusic's restricted DSH profile.
 * Tools stay in dj-crate-plugin; playbooks live in harness/skills.
 */

export function buildYesMusicOverlay({ pluginPath, extraInsert = [], skillsDir }) {
  const insert = [
    "    - id: yesmusic-dj-crate-tools",
    `      name: ${JSON.stringify(pluginPath)}`,
    ...extraInsert,
  ];

  return [
    "- insert:",
    ...insert,
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
    "- id: tool-subagent",
    "  disabled: true",
    "- id: tool-subagent-fork",
    "  disabled: true",
    "- id: tool-subagent-control",
    "  disabled: true",
    "- id: skill-filesystem",
    "  config:",
    "    includeDefaultRoots: false",
    "    customSkillDirs:",
    `      - ${JSON.stringify(skillsDir)}`,
  ].join("\n") + "\n";
}
