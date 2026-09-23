import { escapeHtml as h } from "./html";
import { djDemoTracks, djPlaceholderCover } from "./dj-records";
import "./dj-agent.css";

type Intent = "setlist" | "search" | "camelot" | "playlist";
type Message = { role: "user" | "assistant"; text: string; intent?: Intent };
type Session = { id: string; title: string; draft: string; messages: Message[]; example?: boolean };
type Config = { url: string; model: string; effort: string; temperature: number };
type Actions = { openSearch: () => void; openPlaylists: () => void; openAccount: () => void; playSample: (index: number) => void };
const storageKey = "yesmusic-dj-agent-prototype-v1";
const defaults: Config = { url: "https://api.deepseek.com", model: "deepseek-v4-flash", effort: "high", temperature: .7 };
const efforts = [["off", "关闭"], ["low", "低"], ["medium", "中"], ["high", "高"]];
const prompts = [
  ["01", "解析现场 / Setlist", "粘贴 1001Tracklists 链接或曲目表", "我想解析一份 1001Tracklists 现场 Setlist，请先告诉我需要提供哪些信息。"],
  ["02", "Melodic Techno", "为旋律与能量安排一条完整路线", "帮我编排一套 Melodic Techno 风格的 DJ Set。"],
  ["03", "Tech House", "从暖场过渡到舞池的中心", "帮我编排一套 Tech House 风格的 DJ Set。"],
  ["04", "Camelot 调性衔接", "以 126 BPM · 8A 为起点", "推荐适合接在 126 BPM 8A 后的 Camelot 调性与混音方案。"],
  ["05", "128 BPM 峰值时段", "为 Peak Time 选择高能量曲目", "做一张适合 128 BPM 峰值时段的 Bass House 歌单。"],
];
const newSession = (): Session => ({ id: crypto.randomUUID(), title: "新会话", draft: "", messages: [] });
const intentFor = (text: string): Intent => /1001|setlist|现场|链接/i.test(text) ? "setlist" : /camelot|调性|8a|混音/i.test(text) ? "camelot" : /检索|搜索|查找|找歌/i.test(text) ? "search" : "playlist";
const demoReply = (intent: Intent): string => ({
  setlist: "请提供现场链接，或按「艺人 - 曲名」粘贴曲目表。接入数据源后，将依次展示现场解析、曲库匹配和歌单预览。下方为结果卡片示例，尚未解析真实现场。",
  search: "可以按歌曲、歌手或专辑检索，并将候选曲目加入歌单。点击下方入口体验搜索流程；当前会话没有查询在线曲库。",
  camelot: "这里演示调性建议的呈现方式：以 126 BPM / 8A 为输入，展示候选调性、速度和过渡说明。实际推荐需要结合曲目元数据与试听确认。",
  playlist: "已收到排歌需求。接入 Agent 后，这里会展示选曲说明、曲目匹配进度和歌单结果。下方使用三首示例曲目演示预览、试听和跳转歌单的流程。",
})[intent];

export class DjAgentPanel {
  private host: HTMLElement | null = null;
  private sessions: Session[] = [newSession(),
    { ...newSession(), title: "Melodic Techno 演出准备", example: true, messages: [{ role: "user", text: prompts[1][3] }, { role: "assistant", text: demoReply("playlist"), intent: "playlist" }] },
    { ...newSession(), title: "126 BPM · 8A 调性过渡", example: true, messages: [{ role: "user", text: prompts[3][3] }, { role: "assistant", text: demoReply("camelot"), intent: "camelot" }] },
  ];
  private activeId = this.sessions[0].id;
  private sidebarOpen = window.innerWidth > 700;
  private config = { ...defaults };
  private settingsDraft = { ...defaults };
  private settingsOpen = false;
  private renameId = "";
  private deleteId = "";
  private notice = "";
  private storageOK = true;
  private runs = new Map<string, number>();

