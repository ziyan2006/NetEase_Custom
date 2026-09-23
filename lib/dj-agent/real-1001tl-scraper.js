/**
 * 1001Tracklists 真实网页穿透与曲目提取引擎 (Real 1001Tracklists Scraper Engine)
 * 基于真实浏览器内核与 Cloudflare Turnstile 求解器，实现 100% 真实原站 Setlist 抓取
 */

import { connect } from "puppeteer-real-browser";
import { parse1001TracklistHtml, isUnreleasedTrack } from "./tracklist-parser.js";
import { resolveChromeExecutablePath, resolveChromeUserDataDir } from "./chrome-resolver.js";
import {
  getCached1001CookieHeader,
  saveCached1001Cookies,
  isChallengeHtml,
  isPuppeteerAllowed,
  mark1001tlCookiesStale,
  build1001tlHeaders,
  TL_VERIFY_ERROR,
} from "./tl-session.js";

export { getCached1001CookieHeader, saveCached1001Cookies } from "./tl-session.js";

/**
 * 为 Promise 增加超时竞速保护 (防止无浏览器环境下 connect() 无限挂起)
 * @param {Promise} promise
 * @param {number} ms - 超时毫秒数
 * @param {string} label - 超时错误描述
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时 (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 浏览器可用性预检:
 * - Linux 无头环境必须显式提供 Chrome/Chromium (否则 puppeteer-real-browser 需要 Xvfb 且必失败, 白白挂起)
 * - Windows/macOS 允许交给 chrome-launcher 默认策略检测
 * @returns {string|undefined} chromePath (有显式浏览器时)
 */
function ensureBrowserAvailable() {
  const chromePath = resolveChromeExecutablePath();
  if (process.platform === "linux" && !chromePath) {
    throw new Error("当前 Linux 环境未检测到 Chrome/Chromium 且无 Xvfb, 真实浏览器穿透不可用, 跳过穿透直接走兜底链路");
  }
  return chromePath;
}

function needsVerifyTracklist(extra = {}) {
  return {
    title: extra.title || "",
    dj: extra.dj || "",
    tracks: [],
    totalCount: 0,
    filteredCount: 0,
    source: "needs_verify",
    error: extra.error || TL_VERIFY_ERROR,
  };
}

function needsVerifySearch(artist, extra = {}) {
  return {
    artist: artist || "",
    sets: [],
    source: "needs_verify",
    error: extra.error || TL_VERIFY_ERROR,
  };
}

/**
 * 抓取真实 1001Tracklists 网页音轨 (支持带 Cookie 高速请求 + 浏览器穿透引擎)
 * @param {string} url - 1001Tracklists 现场链接
 * @param {object} [options]
 * @param {boolean} [options.filterUnreleased=true] - 是否过滤 ID 未发行曲目
 * @param {Function} [options.onProgress] - 进度回调
 * @returns {Promise<{ title: string, dj: string, tracks: Array<object>, totalCount: number, filteredCount: number, source: string }>}
 */
export async function fetchReal1001Tracklist(url, options = {}) {
  return withTimeout(runFetchReal1001Tracklist(url, options), 15000, "1001TL 真实浏览器抓取");
}

// 平台化浏览器模式:
// - Linux 无显示环境: 用 headless "new" (完整浏览器引擎, 无需 Xvfb)
// - Windows/macOS: 保持原有有头模式 (真实窗口, 隐形效果最佳)
const IS_HEADLESS_LINUX = process.platform === "linux";
const BROWSER_MODE = IS_HEADLESS_LINUX ? "new" : false;

