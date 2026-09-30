import "./theme.css";
import type { ColorTheme } from "./auto-theme";
const palette = {
  ink: ["#080a08", "#e0e3dc"], muted: ["#77756d", "#a6b0b1"], line: ["#aaa59a", "#536166"],
  paper: ["#eae5e1", "#11181b"], panel: ["#edebe4", "#202a2f"], field: ["#e7e3d9", "#2a363b"],
  accent: ["#9b7247", "#c5a16b"],
} as const;
const neutralLight: Record<keyof typeof palette, string> = {
  ink: "#080a08", muted: "#74787a", line: "#a7abad", paper: "#f3f4f4",
  panel: "#f2f3f2", field: "#eaebeb", accent: "#9b7247",
};
let previous = -1;
let previousNeutral = -1;
export let themeAmount = 0;
function rgb(hex: string) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
export function paintTheme(amount: number, neutral = 0) {
  if (Math.abs(amount - previous) < .0001 && Math.abs(neutral - previousNeutral) < .0001) return;
  previous = themeAmount = amount;
  previousNeutral = neutral;
  const root = document.documentElement;
  root.dataset.darkSurface = String(amount > .0001);
  for (const [name, values] of Object.entries(palette)) {
    const from = rgb(values[0]).map((value, index) => value + (rgb(neutralLight[name as keyof typeof palette])[index] - value) * neutral), to = rgb(values[1]);
    const value = from.map((v, i) => Math.round(v + (to[i] - v) * amount)).join(", ");
    root.style.setProperty(`--theme-${name}`, `rgb(${value})`);
    root.style.setProperty(`--theme-${name}-rgb`, value);
  }
}
export function setThemeMode(theme: ColorTheme) {
  document.documentElement.dataset.colorTheme = theme;
}
export function themeSettingsMarkup(theme: ColorTheme, schedule?: string | null) {
  return `<div class="theme-settings"><div><strong>界面配色</strong><span>原始色调、暗色，或跟随当前歌曲封面改变背景</span>${schedule ? `<span class="theme-schedule">Wallpaper Engine 已按时间自动切换：${schedule}。手动选择会在下一个时间点被自动结果覆盖。</span>` : ""}</div><div class="theme-choices" role="group" aria-label="界面配色"><button data-color-theme="light" aria-pressed="${theme === "light"}">原始色调</button><button data-color-theme="dark" aria-pressed="${theme === "dark"}">暗色</button><button data-color-theme="song" aria-pressed="${theme === "song"}">随歌曲</button></div></div>`;
}
