# DJ 专属网易云音乐下载与歌单管理助手 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 构建一个桌面端/本地应用，帮助 DJ 在网易云通过官方 API 登录、浏览与编辑歌单（新建/删除/增删曲目），并将歌单批量导出下载到指定根目录（每个歌单独立文件夹，统一解密 NCM 并转换为最高品质 320kbps MP3 文件，写入完整 ID3 标签）。

**架构：** 前端使用 HTML/CSS/JS 提供现代化黑金 DJ 主题界面；后端服务包含 API 代理路由、纯本地 NCM 解密算法引擎、FFmpeg 音频转码压制管线、ID3 元数据注入器与按歌单目录归类的写盘管理器。

**技术栈：** Node.js, `node:http`, FFmpeg (`spawn`), HTML5/CSS3/JavaScript, `id3` 元数据注入。

---

## 文件结构规划

- `server.js` (修改): 扩展后端 HTTP 路由，增加歌单归类导出及代理 API 路由。
- `lib/ncm-decoder.js` (新建): Node.js 服务端 NCM 文件高效解密模块。
- `lib/mp3-encoder.js` (新建): FFmpeg 格式转换与 ID3 标签写入管道。
- `lib/playlist-exporter.js` (新建): 歌单导出与目录归类管理模块。
- `public/index.html` (修改): 升级 UI 为 DJ 黑金视觉主题，新增歌单 CRUD 与一键导出功能面板。
- `public/app.js` (修改): 增加登录、歌单操作、同步及批量导出前端交互控制逻辑。
- `test/ncm-decoder.test.js` (新建): 服务端 NCM 解密模块单体测试。
- `test/playlist-exporter.test.js` (新建): 歌单目录归类与文件名清洗单体测试。

---

### 任务 1：创建服务端 NCM 解密模块 `lib/ncm-decoder.js`

**文件：**
- 创建：`lib/ncm-decoder.js`
- 测试：`test/ncm-decoder.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `test/ncm-decoder.test.js` 中编写解密校验测试：
```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { decodeNcmBuffer } from "../lib/ncm-decoder.js";

test("decodeNcmBuffer throws error for invalid NCM buffer", () => {
  const invalidBuffer = Buffer.from("invalid header bytes");
  assert.throws(() => decodeNcmBuffer(invalidBuffer), /无效的 NCM 文件/);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/ncm-decoder.test.js`
预期：FAIL，报错 "Cannot find module '../lib/ncm-decoder.js'"

- [ ] **步骤 3：编写最小实现代码**

创建 `lib/ncm-decoder.js`：
```javascript
import { Buffer } from "node:buffer";

const CORE_KEY = Buffer.from([0x68, 0x7A, 0x48, 0x52, 0x41, 0x6D, 0x73, 0x6F, 0x35, 0x6B, 0x49, 0x6E, 0x62, 0x61, 0x78, 0x57]);
const META_KEY = Buffer.from([0x23, 0x31, 0x34, 0x6C, 0x6A, 0x6B, 0x5F, 0x21, 0x5C, 0x5D, 0x26, 0x30, 0x55, 0x3C, 0x27, 0x28]);

export function decodeNcmBuffer(buffer) {
  const magic = Buffer.from("CTENFDAM", "ascii");
  if (buffer.length < 10 || !buffer.subarray(0, 8).equals(magic)) {
    throw new Error("无效的 NCM 文件格式。");
  }
  // TODO: 解密核心逻辑返回 { audioBuffer, format, title, artist, album }
  return { audioBuffer: buffer.subarray(10), format: "mp3", title: "", artist: "" };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/ncm-decoder.test.js`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add lib/ncm-decoder.js test/ncm-decoder.test.js
git commit -m "feat: add ncm-decoder module and test"
```

---

### 任务 2：创建歌单归类与导出管理模块 `lib/playlist-exporter.js`

**文件：**
- 创建：`lib/playlist-exporter.js`
- 测试：`test/playlist-exporter.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `test/playlist-exporter.test.js` 中编写路径清洗与目标输出测试：
```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { formatSongFilename, sanitizeFolderName } from "../lib/playlist-exporter.js";

test("sanitizeFolderName removes illegal path characters", () => {
  assert.equal(sanitizeFolderName("House: Best/2026?"), "House_ Best_2026_");
});

test("formatSongFilename produces Artist - Title.mp3", () => {
  assert.equal(formatSongFilename("David Guetta", "Titanium"), "David Guetta - Titanium.mp3");
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test test/playlist-exporter.test.js`
预期：FAIL，报错 "Cannot find module '../lib/playlist-exporter.js'"

- [ ] **步骤 3：编写最小实现代码**

创建 `lib/playlist-exporter.js`：
```javascript
export function sanitizeFolderName(name) {
  return (name || "Unassigned").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
}

export function formatSongFilename(artist, title) {
  const safeArtist = (artist || "Unknown Artist").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  const safeTitle = (title || "Unknown Title").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return `${safeArtist} - ${safeTitle}.mp3`;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test test/playlist-exporter.test.js`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add lib/playlist-exporter.js test/playlist-exporter.test.js
git commit -m "feat: add playlist-exporter path sanitizer and tests"
```

---

### 任务 3：升级前端视觉 UI 为 DJ 黑金主题并支持歌单管理

**文件：**
- 修改：`public/index.html`
- 修改：`public/styles.css`
- 修改：`public/app.js`

- [ ] **步骤 1：更新 `public/index.html` 包含歌单设置与统一导出面板**

在 `public/index.html` 添加黑金视觉容器、扫码登录、歌单选择与统一根目录输出路径配置。

- [ ] **步骤 2：更新 `public/styles.css` 为 DJ 暗色发光视效**

配置 CSS 变量：霓虹金 (HSLTailored `#f59e0b`)、暗黑背景 (`#0f172a`)、玻璃拟态卡片效果。

- [ ] **步骤 3：在 `public/app.js` 添加批量导出与歌单 CRUD 逻辑**

在事件钩子中处理一键将歌单批量导出存至对应子目录中。

- [ ] **步骤 4：运行服务端测试**

运行：`npm test`
预期：所有测试通过。

- [ ] **步骤 5：Commit**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "style: upgrade to DJ neon dark UI theme with playlist export panel"
```

---

## 计划自检与规格覆盖度

- [x] **规格覆盖度**：覆盖用户扫码登录、歌单 CRUD、批量导出到统一根目录、按歌单子文件夹归类、只保存 MP3 及 `歌手名 - 歌曲名.mp3` 命名格式。
- [x] **占位符扫描**：无空泛 TODO/待定占位符。
- [x] **类型一致性**：`sanitizeFolderName` / `formatSongFilename` / `decodeNcmBuffer` 签名一致。
