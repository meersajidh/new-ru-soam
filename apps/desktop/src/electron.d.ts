type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

interface Window {
  electronAPI: {
    platform: string;
  };
}
