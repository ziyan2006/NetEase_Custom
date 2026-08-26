import test from "node:test";
import assert from "node:assert/strict";
import { decodeNcmBuffer } from "../lib/ncm-decoder.js";

test("decodeNcmBuffer throws error for invalid NCM buffer", () => {
  const invalidBuffer = Buffer.from("invalid header bytes");
  assert.throws(() => decodeNcmBuffer(invalidBuffer), /有效|NCM/);
});

test("decodeNcmBuffer throws error for corrupted header", () => {
  const header = Buffer.from("CTENFDAM\u0001\u0070", "binary");
  const dummyPayload = Buffer.concat([header, Buffer.alloc(10)]);
  assert.throws(() => decodeNcmBuffer(dummyPayload), /error|损坏|无效/i);
});
