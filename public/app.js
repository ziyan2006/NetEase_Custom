// YesPlayMusic Full Desktop Client Frontend Engine
const form = document.querySelector("#converter-form");
const statusCard = document.querySelector("#status-card");
const statusText = document.querySelector("#status-text");
const progressBarFill = document.querySelector("#progress-bar-fill");
const button = document.querySelector("#convert");
const outputRootInput = document.querySelector("#output-root");
const btnSelectFolder = document.querySelector("#btn-select-folder");
const btnLoginQr = document.querySelector("#btn-login-qr");
const btnLogout = document.querySelector("#btn-logout");
const qrModal = document.querySelector("#qr-modal");
const btnCloseQr = document.querySelector("#btn-close-qr");
const qrCodeBox = document.querySelector("#qr-code-box");
const playlistContainer = document.querySelector("#playlist-list-container");
const btnCreatePlaylist = document.querySelector("#btn-create-playlist");
const btnRefreshPlaylists = document.querySelector("#btn-refresh-playlists");

// Tab Navigation Logic
const navItems = document.querySelectorAll(".nav-item");
const viewPanels = document.querySelectorAll(".view-panel");
const headerPageTitle = document.querySelector("#header-page-title");

const tabTitles = {
  playlists: "云端歌单",
  search: "在线搜索歌曲",
  settings: "导出目录配置",
  local: "本地单文件转码",
  "playlist-detail": "歌单详情与编辑",
};

function switchTab(targetTab) {
  navItems.forEach((nav) => {
    if (nav.dataset.tab === targetTab) nav.classList.add("active");
    else nav.classList.remove("active");
  });

  viewPanels.forEach((panel) => {
    if (panel.id === `tab-${targetTab}`) {
      panel.classList.add("active");
    } else {
      panel.classList.remove("active");
    }
  });

  if (headerPageTitle && tabTitles[targetTab]) {
    headerPageTitle.textContent = tabTitles[targetTab];
  }
}

navItems.forEach((item) => {
  item.addEventListener("click", () => switchTab(item.dataset.tab));
});

// User State Management
const userAvatarImg = document.querySelector("#user-avatar-img");
const userNameLabel = document.querySelector("#user-name-label");
const userBadgePill = document.querySelector("#user-badge-pill");

let qrPollTimer = null;
let currentCookie = localStorage.getItem("netease_cookie") || "";

let mockPlaylists = [
  { id: "2029323974", name: "Duktor喜欢的音乐", trackCount: 6, coverUrl: "https://p1.music.126.net/6y-Zs72Cg72H0a469J469g==/109951165406022567.jpg" },
  { id: "pl_01", name: "House Peak Hour", trackCount: 38, coverUrl: "https://p1.music.126.net/6y-Zs72Cg72H0a469J469g==/109951165406022567.jpg" },
  { id: "pl_02", name: "Techno Basement", trackCount: 24, coverUrl: "https://p2.music.126.net/L3838_0_L7676==/109951165406022568.jpg" },
];

function setStatusMessage(msg, isProgress = false, progressPercent = 0) {
  if (!statusCard || !statusText) return;
  statusCard.classList.add("active");
  statusText.textContent = msg;
  if (progressBarFill) {
    progressBarFill.style.width = isProgress ? `${progressPercent}%` : "100%";
  }
}

// 顶层全屏阻断进度遮罩控制
const exportProgressModal = document.querySelector("#export-progress-modal");
const modalProgressTitle = document.querySelector("#modal-progress-title");
const modalProgressSubtitle = document.querySelector("#modal-progress-subtitle");
const modalProgressFill = document.querySelector("#modal-progress-fill");
const modalProgressPercent = document.querySelector("#modal-progress-percent");

function showProgressModal(title, subtitle = "正在从网易云提取音频流并进行 MP3 无损处理...") {
  if (!exportProgressModal) return;
  if (modalProgressTitle) modalProgressTitle.textContent = title;
  if (modalProgressSubtitle) modalProgressSubtitle.textContent = subtitle;
  if (modalProgressFill) modalProgressFill.style.width = "0%";
  if (modalProgressPercent) modalProgressPercent.textContent = "0%";
  exportProgressModal.classList.add("active");
}

function updateProgressModal(percent, subtitle) {
  if (modalProgressFill) modalProgressFill.style.width = `${percent}%`;
  if (modalProgressPercent) modalProgressPercent.textContent = `${Math.min(100, Math.round(percent))}%`;
  if (subtitle && modalProgressSubtitle) modalProgressSubtitle.textContent = subtitle;
}

function hideProgressModal() {
  if (!exportProgressModal) return;
  exportProgressModal.classList.remove("active");
}

const playlistSearchInput = document.querySelector("#playlist-search-input");
let playlistSearchQuery = "";

if (playlistSearchInput) {
  playlistSearchInput.addEventListener("input", (e) => {
    playlistSearchQuery = (e.target.value || "").trim().toLowerCase();
    renderPlaylists();
  });
}

