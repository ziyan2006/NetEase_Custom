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

import { formatQrImageUrl, fetchNetEaseApi, parsePlaylistResponse } from "./lib/netease-api.js";

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
        if (!name || !name.trim()) {
          sendJson(response, 400, { message: "歌单名称不能为空" });
          return;
        }
        const resData = await fetchNetEaseApi("/playlist/create", {
          method: "POST",
          body: { name: name.trim(), privacy: privacy.toString() },
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

    if (request.method === "POST" && urlObj.pathname === "/api/playlist/export") {
      try {
        const bodyStr = await new Promise((resolveResolve, rejectReject) => {
          let chunks = [];
          request.on("data", (chunk) => chunks.push(chunk));
          request.on("end", () => resolveResolve(Buffer.concat(chunks).toString("utf8")));
          request.on("error", rejectReject);
        });

        const params = JSON.parse(bodyStr);
        const { id, name, outputRoot, cookie } = params;

        if (!id || !name) {
          sendJson(response, 400, { message: "缺少必要参数: id, name" });
          return;
        }

        console.log(`[EXPORT PLAYLIST] Starting export for: ${name} (ID: ${id}) to: ${outputRoot}`);

        // 1. 获取歌单内曲目 ID 与基本信息
        const playlistRes = await fetchNetEaseApi("/v6/playlist/detail", {
          params: { id, n: 1000, timestamp: Date.now() },
          cookie,
        });

        const tracks = playlistRes?.playlist?.tracks || [];
        if (tracks.length === 0) {
          sendJson(response, 200, { code: 200, message: "歌单内无任何歌曲", successCount: 0, failedCount: 0 });
          return;
        }

        const successTracks = [];
        const failedTracks = [];

        // 2. 批量分段查询歌曲下载链接，规避参数长度限制
        const batchSize = 50;
        const songUrlsMap = new Map();

        for (let i = 0; i < tracks.length; i += batchSize) {
          const batchTracks = tracks.slice(i, i + batchSize);
          const ids = batchTracks.map(t => t.id);
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
        }

        // 3. 循环下载、解密 NCM 并进行 MP3 转码压制
        for (const track of tracks) {
          const initialUrl = songUrlsMap.get(track.id);
          const artist = track.ar?.map(a => a.name).join(", ") || track.artists?.map(a => a.name).join(", ") || "Unknown Artist";
          const title = track.name;

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
                });
                successTracks.push({ title, artist });
                continue;
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
            });
            successTracks.push({ title, artist });
          } catch (err) {
            console.error(`导出曲目最终失败: ${artist} - ${title}`, err);
            failedTracks.push({ title, artist, reason: err.message });
          }
        }

        console.log(`[EXPORT PLAYLIST] Done: ${name}. Success: ${successTracks.length}, Failed: ${failedTracks.length}`);
        sendJson(response, 200, {
          code: 200,
          message: "歌单批量导出完成！",
          successCount: successTracks.length,
          failedCount: failedTracks.length,
          successTracks,
          failedTracks,
        });

      } catch (err) {
        console.error("歌单导出异常", err);
        sendJson(response, 500, { message: "批量导出发生异常: " + err.message });
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
