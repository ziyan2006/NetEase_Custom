/**
 * DJ Camelot 调性轮盘与 BPM 混音过渡计算引擎
 * 支持调性映射 (Standard Key <-> Camelot Code)、调性和谐度评分与 BPM 容差分析
 */

// 标准调性与 Camelot 对应字典
const KEY_TO_CAMELOT = {
  // Minor (A)
  "abm": "1A", "g#m": "1A", "ab minor": "1A", "g# minor": "1A",
  "ebm": "2A", "d#m": "2A", "eb minor": "2A", "d# minor": "2A",
  "bbm": "3A", "a#m": "3A", "bb minor": "3A", "a# minor": "3A",
  "fm": "4A", "f minor": "4A",
  "cm": "5A", "c minor": "5A",
  "gm": "6A", "g minor": "6A",
  "dm": "7A", "d minor": "7A",
  "am": "8A", "a minor": "8A",
  "em": "9A", "e minor": "9A",
  "bm": "10A", "b minor": "10A",
  "f#m": "11A", "gbm": "11A", "f# minor": "11A", "gb minor": "11A",
  "c#m": "12A", "dbm": "12A", "c# minor": "12A", "db minor": "12A",

  // Major (B)
  "b": "1B", "b major": "1B", "b maj": "1B",
  "f#": "2B", "gb": "2B", "f# major": "2B", "gb major": "2B",
  "db": "3B", "c#": "3B", "db major": "3B", "c# major": "3B",
  "ab": "4B", "g#": "4B", "ab major": "4B", "g# major": "4B",
  "eb": "5B", "d#": "5B", "eb major": "5B", "d# major": "5B",
  "bb": "6B", "a#": "6B", "bb major": "6B", "a# major": "6B",
  "f": "7B", "f major": "7B", "f maj": "7B",
  "c": "8B", "c major": "8B", "c maj": "8B",
  "g": "9B", "g major": "9B", "g maj": "9B",
  "d": "10B", "d major": "10B", "d maj": "10B",
  "a": "11B", "a major": "11B", "a maj": "11B",
  "e": "12B", "e major": "12B", "e maj": "12B",
};

const CAMELOT_TO_KEY = {
  "1A": "G#m", "2A": "D#m", "3A": "A#m", "4A": "Fm",
  "5A": "Cm",  "6A": "Gm",  "7A": "Dm",  "8A": "Am",
  "9A": "Em",  "10A": "Bm", "11A": "F#m", "12A": "C#m",
  "1B": "B",   "2B": "F#",  "3B": "Db",  "4B": "Ab",
  "5B": "Eb",  "6B": "Bb",  "7B": "F",   "8B": "C",
  "9B": "G",   "10B": "D",  "11B": "A",  "12B": "E",
};

/**
 * 规范化调性输入为标准 Camelot 格式 (如 '8A', '8B')
 * @param {string} input - 输入调性字符串 (如 'Am', '8A', 'C# Minor', 'F#')
 * @returns {string|null} 规范的 Camelot 字符串 (如 '8A')，若无法解析则返回 null
 */
export function normalizeCamelotKey(input) {
  if (!input || typeof input !== "string") return null;
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, " ");

  // 1. 检查是否已经是合法的 Camelot 格式 (1A-12A 或 1B-12B)
  const camelotMatch = /^([1-9]|1[0-2])([ab])$/i.exec(cleaned);
  if (camelotMatch) {
    return `${camelotMatch[1]}${camelotMatch[2].toUpperCase()}`;
  }

  // 2. 查表匹配标准调性名
  if (KEY_TO_CAMELOT[cleaned]) {
    return KEY_TO_CAMELOT[cleaned];
  }

  // 3. 容错处理 (去除多余修饰符)
  const simplified = cleaned.replace(/(maj|major|min|minor)$/, "").trim();
  if (cleaned.includes("min") && KEY_TO_CAMELOT[`${simplified}m`]) {
    return KEY_TO_CAMELOT[`${simplified}m`];
  }
  if (KEY_TO_CAMELOT[simplified]) {
    return KEY_TO_CAMELOT[simplified];
  }

  return null;
}

/**
 * 将 Camelot 代码还原为标准音乐调性名
 * @param {string} camelotKey - 例如 '8A'
 * @returns {string} 例如 'Am'
 */
