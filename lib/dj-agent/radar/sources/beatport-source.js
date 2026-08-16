/**
 * Beatport 榜单数据源 (Best-Effort)
 *
 * 现状: api.beatport.com 已要求认证 (401), www.beatport.com 有 Cloudflare 挑战。
 * 策略(逐级降级):
 *   1. 普通 HTTP 请求 v4 API (可能 403/401, 快速失败)
 *   2. 浏览器穿透 (puppeteer-real-browser + Turnstile 求解 + Cookie 缓存)
 *      —— 在真实网络/Windows 有头模式下成功率更高, 本模块在失败时优雅返回空
 * 命中后写入 Cookie 缓存, 供后续高速请求复用。
 */

import fs from "node:fs";
import path from "node:path";
import { connect } from "puppeteer-real-browser";
import { resolveChromeExecutablePath } from "../../chrome-resolver.js";

const BEATPORT_COOKIE_CACHE = path.resolve(process.cwd(), "data", "beatport_cookies.json");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function readCachedCookies() {
  try {
    if (fs.existsSync(BEATPORT_COOKIE_CACHE)) {
      const cookies = JSON.parse(fs.readFileSync(BEATPORT_COOKIE_CACHE, "utf-8"));
      if (Array.isArray(cookies)) return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  } catch {
    // ignore
  }
  return "";
}

function saveCachedCookies(cookies) {
  try {
    if (Array.isArray(cookies) && cookies.length > 0) {
      fs.mkdirSync(path.dirname(BEATPORT_COOKIE_CACHE), { recursive: true });
      fs.writeFileSync(BEATPORT_COOKIE_CACHE, JSON.stringify(cookies, null, 2), "utf-8");
    }
  } catch {
    // ignore
  }
}

/**
 * 保存用户粘贴的 Beatport Cookie 头 (仿照网易云 MUSIC_U 直登流程)
 * @param {string} cookieHeader - 形如 "a=1; b=2; ..." 的 Cookie 字符串
 * @returns {boolean}
 */
export function saveBeatportCookieHeader(cookieHeader) {
  const cookies = String(cookieHeader || "")
    .split(";")
    .map((part) => {
      const i = part.indexOf("=");
      if (i < 0) return null;
      return { name: part.slice(0, i).trim(), value: part.slice(i + 1).trim() };
    })
    .filter((c) => c && c.name && c.value);
  if (cookies.length === 0) return false;
  try {
    fs.mkdirSync(path.dirname(BEATPORT_COOKIE_CACHE), { recursive: true });
    fs.writeFileSync(BEATPORT_COOKIE_CACHE, JSON.stringify(cookies, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** 查询 Beatport Cookie 配置状态 */
export function getBeatportCookieStatus() {
  try {
    if (fs.existsSync(BEATPORT_COOKIE_CACHE)) {
      const cookies = JSON.parse(fs.readFileSync(BEATPORT_COOKIE_CACHE, "utf-8"));
      if (Array.isArray(cookies) && cookies.length > 0) {
        return { configured: true, cookieCount: cookies.length };
      }
    }
  } catch {
    // ignore
  }
  return { configured: false, cookieCount: 0 };
}

/** 清除 Beatport Cookie */
export function clearBeatportCookies() {
  try {
    if (fs.existsSync(BEATPORT_COOKIE_CACHE)) {
      fs.unlinkSync(BEATPORT_COOKIE_CACHE);
    }
    return true;
  } catch {
    return false;
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时 (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 从 v4 API JSON 中提取曲目 (防御性解析) */
function extractTracksFromApiJson(data, genreName) {
  const tracks = [];
  const source = data?.data || data?.results || data?.tracks || (Array.isArray(data) ? data : null);
  if (!Array.isArray(source)) return tracks;

  for (const item of source) {
    // charts 列表条目或 track 条目
    const artists = (item.artists || [])
      .map((a) => (typeof a === "string" ? a : a?.name))
      .filter(Boolean)
      .join(" & ");
    const title = item.name || item.title;
    if (!artists || !title) continue;
    tracks.push({
      artist: artists,
      title,
      version: item.mix_name || item.mix || "Original Mix",
      label: typeof item.label === "string" ? item.label : item.label?.name || "",
      bpm: item.bpm || null,
      key: item.musical_key || item.key || "",
      releaseDate: item.release_date || item.publish_date || "",
      url: item.url || "",
      coverUrl: item.images?.large?.url || item.images?.edm?.url || "",
      genre: genreName,
      rank: tracks.length + 1,
    });
  }
  return tracks;
}

/**
 * 抓取指定流派 Top 曲目
 * @param {object} params - { slug, id, name }
 * @param {object} [options]
 * @returns {Promise<Array<object>>} 归一化前的原始条目
 */
export async function fetchBeatportTracks({ slug, id, name }, options = {}) {
  const genreName = name || slug;
  const cookieHeader = readCachedCookies();

  // 1. 普通 HTTP (带缓存 Cookie)
  try {
    const apiUrl = `https://api.beatport.com/v4/catalog/charts?tag=${encodeURIComponent(slug)}&per-page=5`;
    const headers = {
      "User-Agent": UA,
      "Accept": "application/json",
      "Referer": `https://www.beatport.com/genre/${slug}/${id}/top-100`,
    };
    if (cookieHeader) headers["Cookie"] = cookieHeader;

    const res = await withTimeout(
      fetch(apiUrl, { headers, signal: AbortSignal.timeout(6000) }),
      8000,
      "Beatport HTTP"
    );
    if (res.ok) {
      const json = await res.json();
      const charts = json?.data || [];
      const chart = charts[0];
      if (chart?.id) {
        const tracksRes = await withTimeout(
          fetch(`https://api.beatport.com/v4/catalog/charts/${chart.id}/tracks?per-page=50`, {
            headers,
            signal: AbortSignal.timeout(6000),
          }),
          8000,
          "Beatport tracks"
        );
        if (tracksRes.ok) {
          const tracksJson = await tracksRes.json();
          const tracks = extractTracksFromApiJson(tracksJson, genreName);
          if (tracks.length > 0) return tracks;
        }
      }
    }
  } catch {
    // 继续浏览器穿透
  }

  // 2. 浏览器穿透 (Turnstile 求解 + Cookie 缓存)
  try {
    const chromePath = resolveChromeExecutablePath();
    if (process.platform === "linux" && !chromePath) {
      throw new Error("Linux 无随包 Chrome, 跳过 Beatport 浏览器穿透");
    }
    const browserTracks = await withTimeout(
      (async () => {
        const conn = await connect({
          headless: process.platform === "linux" ? "new" : false,
          disableXvfb: process.platform === "linux",
          args: ["--window-size=1280,900"],
          turnstile: true,
          customConfig: chromePath ? { chromePath } : {},
        });
        const page = conn.page;
        try {
          await page.goto(`https://www.beatport.com/genre/${slug}/${id}/top-100`, {
            waitUntil: "domcontentloaded",
            timeout: 20000,
          });
          // 轮询等待 Cloudflare 挑战通过
          let passed = false;
          for (let i = 0; i < 12; i++) {
            await new Promise((r) => setTimeout(r, 1500));
            const title = await page.title().catch(() => "");
            if (!title.includes("Just a moment")) {
              passed = true;
              break;
            }
          }
          if (!passed) return [];

          const cookies = await page.cookies().catch(() => []);
          saveCachedCookies(cookies);

          // 页面内嵌 JSON (__NEXT_DATA__ 或 apollo state) 提取
          const data = await page.evaluate(() => {
            const scripts = [...document.querySelectorAll("script")].map((s) => s.textContent || "");
            const nextData = scripts.find((t) => t.includes("__NEXT_DATA__"));
            if (nextData) {
              const m = nextData.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
              if (m) {
                try {
                  const json = JSON.parse(m[1]);
                  return JSON.stringify(json);
                } catch {
                  return null;
                }
              }
            }
            return null;
          });
          if (!data) return [];

          // 递归搜索 tracks 数组 (name + artists + bpm + musical_key)
          const found = [];
          const walk = (obj) => {
            if (!obj || typeof obj !== "object") return;
            if (Array.isArray(obj)) {
              for (const item of obj) {
                if (
                  item &&
                  typeof item === "object" &&
                  item.name &&
                  (item.artists || item.mix_name) &&
                  !item.__typename?.includes("Chart")
                ) {
                  found.push(item);
                }
                walk(item);
              }
            } else {
              for (const v of Object.values(obj)) walk(v);
            }
          };
          walk(JSON.parse(data));
          return found.slice(0, 50);
        } finally {
          await conn.browser.close().catch(() => {});
        }
      })(),
      30000,
      "Beatport 浏览器穿透"
    );

    const tracks = extractTracksFromApiJson({ data: browserTracks }, genreName);
    if (tracks.length > 0) return tracks;
  } catch (err) {
    console.warn("[Beatport Source Note]:", err.message);
  }

  return [];
}
