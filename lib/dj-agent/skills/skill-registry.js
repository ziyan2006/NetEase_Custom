/**
 * 技能注册中心与渐进式披露管理器 (Skill Registry & Progressive Disclosure Manager)
 */

export class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  /**
   * 注册一个技能
   * @param {object} skill
   */
  register(skill) {
    if (!skill.name) throw new Error("Skill 必须包含 name 字段");
    this.skills.set(skill.name, skill);
  }

  /**
   * 获取指定技能
   * @param {string} name
   * @returns {object|undefined}
   */
  get(name) {
    return this.skills.get(name);
  }

  /**
   * 获取所有已注册的技能列表
   * @returns {Array<object>}
   */
  getAll() {
    return Array.from(this.skills.values());
  }

  /**
   * 生成供 LLM 第一阶段自主决策使用的轻量级技能目录 (极简 Token 消耗)
   * @returns {string}
   */
  getLightweightCatalogPrompt() {
    const list = this.getAll().map((s, idx) => {
      const paramDesc = s.parameters
        ? Object.entries(s.parameters)
            .map(([k, v]) => `${k} (${v.type || "string"}: ${v.description || ""})`)
            .join(", ")
        : "无";
      return `${idx + 1}. [${s.name}] - ${s.displayName}\n   功能说明: ${s.shortDescription}\n   触发场景: ${s.triggersWhen}\n   参数定义: { ${paramDesc} }`;
    });

    return `
你是一位顶级专业 AI DJ 智能体调度大脑。
请根据用户的最新输入和历史对话，从下方技能目录中【自主选择最精准匹配的一个技能】，并提取调用该技能所需的结构化参数：

--- 技能目录 (Skill Catalog) ---
${list.join("\n\n")}

--- 决策要求 ---
1. 你必须仔细理解用户的真实自然语言意图，即使意图中包含错别字、口语化表达或隐式需求。
2. 当用户提到某个具体的演出名称、想要获取或解析某个 DJ/音乐节现场（如 'Sub Focus @ Rampage', '已锁定：Sub Focus Mainstage...', 'Martin Garrix Tomorrowland' 等）的曲目或歌单时，【必须选择 1001tl_setlist_scraper】！
3. 当用户只是模糊询问某位 DJ 最近有什么演出但未指定具体某一场时，选择 live_set_search。
4. 你必须以严格的 JSON 格式输出决策（严禁包含任何 Markdown 标记或外部额外字符）：
{
  "skill": "选中的技能名称 (如 1001tl_setlist_scraper, live_set_search 等)",
  "parameters": {
    "参数名": "提取的参数值"
  },
  "thought": "简述你选择该技能的决策逻辑 (1句话)"
}
`.trim();
  }
}

export const defaultSkillRegistry = new SkillRegistry();
