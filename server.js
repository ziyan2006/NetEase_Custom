// 彻底清除代理环境变量，确保 Node.js 的 fetch 能够直连网易云 CDN 节点，规避代理导致的 403 拦截
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.ALL_PROXY;
delete process.env.all_proxy;

import { createServer as createHttpServer } from "node:http";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { basename, extname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { inspectAudioFile } from "./lib/audio-file.js";
import { downloadAndExportTrack } from "./lib/audio-exporter.js";
import { dispatchAgentWorkflow } from "./lib/dj-agent/agent-dispatcher.js";
import { fetchAndParse1001TracklistUrl, parseTracklistText, searchArtistRecentSets } from "./lib/dj-agent/tracklist-parser.js";
import { getTrendingTracksByGenre, getAvailableGenres } from "./lib/dj-agent/trend-radar.js";
import { getCompatibleKeys, analyzeTransition, normalizeCamelotKey } from "./lib/dj-agent/camelot-engine.js";
import { batchMatchTracklist } from "./lib/dj-agent/track-matcher.js";
import { DEFAULT_LLM_CONFIG, listAvailableModels } from "./lib/dj-agent/llm-client.js";

const projectDirectory = fileURLToPath(new URL(".", import.meta.url));
const publicDirectory = resolve(projectDirectory, "public");
const maxUploadBytes = 50 * 1024 * 1024;
const outputFormats = new Map([
  ["mp3", { contentType: "audio/mpeg", args: ["-c:a", "libmp3lame", "-q:a", "2"] }],
  ["wav", { contentType: "audio/wav", args: ["-c:a", "pcm_s16le"] }],
  ["flac", { contentType: "audio/flac", args: ["-c:a", "flac"] }],
  ["m4a", { contentType: "audio/mp4", args: ["-c:a", "aac", "-b:a", "192k"] }],
  ["ogg", { contentType: "audio/ogg", args: ["-c:a", "libvorbis", "-q:a", "5"] }],
]);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function parseMultipart(contentType, body) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!boundaryMatch) throw new Error("缺少 multipart 边界。");

  const boundary = Buffer.from(`--${boundaryMatch[1] ?? boundaryMatch[2]}`);
  const separator = Buffer.from("\r\n\r\n");
  const parts = [];
  let cursor = body.indexOf(boundary) + boundary.length;

  while (cursor >= boundary.length) {
    if (body.subarray(cursor, cursor + 2).equals(Buffer.from("--"))) break;
    if (body.subarray(cursor, cursor + 2).equals(Buffer.from("\r\n"))) cursor += 2;
    const nextBoundary = body.indexOf(boundary, cursor);
    if (nextBoundary < 0) break;

    const part = body.subarray(cursor, nextBoundary - 2);
    const headerEnd = part.indexOf(separator);
    if (headerEnd >= 0) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const disposition = /content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headers);
      if (disposition) {
        parts.push({
          name: disposition[1],
          fileName: disposition[2],
          value: part.subarray(headerEnd + separator.length),
        });
      }
    }
    cursor = nextBoundary + boundary.length;
  }

  return parts;
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxUploadBytes) {
        settled = true;
        rejectBody(new Error("文件不能超过 50 MB。"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!settled) resolveBody(Buffer.concat(chunks));
    });
    request.on("error", (error) => {
      if (!settled) rejectBody(error);
    });
  });
}

function runFfmpeg(args) {
  return new Promise((resolveProcess, rejectProcess) => {
    const ffmpeg = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    ffmpeg.on("error", rejectProcess);
    ffmpeg.on("close", (code) => {
      if (code === 0) resolveProcess();
      else rejectProcess(new Error(stderr || "FFmpeg 未能完成转换。"));
    });
  });
}

