import { tr, language, localeEvent, bindStaticTranslations } from "./i18n";
import { rollText, patchRollingPanel } from "./workbench-rolling";
import { workbenchLettering } from "./workbench-lettering";
import { escapeHtml } from "./html";
import { isDjPrototype, wallpaperHost, type WallpaperProperties } from "./wallpaper";
import { djDemoTracks, djPlaceholderCover, djPreview, setDjPreview } from "./dj-records";
import { DjAgentPanel } from "./dj-agent";
import { dayKey, durationText, idleTimer, parseTarget, restoreTimer, timerLeft } from "./workbench-state";
import "./workbench.css";
import { defaultWorkbenchVisibility, applyVisibilityProperties, type WorkbenchVisibility, type WorkbenchElement } from "./workbench-visibility";

type Media = { status?: { enabled?: boolean }; properties?: { title?: string; artist?: string; albumTitle?: string }; thumbnail?: { thumbnail?: string }; timeline?: { position?: number; duration?: number }; playing?: boolean };
type DrawerMode = "agent" | "playlist" | "search";
const drawerLanes: Record<DrawerMode, number> = { agent: 0, playlist: 1, search: 2 };
declare global { interface Window { rhineWallpaperMedia?: Media; } }
const names = isDjPrototype
  ? ["AI DJ 助手", "云端歌单", "在线搜索歌曲", "导出根目录"]
  : ["时间日期", "今日事项", "重要日程", "正在播放", "专注计时"];