async function runFetchReal1001Tracklist(url, options = {}) {
  if (!url || !url.includes("1001tracklists.com")) {
    throw new Error("无效的 1001Tracklists 现场链接");
  }

  const { onProgress, filterUnreleased = true } = options;

  // 1. 优先尝试使用持久化 Cookie 进行毫秒级高速 HTTP 请求
  const cookieHeader = getCached1001CookieHeader();
  if (cookieHeader) {
    try {
      if (onProgress) onProgress("正在通过本地 1001TL 会话凭证高速抓取现场...");
      const res = await fetch(url, {
        headers: build1001tlHeaders(cookieHeader),
      });

      if (res.ok) {
        const html = await res.text();
        if (isChallengeHtml(html)) {
          mark1001tlCookiesStale("challenge");
          if (!isPuppeteerAllowed()) {
            return needsVerifyTracklist();
          }
        } else if (html.length > 10000) {
          const parsed = parse1001TracklistHtml(html, { filterUnreleased });
          if (parsed.tracks && parsed.tracks.length > 0) {
            return { ...parsed, source: "1001tracklists_fast_http" };
          }
        }
      }
    } catch {
      // 快速 HTTP 失败后，仅在显式允许时转入浏览器穿透
    }
  } else if (!isPuppeteerAllowed()) {
    return needsVerifyTracklist();
  }

  if (!isPuppeteerAllowed()) {
    return {
      title: "",
      dj: "",
      tracks: [],
      totalCount: 0,
      filteredCount: 0,
      source: "unavailable",
      error: "未能从 1001Tracklists 解析到曲目。链接可能失效，或需要重新验证现场数据源。",
    };
  }

  // 2. 启动 Cloudflare 穿透引擎 (puppeteer-real-browser)，仅 YESMUSIC_ALLOW_PUPPETEER=1
  if (onProgress) onProgress("正在启动 1001Tracklists 浏览器穿透引擎，自动完成安全验证与 DOM 解析...");
  let browser = null;

  try {
    const chromePath = ensureBrowserAvailable();
    const connection = await connect({
      headless: BROWSER_MODE, // Linux 无头新模式 (无需 Xvfb); Windows/macOS 保持有头
      disableXvfb: IS_HEADLESS_LINUX, // Linux 跳过 Xvfb 启动尝试
      args: ["--window-size=1280,800"],
      turnstile: true,
      customConfig: {
        ...(chromePath ? { chromePath } : {}),
        userDataDir: resolveChromeUserDataDir(),
      },
    });
    browser = connection.browser;
    const page = connection.page;

    await page.goto(url, { waitUntil: "load", timeout: 45000 });

    // 等待 DOM 渲染与 Turnstile 自动放行 (最多等待 20 秒)
    let finalTracksCount = 0;
    for (let i = 1; i <= 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const state = await page.evaluate(() => {
          const isCf = document.title.includes("Just a moment") || Boolean(document.querySelector("#challenge-running"));
          const rows = document.querySelectorAll("#tlpRows .tlpItem, #tlpRows .tlpTog, .tlpRows .tlpItem, .tlpItem");
          return {
            isCf,
            count: rows.length,
            hasMainContainer: Boolean(document.querySelector("#tlpRows, .tlpRows")),
          };
        });

        if (!state.isCf && (state.count >= 8 || state.hasMainContainer)) {
          finalTracksCount = state.count;
          if (onProgress) onProgress(`已成功穿透！捕获到 ${state.count} 处真实现场音轨节点，正在提取详情...`);
          // 多等 2 秒以确保所有异步延迟曲目节点全部加载
          await new Promise((r) => setTimeout(r, 2000));
          break;
        }
      } catch {
        // 捕获页面跳转中的 context destroyed 错误并继续轮询
      }
    }

    const html = await page.content();

    // 提取并更新本地 Cookie 缓存
    const cookies = await page.cookies();
    if (Array.isArray(cookies) && cookies.length > 0) {
      saveCached1001Cookies(cookies);
    }

    // 使用 parse1001TracklistHtml 进行结构化解析
    let parsed = parse1001TracklistHtml(html, { filterUnreleased });

    // 如果常规解析为空或条目过少，从 DOM 中直接抽取
    if (!parsed.tracks || parsed.tracks.length < 5) {
      const extracted = await page.evaluate(() => {
        const list = [];
        const recordingElements = document.querySelectorAll("div[itemprop='tracks'][itemtype='http://schema.org/MusicRecording']");
        if (recordingElements.length > 0) {
          recordingElements.forEach((item, idx) => {
            const nameMeta = item.querySelector("meta[itemprop='name']")?.getAttribute("content") || "";
            const artistMeta = item.querySelector("meta[itemprop='byArtist']")?.getAttribute("content") || "";
            let artist = artistMeta.trim();
            let title = nameMeta.trim();
            if (!artist && title.includes(" - ")) {
              const parts = title.split(/\s+[-–—]\s+/);
              artist = parts[0].trim();
              title = parts.slice(1).join(" - ").trim();
            }
            if (title) {
              const raw = artist ? `${artist} - ${title}` : title;
              list.push({
                trackNumber: idx + 1,
                artist,
                title,
                raw,
                searchQuery: raw.replace(/[()]/g, " ").replace(/\s+/g, " ").trim(),
              });
            }
          });
        } else {
          const mainContainer = document.querySelector("#tlpRows, .tlpRows") || document.body;
          const items = mainContainer.querySelectorAll(".tlpItem, .tlpTog");
          const seen = new Set();
          items.forEach((item, idx) => {
            const tv = item.querySelector(".trackValue, .tlpValue");
            const art = item.querySelector(".artItm, .artistValue, a[href*='/artist/']");
            const remix = item.querySelector(".remixValue");
            const cue = item.querySelector(".cue");
            if (tv || art) {
              let artist = art ? art.innerText.trim() : "";
              let title = tv ? tv.innerText.trim() : "";
              const remixName = remix ? remix.innerText.trim() : "";
              const time = cue ? cue.innerText.trim() : "";

              if (!artist && title.includes(" - ")) {
                const parts = title.split(/\s+[-–—]\s+/);
                artist = parts[0].trim();
                title = parts.slice(1).join(" - ").trim();
              }

              let fullTitle = title;
              if (remixName && !fullTitle.toLowerCase().includes(remixName.toLowerCase())) {
                fullTitle = `${fullTitle} (${remixName})`;
              }
              fullTitle = fullTitle.replace(/\s+/g, " ").trim();

              const raw = `${artist} - ${fullTitle}`.trim();
              if (seen.has(raw)) return;
              seen.add(raw);

              const cleanTitleForSearch = fullTitle.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
              const searchQuery = `${artist} ${cleanTitleForSearch}`.replace(/\s+/g, " ").trim();

              list.push({
                trackNumber: list.length + 1,
                artist,
                title: fullTitle,
                remix: remixName,
                timestamp: time,
                searchQuery,
                raw,
              });
            }
          });
        }
        return {
          title: document.title.replace(/Tracklist\s*\|\s*1001Tracklists.*$/i, "").trim(),
          tracks: list,
        };
      });

      if (extracted.tracks.length > 0) {
        const validTracks = [];
        let filteredCount = 0;

        for (const t of extracted.tracks) {
          const isUnrel = isUnreleasedTrack(t.artist, t.title);
          if (isUnrel && filterUnreleased !== false) {
            filteredCount++;
            continue;
          }
          validTracks.push({
            ...t,
            trackNumber: validTracks.length + 1,
          });
        }

        parsed = {
          title: extracted.title || "1001Tracklists Live Set",
          dj: extracted.title.split(" ")[0] || "",
          tracks: validTracks,
          totalCount: extracted.tracks.length,
          filteredCount,
        };
      }
    }

    return { ...parsed, source: "1001tracklists_real_browser" };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * 实时调用 1001Tracklists 官方搜索接口，返回真实原站近期演出候选列表
 * @param {string} query - 艺人或现场关键词 (如 "Culture Shock", "Martin Garrix", "Anyma")
 * @param {object} [options]
 * @returns {Promise<{ artist: string, sets: Array<object>, source: string }>}
 */
export function artistToDjSlugs(artist) {
  const raw = String(artist || "").toLowerCase();
  const variants = [
    raw,
    raw.replace(/\s*(?:&|and)\s*/gi, " "),
    raw.replace(/\s*(?:&|and)\s*/gi, ""),
  ];
  const slugs = [];
  for (const variant of variants) {
    const compact = variant.replace(/[^a-z0-9]+/g, "");
    const hyphen = variant.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (compact) slugs.push(compact);
    if (hyphen) slugs.push(hyphen);
  }
  return [...new Set(slugs)];
}

function isRealTracklistPath(path) {
  return /\/tracklist\/[a-z0-9]+\/[^/\s]+/i.test(path) && !/\/tracklist\/dynamic\//i.test(path);
}

export function parseArtistSetsFromDjHtml(html, artistQuery) {
  const sets = [];
  const itemRe = /window\.open\('(\/tracklist\/[a-zA-Z0-9]+\/[^']+\.html)'[\s\S]{0,1500}?alt="([^"]+)"/gi;
  let match;
  while ((match = itemRe.exec(html)) !== null) {
    const path = match[1];
    if (!isRealTracklistPath(path)) continue;
    const fullUrl = `https://www.1001tracklists.com${path}`;
    if (sets.some((item) => item.url === fullUrl)) continue;
    const title = String(match[2] || "")
      .replace(/\s*Artwork\s*$/i, "")
      .replace(/&amp;/g, "&")
      .replace(/&#039;/g, "'")
      .replace(/&AElig;/g, "Æ")
      .replace(/&quot;/g, '"')
      .trim()
      || path.split("/").pop().replace(/\.html$/i, "").replace(/-/g, " ");
    const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(path);
    sets.push({
      id: path.split("/")[2] || String(sets.length + 1),
      title,
      name: title,
      venue: title.includes("@") ? title.split("@").slice(1).join("@").trim() : "",
      date: dateMatch ? dateMatch[1] : "",
      url: fullUrl,
      description: `1001Tracklists 艺人页 · ${artistQuery}`,
    });
  }
  return sets;
}

async function searchArtistSetsViaCookieHttp(artistQuery) {
  const cookieHeader = getCached1001CookieHeader();
  if (!cookieHeader) return { sets: [], status: "missing" };

  const headers = build1001tlHeaders(cookieHeader);
  let sawChallenge = false;
  let sawEmpty = false;

  for (const slug of artistToDjSlugs(artistQuery)) {
    try {
      const res = await fetch(`https://www.1001tracklists.com/dj/${slug}/index.html`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (isChallengeHtml(html)) {
        sawChallenge = true;
        continue;
      }
      const sets = parseArtistSetsFromDjHtml(html, artistQuery);
      if (sets.length > 0) return { sets, status: "ok" };
      sawEmpty = true;
    } catch {
      // try next slug
    }
  }
  return {
    sets: [],
    status: sawChallenge ? "challenge" : sawEmpty ? "empty" : "error",
  };
}

export async function searchReal1001Tracklists(query, options = {}) {
  return withTimeout(runSearchReal1001Tracklists(query, options), 15000, "1001TL 真实浏览器搜索");
}

async function runSearchReal1001Tracklists(query, options = {}) {
  const artistQuery = (query || "").trim();
  if (!artistQuery) return { artist: "", sets: [] };

  const cookieResult = await searchArtistSetsViaCookieHttp(artistQuery);
  if (cookieResult.sets.length > 0) {
    return {
      artist: artistQuery,
      sets: cookieResult.sets.slice(0, 8),
      source: "1001tracklists_cookie_http",
    };
  }

  if (cookieResult.status === "challenge") {
    mark1001tlCookiesStale("challenge");
  }

  if (cookieResult.status === "missing" || cookieResult.status === "challenge") {
    if (!isPuppeteerAllowed()) {
      return needsVerifySearch(artistQuery);
    }
  } else if (!isPuppeteerAllowed()) {
    return {
      artist: artistQuery,
      sets: [],
      source: "unavailable",
      error: `未能从 1001Tracklists 检索到 ${artistQuery} 的真实现场。请粘贴现场链接或曲目文本。`,
    };
  }

  let browser = null;
  try {
    const chromePath = ensureBrowserAvailable();
    const connection = await connect({
      headless: BROWSER_MODE, // Linux 无头新模式 (无需 Xvfb); Windows/macOS 保持有头
      disableXvfb: IS_HEADLESS_LINUX, // Linux 跳过 Xvfb 启动尝试
      args: ["--window-size=1280,900"],
      turnstile: true,
      customConfig: {
        ...(chromePath ? { chromePath } : {}),
        userDataDir: resolveChromeUserDataDir(),
      },
    });
    browser = connection.browser;
    const page = connection.page;

    await page.goto("https://www.1001tracklists.com/", { waitUntil: "load", timeout: 35000 });
    await page.waitForSelector("#sBoxInput", { timeout: 10000 });
    await page.click("#sBoxInput");
    await page.type("#sBoxInput", artistQuery, { delay: 60 });
    await page.keyboard.press("Enter");

    // 等待搜索结果加载
    await new Promise((r) => setTimeout(r, 6000));

    const sets = await page.evaluate((artist) => {
      const list = [];
      const links = document.querySelectorAll('a[href*="/tracklist/"]');
      links.forEach((a) => {
        const href = a.getAttribute("href");
        const text = a.innerText.trim();
        if (href && href.startsWith("/tracklist/") && text && text.length > 5 && !text.includes("1001Tracklists")) {
          const fullUrl = href.startsWith("http") ? href : `https://www.1001tracklists.com${href}`;
          if (!list.some((item) => item.url === fullUrl)) {
            const parent = a.closest(".bItm, .cRow, .fTab, div");
            const dateSpan = parent ? parent.querySelector(".date, .fontS, span") : null;
            const dateStr = dateSpan ? dateSpan.innerText.trim() : "";

            let location = "";
            let eventName = text;
            if (text.includes("@")) {
              const parts = text.split("@");
              eventName = parts[1].trim();
            }

            list.push({
              id: href.split("/")[2] || String(list.length + 1),
              title: text,
              name: text,
              venue: location || eventName,
              location: location || eventName,
              date: dateStr || "Live Set",
              trackCount: 30,
              url: fullUrl,
              description: `1001Tracklists 原站真实收录 · ${dateStr || "现场演出"}`,
            });
          }
        }
      });
      return list;
    }, artistQuery);

    return {
      artist: artistQuery,
      sets: sets.slice(0, 6),
      source: "1001tracklists_real_search",
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

