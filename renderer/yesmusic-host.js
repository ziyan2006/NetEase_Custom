// Local application host configuration. Keep Rhine Lab's original host bridge
// and scene timing, while omitting the prototype's sample media injection.
// Preview properties are resent on every page load. Reuse the renderer's
// saved choice so a selected song theme does not silently fall back to light.
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
});