function renderPlaylists() {
  if (!playlistContainer) return;
  playlistContainer.innerHTML = "";

  if (mockPlaylists.length === 0) {
    playlistContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">
        暂无歌单，登录后自动展示，或点击右上角“+ 新建歌单”。
      </div>`;
    return;
  }

  const filtered = mockPlaylists.filter((pl) => {
    if (!playlistSearchQuery) return true;
    return (pl.name || "").toLowerCase().includes(playlistSearchQuery);
  });

  if (filtered.length === 0) {
    playlistContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px;">
        🔍 未找到匹配「<b>${playlistSearchQuery}</b>」的歌单。
      </div>`;
    return;
  }

  filtered.forEach((pl) => {
    const card = document.createElement("div");
    card.className = "playlist-card";
    const cover = pl.coverUrl || pl.coverImgUrl || "https://p2.music.126.net/VnIcST_OiUzDuyBzTXBwA==/109951163965582984.jpg";

    card.innerHTML = `
      <div class="playlist-cover-wrapper">
        <img class="playlist-cover-img" src="${cover}" alt="${pl.name}" />
        <div class="playlist-hover-overlay">
          <div class="export-overlay-btn btn-export-pl" data-id="${pl.id}" data-name="${pl.name}" title="⚡ 导出此歌单">
            ⚡
          </div>
          <div class="delete-overlay-btn btn-del-pl" data-id="${pl.id}" data-name="${pl.name}" title="🗑️ 删除此歌单">
            🗑️
          </div>
        </div>
      </div>
      <div class="playlist-name">${pl.name}</div>
      <div class="playlist-track-count">${pl.trackCount || 0} 首曲目</div>
    `;

    // 点击歌单卡片整体进入歌单详情页
    card.addEventListener("click", () => {
      openPlaylistDetail(pl.id, pl.name, cover);
    });

    playlistContainer.appendChild(card);
  });

  document.querySelectorAll(".btn-export-pl").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      exportPlaylist(btn.dataset.id, btn.dataset.name);
    });
  });

  document.querySelectorAll(".btn-del-pl").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deletePlaylist(btn.dataset.id, btn.dataset.name);
    });
  });
}

async function deletePlaylist(id, name) {
  if (!confirm(`确定要从网易云账号彻底删除歌单「${name}」吗？`)) return;

  const cookie = localStorage.getItem("netease_cookie") || "";

  if (cookie) {
    showProgressModal(`🗑️ 正在删除网易云歌单...`, `正在同步提交至网易云服务器...`);
    try {
      const res = await fetch("/api/playlist/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, cookie }),
      });
      const data = await res.json();
      if (data.code === 200) {
        updateProgressModal(100, `删除网易云歌单「${name}」成功！`);
        setStatusMessage(`已成功删除网易云歌单「${name}」！`);
        await loadUserPlaylists(cookie);
      } else {
        alert("删除歌单失败: " + (data.message || data.msg || "网易云服务器拒绝"));
      }
    } catch (err) {
      alert("删除歌单发生异常: " + err.message);
    } finally {
      setTimeout(hideProgressModal, 800);
    }
  } else {
    mockPlaylists = mockPlaylists.filter((p) => p.id !== id);
    renderPlaylists();
    setStatusMessage(`已删除本地临时歌单「${name}」。`);
  }
}

function updateLoginStatusUI(isLoggedIn, userId = "", userDetail = null) {
  if (isLoggedIn) {
    if (userNameLabel) userNameLabel.textContent = userDetail?.name || `用户 (${userId})`;
    if (userBadgePill) {
      userBadgePill.className = "vip-pill";
      userBadgePill.textContent = "VIP";
    }
    if (userAvatarImg && userDetail?.avatarUrl) {
      userAvatarImg.src = userDetail.avatarUrl;
    }
    if (btnLoginQr) btnLoginQr.style.display = "none";
    if (btnLogout) btnLogout.style.display = "inline-flex";
  } else {
    if (userNameLabel) userNameLabel.textContent = "未登录 (游客)";
    if (userBadgePill) {
      userBadgePill.className = "";
      userBadgePill.textContent = "Guest";
    }
    if (userAvatarImg) {
      userAvatarImg.src = "https://p2.music.126.net/VnIcST_OiUzDuyBzTXBwA==/109951163965582984.jpg";
    }
    if (btnLoginQr) btnLoginQr.style.display = "inline-flex";
    if (btnLogout) btnLogout.style.display = "none";
  }
}

function handleLogout() {
  if (confirm("确定要退出当前网易云账号登录吗？")) {
    localStorage.removeItem("netease_cookie");
    mockPlaylists = [];
    renderPlaylists();
    updateLoginStatusUI(false);
    setStatusMessage("已退出登录，处于游客模式。");
  }
}

if (btnLogout) btnLogout.addEventListener("click", handleLogout);

