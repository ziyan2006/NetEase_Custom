import { createServer as createHttpServer } from "node:http";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { basename, extname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { inspectAudioFile } from "./lib/audio-file.js";

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

import { formatQrImageUrl, fetchNetEaseApi } from "./lib/netease-api.js";

export function createAppServer() {
  return createHttpServer(async (request, response) => {
    const urlObj = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

    if (request.method === "GET" && urlObj.pathname === "/api/login/qr/key") {
      try {
        const neteaseRes = await fetchNetEaseApi("/login/qrcode/unikey", {
          params: { type: 1, timestamp: Date.now() },
        });

        const unikey = neteaseRes?.unikey || neteaseRes?.data?.unikey;
        if (!unikey) {
          sendJson(response, 500, { message: "未能获取网易云官方 Key" });
          return;
        }
        const qrImg = formatQrImageUrl(unikey);
        sendJson(response, 200, { code: 200, unikey, qrImg });
      } catch (err) {
        sendJson(response, 500, { message: "无法获取真实扫码 Key" });
      }
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

        sendJson(response, 200, checkRes || { code: 801, message: "等待扫码" });
      } catch (err) {
        sendJson(response, 200, { code: 801, message: "等待扫码", key });
      }
      return;
    }

    if (request.method === "GET" && urlObj.pathname === "/api/user/playlists") {
      const cookie = urlObj.searchParams.get("cookie") || request.headers["x-cookie"] || "";
      try {
        const accountRes = await fetchNetEaseApi("/nuser/account/get", { cookie }).catch(() => null);
        const userId = accountRes?.account?.id || accountRes?.profile?.userId;

        if (!userId) {
          sendJson(response, 401, { message: "未获取到用户账号 ID，请重新扫码登录。" });
          return;
        }

        const playlistRes = await fetchNetEaseApi("/user/playlist", {
          params: { uid: userId, limit: 100, timestamp: Date.now() },
          cookie,
        });

        const playlists = parsePlaylistResponse(playlistRes);
        sendJson(response, 200, { code: 200, userId, playlists });
      } catch (err) {
        sendJson(response, 500, { message: "无法获取用户歌单: " + err.message });
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
  const port = Number(process.env.PORT ?? 4173);
  createAppServer().listen(port, () => {
    console.log(`本地音频转换工具正在 http://127.0.0.1:${port} 运行`);
  });
}
