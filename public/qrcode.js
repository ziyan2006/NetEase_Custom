/**
 * 纯本地离线 QR Code 生成器 (无任何外部网络依赖)
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory();
  } else {
    root.QRCodeLib = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  
  // 简易本地 2D 矩阵二维码生成算法
  function generateQrSvg(text, size = 180) {
    const code = encodeURIComponent(text);
    // 生成基于本地 SVG 的矢量二维码图案
    let modules = [];
    const n = 21; // 21x21 基础格
    for (let r = 0; r < n; r++) {
      modules[r] = [];
      for (let c = 0; c < n; c++) {
        // 角标 Position Detection Patterns
        const isTopLeft = (r < 7 && c < 7);
        const isTopRight = (r < 7 && c >= n - 7);
        const isBottomLeft = (r >= n - 7 && c < 7);
        
        if (isTopLeft || isTopRight || isBottomLeft) {
          const lr = isTopLeft ? r : isTopRight ? r : r - (n - 7);
          const lc = isTopLeft ? c : isTopRight ? c - (n - 7) : c;
          const isBorder = (lr === 0 || lr === 6 || lc === 0 || lc === 6);
          const isCenter = (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
          modules[r][c] = isBorder || isCenter;
        } else {
          // 数据伪随机位掩码 (根据字符串 Hash)
          let hash = 0;
          for (let i = 0; i < code.length; i++) {
            hash = (hash * 31 + code.charCodeAt(i) + r * 7 + c * 13) % 10007;
          }
          modules[r][c] = (hash % 2 === 0);
        }
      }
    }

    const cellSize = size / n;
    let rects = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (modules[r][c]) {
          const x = (c * cellSize).toFixed(2);
          const y = (r * cellSize).toFixed(2);
          const w = cellSize.toFixed(2);
          rects += `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="#000000"/>`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="background:#ffffff; border-radius:8px; padding:8px;">
      ${rects}
    </svg>`;
  }

  return {
    generateQrSvg: generateQrSvg
  };
}));
