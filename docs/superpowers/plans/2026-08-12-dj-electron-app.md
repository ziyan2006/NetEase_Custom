# DJ 专属网易云音乐桌面 APP (Electron + 扫码登录 + 歌单 CRUD + 批量导出) 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将工具构建为标准的 Electron 桌面 APP，集成网易云官方 API 扫码登录、歌单管理（新建/删除歌单、在歌单内添加/删除歌曲），提供原生目录选择器，支持将所选歌单批量下载、NCM 自动解密与高品质 320kbps MP3 转码压制，写入 ID3 标签并导出至 `<RootDir>/<PlaylistName>/<Artist> - <Title>.mp3`。

**架构：**
- Electron 主进程 (`main.js`)：负责原生窗口、原生文件夹选择对话框 (`dialog.showOpenDialog`)、跨域 API 代理请求与本地文件系统高权限读写。
- 后端 API 服务 (`lib/netease-api.js`)：包含扫码登录、获取用户歌单、歌单 CRUD 及歌曲高音质 URL 解析。
- 音频转码引擎 (`lib/audio-exporter.js`)：异步并发下载音轨、NCM 原生解密、FFmpeg 320k MP3 压制及 ID3 标签注入。
- 前端 UI (`public/index.html`, `public/app.js`, `public/styles.css`)：黑金 DJ 仪表盘，支持二维码展示、歌单拖拽与下载进度条展示。

**技术栈：** Electron, Node.js, `NeteaseCloudMusicApi` / 自研 API 代理, FFmpeg, HTML5/CSS3.

---

## 文件结构规划

- `main.js` (新建): Electron 主进程，集成 Native Dialog 与 IPC 模块。
- `package.json` (修改): 增加 Electron 依赖与启动指令 `"electron:start": "electron ."`.
- `lib/netease-api.js` (新建): 网易云官方 API 集成模块（扫码 Key/QR/Check、用户歌单列表、歌单 CRUD、歌曲下载 URL）。
- `lib/audio-exporter.js` (新建): 歌单音轨批量下载、NCM 解密、FFmpeg 压制 MP3 与 ID3 标签写入管道。
- `public/index.html` (修改): 增加登录二维码模态框、歌单列表/详情展示区、歌单 CRUD 操作按钮及原生目录选择按钮。
- `public/app.js` (修改): 前端与 Electron 主进程/API 交互逻辑，处理登录状态持久化、歌单动态渲染与批量导出进度。
- `test/netease-api.test.js` (新建): 网易云 API 模块基础测试。
- `test/audio-exporter.test.js` (新建): 歌单文件导出与 ID3 标签处理测试。

---

### 任务 1：搭建 Electron 主进程环境与原生文件选择器

**文件：**
- 修改：`package.json`
- 创建：`main.js`

- [ ] **步骤 1：在 `package.json` 添加 Electron 配置与启动脚本**

更新 `package.json` 添加 `"main": "main.js"` 及 `"scripts": { "electron": "electron ." }`。

- [ ] **步骤 2：创建 `main.js` Electron 主进程脚本**

包含创建窗口、加载本地/服务页面，配置 `ipcMain` 处理 `dialog:select-directory` 原生文件目录选择对话框。

- [ ] **步骤 3：测试 Electron 主进程启动能力**

运行：`npx electron --version` 确认 Electron 运行环境。

- [ ] **步骤 4：Commit**

```bash
git add package.json main.js
git commit -m "feat: setup electron main process and native directory picker IPC"
```

---

### 任务 2：创建网易云 API 交互模块 `lib/netease-api.js`

**文件：**
- 创建：`lib/netease-api.js`
- 测试：`test/netease-api.test.js`

- [ ] **步骤 1：编写 API 测试**

在 `test/netease-api.test.js` 中编写网易云 API 数据结构测试。

- [ ] **步骤 2：实现 `lib/netease-api.js`**

包含以下核心 API 函数：
1. `generateQrCode()`: 请求扫码 Key 及二维码 Base64 / URL。
2. `checkQrStatus(key)`: 轮询扫码状态，获取授权 Cookie。
3. `getUserPlaylists(cookie)`: 获取用户创建与收藏的歌单。
4. `createPlaylist(cookie, name)`: 新建歌单。
5. `deletePlaylist(cookie, id)`: 删除歌单。
6. `managePlaylistTracks(cookie, op, pid, trackIds)`: 向歌单添加/移出歌曲。
7. `getSongDownloadUrl(cookie, id)`: 获取最高音质音频下载地址。

- [ ] **步骤 3：运行测试验证通过**

运行：`node --test test/netease-api.test.js`

- [ ] **步骤 4：Commit**

```bash
git add lib/netease-api.js test/netease-api.test.js
git commit -m "feat: implement NetEase Cloud Music API client for auth and playlist CRUD"
```

---

### 任务 3：创建音轨批量导出与 ID3 标签转换模块 `lib/audio-exporter.js`

**文件：**
- 创建：`lib/audio-exporter.js`
- 测试：`test/audio-exporter.test.js`

- [ ] **步骤 1：编写音频导出测试**

在 `test/audio-exporter.test.js` 中测试音频解密转码及写入路径逻辑。

- [ ] **步骤 2：实现 `lib/audio-exporter.js`**

导出函数 `exportPlaylistToDirectory({ outputRoot, playlistName, tracks, onProgress })`:
1. 在 `outputRoot` 下创建歌单同名子文件夹 `sanitizeFolderName(playlistName)`。
2. 循环/并发下载歌单中的所有歌曲音轨。
3. 若音轨为 `.ncm`，使用 `decodeNcmBuffer` 自动解密。
4. 若为 FLAC/WAV，使用 FFmpeg 转码压制为 320kbps MP3。
5. 格式化文件名为 `歌手名 - 歌曲名.mp3` 并注入 ID3 元数据（歌名、歌手、封面等）。
6. 跳过已存在的相同文件，确保文件夹内部只留 `.mp3` 文件。

- [ ] **步骤 3：运行测试验证**

运行：`node --test test/audio-exporter.test.js`

- [ ] **步骤 4：Commit**

```bash
git add lib/audio-exporter.js test/audio-exporter.test.js
git commit -m "feat: implement playlist batch exporter with auto NCM decrypt and MP3 conversion"
```

---

### 任务 4：升级前端黑金 UI 包含扫码登录、歌单 CRUD 及导出交互

**文件：**
- 修改：`public/index.html`
- 修改：`public/styles.css`
- 修改：`public/app.js`
- 修改：`server.js`

- [ ] **步骤 1：在 `public/index.html` 部署扫码登录弹窗与歌单操作区**
- [ ] **步骤 2：在 `server.js` 添加 Electron / Web 通用 API 路由代理**
- [ ] **步骤 3：在 `public/app.js` 实现扫码登录轮询、歌单动态加载/增删及批量导出进度更新**
- [ ] **步骤 4：运行完整自动化测试集验证无回归**

运行：`npm test`

- [ ] **步骤 5：Commit**

```bash
git add public/ server.js
git commit -m "feat: complete DJ Desktop APP UI with QR login, playlist CRUD, and batch export panel"
```

---

## 计划自检

- [x] **规格覆盖度**：覆盖 Electron 客户端容器、网易云扫码登录、歌单 CRUD 操作、原生文件选择器、音轨批量导出到 `<RootDir>/<PlaylistName>/<Artist> - <Title>.mp3`。
- [x] **占位符扫描**：无占位符。
- [x] **测试可验证性**：所有模块带独立单体测试与全局集成测试。
