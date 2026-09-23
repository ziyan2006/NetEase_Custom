/**
 * 1001Tracklists 现场 Setlist 与文本歌单解析器
 * 支持 URL 在线页面抓取、剪贴板/手写 Setlist 正则与 NLP 提取，并自动过滤 ID/未发行曲目
 */

import { fetchReal1001Tracklist, searchReal1001Tracklists } from "./real-1001tl-scraper.js";
export { fetchReal1001Tracklist, searchReal1001Tracklists };

/**
 * 检查曲目是否为未发行 (ID) 或无效占位曲目
 * @param {string} artist
 * @param {string} title
 * @returns {boolean}
 */
export function isUnreleasedTrack(artist, title) {
  if (!artist && !title) return true;
  const a = (artist || "").trim().toLowerCase();
  const t = (title || "").trim().toLowerCase();
  const full = `${a} - ${t}`;

  // 1. 完全是 ID 或包含无意义占位
  if (a === "id" || t === "id" || full === "id - id") return true;
  if (/^id\s*$/i.test(t) || /^id\s*$/i.test(a)) return true;
  if (/^id\b/i.test(t) || /\bid$/i.test(t) || /\s+[-–—]\s+id$/i.test(full)) return true;
  if (/^id\s*[\(_-]/i.test(t)) return true;
  if (/^id\s*\(.*\)$/i.test(t)) return true;
  if (/^id\s*[-–—]\s*id/i.test(full)) return true;
  if (/\btrack\s*id\b/i.test(t) || /\bid\s*track\b/i.test(t)) return true;

  // 2. 占位文本或未发行标识
  if (a === "unknown" || a === "unknown artist" || a === "?") return true;
  if (t === "unknown" || t === "unknown track" || t === "?") return true;
  if (t.includes("unreleased") || full.includes("unreleased")) return true;
  if (/\bunreleased\s+id\b/i.test(full)) return true;

  // 3. 类似 "ID_01", "ID 02" 格式
  if (/^id[_\s-]?\d{1,3}$/i.test(t) || /^id[_\s-]?\d{1,3}$/i.test(a)) return true;

  return false;
}

export function isReal1001TracklistUrl(url) {
  const value = String(url || "").trim();
  if (!/^https?:\/\/(?:www\.)?1001tracklists\.com\/tracklist\//i.test(value)) return false;
  if (/\/tracklist\/dynamic\//i.test(value)) return false;
  return /\/tracklist\/[a-z0-9]+\/[^/\s]+/i.test(value);
}

/**
 * 清洗单行曲目标签与时间戳等无用信息
 * @param {string} rawLine
 * @returns {{ cleanLine: string, timestamp: string, label: string }}
 */
export function cleanTracklistLine(rawLine) {
  let line = (rawLine || "").trim();

  // 提取并去除时间戳 (如 [00:00], [1:23:45], 02:30, 45:10)
  let timestamp = "";
  const timeMatch = /\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?/i.exec(line);
  if (timeMatch) {
    timestamp = timeMatch[1];
    line = line.replace(timeMatch[0], " ");
  }

  // 提取并去除开头的序号 (如 01., 1., #1, [01])
  line = line.replace(/^\[?\d{1,3}\]?[\.\s、-]+\s*/i, "");

  // 提取并去除厂牌标签 (如 [STMPD], [SPINNIN' RECORDS], [DEFECTED], [WHITE LABEL])
  let label = "";
  const labelMatch = /\[([^\]]+)\]\s*$/i.exec(line);
  if (labelMatch) {
    label = labelMatch[1].trim();
    line = line.replace(labelMatch[0], " ");
  }

  // 去除多余空格与不可见字符
  line = line.replace(/\s+/g, " ").trim();

  return { cleanLine: line, timestamp, label };
}

/**
 * 按 Mashup 分隔符 (vs. / w/ / |) 拆分组合行, 括号内的分隔符不参与拆分
 * 例: "Alan Walker vs. RetroVision - Alone vs. Get Down (Alan Walker Mashup)"
 */
function splitMashupParts(line) {
  const protectedParts = [];
  const masked = line.replace(/\([^)]*\)/g, (m) => {
    protectedParts.push(m);
    return `\u0000${protectedParts.length - 1}\u0000`;
  });
  const pieces = masked.split(/\s+vs\.?\s+|\s+w\/\s+|\s*\|\s*/i);
  return pieces.map((p) => p.replace(/\u0000(\d+)\u0000/g, (_, i) => protectedParts[Number(i)]).trim()).filter(Boolean);
}

/**
 * 从清洗后的单行文本解析出 Artist, Title, Remix 等结构化信息
 * @param {string} line - 比如 "Tiësto - The Business (220 KID Remix)"
 * @returns {Array<{ artist: string, title: string, remix: string, raw: string, isMashup: boolean }>}
 */
export function parseSingleTrack(line) {
  if (!line || typeof line !== "string") return [];

  // 检查是否为 Mashup / Bootleg 组合 (如 "Artist A - Track A vs. Artist B - Track B" / "A - T | B - T" / "A - T w/ B - T")
  const mashupPattern = /\s+vs\.?\s+|\s+w\/\s+|\s*\|\s*/i;
  if (mashupPattern.test(line.replace(/\([^)]*\)/g, ""))) {
    const parts = splitMashupParts(line);
    const subTracks = [];
    let prevArtist = "";
    for (const part of parts) {
      const parsed = parseStandardArtistTitle(part);
      if (parsed && parsed.artist && parsed.title) {
        subTracks.push({ ...parsed, raw: part, isMashup: true });
        prevArtist = parsed.artist;
      } else if (parsed && parsed.title && !parsed.artist && prevArtist) {
        // 只有歌名没有艺人 (如 "Get Down (Alan Walker Mashup)") → 复用前一部分的艺人
        subTracks.push({ ...parsed, artist: prevArtist, raw: part, isMashup: true });
      }
      // 只有艺人没有歌名的片段 (如 "Alan Walker") → 无法可靠匹配, 跳过
    }
    if (subTracks.length > 0) return subTracks;
  }

  const parsed = parseStandardArtistTitle(line);
  return parsed ? [{ ...parsed, raw: line, isMashup: false }] : [];
}

