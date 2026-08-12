# 本地音频转换工具

一个仅在本机运行的音频格式转换网页工具。文件由本机的 FFmpeg 处理，不会上传到第三方服务。

## 运行

前提：已安装 Node.js 和 FFmpeg，并可在终端执行 `ffmpeg`。

```powershell
cd E:\netease
npm start
```

打开 `http://127.0.0.1:4173/`，选择文件和目标格式后即可转换。

## 支持范围

- 输入：MP3、WAV、FLAC、M4A、AAC、OGG、OPUS、WebM
- 输出：MP3、WAV、FLAC、M4A、OGG
- 单文件大小限制：50 MB

## `.ncm` 文件

该工具会识别以 `CTENFDAM` 开头的受保护 NCM 文件，并停止处理。

## 测试

```powershell
npm test
```

测试覆盖普通 WAV 转 MP3、静态页面访问，以及受保护 NCM 文件的拒绝路径。
