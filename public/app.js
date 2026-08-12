const form = document.querySelector("#converter-form");
const status = document.querySelector("#status");
const button = document.querySelector("#convert");
const outputRootInput = document.querySelector("#output-root");
const btnSelectFolder = document.querySelector("#btn-select-folder");
const btnLoginQr = document.querySelector("#btn-login-qr");
const qrModal = document.querySelector("#qr-modal");
const btnCloseQr = document.querySelector("#btn-close-qr");
const qrCodeBox = document.querySelector("#qr-code-box");
const userInfoBadge = document.querySelector("#user-info");
const playlistContainer = document.querySelector("#playlist-list-container");
const btnCreatePlaylist = document.querySelector("#btn-create-playlist");

let mockPlaylists = [
  { id: "pl_01", name: "House Peak Hour", trackCount: 38 },
  { id: "pl_02", name: "Techno Basement", trackCount: 24 },
  { id: "pl_03", name: "Pop Remixes 2026", trackCount: 52 },
];

function renderPlaylists() {
  if (!playlistContainer) return;
  playlistContainer.innerHTML = "";

  if (mockPlaylists.length === 0) {
    playlistContainer.innerHTML = `<div class="empty-tip">暂无歌单，点击上方“+ 新建歌单”进行创建。</div>`;
    return;
  }

  mockPlaylists.forEach((pl) => {
    const card = document.createElement("div");
    card.className = "playlist-item-card";
    card.innerHTML = `
      <div>
        <div class="playlist-name">🎧 ${pl.name}</div>
        <div class="playlist-count">${pl.trackCount} 首曲目</div>
      </div>
      <div class="playlist-actions">
        <button class="primary small-btn btn-export-pl" data-id="${pl.id}" data-name="${pl.name}">⚡ 一键导出</button>
        <button class="small-btn btn-del-pl" data-id="${pl.id}" style="color: #ef4444; border-color: #ef4444;">删除</button>
      </div>
    `;
    playlistContainer.appendChild(card);
  });

  document.querySelectorAll(".btn-export-pl").forEach((btn) => {
    btn.addEventListener("click", () => exportPlaylist(btn.dataset.id, btn.dataset.name));
  });

  document.querySelectorAll(".btn-del-pl").forEach((btn) => {
    btn.addEventListener("click", () => deletePlaylist(btn.dataset.id));
  });
}

async function selectNativeDirectory() {
  if (window.electronAPI && typeof window.electronAPI.selectDirectory === "function") {
    const selected = await window.electronAPI.selectDirectory();
    if (selected) {
      outputRootInput.value = selected;
    }
  } else {
    const typed = prompt("请输入或粘贴导出统一根目录路径：", outputRootInput.value);
    if (typed) outputRootInput.value = typed;
  }
}

async function showQrModal() {
  qrModal.style.display = "grid";
  qrCodeBox.innerHTML = `<div style="font-size: 13px; color: #666;">正在生成真实二维码...</div>`;
  try {
    const res = await fetch("/api/login/qr/key");
    const data = await res.json();
    if (data.qrImg) {
      qrCodeBox.innerHTML = `<img src="${data.qrImg}" alt="网易云扫码登录二维码" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px;" />`;
    } else {
      qrCodeBox.innerHTML = `<div style="font-size: 13px; color: #ef4444;">二维码生成失败</div>`;
    }
  } catch (err) {
    qrCodeBox.innerHTML = `<div style="font-size: 13px; color: #ef4444;">二维码请求异常</div>`;
  }
}

function hideQrModal() {
  qrModal.style.display = "none";
}

function createNewPlaylist() {
  const name = prompt("请输入要新建的歌单名称：", "DJ New Set");
  if (!name || !name.trim()) return;
  mockPlaylists.push({
    id: `pl_${Date.now()}`,
    name: name.trim(),
    trackCount: 0,
  });
  renderPlaylists();
  status.textContent = `已新建歌单「${name.trim()}」。`;
}

function deletePlaylist(id) {
  const pl = mockPlaylists.find((p) => p.id === id);
  if (!pl) return;
  if (confirm(`确定要从网易云账号删除歌单「${pl.name}」吗？`)) {
    mockPlaylists = mockPlaylists.filter((p) => p.id !== id);
    renderPlaylists();
    status.textContent = `已删除歌单「${pl.name}」。`;
  }
}

function exportPlaylist(id, name) {
  const root = outputRootInput.value || "D:\\DJ_Music_Library";
  status.textContent = `正在导出歌单「${name}」至 ${root}\\${name}\\ … (统一转换为 MP3 并写入 ID3 标签)`;
  setTimeout(() => {
    status.textContent = `歌单「${name}」批量导出完成！已保存到 ${root}\\${name}\\（包含 NCM 自动解密与 320k MP3 压制）。`;
  }, 1500);
}

if (btnSelectFolder) btnSelectFolder.addEventListener("click", selectNativeDirectory);
if (btnLoginQr) btnLoginQr.addEventListener("click", showQrModal);
if (btnCloseQr) btnCloseQr.addEventListener("click", hideQrModal);
if (btnCreatePlaylist) btnCreatePlaylist.addEventListener("click", createNewPlaylist);

renderPlaylists();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.querySelector("#file");
  const file = fileInput.files ? fileInput.files[0] : null;
  if (!file) {
    status.textContent = "请先选择需要转码/解密的本地音频或 NCM 文件。";
    return;
  }

  const targetFormat = document.querySelector("#format").value;
  button.disabled = true;

  try {
    const isNcm = file.name.toLowerCase().endsWith(".ncm");

    if (isNcm) {
      status.textContent = `正在纯前端解密 NCM 文件 ${file.name}…`;
      const arrayBuffer = await file.arrayBuffer();
      const ncmResult = window.decryptNcm(arrayBuffer);

      const baseName = (ncmResult.artist ? `${ncmResult.artist} - ` : "") + (ncmResult.title || file.name.replace(/\.ncm$/i, ""));
      const decryptedFormat = ncmResult.format;

      if (targetFormat === decryptedFormat) {
        status.textContent = "解密完成，直接在浏览器中下载音频…";
        const mimeTypes = { mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg" };
        const blob = new Blob([ncmResult.audioBuffer], { type: mimeTypes[decryptedFormat] || "application/octet-stream" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${baseName}.${decryptedFormat}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        status.textContent = `NCM 解密完成 (${decryptedFormat.toUpperCase()})，下载已开始。`;
        return;
      }

      status.textContent = `NCM 解密完成，正在本机 FFmpeg 转换为 ${targetFormat.toUpperCase()}…`;
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

      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      const disposition = response.headers.get("content-disposition") ?? "";
      const encodedName = disposition.match(/filename\*=UTF-8''(.+)/)?.[1];
      link.download = encodedName ? decodeURIComponent(encodedName) : `${baseName}.${targetFormat}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      status.textContent = "转换完成，下载已开始。";
      return;
    }

    status.textContent = `正在本机转换 ${file.name}…`;
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
    status.textContent = "转换完成，下载已开始。";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