export function camelotToStandardKey(camelotKey) {
  const norm = normalizeCamelotKey(camelotKey);
  return norm && CAMELOT_TO_KEY[norm] ? CAMELOT_TO_KEY[norm] : (camelotKey || "Unknown");
}

/**
 * 获取某个调性的所有调性和谐推荐候选项
 * @param {string} baseKey - 当前歌曲调性 (如 '8A' 或 'Am')
 * @returns {Array<{ camelot: string, standard: string, relation: string, energyEffect: string, score: number }>}
 */
export function getCompatibleKeys(baseKey) {
  const norm = normalizeCamelotKey(baseKey);
  if (!norm) return [];

  const num = parseInt(norm.slice(0, -1), 10);
  const letter = norm.slice(-1); // 'A' or 'B'
  const otherLetter = letter === "A" ? "B" : "A";

  const wrapHour = (h) => {
    let r = ((h - 1) % 12) + 1;
    if (r <= 0) r += 12;
    return r;
  };

  const results = [
    {
      camelot: `${num}${letter}`,
      relation: "同调过渡 (Same Key)",
      energyEffect: "情绪完全平稳，音色无缝融合，最安全的混音",
      score: 100,
    },
    {
      camelot: `${wrapHour(num + 1)}${letter}`,
      relation: "+1 顺时针同环 (Adjacent +1)",
      energyEffect: "自然轻微能量递增，适合 Setlist 阶段渐进",
      score: 95,
    },
    {
      camelot: `${wrapHour(num - 1)}${letter}`,
      relation: "-1 逆时针同环 (Adjacent -1)",
      energyEffect: "柔和降温与情绪沉淀，适合段落过渡与收尾",
      score: 95,
    },
    {
      camelot: `${num}${otherLetter}`,
      relation: "相对大小调切换 (Relative Major/Minor)",
      energyEffect: letter === "A" ? "由暗转明（小调转大调），带来开阔感" : "由明转暗（大调转小调），增加深度与张力",
      score: 90,
    },
    {
      camelot: `${wrapHour(num + 2)}${letter}`,
      relation: "+2 能量跃迁 (Energy Boost +2)",
      energyEffect: "显著升调，瞬间拉升舞池能量与情绪高潮",
      score: 80,
    },
    {
      camelot: `${wrapHour(num + 7)}${letter}`,
      relation: "+7 半音调制升调 (Key Modulation +1 Semitone)",
      energyEffect: "强烈的戏剧性升温与能量爆发（Drop 点绝杀）",
      score: 75,
    },
  ];

  return results.map((item) => ({
    ...item,
    standard: camelotToStandardKey(item.camelot),
  }));
}

/**
 * 计算两首曲目之间的过渡和谐度与 BPM 兼容性评分
 * @param {string} fromKey - 起始调性 (如 '8A')
 * @param {number} fromBpm - 起始 BPM (如 126)
 * @param {string} toKey - 目标调性 (如 '9A')
 * @param {number} toBpm - 目标 BPM (如 128)
 */
