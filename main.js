import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import { createAppServer } from "./server.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  saveCached1001Cookies,
  probe1001CookieHealth,
  migrateLegacy1001tlCookies,
  TL_HOME_URL,
  TL_USER_AGENT,
} from "./lib/dj-agent/tl-session.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let loginWindow = null;
let tlVerifyWindow = null;
let server = null;

function get1001tlSession() {
  return session.fromPartition("persist:1001tl");
}

async function export1001tlCookiesFromPartition() {
  const tlSession = get1001tlSession();
  const cookies = await tlSession.cookies.get({ url: TL_HOME_URL });
  if (Array.isArray(cookies) && cookies.length > 0) {
    saveCached1001Cookies(cookies);
  }
  return cookies || [];
}

function notify1001tlStatus(payload) {
  if (mainWindow) {
    mainWindow.webContents.send("1001tl:cookies-captured", payload);
  }
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 780,
    minWidth: 800,
    minHeight: 600,
    title: "DJ 专属网易云音乐下载与歌单管理助手",
    backgroundColor: "#0b0f19",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// 选取本地文件夹的 IPC 处理
ipcMain.handle("dialog:select-directory", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
    title: "选择统一根目录（歌单将存为子文件夹）",
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// 打开网易云官方安全登录窗口的 IPC 处理
ipcMain.on("netease:open-login", () => {
  if (loginWindow) {
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 1020,
    height: 700,
    title: "网易云官方安全登录",
    parent: mainWindow,
    modal: true,
    show: false,
    backgroundColor: "#0b0f19",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  loginWindow.once("ready-to-show", () => {
    if (loginWindow) loginWindow.show();
  });

  loginWindow.webContents.on("did-fail-load", (event, errorCode, errorDesc, validatedURL) => {
    console.error(`[Login Window Error] Failed to load ${validatedURL}: ${errorCode} ${errorDesc}`);
  });

  const chromeUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  loginWindow.webContents.setUserAgent(chromeUA);

  // 直接加载官方主站
  loginWindow.loadURL("https://music.163.com/");

  // 页面加载完成后自动触发顶部“登录”按钮点击，调出扫码框
  loginWindow.webContents.on("did-finish-load", () => {
    loginWindow.webContents.executeJavaScript(`
      const tryClickLogin = () => {
        const btn = document.querySelector('[data-action="login"]') || 
                    document.querySelector('.link.s-fc3') ||
                    document.querySelector('#g_nav2 .link') ||
                    document.querySelector('a[href*="login"]');
        if (btn) {
          btn.click();
          console.log("[JS Injection] Clicked NetEase login button successfully.");
        }
      };
      tryClickLogin();
      setTimeout(tryClickLogin, 800);
      setTimeout(tryClickLogin, 2000);
    `).catch(() => {});
  });

  // 主动轮询 Cookie（双重保险，每秒检测一次 MUSIC_U）
  const cookiePollInterval = setInterval(async () => {
    if (!loginWindow) {
      clearInterval(cookiePollInterval);
      return;
    }
    try {
      const cookies = await session.defaultSession.cookies.get({
        name: "MUSIC_U",
      });
      if (cookies && cookies.length > 0) {
        const targetCookie = cookies[0];
        const cookieStr = `MUSIC_U=${targetCookie.value}`;
        console.log("[Electron Polling] Captured NetEase login cookie successfully via active polling!");
        if (mainWindow) {
          mainWindow.webContents.send("netease:cookie-captured", cookieStr);
        }
        clearInterval(cookiePollInterval);
        if (loginWindow) {
          loginWindow.close();
        }
      }
    } catch (e) {
      // ignore
    }
  }, 1000);

  loginWindow.on("closed", () => {
    loginWindow = null;
    clearInterval(cookiePollInterval);
  });
});

ipcMain.on("1001tl:open-verify", () => {
  if (tlVerifyWindow) {
    tlVerifyWindow.focus();
    return;
  }

  const tlSession = get1001tlSession();
  try {
    tlSession.setUserAgent(TL_USER_AGENT);
  } catch {
    // older Electron builds may not expose session.setUserAgent
  }

  tlVerifyWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    title: "验证 1001Tracklists 现场数据源 · 完成安全验证后将自动保存",
    parent: mainWindow,
    modal: true,
    show: false,
    backgroundColor: "#0b0f19",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: tlSession,
    },
  });

  tlVerifyWindow.once("ready-to-show", () => {
    if (tlVerifyWindow) tlVerifyWindow.show();
  });

  tlVerifyWindow.webContents.setUserAgent(TL_USER_AGENT);
  tlVerifyWindow.loadURL(TL_HOME_URL);

  let capturing = false;
  let closedAfterSuccess = false;
  const pollInterval = setInterval(async () => {
    if (!tlVerifyWindow || capturing) return;
    try {
      const pageInfo = await tlVerifyWindow.webContents.executeJavaScript(`
        (() => {
          const title = document.title || "";
          const body = document.body ? document.body.innerText : "";
          return {
            title,
            isChallenge: title.includes("Just a moment")
              || body.includes("Please wait, you will be forwarded")
              || Boolean(document.querySelector("#challenge-running")),
          };
        })()
      `);
      if (pageInfo?.isChallenge) return;

      const cookies = await export1001tlCookiesFromPartition();
      if (!cookies.length) return;

      capturing = true;
      const health = await probe1001CookieHealth();
      if (health.ok) {
        closedAfterSuccess = true;
        notify1001tlStatus({ ready: true, reason: health.reason });
        clearInterval(pollInterval);
        if (tlVerifyWindow) tlVerifyWindow.close();
        return;
      }
      capturing = false;
    } catch {
      capturing = false;
    }
  }, 1000);

  tlVerifyWindow.on("closed", async () => {
    clearInterval(pollInterval);
    tlVerifyWindow = null;
    if (closedAfterSuccess) return;
    try {
      await export1001tlCookiesFromPartition();
      const health = await probe1001CookieHealth();
      notify1001tlStatus({ ready: Boolean(health.ok), reason: health.reason });
    } catch {
      notify1001tlStatus({ ready: false, reason: "error" });
    }
  });
});

