export type DjAuthResult =
  | { status: "invalid"; message: string }
  | { status: "superseded" }
  | { status: "authenticated"; userId: string; playlistCount: number };

export function normalizeCookieInput(input: string): string;
export function cookieFromQrPayload(payload: Record<string, unknown>): string;
export class DjAuthAdapter {
  constructor(options: {
    getPlaylists: () => Promise<{ userId?: string | number; playlists?: unknown[] }>;
    getCookie: () => string;
    saveCookie: (cookie: string) => void;
    clearCookie: () => void;
  });
  validate(candidate?: string): Promise<DjAuthResult>;
  logout(): void;
}