async function convertUpload(request, response) {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    sendJson(response, 415, { message: "请求必须使用 multipart/form-data。" });
    return;
  }

  try {
    const parts = parseMultipart(contentType, await readRequestBody(request));
    const upload = parts.find((part) => part.name === "file" && part.fileName);
    const target = parts.find((part) => part.name === "format")?.value.toString("utf8");
    const output = outputFormats.get(target);
    if (!upload || !output) {
      sendJson(response, 400, { message: "请选择一个文件和有效的输出格式。" });
      return;
    }

    const safeFileName = basename(upload.fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    const inspection = inspectAudioFile({ fileName: safeFileName, header: upload.value.subarray(0, 32) });
    if (!inspection.supported) {
      sendJson(response, 422, inspection);
      return;
    }

    const temporaryDirectory = await mkdtemp(join(tmpdir(), "local-audio-converter-"));
    const sourcePath = join(temporaryDirectory, `input${extname(safeFileName).toLowerCase()}`);
    const outputPath = join(temporaryDirectory, `output.${target}`);
    try {
      await writeFile(sourcePath, upload.value);
      await runFfmpeg(["-y", "-i", sourcePath, "-vn", "-map_metadata", "0", ...output.args, outputPath]);
      const converted = await readFile(outputPath);
      const outputName = `${basename(safeFileName, extname(safeFileName))}.${target}`;
      response.writeHead(200, {
        "Content-Type": output.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(outputName)}`,
        "Content-Length": converted.length,
        "Cache-Control": "no-store",
      });
      response.end(converted);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  } catch (error) {
    const statusCode = error.message === "文件不能超过 50 MB。" ? 413 : 500;
    sendJson(response, statusCode, {
      message: statusCode === 413 ? error.message : "转换失败：请确认文件是未加密且未损坏的音频文件。",
    });
  }
}

async function serveStatic(request, response) {
  const requestedPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const filePath = normalize(join(publicDirectory, requestedPath));
  if (!filePath.startsWith(publicDirectory)) {
    response.writeHead(403).end();
    return;
  }

  try {
    const extension = extname(filePath);
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[extension] ?? "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
}

import { formatQrImageUrl, fetchNetEaseApi, parsePlaylistResponse, sanitizePlaylistName } from "./lib/netease-api.js";

// ---------- SSE 流式导出工具 ----------

function writeSseEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// 总进度 = 直链获取阶段占 0-10%，逐曲下载阶段占 10-100%
function overallFor(completedTracks, currentFraction, total) {
  if (!total) return 0;
  return Math.min(100, 10 + 90 * ((completedTracks + currentFraction) / total));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/**
 * 执行歌单批量多线程并行导出，通过 emit(event) 实时推送进度事件：
 *  start {type,total,playlistName,concurrency,overall} | urls {type,done,total,overall}
 *  track {type,index,total,title,artist,activeCount,completed,overall} | progress {type,index,title,artist,downloaded,totalBytes,percent,speedBytesPerSec,phase,concurrency,completed,total,overall}
 *  track-done {type,index,total,title,artist,completed,overall} | track-fail {type,index,total,title,artist,reason,completed,overall}
 *  done {type,code,message,successCount,failedCount,successTracks,failedTracks,overall}
 */
export async function exportPlaylistWithEvents({ id, name, outputRoot, cookie, concurrency = 4 }, emit) {
  const poolConcurrency = Math.max(1, Math.min(Number(concurrency) || 4, 8));
  console.log(`[EXPORT PLAYLIST] Starting parallel export for: ${name} (ID: ${id}) to: ${outputRoot} with concurrency ${poolConcurrency}`);

  // 1. 获取歌单内曲目 ID 与基本信息
  const playlistRes = await fetchNetEaseApi("/v6/playlist/detail", {
    params: { id, n: 1000, timestamp: Date.now() },
    cookie,
  });

  const tracks = playlistRes?.playlist?.tracks || [];
  if (tracks.length === 0) {
    const emptySummary = { code: 200, message: "歌单内无任何歌曲", successCount: 0, failedCount: 0, successTracks: [], failedTracks: [] };
    emit({ type: "done", ...emptySummary, overall: 100 });
    return emptySummary;
  }

  const effectiveConcurrency = Math.min(poolConcurrency, tracks.length);
  emit({ type: "start", total: tracks.length, playlistName: name, concurrency: effectiveConcurrency, overall: 0 });

  // 2. 批量分段查询歌曲下载链接，规避参数长度限制
  const batchSize = 50;
  const songUrlsMap = new Map();
  const batchCount = Math.ceil(tracks.length / batchSize);

  for (let i = 0; i < tracks.length; i += batchSize) {
    const batchTracks = tracks.slice(i, i + batchSize);
    const ids = batchTracks.map(t => t.id);
    const batchIndex = i / batchSize + 1;
    try {
      const playerUrlRes = await fetchNetEaseApi("/song/enhance/player/url/v1", {
        method: "POST",
        body: {
          ids: `[${ids.join(",")}]`,
          level: "exhigh",
          encodeType: "flac",
        },
        cookie,
      });
      const urlList = playerUrlRes?.data || [];
      urlList.forEach((item) => {
        if (item.url) {
          songUrlsMap.set(item.id, item.url);
        }
      });
    } catch (e) {
      console.error(`获取歌曲 URL 批次失败: `, e);
    }
    emit({ type: "urls", done: batchIndex, total: batchCount, overall: Math.round(5 * (batchIndex / batchCount)) });
  }

  // 3. 多线程并发池 (Worker Pool) 调度下载、解密 NCM 并进行 MP3 转码压制
  const successTracks = [];
  const failedTracks = [];
  let successCount = 0;
  let failedCount = 0;
  let completedCount = 0;

  // 维护所有正在执行的任务状态及速率，计算聚合网速与综合进度
  const activeWorkers = new Map();

  function emitAggregateProgress(activeTitle, activeArtist, activeIndex, activePercent) {
    let totalSpeed = 0;
    let inFlightWeight = 0;
    for (const info of activeWorkers.values()) {
      totalSpeed += info.speedBytesPerSec || 0;
      inFlightWeight += (info.percent || 0) / 100;
    }
    const overall = Math.min(
      99,
      Math.round(5 + 95 * ((completedCount + inFlightWeight) / tracks.length))
    );
    emit({
      type: "progress",
      index: activeIndex,
      title: activeTitle,
      artist: activeArtist,
      percent: Math.min(100, Math.round(activePercent || 0)),
      speedBytesPerSec: totalSpeed,
      concurrency: activeWorkers.size,
      completed: completedCount,
      total: tracks.length,
      overall,
    });
  }

  async function processSingleTrack(track, index) {
    const initialUrl = songUrlsMap.get(track.id);
    const artist = track.ar?.map(a => a.name).join(", ") || track.artists?.map(a => a.name).join(", ") || "Unknown Artist";
    const title = track.name;

    activeWorkers.set(track.id, {
      speedBytesPerSec: 0,
      percent: 0,
      title,
      artist,
      index,
      lastBytes: 0,
      lastTime: Date.now(),
    });

    emit({
      type: "track",
      index,
      total: tracks.length,
      title,
      artist,
      activeCount: activeWorkers.size,
      concurrency: effectiveConcurrency,
      completed: completedCount,
      overall: Math.min(99, Math.round(5 + 95 * (completedCount / tracks.length))),
    });

    const onProgress = ({ downloaded, totalBytes, percent, phase }) => {
      const workerInfo = activeWorkers.get(track.id);
      if (workerInfo) {
        const now = Date.now();
        const deltaBytes = downloaded - workerInfo.lastBytes;
        const deltaMs = now - workerInfo.lastTime;
        if (deltaBytes > 0 && deltaMs > 0) {
          workerInfo.speedBytesPerSec = Math.round((deltaBytes / deltaMs) * 1000);
        }
        workerInfo.lastBytes = downloaded;
        workerInfo.lastTime = now;
        workerInfo.percent = Math.min(100, percent || 0);
      }
      emitAggregateProgress(title, artist, index, percent);
    };

    try {
      // 首先尝试使用批量获取的初始直链（320k 最高画质/音质）
      if (initialUrl) {
        try {
          await downloadAndExportTrack({
            outputRoot,
            playlistName: name,
            artist,
            title,
            downloadUrl: initialUrl,
            cookie,
            onProgress,
          });
          successCount++;
          completedCount++;
          successTracks.push({ title, artist });
          activeWorkers.delete(track.id);
          emit({
            type: "track-done",
            index,
            total: tracks.length,
            title,
            artist,
            completed: completedCount,
            overall: Math.min(99, Math.round(5 + 95 * (completedCount / tracks.length))),
          });
          return;
        } catch (errInitial) {
          console.warn(`[DOWNLOAD FALLBACK] 初始 320k 直链下载失败，尝试官方通用外链: ${artist} - ${title}`, errInitial.message);
        }
      } else {
        console.warn(`[DOWNLOAD FALLBACK] 初始直链缺失，尝试官方通用外链: ${artist} - ${title}`);
      }

      // 2. 降级使用网易云官方嵌入式通用外链接口
      const outerUrl = `https://music.163.com/song/media/outer/url?id=${track.id}.mp3`;
      await downloadAndExportTrack({
        outputRoot,
        playlistName: name,
        artist,
        title,
        downloadUrl: outerUrl,
        cookie,
        onProgress,
      });
      successCount++;
      completedCount++;
      successTracks.push({ title, artist });
      activeWorkers.delete(track.id);
      emit({
        type: "track-done",
        index,
        total: tracks.length,
        title,
        artist,
        completed: completedCount,
        overall: Math.min(99, Math.round(5 + 95 * (completedCount / tracks.length))),
      });
    } catch (err) {
      console.error(`导出曲目最终失败: ${artist} - ${title}`, err);
      failedCount++;
      completedCount++;
      failedTracks.push({ title, artist, reason: err.message });
      activeWorkers.delete(track.id);
      emit({
        type: "track-fail",
        index,
        total: tracks.length,
        title,
        artist,
        completed: completedCount,
        reason: err.message,
        overall: Math.min(99, Math.round(5 + 95 * (completedCount / tracks.length))),
      });
    }
  }

  // 并发池执行器
  let cursor = 0;
  const workers = [];
  for (let w = 0; w < effectiveConcurrency; w++) {
    workers.push((async () => {
      while (cursor < tracks.length) {
        const t = cursor++;
        const track = tracks[t];
        await processSingleTrack(track, t + 1);
      }
    })());
  }

  await Promise.all(workers);

  console.log(`[EXPORT PLAYLIST] Parallel export finished: ${name}. Success: ${successCount}, Failed: ${failedCount}`);
  const summary = {
    code: 200,
    message: `歌单多线程并行导出完成！(并发线程: ${effectiveConcurrency})`,
    successCount,
    failedCount,
    successTracks,
    failedTracks,
  };
  emit({ type: "done", ...summary, overall: 100 });
  return summary;
}

async function runDiagnostic() {
  console.log("[DIAGNOSTIC] Running NetEase CDN download test...");
  try {
    const res = await fetchNetEaseApi("/song/enhance/player/url", {
      params: { ids: JSON.stringify(["2638599405"]), br: 320000, timestamp: Date.now() }
    });
    const downloadUrl = res?.data?.[0]?.url;
    if (!downloadUrl) {
      console.log("[DIAGNOSTIC] Failed to get player URL.");
      return;
    }
    console.log("[DIAGNOSTIC] Target CDN URL:", downloadUrl);

    // Case 1: No headers
    try {
      const r1 = await fetch(downloadUrl);
      console.log(`[DIAGNOSTIC] Case 1 (No Headers) Status: ${r1.status}`);
    } catch (e) {
      console.log(`[DIAGNOSTIC] Case 1 failed: ${e.message}`);
    }

    // Case 2: Browser UA + Referer
    try {
      const r2 = await fetch(downloadUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://music.163.com/"
        }
      });
      console.log(`[DIAGNOSTIC] Case 2 (UA + Referer) Status: ${r2.status}`);
    } catch (e) {
      console.log(`[DIAGNOSTIC] Case 2 failed: ${e.message}`);
    }
  } catch (err) {
    console.log("[DIAGNOSTIC] Error running diagnostic:", err.message);
  }
}

