export function formatQrCodeUrl(key) {
  return `https://music.163.com/login?codekey=${encodeURIComponent(key)}`;
}

export function formatQrImageUrl(key) {
  const qrUrl = formatQrCodeUrl(key);
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`;
}

export function parsePlaylistResponse(apiData) {
  if (!apiData || !Array.isArray(apiData.playlist)) return [];
  return apiData.playlist.map((item) => ({
    id: item.id,
    name: item.name,
    trackCount: item.trackCount || 0,
    coverUrl: item.coverImgUrl || item.picUrl || "",
  }));
}

export async function fetchNetEaseApi(endpoint, options = {}) {
  const { method = "GET", params = {}, body = null, cookie = "", timeout = 3500 } = options;
  const baseUrl = "https://music.163.com/api";
  
  const query = new URLSearchParams(params).toString();
  const url = `${baseUrl}${endpoint}${query ? "?" + query : ""}`;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://music.163.com/",
    "Cookie": cookie,
  };

  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === "POST" && body ? new URLSearchParams(body).toString() : null,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`网易云 API 请求失败 (${response.status})`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