async function loadUserPlaylists(cookie) {
  if (!cookie) {
    updateLoginStatusUI(false);
    return;
  }
  try {
    setStatusMessage("正在向网易云服务器获取您的真实歌单列表…", true, 30);
    const res = await fetch(`/api/user/playlists?cookie=${encodeURIComponent(cookie)}`);
    const data = await res.json();
    if (data.code === 200 && Array.isArray(data.playlists)) {
      mockPlaylists = data.playlists;
      renderPlaylists();
      updateLoginStatusUI(true, data.userId);
      setStatusMessage(`成功获取到 ${data.playlists.length} 个真实网易云歌单！`, true, 100);
    } else {
      updateLoginStatusUI(false);
      setStatusMessage(data.message || "登录 Cookie 已过期，请重新扫码。");
      localStorage.removeItem("netease_cookie");
    }
  } catch (err) {
    updateLoginStatusUI(false);
    setStatusMessage("获取真实歌单失败：" + err.message);
  }
}

function hideQrModal() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }
  if (qrModal) qrModal.classList.remove("active");
}
window.hideQrModal = hideQrModal;

function startQrPolling(unikey) {
  if (qrPollTimer) clearInterval(qrPollTimer);
  const statusTextEl = document.querySelector("#qr-status-text");

  qrPollTimer = setInterval(async () => {
    try {
      const checkRes = await fetch(`/api/login/qr/check?key=${encodeURIComponent(unikey)}`);
      const checkData = await checkRes.json();
      if (checkData.code === 800) {
        if (statusTextEl) statusTextEl.textContent = "二维码已过期，请重新打开弹窗刷新";
        clearInterval(qrPollTimer);
      } else if (checkData.code === 801) {
        if (statusTextEl) statusTextEl.textContent = "请打开网易云音乐手机 App 扫描二维码";
      } else if (checkData.code === 802) {
        if (statusTextEl) statusTextEl.textContent = "已扫描成功！请在手机上点击“确认登录”";
      } else if (checkData.code === 803) {
        if (statusTextEl) statusTextEl.textContent = "授权登录成功！正在加载真实歌单...";
        clearInterval(qrPollTimer);
        const userCookie = checkData.cookie || checkData.cookies || `MUSIC_U=${unikey}`;
        localStorage.setItem("netease_cookie", userCookie);
        loadUserPlaylists(userCookie);
        setTimeout(hideQrModal, 1000);
      } else if (checkData.code === 8821) {
        if (statusTextEl) {
          statusTextEl.innerHTML = `<span style="color:#f87171; font-weight: bold;">⚠️ 检测到网易云扫码风控限制 (8821)<br/>请在下方框内粘贴浏览器端的 MUSIC_U 直接登录。</span>`;
        }
        clearInterval(qrPollTimer);
      }
    } catch (e) {
      // ignore
    }
  }, 2000);
}

async function showQrModal() {
  if (window.electronAPI && typeof window.electronAPI.openNeteaseLogin === "function") {
    window.electronAPI.openNeteaseLogin();
    return;
  }

  if (!qrModal) return;
  qrModal.classList.add("active");

  const box = document.querySelector("#qr-code-box");
  const statusTextEl = document.querySelector("#qr-status-text");

  if (qrPollTimer) clearInterval(qrPollTimer);

  const tempKey = `dj_key_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const tempUrl = `https://music.163.com/login?codekey=${tempKey}`;
  if (box && window.QRCodeLib && typeof window.QRCodeLib.generateQrSvg === "function") {
    box.innerHTML = window.QRCodeLib.generateQrSvg(tempUrl, 180);
  }
  if (statusTextEl) statusTextEl.textContent = "请打开网易云音乐手机 App 扫描二维码";

  try {
    const res = await fetch("/api/login/qr/key");
    const data = await res.json();
    const activeKey = data.unikey || tempKey;
    const realUrl = `https://music.163.com/login?codekey=${activeKey}`;
    if (box && window.QRCodeLib) {
      box.innerHTML = window.QRCodeLib.generateQrSvg(realUrl, 180);
    }
    startQrPolling(activeKey);
  } catch (err) {
    startQrPolling(tempKey);
  }
}

async function selectNativeDirectory() {
  if (window.electronAPI && typeof window.electronAPI.selectDirectory === "function") {
    const selected = await window.electronAPI.selectDirectory();
    if (selected) {
      outputRootInput.value = selected;
    }
  } else {
    const typed = prompt("请输入导出统一根目录路径：", outputRootInput.value);
    if (typed) outputRootInput.value = typed;
  }
}

const createPlaylistModal = document.querySelector("#create-playlist-modal");
const inputNewPlaylistName = document.querySelector("#input-new-playlist-name");
const btnCancelCreatePlaylist = document.querySelector("#btn-cancel-create-playlist");
const btnConfirmCreatePlaylist = document.querySelector("#btn-confirm-create-playlist");

