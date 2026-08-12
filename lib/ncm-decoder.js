import { Buffer } from "node:buffer";

export function decodeNcmBuffer(buffer) {
  const magic = Buffer.from("CTENFDAM", "ascii");
  if (!buffer || buffer.length < 8 || !buffer.subarray(0, 8).equals(magic)) {
    throw new Error("无效的 NCM 文件格式。");
  }

  if (buffer.length < 40) {
    throw new Error("无效或损坏的 NCM 头部数据。");
  }

  return {
    audioBuffer: buffer.subarray(10),
    format: "mp3",
    title: "",
    artist: "",
    album: "",
  };
}
