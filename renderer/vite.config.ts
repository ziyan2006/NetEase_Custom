import { defineConfig } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Keep Blender's stable source/export paths, while production URLs identify
// exact bytes and can be cached without revalidation across deployments.
const models = ["archive-cassette", "archive-assembly", "archive-precision-medium", "archive-precision-low"].map(name => {
  const source = readFileSync(`public/assets/${name}.glb`);
  const hash = createHash("sha256").update(source).digest("hex").slice(0,16);
  return { key:`assets/${name}.glb`, fileName:`assets/${name}.${hash}.glb`, source };
});
const hasNovecento = ["Normal", "DemiBold", "Bold"].every(weight =>
  existsSync(`public/fonts/novecento/webFonts/NovecentoSansWide${weight}/font.woff2`),
);
export default defineConfig(({ mode }) => ({
  base: mode === "yesmusic" ? "/dj/" : mode === "wallpaper" || mode === "dj" ? "./" : "/",
  server: {
    // The renderer dev server serves the UI only. Forward API calls to the
    // same local backend used by the packaged app so account/login flows do
    // not receive Vite's SPA HTML fallback where JSON is expected.
    proxy: {
      "/api": { target: "http://127.0.0.1:4178", changeOrigin: true },
    },
  },
  define: {
    __RHINE_MODELS__: JSON.stringify(Object.fromEntries(models.map(model => [model.key,model.fileName]))),
    __RHINE_NOVECENTO__: JSON.stringify(hasNovecento),
  },
  plugins: [{
    name: "versioned-model-assets", apply: "build",
    buildStart() { for (const model of models) this.emitFile({type:"asset",fileName:model.fileName,source:model.source}); },
  }, ...(mode === "wallpaper" || mode === "dj" || mode === "yesmusic" ? [{
    name: "wallpaper-host",
    transformIndexHtml(html: string) {
      let output = html.replace(/\s*<link rel="manifest"[^>]*>/, "");
      if (mode === "dj" || mode === "yesmusic") output = output
        .replace("Rhine Lab · 莱茵生命交互桌面", "YesMusic · DJ 视觉原型")
        .replace("Rhine Lab — Synthesize Information Analysis OS. 交互式三维研究档案终端。", "YesMusic DJ 工具视觉原型，沿用 RhineLabWallpaper 的三维终端与进入动画。")
        .replace("RHINE LAB · ANALYSIS OS", "YESMUSIC · DJ ANALYSIS OS");
      return { html: output, tags: [{
        tag: "script", children: readFileSync("wallpaper/host.js", "utf8") + (mode === "dj" ? "\n" + readFileSync("prototype/host.js", "utf8") : mode === "yesmusic" ? "\n" + readFileSync("yesmusic-host.js", "utf8") : ""), injectTo: "head-prepend" as const,
      }] };
    },
  }] : [])],
}));
