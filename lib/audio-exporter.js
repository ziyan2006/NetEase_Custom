import { mkdir, writeFile, readFile, rm, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { sanitizeFolderName, formatSongFilename } from "./playlist-exporter.js";
import { decodeNcmBuffer } from "./ncm-decoder.js";

import ffmpegPath from "ffmpeg-static";
import { existsSync } from "node:fs";

function getFfmpegBinary() {
  if (ffmpegPath && typeof ffmpegPath === "string") {
    // 处理 Electron asarUnpack 虚拟文件系统路径
    const unpackedPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
    if (existsSync(unpackedPath)) {
      return unpackedPath;
    }
    if (existsSync(ffmpegPath)) {
      return ffmpegPath;
    }
  }
  return "ffmpeg";
}

function runFfmpeg(args) {
  return new Promise((resolveProcess, rejectProcess) => {
    const bin = getFfmpegBinary();
    const ffmpeg = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    ffmpeg.on("error", rejectProcess);
    ffmpeg.on("close", (code) => {
      if (code === 0) resolveProcess();
      else rejectProcess(new Error(stderr || "FFmpeg failed"));
    });
  });
}

/**
 * 抓取封面图片 Buffer
 * @param {string} coverUrl
 * @returns {Promise<Buffer|null>}
 */
export async function fetchCoverBuffer(coverUrl) {
  if (!coverUrl || typeof coverUrl !== "string") return null;
  const cleanUrl = coverUrl.startsWith("//") ? `https:${coverUrl}` : coverUrl;
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(cleanUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://music.163.com/",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.warn(`[COVER FETCH NOTE] 获取封面图片失败 (${cleanUrl}):`, e.message);
    return null;
  }
}

/**
 * 使用 FFmpeg 写入 ID3v2.3 标签与内嵌封面 (APIC Attached Picture)
 */
export async function embedMetadataAndCover({
  audioBuffer,
  coverBuffer,
  title,
  artist,
  album,
  filePath,
}) {
  const isMp3 = (audioBuffer.length > 3 && audioBuffer.subarray(0, 3).toString("ascii") === "ID3") ||
                (audioBuffer.length > 2 && audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0);

  const tempDir = await mkdtemp(join(tmpdir(), "dj-embed-cover-"));
  const inputAudioPath = join(tempDir, isMp3 ? "input_audio.mp3" : "input_audio.bin");
  const inputCoverPath = join(tempDir, "cover.jpg");
  const outputPath = join(tempDir, "output.mp3");

  try {
    await writeFile(inputAudioPath, audioBuffer);
    
    const ffmpegArgs = ["-y", "-i", inputAudioPath];
    let hasCover = false;

    if (coverBuffer && Buffer.isBuffer(coverBuffer) && coverBuffer.length > 0) {
      await writeFile(inputCoverPath, coverBuffer);
      ffmpegArgs.push("-i", inputCoverPath);
      ffmpegArgs.push("-map", "0:a", "-map", "1:0");
      hasCover = true;
    }

    if (isMp3) {
      ffmpegArgs.push("-c:a", "copy");
    } else {
      ffmpegArgs.push("-c:a", "libmp3lame", "-b:a", "320k");
    }

    ffmpegArgs.push("-id3v2_version", "3");
    if (title) ffmpegArgs.push("-metadata", `title=${title}`);
    if (artist) ffmpegArgs.push("-metadata", `artist=${artist}`);
    if (album) ffmpegArgs.push("-metadata", `album=${album}`);

    if (hasCover) {
      ffmpegArgs.push("-metadata:s:v", "title=Album cover");
      ffmpegArgs.push("-metadata:s:v", "comment=Cover (front)");
    }

    ffmpegArgs.push(outputPath);

    await runFfmpeg(ffmpegArgs);
    const converted = await readFile(outputPath);
    await writeFile(filePath, converted);
  } catch (err) {
    console.warn(`[FFMPEG METADATA NOTE] FFmpeg 标签压制异常，回退为原生音频直接落盘:`, err.message);
    await writeFile(filePath, audioBuffer);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => null);
  }
}

