const supportedExtensions = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".opus",
  ".wav",
  ".webm",
]);

const protectedNcmHeader = Buffer.from("CTENFDAM", "ascii");

export function inspectAudioFile({ fileName, header }) {
  if (header.subarray(0, protectedNcmHeader.length).equals(protectedNcmHeader)) {
    return {
      supported: false,
      code: "PROTECTED_NCM",
      message: "检测到受保护的 NCM 文件；此工具不会解密或绕过访问控制。",
    };
  }

  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    return {
      supported: false,
      code: "UNSUPPORTED_FORMAT",
      message: "仅支持常见的未加密音频文件。",
    };
  }

  return { supported: true };
}

export const supportedInputExtensions = [...supportedExtensions];
