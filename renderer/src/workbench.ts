import { tr, language, localeEvent, bindStaticTranslations } from "./i18n";
import { rollText, patchRollingPanel } from "./workbench-rolling";
import { workbenchLettering } from "./workbench-lettering";
import { escapeHtml } from "./html";
import { isDjPrototype, wallpaperHost, type WallpaperProperties } from "./wallpaper";
import { NeteaseApiError, yesmusicApi, type NeteasePlaylist, type NeteaseTrack } from "./yesmusic-api";
import { createPlaylistExportState, failPlaylistExport, type PlaylistExportState } from "./dj-export.js";
import { DjPlayer } from "./dj-player.js";
import { DjAgentPanel } from "./dj-agent";
import { dayKey, durationText, idleTimer, parseTarget, restoreTimer, timerLeft } from "./workbench-state";
import "./workbench.css";
import { defaultWorkbenchVisibility, applyVisibilityProperties, type WorkbenchVisibility, type WorkbenchElement } from "./workbench-visibility";

type Media = { status?: { enabled?: boolean }; properties?: { title?: string; artist?: string; albumTitle?: string }; thumbnail?: { thumbnail?: string }; timeline?: { position?: number; duration?: number }; playing?: boolean };
type DjPlayerState = { queue: NeteaseTrack[]; index: number; status: "idle" | "loading" | "playing" | "paused" | "error"; currentTime: number; duration: number; error: string; track: NeteaseTrack | null };
type DrawerMode = "agent" | "playlist" | "search";
const drawerLanes: Record<DrawerMode, number> = { agent: 0, playlist: 1, search: 2 };
declare global { interface Window { rhineWallpaperMedia?: Media; } }
const names = isDjPrototype
  ? ["AI DJ 助手", "云端歌单", "在线搜索歌曲", "导出根目录"]
  : ["时间日期", "今日事项", "重要日程", "正在播放", "专注计时"];