function openCreatePlaylistModal() {
  if (!createPlaylistModal) return;
  if (inputNewPlaylistName) inputNewPlaylistName.value = "";
  createPlaylistModal.classList.add("active");
  setTimeout(() => inputNewPlaylistName?.focus(), 100);
}

function hideCreatePlaylistModal() {
  if (!createPlaylistModal) return;
  createPlaylistModal.classList.remove("active");
}

async function handleConfirmCreatePlaylist() {
  const rawName = inputNewPlaylistName ? inputNewPlaylistName.value.trim() : "";
  if (!rawName) {
    alert("请输入有效的歌单名称！");
    return;
  }

  hideCreatePlaylistModal();

  const cookie = localStorage.getItem("netease_cookie") || "";
  const trimmedName = rawName;

  if (cookie) {
    showProgressModal(`➕ 正在新建网易云歌单...`, `正在同步提交至网易云服务器...`);
    try {
      const res = await fetch("/api/playlist/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, privacy: 0, cookie }),
      });
      const data = await res.json();
      if (data.code === 200 && (data.playlist || data.id)) {
        updateProgressModal(100, `新建网易云歌单「${trimmedName}」成功！`);
        setStatusMessage(`成功在您的网易云账号下新建歌单「${trimmedName}」！`);
        await loadUserPlaylists(cookie);
      } else {
        alert("创建歌单失败: " + (data.message || data.msg || "网易云服务器拒绝"));
      }
    } catch (err) {
      alert("创建歌单发生错误: " + err.message);
    } finally {
      setTimeout(hideProgressModal, 800);
    }
  } else {
    mockPlaylists.unshift({
      id: `pl_${Date.now()}`,
      name: trimmedName,
      trackCount: 0,
      coverUrl: "https://p1.music.126.net/6y-Zs72Cg72H0a469J469g==/109951165406022567.jpg"
    });
    renderPlaylists();
    setStatusMessage(`(游客模式) 已新建本地临时歌单「${trimmedName}」，登录后可同步云端。`);
  }
}

async function exportPlaylist(id, name) {
  const root = outputRootInput.value || "D:\\DJ_Music_Library";
  const cookie = localStorage.getItem("netease_cookie") || "";
  
  showProgressModal(`⚡ 正在导出歌单「${name}」...`, `正在向网易云服务端校验 VIP 账号身份与歌单曲目数据...`);
  updateProgressModal(25, `从网易云获取 320k 极高音质直链中...`);
  setStatusMessage(`正在导出歌单「${name}」曲目，请稍候…`, true, 25);
  
  try {
    updateProgressModal(50, `正在进行 NCM 解密与 FFmpeg 高品质 320k MP3 压制压盘...`);
    const res = await fetch("/api/playlist/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, outputRoot: root, cookie })
    });
    
    const data = await res.json();
    if (res.ok && data.code === 200) {
      updateProgressModal(100, `歌单导出完成！成功: ${data.successCount} 首，失败: ${data.failedCount} 首。`);
      setStatusMessage(`歌单「${name}」导出成功！成功: ${data.successCount} 首，失败: ${data.failedCount} 首。文件保存在: ${root}\\${name}\\`, true, 100);
    } else {
      updateProgressModal(100, `导出失败：${data.message || "未知错误"}`);
      setStatusMessage(`导出失败：${data.message || "未知错误"}`);
    }
  } catch (err) {
    updateProgressModal(100, `导出异常：${err.message}`);
    setStatusMessage(`导出发生异常：${err.message}`);
  } finally {
    setTimeout(hideProgressModal, 1200);
  }
}

// 🎵 1. 全局音乐播放器引擎 (Global Audio Player Engine)
const audioEngine = document.querySelector("#global-audio-engine");
const playerCoverImg = document.querySelector("#player-cover-img");
const playerSongTitle = document.querySelector("#player-song-title");
const playerArtistName = document.querySelector("#player-artist-name");
const btnPlayerToggle = document.querySelector("#btn-player-toggle");
const btnPlayerPrev = document.querySelector("#btn-player-prev");
const btnPlayerNext = document.querySelector("#btn-player-next");
const playerSeekBar = document.querySelector("#player-seek-bar");
const playerTimeCurrent = document.querySelector("#player-time-current");
const playerTimeTotal = document.querySelector("#player-time-total");
const playerVolumeSlider = document.querySelector("#player-volume-slider");

let playerQueue = [];
let currentTrackIndex = -1;
let isAudioPlaying = false;

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
}

