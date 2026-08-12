import test from "node:test";
import assert from "node:assert/strict";
import { decodeNcmBuffer } from "../lib/ncm-decoder.js";

test("decodeNcmBuffer throws error for invalid NCM buffer", () => {
  const invalidBuffer = Buffer.from("invalid header bytes");
  assert.throws(() => decodeNcmBuffer(invalidBuffer), /无效的 NCM 文件/);
});

test("decodeNcmBuffer throws error for corrupted header", () => {
  const header = Buffer.from("CTENFDAM\u0001\u0070", "binary");
  const dummyPayload = Buffer.concat([header, Buffer.alloc(10)]);
  assert.throws(() => decodeNcmBuffer(dummyPayload), /无效或损坏的 NCM 头部数据/);
});
