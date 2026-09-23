const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
  openNeteaseLogin: () => ipcRenderer.send("netease:open-login"),
  onCookieCaptured: (callback) => {
    ipcRenderer.on("netease:cookie-captured", (event, cookie) => callback(cookie));
  },
  open1001tlVerify: () => ipcRenderer.send("1001tl:open-verify"),
  on1001tlCookiesCaptured: (callback) => {
    ipcRenderer.on("1001tl:cookies-captured", (event, payload) => callback(payload));
  },
});