async function playTrack(song) {
  if (!song || !song.id) return;
  const cookie = localStorage.getItem("netease_cookie") || "";
  
  if (playerSongTitle) playerSongTitle.textContent = song.name || "未知曲目";
  if (playerArtistName) playerArtistName.textContent = song.artist || "未知歌手";
  if (playerCoverImg && song.cover) playerCoverImg.src = song.cover;

  setStatusMessage(`正在加载音轨: ${song.artist} - ${song.name}...`, true, 50);

  try {
    const res = await fetch(`/api/song/url?id=${song.id}&cookie=${encodeURIComponent(cookie)}`);
    const data = await res.json();
    const streamUrl = data.data?.[0]?.url;

    if (!streamUrl) {
      alert(`无法提取《${song.name}》播放音频，该曲目可能为网易云受限或 VIP 会员专属。`);
      return;
    }

    if (audioEngine) {
      audioEngine.src = streamUrl;
      await audioEngine.play();
      isAudioPlaying = true;
      if (btnPlayerToggle) btnPlayerToggle.textContent = "⏸️";
      setStatusMessage(`正在播放: ${song.artist} - ${song.name}`);
    }
  } catch (err) {
    alert("播放音频发生异常: " + err.message);
  }
}

if (audioEngine) {
  audioEngine.addEventListener("timeupdate", () => {
    if (!audioEngine.duration) return;
    const current = audioEngine.currentTime;
    const total = audioEngine.duration;
    if (playerSeekBar) playerSeekBar.value = (current / total) * 100;
    if (playerTimeCurrent) playerTimeCurrent.textContent = formatDuration(current);
    if (playerTimeTotal) playerTimeTotal.textContent = formatDuration(total);
  });

  audioEngine.addEventListener("ended", () => {
    if (currentTrackIndex >= 0 && currentTrackIndex < playerQueue.length - 1) {
      currentTrackIndex++;
      playTrack(playerQueue[currentTrackIndex]);
    } else {
      isAudioPlaying = false;
      if (btnPlayerToggle) btnPlayerToggle.textContent = "▶️";
    }
  });
}

if (btnPlayerToggle) {
  btnPlayerToggle.addEventListener("click", () => {
    if (!audioEngine || !audioEngine.src) return;
    if (isAudioPlaying) {
      audioEngine.pause();
      isAudioPlaying = false;
      btnPlayerToggle.textContent = "▶️";
    } else {
      audioEngine.play();
      isAudioPlaying = true;
      btnPlayerToggle.textContent = "⏸️";
    }
  });
}

if (btnPlayerPrev) {
  btnPlayerPrev.addEventListener("click", () => {
    if (currentTrackIndex > 0) {
      currentTrackIndex--;
      playTrack(playerQueue[currentTrackIndex]);
    }
  });
}

if (btnPlayerNext) {
  btnPlayerNext.addEventListener("click", () => {
    if (currentTrackIndex < playerQueue.length - 1) {
      currentTrackIndex++;
      playTrack(playerQueue[currentTrackIndex]);
    }
  });
}

if (playerSeekBar) {
  playerSeekBar.addEventListener("input", () => {
    if (audioEngine && audioEngine.duration) {
      audioEngine.currentTime = (playerSeekBar.value / 100) * audioEngine.duration;
    }
  });
}

if (playerVolumeSlider) {
  playerVolumeSlider.addEventListener("input", () => {
    if (audioEngine) audioEngine.volume = parseFloat(playerVolumeSlider.value);
  });
}

// 🔍 2. 歌曲在线检索模块 (Online Search Module)
const onlineSearchInput = document.querySelector("#online-search-input");
const btnOnlineSearch = document.querySelector("#btn-online-search");
const searchResultsContainer = document.querySelector("#search-results-container");

async function performOnlineSearch() {
  const query = onlineSearchInput ? onlineSearchInput.value.trim() : "";
  if (!query) {
    alert("请输入搜索关键词！");
    return;
  }

  const cookie = localStorage.getItem("netease_cookie") || "";
  if (searchResultsContainer) {
    searchResultsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 50px;">🔍 正在检索网易云曲库...</div>`;
  }

  try {
    const res = await fetch(`/api/song/search?keywords=${encodeURIComponent(query)}&cookie=${encodeURIComponent(cookie)}`);
    const data = await res.json();
    const songs = data.result?.songs || [];

    if (songs.length === 0) {
      searchResultsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 50px;">未找到与「${query}」相关的歌曲</div>`;
      return;
    }

    renderSongTable(searchResultsContainer, songs, "search");
  } catch (err) {
    searchResultsContainer.innerHTML = `<div style="text-align: center; color: #f87171; padding: 50px;">搜索发生异常: ${err.message}</div>`;
  }
}

if (btnOnlineSearch) btnOnlineSearch.addEventListener("click", performOnlineSearch);
if (onlineSearchInput) {
  onlineSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") performOnlineSearch();
  });
}

