# YesMusic DJ Helper

面向 DJ 与音乐制作人的 Windows 桌面音乐工作台。应用将网易云音乐歌单管理、本地音频转换、现场 Setlist 解析、调性分析和 DJ Copilot 集成在一个 Electron 应用中。

## 功能

- 网易云音乐登录、歌单浏览、新建、删改和曲库搜索
- 歌曲试听与歌单批量导出，导出过程通过 SSE 实时报告进度
- 本地音频文件转换，支持 WAV、MP3、FLAC、M4A、AAC、OGG、OPUS、AIFF 和 WMA 等常用格式
- Electron 原生目录选择与网易云官方登录窗口；登录成功后自动接收 `MUSIC_U` Cookie
- DJ Copilot：流式对话、SQLite 会话历史、模型设置和工具执行记录
- 1001Tracklists 现场曲目单解析、网易云曲目匹配和歌单创建
- Electron 内验证 1001Tracklists，复用 Cookie 检索真实现场；网页模式可手动导入 Cookie
- Camelot 调性轮盘与 BPM 过渡建议
- DeepSeek Harness SDK runtime：通过受限本机工具支持自然语言排 Set

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

在应用设置中填写 API Base URL、API Key、模型名与思考强度；设置中的配置存储在浏览器本地存储中，也可通过本地 `.env` 文件提供 `DEEPSEEK_API_KEY`。当前配置 API Key 后，Copilot 请求进入 DeepSeek Harness。1001Tracklists 等外部数据源可能受网络、登录状态和站点反爬策略影响。

## DeepSeek Harness 排 Set

配置 API Key 后的 Copilot 请求会进入 `harness/` 下的 DeepSeek Harness SDK runtime。runtime 加载曲库检索、1001Tracklists 现场检索与解析、Camelot 过渡等受限本机工具；网易云登录 Cookie 和导出能力仍由本机服务处理。Harness 需要 Node.js 22.19 或更高版本。

```bash
npm install
```

配置 `DEEPSEEK_API_KEY` 后启动主服务即可。Harness runtime 按需启动，不需要单独启动 Web sidecar。若 Harness 不可用，Copilot 会提示错误；缺少 API Key 时仍可解析粘贴的 Setlist 文本或使用本地 Camelot 分析，排 Set 会提示配置 Key。`npm --prefix harness install` 只用于可选的独立 Web 调试界面。

## 本地数据

- Electron 会话数据库：系统应用数据目录下的 `sessions.db`
- 非 Electron 运行时会话数据库：`data/sessions.db`
- 1001Tracklists Cookie 缓存：Electron 位于系统应用数据目录，非 Electron 运行时位于 `data/1001tl_session_cookies.json`

这些运行数据不应提交到版本控制。

## 测试

```bash
npm test
```

测试套件使用 Node.js 内置测试运行器 (`node --test test/*.test.js`)，已全面解耦外部网络和付费 LLM API，支持在无网络、无 `DEEPSEEK_API_KEY` 环境下全量离线运行。

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
load-env.js             可选的本地 .env 配置加载
public/                 页面、播放器、歌单和 Copilot 前端
lib/                    音频、网易云、会话与 DJ Agent 逻辑
lib/dj-agent/           Skill 路由、Setlist、调性和模型客户端
harness/                DeepSeek Harness runtime、受限工具和技能说明
test/                   Node.js 测试
docs/                   API 和设计文档
```

详细的网易云接口说明见 [API 文档](docs/API_DOCUMENTATION.md)。

## 许可证

MIT