const capabilityKeys = ["enabletime", "enabletasks", "enableevent", "enablemedia", "enablefocus"];
const key = isDjPrototype ? "yesmusic-dj-prototype-v1" : "rhine-workbench-v1";
const playlistExportStorageKey = "yesmusic-playlist-export-v1";
const playerStorageKey = "yesmusic-dj-player-v1";
type PersistedPlaylistExport = {
  version: 1;
  jobId: string;
  accountUserId: string;
  outputRoot: string;
  playlist: Pick<NeteasePlaylist, "id" | "name" | "coverUrl" | "trackCount">;
  state: PlaylistExportState;
};
export class Workbench {
  enabled = false;
  private root: HTMLElement;
  private agentPanel?: DjAgentPanel;
  private props: WallpaperProperties = {};
  private lane = 0;
  private selectedPlaylistId = "";
  private playlists: NeteasePlaylist[] = [];
  private playlistDetail: NeteasePlaylist | null = null;
  private playlistsLoading = false;
  private playlistDetailLoading = false;
  private playlistError = "";
  private playlistCreateOpen = false;
  private deleteConfirmId = "";
  private pendingTrack: NeteaseTrack | null = null;
  private targetPlaylistId = "";
  private mutationBusy = false;
  private accountUserId = "";
  private playlistsRequestId = 0;
  private detailRequestId = 0;
  private player: DjPlayer;
  private playerState: DjPlayerState = { queue: [], index: -1, status: "idle", currentTime: 0, duration: 0, error: "", track: null };
  private renderedPlayerKey = "";
  private playerTrackId = "";
  private playerSnapshotWriteAt = 0;
  private playerPickerOpen = false;
  private seekingPlayer = false;
  private playerActionNotice = "";
  private singleTrackExportBusy = false;
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
  private playlistExportState: PlaylistExportState | null = null;
  private playlistExportSnapshot: PersistedPlaylistExport | null = null;
  private exportResumeInFlight = false;
  private playlistExportConfirmTrigger?: HTMLButtonElement;
  private onlineSearchQuery = "";
  private onlineSearchSubmitted = false;
  private onlineSearchNotice = "";
  private onlineSearchStatus: "idle" | "loading" | "ready" | "error" = "idle";
  private onlineSearchResults: NeteaseTrack[] = [];
  private onlineSearchTotal = 0;
  private onlineSearchError = "";
  private onlineSearchRequestId = 0;
  private onlineSearchAbort?: AbortController;
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
  constructor(private stage: HTMLElement, private onMode: () => void, private onLane: (lane: number) => void, private onTrackOpen: () => void, private onTrackStep: (track: NeteaseTrack | null) => void, private onPlaylistExport: (playlist: NeteasePlaylist, outputRoot: string, onState: (state: PlaylistExportState) => void, jobId: string, resume: boolean, initialState: PlaylistExportState) => Promise<void> | void = () => {}, private onRestorePlaylistExport: (state: PlaylistExportState) => void = () => {}) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      this.timer = restoreTimer(saved?.timer);
      if (saved?.date === this.date && Array.isArray(saved.done)) this.done = saved.done.filter((s: unknown) => typeof s === "string").slice(0, 3);
    } catch { this.storageOK = false; }
    try {
      const savedOutputRoot = localStorage.getItem("yesmusic-output-root-v1")?.trim();
      if (savedOutputRoot) this.outputRoot = savedOutputRoot.slice(0, 500);
    } catch { this.storageOK = false; }
    stage.insertAdjacentHTML("beforeend", `<section class="workbench" hidden aria-label="桌面工作台">
      <div class="wb-overview"><div class="wb-time"><div class="wb-kicker">${isDjPrototype ? "YESMUSIC / DJ TERMINAL" : workbenchLettering('daily')}</div><time class="wb-clock"></time><time class="wb-date"><span class="wb-date-numbers" aria-hidden="true"><span class="wb-date-year"></span><span class="wb-date-dot">.</span><span class="wb-date-monthday"></span></span><span class="wb-date-weekday" aria-hidden="true"></span></time></div>
      ${isDjPrototype ? "" : '<section class="wb-today"><div class="wb-heading"><h2>今日事项</h2><span class="wb-task-count"></span></div><div class="wb-tasks"></div></section>'}</div>
      <section class="wb-module"><div class="wb-kicker">${isDjPrototype ? "DJ WORKSPACE" : workbenchLettering('workspace')} <span class="wb-index">01 / ${isDjPrototype ? "04" : "05"}</span></div><h2 class="wb-title"></h2><div class="wb-content"></div><p class="wb-storage" role="status"></p></section>
      ${isDjPrototype ? '<section class="wb-dj-player" aria-label="试听播放器"></section>' : ""}
      ${isDjPrototype ? '<button class="wb-playlist-dismiss-zone" aria-label="关闭功能面板" title="点击灰色遮罩左侧的空白处收起" hidden></button><div class="wb-playlist-scrim" aria-hidden="true" hidden></div><aside class="wb-playlist-drawer" id="dj-playlist-drawer" role="dialog" aria-modal="false" aria-labelledby="dj-playlist-title" hidden></aside>' : ""}
      <nav class="wb-nav" aria-label="工作台功能">${names.map((n, i) => `<button data-wb-lane="${i}" aria-pressed="false"${isDjPrototype && i <= 2 ? ' aria-controls="dj-playlist-drawer" aria-expanded="false"' : ""}><small>0${i + 1}</small>${n}<span>↗</span></button>`).join("")}</nav>
    </section>`);
    this.root = stage.querySelector(".workbench")!;
    if (isDjPrototype) this.restorePlaylistExportSnapshot();
    this.player = new DjPlayer({
      resolveAudioUrl: (trackId: string) => yesmusicApi.getSongUrl(trackId),
      onChange: (state: DjPlayerState) => this.onPlayerState(state),
    });
    if (isDjPrototype) this.restorePlayerSnapshot();
    if (isDjPrototype) this.agentPanel = new DjAgentPanel({
      openSearch: () => this.openRightDrawer(this.root.querySelector<HTMLButtonElement>('[data-wb-lane="2"]')!, "search"),
      openPlaylists: () => this.openRightDrawer(this.root.querySelector<HTMLButtonElement>('[data-wb-lane="1"]')!, "playlist"),
      openAccount: () => document.querySelector<HTMLButtonElement>(".dj-account-button")?.click(),
      playTracks: async (tracks, index) => { if (tracks.length) await this.player.setQueue(tracks, index); },
      addTrack: async (track) => {
        this.openRightDrawer(this.root.querySelector<HTMLButtonElement>('[data-wb-lane="1"]')!, "playlist");
        await this.prepareTrackAdd(track, false);
      },
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
      if (isDjPrototype && button.dataset.djAction) { void this.djAction(button); return; }
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
      if (target instanceof HTMLSelectElement && (target.id === "dj-playlist-target" || target.id === "dj-player-target")) this.targetPlaylistId = target.value;
      if (target instanceof HTMLInputElement && target.id === "dj-player-seek") this.seekingPlayer = false;
      if (target instanceof HTMLInputElement && target.id === "dj-player-seek") this.syncDjPlayerUi();
    });
    if (isDjPrototype) this.root.addEventListener("pointerdown", event => {
      if ((event.target as HTMLElement).closest("#dj-player-seek")) this.seekingPlayer = true;
    });
    if (isDjPrototype) this.root.addEventListener("pointerup", event => {
      if ((event.target as HTMLElement).closest("#dj-player-seek")) { this.seekingPlayer = false; this.syncDjPlayerUi(); }
    });
    if (isDjPrototype) this.root.addEventListener("input", event => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.id === "dj-player-seek") this.player.seek(target.valueAsNumber);
      if (target instanceof HTMLInputElement && target.id === "dj-online-search") {
        this.onlineSearchQuery = target.value.slice(0, 80);
        this.onlineSearchSubmitted = false;
        this.onlineSearchAbort?.abort();
        this.onlineSearchRequestId++;
        this.onlineSearchStatus = "idle";
        this.onlineSearchResults = [];
        this.onlineSearchTotal = 0;
        this.onlineSearchError = "";
        this.onlineSearchNotice = "";
        this.renderOnlineSearchResults();
      }
      if (target instanceof HTMLInputElement && target.id === "dj-playlist-filter") {
        this.playlistSearchQuery = target.value.trim().toLocaleLowerCase();
        this.renderPlaylistCards();
      }
    });
    if (isDjPrototype) window.addEventListener("yesmusic-account-updated", event => {
      const detail = (event as CustomEvent<{ authenticated: boolean; userId?: string }>).detail;
      this.accountUserId = detail?.authenticated ? String(detail.userId ?? "") : "";
      if (this.accountUserId) this.resumePlaylistExportForAccount(this.accountUserId);
      if (!this.accountUserId) {
        this.playlists = [];
        this.playlistDetail = null;
        this.selectedPlaylistId = "";
        this.playlistDetailOpen = false;
        this.pendingTrack = null;
        this.playerPickerOpen = false;
        this.player.clear();
      }
      if (this.rightDrawerMode === "playlist") void this.refreshPlaylists();
      this.renderRightDrawer();
      this.renderDjPanel();
    });
    if (isDjPrototype) this.root.addEventListener("keydown", event => {
      if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.id === "dj-online-search") {
        event.preventDefault();
        this.root.querySelector<HTMLButtonElement>('[data-dj-action="online-search"]')?.click();
        return;
      }
      if ((this.pendingTrack || this.deleteConfirmId || this.playlistExportConfirm) && event.key === "Tab") {
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
      if ((this.pendingTrack || this.deleteConfirmId || this.playlistExportConfirm) && event.key === "Escape") {
        event.preventDefault();
        const cancelExport = this.playlistExportConfirm;
        this.pendingTrack = null;
        this.deleteConfirmId = "";
        this.playlistExportConfirm = false;
        this.playerPickerOpen = false;
        this.renderRightDrawer();
        this.renderDjPlayer();
        requestAnimationFrame(() => (cancelExport ? this.root.querySelector<HTMLButtonElement>("[data-dj-action='playlist-export']") : this.root.querySelector<HTMLButtonElement>("[data-dj-action='playlist-track-add']") ?? this.root.querySelector<HTMLButtonElement>("[data-dj-action='player-add']"))?.focus({ preventScroll: true }));
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
      [".wb-time", ...(!isDjPrototype ? [".wb-today"] : []), ".wb-module", ...(isDjPrototype ? [".wb-dj-player"] : []), ".wb-nav"].forEach((selector, i) => {
        const element = this.root.querySelector<HTMLElement>(selector);
        if (!element) return;
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
    for (const [key, selector] of Object.entries(selectors)) {
      const element = this.root.querySelector<HTMLElement>(selector);
      if (element) element.hidden = !this.visibility[key as WorkbenchElement];
    }
    const available = capabilityKeys.some((_, i) => this.laneEnabled(i));
    this.root.querySelector<HTMLElement>(".wb-module")!.hidden = !this.visibility.module || !available;
    this.root.querySelector<HTMLElement>(".wb-nav")!.hidden = !this.visibility.navigation || !available;
    this.root.querySelectorAll<HTMLButtonElement>("[data-wb-lane]").forEach(button => { button.hidden = !this.laneEnabled(+button.dataset.wbLane!); });
    this.root.querySelector<HTMLElement>(".wb-overview")!.hidden = !this.visibility.clock && (!this.visibility.tasks || isDjPrototype);
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
    if (isDjPrototype || !this.root.querySelector(".wb-today")) return;
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
    if (!alreadyOpen || modeChanged) this.pendingTrack = null;
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
    if (mode === "playlist" && this.accountUserId && !this.playlists.length && !this.playlistsLoading) void this.refreshPlaylists();
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
  private async refreshPlaylists() {
    if (!this.accountUserId) {
      this.playlists = [];
      this.playlistDetail = null;
      this.playlistError = "请先登录网易云账号以读取云端歌单。";
      this.playlistsLoading = false;
      this.renderRightDrawer();
      return;
    }
    const requestId = ++this.playlistsRequestId;
    this.playlistsLoading = true;
    this.playlistError = "";
    this.renderRightDrawer();
    try {
      const result = await yesmusicApi.getPlaylists();
      if (requestId !== this.playlistsRequestId) return;
      this.accountUserId = result.userId || this.accountUserId;
      this.playlists = result.playlists;
      if (!this.playlists.some(item => item.id === this.selectedPlaylistId)) this.selectedPlaylistId = this.playlists[0]?.id ?? "";
      if (this.playlistDetailOpen && this.selectedPlaylistId) await this.loadPlaylistDetail(this.selectedPlaylistId);
    } catch (error) {
      if (requestId !== this.playlistsRequestId) return;
      this.playlistError = error instanceof Error ? error.message : "歌单读取失败，请重试。";
      if (error instanceof NeteaseApiError && error.status === 401) {
        window.dispatchEvent(new CustomEvent("yesmusic-auth-invalid", { detail: { message: this.playlistError } }));
      }
    } finally {
      if (requestId === this.playlistsRequestId) {
        this.playlistsLoading = false;
        this.renderRightDrawer();
        this.renderDjPanel();
        this.renderDjPlayer();
      }
    }
  }
  private async loadPlaylistDetail(id: string) {
    if (!id) return;
    const requestId = ++this.detailRequestId;
    this.selectedPlaylistId = id;
    this.playlistDetail = null;
    this.playlistDetailLoading = true;
    this.playlistError = "";
    this.renderRightDrawer();
    try {
      const playlist = await yesmusicApi.getPlaylistDetail(id);
      if (requestId !== this.detailRequestId || id !== this.selectedPlaylistId) return;
      this.playlistDetail = playlist;
    } catch (error) {
      if (requestId !== this.detailRequestId) return;
      this.playlistError = error instanceof Error ? error.message : "歌单详情读取失败，请重试。";
      if (error instanceof NeteaseApiError && error.status === 401) {
        window.dispatchEvent(new CustomEvent("yesmusic-auth-invalid", { detail: { message: this.playlistError } }));
      }
    } finally {
      if (requestId === this.detailRequestId) {
        this.playlistDetailLoading = false;
        this.renderRightDrawer();
      }
    }
  }
  private async mutatePlaylist(op: "add" | "del", playlistId: string, trackId: string, trackName: string) {
    if (this.mutationBusy) return;
    this.mutationBusy = true;
    const pendingMessage = op === "add" ? "正在将曲目加入歌单…" : "正在从歌单移除曲目…";
    this.playlistDrawerNotice = pendingMessage;
    this.onlineSearchNotice = pendingMessage;
    this.playerActionNotice = pendingMessage;
    this.renderRightDrawer();
    this.renderDjPlayer();
    try {
      await yesmusicApi.updatePlaylistTracks(op, playlistId, [trackId]);
      const successMessage = op === "add" ? `已将「${trackName}」加入歌单。` : `已从歌单移除「${trackName}」。`;
      this.playlistDrawerNotice = successMessage;
      this.onlineSearchNotice = successMessage;
      this.playerActionNotice = successMessage;
      await this.refreshPlaylists();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "歌单修改失败，请重试。";
      this.playlistDrawerNotice = errorMessage;
      this.onlineSearchNotice = errorMessage;
      this.playerActionNotice = errorMessage;
    } finally {
      this.mutationBusy = false;
      this.renderRightDrawer();
      this.renderDjPlayer();
    }
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
    if (!this.playlistDetailOpen) {
      const listContent = !this.accountUserId
        ? `<div class="wb-playlist-empty"><strong>网易云账号未登录</strong><small>登录并验证账号后，这里会显示真实云端歌单。</small><button data-dj-action="account-open">前往登录</button></div>`
        : this.playlistsLoading
          ? `<div class="wb-playlist-empty" role="status">正在读取云端歌单…</div>`
          : this.playlistError
            ? `<div class="wb-playlist-empty" role="alert"><strong>歌单读取失败</strong><small>${escapeHtml(this.playlistError)}</small><button data-dj-action="playlist-refresh">重试</button></div>`
            : !this.playlists.length
              ? `<div class="wb-playlist-empty"><strong>账号中没有云端歌单</strong><small>新建一个歌单后即可开始管理。</small></div>`
              : `<div class="wb-playlist-grid" id="dj-playlist-cards"></div>`;
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
        <div class="wb-playlist-list-heading"><span>PLAYLIST COLLECTION</span><span>${this.accountUserId ? `${String(this.playlists.length).padStart(2, "0")} / CLOUD` : "ACCOUNT REQUIRED"}</span></div>
        ${listContent}
        ${this.renderPlaylistExportBanner()}
        ${this.playlistCreateOpen ? `<form class="wb-playlist-create-form"><label for="dj-playlist-name">新歌单名称</label><input id="dj-playlist-name" maxlength="36" autocomplete="off" placeholder="输入歌单名称"/><div><button type="button" data-dj-action="playlist-create-cancel">取消</button><button type="button" data-dj-action="playlist-create-confirm" ${this.mutationBusy ? "disabled" : ""}>创建歌单</button></div></form>` : ""}
        ${this.playlistDrawerNotice ? `<p class="wb-playlist-notice" role="status">${escapeHtml(this.playlistDrawerNotice)}</p>` : ""}
        ${this.deleteConfirmId ? `<div class="wb-playlist-confirm-layer"><section class="wb-playlist-export-confirm" role="alertdialog" aria-modal="true" aria-labelledby="playlist-delete-title"><span class="wb-playlist-export-eyebrow">NETEASE CLOUD / DELETE</span><h3 id="playlist-delete-title">删除这份歌单？</h3><strong>${escapeHtml(this.playlists.find(item => item.id === this.deleteConfirmId)?.name ?? "")}</strong><p>删除会直接修改网易云账号中的歌单。</p><div><button data-dj-action="playlist-delete-cancel">取消</button><button data-dj-action="playlist-delete-confirm" ${this.mutationBusy ? "disabled" : ""}>确认删除</button></div></section></div>` : ""}`;
      this.renderPlaylistCards();
      return;
    }
    const playlist = this.playlistDetail ?? this.playlists.find(item => item.id === this.selectedPlaylistId);
    if (!playlist) {
      drawer.innerHTML = `<header class="wb-playlist-detail-heading"><button class="wb-playlist-back" data-dj-action="playlist-back">← <span>返回歌单列表</span></button><button class="wb-playlist-close" data-dj-action="drawer-close" aria-label="关闭歌单面板">×</button></header><div class="wb-playlist-empty">${this.playlistDetailLoading ? "正在读取歌单详情…" : escapeHtml(this.playlistError || "选择一个歌单以查看详情。")}${this.playlistError ? `<button data-dj-action="playlist-detail-refresh">重新读取</button>` : ""}</div></div>`;
      return;
    }
    const tracks = playlist.tracks ?? [];
    const trackRows = this.playlistDetailLoading
      ? `<div class="wb-playlist-empty" role="status">正在读取曲目…</div>`
      : tracks.map((track, rowIndex) => `<div class="wb-playlist-track-row"><span class="wb-playlist-track-no">${String(rowIndex + 1).padStart(2, "0")}</span><div class="wb-playlist-track-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artists.join(" / ") || "未知艺人")} · ${escapeHtml(track.album)}</small></div><time>${track.durationMs ? durationText(track.durationMs) : "—:——"}</time><div class="wb-playlist-track-actions"><button data-dj-action="playlist-track-play" data-track-id="${escapeHtml(track.id)}" aria-label="播放 ${escapeHtml(track.title)}">▶</button><button data-dj-action="playlist-track-add" data-track-id="${escapeHtml(track.id)}" aria-label="将 ${escapeHtml(track.title)} 加入其他歌单">＋</button><button data-dj-action="playlist-track-remove" data-track-id="${escapeHtml(track.id)}" data-track-name="${escapeHtml(track.title)}" aria-label="从歌单移除 ${escapeHtml(track.title)}" ${this.mutationBusy ? "disabled" : ""}>−</button></div></div>`).join("") || `<div class="wb-playlist-empty">此歌单当前没有可显示的曲目。</div>`;
    drawer.innerHTML = `
      <header class="wb-playlist-detail-heading">
        <button class="wb-playlist-back" data-dj-action="playlist-back">← <span>返回歌单列表</span></button>
        <button class="wb-playlist-close" data-dj-action="drawer-close" aria-label="关闭歌单面板">×</button>
      </header>
      <div class="wb-playlist-detail-scroll">
        <div class="wb-playlist-detail-hero">
          <div class="wb-playlist-detail-cover">${playlist.coverUrl ? `<img src="${escapeHtml(playlist.coverUrl)}" alt="${escapeHtml(playlist.name)} 封面"/>` : `<span class="wb-playlist-no-cover">NO COVER</span>`}<span>${escapeHtml(`YM-${playlist.id.slice(-3).padStart(3, "0")}`)}</span><strong>PLAYLIST</strong><button class="wb-playlist-cover-play" data-dj-action="playlist-play-all" aria-label="播放当前歌单" ${tracks.length ? "" : "disabled"}>▶</button></div>
          <div class="wb-playlist-detail-meta"><span class="wb-playlist-eyebrow">SELECTED PLAYLIST / 歌单档案</span><h2 id="dj-playlist-title">${escapeHtml(playlist.name)}</h2><p>网易云音乐 · ${escapeHtml(this.accountUserId)}</p><div class="wb-playlist-metrics"><span><strong>${playlist.trackCount}</strong><small>TRACKS</small></span><span><strong>${tracks.length || "—"}</strong><small>LOADED</small></span><span><strong>CLOUD</strong><small>SOURCE</small></span></div><div class="wb-playlist-detail-actions"><button data-dj-action="playlist-play-all" ${tracks.length ? "" : "disabled"}>▶ 全部播放</button><button data-dj-action="playlist-export" ${this.playlistsLoading || this.playlistDetailLoading || this.playlistExportState?.phase === "running" || !this.accountUserId ? "disabled" : ""} aria-label="导出歌单 ${escapeHtml(playlist.name)}">${this.playlistExportState?.phase === "done" || this.playlistExportState?.phase === "error" ? "↻ 再次导出" : "↓ 导出歌单"}</button></div></div>
        </div>
        ${this.renderPlaylistExportBanner()}
        <div class="wb-playlist-track-heading"><span>TRACKLIST / 曲目列表</span><span>PLAY · ADD · REMOVE</span></div>
        <div class="wb-playlist-track-list">${trackRows}</div>
        ${this.playlistDrawerNotice ? `<p class="wb-playlist-notice" role="status">${escapeHtml(this.playlistDrawerNotice)}</p>` : ""}
      </div>
      ${this.pendingTrack && !this.playerPickerOpen ? this.renderTrackAddConfirmation() : ""}
      ${this.playlistExportConfirm ? this.renderPlaylistExportConfirmation(playlist) : ""}`;
  }
  private renderPlaylistExportBanner() {
    const state = this.playlistExportState;
    if (!state || state.phase === "confirm") return "";
    if (!this.accountUserId || this.playlistExportSnapshot?.accountUserId !== this.accountUserId) return "";
    const status = state.phase === "running" ? "正在导出" : state.phase === "done" ? state.failed ? "部分完成" : "导出完成" : "导出中断 / 结果未完整确认";
    const action = this.rightDrawerMode === "playlist" && !this.playlistDetailOpen && this.selectedPlaylistId === state.playlistId
      ? `<button data-dj-action="playlist-export-return">查看歌单详情 ↗</button>` : "";
    return `<section id="dj-playlist-export-status" class="wb-playlist-export-progress" aria-live="polite"><div class="wb-playlist-export-progress-head"><span><small>PLAYLIST EXPORT / 歌单导出</small><strong>${escapeHtml(state.name)} · ${status}</strong></span><span>${Math.round(state.overallPercent)}%</span>${action}</div><div class="wb-playlist-export-progress-track" role="progressbar" aria-label="歌单导出进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(state.overallPercent)}"><i style="width:${Math.round(state.overallPercent)}%"></i></div><div class="wb-playlist-export-progress-meta"><span>${state.completed} / ${state.total} 首</span><span>成功 ${state.success} · 失败 ${state.failed}</span><span>${escapeHtml(state.stage)}</span></div>${state.currentTrack ? `<small class="wb-playlist-export-current">${escapeHtml(state.currentTrack)}</small>` : ""}${state.message ? `<p role="status">${escapeHtml(state.message)}</p>` : ""}</section>`;
  }
  private renderPlaylistExportConfirmation(playlist: NeteasePlaylist) {
    return `<div class="wb-playlist-confirm-layer"><section class="wb-playlist-export-confirm" role="dialog" aria-modal="true" aria-labelledby="playlist-export-title"><span class="wb-playlist-export-eyebrow">NETEASE CLOUD / EXPORT</span><h3 id="playlist-export-title">确认导出歌单？</h3><strong>${escapeHtml(playlist.name)}</strong><p>将从网易云读取完整曲目并导出到所选目录。确认前不会发起导出或写入文件；开始后可关闭此面板，任务会继续。</p><label class="wb-playlist-export-target">目标目录<code>${escapeHtml(this.outputRoot)}</code></label>${this.playlistDrawerNotice ? `<p class="wb-playlist-notice" role="status">${escapeHtml(this.playlistDrawerNotice)}</p>` : ""}<div><button data-dj-action="playlist-export-cancel">取消</button><button data-dj-action="playlist-export-confirm" ${this.mutationBusy ? "disabled" : ""}>确认导出</button></div></section></div>`;
  }
  private renderPlaylistCards() {
    const container = this.root.querySelector<HTMLElement>("#dj-playlist-cards");
    if (!container || !this.rightDrawerOpen || this.rightDrawerMode !== "playlist" || this.playlistDetailOpen) return;
    const matching = this.playlists.filter(playlist => playlist.name.toLocaleLowerCase().includes(this.playlistSearchQuery));
    container.innerHTML = matching.length ? matching.map(playlist => `
      <article class="wb-playlist-card">
        <button class="wb-playlist-card-open" data-dj-action="playlist-open" data-id="${escapeHtml(playlist.id)}" aria-label="打开歌单 ${escapeHtml(playlist.name)}">
        <span class="wb-playlist-card-cover">${playlist.coverUrl ? `<img src="${escapeHtml(playlist.coverUrl)}" alt=""/>` : `<i class="wb-playlist-no-cover">NO COVER</i>`}<i>${escapeHtml(`YM-${playlist.id.slice(-3).padStart(3, "0")}`)}</i><b>PLAYLIST</b></span>
          <strong>${escapeHtml(playlist.name)}</strong><small>${playlist.trackCount} 首曲目 · 网易云</small>
        </button>
        <div class="wb-playlist-card-actions"><button data-dj-action="playlist-card-play" data-id="${escapeHtml(playlist.id)}" aria-label="播放歌单 ${escapeHtml(playlist.name)}">▶</button><button disabled aria-label="导出将在 P3 阶段接入">↓</button>${playlist.ownerId && playlist.ownerId === this.accountUserId ? `<button data-dj-action="playlist-delete" data-id="${escapeHtml(playlist.id)}" aria-label="删除歌单 ${escapeHtml(playlist.name)}">×</button>` : ""}</div>
      </article>`).join("") : `<p class="wb-playlist-empty">未找到“${escapeHtml(this.playlistSearchQuery)}”对应的歌单。</p>`;
  }
  private renderOnlineSearchDrawer(drawer: HTMLElement) {
    drawer.innerHTML = `
      <header class="wb-playlist-heading">
        <div><span>NETEASE MUSIC / ONLINE SEARCH</span><h2 id="dj-playlist-title">在线搜索歌曲</h2><p>按歌曲、歌手或专辑检索曲库，并试听或加入歌单</p></div>
        <button class="wb-playlist-close" data-dj-action="drawer-close" aria-label="关闭搜索面板">×</button>
      </header>
      <div class="wb-playlist-tools wb-online-search-tools">
        <label class="wb-playlist-search"><span aria-hidden="true">⌕</span><input id="dj-online-search" type="search" placeholder="歌曲名、歌手名或专辑名…" aria-label="搜索歌曲、歌手或专辑" value="${escapeHtml(this.onlineSearchQuery)}"/></label>
        <button class="wb-playlist-create" data-dj-action="online-search">⌕<span>搜索</span></button>
      </div>
      <div class="wb-playlist-list-heading"><span>SEARCH RESULTS / 搜索结果</span><span id="dj-search-count"></span></div>
      <div class="wb-search-content" id="dj-search-content"></div>
      ${this.onlineSearchNotice ? `<p class="wb-playlist-notice" role="status">${escapeHtml(this.onlineSearchNotice)}</p>` : ""}`;
    this.renderOnlineSearchResults();
  }
  private renderOnlineSearchResults() {
    const content = this.root.querySelector<HTMLElement>("#dj-search-content");
    const count = this.root.querySelector<HTMLElement>("#dj-search-count");
    if (!content || !count) return;
    count.textContent = this.onlineSearchStatus === "loading" ? "正在搜索" : this.onlineSearchStatus === "error" ? "搜索失败" : this.onlineSearchStatus === "ready" ? `${String(this.onlineSearchTotal).padStart(2, "0")} / 网易云` : "等待查询";
    if (this.onlineSearchStatus === "loading") {
      content.innerHTML = `<div class="wb-search-placeholder" role="status"><span>⌕</span><strong>正在搜索网易云曲库</strong><p>正在读取真实歌曲信息…</p></div>`;
      return;
    }
    if (this.onlineSearchStatus === "error") {
      content.innerHTML = `<div class="wb-search-placeholder" role="alert"><span>!</span><strong>搜索失败</strong><p>${escapeHtml(this.onlineSearchError)}</p><button data-dj-action="online-search">重试</button></div>`;
      return;
    }
    if (this.onlineSearchStatus !== "ready") {
      content.innerHTML = `<div class="wb-search-placeholder"><span>⌕</span><strong>搜索网易云曲库</strong><p>${escapeHtml(this.onlineSearchNotice || "输入歌曲名、歌手名或专辑名后开始搜索。")}</p></div>`;
      return;
    }
    if (!this.onlineSearchResults.length) {
      content.innerHTML = `<div class="wb-playlist-empty" role="status">没有找到“${escapeHtml(this.onlineSearchQuery)}”对应的歌曲。</div>`;
      return;
    }
    const rows = this.onlineSearchResults.map((track, index) => {
      const current = this.playerState.track?.id === track.id;
      return `<tr aria-current="${current ? "true" : "false"}"><td class="wb-search-number">${String(index + 1).padStart(2, "0")}</td><td><div class="wb-search-track">${track.coverUrl ? `<img src="${escapeHtml(track.coverUrl)}" alt=""/>` : `<span class="wb-search-no-cover" aria-hidden="true">♫</span>`}<span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.album)}</small></span></div></td><td>${escapeHtml(track.artists.join(" / ") || "未知艺人")}</td><td>${escapeHtml(track.album)}</td><td class="wb-search-duration">${track.durationMs ? durationText(track.durationMs) : "—:——"}</td><td><div class="wb-search-actions"><button data-dj-action="online-track-play" data-track-id="${escapeHtml(track.id)}" aria-label="试听 ${escapeHtml(track.title)}">${current && this.playerState.status === "playing" ? "Ⅱ" : "▶"}</button><button data-dj-action="online-track-add" data-track-id="${escapeHtml(track.id)}" aria-label="将 ${escapeHtml(track.title)} 加入歌单">＋</button></div></td></tr>`;
    }).join("");
    content.innerHTML = `<div class="wb-search-table-wrap"><table class="wb-search-table"><thead><tr><th>#</th><th>歌曲</th><th>歌手</th><th>专辑</th><th>时长</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>${this.pendingTrack && !this.playerPickerOpen ? this.renderTrackAddConfirmation() : ""}`;
  }
  private renderTrackAddConfirmation(playerPicker = false) {
    if (!this.pendingTrack) return "";
    const targets = this.playlists.filter(item => !(this.rightDrawerMode === "playlist" && this.playlistDetailOpen && item.id === this.selectedPlaylistId));
    const selectId = playerPicker ? "dj-player-target" : "dj-playlist-target";
    const tracksTarget = targets.length
      ? `<label for="${selectId}">选择歌单<select id="${selectId}">${targets.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === this.targetPlaylistId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label><div><button data-dj-action="playlist-add-cancel">取消</button><button data-dj-action="${playerPicker ? "confirm-add-track" : "playlist-add-confirm"}" ${this.mutationBusy ? "disabled" : ""}>确认加入</button></div>`
      : `<p>当前没有可选歌单，请先创建一个歌单。</p><div><button data-dj-action="playlist-add-cancel">关闭</button><button data-dj-action="open-cloud-create">新建歌单</button></div>`;
    return `<div class="wb-playlist-confirm-layer"><section class="wb-playlist-export-confirm" role="dialog" aria-modal="true" aria-labelledby="playlist-add-track-title"><span class="wb-playlist-export-eyebrow">NETEASE CLOUD / PLAYLIST</span><h3 id="playlist-add-track-title">加入目标歌单</h3><strong>${escapeHtml(this.pendingTrack.title)}</strong>${tracksTarget}</section></div>`;
  }
  private async prepareTrackAdd(track: NeteaseTrack, playerPicker: boolean) {
    if (!this.accountUserId) {
      const message = "请先登录网易云账号，再将歌曲加入歌单。";
      if (playerPicker) { this.playerActionNotice = message; this.renderDjPlayer(); }
      else if (this.rightDrawerMode === "search") { this.onlineSearchNotice = message; this.renderRightDrawer(); }
      else { this.playlistDrawerNotice = message; this.renderRightDrawer(); }
      document.querySelector<HTMLButtonElement>(".dj-account-button")?.click();
      return;
    }
    if (!this.playlists.length && !this.playlistsLoading) await this.refreshPlaylists();
    const targets = this.playlists.filter(item => !(this.rightDrawerMode === "playlist" && this.playlistDetailOpen && item.id === this.selectedPlaylistId));
    if (!targets.length) {
      const message = "没有其他可加入的歌单，请先新建歌单。";
      if (playerPicker) { this.playerActionNotice = message; this.renderDjPlayer(); }
      else if (this.rightDrawerMode === "search") { this.onlineSearchNotice = message; this.renderRightDrawer(); }
      else { this.playlistDrawerNotice = message; this.renderRightDrawer(); }
      return;
    }
    this.pendingTrack = track;
    this.targetPlaylistId = targets[0].id;
    this.playerPickerOpen = playerPicker;
    if (playerPicker) this.renderDjPlayer();
    else this.renderRightDrawer();
  }
  private onPlayerState(state: DjPlayerState) {
    const previousTrackId = this.playerTrackId;
    const previousStatus = this.playerState.status;
    this.playerState = state;
    this.persistPlayerSnapshot(state);
    const trackId = state.track?.id ?? "";
    if (trackId !== previousTrackId) {
      this.playerTrackId = trackId;
      this.playerActionNotice = "";
      this.onTrackStep(state.track);
    }
    this.renderDjPlayer();
    if (this.rightDrawerOpen && this.rightDrawerMode === "search" && (trackId !== previousTrackId || state.status !== previousStatus)) this.renderOnlineSearchResults();
  }
  private restorePlayerSnapshot() {
    try {
      const saved = JSON.parse(localStorage.getItem(playerStorageKey) ?? "null");
      if (saved?.version !== 1 || !Array.isArray(saved.queue)) return;
      const queue = saved.queue.slice(0, 1000).map((item: unknown) => {
        const track = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const id = typeof track.id === "string" || typeof track.id === "number" ? String(track.id) : "";
        if (!id) return null;
        return {
          id,
          title: typeof track.title === "string" ? track.title.slice(0, 300) : "未命名曲目",
          artists: Array.isArray(track.artists) ? track.artists.filter((value: unknown): value is string => typeof value === "string").slice(0, 20) : [],
          album: typeof track.album === "string" ? track.album.slice(0, 300) : "未知专辑",
          coverUrl: typeof track.coverUrl === "string" ? track.coverUrl.slice(0, 2000) : null,
          durationMs: Number.isFinite(Number(track.durationMs)) ? Math.max(0, Number(track.durationMs)) : null,
        } satisfies NeteaseTrack;
      }).filter((track: NeteaseTrack | null): track is NeteaseTrack => Boolean(track));
      if (queue.length) this.player.restoreQueue(queue, Number(saved.index) || 0, Number(saved.currentTime) || 0, Number(saved.duration) || 0);
    } catch { /* A damaged local snapshot must not prevent the DJ workspace from loading. */ }
  }
  private persistPlayerSnapshot(state: DjPlayerState) {
    if (!isDjPrototype) return;
    const now = Date.now();
    if (state.status === "playing" && now - this.playerSnapshotWriteAt < 1000 && state.track?.id === this.playerTrackId) return;
    this.playerSnapshotWriteAt = now;
    try {
      if (!state.queue.length || state.index < 0) {
        localStorage.removeItem(playerStorageKey);
        return;
      }
      const queue = state.queue.slice(0, 1000);
      localStorage.setItem(playerStorageKey, JSON.stringify({
        version: 1,
        queue,
        index: Math.max(0, Math.min(queue.length - 1, state.index)),
        currentTime: Math.max(0, Number(state.currentTime) || 0),
        duration: Math.max(0, Number(state.duration) || 0),
        savedAt: now,
      }));
    } catch { /* Queue persistence is best effort; playback remains available. */ }
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
  private async djAction(button: HTMLButtonElement) {
    const action = button.dataset.djAction;
    if (action === "archive") { this.onLane(this.lane); this.setEnabled(false); return; }
    if (action === "track-detail") { this.onTrackOpen(); return; }
    if (action === "drawer-close") { this.closeRightDrawer(); return; }
    if (action === "account-open") { document.querySelector<HTMLButtonElement>(".dj-account-button")?.click(); return; }
    if (action === "open-cloud-playlists" || action === "open-cloud-create") {
      this.openRightDrawer(this.root.querySelector<HTMLButtonElement>('[data-wb-lane="1"]')!, "playlist");
      if (action === "open-cloud-create") {
        this.playlistCreateOpen = true;
        this.renderRightDrawer();
        requestAnimationFrame(() => this.root.querySelector<HTMLInputElement>("#dj-playlist-name")?.focus());
      }
      return;
    }
    if (action === "open-online-search") {
      this.openRightDrawer(this.root.querySelector<HTMLButtonElement>('[data-wb-lane="2"]')!, "search");
      return;
    }
    if (action === "agent-open") { this.openRightDrawer(this.root.querySelector<HTMLButtonElement>('[data-wb-lane="0"]')!, "agent"); return; }
    if (action === "playlist-open") {
      const id = button.dataset.id ?? "";
      this.playlistDetailOpen = true;
      this.playlistDrawerNotice = "";
      await this.loadPlaylistDetail(id);
      requestAnimationFrame(() => this.root.querySelector<HTMLButtonElement>("[data-dj-action='playlist-back']")?.focus({ preventScroll: true }));
      return;
    }
    if (action === "playlist-back") {
      this.playlistDetailOpen = false;
      this.playlistDetail = null;
      this.pendingTrack = null;
      this.playlistDrawerNotice = "";
      this.renderRightDrawer();
      this.root.querySelector<HTMLButtonElement>(`[data-dj-action='playlist-open'][data-id='${CSS.escape(this.selectedPlaylistId)}']`)?.focus({ preventScroll: true });
      return;
    }
    if (action === "playlist-detail-refresh") { await this.loadPlaylistDetail(this.selectedPlaylistId); return; }
    if (action === "playlist-refresh") { await this.refreshPlaylists(); return; }
    if (action === "playlist-create") {
      if (!this.accountUserId) { this.playlistDrawerNotice = "请先登录网易云账号。"; this.renderRightDrawer(); return; }
      this.playlistCreateOpen = true;
      this.playlistDrawerNotice = "";
      this.renderRightDrawer();
      this.root.querySelector<HTMLInputElement>("#dj-playlist-name")?.focus();
      return;
    }
    if (action === "playlist-create-cancel") { this.playlistCreateOpen = false; this.renderRightDrawer(); return; }
    if (action === "playlist-create-confirm") {
      const name = this.root.querySelector<HTMLInputElement>("#dj-playlist-name")?.value.trim() ?? "";
      if (!name) { this.playlistDrawerNotice = "请输入歌单名称。"; this.renderRightDrawer(); this.root.querySelector<HTMLInputElement>("#dj-playlist-name")?.focus(); return; }
      this.mutationBusy = true;
      this.playlistDrawerNotice = "正在创建歌单…";
      this.renderRightDrawer();
      try {
        await yesmusicApi.createPlaylist(name);
        this.playlistCreateOpen = false;
        this.playlistDrawerNotice = `已创建「${name}」。`;
        await this.refreshPlaylists();
      } catch (error) {
        this.playlistDrawerNotice = error instanceof Error ? error.message : "创建歌单失败，请重试。";
      } finally { this.mutationBusy = false; this.renderRightDrawer(); }
      return;
    }
    if (action === "playlist-delete") {
      this.deleteConfirmId = button.dataset.id ?? "";
      this.renderRightDrawer();
      requestAnimationFrame(() => this.root.querySelector<HTMLButtonElement>("[data-dj-action='playlist-delete-cancel']")?.focus({ preventScroll: true }));
      return;
    }
    if (action === "playlist-delete-cancel") { this.deleteConfirmId = ""; this.renderRightDrawer(); return; }
    if (action === "playlist-delete-confirm") {
      const id = this.deleteConfirmId;
      if (!id) return;
      this.mutationBusy = true;
      this.playlistDrawerNotice = "正在删除歌单…";
      this.renderRightDrawer();
      try {
        await yesmusicApi.deletePlaylist(id);
        this.deleteConfirmId = "";
        if (this.selectedPlaylistId === id) { this.playlistDetailOpen = false; this.playlistDetail = null; }
        this.playlistDrawerNotice = "歌单已从网易云删除。";
        await this.refreshPlaylists();
      } catch (error) {
        this.playlistDrawerNotice = error instanceof Error ? error.message : "删除歌单失败，请重试。";
      } finally { this.mutationBusy = false; this.renderRightDrawer(); }
      return;
    }
    if (action === "playlist-track-add") {
      const id = button.dataset.trackId ?? "";
      const track = this.playlistDetail?.tracks?.find(item => item.id === id);
      if (!track) { this.playlistDrawerNotice = "未找到该曲目，请刷新歌单后重试。"; this.renderRightDrawer(); }
      else await this.prepareTrackAdd(track, false);
      requestAnimationFrame(() => this.root.querySelector<HTMLSelectElement>("#dj-playlist-target")?.focus({ preventScroll: true }));
      return;
    }
    if (action === "playlist-track-play") {
      const tracks = this.playlistDetail?.tracks ?? [];
      const index = tracks.findIndex(track => track.id === button.dataset.trackId);
      if (index >= 0) await this.player.setQueue(tracks, index);
      return;
    }
    if (action === "playlist-play-all" || action === "playlist-card-play") {
      if (action === "playlist-card-play" && button.dataset.id) {
        this.playlistDetailOpen = true;
        await this.loadPlaylistDetail(button.dataset.id);
      }
      const tracks = this.playlistDetail?.tracks ?? [];
      if (tracks.length) {
        await this.player.setQueue(tracks);
        this.playlistDrawerNotice = this.playlistDetail!.trackCount > tracks.length
          ? `已开始播放已载入的 ${tracks.length} 首歌曲；歌单总数为 ${this.playlistDetail!.trackCount} 首。`
          : "正在播放当前歌单。";
        this.renderRightDrawer();
      } else {
        this.playlistDrawerNotice = this.playlistDetailLoading ? "正在读取曲目，请稍后重试播放。" : "此歌单没有可播放的曲目。";
        this.renderRightDrawer();
      }
      return;
    }
    if (action === "playlist-add-cancel") { this.pendingTrack = null; this.playerPickerOpen = false; this.renderRightDrawer(); this.renderDjPlayer(); return; }
    if (action === "playlist-add-confirm" || action === "confirm-add-track") {
      if (!this.pendingTrack || !this.targetPlaylistId) return;
      const track = this.pendingTrack;
      const targetId = this.targetPlaylistId;
      this.pendingTrack = null;
      this.playerPickerOpen = false;
      await this.mutatePlaylist("add", targetId, track.id, track.title);
      this.renderDjPlayer();
      return;
    }
    if (action === "playlist-track-remove") {
      const trackId = button.dataset.trackId ?? "";
      const trackName = button.dataset.trackName ?? "曲目";
      if (this.selectedPlaylistId && trackId) await this.mutatePlaylist("del", this.selectedPlaylistId, trackId, trackName);
      return;
    }
    if (action === "playlist-export") {
      if (!this.accountUserId) {
        this.playlistDrawerNotice = "请先登录并验证网易云账号。";
        this.renderRightDrawer();
        document.querySelector<HTMLButtonElement>(".dj-account-button")?.click();
        return;
      }
      if (!this.playlistDetail || this.playlistDetailLoading) {
        this.playlistDrawerNotice = "歌单详情尚未载入完成，请稍后重试。";
        this.renderRightDrawer();
        return;
      }
      if (this.playlistExportState?.phase === "running") return;
      this.playlistExportConfirm = true;
      this.playlistExportConfirmTrigger = button;
      this.playlistDrawerNotice = "";
      this.renderRightDrawer();
      requestAnimationFrame(() => this.root.querySelector<HTMLButtonElement>("[data-dj-action='playlist-export-cancel']")?.focus({ preventScroll: true }));
      return;
    }
    if (action === "playlist-export-cancel") {
      this.playlistExportConfirm = false;
      this.playlistDrawerNotice = "";
      this.renderRightDrawer();
      requestAnimationFrame(() => this.playlistExportConfirmTrigger?.focus({ preventScroll: true }));
      return;
    }
    if (action === "playlist-export-confirm") {
      const playlist = this.playlistDetail;
      const outputRoot = this.outputRoot.trim();
      if (!playlist || !outputRoot || /[\u0000-\u001f]/.test(outputRoot)) {
        this.playlistDrawerNotice = !outputRoot ? "请先在“导出根目录”设置中填写目标目录。" : "目标目录含有无效控制字符。";
        this.renderRightDrawer();
        requestAnimationFrame(() => this.root.querySelector<HTMLButtonElement>("[data-dj-action='playlist-export-cancel']")?.focus({ preventScroll: true }));
        return;
      }
      this.playlistExportConfirm = false;
      const jobId = globalThis.crypto?.randomUUID?.() ?? `dj-export-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      const initialState = createPlaylistExportState(playlist, "running");
      this.playlistExportSnapshot = {
        version: 1,
        jobId,
        accountUserId: this.accountUserId,
        outputRoot,
        playlist: { id: playlist.id, name: playlist.name, coverUrl: playlist.coverUrl, trackCount: playlist.trackCount },
        state: initialState,
      };
      this.playlistExportState = initialState;
      this.persistPlaylistExportSnapshot();
      this.stage.dataset.playlistExporting = "true";
      this.renderRightDrawer();
      const onState = (state: PlaylistExportState) => this.setPlaylistExportState(state);
      try { await this.onPlaylistExport(playlist, outputRoot, onState, jobId, false, initialState); }
      catch (error) { this.setPlaylistExportState(failPlaylistExport(this.playlistExportState, error)); }
      return;
    }
    if (action === "playlist-export-return") {
      const id = this.playlistExportState?.playlistId;
      if (id) {
        this.playlistDetailOpen = true;
        await this.loadPlaylistDetail(id);
      }
      return;
    }
    if (action === "online-track-play") {
      const index = this.onlineSearchResults.findIndex(track => track.id === button.dataset.trackId);
      if (index >= 0) await this.player.setQueue(this.onlineSearchResults, index);
      return;
    }
    if (action === "online-track-add") {
      const track = this.onlineSearchResults.find(item => item.id === button.dataset.trackId);
      if (track) await this.prepareTrackAdd(track, false);
      return;
    }
    if (action === "player-toggle") { await this.player.toggle(); return; }
    if (action === "player-next") { await this.player.next(); return; }
    if (action === "player-previous") { await this.player.previous(); return; }
    if (action === "player-add") {
      if (this.playerState.track) await this.prepareTrackAdd(this.playerState.track, true);
      return;
    }
    if (action === "download-track") {
      const track = this.playerState.track;
      if (!track || this.singleTrackExportBusy) return;
      if (!this.accountUserId) {
        this.playerActionNotice = "请先登录网易云账号，再下载歌曲。";
        this.syncDjPlayerUi();
        document.querySelector<HTMLButtonElement>(".dj-account-button")?.click();
        return;
      }
      if (!this.outputRoot.trim()) {
        this.playerActionNotice = "请先在“导出根目录”设置中填写目标目录。";
        this.syncDjPlayerUi();
        return;
      }
      this.singleTrackExportBusy = true;
      this.playerActionNotice = `正在下载「${track.title}」…`;
      this.renderDjPlayer();
      try {
        const result = await yesmusicApi.exportSong(track.id, this.outputRoot);
        this.playerActionNotice = `已导出「${track.title}」：${result.filePath || result.fileName}`;
      } catch (error) {
        this.playerActionNotice = error instanceof Error ? error.message : "单曲下载失败，请重试。";
      } finally {
        this.singleTrackExportBusy = false;
        this.renderDjPlayer();
      }
      return;
    }
    if (action === "online-search") {
      this.onlineSearchQuery = this.root.querySelector<HTMLInputElement>("#dj-online-search")?.value.trim().slice(0, 80) ?? "";
      this.onlineSearchSubmitted = Boolean(this.onlineSearchQuery);
      this.onlineSearchNotice = "";
      this.onlineSearchError = "";
      this.onlineSearchResults = [];
      this.onlineSearchTotal = 0;
      this.onlineSearchAbort?.abort();
      const requestId = ++this.onlineSearchRequestId;
      if (!this.onlineSearchQuery) {
        this.onlineSearchStatus = "idle";
        this.onlineSearchNotice = "请输入歌曲名、歌手名或专辑名。";
      } else {
        const controller = new AbortController();
        this.onlineSearchAbort = controller;
        this.onlineSearchStatus = "loading";
        this.renderOnlineSearchResults();
        try {
          const result = await yesmusicApi.searchSongs(this.onlineSearchQuery, controller.signal);
          if (requestId !== this.onlineSearchRequestId) return;
          this.onlineSearchResults = result.songs;
          this.onlineSearchTotal = result.total;
          this.onlineSearchStatus = "ready";
        } catch (error) {
          if (requestId !== this.onlineSearchRequestId || (error instanceof DOMException && error.name === "AbortError")) return;
          this.onlineSearchStatus = "error";
          this.onlineSearchError = error instanceof Error ? error.message : "搜索失败，请重试。";
        }
      }
      this.renderOnlineSearchResults();
      this.root.querySelector<HTMLInputElement>("#dj-online-search")?.focus({ preventScroll: true });
      return;
    }
    if (action === "online-track-add" || action === "online-cancel-add" || action === "online-confirm-add") return;
    if (action === "preview") { this.playerNotice = "选择真实曲目后即可使用播放器。"; this.renderDjPlayer(); return; }
    if (action === "search") {
      this.searchQuery = this.root.querySelector<HTMLInputElement>("#dj-search")?.value.trim().slice(0, 80) ?? "";
      this.renderPanel();
      return;
    }
    if (action === "save-root") {
      this.outputRoot = this.root.querySelector<HTMLInputElement>("#dj-output-root")?.value.trim().slice(0, 500) ?? "";
      this.persistOutputRoot();
      this.renderPanel();
    }
    if (action === "browse-root") {
      if (!window.electronAPI?.selectDirectory) {
        this.djNotice = "浏览器无法打开本机目录选择器，请手动填写完整的本地路径。";
        this.renderPanel();
        return;
      }
      try {
        const selected = await window.electronAPI.selectDirectory();
        if (selected) {
          this.outputRoot = selected.slice(0, 500);
          this.persistOutputRoot();
        } else this.djNotice = "未更改导出目录。";
      } catch (error) {
        this.djNotice = error instanceof Error ? error.message : "目录选择失败，请手动填写路径。";
      }
      this.renderPanel();
    }
  }
  private renderDjPanel() {
    let html = "";
    if (this.lane === 0) html = `<div class="wb-dj-thread"><small>1001TRACKLISTS / CAMELOT / NETEASE</small><p>从现场 Setlist 到选曲与调性衔接，在 Agent 会话中准备下一场演出。</p></div><button class="wb-dj-link" data-dj-action="agent-open">打开 AI DJ 助手 <span>↗</span></button>`;
    if (this.lane === 1) {
      const playlistSummary = this.accountUserId
        ? `<div class="wb-large">${String(this.playlists.length).padStart(2, "0")}<small>云端歌单</small></div><p class="wb-muted">当前账户已验证，歌单名称、曲目和封面来自网易云接口。</p>`
        : `<div class="wb-large">—<small>网易云账户</small></div><p class="wb-muted">登录后读取真实云端歌单。</p>`;
      html = `${playlistSummary}<div class="wb-dj-controls"><button data-dj-action="open-cloud-playlists">浏览云端歌单 ↗</button><button data-dj-action="open-cloud-create">新建歌单 ＋</button></div>${this.djNotice ? `<p class="wb-muted" role="status">${escapeHtml(this.djNotice)}</p>` : ""}`;
    }
    if (this.lane === 2) html = `<div class="wb-dj-search"><p class="wb-muted">在线搜索歌曲入口。打开右侧搜索面板后可检索网易云曲库。</p><button data-dj-action="open-online-search">打开在线搜索 ↗</button></div>`;
    if (this.lane === 3) html = `<div class="wb-dj-root"><label for="dj-output-root">目标根路径 / OUTPUT ROOT</label><div><input id="dj-output-root" type="text" value="${escapeHtml(this.outputRoot)}" aria-label="导出根目录"/><button data-dj-action="browse-root">浏览目录…</button></div><p class="wb-muted">原版导出歌单时会在此目录下建立独立文件夹，并输出音频文件。</p><button class="wb-dj-link" data-dj-action="save-root">保存路径预览 <span>↗</span></button>${this.djNotice ? `<p class="wb-muted" role="status">${escapeHtml(this.djNotice)}</p>` : ""}</div>`;
    patchRollingPanel(this.root.querySelector<HTMLElement>(".wb-content")!, html, !this.stage.classList.contains("reduce-motion"));
    this.root.querySelector(".wb-storage")!.textContent = "";
  }
  setPlaylistExportState(state: PlaylistExportState) {
    this.playlistExportState = state;
    if (this.playlistExportSnapshot) {
      this.playlistExportSnapshot = { ...this.playlistExportSnapshot, state };
      this.persistPlaylistExportSnapshot();
    }
    this.stage.dataset.playlistExporting = "true";
    if (state.phase === "done" || state.phase === "error") this.stage.dataset.playlistExportComplete = "true";
    else delete this.stage.dataset.playlistExportComplete;
    const current = this.root.querySelector<HTMLElement>("#dj-playlist-export-status");
    if (current) current.outerHTML = this.renderPlaylistExportBanner();
    else if (this.rightDrawerOpen && this.rightDrawerMode === "playlist") this.renderRightDrawer();
  }
  private restorePlaylistExportSnapshot() {
    try {
      const raw = localStorage.getItem(playlistExportStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<PersistedPlaylistExport>;
      const state = saved.state;
      const playlist = saved.playlist;
      if (saved.version !== 1 || typeof saved.jobId !== "string" || !saved.jobId || typeof saved.accountUserId !== "string" || !saved.accountUserId || typeof saved.outputRoot !== "string" || !playlist || typeof playlist.id !== "string" || typeof playlist.name !== "string" || !state || !["running", "done", "error"].includes(state.phase)) return;
      this.playlistExportSnapshot = {
        version: 1,
        jobId: saved.jobId.slice(0, 80),
        accountUserId: saved.accountUserId.slice(0, 80),
        outputRoot: saved.outputRoot.slice(0, 500),
        playlist: { id: playlist.id.slice(0, 80), name: playlist.name.slice(0, 200), coverUrl: playlist.coverUrl || null, trackCount: Math.max(0, Number(playlist.trackCount) || 0) },
        state: { ...state, finishedTrackKeys: Array.isArray(state.finishedTrackKeys) ? state.finishedTrackKeys.filter((value): value is string => typeof value === "string").slice(-2000) : [] },
      };
      this.playlistExportState = this.playlistExportSnapshot.state.phase === "running"
        ? { ...this.playlistExportSnapshot.state, message: "正在重新连接导出任务并核对实时状态。" }
        : this.playlistExportSnapshot.state;
      this.selectedPlaylistId = this.playlistExportSnapshot.playlist.id;
      this.stage.dataset.playlistExporting = "true";
      if (this.playlistExportState.phase === "done" || this.playlistExportState.phase === "error") this.stage.dataset.playlistExportComplete = "true";
      this.onRestorePlaylistExport(this.playlistExportState);
    } catch { this.playlistExportSnapshot = null; }
  }
  private persistPlaylistExportSnapshot() {
    if (!this.playlistExportSnapshot || !this.playlistExportState) return;
    try {
      localStorage.setItem(playlistExportStorageKey, JSON.stringify({ ...this.playlistExportSnapshot, state: this.playlistExportState }));
    } catch {
      const status = this.root.querySelector<HTMLElement>(".wb-storage");
      if (status) status.textContent = "导出状态无法保存到本机；刷新后可能无法恢复任务进度。";
    }
  }
  private resumePlaylistExportForAccount(userId: string) {
    const saved = this.playlistExportSnapshot;
    if (!saved || saved.accountUserId !== userId || saved.state.phase !== "running" || this.exportResumeInFlight) return;
    this.exportResumeInFlight = true;
    this.playlistExportState = { ...saved.state, stage: "正在重新连接导出任务", message: "页面已恢复，正在从服务端核对导出状态。" };
    const initialState = this.playlistExportState;
    this.stage.dataset.playlistExporting = "true";
    delete this.stage.dataset.playlistExportComplete;
    const onState = (state: PlaylistExportState) => this.setPlaylistExportState(state);
    void Promise.resolve(this.onPlaylistExport(saved.playlist, saved.outputRoot, onState, saved.jobId, true, initialState))
      .catch(error => { if (this.playlistExportState) this.setPlaylistExportState(failPlaylistExport(this.playlistExportState, error)); })
      .finally(() => { this.exportResumeInFlight = false; });
  }
  private persistOutputRoot() {
    if (!this.outputRoot) {
      this.djNotice = "请输入目标根目录。";
      return;
    }
    if (/[\u0000-\u001f]/.test(this.outputRoot)) {
      this.djNotice = "目标目录含有无效控制字符。";
      return;
    }
    try {
      localStorage.setItem("yesmusic-output-root-v1", this.outputRoot);
      this.djNotice = `已保存导出目录：${this.outputRoot}`;
    } catch {
      this.djNotice = "当前无法保存目录设置，请检查本机存储权限。";
    }
  }
  private renderDjPlayer() {
    if (!isDjPrototype) return;
    const player = this.root.querySelector<HTMLElement>(".wb-dj-player")!;
    const track = this.playerState.track;
    const renderKey = `${track?.id ?? "empty"}:${String(this.playerPickerOpen)}:${String(this.singleTrackExportBusy)}`;
    if (renderKey !== this.renderedPlayerKey) {
      this.renderedPlayerKey = renderKey;
      const actions = track
        ? `<button data-dj-action="download-track" ${this.singleTrackExportBusy ? "disabled" : ""}>${this.singleTrackExportBusy ? "↻ 下载中…" : "↓ 下载"}</button><button data-dj-action="player-add">＋ 加入歌单</button>`
        : `<button disabled>↓ 下载</button><button disabled>＋ 加入歌单</button>`;
      player.innerHTML = `
        <div class="wb-kicker">NOW PLAYING / PLAYER <span id="dj-player-status"></span></div>
        ${track ? `<button class="wb-dj-player-open" data-dj-action="track-detail" aria-label="打开 ${escapeHtml(track.title)} 的 3D 歌曲档案"><span class="wb-dj-player-cover">${track.coverUrl ? `<img src="${escapeHtml(track.coverUrl)}" alt="${escapeHtml(track.title)} 封面"/>` : `<i aria-hidden="true">♫</i>`}</span><span class="wb-dj-player-info"><small>NETEASE MUSIC / NOW PLAYING</small><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artists.join(" / ") || "未知艺人")} · ${escapeHtml(track.album)}</span><i class="wb-dj-open-hint">打开歌曲 3D 档案 ↗</i></span></button>` : `<div class="wb-playlist-empty wb-player-empty"><strong>尚未选择曲目</strong><small>从云端歌单或在线搜索中选择歌曲后，播放器会显示真实封面与播放进度。</small></div>`}
        <div class="wb-dj-progress"><input id="dj-player-seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="歌曲播放进度" disabled/><div><span id="dj-player-current">00:00</span><span id="dj-player-duration">00:00</span></div></div>
        <div class="wb-dj-player-foot"><span>PLAYBACK CONTROLS</span><div class="wb-dj-transport"><button data-dj-action="player-previous" ${track ? "" : "disabled"} aria-label="上一首">⏮</button><button class="wb-dj-play-toggle" data-dj-action="player-toggle" ${track ? "" : "disabled"} aria-label="播放">▶</button><button data-dj-action="player-next" ${track ? "" : "disabled"} aria-label="下一首">⏭</button></div></div>
        <div class="wb-dj-player-actions">${actions}</div>
        ${this.playerPickerOpen && this.pendingTrack ? this.renderTrackAddConfirmation(true) : ""}
        <p id="dj-player-error" class="wb-muted wb-dj-player-notice" role="status" hidden></p>`;
    }
    this.syncDjPlayerUi();
  }
  private syncDjPlayerUi() {
    if (!isDjPrototype) return;
    const state = this.playerState;
    const labels: Record<string, string> = { idle: "WAITING FOR TRACK", loading: "正在载入音源…", playing: "正在播放", paused: "已暂停", error: "播放失败" };
    const status = this.root.querySelector<HTMLElement>("#dj-player-status");
    if (status) status.textContent = labels[state.status] ?? "";
    const toggle = this.root.querySelector<HTMLButtonElement>('[data-dj-action="player-toggle"]');
    if (toggle) { toggle.textContent = state.status === "playing" ? "Ⅱ" : "▶"; toggle.setAttribute("aria-label", state.status === "playing" ? "暂停" : "播放"); }
    const seek = this.root.querySelector<HTMLInputElement>("#dj-player-seek");
    if (seek) {
      const duration = Math.max(0, state.duration);
      seek.max = String(duration);
      seek.disabled = !state.track || !duration;
      if (!this.seekingPlayer) seek.value = String(Math.min(duration, Math.max(0, state.currentTime)));
      seek.style.setProperty("--seek-progress", `${duration ? Math.min(100, Math.max(0, state.currentTime / duration * 100)) : 0}%`);
      seek.setAttribute("aria-valuetext", `${durationText(state.currentTime * 1000)} / ${durationText(duration * 1000)}`);
    }
    const current = this.root.querySelector<HTMLElement>("#dj-player-current");
    const duration = this.root.querySelector<HTMLElement>("#dj-player-duration");
    if (current) current.textContent = durationText(state.currentTime * 1000);
    if (duration) duration.textContent = durationText(state.duration * 1000);
    const error = this.root.querySelector<HTMLElement>("#dj-player-error");
    const message = this.playerActionNotice || state.error;
    if (error) { error.textContent = message; error.hidden = !message; }
  }
}
