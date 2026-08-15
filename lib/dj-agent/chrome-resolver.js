import fs from "fs";
import path from "path";

/**
 * 自动解析并优先定位随包附带的独立 Chrome / Chromium，若不存在则智能回退到系统 Chrome / Edge
 * @returns {string | undefined} 可执行文件的绝对路径
 */
export function resolveChromeExecutablePath() {
  // 1. 优先读取显式环境变量（如用户/打包脚本指定）
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  // 2. 优先检查随包附带的 Chrome / Chromium 路径 (Electron App Resources 或项目 bin/ 目录)
  const candidateBundledPaths = [];

  // Electron 生产打包目录 (process.resourcesPath/chrome-win/chrome.exe)
  if (process.resourcesPath) {
    candidateBundledPaths.push(
      path.join(process.resourcesPath, "chrome-win", "chrome.exe"),
      path.join(process.resourcesPath, "app", "bin", "chrome-win", "chrome.exe"),
      path.join(process.resourcesPath, "bin", "chrome-win", "chrome.exe")
    );
  }

  // 本地开发 / 便携根目录下的 bin/chrome-win
  candidateBundledPaths.push(
    path.resolve(process.cwd(), "bin", "chrome-win", "chrome.exe"),
    path.resolve(process.cwd(), "resources", "chrome-win", "chrome.exe"),
    path.resolve(process.cwd(), "extraResources", "chrome-win", "chrome.exe")
  );

  for (const p of candidateBundledPaths) {
    if (fs.existsSync(p)) {
      console.log(`[CHROME RESOLVER] 使用随包附带的独立 Chrome 实例: ${p}`);
      return p;
    }
  }

  // 3. 回退检查系统已安装的 Google Chrome / Edge
  const systemChromePaths = [];
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

    systemChromePaths.push(
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe")
    );
  } else if (process.platform === "darwin") {
    systemChromePaths.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    );
  } else if (process.platform === "linux") {
    systemChromePaths.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser"
    );
  }

  for (const p of systemChromePaths) {
    if (fs.existsSync(p)) {
      console.log(`[CHROME RESOLVER] 检测到系统浏览器: ${p}`);
      return p;
    }
  }

  console.warn(`[CHROME RESOLVER] 未找到随包附带的 Chrome 或系统浏览器，将依赖 chrome-launcher 默认策略检测`);
  return undefined;
}
