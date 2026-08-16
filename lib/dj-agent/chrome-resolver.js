import fs from "fs";
import path from "path";

/**
 * Linux 无 root 环境下, 为随包 Chrome 注入自带依赖库路径 (bin/chrome-linux/lib)。
 * 这些 .so 来自 libnspr4/libnss3/libasound2 等 deb 包解压, 供 chrome-launcher 子进程继承。
 */
function setupBundledLinuxLibs(linuxRoot) {
  const libDir = path.join(linuxRoot, "lib");
  try {
    if (fs.existsSync(libDir) && fs.readdirSync(libDir).some((f) => f.endsWith(".so") || f.endsWith(".so."))) {
      const existing = process.env.LD_LIBRARY_PATH || "";
      const parts = existing.split(":").filter(Boolean);
      if (!parts.includes(libDir)) {
        process.env.LD_LIBRARY_PATH = [libDir, ...parts].join(":");
        console.log(`[CHROME RESOLVER] 已注入随包依赖库路径: ${libDir}`);
      }
    }
  } catch {
    // ignore
  }
}

/**
 * 自动解析并优先定位随包附带的独立 Chrome / Chromium，若不存在则智能回退到系统 Chrome / Edge
 * @returns {string | undefined} 可执行文件的绝对路径
 */
export function resolveChromeExecutablePath() {
  // Linux 下先注入随包依赖库路径 (无 root 环境跑自带 Chrome 的前置条件)
  setupBundledLinuxLibs(path.resolve(process.cwd(), "bin", "chrome-linux"));

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

  // Linux 随包 Chrome (Chrome for Testing, 结构: bin/chrome-linux/chrome/<version>/chrome-linux64/chrome)
  if (process.platform !== "win32") {
    candidateBundledPaths.push(
      path.resolve(process.cwd(), "bin", "chrome-linux", "chrome", "chrome-linux64", "chrome"),
      path.resolve(process.cwd(), "bin", "chrome-linux", "chromium", "chrome-linux64", "chrome"),
      path.resolve(process.cwd(), "bin", "chrome-linux", "chrome-linux64", "chrome"),
      path.resolve(process.cwd(), "bin", "chrome-linux", "chrome-headless-shell-linux64", "chrome-headless-shell"),
      path.resolve(process.cwd(), "resources", "chrome-linux", "chrome-linux64", "chrome")
    );
  }

  for (const p of candidateBundledPaths) {
    if (fs.existsSync(p)) {
      console.log(`[CHROME RESOLVER] 使用随包附带的独立 Chrome 实例: ${p}`);
      return p;
    }
  }

  // Linux 版本目录深度扫描 (Chrome for Testing 结构: bin/chrome-linux/<family>/<version>/chrome-linux64/chrome)
  if (process.platform !== "win32") {
    const linuxRoot = path.resolve(process.cwd(), "bin", "chrome-linux");
    try {
      if (fs.existsSync(linuxRoot)) {
        let frontier = [linuxRoot];
        for (let depth = 0; depth < 4 && frontier.length > 0; depth++) {
          const next = [];
          for (const dir of frontier) {
            if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
            for (const sub of fs.readdirSync(dir)) {
              const subPath = path.join(dir, sub);
              if (!fs.statSync(subPath).isDirectory()) continue;
              // 直接位于子目录下的二进制 (chrome / chrome-headless-shell)
              for (const [binDir, binName] of [
                ["", "chrome"],
                ["chrome-linux64", "chrome"],
                ["chrome-headless-shell-linux64", "chrome-headless-shell"],
              ]) {
                const candidate = binDir ? path.join(subPath, binDir, binName) : path.join(subPath, binName);
                if (fs.existsSync(candidate)) {
                  console.log(`[CHROME RESOLVER] 使用随包附带的独立 Chrome 实例: ${candidate}`);
                  return candidate;
                }
              }
              next.push(subPath);
            }
          }
          frontier = next;
        }
      }
    } catch {
      // ignore scan error
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