function parseStandardArtistTitle(text) {
  if (!text) return null;

  // 寻找 "Artist - Title" 分隔符（横杠、破折号等）
  const splitMatch = /\s*[-–—]\s*/.exec(text);
  let artist = "";
  let title = "";

  if (splitMatch) {
    artist = text.slice(0, splitMatch.index).trim();
    title = text.slice(splitMatch.index + splitMatch[0].length).trim();
  } else {
    // 无明显横杠，尝试根据引号或逗号划分，若无则作为 title
    title = text.trim();
  }

  // 提取 Remix / Edit / Mix 信息
  let remix = "";
  const remixMatch = /\(([^)]*(?:remix|mix|edit|vip|bootleg|flip|rework|dub)[^)]*)\)/i.exec(title);
  if (remixMatch) {
    remix = remixMatch[1].trim();
  }

  // 构造搜索专用的干净关键词 (保留具体制作人与 Remix 信息，例如 "Sub Focus X-Ray Metrik Remix")
  const cleanTitleForSearch = title.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  const searchQuery = `${artist} ${cleanTitleForSearch}`.replace(/\s+/g, " ").trim();

  return {
    artist,
    title,
    remix,
    searchQuery,
  };
}

/**
 * 解析多行 Setlist 纯文本
 * @param {string} fullText - 多行文本
 * @param {object} options - 选项 { filterUnreleased: true }
 * @returns {{ tracks: Array<object>, totalCount: number, filteredCount: number }}
 */
export function parseTracklistText(fullText, options = { filterUnreleased: true }) {
  if (!fullText || typeof fullText !== "string") {
    return { tracks: [], totalCount: 0, filteredCount: 0 };
  }

  const lines = fullText.split(/\r?\n/);
  const tracks = [];
  let filteredCount = 0;
  let trackIndex = 1;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    const { cleanLine, timestamp, label } = cleanTracklistLine(trimmed);
    if (!cleanLine) continue;

    const parsedItems = parseSingleTrack(cleanLine);
    for (const item of parsedItems) {
      const isUnrel = isUnreleasedTrack(item.artist, item.title);
      if (isUnrel && options.filterUnreleased !== false) {
        filteredCount++;
        continue;
      }

      tracks.push({
        trackNumber: trackIndex++,
        artist: item.artist,
        title: item.title,
        remix: item.remix,
        searchQuery: item.searchQuery,
        timestamp,
        label,
        isUnreleased: isUnrel,
        isMashup: item.isMashup,
        raw: trimmed,
      });
    }
  }

  return {
    tracks,
    totalCount: tracks.length + filteredCount,
    filteredCount,
  };
}

/**
 * 抓取并解析 1001Tracklists 网页 URL (包含真实浏览器穿透与高速会话复用)
 * @param {string} url - 例如 https://www.1001tracklists.com/tracklist/275yqjmt/...
 * @param {object} options - { filterUnreleased: true, onProgress: Function }
 * @returns {Promise<{ title: string, dj: string, tracks: Array<object>, totalCount: number, filteredCount: number, source: string }>}
 */
