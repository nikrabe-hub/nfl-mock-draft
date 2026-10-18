import { registerSW } from 'virtual:pwa-register';
import { createStore } from './store';

export interface PwaState {
  /** Offline-Modus ist startklar (Service Worker aktiv). */
  offlineReady: boolean;
  /** Eine neuere Version liegt bereit. */
  needRefresh: boolean;
}

export const pwaState = createStore<PwaState>({
  offlineReady: 'serviceWorker' in navigator && !!navigator.serviceWorker.controller,
  needRefresh: false,
});

let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

export function initPwa(): void {
  try {
    updateSW = registerSW({
      immediate: true,
      onOfflineReady: () => pwaState.set({ offlineReady: true }),
      onNeedRefresh: () => pwaState.set({ needRefresh: true }),
    });
  } catch {
    /* Ohne Service Worker läuft die App trotzdem, nur nicht offline. */
  }
}

export function applyUpdate(): void {
  void updateSW?.(true);
}

// --- Installieren ----------------------------------------------------------

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

let deferredPrompt: InstallPromptEvent | null = null;
export const installState = createStore<{ canPrompt: boolean }>({ canPrompt: false });

export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
    installState.set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installState.set({ canPrompt: false });
  });
}

export async function promptInstall(): Promise<void> {
  if (!deferredPrompt) return;
  const p = deferredPrompt;
  deferredPrompt = null;
  installState.set({ canPrompt: false });
  await p.prompt();
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
