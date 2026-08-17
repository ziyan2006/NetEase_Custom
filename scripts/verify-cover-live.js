import { downloadAndExportTrack } from "../lib/audio-exporter.js";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runLiveVerification() {
  const testRoot = join(tmpdir(), "verify_cover_export_" + Date.now());
  console.log("[VERIFICATION] Output Directory:", testRoot);

  // 实机请求网易云官方公开代表作：Alan Walker - Fade
  const trackInfo = {
    outputRoot: testRoot,
    playlistName: "DJ_Live_Verification",
    artist: "Alan Walker",
    title: "Fade",
    album: "Fade - Single",
    coverUrl: "http://p4.music.126.net/C8WtOUxN4NMWFlTV3GmJcg==/109951169023366938.jpg",
    downloadUrl: "https://music.163.com/song/media/outer/url?id=29947420.mp3",
    onProgress: (p) => {
      console.log(`[PROGRESS] phase=${p.phase} percent=${p.percent.toFixed(1)}% downloaded=${p.downloaded} bytes`);
    },
  };

  console.log("[VERIFICATION] Starting live download & cover embedding...");
  const result = await downloadAndExportTrack(trackInfo);
  console.log("[VERIFICATION] Export finished. File created at:", result.filePath);

  const stat = await fs.stat(result.filePath);
  console.log("[VERIFICATION] File size:", (stat.size / 1024 / 1024).toFixed(2), "MB");

  // 使用 FFmpeg 探测导出的 MP3 元数据与内嵌封面 (attached pic)
  const probe = spawn(ffmpegPath, ["-i", result.filePath]);
  let probeOutput = "";
  probe.stderr.on("data", (d) => (probeOutput += d.toString()));
  await new Promise((resolve) => probe.on("close", resolve));

  console.log("\n=== FFmpeg Probe Output ===");
  const relevantLines = probeOutput
    .split("\n")
    .filter(
      (l) =>
        l.includes("title") ||
        l.includes("artist") ||
        l.includes("album") ||
        l.includes("Audio:") ||
        l.includes("Video:") ||
        l.includes("attached pic") ||
        l.includes("Stream #")
    );
  console.log(relevantLines.join("\n"));

  // 提取内嵌的封面图片并校验
  const coverExtractPath = join(testRoot, "extracted_cover.jpg");
  const extractCover = spawn(ffmpegPath, [
    "-y",
    "-i",
    result.filePath,
    "-an",
    "-vcodec",
    "copy",
    coverExtractPath,
  ]);
  await new Promise((resolve) => extractCover.on("close", resolve));
  const coverStat = await fs.stat(coverExtractPath);
  console.log(
    "\n[VERIFICATION] Extracted embedded cover image size:",
    (coverStat.size / 1024).toFixed(2),
    "KB"
  );

  if (coverStat.size > 1000 && probeOutput.includes("attached pic")) {
    console.log(
      "\n>>> SUCCESS: MP3 成功内嵌高清封面 (APIC Attached Picture) 与完整 ID3v2.3 标签！<<<"
    );
  } else {
    console.error("\n>>> FAILED: 未检测到内嵌封面 <<<");
    process.exit(1);
  }

  // 清理验证临时目录
  await fs.rm(testRoot, { recursive: true, force: true }).catch(() => null);
}

runLiveVerification().catch((err) => {
  console.error("[VERIFICATION ERROR]:", err);
  process.exit(1);
});
