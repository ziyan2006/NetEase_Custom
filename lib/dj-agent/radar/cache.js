/**
 * 榜单数据 TTL 缓存 (File-based TTL Cache)
 * 榜单几小时内变化不大, 缓存可显著降低对上游平台的请求压力与封禁风险。
 * 存储: data/charts_cache/{key}.json
 */

import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve(process.cwd(), "data", "charts_cache");
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时

function cacheFilePath(key) {
  const safeKey = String(key).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(CACHE_DIR, `${safeKey}.json`);
}

/**
 * 读取缓存 (未过期返回数据, 过期/不存在返回 null)
 * @param {string} key
 * @param {number} [ttlMs]
 * @returns {object|null}
 */
export function readChartCache(key, ttlMs = DEFAULT_TTL_MS) {
  try {
    const file = cacheFilePath(key);
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!raw || !raw.fetchedAt || !raw.payload) return null;
    if (Date.now() - raw.fetchedAt > ttlMs) return null;
    return raw.payload;
  } catch {
    return null;
  }
}

/**
 * 写入缓存
 * @param {string} key
 * @param {object} payload
 */
export function writeChartCache(key, payload) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file = cacheFilePath(key);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ fetchedAt: Date.now(), payload }, null, 2), "utf-8");
    fs.renameSync(tmp, file); // 原子写, 避免半截文件
  } catch (err) {
    console.warn("[Chart Cache Write Warning]:", err.message);
  }
}

/** 清理指定 key 的缓存 */
export function clearChartCache(key) {
  try {
    const file = cacheFilePath(key);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    // ignore
  }
}
