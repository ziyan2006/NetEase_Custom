import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import { createAppServer } from "./server.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let loginWindow = null;
let server = null;

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
      preload: path.join(__dirname, "preload.js"),
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
    width: 530,
    height: 620,
    title: "网易云官方安全登录",
    parent: mainWindow,
    modal: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 伪装成标准的纯 Chrome 浏览器，剔除 Electron 特征以绕过风控
  const chromeUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  loginWindow.webContents.setUserAgent(chromeUA);

  // 使用网易云官方提供的标准 Web iframe 登录页（原生包含扫码/手机验证码/密码等多种形式）
  loginWindow.loadURL("https://music.163.com/html/web2/page/login.html");

  loginWindow.on("closed", () => {
    loginWindow = null;
  });
});

app.whenReady().then(() => {
  const port = Number(process.env.PORT ?? 4173);
  server = createAppServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`本地服务在 http://127.0.0.1:${port} 启动`);
    createWindow(port);
  });

  // 全局拦截并自动监听 MUSIC_U 扫码成功 Cookie 的写入
  session.defaultSession.cookies.on("changed", (event, cookie, cause, removed) => {
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