export async function fetchAndParse1001TracklistUrl(url, options = {}) {
  if (!url || !url.includes("1001tracklists.com")) {
    throw new Error("无效的 1001Tracklists 链接，请提供以 https://www.1001tracklists.com/ 开头的 URL");
  }

  // 1. 优先调用真实浏览器穿透引擎与 Cookie 缓存，获取 100% 真实原站 DOM 音轨
  if (!options.skipRealScraper && !process.env.YESMUSIC_SKIP_REAL_SCRAPER) {
    try {
      const realResult = await fetchReal1001Tracklist(url, options);
      if (realResult?.source === "needs_verify") {
        return realResult;
      }
      if (realResult && realResult.tracks && realResult.tracks.length > 0) {
        return realResult;
      }
    } catch (err) {
      console.warn("[Real 1001TL Scraper Note]:", err.message);
    }
  }

  // 2. 普通 HTTP 快速尝试
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Cache-Control": "no-cache",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (response.ok) {
      const html = await response.text();
      const parsed = parse1001TracklistHtml(html, options);
      if (parsed.tracks && parsed.tracks.length > 0) {
        return { ...parsed, source: "1001tracklists_http" };
      }
    }
  } catch {
    clearTimeout(timer);
  }

  const urlSlugMatch = /tracklist\/[a-zA-Z0-9]+\/([^\/.]+)/i.exec(url);
  const rawSlug = urlSlugMatch ? urlSlugMatch[1].replace(/-/g, " ") : "1001Tracklists Live Set";
  const formattedTitle = rawSlug.replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: formattedTitle,
    dj: "",
    tracks: [],
    totalCount: 0,
    filteredCount: 0,
    source: "unavailable",
    error: "未能从 1001Tracklists 解析到曲目。链接可能失效、被拦截，或需要粘贴页面中的曲目文本。",
  };
}

/**
 * 从 1001Tracklists 的 HTML 源码提取 Set 标题、DJ 与曲目列表
 * @param {string} html
 * @param {object} options
 */
function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * 结构化解析 1001Tracklists 页面 HTML 源代码（支持多策略高容错提取）：
 * 策略 1: Schema.org MusicRecording 结构化元数据（准确率 100%）
 * 策略 2: DOM 节点 class 逐块正则扫描 (tlpItem / tlpTog / trackValue / remixValue / artist links)
 * 策略 3: JSON-LD application/ld+json 解析
 * @param {string} html
 * @param {object} options
 */
