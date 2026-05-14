import type { Soam } from '../electron/preload/soam';

declare global {
  interface Window {
    readonly soam: Soam;
  }
}

export {};
