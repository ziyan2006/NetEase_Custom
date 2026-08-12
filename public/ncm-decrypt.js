/**
 * NCM 文件纯前端解密模块
 */

function createAes128Ecb() {
  const SBOX = new Uint8Array([
    99, 124, 119, 123, 242, 107, 111, 197, 48, 1, 103, 43, 254, 215, 171, 118,
    202, 130, 201, 125, 250, 89, 71, 240, 173, 212, 162, 175, 156, 164, 114, 192,
    183, 253, 147, 38, 54, 63, 247, 204, 52, 165, 229, 241, 113, 216, 49, 21,
    4, 199, 35, 195, 24, 150, 5, 154, 7, 18, 128, 226, 235, 39, 178, 117,
    9, 131, 44, 26, 27, 110, 90, 160, 82, 59, 214, 179, 41, 227, 47, 132,
    83, 209, 0, 237, 32, 252, 177, 91, 106, 203, 190, 57, 74, 76, 88, 207,
    208, 239, 170, 251, 67, 77, 51, 133, 69, 249, 2, 127, 80, 60, 159, 168,
    81, 163, 64, 143, 146, 157, 56, 245, 188, 182, 218, 33, 16, 255, 243, 210,
    205, 12, 19, 236, 95, 151, 68, 23, 196, 167, 126, 61, 100, 93, 25, 115,
    96, 129, 79, 220, 34, 42, 144, 136, 70, 238, 184, 20, 222, 94, 11, 219,
    224, 50, 58, 10, 73, 6, 36, 92, 194, 211, 172, 98, 145, 149, 228, 121,
    231, 200, 55, 109, 141, 213, 78, 169, 108, 86, 244, 234, 101, 122, 174, 8,
    186, 120, 37, 46, 28, 166, 180, 198, 232, 221, 116, 31, 75, 189, 139, 138,
    112, 62, 181, 102, 72, 3, 246, 14, 97, 53, 87, 185, 134, 193, 29, 158,
    225, 248, 152, 17, 105, 217, 142, 148, 155, 30, 135, 233, 206, 85, 40, 223,
    140, 161, 137, 13, 191, 230, 66, 104, 65, 153, 45, 15, 176, 84, 187, 22
  ]);

  const INV_SBOX = new Uint8Array(256);
  for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;

  const RCON = new Uint8Array([0, 1, 2, 4, 8, 16, 32, 64, 128, 27, 54]);

  function mul(a, b) {
    let p = 0;
    for (let i = 0; i < 8; i++) {
      if (b & 1) p ^= a;
      const hi = a & 0x80;
      a = (a << 1) & 0xff;
      if (hi) a ^= 0x1b;
      b >>= 1;
    }
    return p;
  }

  function keyExpansion(key) {
    const w = new Uint8Array(176);
    w.set(key);
    let i = 16;
    while (i < 176) {
      let k = w.subarray(i - 4, i).slice();
      if (i % 16 === 0) {
        const t = k[0]; k[0] = k[1]; k[1] = k[2]; k[2] = k[3]; k[3] = t;
        k[0] = SBOX[k[0]]; k[1] = SBOX[k[1]]; k[2] = SBOX[k[2]]; k[3] = SBOX[k[3]];
        k[0] ^= RCON[i / 16];
      }
      for (let j = 0; j < 4; j++) {
        w[i + j] = w[i - 16 + j] ^ k[j];
      }
      i += 4;
    }
    return w;
  }

  function decryptBlock(block, w) {
    let state = block.slice();
    for (let i = 0; i < 16; i++) state[i] ^= w[160 + i];

    for (let round = 9; round >= 1; round--) {
      let tmp = state[13]; state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = tmp;
      tmp = state[2]; let tmp2 = state[6]; state[2] = state[10]; state[6] = state[14]; state[10] = tmp; state[14] = tmp2;
      tmp = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = tmp;

      for (let i = 0; i < 16; i++) state[i] = INV_SBOX[state[i]];
      for (let i = 0; i < 16; i++) state[i] ^= w[round * 16 + i];

      for (let c = 0; c < 4; c++) {
        const off = c * 4;
        const s0 = state[off], s1 = state[off + 1], s2 = state[off + 2], s3 = state[off + 3];
        state[off]     = mul(s0, 0x0e) ^ mul(s1, 0x0b) ^ mul(s2, 0x0d) ^ mul(s3, 0x09);
        state[off + 1] = mul(s0, 0x09) ^ mul(s1, 0x0e) ^ mul(s2, 0x0b) ^ mul(s3, 0x0d);
        state[off + 2] = mul(s0, 0x0d) ^ mul(s1, 0x09) ^ mul(s2, 0x0e) ^ mul(s3, 0x0b);
        state[off + 3] = mul(s0, 0x0b) ^ mul(s1, 0x0d) ^ mul(s2, 0x09) ^ mul(s3, 0x0e);
      }
    }

    let tmp = state[13]; state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = tmp;
    tmp = state[2]; let tmp2 = state[6]; state[2] = state[10]; state[6] = state[14]; state[10] = tmp; state[14] = tmp2;
    tmp = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = tmp;

    for (let i = 0; i < 16; i++) state[i] = INV_SBOX[state[i]];
    for (let i = 0; i < 16; i++) state[i] ^= w[i];

    return state;
  }

  return function aesDecryptEcb(cipherText, key) {
    const w = keyExpansion(key);
    const result = new Uint8Array(cipherText.length);
    for (let i = 0; i < cipherText.length; i += 16) {
      const block = cipherText.subarray(i, i + 16);
      const decrypted = decryptBlock(block, w);
      result.set(decrypted, i);
    }
    return result;
  };
}