export function parse1001TracklistHtml(html, options = { filterUnreleased: true }) {
  if (!html) return { title: "Unknown Set", dj: "", tracks: [], totalCount: 0, filteredCount: 0 };

  // 1. 提取 Set 标题
  let title = "1001Tracklists Live Set";
  const titleMatch = /<title>([^<]+)<\/title>/i.exec(html) || /<h1[^>]*id="pageTitle"[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "").replace(/Tracklist\s*\|\s*1001Tracklists.*$/i, "").trim());
  }

  // 2. 提取 DJ 艺人名
  let dj = "";
  const djMatch = /<meta\s+name="author"\s+content="([^"]+)"/i.exec(html) ||
                  /<a\s+href="\/dj\/[^"]+"[^>]*>([^<]+)<\/a>/i.exec(html);
  if (djMatch) {
    dj = decodeHtmlEntities(djMatch[1].trim());
  }

  const rawTextLines = [];

  // 策略 1: 扫描所有 itemprop="tracks" MusicRecording 节点
  const recordingRegex = /<div[^>]*itemprop=["']tracks["'][^>]*itemtype=["']http:\/\/schema\.org\/MusicRecording["'][^>]*>([\s\S]*?)<\/div>/gi;
  let recMatch;
  while ((recMatch = recordingRegex.exec(html)) !== null) {
    const block = recMatch[1];
    const nameMeta = /<meta\s+itemprop=["']name["']\s+content=["']([^"']+)["']/i.exec(block);
    const byArtistMeta = /<meta\s+itemprop=["']byArtist["']\s+content=["']([^"']+)["']/i.exec(block);

    if (nameMeta && nameMeta[1]) {
      const decodedName = decodeHtmlEntities(nameMeta[1].trim());
      const decodedArtist = byArtistMeta ? decodeHtmlEntities(byArtistMeta[1].trim()) : "";

      let rawLine = decodedName;
      if (decodedArtist && !decodedName.startsWith(decodedArtist) && !decodedName.includes(" - ")) {
        rawLine = `${decodedArtist} - ${decodedName}`;
      }
      rawTextLines.push(rawLine);
    }
  }

  // 策略 2: 如果策略 1 匹配数量过少，使用 DOM 逐块正则扫描 (tlpItem / tlpTog)
  if (rawTextLines.length < 5) {
    const tlpBlockRegex = /<div[^>]*class=["'][^"']*(?:tlpItem|tlpTog)[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]*class=["'][^"']*(?:tlpItem|tlpTog)[^"']*["']|$)/gi;
    let bMatch;
    while ((bMatch = tlpBlockRegex.exec(html)) !== null) {
      const block = bMatch[1];
      const tvMatch = /class=["'][^"']*trackValue[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block);
      if (!tvMatch) continue;

      const tvText = decodeHtmlEntities(tvMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      const remixMatch = /class=["'][^"']*remixValue[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block);
      const remixText = remixMatch ? decodeHtmlEntities(remixMatch[1].replace(/<[^>]+>/g, " ").trim()) : "";

      const artists = [];
      const artReg = /<a[^>]*href=["']\/artist\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
      let aM;
      while ((aM = artReg.exec(block)) !== null) {
        artists.push(decodeHtmlEntities(aM[1].replace(/<[^>]+>/g, "").trim()));
      }

      let line = tvText;
      if (remixText && !line.toLowerCase().includes(remixText.toLowerCase())) {
        line = `${line} (${remixText})`;
      }

      if (artists.length > 0 && !line.includes(" - ")) {
        line = `${artists.join(" & ")} - ${line}`;
      }
      rawTextLines.push(line);
    }
  }

  // 策略 3: 如果依然较少，尝试从 JSON-LD Schema 提取
  if (rawTextLines.length < 5) {
    const jsonLdMatch = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let jMatch;
    while ((jMatch = jsonLdMatch.exec(html)) !== null) {
      try {
        const data = JSON.parse(jMatch[1]);
        if (data && Array.isArray(data.itemListElement)) {
          for (const item of data.itemListElement) {
            const trackName = item.item?.name || item.name;
            const artistName = item.item?.byArtist?.name || item.byArtist?.name || "";
            if (trackName) {
              rawTextLines.push(artistName ? `${artistName} - ${trackName}` : trackName);
            }
          }
        }
      } catch {
        // ignore json parse error
      }
    }
  }

  const parsed = parseTracklistText(rawTextLines.join("\n"), options);
  return {
    title,
    dj,
    ...parsed,
  };
}

export function normalizeLiveSearchArtist(raw) {
  let value = String(raw || "").trim();
  if (!value) return "";
  value = value.replace(/https?:\/\/\S+/gi, " ");
  value = value.replace(
    /(帮我看看|帮我查一下|帮我搜一下|帮我找一下|查一下|搜一下|找一下|看看|帮我|请|麻烦|最近|近期|有什么|有哪些|代表性|现场演出|现场|演出|setlist|检索|搜索|的)/gi,
    " "
  );
  return value.replace(/\s+/g, " ").trim();
}

export function formatArtistDisplayName(name) {
  const trimmed = String(name || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, prefix, letter) => prefix + letter.toUpperCase());
}

export function isUnconfirmedArtistQuery(artist) {
  const value = String(artist || "").trim();
  if (!value) return true;
  if (/(帮我|查一下|搜一下|找一下|看看|最近的演出|有什么演出|现场演出|setlist)/i.test(value)) return true;
  if (value.length > 80) return true;
  return false;
}

/**
 * 检索指定艺人近期在 1001Tracklists 的真实代表性现场 Setlist 列表
 * @param {string} artistName - 艺人名，例如 'Culture Shock', 'Martin Garrix', 'Anyma'
 * @param {object} options
 * @returns {Promise<{ artist: string, sets: Array<object>, source?: string }>}
 */
export async function searchArtistRecentSets(artistName, options = {}) {
  const incoming = String(artistName || "").trim();
  if (!incoming) return { artist: "", sets: [], source: "unavailable" };
  if (!options.allowUnconfirmed && isUnconfirmedArtistQuery(incoming)) {
    return {
      artist: incoming,
      sets: [],
      source: "needs_confirmation",
      error: "请先确认该艺人的官方写法后再检索，不要把整句用户指令当作艺名。",
    };
  }
  const rawArtist = normalizeLiveSearchArtist(incoming) || incoming;
  const cleanArtist = formatArtistDisplayName(rawArtist);

  if (!options.skipRealScraper && !process.env.YESMUSIC_SKIP_REAL_SCRAPER) {
    try {
      const realSearchResult = await searchReal1001Tracklists(cleanArtist, options);
      if (realSearchResult?.source === "needs_verify") {
        return {
          artist: realSearchResult.artist || cleanArtist,
          sets: [],
          source: "needs_verify",
          error: realSearchResult.error,
        };
      }
      const realSets = (realSearchResult?.sets || []).filter((item) => isReal1001TracklistUrl(item?.url));
      if (realSets.length > 0) {
        return {
          artist: realSearchResult.artist || cleanArtist,
          sets: realSets,
          source: realSearchResult.source || "1001tracklists",
        };
      }
    } catch (err) {
      console.warn("[Real 1001TL Search Note]:", err.message);
    }
  }

  return {
    artist: cleanArtist,
    sets: [],
    source: "unavailable",
    error: `未能从 1001Tracklists 检索到 ${cleanArtist} 的真实现场。请粘贴现场链接或曲目文本。`,
  };
}