// 渲染歌曲列表通用表格 (Song Table Renderer)
function renderSongTable(container, songs, mode = "search", currentPlaylistId = null) {
  if (!container) return;
  container.innerHTML = "";

  const table = document.createElement("table");
  table.className = "song-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width: 50px;">#</th>
        <th>歌曲标题</th>
        <th>歌手</th>
        <th>专辑</th>
        <th style="width: 80px;">时长</th>
        <th style="width: 140px; text-align: right;">操作</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");

  songs.forEach((s, idx) => {
    const artist = s.ar?.map(a => a.name).join(", ") || s.artists?.map(a => a.name).join(", ") || "Unknown";
    const album = s.al?.name || s.album?.name || "Single";
    const cover = s.al?.picUrl || s.album?.artist?.img1v1Url || "https://p2.music.126.net/VnIcST_OiUzDuyBzTXBwA==/109951163965582984.jpg";
    const duration = formatDuration((s.dt || s.duration || 0) / 1000);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>
        <div class="song-cell-title">
          <div class="song-cell-cover"><img src="${cover}" alt="cover" /></div>
          <div>${s.name}</div>
        </div>
      </td>
      <td>${artist}</td>
      <td>${album}</td>
      <td>${duration}</td>
      <td>
        <div class="song-action-btns" style="justify-content: flex-end;">
          <button class="btn-icon-circle btn-play-song" title="▶️ 试听曲目">▶️</button>
          <button class="btn-icon-circle btn-add-song" title="➕ 添加到歌单">➕</button>
          ${mode === "detail" ? `<button class="btn-icon-circle btn-icon-danger btn-remove-song" title="🗑️ 从歌单移除">🗑️</button>` : ""}
        </div>
      </td>
    `;

    // 绑定试听
    tr.querySelector(".btn-play-song").addEventListener("click", () => {
      playerQueue = songs.map(track => ({
        id: track.id,
        name: track.name,
        artist: track.ar?.map(a => a.name).join(", ") || track.artists?.map(a => a.name).join(", ") || "Unknown",
        cover: track.al?.picUrl || track.album?.artist?.img1v1Url || "https://p2.music.126.net/VnIcST_OiUzDuyBzTXBwA==/109951163965582984.jpg"
      }));
      currentTrackIndex = idx;
      playTrack(playerQueue[currentTrackIndex]);
    });

    // 绑定加歌单
    tr.querySelector(".btn-add-song").addEventListener("click", () => {
      openAddToPlaylistModal(s.id, s.name);
    });

    // 绑定歌单移除单曲
    if (mode === "detail" && currentPlaylistId) {
      tr.querySelector(".btn-remove-song").addEventListener("click", () => {
        removeTrackFromPlaylist(currentPlaylistId, s.id, s.name);
      });
    }

    tbody.appendChild(tr);
  });

  container.appendChild(table);
}

// 🎧 3. 歌单详情与曲目编辑 (Playlist Detail Workspace)
let activeDetailPlaylistId = null;

async function openPlaylistDetail(playlistId, playlistName, coverUrl) {
  activeDetailPlaylistId = playlistId;
  switchTab("playlist-detail");

  const detailCover = document.querySelector("#detail-playlist-cover");
  const detailTitle = document.querySelector("#detail-playlist-title");
  const detailCount = document.querySelector("#detail-playlist-count");
  const detailTracksContainer = document.querySelector("#detail-tracks-container");

  if (detailCover) detailCover.src = coverUrl;
  if (detailTitle) detailTitle.textContent = playlistName;
  if (detailCount) detailCount.textContent = "正在向网易云加载曲目列表...";

  const cookie = localStorage.getItem("netease_cookie") || "";
  try {
    const res = await fetch(`/api/playlist/detail?id=${playlistId}&cookie=${encodeURIComponent(cookie)}`);
    const data = await res.json();
    const tracks = data.playlist?.tracks || [];

    if (detailCount) detailCount.textContent = `共 ${tracks.length} 首曲目`;
    renderSongTable(detailTracksContainer, tracks, "detail", playlistId);
  } catch (err) {
    if (detailTracksContainer) {
      detailTracksContainer.innerHTML = `<div style="text-align: center; color: #f87171; padding: 40px;">加载歌单曲目失败: ${err.message}</div>`;
    }
  }
}

const btnBackToPlaylists = document.querySelector("#btn-back-to-playlists");
const btnDetailPlayAll = document.querySelector("#btn-detail-play-all");
const btnDetailExportPl = document.querySelector("#btn-detail-export-pl");

if (btnBackToPlaylists) {
  btnBackToPlaylists.addEventListener("click", () => switchTab("playlists"));
}

if (btnDetailExportPl) {
  btnDetailExportPl.addEventListener("click", () => {
    const detailTitle = document.querySelector("#detail-playlist-title");
    if (activeDetailPlaylistId && detailTitle) {
      exportPlaylist(activeDetailPlaylistId, detailTitle.textContent);
    }
  });
}

// 移除歌单单曲
async function removeTrackFromPlaylist(playlistId, songId, songName) {
  if (!confirm(`确定要将《${songName}》从当前歌单中移除吗？`)) return;
  const cookie = localStorage.getItem("netease_cookie") || "";

  showProgressModal(`🗑️ 正在从歌单移除...`, `《${songName}》`);
  try {
    const res = await fetch("/api/playlist/tracks/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "del", pid: playlistId, trackIds: [songId], cookie })
    });
    const data = await res.json();
    if (data.code === 200) {
      updateProgressModal(100, "从歌单移除单曲成功！");
      setStatusMessage(`已将《${songName}》从歌单移除！`);
      const detailTitle = document.querySelector("#detail-playlist-title");
      openPlaylistDetail(playlistId, detailTitle?.textContent || "", "");
    } else {
      alert("移除失败: " + (data.message || data.msg || "服务器拒绝"));
    }
  } catch (err) {
    alert("移除单曲失败: " + err.message);
  } finally {
    setTimeout(hideProgressModal, 800);
  }
}

// ➕ 4. 添加歌曲到歌单 Modal (Add to Playlist Modal)
const addToPlaylistModal = document.querySelector("#add-to-playlist-modal");
const addModalSongInfo = document.querySelector("#add-modal-song-info");
const modalUserPlaylistList = document.querySelector("#modal-user-playlist-list");
const btnCancelAddToPlaylist = document.querySelector("#btn-cancel-add-to-playlist");

let pendingAddSongId = null;

function openAddToPlaylistModal(songId, songName) {
  pendingAddSongId = songId;
  if (!addToPlaylistModal) return;
  if (addModalSongInfo) addModalSongInfo.textContent = `将《${songName}》添加至以下歌单:`;
  addToPlaylistModal.classList.add("active");

  if (!modalUserPlaylistList) return;
  modalUserPlaylistList.innerHTML = "";

  if (mockPlaylists.length === 0) {
    modalUserPlaylistList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">暂无可用歌单</div>`;
    return;
  }

  mockPlaylists.forEach((pl) => {
    const item = document.createElement("div");
    item.className = "add-playlist-select-item";
    const cover = pl.coverUrl || pl.coverImgUrl || "https://p2.music.126.net/VnIcST_OiUzDuyBzTXBwA==/109951163965582984.jpg";

    item.innerHTML = `
      <div style="width: 36px; height: 36px; border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0;">
        <img src="${cover}" style="width:100%; height:100%; object-fit: cover;" />
      </div>
      <div style="flex: 1; overflow: hidden;">
        <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pl.name}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${pl.trackCount || 0} 首曲目</div>
      </div>
      <button class="btn btn-primary btn-sm" style="padding: 4px 10px; font-size: 11px;">+ 添加</button>
    `;

    item.addEventListener("click", () => {
      addTrackToTargetPlaylist(pl.id, pl.name, songId);
    });

    modalUserPlaylistList.appendChild(item);
  });
}

function hideAddToPlaylistModal() {
  if (addToPlaylistModal) addToPlaylistModal.classList.remove("active");
}

if (btnCancelAddToPlaylist) btnCancelAddToPlaylist.addEventListener("click", hideAddToPlaylistModal);

async function addTrackToTargetPlaylist(playlistId, playlistName, songId) {
  hideAddToPlaylistModal();
  const cookie = localStorage.getItem("netease_cookie") || "";

  showProgressModal(`➕ 正在添加至歌单...`, `目标: ${playlistName}`);
  try {
    const res = await fetch("/api/playlist/tracks/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "add", pid: playlistId, trackIds: [songId], cookie })
    });
    const data = await res.json();
    if (data.code === 200) {
      updateProgressModal(100, `成功添加至「${playlistName}」！`);
      setStatusMessage(`已成功将歌曲添加至网易云歌单「${playlistName}」！`);
      loadUserPlaylists(cookie);
    } else {
      alert("添加失败: " + (data.message || data.msg || "服务器拒绝"));
    }
  } catch (err) {
    alert("添加单曲失败: " + err.message);
  } finally {
    setTimeout(hideProgressModal, 800);
  }
}

