import type { DesktopAPI } from '../shared/types';

declare global {
  interface Window { gorillaPunch: DesktopAPI }
}

export {};
