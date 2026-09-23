export type NeteaseTrack = {
  id: string;
  title: string;
  artists: string[];
  album: string;
  coverUrl: string | null;
  durationMs: number | null;
};

export type NeteasePlaylist = {
  id: string;
  name: string;
  coverUrl: string | null;
  trackCount: number;
  ownerId?: string;
  tracks?: NeteaseTrack[];
};

export class NeteaseApiError extends Error {
  constructor(message: string, readonly status: number, readonly payload?: unknown) {
    super(message);
    this.name = "NeteaseApiError";
  }
}

const COOKIE_KEY = "netease_cookie";

export function getNeteaseCookie(): string {
  try { return localStorage.getItem(COOKIE_KEY) ?? ""; }
  catch { return ""; }
}

export function saveNeteaseCookie(cookie: string): void {
  localStorage.setItem(COOKIE_KEY, cookie);
}

export function clearNeteaseCookie(): void {
  localStorage.removeItem(COOKIE_KEY);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function normalizeNeteaseTrack(input: unknown): NeteaseTrack | null {
  const wrapper = record(input);
  const source = record(wrapper.track ?? input);
  const album = record(source.al ?? source.album);
  const id = text(source.id ?? source.songId);
  if (!id) return null;
  const artistSource = Array.isArray(source.ar) ? source.ar : Array.isArray(source.artists) ? source.artists : [];
  const artists = artistSource.map(item => text(record(item).name)).filter(Boolean);
  const durationMs = positiveNumber(source.dt ?? source.duration);
  const cover = text(album.picUrl ?? album.coverUrl ?? source.coverUrl);
  return {
    id,
    title: text(source.name ?? source.title) || "未命名曲目",
    artists,
    album: text(album.name ?? source.albumName) || "未知专辑",
    coverUrl: cover || null,
    durationMs,
  };
}

export function normalizeNeteasePlaylist(input: unknown): NeteasePlaylist | null {
  const source = record(input);
  const creator = record(source.creator);
  const id = text(source.id ?? source.pid);
  if (!id) return null;
  return {
    id,
    name: text(source.name) || "未命名歌单",
    coverUrl: text(source.coverUrl ?? source.coverImgUrl ?? source.picUrl) || null,
    trackCount: Math.max(0, Number(source.trackCount ?? source.count) || 0),
    ownerId: text(source.ownerId ?? source.creatorId ?? creator.userId) || undefined,
  };
}

async function requestJson<T>(path: string, options: { method?: "GET" | "POST"; body?: Record<string, unknown>; signal?: AbortSignal; authenticated?: boolean } = {}): Promise<T> {
  const method = options.method ?? "GET";
  const cookie = options.authenticated === false ? "" : getNeteaseCookie();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cookie && method === "GET") headers["x-cookie"] = cookie;
  if (options.body) headers["Content-Type"] = "application/json";
  const body = options.body && method === "POST" ? JSON.stringify({ ...options.body, cookie }) : undefined;
  const response = await fetch(path, { method, headers, body, signal: options.signal, credentials: "same-origin" });
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new NeteaseApiError(`服务器返回了无法读取的响应（HTTP ${response.status}）`, response.status); }
  const data = record(payload);
  const apiCode = Number(data.code);
  if (!response.ok || (Number.isFinite(apiCode) && apiCode !== 200)) {
    const message = text(data.message ?? data.msg) || `请求失败（HTTP ${response.status}${Number.isFinite(apiCode) ? ` / ${apiCode}` : ""}）`;
    throw new NeteaseApiError(message, response.status, payload);
  }
  return payload as T;
}

export const yesmusicApi = {
  async getPlaylists(signal?: AbortSignal): Promise<{ userId: string; playlists: NeteasePlaylist[] }> {
    const payload = record(await requestJson<unknown>("/api/user/playlists", { signal }));
    const playlists = Array.isArray(payload.playlists)
      ? payload.playlists.map(normalizeNeteasePlaylist).filter((item): item is NeteasePlaylist => Boolean(item))
      : [];
    return { userId: text(payload.userId), playlists };
  },

  async getPlaylistDetail(id: string, signal?: AbortSignal): Promise<NeteasePlaylist> {
    const query = new URLSearchParams({ id });
    const payload = record(await requestJson<unknown>(`/api/playlist/detail?${query}`, { signal }));
    const source = record(payload.playlist);
    const playlist = normalizeNeteasePlaylist(source);
    if (!playlist) throw new NeteaseApiError("响应中没有歌单信息", 502, payload);
    const rawTracks = Array.isArray(source.tracks) ? source.tracks : [];
    return { ...playlist, tracks: rawTracks.map(normalizeNeteaseTrack).filter((item): item is NeteaseTrack => Boolean(item)) };
  },

  async searchSongs(keywords: string, signal?: AbortSignal): Promise<{ songs: NeteaseTrack[]; total: number }> {
    const query = keywords.trim().slice(0, 80);
    if (!query) throw new NeteaseApiError("请输入歌曲名、歌手名或专辑名。", 400);
    const params = new URLSearchParams({ keywords: query, limit: "30", offset: "0" });
    const payload = record(await requestJson<unknown>(`/api/song/search?${params}`, { signal, authenticated: false }));
    const result = record(payload.result ?? payload);
    const songs = Array.isArray(result.songs)
      ? result.songs.map(normalizeNeteaseTrack).filter((item): item is NeteaseTrack => Boolean(item))
      : [];
    return { songs, total: Math.max(0, Number(result.songCount ?? result.total) || songs.length) };
  },

  async getSongUrl(id: string, signal?: AbortSignal): Promise<string | null> {
    if (!id) throw new NeteaseApiError("缺少歌曲 ID", 400);
    const params = new URLSearchParams({ id });
    const payload = record(await requestJson<unknown>(`/api/song/url?${params}`, { signal }));
    const result = Array.isArray(payload.data) ? payload.data : Array.isArray(record(payload.data).data) ? record(payload.data).data as unknown[] : [];
    const first = record(result[0]);
    return text(first.url) || null;
  },

  async createPlaylist(name: string): Promise<void> {
    await requestJson("/api/playlist/create", { method: "POST", body: { name, privacy: 0 } });
  },

  async deletePlaylist(id: string): Promise<void> {
    await requestJson("/api/playlist/delete", { method: "POST", body: { id } });
  },

  async updatePlaylistTracks(op: "add" | "del", playlistId: string, trackIds: string[]): Promise<void> {
    if (!trackIds.length) throw new NeteaseApiError("没有选择曲目", 400);
    await requestJson("/api/playlist/tracks/update", { method: "POST", body: { op, pid: playlistId, trackIds } });
  },
};