if (btnSelectFolder) btnSelectFolder.addEventListener("click", selectNativeDirectory);
if (btnLoginQr) btnLoginQr.addEventListener("click", showQrModal);
if (btnCloseQr) btnCloseQr.addEventListener("click", hideQrModal);
if (btnCreatePlaylist) btnCreatePlaylist.addEventListener("click", openCreatePlaylistModal);
if (btnCancelCreatePlaylist) btnCancelCreatePlaylist.addEventListener("click", hideCreatePlaylistModal);
if (btnConfirmCreatePlaylist) btnConfirmCreatePlaylist.addEventListener("click", handleConfirmCreatePlaylist);
if (inputNewPlaylistName) {
  inputNewPlaylistName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleConfirmCreatePlaylist();
  });
}

if (btnRefreshPlaylists) {
  btnRefreshPlaylists.addEventListener("click", () => {
    const cookie = localStorage.getItem("netease_cookie") || "";
    if (cookie) loadUserPlaylists(cookie);
    else renderPlaylists();
  });
}

const btnSubmitMusicU = document.querySelector("#btn-submit-music-u");
const inputMusicU = document.querySelector("#input-music-u");

function handleManualCookieSubmit() {
  if (!inputMusicU) return;
  const rawVal = inputMusicU.value.trim();
  if (!rawVal) {
    alert("请输入有效的 MUSIC_U 凭据值！");
    return;
  }
  const userCookie = rawVal.includes("MUSIC_U=") ? rawVal : `MUSIC_U=${rawVal}`;
  localStorage.setItem("netease_cookie", userCookie);
  loadUserPlaylists(userCookie);
  hideQrModal();
  inputMusicU.value = "";
}

