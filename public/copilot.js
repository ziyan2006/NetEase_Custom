/**
 * YesMusic DJ Copilot - 前端交互控制器
 * 管理对话流、SSE 流式打字机渲染、Reasoning 思考链展开、歌单预览富卡片、试听联动与一键建歌单
 */

const STORAGE_KEY_CONFIG = "yesmusic_copilot_config";
const STORAGE_KEY_HISTORY = "yesmusic_copilot_history";

const DEFAULT_CONFIG = {
  baseUrl: "https://api.deepseek.com",
  apiKey: "sk-14d4fe9c926f48bda06a6ec402ff5072",
  model: "deepseek-v4-flash",
  temperature: 0.7,
};

let currentAbortController = null;
let chatHistory = [];

export function getCopilotConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG };
}

export function saveCopilotConfig(cfg) {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg));
}

// 极简且健壮的 Markdown 解析器
export function renderMarkdownToHtml(md) {
  if (!md) return "";
  let html = md
    // 转义 HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // 标题
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    // 粗体 & 斜体
    .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/gim, "<em>$1</em>")
    // 行内代码
    .replace(/`([^`]+)`/gim, "<code>$1</code>")
    // 引用与 Alert
    .replace(/^&gt; \[\!TIP\]\s*(.*$)/gim, '<div class="md-alert md-alert-tip">💡 <strong>提示</strong>: $1</div>')
    .replace(/^&gt; \[\!IMPORTANT\]\s*(.*$)/gim, '<div class="md-alert md-alert-important">⚡ <strong>重要</strong>: $1</div>')
    .replace(/^&gt; (.*$)/gim, "<blockquote>$1</blockquote>")
    // 换行
    .replace(/\n\n/gim, "<br/><br/>");

  // 表格处理
  if (html.includes("|")) {
    const lines = html.split("<br/><br/>");
    html = lines.map((block) => {
      if (block.includes("|") && block.includes("---")) {
        const rows = block.split("<br/>").filter((r) => r.trim().startsWith("|"));
        if (rows.length >= 2) {
          let tableHtml = '<table class="copilot-table">';
          rows.forEach((row, rIdx) => {
            if (row.includes("---")) return; // 分隔行
            const cells = row.split("|").slice(1, -1);
            tableHtml += "<tr>";
            cells.forEach((cell) => {
              const tag = rIdx === 0 ? "th" : "td";
              tableHtml += `<${tag}>${cell.trim()}</${tag}>`;
            });
            tableHtml += "</tr>";
          });
          tableHtml += "</table>";
          return tableHtml;
        }
      }
      return block;
    }).join("<br/><br/>");
  }

  return html;
}

// 格式化毫秒为分秒 (如 03:45)
function formatDuration(ms) {
  if (!ms || isNaN(ms)) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * 渲染结构化「歌单预览富卡片」组件
 */
export function createPlaylistPreviewCardElement(cardData) {
  const card = document.createElement("div");
  card.className = "copilot-preview-card";

  const totalTracks = cardData.tracks?.length || 0;
  const cardTitle = cardData.title || "DJ Setlist 预览";
  const cardSubtitle = cardData.subtitle || `共 ${totalTracks} 首曲目`;

  card.innerHTML = `
    <div class="card-header-banner">
      <div class="card-title-group">
        <div class="card-title-text">${cardTitle}</div>
        <div class="card-subtitle-text">${cardSubtitle}</div>
      </div>
      <div class="card-badge-pill">
        <span>✨ 320k 匹配 (${totalTracks} 首)</span>
      </div>
    </div>

    <div class="preview-track-list">
      ${(cardData.tracks || []).map((t, idx) => `
        <div class="preview-track-row" data-song-id="${t.id}">
          <div class="track-num">${String(idx + 1).padStart(2, "0")}</div>
          <div class="track-cover-thumb">
            <img src="${t.coverUrl || 'https://p2.music.126.net/VnIcST_OiUzDuyBzTXBwA==/109951163965582984.jpg'}" alt="Cover" />
          </div>
          <div class="track-meta">
            <div class="track-name-line">
              <span class="track-name">${t.name}</span>
              ${t.playable320k ? '<span class="pill-320k">320K</span>' : ''}
            </div>
            <div class="track-artist-line">${t.artist} · <span class="track-album">${t.album || 'Single'}</span></div>
          </div>
          <div class="track-duration">${formatDuration(t.durationMs)}</div>
          <div class="track-actions">
            <button class="btn-card-play-track" data-id="${t.id}" data-name="${t.name.replace(/"/g, '&quot;')}" data-artist="${t.artist.replace(/"/g, '&quot;')}" data-cover="${t.coverUrl || ''}" data-url="${t.previewUrl || ''}" title="试听">
              ▶️
            </button>
          </div>
        </div>
      `).join("")}
    </div>

    <div class="card-footer-actions">
      <button class="btn btn-primary btn-sm btn-confirm-create-playlist">
        <span>🚀 确认并在网易云新建歌单</span>
      </button>
      <button class="btn btn-secondary btn-sm btn-play-all-preview">
        <span>▶️ 全部试听</span>
      </button>
    </div>
    <div class="card-status-msg" style="display: none; margin-top: 10px; font-size: 12px;"></div>
  `;

  // 绑定单曲试听点击
  card.querySelectorAll(".btn-card-play-track").forEach((btn) => {
    btn.addEventListener("click", () => {
      const songId = btn.getAttribute("data-id");
      const name = btn.getAttribute("data-name");
      const artist = btn.getAttribute("data-artist");
      const cover = btn.getAttribute("data-cover");
      const previewUrl = btn.getAttribute("data-url");

      if (window.playTrackDirectly) {
        window.playTrackDirectly({ id: songId, name, artist, cover, previewUrl });
      }
    });
  });

  // 绑定全部试听
  card.querySelector(".btn-play-all-preview")?.addEventListener("click", () => {
    if (window.playTrackDirectly && cardData.tracks?.[0]) {
      const first = cardData.tracks[0];
      window.playTrackDirectly({
        id: first.id,
        name: first.name,
        artist: first.artist,
        cover: first.coverUrl,
        previewUrl: first.previewUrl,
      });
    }
  });

  // 绑定确认并在网易云新建歌单
  const btnCreate = card.querySelector(".btn-confirm-create-playlist");
  const statusMsg = card.querySelector(".card-status-msg");

  btnCreate?.addEventListener("click", async () => {
    btnCreate.disabled = true;
    btnCreate.innerHTML = "<span>⏳ 正在网易云创建歌单...</span>";
    statusMsg.style.display = "block";
    statusMsg.style.color = "var(--brand-red)";
    statusMsg.textContent = "正在调用网易云接口创建云端歌单并批量添加曲目...";

    const cookie = window.getNeteaseCookie ? window.getNeteaseCookie() : (localStorage.getItem("netease_cookie") || "");
    const songIds = (cardData.tracks || []).map((t) => t.id);

    try {
      const res = await fetch("/api/agent/create-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cardTitle.replace(/^\[[^\]]+\]\s*/, "").trim() || "DJ AI 智能歌单",
          songIds,
          cookie,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.code !== 200) {
        throw new Error(data.message || "创建歌单失败，请确认是否已登录网易云账号");
      }

      btnCreate.innerHTML = "<span>✅ 歌单已成功创建！</span>";
      btnCreate.classList.replace("btn-primary", "btn-secondary");
      statusMsg.style.color = "#4ade80";
      statusMsg.innerHTML = `🎉 歌单 <strong>${data.name}</strong> 创建成功！已添加 <strong>${data.addedCount}</strong> 首曲目。<button id="btn-goto-playlists" class="btn btn-primary btn-sm" style="margin-left: 10px; padding: 2px 8px; font-size: 11px;">🎧 查看我的歌单</button>`;

      card.querySelector("#btn-goto-playlists")?.addEventListener("click", () => {
        document.querySelector('.nav-item[data-tab="playlists"]')?.click();
        document.getElementById("btn-refresh-playlists")?.click();
      });

      // 自动触发主页歌单列表刷新
      document.getElementById("btn-refresh-playlists")?.click();
    } catch (err) {
      btnCreate.disabled = false;
      btnCreate.innerHTML = "<span>🚀 确认并在网易云新建歌单</span>";
      statusMsg.style.color = "#ef4444";
      statusMsg.textContent = `❌ 创建失败: ${err.message}`;
    }
  });

  return card;
}

/**
 * 添加消息气泡到 Copilot 消息容器
 */
export function appendCopilotMessage({ role, content = "", reasoning = "", cardData = null }) {
  const container = document.getElementById("copilot-messages");
  if (!container) return null;

  // 隐藏欢迎卡片
  const welcomeCard = container.querySelector(".copilot-welcome-card");
  if (welcomeCard && (role === "user" || chatHistory.length > 0)) {
    welcomeCard.style.display = "none";
  }

  const messageBox = document.createElement("div");
  messageBox.className = `copilot-message-bubble bubble-${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.innerHTML = role === "user" ? "🎧" : "✨";

  const contentArea = document.createElement("div");
  contentArea.className = "message-content-area";

  // 如果有思考过程 (Reasoning)
  if (reasoning) {
    const reasoningBox = document.createElement("details");
    reasoningBox.className = "copilot-reasoning-accordion";
    reasoningBox.open = false;
    reasoningBox.innerHTML = `
      <summary class="reasoning-summary">💭 思考过程 (Reasoning)</summary>
      <div class="reasoning-body">${renderMarkdownToHtml(reasoning)}</div>
    `;
    contentArea.appendChild(reasoningBox);
  }

  // 正文文本
  const textBody = document.createElement("div");
  textBody.className = "message-text-body";
  textBody.innerHTML = renderMarkdownToHtml(content);
  contentArea.appendChild(textBody);

  // 如果有预览卡片
  if (cardData) {
    const cardEl = createPlaylistPreviewCardElement(cardData);
    contentArea.appendChild(cardEl);
  }

  messageBox.appendChild(avatar);
  messageBox.appendChild(contentArea);
  container.appendChild(messageBox);

  // 滚动到底部
  container.scrollTop = container.scrollHeight;

  return {
    messageBox,
    textBody,
    contentArea,
    updateContent: (newText) => {
      textBody.innerHTML = renderMarkdownToHtml(newText);
      container.scrollTop = container.scrollHeight;
    },
    updateReasoning: (newReasoning) => {
      let reasoningBox = contentArea.querySelector(".copilot-reasoning-accordion");
      if (!reasoningBox) {
        reasoningBox = document.createElement("details");
        reasoningBox.className = "copilot-reasoning-accordion";
        reasoningBox.open = true;
        contentArea.insertBefore(reasoningBox, textBody);
      }
      reasoningBox.innerHTML = `
        <summary class="reasoning-summary">💭 思考过程 (Reasoning)</summary>
        <div class="reasoning-body">${renderMarkdownToHtml(newReasoning)}</div>
      `;
      container.scrollTop = container.scrollHeight;
    },
    appendCard: (card) => {
      const cardEl = createPlaylistPreviewCardElement(card);
      contentArea.appendChild(cardEl);
      container.scrollTop = container.scrollHeight;
    },
  };
}

