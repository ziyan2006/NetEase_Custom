# YesMusic DJ Helper · 网易云音乐助手与本地音频转换转码器

专为 DJ 与音乐制作人打造的现代桌面级网易云音乐客户端与音频转换压制工具。基于 [YesPlayMusic](https://github.com/qier222/YesPlayMusic) 极简暗黑视觉流体设计，支持 **网易云官方 320k 极高音质歌单导出**、**在线曲库检索**、**全局浮动音乐播放器**、**云端歌单新建与单曲增删管理** 以及 **纯前端 NCM 解密/FFmpeg 本地音频格式压制**。

---

## ✨ 核心特性

- 🎨 **YesPlayMusic 极简流体美学**：采用深邃暗黑调 (`#121215`)、网易红霓虹高亮 (`#ea4453`)、高斯模糊毛玻璃遮罩 (`backdrop-filter: blur(25px)`) 与大封面立体卡片网格。
- 🎵 **全局浮动音乐播放器**：支持在底部浮层中在线播放试听网易云 320k 音频流，提供播放/暂停、切歌、进度条控制与音量滑块。
- ⚡ **100% 官方 320k 极高音质直连导出**：突破阿里 CDN `403 Forbidden` (`authSecret` 签名校验)，配合个人 VIP 账号全量一键导出为标准 `320kbps MP3` 文件，自动注入 ID3v2 标签（歌名、歌手名、唱片封面），完美兼容 Rekordbox & Serato DJ。
- 🔍 **曲库在线检索与歌单编辑**：支持按关键字在线搜索网易云千万级曲库，支持在线试听、一键加歌到指定歌单、以及从歌单中移除单曲。
- 🔒 **全屏阻断进高度锁定遮罩 (`z-index: 9999`)**：导出与转码过程中自动浮现全屏阻断进度条，防止二次点击导致的并发冲突与文件损坏。
- 🔑 **网易云扫码授权与凭证自动捕获**：支持 Electron 原生拦截安全登录凭证，并提供浏览器 `MUSIC_U` 风控兜底导入。

---

## 📚 详细技术与 API 文档

我们整理并测试通过了全套网易云 Restful API 与 CDN 鉴权突破技术细节，请参阅：
👉 **[网易云 API 接口与 CDN 鉴权突破技术文档](docs/API_DOCUMENTATION.md)**

---

## 🚀 运行与开发

### 1. 安装依赖
```cmd
npm install
```

### 2. 启动本地服务或 Electron 桌面端
```cmd
# 启动本地 Node 服务
npm start

# 启动 Electron 桌面应用
npm run electron
```

### 3. 运行全量单元测试
```cmd
npm test
```

---

## 📦 打包为独立 Windows 桌面程序 (.exe)

本项目配置了独立的桌面程序打包脚本，可一键在 `build/` 目录下生成绿色独立的桌面程序：

```cmd
npm run pack
```

打包完成后，双击 `build\YesMusicDJHelper-win32-x64\YesMusicDJHelper.exe` 即可直接在任何 Windows 电脑上运行使用，无需额外安装 Node 环境。

---

## 📄 License
MIT License.