  constructor(private actions: Actions) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (Array.isArray(saved?.sessions)) {
        const valid = saved.sessions.filter((s: Session) => s && typeof s.id === "string" && typeof s.title === "string" && typeof s.draft === "string" && Array.isArray(s.messages) && s.messages.every(m => m && ["user", "assistant"].includes(m.role) && typeof m.text === "string" && (!m.intent || ["setlist", "search", "camelot", "playlist"].includes(m.intent))));
        if (valid.length) this.sessions = valid;
      }
      this.activeId = this.sessions.find(s => s.id === saved?.activeId)?.id ?? this.sessions[0].id;
      if (typeof saved?.sidebarOpen === "boolean") this.sidebarOpen = saved.sidebarOpen;
      const cfg = saved?.config;
      if (cfg && typeof cfg.url === "string" && typeof cfg.model === "string" && efforts.some(([value]) => value === cfg.effort) && Number.isFinite(cfg.temperature)) {
        this.config = { url: cfg.url, model: cfg.model, effort: cfg.effort, temperature: Math.max(0, Math.min(1.5, cfg.temperature)) };
      }
    } catch { this.storageOK = false; }
  }
  private get session() { return this.sessions.find(s => s.id === this.activeId)!; }
  private persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ sessions: this.sessions, activeId: this.activeId, config: this.config, sidebarOpen: this.sidebarOpen }));
      this.storageOK = true;
    } catch { this.storageOK = false; }
  }
  mount(host: HTMLElement) { this.host = host; this.render(); }
  unmount() {
    if (!this.host) return;
    this.persist(); this.host = null; this.settingsOpen = false; this.renameId = ""; this.deleteId = "";
  }
  private focus(selector: string) { this.host?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }); }
  private render(scrollToEnd = false) {
    if (!this.host) return;
    const input = this.host.querySelector<HTMLTextAreaElement>("#dj-agent-input");
    const selection = input && document.activeElement === input ? [input.selectionStart, input.selectionEnd] : null;
    const scroll = this.host.querySelector<HTMLElement>(".wb-agent-messages")?.scrollTop ?? 0;
    this.host.innerHTML = `<div class="wb-agent-panel">${this.settingsOpen ? this.settingsView() : this.chatView()}</div>`;
    const panel = this.host.querySelector<HTMLElement>(".wb-agent-panel")!;
    panel.addEventListener("click", event => {
      const button = (event.target as Element).closest<HTMLButtonElement>("[data-agent-action]");
      if (button) { event.stopPropagation(); this.act(button); }
    });
    panel.addEventListener("input", event => {
      const input = event.target;
      if (input instanceof HTMLTextAreaElement && input.id === "dj-agent-input") this.session.draft = input.value;
      if (input instanceof HTMLInputElement && input.dataset.agentConfig) {
        if (input.dataset.agentConfig === "temperature") {
          this.settingsDraft.temperature = Number(input.value);
          panel.querySelector("#dj-agent-temp-value")!.textContent = input.value;
        } else if (input.dataset.agentConfig === "url") this.settingsDraft.url = input.value;
        else if (input.dataset.agentConfig === "model") this.settingsDraft.model = input.value;
      }
    });
    panel.addEventListener("change", event => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement) || !select.dataset.agentSelect) return;
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
  }
  private header(title: string, subtitle: string, settings = false) {
    return `<header class="wb-playlist-heading wb-agent-heading"><div><span>YESMUSIC / AGENT TERMINAL</span><h2 id="dj-playlist-title">${title}</h2><p>${subtitle}</p></div><div class="wb-agent-header-actions">${settings ? '<button class="wb-agent-button" data-agent-action="settings-close">← 返回对话</button>' : `<button class="wb-agent-button" data-agent-action="toggle-sidebar" aria-controls="dj-agent-sessions" aria-expanded="${this.sidebarOpen}" aria-label="展开或收起会话列表">☰</button><button class="wb-agent-button" data-agent-action="settings">模型配置 ↗</button>`}<button class="wb-playlist-close" data-dj-action="drawer-close" aria-label="关闭 Agent 面板">×</button></div></header>`;
  }
  private chatView() {
    const s = this.session, running = this.runs.has(s.id);
    return `${this.header("AI DJ 助手", "1001TL 现场解析 · 曲库检索 · Camelot 调性 · 智能排歌")}
      <div class="wb-agent-body" data-sidebar="${this.sidebarOpen}">
        <aside class="wb-agent-sidebar" id="dj-agent-sessions" aria-label="Agent 会话" ${this.sidebarOpen ? "" : "hidden"}>
          <div class="wb-agent-sidebar-top"><span>SESSIONS / 会话</span><button class="wb-agent-button wb-agent-primary" data-agent-action="new">＋ 新建会话</button></div>
          <div class="wb-agent-session-list">${this.sessions.map(item => this.sessionView(item)).join("")}</div>
          <p class="wb-agent-local">${this.storageOK ? "◻ 会话保存在当前浏览器" : "无法保存，当前会话仅临时保留"}</p>
        </aside>
        <section class="wb-agent-conversation" aria-label="当前对话">
          <div class="wb-agent-conversation-heading"><span>${h(s.title)}</span><small>${s.example ? "示例会话" : "LOCAL SESSION"}</small></div>
          <div class="wb-agent-messages" aria-label="会话消息" aria-live="polite" aria-relevant="additions text">${s.messages.length ? s.messages.map(m => this.messageView(m)).join("") : this.welcomeView()}
            ${running ? '<div class="wb-agent-running" role="status"><i></i> 正在演示 Agent 回复…<small>未调用模型或外部工具</small></div>' : ""}
          </div>
          ${this.notice ? `<p class="wb-agent-notice" role="status">${h(this.notice)}</p>` : ""}
          <div class="wb-agent-composer"><label class="wb-agent-input-label" for="dj-agent-input">MESSAGE / 需求输入</label><textarea id="dj-agent-input" rows="3" maxlength="4000" placeholder="粘贴现场链接、Setlist，或描述你的排歌需求…">${h(s.draft)}</textarea>
            <div class="wb-agent-composer-controls"><details class="wb-agent-model"><summary>${h(this.config.model)} / ${efforts.find(([v]) => v === this.config.effort)?.[1]} ▴</summary><div class="wb-agent-model-popover"><label>模型<select data-agent-select="model">${[...new Set([defaults.model, "deepseek-v4-pro", this.config.model])].map(model => `<option ${model === this.config.model ? "selected" : ""}>${h(model)}</option>`).join("")}</select></label><label>推理强度<select data-agent-select="effort">${efforts.map(([value, label]) => `<option value="${value}" ${value === this.config.effort ? "selected" : ""}>${label}</option>`).join("")}</select></label><button class="wb-agent-button" data-agent-action="reset-model">恢复默认</button></div></details><button class="wb-agent-button wb-agent-primary wb-agent-send" data-agent-action="${running ? "stop" : "send"}">${running ? "■ 停止" : "发送 ↗"}</button></div>
            <div class="wb-agent-composer-foot"><span>Enter 发送 · Shift + Enter 换行</span><span>PROTOTYPE / 本地演示</span></div>
          </div>
        </section>
      </div>`;
  }
  private sessionView(s: Session) {
    return `<article class="wb-agent-session" data-active="${s.id === this.activeId}"><button class="wb-agent-session-open" data-agent-action="switch" data-session="${h(s.id)}" aria-pressed="${s.id === this.activeId}"><strong>${h(s.title)}</strong><small>${s.example ? "示例 · " : ""}${s.messages.length ? `${s.messages.length} 条消息` : "等待开始"}${this.runs.has(s.id) ? " · 演示中" : ""}</small></button><div class="wb-agent-session-actions"><button data-agent-action="rename" data-session="${h(s.id)}" aria-label="重命名 ${h(s.title)}" title="重命名">✎</button><button data-agent-action="delete" data-session="${h(s.id)}" aria-label="删除 ${h(s.title)}" title="删除">×</button></div>
      ${this.renameId === s.id ? `<div class="wb-agent-session-edit"><input id="dj-agent-rename" aria-label="会话名称" maxlength="60" value="${h(s.title)}"/><button data-agent-action="rename-save">保存</button><button data-agent-action="edit-cancel">取消</button></div>` : ""}
      ${this.deleteId === s.id ? '<div class="wb-agent-session-edit"><span>删除这段本地会话？</span><button data-agent-action="delete-confirm">删除</button><button data-agent-action="edit-cancel">取消</button></div>' : ""}</article>`;
  }
  private welcomeView() {
    return `<div class="wb-agent-welcome"><span class="wb-agent-eyebrow">YOUR NEXT SET / DJ COPILOT</span><h3>开始编排下一场演出</h3><p>从一份现场曲目表开始，或告诉我风格、速度与演出时段。</p>
      <details class="wb-agent-setup"><summary>首次设置与连接状态 <span>待连接 · 2 项</span></summary><div><p><strong>1001Tracklists</strong><small>现场数据源验证</small></p><button class="wb-agent-button" data-agent-action="verify">去验证 ↗</button></div><div><p><strong>网易云账号</strong><small>云端歌单与曲目 · 登录可选</small></p><button class="wb-agent-button" data-agent-action="account">去登录 ↗</button></div></details>
      <div class="wb-agent-prompts">${prompts.map(([number, title, caption], index) => `<button data-agent-action="prompt" data-prompt="${index}"><span>${number}</span><strong>${title}</strong><small>${caption}</small><i>↗</i></button>`).join("")}</div></div>`;
  }
  private messageView(m: Message) {
    const titles = { setlist: "现场解析 → 曲库匹配 → 歌单预览", search: "关键词 → 曲库检索 → 曲目候选", camelot: "曲目元数据 → 调性分析 → 衔接建议", playlist: "演出需求 → 选曲排序 → 歌单预览" };
    return `<article class="wb-agent-message" data-role="${m.role}"><div class="wb-agent-message-label">${m.role === "user" ? "YOU / 你的需求" : "AGENT / 示例回复"}</div><p>${h(m.text)}</p>${m.intent ? `<details class="wb-agent-trace"><summary>任务流程 <span>示例 · 未执行</span></summary><p>${titles[m.intent]}</p><small>连接真实服务后显示工具状态与执行结果。</small></details>${m.intent === "camelot" ? '<div class="wb-agent-camelot"><span>过渡卡片 / 示例</span><strong>126 BPM <i>↗</i> 8A</strong><p>候选调性、目标速度与混音建议将在这里逐项呈现。</p></div>' : m.intent === "search" ? '<button class="wb-agent-button" data-agent-action="search">打开在线搜索 ↗</button>' : `<div class="wb-agent-playlist-preview"><header><div><small>PLAYLIST PREVIEW / 示例歌单</small><strong>Peak Hour Reference</strong></div><button class="wb-agent-button wb-agent-primary" data-agent-action="play" data-track="0">▶ 全部试听</button></header>${djDemoTracks.map((track, index) => `<div class="wb-agent-track"><span>0${index + 1}</span><img src="${h(djPlaceholderCover)}" alt=""/><p><strong>${h(track.title)}</strong><small>${h(track.artist)}</small></p><button class="wb-agent-button" data-agent-action="play" data-track="${index}" aria-label="试听 ${h(track.title)}">▶</button></div>`).join("")}<button class="wb-agent-open-playlists" data-agent-action="playlists">在云端歌单中查看 <span>↗</span></button></div>`}` : ""}</article>`;
  }
  private settingsView() {
    const cfg = this.settingsDraft;
    return `${this.header("模型配置", "Agent 的模型、推理与生成偏好", true)}<div class="wb-agent-settings"><span class="wb-agent-eyebrow">MODEL CONNECTION / 连接设置</span><label>API Base URL<input data-agent-config="url" type="url" value="${h(cfg.url)}" placeholder="https://api.example.com"/></label><label>API Key<input type="password" placeholder="原型无需填写真实密钥" disabled/></label><label>模型名称<input data-agent-config="model" value="${h(cfg.model)}" maxlength="100" list="dj-agent-models"/><datalist id="dj-agent-models"><option value="deepseek-v4-flash"></option><option value="deepseek-v4-pro"></option></datalist></label><label>创造力 <output id="dj-agent-temp-value">${cfg.temperature}</output><input data-agent-config="temperature" type="range" min="0" max="1.5" step="0.1" value="${cfg.temperature}"/></label><p class="wb-agent-settings-note">本地原型仅保存显示偏好，尚未连接模型服务。</p>${this.notice ? `<p class="wb-agent-notice" role="status">${h(this.notice)}</p>` : ""}<div class="wb-agent-settings-actions"><button class="wb-agent-button" data-agent-action="test">测试连接</button><span></span><button class="wb-agent-button" data-agent-action="settings-close">取消</button><button class="wb-agent-button wb-agent-primary" data-agent-action="settings-save">保存配置</button></div></div>`;
  }
  private act(button: HTMLButtonElement) {
    const action = button.dataset.agentAction;
    if (action === "send") { this.send(); return; }
    if (action === "prompt") { this.session.draft = prompts[Number(button.dataset.prompt)]?.[3] ?? ""; this.send(); return; }
    if (action === "play") { this.actions.playSample(Number(button.dataset.track) || 0); return; }
    if (action === "search") { this.actions.openSearch(); return; }
    if (action === "playlists") { this.actions.openPlaylists(); return; }
    if (action === "account") { this.actions.openAccount(); return; }
    if (action === "toggle-sidebar") this.sidebarOpen = !this.sidebarOpen;
    if (action === "new") { const s = newSession(); this.sessions.unshift(s); this.activeId = s.id; this.notice = ""; this.renameId = ""; this.deleteId = ""; }
    if (action === "switch" && this.sessions.some(s => s.id === button.dataset.session)) { this.activeId = button.dataset.session!; this.notice = ""; this.renameId = ""; this.deleteId = ""; }
    if ((action === "new" || action === "switch") && window.innerWidth <= 700) this.sidebarOpen = false;
    if (action === "rename") { this.renameId = button.dataset.session!; this.deleteId = ""; }
    if (action === "delete") { this.deleteId = button.dataset.session!; this.renameId = ""; }
    if (action === "edit-cancel") { this.renameId = ""; this.deleteId = ""; }
    if (action === "rename-save") { this.saveRename(); return; }
    if (action === "delete-confirm") {
      window.clearTimeout(this.runs.get(this.deleteId)); this.runs.delete(this.deleteId);
      this.sessions = this.sessions.filter(s => s.id !== this.deleteId);
      if (!this.sessions.length) this.sessions.push(newSession());
      if (this.activeId === this.deleteId) this.activeId = this.sessions[0].id;
      this.deleteId = "";
    }
    if (action === "stop") { window.clearTimeout(this.runs.get(this.activeId)); this.runs.delete(this.activeId); this.session.messages.push({ role: "assistant", text: "已停止本次演示。你可以调整需求后继续。" }); }
    if (action === "verify") this.notice = "数据源验证入口已保留；当前原型未连接 1001Tracklists。";
    if (action === "settings") { this.settingsDraft = { ...this.config }; this.settingsOpen = true; this.notice = ""; }
    if (action === "settings-close") { this.settingsOpen = false; this.notice = ""; }
    if (action === "settings-save") {
      const model = this.settingsDraft.model.trim();
      if (!model || !/^https?:\/\//i.test(this.settingsDraft.url.trim())) { this.notice = "请填写模型名称和有效的 HTTP / HTTPS 地址。"; this.render(); return; }
      this.config = { ...this.settingsDraft, model, url: this.settingsDraft.url.trim() }; this.settingsOpen = false; this.notice = "模型显示偏好已保存。";
    }
    if (action === "test") this.notice = "演示模式 · 未发起连接，连接状态将在正式接入后显示。";
    if (action === "reset-model") { this.config.model = defaults.model; this.config.effort = defaults.effort; }
    this.persist(); this.render(action === "switch" || action === "stop");
    if (action === "rename") { this.focus("#dj-agent-rename"); this.host?.querySelector<HTMLInputElement>("#dj-agent-rename")?.select(); }
    else if (action === "settings") this.focus('[data-agent-config="url"]');
    else if (action === "settings-close" || action === "settings-save") this.focus('[data-agent-action="settings"]');
    else if (action === "toggle-sidebar" || action === "delete-confirm") this.focus('[data-agent-action="toggle-sidebar"]');
    else this.focus("#dj-agent-input");
  }
  private saveRename() {
    const value = this.host?.querySelector<HTMLInputElement>("#dj-agent-rename")?.value.trim();
    const session = this.sessions.find(s => s.id === this.renameId);
    if (!value || !session) return;
    session.title = value.slice(0, 60); this.renameId = ""; this.persist(); this.render(); this.focus("#dj-agent-input");
  }
  private send() {
    const s = this.session, text = s.draft.trim();
    if (!text || this.runs.has(s.id)) { this.focus("#dj-agent-input"); return; }
    s.messages.push({ role: "user", text }); s.draft = "";
    if (s.title === "新会话") s.title = text.slice(0, 24);
    this.notice = "";
    this.runs.set(s.id, window.setTimeout(() => {
      this.runs.delete(s.id);
      const intent = intentFor(text);
      s.messages.push({ role: "assistant", text: demoReply(intent), intent });
      this.persist();
      if (this.activeId === s.id && !this.settingsOpen && !this.renameId && !this.deleteId) this.render(true);
    }, 1600));
    this.persist(); this.render(true); this.focus("#dj-agent-input");
  }
}
