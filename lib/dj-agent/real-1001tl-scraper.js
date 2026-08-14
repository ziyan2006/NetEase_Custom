/**
 * 1001Tracklists 真实网页穿透与曲目提取引擎 (Real 1001Tracklists Scraper Engine)
 * 基于真实浏览器内核与 Cloudflare Turnstile 求解器，实现 100% 真实原站 Setlist 抓取
 */

import { connect } from "puppeteer-real-browser";
import fs from "fs";
import path from "path";
import { parse1001TracklistHtml, parseTracklistText } from "./tracklist-parser.js";

const COOKIE_CACHE_PATH = path.resolve(process.cwd(), "data", "1001tl_session_cookies.json");

/**
 * 确保数据目录存在
 */
function ensureDataDir() {
  const dir = path.dirname(COOKIE_CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 读取本地缓存的 1001TL 会话 Cookies
 * @returns {string}
 */
export function getCached1001CookieHeader() {
  try {
    if (fs.existsSync(COOKIE_CACHE_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_CACHE_PATH, "utf-8"));
      if (Array.isArray(cookies)) {
        return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      }
    }
  } catch {
    // ignore
  }
  return "";
}

/**
 * 保存 1001TL 会话 Cookies
 * @param {Array<object>} cookies
 */
export function saveCached1001Cookies(cookies) {
  try {
    ensureDataDir();
    fs.writeFileSync(COOKIE_CACHE_PATH, JSON.stringify(cookies, null, 2), "utf-8");
  } catch (err) {
    console.error("[Cookie Save Warning]:", err.message);
  }
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
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Cookie": cookieHeader,
        },
      });

      if (res.ok) {
        const html = await res.text();
        const isTurnstile = html.includes("Please wait, you will be forwarded") || html.includes("Turnstile");
        if (!isTurnstile && html.length > 10000) {
          const parsed = parse1001TracklistHtml(html, { filterUnreleased });
          if (parsed.tracks && parsed.tracks.length > 0) {
            return { ...parsed, source: "1001tracklists_fast_http" };
          }
        }
      }
    } catch {
      // 快速 HTTP 失败后转入真实浏览器穿透引擎
    }
  }

  // 2. 启动 Cloudflare 穿透引擎 (puppeteer-real-browser)
  if (onProgress) onProgress("正在启动 1001Tracklists 浏览器穿透引擎，自动完成安全验证与 DOM 解析...");
  let browser = null;

  try {
    const connection = await connect({
      headless: false,
      args: ["--window-size=1280,800"],
      turnstile: true,
    });
    browser = connection.browser;
    const page = connection.page;

    await page.goto(url, { waitUntil: "load", timeout: 45000 });

    // 等待 DOM 渲染与 Turnstile 自动放行 (最多等待 18 秒)
    let finalTracksCount = 0;
    for (let i = 1; i <= 18; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const count = await page.evaluate(() => {
          return document.querySelectorAll(".tlpItem, .tlpTog, .trackValue").length;
        });
        if (count > 0) {
          finalTracksCount = count;
          if (onProgress) onProgress(`已成功穿透！捕获到 ${count} 处真实现场音轨节点，正在提取详情...`);
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

    // 如果常规解析为空，从 DOM 中直接抽取
    if (!parsed.tracks || parsed.tracks.length === 0) {
      const extracted = await page.evaluate(() => {
        const list = [];
        const items = document.querySelectorAll(".tlpItem, .tlpTog");
        items.forEach((item, idx) => {
          const tv = item.querySelector(".trackValue, .tlpValue");
          const art = item.querySelector(".artItm, .artistValue");
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

            list.push({
              trackNumber: idx + 1,
              artist,
              title,
              remix: remixName,
              timestamp: time,
              searchQuery: `${artist} ${title} ${remixName}`.trim(),
              raw: `${artist} - ${title} ${remixName}`.trim(),
            });
          }
        });
        return {
          title: document.title.replace(/Tracklist\s*\|\s*1001Tracklists.*$/i, "").trim(),
          tracks: list,
        };
      });

      if (extracted.tracks.length > 0) {
        parsed = {
          title: extracted.title || "1001Tracklists Live Set",
          dj: extracted.title.split(" ")[0] || "",
          tracks: extracted.tracks,
          totalCount: extracted.tracks.length,
          filteredCount: 0,
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
export async function searchReal1001Tracklists(query, options = {}) {
  const artistQuery = (query || "").trim();
  if (!artistQuery) return { artist: "", sets: [] };

  let browser = null;
  try {
    const connection = await connect({
      headless: false,
      args: ["--window-size=1280,900"],
      turnstile: true,
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
              name: text,
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

