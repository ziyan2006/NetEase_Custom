// YesPlayMusic UI Logic & NetEase Exporter Frontend Engine
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
  playlists: "云端歌单导出",
  settings: "导出目录配置",
  local: "本地单文件转码",
};

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const targetTab = item.dataset.tab;
    navItems.forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");

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
  });
});

// User State Management
const userAvatarImg = document.querySelector("#user-avatar-img");
const userNameLabel = document.querySelector("#user-name-label");
const userBadgePill = document.querySelector("#user-badge-pill");

let qrPollTimer = null;
let currentCookie = localStorage.getItem("netease_cookie") || "";

let mockPlaylists = [
  { id: "pl_01", name: "House Peak Hour", trackCount: 38, coverUrl: "https://p1.music.126.net/6y-Zs72Cg72H0a469J469g==/109951165406022567.jpg" },
  { id: "pl_02", name: "Techno Basement", trackCount: 24, coverUrl: "https://p2.music.126.net/L3838_0_L7676==/109951165406022568.jpg" },
  { id: "pl_03", name: "Pop Remixes 2026", trackCount: 52, coverUrl: "https://p1.music.126.net/8888==/109951165406022569.jpg" },
];

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

function setStatusMessage(msg, isProgress = false, progressPercent = 0) {
  if (!statusCard || !statusText) return;
  statusCard.classList.add("active");
  statusText.textContent = msg;
  if (progressBarFill) {
    progressBarFill.style.width = isProgress ? `${progressPercent}%` : "100%";
  }
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

  mockPlaylists.forEach((pl) => {
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
        </div>
      </div>
      <div class="playlist-name">${pl.name}</div>
      <div class="playlist-track-count">${pl.trackCount || 0} 首曲目</div>
    `;
    playlistContainer.appendChild(card);
  });

  document.querySelectorAll(".btn-export-pl").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      exportPlaylist(btn.dataset.id, btn.dataset.name);
    });
  });
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
      // ignore poll error
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

function createNewPlaylist() {
  const name = prompt("请输入要新建的歌单名称：", "DJ New Set");
  if (!name || !name.trim()) return;
  mockPlaylists.push({
    id: `pl_${Date.now()}`,
    name: name.trim(),
    trackCount: 0,
    coverUrl: "https://p1.music.126.net/6y-Zs72Cg72H0a469J469g==/109951165406022567.jpg"
  });
  renderPlaylists();
  setStatusMessage(`已新建歌单「${name.trim()}」。`);
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

if (btnSelectFolder) btnSelectFolder.addEventListener("click", selectNativeDirectory);
if (btnLoginQr) btnLoginQr.addEventListener("click", showQrModal);
if (btnCloseQr) btnCloseQr.addEventListener("click", hideQrModal);
if (btnCreatePlaylist) btnCreatePlaylist.addEventListener("click", createNewPlaylist);
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

    const link = document.createElement("a");
    link.href = URL.createObjectURL(await response.blob());
    const disposition = response.headers.get("content-disposition") ?? "";
    const encodedName = disposition.match(/filename\*=UTF-8''(.+)/)?.[1];
    link.download = encodedName ? decodeURIComponent(encodedName) : "converted-audio";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setStatusMessage("转换完成，下载已开始。", true, 100);
  } catch (error) {
    setStatusMessage(error.message);
  } finally {
    button.disabled = false;
  }
});