export function analyzeTransition(fromKey, fromBpm, toKey, toBpm) {
  const normFrom = normalizeCamelotKey(fromKey);
  const normTo = normalizeCamelotKey(toKey);

  let keyScore = 50;
  let keyRelation = "调性冲突 (Dissonant / Needs Key Shift)";
  let harmonicAdvice = "建议通过无调性打击乐段 (Percussion Outro)、黑场过渡或使用 Echo Freeze / Reverb Wash 混音";

  if (normFrom && normTo) {
    const fromNum = parseInt(normFrom.slice(0, -1), 10);
    const fromLet = normFrom.slice(-1);
    const toNum = parseInt(normTo.slice(0, -1), 10);
    const toLet = normTo.slice(-1);

    const diff = (toNum - fromNum + 12) % 12;

    if (normFrom === normTo) {
      keyScore = 100;
      keyRelation = "完美同调 (Same Key)";
      harmonicAdvice = "极度和谐，可进行长时间长线条 Bassline / Lead 双轨重叠叠音混音";
    } else if (fromLet === toLet && (diff === 1 || diff === 11)) {
      keyScore = 95;
      keyRelation = diff === 1 ? "+1 顺时针递进 (Smooth Boost)" : "-1 逆时针沉淀 (Smooth Chill)";
      harmonicAdvice = "经典五度圈过渡，旋律交织极其平滑，适合主混音段落衔接";
    } else if (fromNum === toNum && fromLet !== toLet) {
      keyScore = 90;
      keyRelation = "平行/相对大小调转换 (Relative Switch)";
      harmonicAdvice = "音阶共用音极多，带来明暗情绪的反转冲突，极具艺术张力";
    } else if (fromLet === toLet && diff === 2) {
      keyScore = 80;
      keyRelation = "+2 能量跳跃 (Energy Lift)";
      harmonicAdvice = "全音升调，带来直接的能量提升，适合在 Build-up 阶段快速切换";
    } else if (fromLet === toLet && diff === 7) {
      keyScore = 75;
      keyRelation = "+7 半音升调调制 (Modulation Shift)";
      harmonicAdvice = "半音上扬，制造舞池能量爆炸感，适合在 Drop 切换时直接切入";
    } else if (fromLet !== toLet && (diff === 1 || diff === 11)) {
      keyScore = 70;
      keyRelation = "对角线调性混音 (Diagonal Harmonic)";
      harmonicAdvice = "调性有一定关联度，建议避开重叠旋律，在鼓点段完成过渡";
    }
  }

  // BPM 差异分析
  let bpmDeltaPercent = 0;
  let bpmStatus = "safe";
  let bpmAdvice = "BPM 完全吻合或差距极小，直接推子对齐 (Sync)";

  if (fromBpm && toBpm) {
    bpmDeltaPercent = ((toBpm - fromBpm) / fromBpm) * 100;
    const absDelta = Math.abs(bpmDeltaPercent);

    // 检查是否为 Double Time / Half Time 混音 (如 70 BPM <-> 140 BPM, 87 BPM <-> 174 BPM)
    const ratio = toBpm / fromBpm;
    const isHalfTime = Math.abs(ratio - 0.5) < 0.05;
    const isDoubleTime = Math.abs(ratio - 2.0) < 0.05;

    if (isDoubleTime || isHalfTime) {
      bpmStatus = "double_half";
      bpmAdvice = isDoubleTime
        ? `Double-Time 倍速过渡 (${fromBpm} -> ${toBpm})，适合 House/Techno 切换至 Drum & Bass / Dubstep`
        : `Half-Time 半速过渡 (${fromBpm} -> ${toBpm})，适合高能量段落切换至 Trap / Halftime`;
    } else if (absDelta <= 3) {
      bpmStatus = "safe";
      bpmAdvice = `BPM 差距微小 (${bpmDeltaPercent >= 0 ? "+" : ""}${bpmDeltaPercent.toFixed(1)}%)，标准微调推子平滑过渡`;
    } else if (absDelta <= 6) {
      bpmStatus = "moderate";
      bpmAdvice = `BPM 差距适中 (${bpmDeltaPercent >= 0 ? "+" : ""}${bpmDeltaPercent.toFixed(1)}%)，建议开启 Key Lock / Master Tempo 避免音调跑调`;
    } else {
      bpmStatus = "wide";
      bpmAdvice = `BPM 跨度较大 (${bpmDeltaPercent >= 0 ? "+" : ""}${bpmDeltaPercent.toFixed(1)}%)，建议在 Drop 尾音使用 Reverb/Loop 或刹车 (Brake) 切换`;
    }
  }

  // 综合总评分
  const bpmScore = bpmStatus === "safe" ? 100 : (bpmStatus === "moderate" ? 80 : (bpmStatus === "double_half" ? 90 : 50));
  const totalScore = Math.round(keyScore * 0.6 + bpmScore * 0.4);

  return {
    from: { key: normFrom || fromKey, standardKey: camelotToStandardKey(normFrom), bpm: fromBpm },
    to: { key: normTo || toKey, standardKey: camelotToStandardKey(normTo), bpm: toBpm },
    keyScore,
    keyRelation,
    harmonicAdvice,
    bpmDeltaPercent: Number(bpmDeltaPercent.toFixed(1)),
    bpmStatus,
    bpmAdvice,
    totalScore,
    isRecommended: totalScore >= 75,
  };
}