app.whenReady().then(() => {
  // 会话数据库与 Harness 运行时可写数据写入 userData 目录 (打包后安装目录为只读, 不能使用 cwd 或 app.asar)
  const userDataDir = app.getPath("userData");
  process.env.SESSION_DB_PATH = process.env.SESSION_DB_PATH || path.join(userDataDir, "sessions.db");
  process.env.DSH_HOME = process.env.DSH_HOME || path.join(userDataDir, "dsh-home");
  process.env.YESMUSIC_HARNESS_RUNTIME_DIR = process.env.YESMUSIC_HARNESS_RUNTIME_DIR || path.join(userDataDir, "harness-runtime");
  fs.mkdirSync(process.env.DSH_HOME, { recursive: true });
  fs.mkdirSync(process.env.YESMUSIC_HARNESS_RUNTIME_DIR, { recursive: true });
  process.env.YESMUSIC_1001TL_COOKIE_PATH =
    process.env.YESMUSIC_1001TL_COOKIE_PATH || path.join(userDataDir, "1001tl_session_cookies.json");
  migrateLegacy1001tlCookies(userDataDir);
  export1001tlCookiesFromPartition().catch(() => {});
  const basePort = Number(process.env.PORT ?? 4178);
  server = createAppServer();
  
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`[Electron Main] 端口 ${basePort} 已被占用，自动分配备用端口启动...`);
      server.listen(0, "127.0.0.1", () => {
        const actualPort = server.address().port;
        process.env.YESMUSIC_AGENT_BRIDGE_URL = `http://127.0.0.1:${actualPort}`;
        console.log(`[Electron Main] 本地服务在 http://127.0.0.1:${actualPort} 启动`);
        createWindow(actualPort);
      });
    } else {
      console.error("[Electron Main] 服务端启动异常:", err);
    }
  });

  server.listen(basePort, "127.0.0.1", () => {
    process.env.YESMUSIC_AGENT_BRIDGE_URL = `http://127.0.0.1:${basePort}`;
    console.log(`[Electron Main] 本地服务在 http://127.0.0.1:${basePort} 启动`);
    createWindow(basePort);
  });

  // 全局拦截并自动监听 MUSIC_U 扫码成功 Cookie 的写入
  session.defaultSession.cookies.on("changed", (event, cookie, cause, removed) => {
    console.log(`[Cookie Changed] name=${cookie.name} domain=${cookie.domain} removed=${removed} cause=${cause}`);
    if (cookie.domain && cookie.domain.includes("163.com") && cookie.name === "MUSIC_U" && !removed) {
      const cookieStr = `MUSIC_U=${cookie.value}`;
      console.log("[Electron Session] Capturing Netease login cookie successfully!");
      if (mainWindow) {
        mainWindow.webContents.send("netease:cookie-captured", cookieStr);
      }
      if (loginWindow) {
        loginWindow.close();
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (server) server.close();
    app.quit();
  }
});