function pkcs7Unpad(data) {
  if (!data || data.length === 0) return data;
  const pad = data[data.length - 1];
  if (pad > 0 && pad <= 16 && data.length >= pad) {
    let valid = true;
    for (let i = data.length - pad; i < data.length; i++) {
      if (data[i] !== pad) { valid = false; break; }
    }
    if (valid) return data.subarray(0, data.length - pad);
  }
  return data;
}

function base64ToBytes(b64Str) {
  const bin = atob(b64Str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

const CORE_KEY = new Uint8Array([0x68, 0x7A, 0x48, 0x52, 0x41, 0x6D, 0x73, 0x6F, 0x35, 0x6B, 0x49, 0x6E, 0x62, 0x61, 0x78, 0x57]);
const META_KEY = new Uint8Array([0x23, 0x31, 0x34, 0x6C, 0x6A, 0x6B, 0x5F, 0x21, 0x5C, 0x5D, 0x26, 0x30, 0x55, 0x3C, 0x27, 0x28]);
const aesDecryptEcb = createAes128Ecb();

/**
 * 解密 NCM 格式的 ArrayBuffer
 * @param {ArrayBuffer} arrayBuffer 
 * @returns {{ audioBuffer: Uint8Array, format: string, title: string, artist: string, album: string, coverBlob: Blob|null }}
 */
function decryptNcm(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let offset = 0;

  const magic = [0x43, 0x54, 0x45, 0x4E, 0x46, 0x44, 0x41, 0x4D];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== magic[i]) {
      throw new Error("文件不是有效的 NCM 格式。");
    }
  }
  offset += 10;

  const keyLen = view.getUint32(offset, true);
  offset += 4;

  const keyData = bytes.subarray(offset, offset + keyLen).slice();
  offset += keyLen;

  for (let i = 0; i < keyData.length; i++) {
    keyData[i] ^= 0x64;
  }

  const decryptedKey = pkcs7Unpad(aesDecryptEcb(keyData, CORE_KEY));
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

  const metaLen = view.getUint32(offset, true);
  offset += 4;

  let format = "mp3";
  let title = "";
  let artist = "";
  let album = "";

  if (metaLen > 0) {
    const metaData = bytes.subarray(offset, offset + metaLen).slice();
    offset += metaLen;

    for (let i = 0; i < metaData.length; i++) {
      metaData[i] ^= 0x63;
    }

    const b64Str = new TextDecoder().decode(metaData.subarray(22));
    if (b64Str) {
      try {
        const encryptedMeta = base64ToBytes(b64Str);
        const decryptedMeta = pkcs7Unpad(aesDecryptEcb(encryptedMeta, META_KEY));
        const jsonStr = new TextDecoder().decode(decryptedMeta.subarray(6));
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

  offset += 5; // Skip CRC/gap

  const imageLen = view.getUint32(offset, true);
  offset += 4;
  offset += 4;

  let coverBlob = null;
  if (imageLen > 0) {
    const imageData = bytes.subarray(offset, offset + imageLen);
    offset += imageLen;
    const isPng = imageData[0] === 0x89 && imageData[1] === 0x50;
    coverBlob = new Blob([imageData], { type: isPng ? "image/png" : "image/jpeg" });
  }

  const rawAudio = bytes.subarray(offset);
  const audioData = new Uint8Array(rawAudio.length);
  for (let i = 1; i <= rawAudio.length; i++) {
    const j = i & 0xff;
    const k = (keyBox[j] + keyBox[(keyBox[j] + j) & 0xff]) & 0xff;
    audioData[i - 1] = rawAudio[i - 1] ^ keyBox[k];
  }

  return {
    audioBuffer: audioData,
    format: format,
    title: title,
    artist: artist,
    album: album,
    coverBlob: coverBlob
  };
}

if (typeof window !== "undefined") {
  window.decryptNcm = decryptNcm;
}
