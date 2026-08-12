import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { createAppServer } from "./server.js";

let mainWindow;
let server;

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
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

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

app.whenReady().then(() => {
  const port = Number(process.env.PORT ?? 4173);
  server = createAppServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`本地服务在 http://127.0.0.1:${port} 启动`);
    createWindow(port);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (server) server.close();
    app.quit();
  }
});
