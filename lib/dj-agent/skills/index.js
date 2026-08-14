/**
 * DJ Agent Skills 注册聚合与统一导出入口
 */

import { defaultSkillRegistry } from "./skill-registry.js";
import { scraperSkill } from "./scraper-skill.js";
import { searchSkill } from "./search-skill.js";
import { camelotSkill } from "./camelot-skill.js";
import { radarSkill } from "./radar-skill.js";
import { chatSkill } from "./chat-skill.js";

// 注册所有标准技能
defaultSkillRegistry.register(scraperSkill);
defaultSkillRegistry.register(searchSkill);
defaultSkillRegistry.register(camelotSkill);
defaultSkillRegistry.register(radarSkill);
defaultSkillRegistry.register(chatSkill);

export {
  defaultSkillRegistry,
  scraperSkill,
  searchSkill,
  camelotSkill,
  radarSkill,
  chatSkill,
};