export function createAppServer() {
  setTimeout(runDiagnostic, 2000);
  return createHttpServer(async (request, response) => {
    const urlObj = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

    if (request.method === "GET" && urlObj.pathname === "/api/login/qr/key") {
      let unikey = null;
      try {
        const neteaseRes = await fetchNetEaseApi("/login/qrcode/unikey", {
          params: { type: 1, timestamp: Date.now() },
          timeout: 2500,
        }).catch(() => null);

        unikey = neteaseRes?.unikey || neteaseRes?.data?.unikey;
      } catch (err) {
        // Fallback below
      }

      if (!unikey) {
        unikey = `dj_key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }

      const qrImg = formatQrImageUrl(unikey);
      sendJson(response, 200, { code: 200, unikey, qrImg });
      return;
    }

    if (request.method === "GET" && urlObj.pathname === "/api/login/qr/check") {
      const key = urlObj.searchParams.get("key");
      try {
        const checkRes = await fetchNetEaseApi("/login/qrcode/client/login", {
          method: "POST",
          params: { type: 1, key, timestamp: Date.now() },
          body: { type: 1, key },
        });

        console.log(`[QR CHECK] key=${key} checkRes=`, JSON.stringify(checkRes));
        sendJson(response, 200, checkRes || { code: 801, message: "等待扫码" });
      } catch (err) {
        console.error(`[QR CHECK ERROR] key=${key}`, err);
        sendJson(response, 200, { code: 801, message: "等待扫码", key });
      }
      return;
    }

    if (request.method === "GET" && urlObj.pathname === "/api/user/playlists") {
      const cookie = urlObj.searchParams.get("cookie") || request.headers["x-cookie"] || "";
      console.log(`[PLAYLISTS FETCH] cookie received=`, cookie);
      try {
        const accountRes = await fetchNetEaseApi("/nuser/account/get", { cookie }).catch((e) => {
          console.error("[ACCOUNT FETCH ERROR] fetch failed", e);
          return null;
        });
        console.log(`[ACCOUNT FETCH] accountRes=`, JSON.stringify(accountRes));
        const userId = accountRes?.account?.id || accountRes?.profile?.userId;

        if (!userId) {
          sendJson(response, 401, { message: "未获取到用户账号 ID，请重新扫码登录。" });
          return;
        }

        const playlistRes = await fetchNetEaseApi("/user/playlist", {
          params: { uid: userId, limit: 100, timestamp: Date.now() },
          cookie,
        });
        console.log(`[PLAYLISTS FETCH] playlistRes status=`, playlistRes?.code, `count=`, playlistRes?.playlist?.length);

        const playlists = parsePlaylistResponse(playlistRes);
        sendJson(response, 200, { code: 200, userId, playlists });
      } catch (err) {
        console.error("[PLAYLISTS FETCH ERROR]", err);
        sendJson(response, 500, { message: "无法获取用户歌单: " + err.message });
      }
      return;
    }

    if (request.method === "POST" && urlObj.pathname === "/api/playlist/create") {
      try {
        const bodyStr = await new Promise((resolve, reject) => {
          let chunks = [];
          request.on("data", (chunk) => chunks.push(chunk));
          request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          request.on("error", reject);
        });
        const params = JSON.parse(bodyStr);
        const { name, privacy = 0, cookie } = params;
        const safeName = sanitizePlaylistName(name);
        if (!safeName) {
          sendJson(response, 400, { message: "歌单名称不能为空" });
          return;
        }
        const resData = await fetchNetEaseApi("/playlist/create", {
          method: "POST",
          body: { name: safeName, privacy: privacy.toString(), type: "NORMAL" },
          cookie,
        });
        sendJson(response, 200, resData);
      } catch (err) {
        sendJson(response, 500, { message: "新建歌单发生异常: " + err.message });
      }
      return;
    }

    if (request.method === "POST" && urlObj.pathname === "/api/playlist/delete") {
      try {
        const bodyStr = await new Promise((resolve, reject) => {
          let chunks = [];
          request.on("data", (chunk) => chunks.push(chunk));
          request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          request.on("error", reject);
        });
        const params = JSON.parse(bodyStr);
        const { id, cookie } = params;
        if (!id) {
          sendJson(response, 400, { message: "歌单 ID 不能为空" });
          return;
        }
        const resData = await fetchNetEaseApi("/playlist/delete", {
          method: "POST",
          body: { pid: id.toString(), id: id.toString() },
          cookie,
        });
        sendJson(response, 200, resData);
      } catch (err) {
        sendJson(response, 500, { message: "删除歌单发生异常: " + err.message });
      }
      return;
    }

    if (request.method === "GET" && urlObj.pathname === "/api/song/search") {
      const keywords = urlObj.searchParams.get("keywords") || urlObj.searchParams.get("s") || "";
      const type = urlObj.searchParams.get("type") || "1";
      const limit = urlObj.searchParams.get("limit") || "30";
      const offset = urlObj.searchParams.get("offset") || "0";
      const cookie = urlObj.searchParams.get("cookie") || "";

      if (!keywords.trim()) {
        sendJson(response, 400, { message: "搜索关键词不能为空" });
        return;
      }

      try {
        const resData = await fetchNetEaseApi("/cloudsearch/pc", {
          method: "POST",
          body: { s: keywords.trim(), type, limit, offset },
          cookie,
        });
        sendJson(response, 200, resData);
      } catch (err) {
        sendJson(response, 500, { message: "歌曲搜索失败: " + err.message });
      }
      return;
    }

    if (request.method === "GET" && urlObj.pathname === "/api/playlist/detail") {
      const id = urlObj.searchParams.get("id");
      const cookie = urlObj.searchParams.get("cookie") || "";

      if (!id) {
        sendJson(response, 400, { message: "缺少歌单 ID" });
        return;
      }

      try {
        const resData = await fetchNetEaseApi("/v6/playlist/detail", {
          params: { id, n: 1000, timestamp: Date.now() },
          cookie,
        });
        sendJson(response, 200, resData);
      } catch (err) {
        sendJson(response, 500, { message: "获取歌单详情失败: " + err.message });
      }
      return;
    }

    if (request.method === "POST" && urlObj.pathname === "/api/playlist/tracks/update") {
      try {
        const bodyStr = await new Promise((resolve, reject) => {
          let chunks = [];
          request.on("data", (chunk) => chunks.push(chunk));
          request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          request.on("error", reject);
        });
        const params = JSON.parse(bodyStr);
        const { op, pid, trackIds, cookie } = params; // op: 'add' | 'del'

        if (!op || !pid || !trackIds) {
          sendJson(response, 400, { message: "缺少必要参数: op, pid, trackIds" });
          return;
        }

        const idsArrayStr = Array.isArray(trackIds) ? JSON.stringify(trackIds) : trackIds.toString().startsWith("[") ? trackIds : `[${trackIds}]`;

        const resData = await fetchNetEaseApi("/playlist/manipulate/tracks", {
          method: "POST",
          body: { op, pid: pid.toString(), trackIds: idsArrayStr },
          cookie,
        });
        sendJson(response, 200, resData);
      } catch (err) {
        sendJson(response, 500, { message: "歌单歌曲修改异常: " + err.message });
      }
      return;
    }

    if (request.method === "GET" && urlObj.pathname === "/api/song/url") {
      const id = urlObj.searchParams.get("id");
      const cookie = urlObj.searchParams.get("cookie") || "";

      if (!id) {
        sendJson(response, 400, { message: "缺少歌曲 ID" });
        return;
      }

      try {
        const resData = await fetchNetEaseApi("/song/enhance/player/url/v1", {
          method: "POST",
          body: { ids: `[${id}]`, level: "exhigh", encodeType: "flac" },
          cookie,
        });
        sendJson(response, 200, resData);
      } catch (err) {
        sendJson(response, 500, { message: "获取歌曲播放流失败: " + err.message });
      }
      return;
    }

    if (request.method === "POST" && urlObj.pathname === "/api/playlist/export") {
      try {
        const bodyStr = await readJsonBody(request);
        const params = JSON.parse(bodyStr);
        const { id, name, outputRoot, cookie } = params;

        if (!id || !name) {
          sendJson(response, 400, { message: "缺少必要参数: id, name" });
          return;
        }

        const wantsStream = (request.headers.accept || "").includes("text/event-stream");

        if (!wantsStream) {
          // 非流式兼容：返回一次性 JSON 摘要
          const events = [];
          await exportPlaylistWithEvents({ id, name, outputRoot, cookie }, (evt) => events.push(evt));
          const doneEvt = events.find((e) => e.type === "done");
          sendJson(response, 200, doneEvt || { code: 500, message: "导出未完成" });
          return;
        }

        // SSE 流式导出：实时推送每首歌的下载进度事件
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        });
        response.write("retry: 1000\n\n");

        try {
          await exportPlaylistWithEvents({ id, name, outputRoot, cookie }, (evt) => writeSseEvent(response, evt));
        } catch (err) {
          console.error("歌单导出异常", err);
          writeSseEvent(response, { type: "error", message: "批量导出发生异常: " + err.message });
        } finally {
          response.end();
        }
      } catch (err) {
        console.error("歌单导出异常", err);
        sendJson(response, 500, { message: "批量导出发生异常: " + err.message });
      }
      return;
    }

    // ===== DJ Agent Endpoints & Request Logger =====
    if (urlObj.pathname.startsWith("/api/agent/")) {
      const nowStr = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      console.log(`[AGENT API ${nowStr}] ${request.method} ${urlObj.pathname}`);
    }

    if (request.method === "POST" && urlObj.pathname === "/api/agent/chat") {
      try {
        const bodyStr = await readJsonBody(request);
        const params = JSON.parse(bodyStr || "{}");
        const { message, history = [], cookie = "", config = {} } = params;

        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        });
        response.write("retry: 1000\n\n");

        try {
          await dispatchAgentWorkflow({
            message,
            history,
            cookie,
            config,
            onStream: (evt) => writeSseEvent(response, evt),
          });
        } catch (err) {
          writeSseEvent(response, { type: "text", data: `\n\n⚠️ 处理请求失败: ${err.message}` });
        } finally {
          writeSseEvent(response, { type: "done", data: "stream_finished" });
          response.end();
        }
      } catch (err) {
        sendJson(response, 500, { message: "Agent 对话异常: " + err.message });
      }
      return;
    }

    if (request.method === "POST" && urlObj.pathname === "/api/agent/parse-1001tl") {
      try {
        const bodyStr = await readJsonBody(request);
        const params = JSON.parse(bodyStr || "{}");
        const { url, text, cookie = "" } = params;

        let parsedSet;
        if (url) {
          parsedSet = await fetchAndParse1001TracklistUrl(url, { filterUnreleased: true });
        } else if (text) {
          parsedSet = parseTracklistText(text, { filterUnreleased: true });
        } else {
          sendJson(response, 400, { message: "缺少 url 或 text 参数" });
          return;
        }

        const matchRes = await batchMatchTracklist(parsedSet.tracks, cookie);
        sendJson(response, 200, {
          title: parsedSet.title || "Live Set",
          dj: parsedSet.dj || "",
          parsedSet,
          matchRes,
        });
      } catch (err) {
        sendJson(response, 500, { message: "1001TL 解析异常: " + err.message });
      }
      return;
    }

    if (request.method === "GET" && urlObj.pathname === "/api/agent/trend-genres") {
      sendJson(response, 200, { genres: getAvailableGenres() });
      return;
    }

    if (request.method === "POST" && urlObj.pathname === "/api/agent/trend-radar") {
      try {
        const bodyStr = await readJsonBody(request);
        const params = JSON.parse(bodyStr || "{}");
        const { genre, cookie = "" } = params;

        const genreData = await getTrendingTracksByGenre(genre);
        const matchRes = await batchMatchTracklist(genreData.tracks, cookie);
        sendJson(response, 200, {
          genreData,
          matchRes,
        });
      } catch (err) {
        sendJson(response, 500, { message: "获取热单雷达异常: " + err.message });
      }
      return;
    }

    if (request.method === "POST" && urlObj.pathname === "/api/agent/artist-sets") {
      try {
        const bodyStr = await readJsonBody(request);
        const params = JSON.parse(bodyStr || "{}");
        const { artist } = params;

        if (!artist) {
          sendJson(response, 400, { message: "缺少 artist 参数" });
          return;
        }

        const result = await searchArtistRecentSets(artist);
        sendJson(response, 200, result);
      } catch (err) {
        sendJson(response, 500, { message: "检索艺人现场失败: " + err.message });
      }
      return;
    }

    if (request.method === "POST" && urlObj.pathname === "/api/agent/camelot") {
      try {
        const bodyStr = await readJsonBody(request);
        const params = JSON.parse(bodyStr || "{}");
        const { fromKey, fromBpm, toKey, toBpm, key } = params;

        if (key) {
          const norm = normalizeCamelotKey(key);
          sendJson(response, 200, {
            key: norm,
            compatible: getCompatibleKeys(norm),
          });
          return;
        }

        const analysis = analyzeTransition(fromKey, Number(fromBpm), toKey, Number(toBpm));
        sendJson(response, 200, analysis);
      } catch (err) {
        sendJson(response, 500, { message: "Camelot 调性分析异常: " + err.message });
      }
      return;
    }

    if (request.method === "POST" && urlObj.pathname === "/api/agent/models") {
      try {
        const bodyStr = await readJsonBody(request);
        const params = JSON.parse(bodyStr || "{}");
        const config = params.config || {};
        const models = await listAvailableModels(config);
        sendJson(response, 200, { code: 200, models });
      } catch (err) {
        sendJson(response, 200, {
          code: 200,
          warning: err.message,
          models: ["deepseek-v4-flash", "deepseek-v4-pro"],
        });
      }
      return;
    }

    if (request.method === "POST" && urlObj.pathname === "/api/agent/create-playlist") {
      try {
        const bodyStr = await readJsonBody(request);
        const params = JSON.parse(bodyStr || "{}");
        const { name, songIds = [], privacy = "0", cookie = "" } = params;

        const safeName = sanitizePlaylistName(name);
        if (!safeName) {
          sendJson(response, 400, { message: "缺少有效的歌单名称" });
          return;
        }

        if (!cookie) {
          sendJson(response, 401, {
            code: 401,
            message: "尚未登录网易云账号，无法直接在云端创建歌单。请先扫码登录，或保存至本地歌单。",
          });
          return;
        }

        // 1. 创建歌单
        const createRes = await fetchNetEaseApi("/playlist/create", {
          method: "POST",
          body: { name: safeName, privacy: String(privacy), type: "NORMAL" },
          cookie,
        });

        const playlistId = createRes?.id || createRes?.playlist?.id;
        if (!playlistId) {
          const detailMsg = createRes?.message || createRes?.msg || "网易云服务器拒绝创建歌单（可能登录已过期，请重新扫码登录）";
          sendJson(response, 400, { code: createRes?.code || 400, message: detailMsg, detail: createRes });
          return;
        }

        // 2. 批量添加歌曲到新建的歌单 (网易云 API 的 op: 'add' 会将曲目逐个置顶前置插入，因此需在请求前反转 ID 数组，以保证最终歌单严格保持 Set 从前到后的正序)
        let addedCount = 0;
        if (Array.isArray(songIds) && songIds.length > 0) {
          const orderedTrackIds = [...songIds].reverse();
          const trackIdsStr = `[${orderedTrackIds.map(Number).join(",")}]`;
          const addRes = await fetchNetEaseApi("/playlist/manipulate/tracks", {
            method: "POST",
            body: {
              op: "add",
              pid: String(playlistId),
              trackIds: trackIdsStr,
            },
            cookie,
          });
          addedCount = addRes?.count || songIds.length;
        }

        sendJson(response, 200, {
          code: 200,
          message: "歌单创建成功并已添加曲目",
          playlistId,
          name,
          addedCount,
        });
      } catch (err) {
        sendJson(response, 500, { message: "创建歌单与添加曲目失败: " + err.message });
      }
      return;
    }

    if (request.method === "POST" && request.url === "/api/convert") {
      void convertUpload(request, response);
      return;
    }
    if (request.method === "GET") {
      void serveStatic(request, response);
      return;
    }
    response.writeHead(405).end();
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const port = Number(process.env.PORT ?? 4178);
  createAppServer().listen(port, () => {
    console.log(`本地音频转换工具正在 http://127.0.0.1:${port} 运行`);
  });
}
