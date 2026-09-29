import { escapeHtml as h } from "./html";
import { getNeteaseCookie, type NeteaseTrack } from "./yesmusic-api";
import { djAgentApi, type AgentEvent, type AgentMessage, type AgentSession } from "./dj-agent-api";
import "./dj-agent.css";

type Session = AgentSession & { draft: string };
type Config = { url: string; model: string; effort: string; temperature: number; apiKey: string };
type AgentRun = { controller: AbortController; content: string; reasoning: string; events: AgentEvent[]; card: Record<string, unknown> | null; status: string; stopping: boolean };
type Actions = { openSearch: () => void; openPlaylists: () => void; openAccount: () => void; playTracks: (tracks: NeteaseTrack[], index: number) => void | Promise<void>; addTrack: (track: NeteaseTrack) => void | Promise<void> };
const storageKey = "yesmusic-dj-agent-ui-v1";
const defaults: Config = { url: "https://api.deepseek.com", model: "deepseek-v4-flash", effort: "high", temperature: .7, apiKey: "" };
const efforts = [["off", "关闭"], ["low", "低"], ["medium", "中"], ["high", "高"]];
const prompts = [
  ["01", "解析现场 / Setlist", "粘贴 1001Tracklists 链接或曲目表", "我想解析一份 1001Tracklists 现场 Setlist，请先告诉我需要提供哪些信息。"],
  ["02", "Melodic Techno", "为旋律与能量安排一条完整路线", "帮我编排一套 Melodic Techno 风格的 DJ Set。"],
  ["03", "Tech House", "从暖场过渡到舞池的中心", "帮我编排一套 Tech House 风格的 DJ Set。"],
  ["04", "Camelot 调性衔接", "以 126 BPM · 8A 为起点", "推荐适合接在 126 BPM 8A 后的 Camelot 调性与混音方案。"],
  ["05", "128 BPM 峰值时段", "为 Peak Time 选择高能量曲目", "做一张适合 128 BPM 峰值时段的 Bass House 歌单。"],
];
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asText = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
const safeHttpUrl = (value: unknown) => { try { const url = new URL(asText(value)); return url.protocol === "http:" || url.protocol === "https:" ? url.href : ""; } catch { return ""; } };
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
const toTrack = (value: unknown): NeteaseTrack | null => {
  const item = asObject(value), id = asText(item.id ?? item.songId), title = asText(item.title ?? item.name);
  if (!/^\d+$/.test(id) || !title) return null;
  const artists = Array.isArray(item.artists) ? item.artists.map(x => typeof x === "string" ? x : asText(asObject(x).name)).filter(Boolean) : asText(item.artist).split(/\s*[,/|]\s*/).filter(Boolean);
  const durationMs = Number(item.durationMs ?? item.duration);
  return { id, title, artists, album: asText(item.album) || "未知专辑", coverUrl: safeHttpUrl(item.coverUrl) || null, durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null };
};

export class DjAgentPanel {
  private host: HTMLElement | null = null;
  private sessions: Session[] = [];
  private activeId = "";
  private messages = new Map<string, AgentMessage[]>();
  private runs = new Map<string, AgentRun>();
  private drafts = new Map<string, string>();
  private notices = new Map<string, string>();
  private cards = new Map<string, NeteaseTrack[]>();
  private sidebarOpen = window.innerWidth > 700;
  private config = { ...defaults };
  private settingsDraft = { ...defaults };
  private pendingApiKey = "";
  private clearApiKey = false;
  private settingsOpen = false;
  private renameId = "";
  private deleteId = "";
  private notice = "";
  private storageOK = true;
  private initializing = true;
  private initialized = false;
  private startupError = "";
  private busyAction = false;
  private testController?: AbortController;

