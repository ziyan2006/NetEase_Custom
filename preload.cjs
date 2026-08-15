const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
  openNeteaseLogin: () => ipcRenderer.send("netease:open-login"),
  onCookieCaptured: (callback) => {
    ipcRenderer.on("netease:cookie-captured", (event, cookie) => callback(cookie));
  }
});