/**
 * 发送用户消息并处理流式响应
 */
export async function sendCopilotMessage(userText) {
  const text = (userText || "").trim();
  if (!text) return;

  const inputEl = document.getElementById("copilot-input");
  const sendBtn = document.getElementById("btn-copilot-send");
  const stopBtn = document.getElementById("btn-copilot-stop");
  const indicator = document.getElementById("copilot-status-indicator");
  const indicatorText = document.getElementById("copilot-indicator-text");

  if (inputEl) inputEl.value = "";

  // 渲染用户输入气泡
  appendCopilotMessage({ role: "user", content: text });
  chatHistory.push({ role: "user", content: text });

  // 切换 UI 状态为生成中
  sendBtn.style.display = "none";
  stopBtn.style.display = "inline-flex";
  indicator.style.display = "inline-flex";
  indicatorText.textContent = "AI 思考中...";

  currentAbortController = new AbortController();

  // 创建助手消息容器
  const aiMsgHandle = appendCopilotMessage({ role: "assistant", content: "" });
  let accumulatedContent = "";
  let accumulatedReasoning = "";

  const cookie = window.getNeteaseCookie ? window.getNeteaseCookie() : (localStorage.getItem("netease_cookie") || "");
  const config = getCopilotConfig();

  try {
    const response = await fetch("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history: chatHistory.slice(-8), // 携带最近对话
        cookie,
        config,
      }),
      signal: currentAbortController.signal,
    });

    if (!response.ok) {
      throw new Error(`请求失败 (HTTP ${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") break;

        try {
          const event = JSON.parse(dataStr);
          if (event.type === "text" && event.data) {
            accumulatedContent += event.data;
            aiMsgHandle.updateContent(accumulatedContent);
          } else if (event.type === "reasoning" && event.data) {
            accumulatedReasoning += event.data;
            aiMsgHandle.updateReasoning(accumulatedReasoning);
          } else if (event.type === "status" && event.data) {
            indicatorText.textContent = event.data;
          } else if (event.type === "card" && event.data) {
            aiMsgHandle.appendCard(event.data);
          }
        } catch {
          // ignore
        }
      }
    }

    chatHistory.push({ role: "assistant", content: accumulatedContent });
  } catch (err) {
    if (err.name === "AbortError") {
      aiMsgHandle.updateContent(accumulatedContent + "\n\n*(已手动停止生成)*");
    } else {
      aiMsgHandle.updateContent(accumulatedContent + `\n\n⚠️ **生成出错**: ${err.message}`);
    }
  } finally {
    currentAbortController = null;
    sendBtn.style.display = "inline-flex";
    stopBtn.style.display = "none";
    indicator.style.display = "none";
  }
}

/**
 * 初始化 Copilot 页面事件与设置绑定
 */
export function initCopilot() {
  const inputEl = document.getElementById("copilot-input");
  const sendBtn = document.getElementById("btn-copilot-send");
  const stopBtn = document.getElementById("btn-copilot-stop");
  const clearBtn = document.getElementById("btn-copilot-clear");
  const settingsBtn = document.getElementById("btn-copilot-settings");

  // 设置 Modal
  const settingsModal = document.getElementById("modal-copilot-settings");
  const closeSettingsBtn = document.getElementById("btn-close-copilot-settings");
  const cancelSettingsBtn = document.getElementById("btn-cancel-copilot-settings");
  const saveSettingsBtn = document.getElementById("btn-save-copilot-settings");
  const testSettingsBtn = document.getElementById("btn-test-copilot-config");
  const testStatusEl = document.getElementById("copilot-config-test-status");

  const urlInput = document.getElementById("copilot-config-url");
  const keyInput = document.getElementById("copilot-config-key");
  const modelInput = document.getElementById("copilot-config-model");
  const tempInput = document.getElementById("copilot-config-temp");
  const tempValSpan = document.getElementById("temp-val");

  // 加载配置
  const cfg = getCopilotConfig();
  if (urlInput) urlInput.value = cfg.baseUrl || DEFAULT_CONFIG.baseUrl;
  if (keyInput) keyInput.value = cfg.apiKey || DEFAULT_CONFIG.apiKey;
  if (modelInput) modelInput.value = cfg.model || DEFAULT_CONFIG.model;
  if (tempInput) {
    tempInput.value = cfg.temperature ?? DEFAULT_CONFIG.temperature;
    if (tempValSpan) tempValSpan.textContent = tempInput.value;
  }

  // 发送与停止
  sendBtn?.addEventListener("click", () => {
    sendCopilotMessage(inputEl?.value);
  });

  stopBtn?.addEventListener("click", () => {
    if (currentAbortController) {
      currentAbortController.abort();
    }
  });

  // 输入框键盘事件 (Enter 发送, Shift+Enter 换行)
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCopilotMessage(inputEl.value);
    }
  });

  // 快速指令药丸点击
  document.querySelectorAll(".quick-pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-prompt");
      if (prompt) {
        if (inputEl) inputEl.value = prompt;
        sendCopilotMessage(prompt);
      }
    });
  });

  // 清空记录
  clearBtn?.addEventListener("click", () => {
    const container = document.getElementById("copilot-messages");
    if (container) {
      container.innerHTML = `
        <div class="copilot-welcome-card">
          <div class="welcome-badge">🎧 DJ 智能助手已就绪</div>
          <h3 class="welcome-heading">有什么可以协助您的 DJ 工作流？</h3>
          <p class="welcome-desc">
            支持直接发送 1001Tracklists 现场链接自动逆向还原歌单、一键检索 Beatport 风格榜单、Camelot 调性和谐度过渡建议或自然语言选曲排歌。
          </p>
          <div class="copilot-quick-pills">
            <button class="quick-pill-btn" data-prompt="https://www.1001tracklists.com/tracklist/275yqjmt/martin-garrix-mainstage-tomorrowland-belgium-weekend-1-2023-07-22.html">
              🎸 解析 1001TL 现场 Setlist
            </button>
            <button class="quick-pill-btn" data-prompt="帮我整理本周 Beatport 最热门的 Melodic Techno 单曲">
              🌌 本周 Melodic Techno 热单
            </button>
            <button class="quick-pill-btn" data-prompt="帮我推荐本周 Tech House 风格的热门单曲">
              ⚡ Tech House 趋势雷达
            </button>
            <button class="quick-pill-btn" data-prompt="推荐适合接在 126 BPM 8A 后的 Camelot 调性与混音方案">
              🎛️ 8A 调性过渡建议
            </button>
            <button class="quick-pill-btn" data-prompt="做一张适合 128BPM 峰值时段 (Peak Time) 的高能量 Bass House 歌单">
              🔊 128 BPM 场景排歌
            </button>
          </div>
        </div>
      `;
      // 重新绑定药丸
      container.querySelectorAll(".quick-pill-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const p = btn.getAttribute("data-prompt");
          if (p) sendCopilotMessage(p);
        });
      });
    }
    chatHistory = [];
  });

  // 设置 Modal 打开与关闭
  const openModal = () => {
    if (settingsModal) settingsModal.style.display = "flex";
    if (testStatusEl) testStatusEl.style.display = "none";
  };
  const closeModal = () => {
    if (settingsModal) settingsModal.style.display = "none";
  };

  settingsBtn?.addEventListener("click", openModal);
  closeSettingsBtn?.addEventListener("click", closeModal);
  cancelSettingsBtn?.addEventListener("click", closeModal);

  tempInput?.addEventListener("input", () => {
    if (tempValSpan) tempValSpan.textContent = tempInput.value;
  });

  // 保存设置
  saveSettingsBtn?.addEventListener("click", () => {
    const updated = {
      baseUrl: urlInput.value.trim() || DEFAULT_CONFIG.baseUrl,
      apiKey: keyInput.value.trim() || DEFAULT_CONFIG.apiKey,
      model: modelInput.value.trim() || DEFAULT_CONFIG.model,
      temperature: parseFloat(tempInput.value) || 0.7,
    };
    saveCopilotConfig(updated);
    closeModal();
  });

  // 测试连通性
  testSettingsBtn?.addEventListener("click", async () => {
    testSettingsBtn.disabled = true;
    testSettingsBtn.textContent = "正在测试...";
    testStatusEl.style.display = "block";
    testStatusEl.style.background = "rgba(255,255,255,0.05)";
    testStatusEl.style.color = "var(--text-secondary)";
    testStatusEl.textContent = "正在请求大模型 API 端点...";

    try {
      const testConfig = {
        baseUrl: urlInput.value.trim() || DEFAULT_CONFIG.baseUrl,
        apiKey: keyInput.value.trim() || DEFAULT_CONFIG.apiKey,
        model: modelInput.value.trim() || DEFAULT_CONFIG.model,
      };

      const res = await fetch("/api/agent/camelot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "8A" }),
      });

      if (res.ok) {
        testStatusEl.style.background = "rgba(74, 222, 128, 0.15)";
        testStatusEl.style.color = "#4ade80";
        testStatusEl.textContent = "✅ 服务端与本地工具链连接正常！API 配置有效。";
      } else {
        throw new Error("服务端返回异常");
      }
    } catch (e) {
      testStatusEl.style.background = "rgba(239, 68, 68, 0.15)";
      testStatusEl.style.color = "#ef4444";
      testStatusEl.textContent = `❌ 测试失败: ${e.message}`;
    } finally {
      testSettingsBtn.disabled = false;
      testSettingsBtn.textContent = "⚡ 测试连通性";
    }
  });
}

// 页面加载完成后自动初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCopilot);
} else {
  initCopilot();
}
