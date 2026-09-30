// Local DJ visual prototype: feed the original wallpaper host bridge with
// sample operator data. No YesMusic API or audio playback is connected here.
function savedColorTheme() {
  try {
    const theme = JSON.parse(localStorage.getItem("rhine-settings") || "null")?.colorTheme;
    return theme === "light" || theme === "dark" || theme === "song" ? theme : "light";
  } catch { return "light"; }
}
window.wallpaperPropertyListener.applyUserProperties({
  desktopmode: { value: "workbench" },
  openingdetail: { value: "skip" },
  sessionname: { value: "YESMUSIC DJ" },
  language: { value: "zh-CN" },
  colortheme: { value: savedColorTheme() },
  sound: { value: false },
  music: { value: false },
  task1: { value: "整理今晚的 Setlist 草稿" },
  task2: { value: "核对 1001Tracklists 现场线索" },
  task3: { value: "试听并标记候选曲目" },
});
window.rhineWallpaperMedia = {
  status: { enabled: true },
  properties: { title: "示例曲目 A", artist: "示例艺术家 / 待接入" },
  timeline: { position: 51, duration: 243 },
  playing: true,
};
