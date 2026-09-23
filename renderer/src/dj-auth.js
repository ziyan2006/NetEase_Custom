export function normalizeCookieInput(input) {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value) return "";
  if (/(?:^|;\s*)MUSIC_U=/i.test(value)) return value;
  if (value.includes("=")) return "";
  return `MUSIC_U=${value}`;
}

export function cookieFromQrPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.cookie === "string") return payload.cookie;
  if (typeof payload.cookies === "string") return payload.cookies;
  if (Array.isArray(payload.cookies)) {
    return payload.cookies.map(item => {
      const cookie = item && typeof item === "object" ? item : {};
      return typeof cookie.name === "string" && typeof cookie.value === "string" ? `${cookie.name}=${cookie.value}` : "";
    }).filter(Boolean).join("; ");
  }
  return "";
}

export class DjAuthAdapter {
  constructor({ getPlaylists, getCookie, saveCookie, clearCookie }) {
    if (typeof getPlaylists !== "function" || typeof getCookie !== "function" || typeof saveCookie !== "function" || typeof clearCookie !== "function") {
      throw new TypeError("DjAuthAdapter requires playlist and credential adapters.");
    }
    this.getPlaylists = getPlaylists;
    this.getCookie = getCookie;
    this.saveCookie = saveCookie;
    this.clearCookie = clearCookie;
    this.generation = 0;
  }

  async validate(candidate = this.getCookie()) {
    const cookie = normalizeCookieInput(candidate);
    const generation = ++this.generation;
    if (!cookie) return { status: "invalid", message: "请提供有效的 MUSIC_U 凭据。" };
    this.saveCookie(cookie);
    try {
      const account = await this.getPlaylists();
      if (generation !== this.generation) return { status: "superseded" };
      const userId = typeof account?.userId === "string" ? account.userId : String(account?.userId ?? "");
      if (!userId) {
        const error = new Error("网易云未返回有效账号信息，请重新登录。");
        error.status = 401;
        throw error;
      }
      return { status: "authenticated", userId, playlistCount: Array.isArray(account?.playlists) ? account.playlists.length : 0 };
    } catch (error) {
      if (generation !== this.generation) return { status: "superseded" };
      if (Number(error?.status) === 401) this.clearCookie();
      throw error;
    }
  }

  logout() {
    this.generation++;
    this.clearCookie();
  }
}