  constructor(private actions: Actions) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (typeof saved?.activeId === "string") this.activeId = saved.activeId;
      if (typeof saved?.sidebarOpen === "boolean") this.sidebarOpen = saved.sidebarOpen;
      const cfg = saved?.config;
      if (cfg && typeof cfg.url === "string" && typeof cfg.model === "string" && efforts.some(([value]) => value === cfg.effort) && Number.isFinite(cfg.temperature)) {
        this.config = { ...defaults, url: cfg.url, model: cfg.model, effort: cfg.effort, temperature: Math.max(0, Math.min(1.5, cfg.temperature)) };
      }
    } catch { this.storageOK = false; }
  }
  private get session() { return this.sessions.find(s => s.id === this.activeId); }
  private persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ activeId: this.activeId, config: { url: this.config.url, model: this.config.model, effort: this.config.effort, temperature: this.config.temperature }, sidebarOpen: this.sidebarOpen }));
      this.storageOK = true;
    } catch { this.storageOK = false; }
  }
  mount(host: HTMLElement) { this.host = host; this.render(); if (!this.initialized && !this.busyAction) void this.initialize(); }
  unmount() {
    if (!this.host) return;
    this.persist(); this.host = null; this.settingsOpen = false; this.renameId = ""; this.deleteId = "";
  }
  private focus(selector: string) { this.host?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }); }
  private get draft() { return this.drafts.get(this.activeId) ?? ""; }
  private async initialize() {
    this.busyAction = true; this.initializing = true; this.startupError = ""; this.render();
    try {
      this.sessions = (await djAgentApi.listSessions()).map(item => ({ ...item, draft: "" }));
      if (!this.sessions.length) this.sessions = [{ ...await djAgentApi.createSession(), draft: "" }];
      this.activeId = this.sessions.some(item => item.id === this.activeId) ? this.activeId : this.sessions[0].id;
      this.persist();
      await this.loadSession(this.activeId, false);
      this.initialized = true;
    } catch (error) { this.startupError = error instanceof Error ? error.message : "无法连接 Agent 会话服务。"; }
    finally { this.busyAction = false; this.initializing = false; this.render(); }
  }
  private async refreshSessions() {
    const activeId = this.activeId;
    this.sessions = (await djAgentApi.listSessions()).map(item => ({ ...item, draft: this.drafts.get(item.id) ?? "" }));
    if (!this.sessions.some(item => item.id === activeId)) this.activeId = this.sessions[0]?.id ?? "";
    this.persist();
  }
  private async loadSession(id: string, renderOnFinish = true) {
    const result = await djAgentApi.getSession(id);
    const index = this.sessions.findIndex(item => item.id === id);
    if (index >= 0) this.sessions[index] = { ...this.sessions[index], ...result.session, draft: this.drafts.get(id) ?? "" };
    this.messages.set(id, result.messages);
    if (renderOnFinish && this.activeId === id && !this.settingsOpen) this.render();
  }
  private render(scrollToEnd = false) {
    if (!this.host) return;
    const input = this.host.querySelector<HTMLTextAreaElement>("#dj-agent-input");
    const selection = input && document.activeElement === input ? [input.selectionStart, input.selectionEnd] : null;
    const closeFocused = document.activeElement === this.host.querySelector("[data-dj-action='drawer-close']");
    const scroll = this.host.querySelector<HTMLElement>(".wb-agent-messages")?.scrollTop ?? 0;
    this.host.innerHTML = `<div class="wb-agent-panel">${this.settingsOpen ? this.settingsView() : this.chatView()}</div>`;
    const panel = this.host.querySelector<HTMLElement>(".wb-agent-panel")!;
    panel.addEventListener("click", event => {
      const button = (event.target as Element).closest<HTMLButtonElement>("[data-agent-action]");
      if (button) { event.stopPropagation(); void this.act(button); }
    });
    panel.addEventListener("input", event => {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement && target.id === "dj-agent-input") {
        this.drafts.set(this.activeId, target.value);
        if (this.session) this.session.draft = target.value;
      }
      if (target instanceof HTMLInputElement && target.dataset.agentConfig) {
        if (target.dataset.agentConfig === "temperature") {
          this.settingsDraft.temperature = Number(target.value);
          panel.querySelector("#dj-agent-temp-value")!.textContent = target.value;
        } else if (target.dataset.agentConfig === "url") this.settingsDraft.url = target.value;
        else if (target.dataset.agentConfig === "model") this.settingsDraft.model = target.value;
        else if (target.dataset.agentConfig === "apiKey") this.pendingApiKey = target.value;
      }
    });
    panel.addEventListener("change", event => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement)) return;
      if (select.dataset.agentConfig === "effort") { this.settingsDraft.effort = select.value; return; }
      if (!select.dataset.agentSelect) return;
      if (select.dataset.agentSelect === "model") this.config.model = select.value;
      if (select.dataset.agentSelect === "effort") this.config.effort = select.value;
      this.persist();
      const summary = panel.querySelector<HTMLElement>(".wb-agent-model summary");
      if (summary) summary.textContent = `${this.config.model} / ${efforts.find(([value]) => value === this.config.effort)?.[1]} ▴`;
    });
    panel.addEventListener("keydown", event => {
      if (event.isComposing) { event.stopPropagation(); return; }
      const target = event.target;
      if (event.key === "Escape") {
        if (this.settingsOpen) { event.preventDefault(); event.stopPropagation(); this.settingsOpen = false; this.notice = ""; this.render(); this.focus('[data-agent-action="settings"]'); }
        else if (this.renameId || this.deleteId) { event.preventDefault(); event.stopPropagation(); this.renameId = ""; this.deleteId = ""; this.render(); this.focus('[data-agent-action="toggle-sidebar"]'); }
        else if (panel.querySelector(".wb-agent-model[open]")) { event.preventDefault(); event.stopPropagation(); panel.querySelector(".wb-agent-model")?.removeAttribute("open"); this.focus(".wb-agent-model summary"); }
      }
      if (event.key === "Enter" && !event.shiftKey && target instanceof HTMLTextAreaElement && target.id === "dj-agent-input") { event.preventDefault(); event.stopPropagation(); this.send(); }
      if (event.key === "Enter" && target instanceof HTMLInputElement && target.id === "dj-agent-rename") { event.preventDefault(); event.stopPropagation(); this.saveRename(); }
    });
    const messages = panel.querySelector<HTMLElement>(".wb-agent-messages");
    if (messages) messages.scrollTop = scrollToEnd ? messages.scrollHeight : scroll;
    if (selection) {
      const nextInput = panel.querySelector<HTMLTextAreaElement>("#dj-agent-input");
      nextInput?.focus({ preventScroll: true });
      nextInput?.setSelectionRange(selection[0], selection[1]);
    }
    else if (closeFocused) panel.querySelector<HTMLButtonElement>("[data-dj-action='drawer-close']")?.focus({ preventScroll: true });
  }
  private header(title: string, subtitle: string, settings = false) {
    return `<header class="wb-playlist-heading wb-agent-heading"><div><span>YESMUSIC / AGENT TERMINAL</span><h2 id="dj-playlist-title">${title}</h2><p>${subtitle}</p></div><div class="wb-agent-header-actions">${settings ? '<button class="wb-agent-button" data-agent-action="settings-close">← 返回对话</button>' : `<button class="wb-agent-button" data-agent-action="toggle-sidebar" aria-controls="dj-agent-sessions" aria-expanded="${this.sidebarOpen}" aria-label="展开或收起会话列表">☰</button><button class="wb-agent-button" data-agent-action="settings">模型配置 ↗</button>`}<button class="wb-playlist-close" data-dj-action="drawer-close" aria-label="关闭 Agent 面板">×</button></div></header>`;
  }
  private chatView() {
    if (this.initializing) return this.header("AI DJ 助手", "正在读取服务器会话…") + '<div class="wb-agent-state">正在连接 Agent 会话服务…</div>';
    if (this.startupError) return this.header("AI DJ 助手", "无法载入会话") + '<div class="wb-agent-state" role="alert"><p>' + h(this.startupError) + '</p><button data-agent-action="retry">重试</button></div>';
    const s = this.session;
    if (!s) return this.header("AI DJ 助手", "当前没有可用会话") + '<div class="wb-agent-state"><button data-agent-action="new">新建会话</button></div>';
    const run = this.runs.get(s.id), messages = this.messages.get(s.id) ?? [];
    const live: AgentMessage | null = run ? { id: "live:" + s.id, sessionId: s.id, role: "assistant", content: run.content, reasoning: run.reasoning, cardData: run.card, toolEvents: run.events, createdAt: Date.now() } : null;
    return this.header("AI DJ 助手", "1001TL 现场解析 · 曲库检索 · Camelot 调性 · 智能排歌") +
      '<div class="wb-agent-body" data-sidebar="' + this.sidebarOpen + '"><aside class="wb-agent-sidebar" id="dj-agent-sessions" aria-label="Agent 会话" ' + (this.sidebarOpen ? "" : "hidden") + '>' +
      '<div class="wb-agent-sidebar-top"><span>SESSIONS / 会话</span><button class="wb-agent-button wb-agent-primary" data-agent-action="new">＋ 新建会话</button></div><div class="wb-agent-session-list">' + this.sessions.map(item => this.sessionView(item)).join("") + '</div>' +
      '<p class="wb-agent-local">' + (this.storageOK ? "◻ 会话由服务器保存" : "无法保存界面偏好") + '</p></aside><section class="wb-agent-conversation" aria-label="当前对话">' +
      '<div class="wb-agent-conversation-heading"><span>' + h(s.title) + '</span><small>SERVER SESSION · ' + Number(s.messageCount ?? messages.length) + ' MESSAGES</small></div>' +
      '<div class="wb-agent-messages" aria-label="会话消息" aria-live="polite" aria-relevant="additions text">' + (messages.length ? messages.map(m => this.messageView(m)).join("") : this.welcomeView()) +
      (live ? this.messageView(live) + '<div class="wb-agent-running" role="status"><i></i>' + h(run?.status || "Agent 正在处理") + '</div>' : "") + '</div>' +
      (this.notice ? '<p class="wb-agent-notice" role="status">' + h(this.notice) + '</p>' : "") +
      '<div class="wb-agent-composer"><label class="wb-agent-input-label" for="dj-agent-input">MESSAGE / 需求输入</label><textarea id="dj-agent-input" rows="3" maxlength="4000" placeholder="粘贴现场链接、Setlist，或描述你的排歌需求…">' + h(this.draft) + '</textarea>' +
      '<div class="wb-agent-composer-controls"><details class="wb-agent-model"><summary>' + h(this.config.model) + ' / ' + (efforts.find(([v]) => v === this.config.effort)?.[1] || "") + ' ▴</summary><div class="wb-agent-model-popover">' +
      '<label>模型<select data-agent-select="model">' + [...new Set([defaults.model, "deepseek-v4-pro", this.config.model])].map(model => '<option ' + (model === this.config.model ? "selected" : "") + '>' + h(model) + '</option>').join("") + '</select></label>' +
      '<label>推理强度<select data-agent-select="effort">' + efforts.map(([value, label]) => '<option value="' + value + '" ' + (value === this.config.effort ? "selected" : "") + '>' + label + '</option>').join("") + '</select></label><button class="wb-agent-button" data-agent-action="reset-model">恢复默认</button></div></details>' +
      '<button class="wb-agent-button wb-agent-primary wb-agent-send" data-agent-action="' + (run ? "stop" : "send") + '">' + (run ? "■ 停止" : "发送 ↗") + '</button></div>' +
      '<div class="wb-agent-composer-foot"><span>Enter 发送 · Shift + Enter 换行</span><span>CONNECTED / SERVER AGENT</span></div></div></section></div>';
  }
  private sessionView(s: Session) {
    const count = Number(s.messageCount ?? this.messages.get(s.id)?.length ?? 0);
    return '<article class="wb-agent-session" data-active="' + (s.id === this.activeId) + '"><button class="wb-agent-session-open" data-agent-action="switch" data-session="' + h(s.id) + '" aria-pressed="' + (s.id === this.activeId) + '"><strong>' + h(s.title) + '</strong><small>' + (count ? count + ' 条消息' : "等待开始") + (this.runs.has(s.id) ? " · 正在生成" : "") + '</small></button>' +
      '<div class="wb-agent-session-actions"><button data-agent-action="rename" data-session="' + h(s.id) + '" aria-label="重命名 ' + h(s.title) + '" title="重命名">✎</button><button data-agent-action="delete" data-session="' + h(s.id) + '" aria-label="删除 ' + h(s.title) + '" title="删除">×</button></div>' +
      (this.renameId === s.id ? '<div class="wb-agent-session-edit"><input id="dj-agent-rename" aria-label="会话名称" maxlength="60" value="' + h(s.title) + '"/><button data-agent-action="rename-save">保存</button><button data-agent-action="edit-cancel">取消</button></div>' : "") +
      (this.deleteId === s.id ? '<div class="wb-agent-session-edit"><span>删除服务器会话？</span><button data-agent-action="delete-confirm">删除</button><button data-agent-action="edit-cancel">取消</button></div>' : "") + '</article>';
  }
  private welcomeView() {
    return '<div class="wb-agent-welcome"><span class="wb-agent-eyebrow">YOUR NEXT SET / DJ COPILOT</span><h3>开始编排下一场演出</h3><p>从一份现场曲目表开始，或告诉我风格、速度与演出时段。</p>' +
      '<details class="wb-agent-setup"><summary>连接状态 <span>检查服务状态</span></summary><div><p><strong>1001Tracklists</strong><small>现场数据源连接检查</small></p><button class="wb-agent-button" data-agent-action="verify">检查连接 ↗</button></div><div><p><strong>网易云账号</strong><small>曲库搜索与播放所需登录</small></p><button class="wb-agent-button" data-agent-action="account">账号设置 ↗</button></div></details>' +
      '<div class="wb-agent-prompts">' + prompts.map(([number, title, caption], index) => '<button data-agent-action="prompt" data-prompt="' + index + '"><span>' + number + '</span><strong>' + h(title) + '</strong><small>' + h(caption) + '</small><i>↗</i></button>').join("") + '</div></div>';
  }
  private eventLabel(event: AgentEvent) {
    const data = asObject(event.data);
    return asText(data.message ?? data.status ?? event.data ?? event.type);
  }
  private cardView(card: Record<string, unknown>, key: string) {
    const kind = asText(card.sourceType), title = asText(card.title) || "Agent 结果";
    const rawTracks = Array.isArray(card.tracks) ? card.tracks : Array.isArray(card.matchedSongs) ? card.matchedSongs : [];
    const tracks = rawTracks.map(toTrack).filter((track): track is NeteaseTrack => Boolean(track));
    this.cards.set(key, tracks);
    if (kind === "setup_1001tl") return '<section class="wb-agent-result"><small>CONNECTION / 1001TRACKLISTS</small><h4>' + h(title) + '</h4><p>' + h(asText(card.text) || asText(card.subtitle) || "此数据源需要完成连接验证。") + '</p><button data-agent-action="verify">检查连接 ↗</button></section>';
    if (kind === "camelot_analysis") {
      const compatible = Array.isArray(card.compatible) ? card.compatible.map(asObject) : [];
      return '<section class="wb-agent-result wb-agent-camelot"><small>HARMONIC MIX / CAMELOT ENGINE</small><h4>' + h(title) + '</h4><p>起始调性：' + h(asText(card.fromKey) || "未识别") + '</p>' +
        (compatible.length ? '<div class="wb-agent-key-list">' + compatible.map(item => '<span><strong>' + h(asText(item.camelot)) + '</strong> ' + h(asText(item.standard)) + ' · ' + h(asText(item.relation)) + '</span>').join("") + '</div>' : "") + '</section>';
    }
    const sets = Array.isArray(card.sets) ? card.sets.map(asObject) : [];
    return '<section class="wb-agent-result"><small>STRUCTURED RESULT / ' + h(kind || "AGENT CARD") + '</small><h4>' + h(title) + '</h4>' + (card.subtitle ? '<p>' + h(asText(card.subtitle)) + '</p>' : "") +
      (sets.length ? '<ol class="wb-agent-set-list">' + sets.map((set, index) => {
        const url = safeHttpUrl(set.url ?? set.link);
        return '<li><span>' + String(index + 1).padStart(2, "0") + '</span><strong>' + h(asText(set.title ?? set.name) || "未命名现场") + '</strong>' + (url ? '<a href="' + h(url) + '" target="_blank" rel="noopener noreferrer">查看原站 ↗</a>' : "") + '</li>';
      }).join("") + '</ol>' : "") +
      (tracks.length ? '<div class="wb-agent-card-actions"><button class="wb-agent-button wb-agent-primary" data-agent-action="play-card" data-card="' + h(key) + '">▶ 播放候选</button><button class="wb-agent-button" data-agent-action="open-search">在曲库中搜索 ↗</button></div><div class="wb-agent-track-list">' +
        tracks.map((track, index) => '<div class="wb-agent-track"><span>' + String(index + 1).padStart(2, "0") + '</span>' + (track.coverUrl ? '<img src="' + h(track.coverUrl) + '" alt=""/>' : '<span class="wb-agent-track-cover">♫</span>') +
          '<p><strong>' + h(track.title) + '</strong><small>' + h(track.artists.join(" / ") || track.album) + '</small></p><button data-agent-action="play-track" data-card="' + h(key) + '" data-track-index="' + index + '" aria-label="播放 ' + h(track.title) + '">▶</button><button data-agent-action="add-track" data-card="' + h(key) + '" data-track-index="' + index + '" aria-label="将 ' + h(track.title) + ' 加入当前歌单">＋</button></div>').join("") + '</div>' : "") +
      (safeHttpUrl(card.source) ? '<a href="' + h(safeHttpUrl(card.source)) + '" target="_blank" rel="noopener noreferrer">打开来源 ↗</a>' : "") + '</section>';
  }
  private messageView(m: AgentMessage) {
    const events = Array.isArray(m.toolEvents) ? m.toolEvents.filter(item => ["tool_start", "tool_progress", "tool_result", "status"].includes(asText(item.type))) : [];
    return '<article class="wb-agent-message" data-role="' + h(m.role) + '"><div class="wb-agent-message-label">' + (m.role === "user" ? "YOU / 你的需求" : m.role === "system" ? "SYSTEM / 系统" : "AGENT / DJ 助手") + '</div>' +
      (m.content ? '<p class="wb-agent-message-content">' + h(m.content).replace(/\n/g, "<br/>") + '</p>' : (m.role === "assistant" ? '<p>正在组织回复…</p>' : "")) +
      (m.reasoning ? '<details class="wb-agent-trace"><summary>推理过程 / REASONING</summary><p>' + h(m.reasoning).replace(/\n/g, "<br/>") + '</p></details>' : "") +
      (events.length ? '<details class="wb-agent-trace" open><summary>工具执行 / TOOL ACTIVITY <span>' + events.length + '</span></summary><ol>' + events.map(item => '<li><strong>' + h(asText(item.type).replace("tool_", "").toUpperCase()) + '</strong><span>' + h(this.eventLabel(item)) + '</span></li>').join("") + '</ol></details>' : "") +
      (m.cardData ? this.cardView(m.cardData, m.id) : "") + '</article>';
  }
  private settingsView() {
    const cfg = this.settingsDraft;
    return this.header("模型配置", "Agent 的模型、推理与生成偏好", true) + '<div class="wb-agent-settings"><span class="wb-agent-eyebrow">MODEL CONNECTION / 连接设置</span>' +
      '<label>API Base URL<input data-agent-config="url" type="url" value="' + h(cfg.url) + '" placeholder="https://api.example.com"/></label>' +
      '<label>API Key<input data-agent-config="apiKey" type="password" autocomplete="new-password" value="' + h(this.pendingApiKey) + '" placeholder="' + (this.config.apiKey ? "页面内存中已配置" : "配置密钥，或使用服务器环境变量") + '"/></label>' +
      '<button class="wb-agent-button" data-agent-action="clear-key">清除页面密钥</button>' +
      '<label>模型名称<input data-agent-config="model" value="' + h(cfg.model) + '" maxlength="100" list="dj-agent-models"/><datalist id="dj-agent-models"><option value="deepseek-v4-flash"></option><option value="deepseek-v4-pro"></option></datalist></label>' +
      '<label>推理强度<select data-agent-config="effort">' + efforts.map(([value, label]) => '<option value="' + value + '" ' + (value === cfg.effort ? "selected" : "") + '>' + label + '</option>').join("") + '</select></label>' +
      '<label>创造力 <output id="dj-agent-temp-value">' + cfg.temperature + '</output><input data-agent-config="temperature" type="range" min="0" max="1.5" step="0.1" value="' + cfg.temperature + '"/></label>' +
      '<p class="wb-agent-settings-note">API Key 只保存在当前页面内存，并通过本机服务发送；不会写入 localStorage。</p>' +
      (this.notice ? '<p class="wb-agent-notice" role="status">' + h(this.notice) + '</p>' : "") +
      '<div class="wb-agent-settings-actions"><button data-agent-action="test">真实请求测试</button><span></span><button data-agent-action="settings-close">取消</button><button class="wb-agent-primary" data-agent-action="settings-save">保存配置</button></div></div>';
  }
  private async act(button: HTMLButtonElement) {
    const action = button.dataset.agentAction;
    if (action === "send") { await this.send(); return; }
    if (action === "prompt") { this.drafts.set(this.activeId, prompts[Number(button.dataset.prompt)]?.[3] ?? ""); await this.send(); return; }
    if (action === "open-search") { this.actions.openSearch(); return; }
    if (action === "playlists") { this.actions.openPlaylists(); return; }
    if (action === "account") { this.actions.openAccount(); return; }
    if (action === "play-card" || action === "play-track") {
      const tracks = this.cards.get(button.dataset.card || "") || [];
      if (tracks.length) await this.actions.playTracks(tracks, action === "play-card" ? 0 : Number(button.dataset.trackIndex) || 0);
      return;
    }
    if (action === "add-track") {
      const track = this.cards.get(button.dataset.card || "")?.[Number(button.dataset.trackIndex)];
      if (track) await this.actions.addTrack(track);
      return;
    }
    if (action === "stop") { this.runs.get(this.activeId)?.controller.abort(); return; }
    if (action === "retry") { await this.initialize(); return; }
    if (action === "toggle-sidebar") this.sidebarOpen = !this.sidebarOpen;
    if (action === "new") {
      this.busyAction = true; this.render();
      try {
        const item = await djAgentApi.createSession();
        this.sessions.unshift({ ...item, draft: "" }); this.activeId = item.id; this.messages.set(item.id, []);
        this.notice = ""; this.renameId = ""; this.deleteId = "";
        if (window.innerWidth <= 700) this.sidebarOpen = false;
      } catch (error) { this.notice = error instanceof Error ? error.message : "创建会话失败。"; }
      finally { this.busyAction = false; }
      this.persist(); this.render(true); this.focus("#dj-agent-input"); return;
    }
    if (action === "switch") {
      const id = button.dataset.session || "";
      if (!this.sessions.some(item => item.id === id)) return;
      this.activeId = id; this.notice = ""; this.renameId = ""; this.deleteId = "";
      if (window.innerWidth <= 700) this.sidebarOpen = false;
      this.persist(); this.render();
      try { await this.loadSession(id); } catch (error) { this.notice = error instanceof Error ? error.message : "读取会话失败。"; this.render(); }
      this.focus("#dj-agent-input"); return;
    }
    if (action === "rename") { this.renameId = button.dataset.session || ""; this.deleteId = ""; this.render(); this.focus("#dj-agent-rename"); this.host?.querySelector<HTMLInputElement>("#dj-agent-rename")?.select(); return; }
    if (action === "delete") {
      const id = button.dataset.session || "";
      if (this.runs.has(id)) { this.notice = "此会话仍有请求运行，请先停止生成，再删除会话。"; this.render(); return; }
      this.deleteId = id; this.renameId = ""; this.render(); return;
    }
    if (action === "edit-cancel") { this.renameId = ""; this.deleteId = ""; this.render(); return; }
    if (action === "rename-save") { await this.saveRename(); return; }
    if (action === "delete-confirm") {
      const id = this.deleteId; if (!id) return;
      if (this.runs.has(id)) { this.notice = "此会话仍有请求运行，请先停止生成，再删除会话。"; this.deleteId = ""; this.render(); return; }
      this.busyAction = true; this.render();
      try {
        await djAgentApi.deleteSession(id); this.runs.delete(id); this.messages.delete(id); this.drafts.delete(id);
        this.sessions = this.sessions.filter(item => item.id !== id);
        if (!this.sessions.length) this.sessions = [{ ...await djAgentApi.createSession(), draft: "" }];
        if (this.activeId === id) this.activeId = this.sessions[0].id;
        this.deleteId = ""; this.notice = ""; this.persist(); await this.loadSession(this.activeId, false);
      } catch (error) { this.notice = error instanceof Error ? error.message : "删除会话失败。"; }
      finally { this.busyAction = false; this.render(); }
      return;
    }
    if (action === "verify") {
      this.busyAction = true; this.notice = "正在检查 1001Tracklists 连接…"; this.render();
      try { const result = await djAgentApi.tracklistStatus(); this.notice = result.ready ? "1001Tracklists 连接可用。" : result.reason || "1001Tracklists 尚未完成连接验证。"; }
      catch (error) { this.notice = error instanceof Error ? error.message : "检查数据源失败。"; }
      finally { this.busyAction = false; this.render(); }
      return;
    }
    if (action === "settings") { this.settingsDraft = { ...this.config }; this.pendingApiKey = ""; this.clearApiKey = false; this.settingsOpen = true; this.notice = ""; }
    if (action === "settings-close") { this.settingsOpen = false; this.notice = ""; this.pendingApiKey = ""; this.clearApiKey = false; this.render(); this.focus('[data-agent-action="settings"]'); return; }
    if (action === "clear-key") { this.clearApiKey = true; this.pendingApiKey = ""; this.settingsDraft.apiKey = ""; this.notice = "保存后页面密钥将从当前内存配置中清除。"; this.render(); return; }
    if (action === "settings-save") {
      const model = this.settingsDraft.model.trim(), url = this.settingsDraft.url.trim();
      if (!model || !/^https?:\/\//i.test(url)) { this.notice = "请填写模型名称和有效的 HTTP / HTTPS 地址。"; this.render(); return; }
      this.config = { ...this.settingsDraft, model, url, apiKey: this.clearApiKey ? "" : this.pendingApiKey || this.config.apiKey };
      this.settingsOpen = false; this.notice = "模型配置已保存在当前页面。API Key 未写入本地存储。";
      this.persist(); this.render(); this.focus('[data-agent-action="settings"]'); return;
    }
    if (action === "test") { await this.testConnection(); return; }
    if (action === "reset-model") {
      this.config.model = defaults.model; this.config.effort = defaults.effort;
      if (this.settingsOpen) { this.settingsDraft.model = defaults.model; this.settingsDraft.effort = defaults.effort; }
    }
    this.persist(); this.render();
    this.focus(action === "settings" ? '[data-agent-config="url"]' : action === "toggle-sidebar" ? '[data-agent-action="toggle-sidebar"]' : "#dj-agent-input");
  }
  private async testConnection() {
    this.busyAction = true; this.notice = "正在发起真实模型请求…"; this.render();
    const controller = new AbortController(); this.testController = controller; let id = "";
    try {
      id = (await djAgentApi.createSession("连接测试")).id;
      const responseText: string[] = [];
      await djAgentApi.sendMessage({
        sessionId: id, message: "请只回复“连接成功”，不要调用任何工具。", cookie: getNeteaseCookie(),
        config: { baseUrl: this.settingsDraft.url.trim(), model: this.settingsDraft.model.trim(), thinkingEffort: this.settingsDraft.effort, temperature: this.settingsDraft.temperature, apiKey: this.clearApiKey ? undefined : this.pendingApiKey || this.config.apiKey || undefined },
      }, event => { if (event.type === "text") responseText.push(asText(event.data)); }, controller.signal);
      const text = responseText.join("").trim();
      if (!text) throw new Error("服务没有返回模型文本，无法确认连接。");
      if (/未配置.{0,12}(?:API\s*Key|密钥)|意图识别失败|处理请求失败|模型解释不可用/i.test(text)) {
        throw new Error(text.slice(0, 240));
      }
      this.notice = "真实模型请求已完成，连接可用。";
    } catch (error) { this.notice = error instanceof Error ? "连接测试失败：" + error.message : "连接测试失败。"; }
    finally { if (id) await djAgentApi.deleteSession(id).catch(() => undefined); this.testController = undefined; this.busyAction = false; this.render(); }
  }
  private async saveRename() {
    const title = this.host?.querySelector<HTMLInputElement>("#dj-agent-rename")?.value.trim(), id = this.renameId;
    if (!title || !id) return;
    try {
      const updated = await djAgentApi.renameSession(id, title.slice(0, 60));
      const index = this.sessions.findIndex(item => item.id === id);
      if (index >= 0) this.sessions[index] = { ...this.sessions[index], ...updated };
      this.renameId = ""; this.persist(); this.render(); this.focus("#dj-agent-input");
    } catch (error) { this.notice = error instanceof Error ? error.message : "重命名会话失败。"; this.render(); }
  }
  private async send() {
    const session = this.session, id = session?.id, text = this.draft.trim();
    if (!session || !id || !text || this.runs.has(id) || this.busyAction) { this.focus("#dj-agent-input"); return; }
    this.drafts.delete(id); session.draft = "";
    const history = this.messages.get(id) ?? [];
    history.push({ id: "pending:" + Date.now(), sessionId: id, role: "user", content: text, reasoning: "", cardData: null, toolEvents: [], createdAt: Date.now() });
    this.messages.set(id, history);
    const run: AgentRun = { controller: new AbortController(), content: "", reasoning: "", events: [], card: null, status: "正在连接 Agent…", stopping: false };
    this.runs.set(id, run); this.notice = ""; this.render(true);
    try {
      await djAgentApi.sendMessage({
        sessionId: id, message: text, cookie: getNeteaseCookie(),
        config: { baseUrl: this.config.url, model: this.config.model, thinkingEffort: this.config.effort, temperature: this.config.temperature, apiKey: this.config.apiKey || undefined },
      }, event => {
        if (this.runs.get(id) !== run) return;
        const data = asObject(event.data);
        if (event.type === "text") run.content += asText(event.data);
        else if (event.type === "reasoning") run.reasoning += asText(event.data);
        else if (event.type === "card") run.card = data;
        else if (event.type === "status") run.status = asText(data.message ?? event.data) || "Agent 正在处理";
        else if (["tool_start", "tool_progress", "tool_result"].includes(asText(event.type))) { run.events.push(event); run.status = this.eventLabel(event) || "工具正在执行"; }
        if (this.activeId === id && !this.settingsOpen) this.render(true);
      }, run.controller.signal);
    } catch (error) {
      if (!isAbort(error)) this.notices.set(id, error instanceof Error ? error.message : "Agent 请求失败。");
      else run.stopping = true;
    } finally {
      if (this.runs.get(id) === run) this.runs.delete(id);
      try { await this.loadSession(id, false); } catch { /* keep streamed partial response */ }
      try { await this.refreshSessions(); } catch { /* refresh on next open */ }
      if (this.activeId === id) {
        this.notice = this.notices.get(id) || (run.stopping ? "已停止生成；服务器已保存已收到的部分内容。" : "");
        this.notices.delete(id); this.render(true);
      }
    }
    this.focus("#dj-agent-input");
  }
}