const capabilityKeys = ["enabletime", "enabletasks", "enableevent", "enablemedia", "enablefocus"];
const key = isDjPrototype ? "yesmusic-dj-prototype-v1" : "rhine-workbench-v1";
const djPlaylists = [
  { code: "YM–001", name: "Peak Hour Reference", count: 24, note: "峰值时段 / 示例歌单", cover: djPlaceholderCover, tracks: [0, 1, 2] },
  { code: "YM–002", name: "Warm-up Library", count: 32, note: "暖场曲库 / 示例歌单", cover: djPlaceholderCover, tracks: [2, 0, 1] },
  { code: "YM–003", name: "Melodic Techno Sketch", count: 18, note: "旋律 Techno / 示例歌单", cover: djPlaceholderCover, tracks: [1, 2, 0] },
];
export class Workbench {
  enabled = false;
  private root: HTMLElement;
  private agentPanel?: DjAgentPanel;
  private props: WallpaperProperties = {};
  private lane = 0;
  private selectedPlaylist = 0;
  private searchQuery = "";
  private outputRoot = "D:\\DJ_Music_Library";
  private djNotice = "";
  private playerNotice = "";
  private playlistPickerOpen = false;
  private playerPlaylistIndex = 0;
  private previewTrackIndex = 0;
  private activePlaylistIndex = -1;
  private activePlaylistPosition = 0;
  private rightDrawerOpen = false;
  private rightDrawerMode: DrawerMode = "playlist";
  private playlistDetailOpen = false;
  private playlistSearchQuery = "";
  private playlistDrawerNotice = "";
  private playlistExportConfirm = false;
  private completedPlaylistExports = new Set<string>();
  private onlineSearchQuery = "";
  private onlineSearchSubmitted = false;
  private onlineSearchNotice = "";
  private pendingOnlineTrackIndex: number | null = null;
  private playlistReturnFocus?: HTMLButtonElement;
  private timer = idleTimer();
  private done: string[] = [];
  private date = dayKey(new Date());
  private storageOK = true;
  private lastSecond = -1;
  private renderedDate = "";
  private exitAnimation?: Animation;
  private visibility: WorkbenchVisibility = defaultWorkbenchVisibility();
  constructor(private stage: HTMLElement, private onMode: () => void, private onLane: (lane: number) => void, private onTrackOpen: () => void, private onTrackStep: (direction: number) => void, private onPlaylistExport: (playlist: { name: string; total: number; cover: string }) => void = () => {}) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      this.timer = restoreTimer(saved?.timer);
      if (saved?.date === this.date && Array.isArray(saved.done)) this.done = saved.done.filter((s: unknown) => typeof s === "string").slice(0, 3);
    } catch { this.storageOK = false; }
    stage.insertAdjacentHTML("beforeend", `<section class="workbench" hidden aria-label="桌面工作台">
      <div class="wb-overview"><div class="wb-time"><div class="wb-kicker">${isDjPrototype ? "YESMUSIC / DJ TERMINAL" : workbenchLettering('daily')}</div><time class="wb-clock"></time><time class="wb-date"><span class="wb-date-numbers" aria-hidden="true"><span class="wb-date-year"></span><span class="wb-date-dot">.</span><span class="wb-date-monthday"></span></span><span class="wb-date-weekday" aria-hidden="true"></span></time></div>
      <section class="wb-today"><div class="wb-heading"><h2>${isDjPrototype ? "演出待办" : "今日事项"}</h2><span class="wb-task-count"></span></div><div class="wb-tasks"></div></section></div>
      <section class="wb-module"><div class="wb-kicker">${isDjPrototype ? "DJ WORKSPACE" : workbenchLettering('workspace')} <span class="wb-index">01 / ${isDjPrototype ? "04" : "05"}</span></div><h2 class="wb-title"></h2><div class="wb-content"></div><p class="wb-storage" role="status"></p></section>
      ${isDjPrototype ? '<section class="wb-dj-player" aria-label="试听播放器"></section>' : ""}
      ${isDjPrototype ? '<button class="wb-playlist-dismiss-zone" aria-label="关闭功能面板" title="点击灰色遮罩左侧的空白处收起" hidden></button><div class="wb-playlist-scrim" aria-hidden="true" hidden></div><aside class="wb-playlist-drawer" id="dj-playlist-drawer" role="dialog" aria-modal="false" aria-labelledby="dj-playlist-title" hidden></aside>' : ""}
      <nav class="wb-nav" aria-label="工作台功能">${names.map((n, i) => `<button data-wb-lane="${i}" aria-pressed="false"${isDjPrototype && i <= 2 ? ' aria-controls="dj-playlist-drawer" aria-expanded="false"' : ""}><small>0${i + 1}</small>${n}<span>↗</span></button>`).join("")}</nav>
    </section>`);
    this.root = stage.querySelector(".workbench")!;
    if (isDjPrototype) this.agentPanel = new DjAgentPanel({
      openSearch: () => this.openRightDrawer(this.root.querySelector<HTMLButtonElement>('[data-wb-lane="2"]')!, "search"),
      openPlaylists: () => this.openRightDrawer(this.root.querySelector<HTMLButtonElement>('[data-wb-lane="1"]')!, "playlist"),
      openAccount: () => document.querySelector<HTMLButtonElement>(".dj-account-button")?.click(),
      playSample: index => this.playPlaylistTrack(0, index),
    });
    bindStaticTranslations(this.root);
    window.addEventListener(localeEvent, () => {
      const task = (document.activeElement as HTMLElement)?.dataset.wbTask;
      this.lastSecond = -1;
      this.renderTasks(); this.renderPanel(); this.tick();
      if (task !== undefined) this.root.querySelector<HTMLElement>(`[data-wb-task="${task}"]`)?.focus({ preventScroll: true });
    });
    this.root.addEventListener("click", event => {
      const button = (event.target as Element).closest<HTMLButtonElement>("button");
      if (!button) return;
      if (isDjPrototype && button.dataset.djAction) { this.djAction(button); return; }
      if (button.dataset.wbLane !== undefined) {
        const lane = +button.dataset.wbLane;
        if (isDjPrototype && lane >= 0 && lane <= 2) {
          const mode = lane === 0 ? "agent" : lane === 1 ? "playlist" : "search";
          if (this.rightDrawerOpen && this.rightDrawerMode === mode) this.closeRightDrawer();
          else this.openRightDrawer(button, mode);
          return;
        }
        if (isDjPrototype && this.rightDrawerOpen) this.closeRightDrawer(false);
        this.select(lane);
        onLane(this.lane);
      }
      if (button.dataset.wbTask !== undefined) {
        this.rollDay();
        const id = this.taskId(+button.dataset.wbTask);
        this.done = this.done.includes(id) ? this.done.filter(d => d !== id) : [...this.done, id];
        this.save(); this.renderTasks();
        this.root.querySelector<HTMLButtonElement>(`[data-wb-task="${button.dataset.wbTask}"]`)?.focus({ preventScroll: true });
      }
      if (button.dataset.wbTimer) this.actTimer(button.dataset.wbTimer);
    });
    if (isDjPrototype) this.root.querySelector<HTMLButtonElement>(".wb-playlist-dismiss-zone")?.addEventListener("click", event => {
      event.stopPropagation();
      this.closeRightDrawer();
    });
    if (isDjPrototype) this.root.addEventListener("change", event => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.id === "dj-player-playlist") this.playerPlaylistIndex = Number(target.value) || 0;
      if (target instanceof HTMLSelectElement && target.id === "dj-online-playlist") this.playerPlaylistIndex = Number(target.value) || 0;
    });
    if (isDjPrototype) this.root.addEventListener("input", event => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.id === "dj-player-seek") this.seekPlayer(target.valueAsNumber);
      if (target instanceof HTMLInputElement && target.id === "dj-online-search") {
        this.onlineSearchQuery = target.value.slice(0, 80);
        this.onlineSearchSubmitted = false;
      }
      if (target instanceof HTMLInputElement && target.id === "dj-playlist-filter") {
        this.playlistSearchQuery = target.value.trim().toLocaleLowerCase();
        this.renderPlaylistCards();
      }
    });
    if (isDjPrototype) this.root.addEventListener("keydown", event => {
      if (this.playlistExportConfirm && event.key === "Tab") {
        const actions = this.root.querySelectorAll<HTMLButtonElement>(".wb-playlist-export-confirm button");
        const first = actions[0], last = actions[actions.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (this.playlistExportConfirm && event.key === "Escape") {
        event.preventDefault();
        this.playlistExportConfirm = false;
        this.renderRightDrawer();
        requestAnimationFrame(() => this.root.querySelector<HTMLButtonElement>("[data-dj-action='playlist-export']")?.focus({ preventScroll: true }));
        return;
      }
      if (event.key === "Escape" && this.rightDrawerOpen) {
        event.preventDefault();
        this.closeRightDrawer();
        return;
      }
      if (event.key !== "Enter" || event.shiftKey) return;
      const target = event.target;
      const action = target instanceof HTMLInputElement && target.id === "dj-online-search" ? "online-search"
          : target instanceof HTMLInputElement && target.id === "dj-search" ? "search"
          : target instanceof HTMLInputElement && target.id === "dj-output-root" ? "save-root" : null;
      if (!action) return;
      event.preventDefault(); event.stopPropagation();
      this.root.querySelector<HTMLButtonElement>(`[data-dj-action="${action}"]`)?.click();
    });
    window.addEventListener("rhine-wallpaper-properties", event => this.apply((event as CustomEvent<WallpaperProperties>).detail));
    window.addEventListener("rhine-wallpaper-media", () => {
      if (isDjPrototype) {
        this.syncDjPreview();
        this.renderDjPlayer();
      } else if (this.lane === 3) this.renderPanel();
    });
    window.addEventListener("resize", () => { if (!isDjPrototype && this.lane === 3) this.renderPanel(); });
    this.apply(wallpaperHost()?.properties ?? {});
  }
  private text(key: string) { const v = this.props[key]?.value; return typeof v === "string" ? v.trim().slice(0, 240) : ""; }
  private minutes(phase = this.timer.phase) { const n = this.props[phase === "focus" ? "focusminutes" : "breakminutes"]?.value; return typeof n === "number" && Number.isFinite(n) ? Math.max(1, Math.min(phase === "focus" ? 120 : 60, n)) : phase === "focus" ? 25 : 5; }
  private taskId(i: number) { return `${i}:${this.text(`task${i + 1}`)}`; }
  private apply(props: WallpaperProperties) {
    Object.assign(this.props, props);
    this.visibility = applyVisibilityProperties(this.visibility, props);
    if (props.desktopmode) this.setEnabled(props.desktopmode.value === "workbench");
    // Early/partial host updates must not clear saved tasks before their text arrives.
    const previous = this.done.length;
    this.done = this.done.filter(id => [0, 1, 2].every(i => !props[`task${i + 1}`] || !id.startsWith(`${i}:`) || id === this.taskId(i)));
    if (previous !== this.done.length) this.save();
    if (!this.laneEnabled(this.lane)) {
      this.lane = capabilityKeys.findIndex((_, i) => this.laneEnabled(i));
      if (this.lane >= 0) this.onLane(this.lane);
    }
    this.renderTasks(); this.renderPanel();
    this.syncElements();
  }
  setEnabled(value: boolean) {
    if (!value && this.rightDrawerOpen) this.closeRightDrawer(false);
    if (!value) {
      delete this.stage.dataset.playlistExporting;
      delete this.stage.dataset.playlistExportComplete;
    }
    this.enabled = value;
    this.stage.dataset.workbench = String(value);
    document.querySelectorAll<HTMLElement>("[data-workbench-mode]").forEach(button => button.setAttribute("aria-pressed", String((button.dataset.workbenchMode === "workbench") === value)));
    this.onMode();
    this.syncVisibility();
    this.syncElements();
  }
  completePlaylistExport(name: string) {
    const playlist = djPlaylists.find(item => item.name === name);
    if (!playlist) return;
    this.completedPlaylistExports.add(playlist.code);
    this.renderRightDrawer();
    const showingPlaylist = this.rightDrawerOpen
      && this.rightDrawerMode === "playlist"
      && this.playlistDetailOpen
      && djPlaylists[this.selectedPlaylist]?.code === playlist.code;
    if (showingPlaylist) this.stage.dataset.playlistExportComplete = "true";
    else {
      delete this.stage.dataset.playlistExporting;
      delete this.stage.dataset.playlistExportComplete;
    }
  }
  syncVisibility() {
    const hidden = !this.enabled || this.stage.dataset.mode === "boot";
    if (hidden && this.rightDrawerOpen) this.closeRightDrawer(false);
    const entering = this.root.hidden && !hidden;
    const reduced = this.stage.classList.contains("reduce-motion");
    this.root.inert = hidden;
    this.root.setAttribute("aria-hidden", String(hidden));
    if (hidden && !this.root.hidden && !reduced) {
      if (!this.exitAnimation) {
        const animation = this.root.animate([{ opacity: getComputedStyle(this.root).opacity }, { opacity: 0 }], { duration: 220, fill: "forwards", easing: "ease-out" });
        this.exitAnimation = animation;
        animation.onfinish = () => { this.root.hidden = true; animation.cancel(); this.exitAnimation = undefined; };
      }
      return;
    }
    const interrupted = Boolean(this.exitAnimation);
    const opacity = getComputedStyle(this.root).opacity;
    this.exitAnimation?.cancel();
    this.exitAnimation = undefined;
    this.root.hidden = hidden;
    if (interrupted && !hidden && !reduced) this.root.animate([{ opacity }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
    if (entering) {
      [".wb-time", ".wb-today", ".wb-module", ...(isDjPrototype ? [".wb-dj-player"] : []), ".wb-nav"].forEach((selector, i) => {
        const element = this.root.querySelector<HTMLElement>(selector)!;
        element.getAnimations().forEach(a => a.cancel());
        if (!reduced) element.animate([{ opacity: 0, translate: "0 9px" }, { opacity: 1, translate: "0 0" }],
          { duration: 460, delay: 60 + i * 65, easing: "cubic-bezier(.22,.7,.2,1)", fill: "backwards" });
      });
    }
  }
  private laneEnabled(lane: number) { return lane >= 0 && lane < names.length && this.props[capabilityKeys[lane]]?.value !== false; }
  select(lane: number) {
    if (!this.laneEnabled(lane)) return;
    if (isDjPrototype && lane !== this.lane) this.djNotice = "";
    this.lane = lane;
    this.renderPanel();
  }
  private syncElements() {
    const selectors = { clock: ".wb-time", tasks: ".wb-today", module: ".wb-module", navigation: ".wb-nav" } as const;
    for (const [key, selector] of Object.entries(selectors)) this.root.querySelector<HTMLElement>(selector)!.hidden = !this.visibility[key as WorkbenchElement];
    const available = capabilityKeys.some((_, i) => this.laneEnabled(i));
    this.root.querySelector<HTMLElement>(".wb-module")!.hidden = !this.visibility.module || !available;
    this.root.querySelector<HTMLElement>(".wb-nav")!.hidden = !this.visibility.navigation || !available;
    this.root.querySelectorAll<HTMLButtonElement>("[data-wb-lane]").forEach(button => { button.hidden = !this.laneEnabled(+button.dataset.wbLane!); });
    this.root.querySelector<HTMLElement>(".wb-overview")!.hidden = !this.visibility.clock && !this.visibility.tasks;
    this.root.dataset.clockVisible = String(this.visibility.clock);
    this.stage.dataset.workbenchBrand = String(!this.enabled || this.visibility.brand);
    this.stage.dataset.workbenchFooter = String(!this.enabled || this.visibility.footer);
  }
  private save() {
    try { localStorage.setItem(key, JSON.stringify({ date: this.date, done: this.done, timer: this.timer })); this.storageOK = true; }
    catch { this.storageOK = false; }
    this.root.querySelector(".wb-storage")!.textContent = this.storageOK ? "" : tr("当前无法保存进度，重新加载后可能丢失。");
  }
  private rollDay() {
    const today = dayKey(new Date());
    if (this.date !== today) { this.date = today; this.done = []; this.save(); this.renderTasks(); }
  }
  private renderTasks() {
    const entries = [0, 1, 2].filter(i => this.text(`task${i + 1}`));
    this.root.querySelector(".wb-task-count")!.textContent = entries.length ? `${entries.filter(i => this.done.includes(this.taskId(i))).length} / ${entries.length}` : "";
    this.root.querySelector(".wb-tasks")!.innerHTML = entries.length ? entries.map(i => `<button class="wb-task" data-wb-task="${i}" aria-pressed="${this.done.includes(this.taskId(i))}"><span class="wb-check" aria-hidden="true">${this.done.includes(this.taskId(i)) ? "✓" : ""}</span><span>${escapeHtml(this.text(`task${i + 1}`))}</span></button>`).join("") : tr('<p class="wb-muted">今天想完成什么？<br>在 Wallpaper Engine 属性中填写最多三件事。</p>');
  }
  private actTimer(action: string) {
    const now = Date.now();
    this.settle(now);
    if (action === "reset") this.timer = { ...idleTimer(), phase: this.timer.phase };
    if (action === "phase") this.timer = { ...idleTimer(), phase: this.timer.phase === "focus" ? "break" : "focus" };
    if (action === "toggle") {
      if (this.timer.status === "running") this.timer = { ...this.timer, status: "paused", remaining: timerLeft(this.timer, now), deadline: 0 };
      else {
        const remaining = this.timer.status === "paused" ? this.timer.remaining : this.minutes() * 60000;
        this.timer = { ...this.timer, remaining, deadline: now + remaining, status: "running" };
      }
    }
    this.save(); this.renderPanel();
    this.root.querySelector<HTMLButtonElement>(`[data-wb-timer="${action}"]`)?.focus({ preventScroll: true });
  }
  private openRightDrawer(trigger: HTMLButtonElement | undefined, mode: DrawerMode) {
    if (!isDjPrototype) return;
    const alreadyOpen = this.rightDrawerOpen;
    const modeChanged = this.rightDrawerMode !== mode;
    this.rightDrawerOpen = true;
    this.rightDrawerMode = mode;
    if (!alreadyOpen || modeChanged) this.playlistDetailOpen = false;
    if (!alreadyOpen || modeChanged) this.playlistExportConfirm = false;
    if (modeChanged) this.pendingOnlineTrackIndex = null;
    if (mode === "playlist") this.playlistDrawerNotice = "";
    else if (mode === "search") this.onlineSearchNotice = "";
    this.playlistReturnFocus = trigger;
    this.stage.dataset.djDrawerOpen = "true";
    const dismissZone = this.root.querySelector<HTMLButtonElement>(".wb-playlist-dismiss-zone")!;
    const scrim = this.root.querySelector<HTMLElement>(".wb-playlist-scrim")!;
    const drawer = this.root.querySelector<HTMLElement>(".wb-playlist-drawer")!;
    dismissZone.hidden = false;
    scrim.hidden = false;
    drawer.hidden = false;
    drawer.inert = false;
    drawer.setAttribute("aria-hidden", "false");
    this.root.querySelectorAll<HTMLButtonElement>('.wb-nav [aria-controls="dj-playlist-drawer"]').forEach(button => button.setAttribute("aria-expanded", String(Number(button.dataset.wbLane) === drawerLanes[mode])));
    this.root.querySelectorAll<HTMLButtonElement>("[data-wb-lane]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.wbLane) === drawerLanes[mode])));
    this.renderRightDrawer();
    if (!alreadyOpen && !this.stage.classList.contains("reduce-motion")) {
      drawer.getAnimations().forEach(animation => animation.cancel());
      drawer.animate([{ opacity: 0, transform: "translateX(100%)" }, { opacity: 1, transform: "translateX(0)" }], { duration: 380, easing: "cubic-bezier(.22,.7,.2,1)" });
    }
    if (!alreadyOpen || modeChanged) requestAnimationFrame(() => this.root.querySelector<HTMLButtonElement>(".wb-playlist-drawer [data-dj-action='drawer-close']")?.focus({ preventScroll: true }));
  }
  private closeRightDrawer(restoreFocus = true) {
    if (!this.rightDrawerOpen) return;
    this.rightDrawerOpen = false;
    if (this.stage.dataset.playlistExportComplete === "true") {
      delete this.stage.dataset.playlistExporting;
      delete this.stage.dataset.playlistExportComplete;
    }
    this.agentPanel?.unmount();
    this.pendingOnlineTrackIndex = null;
    this.stage.dataset.djDrawerOpen = "false";
    const dismissZone = this.root.querySelector<HTMLButtonElement>(".wb-playlist-dismiss-zone")!;
    const scrim = this.root.querySelector<HTMLElement>(".wb-playlist-scrim")!;
    const drawer = this.root.querySelector<HTMLElement>(".wb-playlist-drawer")!;
    drawer.inert = true;
    drawer.setAttribute("aria-hidden", "true");
    this.root.querySelectorAll<HTMLButtonElement>('.wb-nav [aria-controls="dj-playlist-drawer"]').forEach(button => button.setAttribute("aria-expanded", "false"));
    if (this.stage.classList.contains("reduce-motion")) {
      drawer.hidden = true;
      dismissZone.hidden = true;
      scrim.hidden = true;
    } else {
      drawer.getAnimations().forEach(animation => animation.cancel());
      const animation = drawer.animate([{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: "translateX(100%)" }], { duration: 300, easing: "ease-in", fill: "forwards" });
      animation.onfinish = () => {
        if (this.rightDrawerOpen) return;
        drawer.hidden = true;
        dismissZone.hidden = true;
        scrim.hidden = true;
        animation.cancel();
      };
    }
    this.renderPanel();
    if (restoreFocus) this.playlistReturnFocus?.focus({ preventScroll: true });
  }
  private renderRightDrawer() {
    if (!this.rightDrawerOpen) return;
    const drawer = this.root.querySelector<HTMLElement>(".wb-playlist-drawer")!;
    drawer.dataset.djDrawerMode = this.rightDrawerMode;
    if (this.rightDrawerMode === "agent") {
      this.agentPanel?.mount(drawer);
      return;
    }
    this.agentPanel?.unmount();
    if (this.rightDrawerMode === "search") {
      this.renderOnlineSearchDrawer(drawer);
      return;
    }
    const playlist = djPlaylists[this.selectedPlaylist] ?? djPlaylists[0];
    if (!this.playlistDetailOpen) {
      drawer.innerHTML = `
        <header class="wb-playlist-heading">
          <div><span>NETEASE CLOUD / PLAYLIST INDEX</span><h2 id="dj-playlist-title">云端歌单</h2><p>浏览歌单、查看曲目与导出设置</p></div>
          <button class="wb-playlist-close" data-dj-action="drawer-close" aria-label="关闭歌单面板">×</button>
        </header>
        <div class="wb-playlist-tools">
          <label class="wb-playlist-search"><span aria-hidden="true">⌕</span><input id="dj-playlist-filter" type="search" placeholder="搜索歌单名称…" aria-label="搜索歌单名称" value="${escapeHtml(this.playlistSearchQuery)}"/></label>
          <button data-dj-action="playlist-refresh" title="刷新歌单">↻<span>刷新</span></button>
          <button class="wb-playlist-create" data-dj-action="playlist-create">＋ 新建</button>
        </div>
        <div class="wb-playlist-list-heading"><span>PLAYLIST COLLECTION</span><span>${String(djPlaylists.length).padStart(2, "0")} / SAMPLE</span></div>
        <div class="wb-playlist-grid" id="dj-playlist-cards"></div>
        ${this.playlistDrawerNotice ? `<p class="wb-playlist-notice" role="status">${escapeHtml(this.playlistDrawerNotice)}</p>` : ""}`;
      this.renderPlaylistCards();
      return;
    }
    const trackRows = playlist.tracks.map((trackIndex, rowIndex) => {
      const track = djDemoTracks[trackIndex];
      return `<div class="wb-playlist-track-row"><span class="wb-playlist-track-no">${String(rowIndex + 1).padStart(2, "0")}</span><div class="wb-playlist-track-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · 匹配状态待接入</small></div><time>—:——</time><div class="wb-playlist-track-actions"><button data-dj-action="playlist-track-play" data-track-index="${trackIndex}" aria-label="试听 ${escapeHtml(track.title)}">▶</button><button data-dj-action="playlist-track-add" data-track-index="${trackIndex}" aria-label="将 ${escapeHtml(track.title)} 加入其他歌单">＋</button><button data-dj-action="playlist-track-remove" data-track-index="${trackIndex}" aria-label="从歌单移除 ${escapeHtml(track.title)}">−</button></div></div>`;
    }).join("");
    drawer.innerHTML = `
      <header class="wb-playlist-detail-heading">
        <button class="wb-playlist-back" data-dj-action="playlist-back">← <span>返回歌单列表</span></button>
        <button class="wb-playlist-close" data-dj-action="drawer-close" aria-label="关闭歌单面板">×</button>
      </header>
      <div class="wb-playlist-detail-scroll">
        <div class="wb-playlist-detail-hero">
          <div class="wb-playlist-detail-cover"><img src="${escapeHtml(playlist.cover)}" alt="${escapeHtml(playlist.name)} 封面"/><span>${playlist.code}</span><strong>PLAYLIST</strong></div>
          <div class="wb-playlist-detail-meta"><span class="wb-playlist-eyebrow">SELECTED PLAYLIST / 歌单档案</span><h2 id="dj-playlist-title">${escapeHtml(playlist.name)}</h2><p>${escapeHtml(playlist.note)} · 内容为视觉示例</p><div class="wb-playlist-metrics"><span><strong>${playlist.count}</strong><small>TRACKS</small></span><span><strong>320K</strong><small>QUALITY</small></span><span><strong>MP3</strong><small>EXPORT</small></span></div><div class="wb-playlist-detail-actions"><button data-dj-action="playlist-play-all">▶ 全部播放</button><button data-dj-action="playlist-export">↓ 导出歌单</button></div></div>
        </div>
        ${this.completedPlaylistExports.has(playlist.code) ? `<section class="wb-playlist-export-complete" role="status"><div><strong>EXPORT COMPLETE</strong><span>${playlist.count} / ${playlist.count} TRACKS · 100%</span></div><i><b></b></i><small>导出完成 · 封面与歌单信息已保留</small></section>` : ""}
        <div class="wb-playlist-track-heading"><span>TRACKLIST / 曲目列表</span><span>PLAY · ADD · REMOVE</span></div>
        <div class="wb-playlist-track-list">${trackRows}</div>
        ${this.playlistDrawerNotice ? `<p class="wb-playlist-notice" role="status">${escapeHtml(this.playlistDrawerNotice)}</p>` : ""}
      </div>
      ${this.playlistExportConfirm ? `<div class="wb-playlist-confirm-layer"><section class="wb-playlist-export-confirm" role="alertdialog" aria-modal="true" aria-labelledby="playlist-export-confirm-title" aria-describedby="playlist-export-confirm-copy"><span class="wb-playlist-export-eyebrow">NETEASE CLOUD / EXPORT</span><h3 id="playlist-export-confirm-title">是否导出这份歌单？</h3><strong>${escapeHtml(playlist.name)}</strong><p id="playlist-export-confirm-copy">将导出 ${playlist.count} 首曲目。确认后会在当前档案画面展示导出进度；此原型不会写入音频文件。</p><div><button data-dj-action="playlist-export-cancel">取消</button><button data-dj-action="playlist-export-confirm">确认导出 ↗</button></div></section></div>` : ""}`;
  }
  private renderPlaylistCards() {
    const container = this.root.querySelector<HTMLElement>("#dj-playlist-cards");
    if (!container || !this.rightDrawerOpen || this.rightDrawerMode !== "playlist" || this.playlistDetailOpen) return;
    const matching = djPlaylists.map((playlist, index) => ({ playlist, index })).filter(({ playlist }) => `${playlist.name} ${playlist.note}`.toLocaleLowerCase().includes(this.playlistSearchQuery));
    container.innerHTML = matching.length ? matching.map(({ playlist, index }) => `
      <article class="wb-playlist-card">
        <button class="wb-playlist-card-open" data-dj-action="playlist-open" data-index="${index}" aria-label="打开歌单 ${escapeHtml(playlist.name)}">
        <span class="wb-playlist-card-cover"><img src="${escapeHtml(playlist.cover)}" alt=""/><i>${playlist.code}</i><b>PLAYLIST</b></span>
          <strong>${escapeHtml(playlist.name)}</strong><small>${playlist.count} 首曲目 · 示例歌单</small>
        </button>
        <div class="wb-playlist-card-actions"><button data-dj-action="playlist-card-play" data-index="${index}" aria-label="播放歌单 ${escapeHtml(playlist.name)}" title="播放歌单">▶</button><button data-dj-action="playlist-export-card" data-index="${index}" aria-label="导出 ${escapeHtml(playlist.name)}">↓</button><button data-dj-action="playlist-delete" data-index="${index}" aria-label="删除 ${escapeHtml(playlist.name)}">×</button></div>
      </article>`).join("") : `<p class="wb-playlist-empty">未找到“${escapeHtml(this.playlistSearchQuery)}”对应的歌单。</p>`;
  }
  private renderOnlineSearchDrawer(drawer: HTMLElement) {
    const query = this.onlineSearchQuery.trim().toLocaleLowerCase();
    const matches = this.onlineSearchSubmitted && query
      ? djDemoTracks.map((track, index) => ({ track, index })).filter(({ track }) => `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(query))
      : [];
    const rows = matches.map(({ track, index }, rowIndex) => `
      <tr>
        <td class="wb-search-number">${String(rowIndex + 1).padStart(2, "0")}</td>
        <td><div class="wb-search-track"><img src="${escapeHtml(djPlaceholderCover)}" alt=""/><span><strong>${escapeHtml(track.title)}</strong><small>示例曲目 / DEMO RESULT</small></span></div></td>
        <td>${escapeHtml(track.artist)}</td><td>${escapeHtml(track.album)}</td><td class="wb-search-duration">—:——</td>
        <td><div class="wb-search-actions"><button data-dj-action="online-track-play" data-track-index="${index}" aria-label="试听 ${escapeHtml(track.title)}" title="试听">▶</button><button data-dj-action="online-track-add" data-track-index="${index}" aria-label="将 ${escapeHtml(track.title)} 加入歌单" title="加入歌单">＋</button></div></td>
      </tr>`).join("");
    const resultContent = !this.onlineSearchSubmitted
      ? `<div class="wb-search-placeholder"><span>⌕</span><strong>搜索网易云曲库</strong><p>输入歌曲名、歌手名或专辑名，查看匹配结果。</p></div>`
      : matches.length
        ? `<div class="wb-search-table-wrap"><table class="wb-search-table"><thead><tr><th>#</th><th>歌曲</th><th>歌手</th><th>专辑</th><th>时长</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="wb-playlist-empty">示例曲库中没有找到“${escapeHtml(this.onlineSearchQuery)}”。<small>接入原版曲库接口后，这里将显示在线搜索结果。</small></div>`;
    const addTrack = this.pendingOnlineTrackIndex === null ? null : djDemoTracks[this.pendingOnlineTrackIndex];
    drawer.innerHTML = `
      <header class="wb-playlist-heading">
        <div><span>NETEASE MUSIC / ONLINE SEARCH</span><h2 id="dj-playlist-title">在线搜索歌曲</h2><p>按歌曲、歌手或专辑检索曲库，并试听或加入歌单</p></div>
        <button class="wb-playlist-close" data-dj-action="drawer-close" aria-label="关闭搜索面板">×</button>
      </header>
      <div class="wb-playlist-tools wb-online-search-tools">
        <label class="wb-playlist-search"><span aria-hidden="true">⌕</span><input id="dj-online-search" type="search" placeholder="歌曲名、歌手名或专辑名…" aria-label="搜索歌曲、歌手或专辑" value="${escapeHtml(this.onlineSearchQuery)}"/></label>
        <button class="wb-playlist-create" data-dj-action="online-search">⌕<span>搜索</span></button>
      </div>
      <div class="wb-playlist-list-heading"><span>SEARCH RESULTS / 搜索结果</span><span>${this.onlineSearchSubmitted ? `${String(matches.length).padStart(2, "0")} / SAMPLE` : "等待查询"}</span></div>
      <div class="wb-search-content">${resultContent}</div>
      ${addTrack ? `<div class="wb-search-add-panel"><div><strong>加入歌单</strong><small>${escapeHtml(addTrack.title)}</small></div><label><span>目标歌单</span><select id="dj-online-playlist" aria-label="选择目标歌单">${djPlaylists.map((playlist, index) => `<option value="${index}" ${index === this.playerPlaylistIndex ? "selected" : ""}>${escapeHtml(playlist.name)}</option>`).join("")}</select></label><button class="wb-search-add-confirm" data-dj-action="online-confirm-add">确认加入</button><button class="wb-search-add-cancel" data-dj-action="online-cancel-add">取消</button></div>` : ""}
      ${this.onlineSearchNotice ? `<p class="wb-playlist-notice" role="status">${escapeHtml(this.onlineSearchNotice)}</p>` : ""}`;
  }
  private settle(now: number) {
    if (this.timer.status === "running" && timerLeft(this.timer, now) === 0) {
      this.timer = { ...this.timer, status: "done", remaining: 0, deadline: 0 }; this.save(); this.renderPanel();
    }
  }
  tick(now = Date.now()) {
    if (Math.floor(now / 1000) === this.lastSecond) return;
    this.lastSecond = Math.floor(now / 1000);
    this.rollDay(); this.settle(now);
    const date = new Date(now);
    rollText(this.root.querySelector<HTMLElement>(".wb-clock")!, date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), !this.stage.classList.contains("reduce-motion"));
    const dateKey = dayKey(date);
    const dateLocale = `${dateKey}:${language()}`;
    if (this.renderedDate !== dateLocale) {
      const element = this.root.querySelector<HTMLTimeElement>(".wb-date")!;
      const [year, month, day] = dateKey.split("-");
      element.dateTime = dateKey;
      element.setAttribute("aria-label", date.toLocaleDateString(language(), { year: "numeric", month: "long", day: "numeric", weekday: "long" }));
      element.querySelector(".wb-date-year")!.textContent = year;
      element.querySelector(".wb-date-monthday")!.textContent = `${month}.${day}`;
      element.querySelector(".wb-date-weekday")!.textContent = date.toLocaleDateString(language(), { weekday: "long" });
      this.renderedDate = dateLocale;
    }
    if (!isDjPrototype && (this.lane === 0 || this.lane === 2)) this.renderPanel();
    const timer = this.root.querySelector(".wb-timer-digits");
    if (timer) rollText(timer as HTMLElement, durationText(this.timer.status === "idle" ? this.minutes() * 60000 : timerLeft(this.timer, now)), !this.stage.classList.contains("reduce-motion"));
  }
  private renderPanel() {
    if (this.lane < 0) {
      this.root.querySelector(".wb-title")!.textContent = "";
      this.root.querySelector(".wb-content")!.replaceChildren();
      return;
    }
    this.root.querySelector(".wb-title")!.textContent = tr(names[this.lane]);
    const available = capabilityKeys.map((_, i) => i).filter(i => this.laneEnabled(i));
    this.root.querySelector(".wb-index")!.textContent = `${String(available.indexOf(this.lane) + 1).padStart(2, "0")} / ${String(available.length).padStart(2, "0")}`;
    const activeLane = isDjPrototype && this.rightDrawerOpen ? drawerLanes[this.rightDrawerMode] : this.lane;
    this.root.querySelectorAll<HTMLButtonElement>("[data-wb-lane]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.wbLane! === activeLane)));
    if (isDjPrototype) { this.renderDjPanel(); this.renderDjPlayer(); return; }
    let html = "";
    if (this.lane === 0) {
      const now = new Date(), end = new Date(now.getFullYear() + 1, 0, 1).getTime(), start = new Date(now.getFullYear(), 0, 1).getTime();
      const percent = (now.getTime() - start) / (end - start) * 100;
      html = tr`<div class="wb-large">${now.getFullYear()}<small>YEAR</small></div><div class="wb-rule"><i style="width:${percent}%"></i></div><p class="wb-muted">今年已走过 ${percent.toFixed(1)}%</p>`;
    }
    if (this.lane === 1) html = tr('<div class="wb-large">03<small>PRIORITIES</small></div><p class="wb-muted">把今天留给最重要的三件事。<br>点击左侧事项标记完成，再点一次撤销。完成状态每天重置。</p>');
    if (this.lane === 2) {
      const text = this.text("eventdate"), target = parseTarget(text), title = this.text("eventname");
      const delta = target === null ? 0 : target - Date.now();
      const days = Math.ceil(Math.abs(delta) / 86400000);
      const dayLabel = language() === "en-US"
        ? `${days === 1 ? "DAY" : "DAYS"} ${delta > 0 ? "TO GO" : "AGO"}`
        : delta > 0 ? "天后" : "天前";
      html = !text ? tr('<p class="wb-empty">留一个值得期待的日子。</p><p class="wb-muted">在 Wallpaper Engine 中填写日程名称与目标日期。</p>') : target === null ? tr('<p class="wb-empty">目标日期格式不正确</p><p class="wb-muted">请填写 YYYY-MM-DD，或 YYYY-MM-DD HH:mm。</p>') : tr`<p class="wb-event">${escapeHtml(title || tr("重要日程"))}</p><div class="wb-large">${days}<small>${dayLabel}</small></div><p class="wb-muted">${delta > 0 ? tr("距离目标") : tr("已到达目标")} · ${escapeHtml(text)}<br>${Math.floor(Math.abs(delta) / 3600000)} 小时 ${Math.floor(Math.abs(delta) / 60000) % 60} 分钟${delta > 0 ? tr("后") : tr("前")}</p>`;
    }
    if (this.lane === 3) {
      const media = window.rhineWallpaperMedia ?? {}, p = media.properties, t = media.timeline;
      const cover = media.thumbnail?.thumbnail;
      const safeCover = typeof cover === "string" && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(cover);
      html = media.status?.enabled === false ? tr('<p class="wb-empty">媒体信息未启用</p><p class="wb-muted">请在 Wallpaper Engine 中启用媒体信息集成。</p>') : !p?.title ? tr('<p class="wb-empty">此刻，留一点安静。</p><p class="wb-muted">在支持系统媒体信息的播放器中播放音乐，歌曲与封面会显示在这里。</p>') : `<div class="wb-media">${safeCover ? tr`<img src="${escapeHtml(cover!)}" alt="专辑封面"/>` : '<div class="wb-cover" aria-hidden="true">♫</div>'}<div><small>${media.playing ? tr("正在播放") : tr("媒体已暂停或停止")}</small><h3 data-wb-roll>${escapeHtml(p.title)}</h3><p data-wb-roll>${escapeHtml(p.artist || "")}</p></div></div>${t && typeof t.duration === "number" && t.duration > 0 && Number.isFinite(t.duration) && typeof t.position === "number" && Number.isFinite(t.position) ? `<div class="wb-rule"><i style="width:${Math.max(0, Math.min(100, t.position / t.duration * 100))}%"></i></div><p class="wb-muted"><span data-wb-roll>${durationText(t.position * 1000)}</span> / <span data-wb-roll>${durationText(t.duration * 1000)}</span></p>` : ''}`;
    }
    if (this.lane === 4) html = tr`<div class="wb-timer-label">${this.timer.phase === "focus" ? tr("专注") : tr("休息")} · ${this.timer.status === "done" ? tr("已结束") : this.timer.status === "running" ? tr("进行中") : this.timer.status === "paused" ? tr("已暂停") : tr("准备开始")}</div><div class="wb-large wb-timer-digits" data-wb-roll>${durationText(this.timer.status === "idle" ? this.minutes() * 60000 : timerLeft(this.timer, Date.now()))}</div><div class="wb-timer-buttons"><button data-wb-timer="toggle">${this.timer.status === "running" ? tr("暂停") : this.timer.status === "paused" ? tr("继续") : tr("开始")}</button><button data-wb-timer="reset">重置</button><button data-wb-timer="phase">${this.timer.phase === "focus" ? tr("转入休息") : tr("开始专注")}</button></div><p class="wb-muted">${this.timer.status === "done" ? tr("这一段时间已完成。准备好后再开始下一段。") : tr("暂停壁纸或重新加载后按实际时间校正。")}<br>时长在 Wallpaper Engine 中设置。</p>`;
    patchRollingPanel(this.root.querySelector<HTMLElement>(".wb-content")!, html, !this.stage.classList.contains("reduce-motion"));
    this.root.querySelector(".wb-storage")!.textContent = this.storageOK ? "" : tr("当前无法保存进度，重新加载后可能丢失。");
  }
  private djAction(button: HTMLButtonElement) {
    const action = button.dataset.djAction;
    if (action === "archive") { this.onLane(this.lane); this.setEnabled(false); return; }
    if (action === "track-detail") { this.syncDjPreview(); this.onTrackOpen(); return; }
    if (action === "drawer-close") { this.closeRightDrawer(); return; }
    if (action === "agent-open") { this.openRightDrawer(this.root.querySelector<HTMLButtonElement>('[data-wb-lane="0"]')!, "agent"); return; }
    if (action === "playlist-open") {
      this.selectedPlaylist = Number(button.dataset.index) || 0;
      this.playlistDetailOpen = true;
      this.playlistDrawerNotice = "";
      this.renderRightDrawer();
      this.root.querySelector<HTMLButtonElement>("[data-dj-action='playlist-back']")?.focus({ preventScroll: true });
      return;
    }
    if (action === "playlist-back") {
      this.playlistDetailOpen = false;
      this.playlistExportConfirm = false;
      this.playlistDrawerNotice = "";
      this.renderRightDrawer();
      this.root.querySelector<HTMLButtonElement>(`[data-dj-action='playlist-open'][data-index='${this.selectedPlaylist}']`)?.focus({ preventScroll: true });
      return;
    }
    if (action === "playlist-refresh") this.playlistDrawerNotice = "示例歌单已刷新；登录接入后会读取网易云云端数据。";
    if (action === "playlist-create") this.playlistDrawerNotice = "新建歌单将接入原版网易云账号流程。";
    if (action === "playlist-export" || action === "playlist-export-card") {
      if (action === "playlist-export-card") {
        this.selectedPlaylist = Number(button.dataset.index) || 0;
        this.playlistDetailOpen = true;
      }
      this.playlistExportConfirm = true;
      this.playlistDrawerNotice = "";
      this.renderRightDrawer();
      requestAnimationFrame(() => this.root.querySelector<HTMLButtonElement>("[data-dj-action='playlist-export-cancel']")?.focus({ preventScroll: true }));
      return;
    }
    if (action === "playlist-export-cancel") {
      this.playlistExportConfirm = false;
      this.renderRightDrawer();
      requestAnimationFrame(() => this.root.querySelector<HTMLButtonElement>("[data-dj-action='playlist-export']")?.focus({ preventScroll: true }));
      return;
    }
    if (action === "playlist-export-confirm") {
      const playlist = djPlaylists[this.selectedPlaylist] ?? djPlaylists[0];
      this.playlistExportConfirm = false;
      this.completedPlaylistExports.delete(playlist.code);
      this.renderRightDrawer();
      requestAnimationFrame(() => this.root.querySelector<HTMLButtonElement>("[data-dj-action='playlist-export']")?.focus({ preventScroll: true }));
      this.onPlaylistExport({ name: playlist.name, total: playlist.count, cover: playlist.cover });
      return;
    }
    if (action === "playlist-delete") this.playlistDrawerNotice = "删除歌单会连接网易云账号；当前原型不会修改云端数据。";
    if (action === "playlist-refresh" || action === "playlist-create" || action === "playlist-delete") {
      this.renderRightDrawer();
      return;
    }
    if (action === "playlist-card-play" || action === "playlist-play-all" || action === "playlist-track-play") {
      const playlistIndex = action === "playlist-card-play" ? Number(button.dataset.index) || 0 : this.selectedPlaylist;
      const playlist = djPlaylists[playlistIndex] ?? djPlaylists[0];
      const trackIndex = action === "playlist-track-play" ? Number(button.dataset.trackIndex) || 0 : playlist.tracks[0] ?? 0;
      const playlistPosition = Math.max(0, playlist.tracks.indexOf(trackIndex));
      this.playPlaylistTrack(playlistIndex, playlistPosition);
      return;
    }
    if (action === "playlist-track-add") this.playlistDrawerNotice = "添加曲目将接入原版网易云歌单操作；当前没有修改歌单。";
    if (action === "playlist-track-remove") this.playlistDrawerNotice = "移除曲目将接入原版网易云歌单操作；当前没有修改歌单。";
    if (action === "playlist-track-add" || action === "playlist-track-remove") {
      this.renderRightDrawer();
      return;
    }
    if (action === "online-search") {
      this.onlineSearchQuery = this.root.querySelector<HTMLInputElement>("#dj-online-search")?.value.trim().slice(0, 80) ?? "";
      this.onlineSearchSubmitted = Boolean(this.onlineSearchQuery);
      this.onlineSearchNotice = this.onlineSearchQuery ? "已完成示例曲库匹配；当前原型没有请求网易云在线接口。" : "请输入歌曲名、歌手名或专辑名。";
      this.renderRightDrawer();
      this.root.querySelector<HTMLInputElement>("#dj-online-search")?.focus({ preventScroll: true });
      return;
    }
    if (action === "online-track-play") {
      const trackIndex = Number(button.dataset.trackIndex);
      const track = djDemoTracks[trackIndex];
      if (!track) return;
      this.activePlaylistIndex = -1;
      this.previewTrackIndex = trackIndex;
      setDjPreview(track.title, track.artist, track.album);
      const media = window.rhineWallpaperMedia;
      if (media) {
        media.properties = { title: track.title, artist: track.artist, albumTitle: track.album };
        media.timeline = { position: 0, duration: media.timeline?.duration || 243 };
        media.playing = true;
      }
      this.playerNotice = "正在试听搜索结果的示例曲目；未连接真实音源。";
      this.renderDjPlayer();
      return;
    }
    if (action === "online-track-add") {
      this.pendingOnlineTrackIndex = Number(button.dataset.trackIndex);
      this.onlineSearchNotice = "请选择目标歌单。";
      this.renderRightDrawer();
      this.root.querySelector<HTMLSelectElement>("#dj-online-playlist")?.focus({ preventScroll: true });
      return;
    }
    if (action === "online-cancel-add") {
      this.pendingOnlineTrackIndex = null;
      this.onlineSearchNotice = "";
      this.renderRightDrawer();
      return;
    }
    if (action === "online-confirm-add") {
      const trackIndex = this.pendingOnlineTrackIndex;
      const playlist = djPlaylists[this.playerPlaylistIndex];
      const track = trackIndex === null ? undefined : djDemoTracks[trackIndex];
      if (track && playlist && trackIndex !== null) {
        playlist.tracks.push(trackIndex);
        playlist.count += 1;
        this.onlineSearchNotice = `已将「${track.title}」加入「${playlist.name}」的本次原型歌单；刷新页面后重置，尚未写入网易云。`;
      }
      this.pendingOnlineTrackIndex = null;
      this.renderRightDrawer();
      return;
    }
    if (action === "preview") {
      this.activePlaylistIndex = -1;
      const media = window.rhineWallpaperMedia!;
      const title = button.dataset.track ?? "示例曲目 A";
      setDjPreview(title);
      media.properties = { title, artist: djPreview.artist };
      media.playing = false;
      this.playerNotice = "";
      this.renderDjPlayer();
    }
    if (action === "playing") {
      window.rhineWallpaperMedia!.playing = !window.rhineWallpaperMedia!.playing;
      this.renderDjPlayer();
    }
    if (action === "step-track") {
      const direction = Number(button.dataset.direction) < 0 ? -1 : 1;
      const activePlaylist = djPlaylists[this.activePlaylistIndex];
      if (activePlaylist?.tracks.length) {
        this.activePlaylistPosition = (this.activePlaylistPosition + direction + activePlaylist.tracks.length) % activePlaylist.tracks.length;
        this.previewTrackIndex = activePlaylist.tracks[this.activePlaylistPosition] ?? 0;
      } else {
        this.previewTrackIndex = (this.previewTrackIndex + direction + djDemoTracks.length) % djDemoTracks.length;
      }
      const track = djDemoTracks[this.previewTrackIndex];
      setDjPreview(track.title, track.artist, track.album);
      const media = window.rhineWallpaperMedia;
      if (media) {
        media.properties = { title: track.title, artist: track.artist, albumTitle: track.album };
        media.timeline = { position: 0, duration: media.timeline?.duration || 243 };
        media.playing = true;
      }
      this.onTrackStep(direction);
      this.playerNotice = "已切换示例曲目，背景档案同步移动。";
      this.renderDjPlayer();
    }
    if (action === "download-track") {
      this.playerNotice = "此示例曲目尚无音源，接入曲库后可下载。";
      this.renderDjPlayer();
    }
    if (action === "add-to-playlist") {
      this.playlistPickerOpen = !this.playlistPickerOpen;
      this.playerNotice = "";
      this.renderDjPlayer();
    }
    if (action === "confirm-add-track") {
      const playlist = ["Peak Hour Reference", "Warm-up Library", "Melodic Techno Sketch"][this.playerPlaylistIndex] ?? "Peak Hour Reference";
      this.playlistPickerOpen = false;
      this.playerNotice = `已将「${djPreview.title}」加入「${playlist}」的原型状态；尚未写入网易云。`;
      this.renderDjPlayer();
    }
    if (action === "playlist") {
      this.selectedPlaylist = Number(button.dataset.index) || 0;
      this.renderPanel();
    }
    if (action === "search") {
      this.searchQuery = this.root.querySelector<HTMLInputElement>("#dj-search")?.value.trim().slice(0, 80) ?? "";
      this.renderPanel();
    }
    if (action === "save-root") {
      this.outputRoot = this.root.querySelector<HTMLInputElement>("#dj-output-root")?.value.trim().slice(0, 180) ?? "";
      this.djNotice = this.outputRoot ? "路径已记在当前原型画面；尚未写入 YesMusic 配置。" : "请填写目标根目录。";
      this.renderPanel();
    }
    if (action === "browse-root") {
      this.djNotice = "目录选择需接入原版 Electron 窗口。";
      this.renderPanel();
    }
    if (action === "playlist-create" || action === "playlist-export") {
      this.djNotice = action === "playlist-create" ? "新建歌单将接入原版网易云账号流程。" : "歌单导出将使用右侧配置的根目录。";
      this.renderPanel();
    }
  }
  private playPlaylistTrack(playlistIndex: number, position: number) {
    const playlist = djPlaylists[playlistIndex] ?? djPlaylists[0];
    if (!playlist.tracks.length) return;
    this.selectedPlaylist = playlistIndex;
    this.activePlaylistIndex = playlistIndex;
    this.activePlaylistPosition = ((position % playlist.tracks.length) + playlist.tracks.length) % playlist.tracks.length;
    this.previewTrackIndex = playlist.tracks[this.activePlaylistPosition] ?? 0;
    const track = djDemoTracks[this.previewTrackIndex] ?? djDemoTracks[0];
    setDjPreview(track.title, track.artist, track.album);
    const media = window.rhineWallpaperMedia;
    if (media) {
      media.properties = { title: track.title, artist: track.artist, albumTitle: track.album };
      media.timeline = { position: 0, duration: media.timeline?.duration || 243 };
      media.playing = true;
    }
    this.playerNotice = "";
    this.playlistDrawerNotice = `播放列表已切换为「${playlist.name}」，正在试听「${track.title}」示例曲目。`;
    this.renderDjPlayer();
    this.renderRightDrawer();
  }
  private renderDjPanel() {
    let html = "";
    if (this.lane === 0) html = `<div class="wb-dj-thread"><small>1001TRACKLISTS / CAMELOT / NETEASE</small><p>从现场 Setlist 到选曲与调性衔接，在 Agent 会话中准备下一场演出。</p></div><button class="wb-dj-link" data-dj-action="agent-open">打开 AI DJ 助手 <span>↗</span></button>`;
    if (this.lane === 1) {
      const playlists = ["Peak Hour Reference", "Warm-up Library", "Melodic Techno Sketch"];
      html = `<div class="wb-dj-list">${playlists.map((name, index) => `<button data-dj-action="playlist" data-index="${index}" aria-pressed="${this.selectedPlaylist === index}"><span>0${index + 1}</span><strong>${name}<small>示例歌单 / 曲目待接入</small></strong><i>↗</i></button>`).join("")}</div><p class="wb-muted">已选择：${playlists[this.selectedPlaylist]} · 浏览、编辑和导出将在接入后可用。</p><div class="wb-dj-controls"><button data-dj-action="playlist-create">新建歌单</button><button data-dj-action="playlist-export">导出歌单</button></div>${this.djNotice ? `<p class="wb-muted" role="status">${escapeHtml(this.djNotice)}</p>` : ""}<button class="wb-dj-link" data-dj-action="archive">打开歌单档案 <span>↗</span></button>`;
    }
    if (this.lane === 2) html = `<div class="wb-dj-search"><input id="dj-search" type="search" aria-label="在线搜索歌曲" placeholder="输入歌曲名、歌手名或专辑…" value="${escapeHtml(this.searchQuery)}"/><button data-dj-action="search">搜索 ↗</button></div><p class="wb-muted">${this.searchQuery ? `查询预览：${escapeHtml(this.searchQuery)}。` : "网易云曲库在线搜索入口。"} 当前只展示示例曲目，不请求曲库。</p><div class="wb-dj-list">${["示例曲目 A", "示例曲目 B", "示例曲目 C"].map((name, index) => `<button data-dj-action="preview" data-track="${name}"><span>0${index + 1}</span><strong>${name}<small>艺人、专辑与匹配状态待接入</small></strong><i>试听 ↗</i></button>`).join("")}</div><button class="wb-dj-link" data-dj-action="archive">查看搜索档案 <span>↗</span></button>`;
    if (this.lane === 3) html = `<div class="wb-dj-root"><label for="dj-output-root">目标根路径 / OUTPUT ROOT</label><div><input id="dj-output-root" type="text" value="${escapeHtml(this.outputRoot)}" aria-label="导出根目录"/><button data-dj-action="browse-root">浏览目录…</button></div><p class="wb-muted">原版导出歌单时会在此目录下建立独立文件夹，并输出音频文件。</p><button class="wb-dj-link" data-dj-action="save-root">保存路径预览 <span>↗</span></button>${this.djNotice ? `<p class="wb-muted" role="status">${escapeHtml(this.djNotice)}</p>` : ""}</div>`;
    patchRollingPanel(this.root.querySelector<HTMLElement>(".wb-content")!, html, !this.stage.classList.contains("reduce-motion"));
    this.root.querySelector(".wb-storage")!.textContent = "";
  }
  private renderDjPlayer() {
    if (!isDjPrototype) return;
    const media = window.rhineWallpaperMedia ?? {};
    const duration = typeof media.timeline?.duration === "number" && Number.isFinite(media.timeline.duration) && media.timeline.duration > 0 ? media.timeline.duration : 243;
    const position = typeof media.timeline?.position === "number" && Number.isFinite(media.timeline.position) ? Math.min(duration, Math.max(0, media.timeline.position)) : 51;
    const progress = position / duration * 100;
    const playlists = ["Peak Hour Reference", "Warm-up Library", "Melodic Techno Sketch"];
    const activePlaylist = djPlaylists[this.activePlaylistIndex];
    this.root.querySelector<HTMLElement>(".wb-dj-player")!.innerHTML = `
      <div class="wb-kicker">NOW PLAYING / PREVIEW <span>${activePlaylist ? `QUEUE / ${escapeHtml(activePlaylist.name)}` : "DEMO"}</span></div>
      <button class="wb-dj-player-open" data-dj-action="track-detail" aria-label="打开 ${escapeHtml(djPreview.title)} 的三维歌曲档案">
        <div class="wb-media">
          <img class="wb-dj-cover-image" src="${escapeHtml(djPreview.cover)}" alt="示例曲目封面"/>
          <div><small>${media.playing ? "正在试听 / 演示状态" : "已暂停 / 演示状态"}</small><h3>${escapeHtml(media.properties?.title || djPreview.title)}</h3><p>${escapeHtml(media.properties?.artist || djPreview.artist)}</p></div>
        </div>
        <span class="wb-dj-open-hint">打开歌曲 3D 档案 ↗</span>
      </button>
      <div class="wb-dj-progress">
        <input id="dj-player-seek" type="range" min="0" max="${duration}" step="1" value="${position}" aria-label="播放进度" aria-valuetext="${durationText(position * 1000)} / ${durationText(duration * 1000)}" style="--seek-progress:${progress}%"/>
        <div><time data-dj-position>${durationText(position * 1000)}</time><time>${durationText(duration * 1000)}</time></div>
      </div>
      <div class="wb-dj-player-foot">
        <span>试听进度 / PREVIEW</span>
        <div class="wb-dj-transport">
          <button data-dj-action="step-track" data-direction="-1" aria-label="上一首">⏮</button>
          <button class="wb-dj-play-toggle" data-dj-action="playing" aria-label="${media.playing ? "暂停" : "播放"}预览">${media.playing ? "Ⅱ" : "▶"}</button>
          <button data-dj-action="step-track" data-direction="1" aria-label="下一首">⏭</button>
        </div>
      </div>
      <div class="wb-dj-player-actions"><button data-dj-action="download-track">↓ 下载</button><button data-dj-action="add-to-playlist">＋ 加入歌单</button></div>
      ${this.playlistPickerOpen ? `<div class="wb-dj-playlist-picker"><label for="dj-player-playlist">加入到 / ADD TO</label><select id="dj-player-playlist" aria-label="选择目标歌单">${playlists.map((name, index) => `<option value="${index}" ${index === this.playerPlaylistIndex ? "selected" : ""}>${name}</option>`).join("")}</select><button data-dj-action="confirm-add-track">确认加入</button></div>` : ""}
      ${this.playerNotice ? `<p class="wb-muted wb-dj-player-notice" role="status">${escapeHtml(this.playerNotice)}</p>` : ""}`;
  }
  private seekPlayer(value: number) {
    const media = window.rhineWallpaperMedia;
    const input = this.root.querySelector<HTMLInputElement>("#dj-player-seek");
    if (!media || !input || !Number.isFinite(value)) return;
    const duration = Number(input.max) || 243;
    const position = Math.max(0, Math.min(duration, value));
    media.timeline = { ...media.timeline, position, duration };
    input.style.setProperty("--seek-progress", `${position / duration * 100}%`);
    input.setAttribute("aria-valuetext", `${durationText(position * 1000)} / ${durationText(duration * 1000)}`);
    const current = this.root.querySelector<HTMLElement>("[data-dj-position]");
    if (current) current.textContent = durationText(position * 1000);
  }
  private syncDjPreview() {
    const media = window.rhineWallpaperMedia;
    const properties = media?.properties;
    if (!properties?.title) return;
    setDjPreview(properties.title, properties.artist, properties.albumTitle, media?.thumbnail?.thumbnail);
  }
}
