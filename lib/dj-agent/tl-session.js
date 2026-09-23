/**
 * 1001Tracklists 会话 Cookie 存储与健康检查。
 * 不依赖 Puppeteer / scraper，供 Electron 主进程、HTTP API 与快路径共用。
 */

import fs from "fs";
import path from "path";

export const TL_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
export const TL_HOME_URL = "https://www.1001tracklists.com/";
export const TL_PROBE_URL = "https://www.1001tracklists.com/dj/cultureshock/index.html";
export const TL_VERIFY_ERROR =
  "需要先验证 1001Tracklists 现场数据源。请在 Copilot 中点击「去验证」，完成后即可走 Cookie 快路径。也可直接粘贴现场页中的曲目文本。";

function emptyStore() {
  return { version: 1, cookies: [], lastCheckedAt: null, lastReason: null };
}

export function resolve1001tlCookiePath() {
  if (process.env.YESMUSIC_1001TL_COOKIE_PATH) {
    return process.env.YESMUSIC_1001TL_COOKIE_PATH;
  }
  return path.resolve(process.cwd(), "data", "1001tl_session_cookies.json");
}

export function isPuppeteerAllowed() {
  return process.env.YESMUSIC_ALLOW_PUPPETEER === "1";
}

export function isChallengeHtml(html) {
  const text = String(html || "");
  if (!text) return false;
  if (/Please wait, you will be forwarded/i.test(text)) return true;
  if (/id=["']challenge-running["']/i.test(text)) return true;
  if (/cf-challenge/i.test(text)) return true;
  if (/Just a moment/i.test(text) && /cloudflare/i.test(text)) return true;
  if (/\bTurnstile\b/i.test(text) && text.length < 20000) return true;
  return false;
}

export function htmlHasRealTracklistLinks(html) {
  const text = String(html || "");
  const re = /\/tracklist\/[a-zA-Z0-9]+\/[^/\s"'<>]+/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (!/\/tracklist\/dynamic\//i.test(match[0])) return true;
  }
  return false;
}

export function normalize1001tlCookies(cookies) {
  if (!Array.isArray(cookies)) return [];
  return cookies
    .map((cookie) => {
      if (!cookie || !cookie.name) return null;
      return {
        name: String(cookie.name),
        value: String(cookie.value ?? ""),
        domain: cookie.domain || ".1001tracklists.com",
        path: cookie.path || "/",
        expires: cookie.expirationDate || cookie.expires || 0,
        httpOnly: Boolean(cookie.httpOnly),
        secure: Boolean(cookie.secure),
      };
    })
    .filter(Boolean);
}

export function parseCookieHeader(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq <= 0) return null;
      return {
        name: part.slice(0, eq).trim(),
        value: part.slice(eq + 1).trim(),
        domain: ".1001tracklists.com",
        path: "/",
      };
    })
    .filter(Boolean);
}

function readStore() {
  const filePath = resolve1001tlCookiePath();
  try {
    if (!fs.existsSync(filePath)) return emptyStore();
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (Array.isArray(raw)) {
      return { ...emptyStore(), cookies: normalize1001tlCookies(raw) };
    }
    if (raw && typeof raw === "object") {
      return {
        version: 1,
        cookies: normalize1001tlCookies(raw.cookies || []),
        lastCheckedAt: raw.lastCheckedAt || null,
        lastReason: raw.lastReason || null,
      };
    }
  } catch {
    // ignore corrupt cache
  }
  return emptyStore();
}

function writeStore(store) {
  const filePath = resolve1001tlCookiePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        version: 1,
        cookies: store.cookies || [],
        lastCheckedAt: store.lastCheckedAt || null,
        lastReason: store.lastReason || null,
      },
      null,
      2
    ),
    "utf-8"
  );
}

export function getCached1001Cookies() {
  return readStore().cookies;
}

