import test from "node:test";
import assert from "node:assert/strict";
import { inspectAudioFile } from "../lib/audio-file.js";

test("identifies CTENFDAM NCM containers as protected and unsupported", () => {
  const inspection = inspectAudioFile({
    fileName: "song.ncm",
    header: Buffer.from("CTENFDAM\u0001\u0070", "binary"),
  });

  assert.deepEqual(inspection, {
    supported: false,
    code: "PROTECTED_NCM",
    message: "检测到受保护的 NCM 文件；此工具不会解密或绕过访问控制。",
  });
});

test("accepts standard MP3 input for local conversion", () => {
  const inspection = inspectAudioFile({
    fileName: "song.mp3",
    header: Buffer.from([0xff, 0xfb, 0x90, 0x64]),
  });

  assert.deepEqual(inspection, { supported: true });
});

test("rejects unknown input formats", () => {
  const inspection = inspectAudioFile({
    fileName: "song.bin",
    header: Buffer.from([0x01, 0x02, 0x03, 0x04]),
  });

  assert.deepEqual(inspection, {
    supported: false,
    code: "UNSUPPORTED_FORMAT",
    message: "仅支持常见的未加密音频文件。",
  });
});
