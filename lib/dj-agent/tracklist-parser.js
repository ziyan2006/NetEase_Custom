/**
 * 1001Tracklists 现场 Setlist 与文本歌单解析器
 * 支持 URL 在线页面抓取、剪贴板/手写 Setlist 正则与 NLP 提取，并自动过滤 ID/未发行曲目
 */

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

  // 1. 完全是 ID 或包含无意义占位
  if (a === "id" || t === "id" || t === "id - id" || t === "unknown" || t === "?") return true;
  if (t.startsWith("id ") || t.startsWith("id(") || t.startsWith("id -") || t.startsWith("id_")) return true;
  if (/^id\s*\(.*\)$/i.test(t)) return true;
  if (/^id\s*[-–—]\s*id/i.test(`${a} - ${t}`)) return true;

  // 2. 占位文本
  if (t.includes("unknown track") || t.includes("unreleased") || t.includes("track id")) return true;

  return false;
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
 * 从清洗后的单行文本解析出 Artist, Title, Remix 等结构化信息
 * @param {string} line - 比如 "Tiësto - The Business (220 KID Remix)"
 * @returns {Array<{ artist: string, title: string, remix: string, raw: string, isMashup: boolean }>}
 */
export function parseSingleTrack(line) {
  if (!line || typeof line !== "string") return [];

  // 检查是否为 Mashup / Bootleg 组合 (如 "Artist A - Track A vs. Artist B - Track B")
  if (/\s+vs\.?\s+|\s+w\/\s+/i.test(line)) {
    const parts = line.split(/\s+vs\.?\s+|\s+w\/\s+/i);
    const subTracks = [];
    for (const part of parts) {
      const parsed = parseStandardArtistTitle(part.trim());
      if (parsed) {
        subTracks.push({ ...parsed, raw: part.trim(), isMashup: true });
      }
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

  // 构造搜索专用的干净关键词 (例如 "Martin Garrix Byte")
  const cleanTitleForSearch = title.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const searchQuery = `${artist} ${cleanTitleForSearch} ${remix}`.replace(/\s+/g, " ").trim();

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
 * 抓取并解析 1001Tracklists 网页 URL
 * @param {string} url - 例如 https://www.1001tracklists.com/tracklist/275yqjmt/...
 * @param {object} options - { proxy: string, filterUnreleased: true }
 * @returns {Promise<{ title: string, dj: string, tracks: Array<object>, totalCount: number, filteredCount: number }>}
 */
export async function fetchAndParse1001TracklistUrl(url, options = {}) {
  if (!url || !url.includes("1001tracklists.com")) {
    throw new Error("无效的 1001Tracklists 链接，请提供以 https://www.1001tracklists.com/ 开头的 URL");
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Cache-Control": "no-cache",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`请求 1001Tracklists 失败 (HTTP ${response.status})`);
    }

    const html = await response.text();
    return parse1001TracklistHtml(html, options);
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`抓取 1001Tracklists 失败: ${err.message}`);
  }
}

/**
 * 从 1001Tracklists 的 HTML 源码提取 Set 标题、DJ 与曲目列表
 * @param {string} html
 * @param {object} options
 */
export function parse1001TracklistHtml(html, options = { filterUnreleased: true }) {
  if (!html) return { title: "Unknown Set", dj: "", tracks: [], totalCount: 0, filteredCount: 0 };

  // 1. 提取 Set 标题
  let title = "1001Tracklists Live Set";
  const titleMatch = /<title>([^<]+)<\/title>/i.exec(html) || /<h1[^>]*id="pageTitle"[^>]*>([^<]+)<\/h1>/i.exec(html);
  if (titleMatch) {
    title = titleMatch[1].replace(/Tracklist\s*\|\s*1001Tracklists.*$/i, "").trim();
  }

  // 2. 提取 DJ 艺人名
  let dj = "";
  const djMatch = /<meta\s+name="author"\s+content="([^"]+)"/i.exec(html) ||
                  /<a\s+href="\/dj\/[^"]+"[^>]*>([^<]+)<\/a>/i.exec(html);
  if (djMatch) {
    dj = djMatch[1].trim();
  }

  // 3. 提取曲目信息：
  // 1001Tracklists 的曲目行通常包裹在 class 包含 tlpItem 的 div 中，或者包含 span.trackValue / span.artistValue
  const rawTextLines = [];

  // 正则扫描曲目块
  const itemRegex = /<div[^>]*class="[^"]*tlpItem[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];

    // 提取歌手
    const artistMatches = [];
    const artReg = /<a[^>]*href="\/artist\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
    let aMatch;
    while ((aMatch = artReg.exec(block)) !== null) {
      artistMatches.push(aMatch[1].trim());
    }

    // 提取歌名
    let songName = "";
    const titleReg = /<span[^>]*class="[^"]*trackValue[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
    const tMatch = titleReg.exec(block);
    if (tMatch) {
      songName = tMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }

    if (artistMatches.length > 0 && songName) {
      rawTextLines.push(`${artistMatches.join(" & ")} - ${songName}`);
    } else if (songName) {
      rawTextLines.push(songName);
    }
  }

  // 如果未能从特定 class 提取，则尝试从 JSON-LD Schema 提取
  if (rawTextLines.length === 0) {
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
