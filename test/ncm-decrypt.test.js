import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ncmDecryptCode = readFileSync(resolve(__dirname, "../public/ncm-decrypt.js"), "utf8");

// Evaluate in Node context
const decryptNcm = new Function(`${ncmDecryptCode}; return decryptNcm;`)();

test("decryptNcm throws error on non-NCM file", () => {
  const dummyBuffer = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09]).buffer;
  assert.throws(() => {
    decryptNcm(dummyBuffer);
  }, /文件不是有效的 NCM 格式/);
});

test("decryptNcm throws error if magic header is invalid", () => {
  const invalidHeaderBuffer = new Uint8Array([0x43, 0x54, 0x45, 0x4E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).buffer;
  assert.throws(() => {
    decryptNcm(invalidHeaderBuffer);
  }, /文件不是有效的 NCM 格式/);
});