export function getCached1001CookieHeader() {
  const cookies = getCached1001Cookies();
  if (!cookies.length) return "";
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

export function saveCached1001Cookies(cookies, extra = {}) {
  const next = {
    ...readStore(),
    cookies: normalize1001tlCookies(cookies),
    ...extra,
  };
  writeStore(next);
  return next;
}

export function mark1001tlCookiesStale(reason = "challenge") {
  const store = readStore();
  store.lastReason = reason;
  store.lastCheckedAt = new Date().toISOString();
  writeStore(store);
  return store;
}

export function import1001tlCookies({ cookies, cookieHeader } = {}) {
  let list = [];
  if (Array.isArray(cookies) && cookies.length) {
    list = cookies;
  } else if (cookieHeader) {
    list = parseCookieHeader(cookieHeader);
  }
  if (!list.length) {
    throw new Error("没有可保存的 1001Tracklists Cookie");
  }
  return saveCached1001Cookies(list, { lastReason: null, lastCheckedAt: null });
}

export function build1001tlHeaders(cookieHeader, extra = {}) {
  return {
    "User-Agent": TL_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: TL_HOME_URL,
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    ...extra,
  };
}

export function buildSetup1001tlCard(overrides = {}) {
  return {
    sourceType: "setup_1001tl",
    title: "需要验证 1001Tracklists 现场数据源",
    subtitle: "完成后即可用 Cookie 快路径检索与解析现场，无需再走慢速浏览器",
    ...overrides,
  };
}

export function migrateLegacy1001tlCookies(userDataDir) {
  const dest = process.env.YESMUSIC_1001TL_COOKIE_PATH || path.join(userDataDir, "1001tl_session_cookies.json");
  const src = path.resolve(process.cwd(), "data", "1001tl_session_cookies.json");
  try {
    if (!fs.existsSync(dest) && src !== dest && fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  } catch (err) {
    console.warn("[1001TL Cookie Migrate]:", err.message);
  }
  return dest;
}

async function fetchHtml(url, cookieHeader, timeoutMs = 8000) {
  const res = await fetch(url, {
    headers: build1001tlHeaders(cookieHeader),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const html = await res.text();
  return { ok: res.ok, status: res.status, html };
}

function cookieNamesFromStore(store) {
  return (store.cookies || []).map((cookie) => cookie.name).filter(Boolean);
}

export async function probe1001CookieHealth() {
  const store = readStore();
  const cookieHeader = (store.cookies || []).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const checkedAt = new Date().toISOString();
  if (!cookieHeader) {
    const result = { ok: false, reason: "missing", setCount: 0, checkedAt };
    writeStore({ ...store, lastCheckedAt: checkedAt, lastReason: "missing" });
    return result;
  }

  try {
    const probe = await fetchHtml(TL_PROBE_URL, cookieHeader);
    if (isChallengeHtml(probe.html)) {
      const result = { ok: false, reason: "challenge", setCount: 0, checkedAt };
      writeStore({ ...store, lastCheckedAt: checkedAt, lastReason: "challenge" });
      return result;
    }
    if (htmlHasRealTracklistLinks(probe.html)) {
      const setCount = (probe.html.match(/\/tracklist\/[a-zA-Z0-9]+\//gi) || []).filter(
        (item) => !/\/tracklist\/dynamic\//i.test(item)
      ).length;
      const result = { ok: true, reason: "ok", setCount, checkedAt };
      writeStore({ ...store, lastCheckedAt: checkedAt, lastReason: "ok" });
      return result;
    }

    const home = await fetchHtml(TL_HOME_URL, cookieHeader);
    if (isChallengeHtml(home.html)) {
      const result = { ok: false, reason: "challenge", setCount: 0, checkedAt };
      writeStore({ ...store, lastCheckedAt: checkedAt, lastReason: "challenge" });
      return result;
    }
    if (home.ok && home.html.length > 8000 && /1001Tracklists/i.test(home.html)) {
      const result = { ok: true, reason: "homepage", setCount: 0, checkedAt };
      writeStore({ ...store, lastCheckedAt: checkedAt, lastReason: "homepage" });
      return result;
    }

    const result = { ok: false, reason: "empty", setCount: 0, checkedAt };
    writeStore({ ...store, lastCheckedAt: checkedAt, lastReason: "empty" });
    return result;
  } catch (err) {
    const result = { ok: false, reason: "network", setCount: 0, checkedAt, error: err.message };
    writeStore({ ...store, lastCheckedAt: checkedAt, lastReason: store.lastReason || "network" });
    return result;
  }
}

export async function get1001tlStatus({ probe = true } = {}) {
  const store = readStore();
  const names = cookieNamesFromStore(store);
  const hasGuid = names.includes("guid");
  const base = {
    cookieNames: names,
    hasGuid,
    lastCheckedAt: store.lastCheckedAt,
  };

  if (!names.length) {
    return { ready: false, reason: "missing", ...base };
  }

  if (probe) {
    const result = await probe1001CookieHealth();
    return {
      ready: Boolean(result.ok),
      reason: result.reason,
      setCount: result.setCount || 0,
      cookieNames: names,
      hasGuid,
      lastCheckedAt: result.checkedAt,
    };
  }

  const ready = store.lastReason === "ok" || store.lastReason === "homepage";
  return {
    ready,
    reason: store.lastReason || "unchecked",
    ...base,
  };
}
