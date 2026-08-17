import { Buffer } from "node:buffer";
import crypto from "node:crypto";

const CORE_KEY = Buffer.from([0x68, 0x7A, 0x48, 0x52, 0x41, 0x6D, 0x73, 0x6F, 0x35, 0x6B, 0x49, 0x6E, 0x62, 0x61, 0x78, 0x57]);
const META_KEY = Buffer.from([0x23, 0x31, 0x34, 0x6C, 0x6A, 0x6B, 0x5F, 0x21, 0x5C, 0x5D, 0x26, 0x30, 0x55, 0x3C, 0x27, 0x28]);

/**
 * 解密 NCM 二进制 Buffer，提取真实音频流、元数据与内嵌封面
 * @param {Buffer} buffer
 * @returns {{ audioBuffer: Buffer, format: string, title: string, artist: string, album: string, coverBuffer: Buffer|null }}
 */
export function decodeNcmBuffer(buffer) {
  const magic = Buffer.from("CTENFDAM", "ascii");
  if (!buffer || buffer.length < 8 || !buffer.subarray(0, 8).equals(magic)) {
    throw new Error("文件不是有效的 NCM 格式。");
  }

  let offset = 10;
  if (buffer.length < offset + 4) throw new Error("无效或损坏的 NCM 头部数据。");

  const keyLen = buffer.readUInt32LE(offset);
  offset += 4;
  if (buffer.length < offset + keyLen) throw new Error("NCM 密钥长度越界。");

  const keyData = Buffer.from(buffer.subarray(offset, offset + keyLen));
  offset += keyLen;
  for (let i = 0; i < keyData.length; i++) keyData[i] ^= 0x64;

  const decipher = crypto.createDecipheriv("aes-128-ecb", CORE_KEY, null);
  decipher.setAutoPadding(true);
  const decryptedKey = Buffer.concat([decipher.update(keyData), decipher.final()]);
  const keyBuf = decryptedKey.subarray(17);

  const keyBox = new Uint8Array(256);
  for (let i = 0; i < 256; i++) keyBox[i] = i;
  let lastIndex = 0;
  let keyOffset = 0;
  for (let i = 0; i < 256; i++) {
    const swap = keyBox[i];
    const c = (swap + lastIndex + keyBuf[keyOffset]) & 0xff;
    keyOffset = (keyOffset + 1) % keyBuf.length;
    keyBox[i] = keyBox[c];
    keyBox[c] = swap;
    lastIndex = c;
  }

  let metaLen = 0;
  if (buffer.length >= offset + 4) {
    metaLen = buffer.readUInt32LE(offset);
    offset += 4;
  }

  let format = "mp3";
  let title = "";
  let artist = "";
  let album = "";

  if (metaLen > 0 && buffer.length >= offset + metaLen) {
    const metaData = Buffer.from(buffer.subarray(offset, offset + metaLen));
    offset += metaLen;
    for (let i = 0; i < metaData.length; i++) metaData[i] ^= 0x63;

    const b64Str = metaData.subarray(22).toString("utf8");
    if (b64Str) {
      try {
        const encryptedMeta = Buffer.from(b64Str, "base64");
        const metaDecipher = crypto.createDecipheriv("aes-128-ecb", META_KEY, null);
        metaDecipher.setAutoPadding(true);
        const decryptedMeta = Buffer.concat([metaDecipher.update(encryptedMeta), metaDecipher.final()]);
        const jsonStr = decryptedMeta.subarray(6).toString("utf8");
        const metaJson = JSON.parse(jsonStr);
        format = (metaJson.format || "mp3").toLowerCase();
        title = metaJson.musicName || "";
        if (Array.isArray(metaJson.artist) && metaJson.artist.length > 0) {
          artist = metaJson.artist.map(a => Array.isArray(a) ? a[0] : (a.name || a)).join("/");
        } else if (typeof metaJson.artist === "string") {
          artist = metaJson.artist;
        }
        album = metaJson.album || "";
      } catch (e) {
        console.warn("解析 NCM 元数据失败:", e);
      }
    }
  }

  offset += 5; // Skip CRC / gap

  let coverBuffer = null;
  if (buffer.length >= offset + 4) {
    const imageLen = buffer.readUInt32LE(offset);
    offset += 8; // imageLen + 4 bytes gap
    if (imageLen > 0 && buffer.length >= offset + imageLen) {
      coverBuffer = Buffer.from(buffer.subarray(offset, offset + imageLen));
      offset += imageLen;
    }
  }

  const rawAudio = buffer.subarray(offset);
  const audioData = Buffer.alloc(rawAudio.length);
  for (let i = 1; i <= rawAudio.length; i++) {
    const j = i & 0xff;
    const k = (keyBox[j] + keyBox[(keyBox[j] + j) & 0xff]) & 0xff;
    audioData[i - 1] = rawAudio[i - 1] ^ keyBox[k];
  }

  return {
    audioBuffer: audioData,
    format,
    title,
    artist,
    album,
    coverBuffer,
  };
}
