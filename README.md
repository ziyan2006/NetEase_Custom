# YesMusic DJ Helper

面向 DJ 与音乐制作人的 Windows 桌面音乐工作台。应用将网易云音乐歌单管理、本地音频转换、现场 Setlist 解析、调性分析和 DJ Copilot 集成在一个 Electron 应用中。

## 功能

- 网易云音乐登录、歌单浏览、新建、删改和曲库搜索
- 歌曲试听与歌单批量导出，导出过程通过 SSE 实时报告进度
- 本地音频文件转换，支持 WAV、MP3、FLAC、M4A、AAC、OGG、OPUS、AIFF 和 WMA 等常用格式
- Electron 原生目录选择与网易云官方登录窗口；登录成功后自动接收 `MUSIC_U` Cookie
- DJ Copilot：流式对话、SQLite 会话历史、模型设置和工具执行记录
- 1001Tracklists 现场曲目单解析、网易云曲目匹配和歌单创建
- Camelot 调性轮盘与 BPM 过渡建议
- 多源热单雷达：整合 Deezer、Spotify、Last.fm、Apple Music 与 Beatport，并支持缓存和降级

## 技术栈

- 桌面端：Electron
- 服务端：原生 Node.js HTTP 服务与 Server-Sent Events
- 前端：原生 HTML、CSS、JavaScript
- 本地数据：SQLite（`better-sqlite3`）
- 音频处理：FFmpeg（`ffmpeg-static`）
- 自动化抓取：Puppeteer 与 Chrome for Testing

## 开始使用

需要 Node.js 20 或更高版本。

```bash
npm install
npm start
```

本地服务默认监听 `http://127.0.0.1:4178`；可通过 `PORT` 环境变量调整。

启动桌面应用：

```bash
npm run electron
```

Electron 会启动本机服务。若默认端口已被占用，会自动选择可用端口。

## DJ Copilot 配置

Copilot 使用兼容 OpenAI Chat Completions API 的模型服务。在应用设置中填写 API Base URL、API Key、模型名与思考强度；配置仅存储在本机浏览器本地存储中。

支持 DeepSeek、OpenAI、通义千问和 Ollama 兼容端点。1001Tracklists 与 Beatport 等外部数据源可能受网络、登录状态和站点反爬策略影响；Beatport Cookie 可在 Copilot 设置中保存或清除。

## 本地数据

- Electron 会话数据库：系统应用数据目录下的 `sessions.db`
- 非 Electron 运行时会话数据库：`data/sessions.db`
- 热单雷达缓存：`data/charts_cache/`，默认有效期为 6 小时
- 1001Tracklists 登录 Cookie 缓存：`data/1001tl_session_cookies.json`

这些运行数据不应提交到版本控制。

## 测试

```bash
npm test
```

测试使用 Node.js 内置测试运行器。涉及 Agent 路由、模型服务或实时榜单抓取的测试需要有效网络和可用的模型配置；建议在 CI 中为这些依赖提供 mock 或单独标记为集成测试。

## Windows 打包

```bash
npm run build:dir       # 解包目录构建
npm run build:portable  # 便携版 exe
npm run build:nsis      # NSIS 安装包
npm run dist            # 目录版和便携版
```

构建输出位于 `dist_app/`。

## 项目结构

```text
main.js                 Electron 主进程
preload.cjs             受限的桌面端 IPC 接口
server.js               本地 HTTP 服务与业务 API
public/                 页面、播放器、歌单和 Copilot 前端
lib/                    音频、网易云、会话与 DJ Agent 逻辑
lib/dj-agent/           Skill 路由、Setlist、调性、雷达和模型客户端
test/                   Node.js 测试
docs/                   API 和设计文档
```

详细的网易云接口说明见 [API 文档](docs/API_DOCUMENTATION.md)。

## 许可证

MIT