if (btnSubmitMusicU) btnSubmitMusicU.addEventListener("click", handleManualCookieSubmit);

if (window.electronAPI && typeof window.electronAPI.onCookieCaptured === "function") {
  window.electronAPI.onCookieCaptured((cookieStr) => {
    localStorage.setItem("netease_cookie", cookieStr);
    loadUserPlaylists(cookieStr);
    setStatusMessage("网易云扫码授权成功，已为您全自动登录并加载歌单！");
  });
}

if (currentCookie) {
  loadUserPlaylists(currentCookie);
} else {
  renderPlaylists();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.querySelector("#file");
  const file = fileInput.files ? fileInput.files[0] : null;
  if (!file) {
    setStatusMessage("请先选择需要转码/解密的本地音频或 NCM 文件。");
    return;
  }

  const targetFormat = document.querySelector("#format").value;
  button.disabled = true;

  showProgressModal(`🎵 正在处理 ${file.name}...`, `正在纯前端解密/转码为 ${targetFormat.toUpperCase()} 音频...`);
  updateProgressModal(25, `读取文件特征并校验魔数头部...`);

  try {
    const isNcm = file.name.toLowerCase().endsWith(".ncm");

    if (isNcm) {
      updateProgressModal(45, `纯前端解密 NCM 专属加密流...`);
      setStatusMessage(`正在纯前端解密 NCM 文件 ${file.name}…`, true, 45);
      const arrayBuffer = await file.arrayBuffer();
      const ncmResult = window.decryptNcm(arrayBuffer);

      const baseName = (ncmResult.artist ? `${ncmResult.artist} - ` : "") + (ncmResult.title || file.name.replace(/\.ncm$/i, ""));
      const decryptedFormat = ncmResult.format;

      if (targetFormat === decryptedFormat) {
        updateProgressModal(100, `NCM 解密完成 (${decryptedFormat.toUpperCase()})，下载已开始！`);
        setStatusMessage("解密完成，直接在浏览器中下载音频…", true, 100);
        const mimeTypes = { mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg" };
        const blob = new Blob([ncmResult.audioBuffer], { type: mimeTypes[decryptedFormat] || "application/octet-stream" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${baseName}.${decryptedFormat}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        setStatusMessage(`NCM 解密完成 (${decryptedFormat.toUpperCase()})，下载已开始。`, true, 100);
        return;
      }

      updateProgressModal(70, `NCM 解密完成，正在本机 FFmpeg 转换为 ${targetFormat.toUpperCase()}...`);
      setStatusMessage(`NCM 解密完成，正在本机 FFmpeg 转换为 ${targetFormat.toUpperCase()}…`, true, 70);
      const mimeTypes = { mp3: "audio/mpeg", flac: "audio/flac" };
      const decryptedBlob = new Blob([ncmResult.audioBuffer], { type: mimeTypes[decryptedFormat] || "application/octet-stream" });
      const tempFile = new File([decryptedBlob], `${baseName}.${decryptedFormat}`, { type: decryptedBlob.type });

      const formData = new FormData();
      formData.append("file", tempFile);
      formData.append("format", targetFormat);

      const response = await fetch("/api/convert", { method: "POST", body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? "转码失败。");
      }

      updateProgressModal(100, `转换完成，下载已开始！`);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      const disposition = response.headers.get("content-disposition") ?? "";
      const encodedName = disposition.match(/filename\*=UTF-8''(.+)/)?.[1];
      link.download = encodedName ? decodeURIComponent(encodedName) : `${baseName}.${targetFormat}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setStatusMessage("转换完成，下载已开始。", true, 100);
      return;
    }

    updateProgressModal(50, `正在本机 FFmpeg 核心引擎中极速转换为 ${targetFormat.toUpperCase()}...`);
    setStatusMessage(`正在本机转换 ${file.name}…`, true, 50);
    const response = await fetch("/api/convert", { method: "POST", body: new FormData(form) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message ?? "转换失败。");
    }

    updateProgressModal(100, `转换完成，下载已开始！`);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await response.blob());
    const disposition = response.headers.get("content-disposition") ?? "";
    const encodedName = disposition.match(/filename\*=UTF-8''(.+)/)?.[1];
    link.download = encodedName ? decodeURIComponent(encodedName) : "converted-audio";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setStatusMessage("转换完成，下载已开始。", true, 100);
  } catch (error) {
    updateProgressModal(100, `处理异常: ${error.message}`);
    setStatusMessage(error.message);
  } finally {
    button.disabled = false;
    setTimeout(hideProgressModal, 1000);
  }
});
