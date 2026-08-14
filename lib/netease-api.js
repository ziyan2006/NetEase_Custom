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

/**
 * 严格清洗并截断歌单标题，确保符合网易云 API 字符长度规范 (≤ 36 字符，去除特殊格式与 emoji)
 */
export function sanitizePlaylistName(rawName) {
  if (!rawName || typeof rawName !== "string") return "DJ AI 智能歌单";

  let clean = rawName
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/^【[^】]+】\s*/g, "")
    .replace(/^###\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/\s*(现场还原完成|现场 Setlist 还原歌单|现场演出列表|现场推荐歌单|精选歌单|还原歌单|320k 匹配|推荐歌单精选)$/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) clean = "DJ AI 智能歌单";

  if (clean.length > 36) {
    clean = clean.slice(0, 36).trim();
  }

  return clean;
}

export async function fetchNetEaseApi(endpoint, options = {}) {
  const { method = "GET", params = {}, body = null, cookie = "", timeout = 3500 } = options;
  const baseUrl = "https://music.163.com/api";
  
  const query = new URLSearchParams(params).toString();
  const url = `${baseUrl}${endpoint}${query ? "?" + query : ""}`;

  const formattedCookie = cookie
    ? (cookie.includes("os=") ? cookie : `${cookie}; os=pc; appver=2.9.7.199895; osver=10.0.19041.1415`)
    : "os=pc; appver=2.9.7.199895; osver=10.0.19041.1415";

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://music.163.com/",
    "Cookie": formattedCookie,
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

    const resJson = await response.json();

    let cookieStr = "";
    if (typeof response.headers.getSetCookie === "function") {
      const setCookies = response.headers.getSetCookie();
      if (setCookies && setCookies.length > 0) {
        cookieStr = setCookies.map((c) => c.split(";")[0]).join("; ");
      }
    } else {
      const rawCookie = response.headers.get("set-cookie");
      if (rawCookie) {
        cookieStr = rawCookie.split(";")[0];
      }
    }

    if (cookieStr) {
      resJson.cookie = cookieStr;
    }

    return resJson;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
