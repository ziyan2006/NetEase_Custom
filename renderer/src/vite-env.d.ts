/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    selectDirectory?: () => Promise<string | null>;
    openNeteaseLogin?: () => void;
    onCookieCaptured?: (callback: (cookie: string) => void) => void;
  };
}
