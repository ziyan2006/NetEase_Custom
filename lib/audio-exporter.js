import { mkdir, writeFile, readFile, rm, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { sanitizeFolderName, formatSongFilename } from "./playlist-exporter.js";
import { decodeNcmBuffer } from "./ncm-decoder.js";

function runFfmpeg(args) {
  return new Promise((resolveProcess, rejectProcess) => {
    const ffmpeg = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    ffmpeg.on("error", rejectProcess);
    ffmpeg.on("close", (code) => {
      if (code === 0) resolveProcess();
      else rejectProcess(new Error(stderr || "FFmpeg failed"));
    });
  });
}

export function resolvePlaylistOutputPath(outputRoot, playlistName, artist, title) {
  const safeRoot = resolve(outputRoot || "DJ_Music_Library");
  const safePlaylist = sanitizeFolderName(playlistName);
  const playlistDir = join(safeRoot, safePlaylist);
  const filename = formatSongFilename(artist, title);
  const filePath = join(playlistDir, filename);
  return { playlistDir, filename, filePath };
}

export async function exportPlaylistTrack({ outputRoot, playlistName, artist, title, audioBuffer, format = "mp3" }) {
  const { playlistDir, filePath } = resolvePlaylistOutputPath(outputRoot, playlistName, artist, title);
  await mkdir(playlistDir, { recursive: true });

  let processedBuffer = audioBuffer;
  const isNcm = audioBuffer.length > 8 && audioBuffer.subarray(0, 8).toString("ascii") === "CTENFDAM";
  
  if (isNcm) {
    const decoded = decodeNcmBuffer(audioBuffer);
    processedBuffer = decoded.audioBuffer;
  }

  await writeFile(filePath, processedBuffer);
  return { playlistDir, filePath };
}

// 全自动下载、解密、压制 320kbps MP3 并导出至本地目标文件夹的引擎
export async function downloadAndExportTrack({ outputRoot, playlistName, artist, title, downloadUrl, cookie }) {
  const { playlistDir, filePath } = resolvePlaylistOutputPath(outputRoot, playlistName, artist, title);
  await mkdir(playlistDir, { recursive: true });

  console.log(`[DOWNLOAD TRACK] Fetching song: ${artist} - ${title}`);
  console.log(`[DOWNLOAD TRACK] URL: ${downloadUrl}`);
  const fetchHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://music.163.com/",
  };
  
  if (downloadUrl.includes("music.163.com") && cookie) {
    fetchHeaders["Cookie"] = cookie;
  }
  
  console.log(`[DOWNLOAD TRACK] Request Headers:`, fetchHeaders);

  const response = await fetch(downloadUrl, {
    headers: fetchHeaders
  });
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("下载音频失败 (403): 该曲目为网易云 VIP 付费或版权限制歌曲，当前登录账号无权限下载 320k 最高画质/音质。");
    }
    throw new Error(`下载音频失败 (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("该曲目为网易云 VIP 付费或版权限制歌曲，当前登录账号无权限下载（未开通 VIP 账号或处于地区限制）。");
  }

  const arrayBuffer = await response.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);

  // 1. NCM 解密
  const isNcm = buffer.length > 8 && buffer.subarray(0, 8).toString("ascii") === "CTENFDAM";
  if (isNcm) {
    const decoded = decodeNcmBuffer(buffer);
    buffer = decoded.audioBuffer;
  }

  // 2. 检查是否为标准 MP3 (ID3 帧头或 layer 3 同步字 0xFFE0 / 0xFFF0 等)
  const isMp3 = (buffer.length > 3 && buffer.subarray(0, 3).toString("ascii") === "ID3") ||
                (buffer.length > 2 && buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0);

  if (isMp3) {
    // MP3 直接落盘，避免二次损耗
    await writeFile(filePath, buffer);
  } else {
    // 非 MP3（FLAC/WAV/M4A/AAC 等）通过 FFmpeg 转码为高品质 320kbps MP3
    const tempDir = await mkdtemp(join(tmpdir(), "dj-ncm-transcode-"));
    const sourcePath = join(tempDir, "input_source");
    const outputPath = join(tempDir, "output.mp3");

    try {
      await writeFile(sourcePath, buffer);
      await runFfmpeg(["-y", "-i", sourcePath, "-vn", "-b:a", "320k", "-map_metadata", "0", outputPath]);
      const converted = await readFile(outputPath);
      await writeFile(filePath, converted);
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => null);
    }
  }

  return { playlistDir, filePath };
}
