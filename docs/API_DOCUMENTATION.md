# 网易云音乐 API 接口与 CDN 鉴权突破技术文档

本文档收录并整理了本项目在真实环境（配合 VIP 账号及 PC 客户端 Cookie 标识）下成功验证通过的网易云音乐官方 RESTful API 接口、鉴权规则与 CDN `403 Forbidden` 问题的底层技术突破方案。

---

## 目录
1. [核心鉴权机制与 CDN 403 突破原理](#1-核心鉴权机制与-cdn-403-突破原理)
2. [登录与身份认证 API](#2-登录与身份认证-api)
3. [用户与歌单管理 API](#3-用户与歌单管理-api)
4. [歌单详情与单曲增删 API](#4-歌单详情与单曲增删-api)
5. [曲库在线检索 API](#5-曲库在线检索-api)
6. [音频播放与 320k 直链 API](#6-音频播放与-320k-直链-api)
7. [歌单批量导出与转码处理 API](#7-歌单批量导出与转码处理-api)

---

## 1. 核心鉴权机制与 CDN 403 突破原理

### 🔑 Cookie 标识规范
所有发往网易云 API 的请求，请求头中必须包含 **桌面客户端系统标识参数**：

```http
Cookie: MUSIC_U=YOUR_MUSIC_U_TOKEN; os=pc; appver=2.9.7.199895; osver=10.0.19041.1415
```

### ⚡ 阿里 CDN (`m704/m801.music.126.net`) 403 根源分析
- **问题现象**：调用 `player/url/v1` 拿到了包含 `authSecret=...` 鉴权令牌的直链，但在直接请求 CDN 音频流时返回 `403 Forbidden`（HTTP Header 包含 `X-Auth-Msg: auth failed - origin failed`）。
- **根源**：网易云 API 节点根据 Cookie 中的 `os` 参数判断客户端身份。若 Cookie 缺省 `os=pc`，API 下发的 `authSecret` 令牌会被阿里 Tengine CDN 节点判定为无权限来源（Origin Failed）。
- **解决方案**：在每次调用网易云 API 时，全自动向 Cookie 中补全 `os=pc; appver=2.9.7.199895`，下发的 `authSecret` 签名即被阿里 CDN 认可，全量返回 `200 OK` 320kbps 高音质音频数据。

---

## 2. 登录与身份认证 API

### 2.1 申请扫码 unikey
- **后端路由**: `GET /api/login/qr/key`
- **上游接口**: `POST/GET https://music.163.com/api/login/qrcode/unikey`
- **请求参数**:
  - `type`: `1`
  - `timestamp`: 当前时间戳
- **响应示例**:
```json
{
  "code": 200,
  "unikey": "9b12a84f-...",
  "qrImg": "data:image/svg+xml;utf8,..."
}
```

### 2.2 轮询二维码扫码状态
- **后端路由**: `GET /api/login/qr/check?key={unikey}`
- **上游接口**: `POST https://music.163.com/api/login/qrcode/client/login`
- **请求参数**:
  - `key`: 上一步申请的 `unikey`
  - `type`: `1`
- **状态码说明**:
  - `800`: 二维码已过期
  - `801`: 等待扫码
  - `802`: 已扫码，等待手机端确认授权
  - `803`: 授权成功，返回 Cookie (`MUSIC_U=...`)

---

## 3. 用户与歌单管理 API

### 3.1 获取用户创建及收藏的歌单列表
- **后端路由**: `GET /api/user/playlists?cookie={cookie}`
- **上游接口**: `GET https://music.163.com/api/user/playlist`
- **请求参数**:
  - `uid`: 用户 ID (由 `MUSIC_U` 解析提取)
  - `limit`: `100`
- **响应示例**:
```json
{
  "code": 200,
  "userId": "1321541637",
  "playlists": [
    {
      "id": "2029323974",
      "name": "Duktor喜欢的音乐",
      "trackCount": 38,
      "coverImgUrl": "https://p1.music.126.net/..."
    }
  ]
}
```

### 3.2 在网易云云端新建歌单
- **后端路由**: `POST /api/playlist/create`
- **上游接口**: `POST https://music.163.com/api/playlist/create`
- **请求 Body**:
```json
{
  "name": "DJ Peak Hour Set 2026",
  "privacy": "0",
  "cookie": "MUSIC_U=..."
}
```
- **响应示例**:
```json
{
  "code": 200,
  "playlist": {
    "id": 18250914765,
    "name": "DJ Peak Hour Set 2026",
    "trackCount": 0,
    "coverImgUrl": "https://p1.music.126.net/..."
  }
}
```

### 3.3 从网易云云端彻底删除歌单
- **后端路由**: `POST /api/playlist/delete`
- **上游接口**: `POST https://music.163.com/api/playlist/delete`
- **请求 Body**:
```json
{
  "id": "18250914765",
  "cookie": "MUSIC_U=..."
}
```
- **响应示例**:
```json
{
  "code": 200,
  "id": 18250914765
}
```

---

## 4. 歌单详情与单曲增删 API

### 4.1 获取歌单完整曲目详情
- **后端路由**: `GET /api/playlist/detail?id={id}&cookie={cookie}`
- **上游接口**: `GET https://music.163.com/api/v6/playlist/detail`
- **请求参数**:
  - `id`: 歌单 ID
  - `n`: `1000`
  - `timestamp`: 当前时间戳
- **响应结构**:
  - 返回包含 `playlist.name`, `playlist.coverImgUrl`, `playlist.tracks` (包含歌曲名、歌手 `ar`、专辑 `al`、时长 `dt`) 的全量数组。

### 4.2 向歌单添加/移除曲目
- **后端路由**: `POST /api/playlist/tracks/update`
- **上游接口**: `POST https://music.163.com/api/playlist/manipulate/tracks`
- **请求 Body**:
```json
{
  "op": "add", 
  "pid": "2029323974",
  "trackIds": "[2067954366]",
  "cookie": "MUSIC_U=..."
}
```
*注：`op: "add"` 为向歌单添加歌曲，`op: "del"` 为从歌单移除歌曲。*
- **响应示例**:
```json
{
  "code": 200,
  "count": 1
}
```

---

## 5. 曲库在线检索 API

### 5.1 关键词云端搜索
- **后端路由**: `GET /api/song/search?keywords={query}&cookie={cookie}`
- **上游接口**: `POST https://music.163.com/api/cloudsearch/pc`
- **请求 Body**:
  - `s`: 检索关键字 (如 `Chase & Status`)
  - `type`: `1` (单曲模式)
  - `limit`: `30`
  - `offset`: `0`
- **响应结构**:
  - 返回 `result.songs` 歌曲列表，包含完整 ID3 元素。

---

## 6. 音频播放与 320k 直链 API

### 6.1 提取 320kbps MP3 播放音频流 URL
- **后端路由**: `GET /api/song/url?id={id}&cookie={cookie}`
- **上游接口**: `POST https://music.163.com/api/song/enhance/player/url/v1`
- **请求 Body**:
  - `ids`: `"[2067954366]"`
  - `level`: `"exhigh"` (320kbps 极高音质)
  - `encodeType`: `"flac"`
- **响应示例**:
```json
{
  "code": 200,
  "data": [
    {
      "id": 2067954366,
      "url": "http://m801.music.126.net/20260812232134/019dabd57...mp3",
      "br": 320000,
      "size": 7094445,
      "type": "mp3"
    }
  ]
}
```

---

## 7. 歌单批量导出与转码处理 API

### 7.1 一键导出歌单为本地 DJ 音频库
- **后端路由**: `POST /api/playlist/export`
- **请求 Body**:
```json
{
  "id": "2029323974",
  "name": "dnb rap",
  "outputRoot": "D:\\DJ_Music_Library",
  "cookie": "MUSIC_U=..."
}
```
- **核心流程**:
  1. 向网易云 V1 接口批量分段获取 320k 直链。
  2. 携带 PC Cookie 下载音频流。
  3. 若遭遇嵌入式 NCM 加密，调用 WebAssembly 解密核心。
  4. 调用本机 FFmpeg 压制转换为 320kbps 标准 MP3 格式。
  5. 注入 ID3v2 元数据标签（歌名、歌手名、高清唱片封面）。
  6. 落盘至 `D:\DJ_Music_Library\dnb rap\歌手 - 歌名.mp3`。