export function resolvePlaylistOutputPath(outputRoot, playlistName, artist, title) {
  const safeRoot = resolve(outputRoot || "DJ_Music_Library");
  const safePlaylist = sanitizeFolderName(playlistName);
  const playlistDir = join(safeRoot, safePlaylist);
  const filename = formatSongFilename(artist, title);
  const filePath = join(playlistDir, filename);
  return { playlistDir, filename, filePath };
}

export async function exportPlaylistTrack({
  outputRoot,
  playlistName,
  artist,
  title,
  album = "",
  coverUrl = "",
  coverBuffer = null,
  audioBuffer,
  format = "mp3",
}) {
  const { playlistDir, filePath } = resolvePlaylistOutputPath(outputRoot, playlistName, artist, title);
  await mkdir(playlistDir, { recursive: true });

  let processedBuffer = audioBuffer;
  let finalCover = coverBuffer;
  const isNcm = audioBuffer.length > 8 && audioBuffer.subarray(0, 8).toString("ascii") === "CTENFDAM";
  
  if (isNcm) {
    const decoded = decodeNcmBuffer(audioBuffer);
    processedBuffer = decoded.audioBuffer;
    if (decoded.coverBuffer && !finalCover) {
      finalCover = decoded.coverBuffer;
    }
    if (!album && decoded.album) album = decoded.album;
    if (!artist && decoded.artist) artist = decoded.artist;
    if (!title && decoded.title) title = decoded.title;
  }

  if (!finalCover && coverUrl) {
    finalCover = await fetchCoverBuffer(coverUrl);
  }

  await embedMetadataAndCover({
    audioBuffer: processedBuffer,
    coverBuffer: finalCover,
    title,
    artist,
    album: album || playlistName || title,
    filePath,
  });

  return { playlistDir, filePath };
}

// 全自动下载、解密、压制 320kbps MP3 并内嵌高清封面与 ID3 标签导出至本地目标文件夹的引擎
export async function downloadAndExportTrack({
  outputRoot,
  playlistName,
  artist,
  title,
  album = "",
  coverUrl = "",
  downloadUrl,
  cookie,
  onProgress,
}) {
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

  const totalBytes = Number(response.headers.get("content-length")) || 0;
  let buffer;

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let downloaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.length;
      chunks.push(Buffer.from(value));
      if (onProgress) {
        onProgress({
          downloaded,
          totalBytes,
          percent: totalBytes > 0 ? (downloaded / totalBytes) * 100 : 0,
          phase: "downloading",
        });
      }
    }
    buffer = Buffer.concat(chunks);
  } else {
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  }

  if (onProgress) {
    onProgress({
      downloaded: buffer.length,
      totalBytes: buffer.length,
      percent: 100,
      phase: "processing",
    });
  }

  let processedBuffer = buffer;
  let coverBuffer = null;

  // 1. NCM 解密
  const isNcm = buffer.length > 8 && buffer.subarray(0, 8).toString("ascii") === "CTENFDAM";
  if (isNcm) {
    const decoded = decodeNcmBuffer(buffer);
    processedBuffer = decoded.audioBuffer;
    if (decoded.coverBuffer) {
      coverBuffer = decoded.coverBuffer;
    }
    if (!album && decoded.album) album = decoded.album;
    if (!artist && decoded.artist) artist = decoded.artist;
    if (!title && decoded.title) title = decoded.title;
  }

  // 2. 如果未从 NCM 提取到封面且有 coverUrl，并发拉取封面
  if (!coverBuffer && coverUrl) {
    coverBuffer = await fetchCoverBuffer(coverUrl);
  }

  // 3. 压制 ID3v2.3 标签与高清封面 (APIC)
  await embedMetadataAndCover({
    audioBuffer: processedBuffer,
    coverBuffer,
    title,
    artist,
    album: album || playlistName || title,
    filePath,
  });

  return { playlistDir, filePath };
}
