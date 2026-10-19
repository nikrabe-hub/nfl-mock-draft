/** Alle Schlüssel, unter denen die App Daten speichert (und die ins Backup wandern). */
export const KEYS = {
  settings: 'settings',
  // Ab Phase 4/5 belegt:
  activeDraft: 'activeDraft',
  mocks: 'mocks',
  watchlist: 'watchlist',
  needsOverride: 'needsOverride',
  orderOverride: 'orderOverride',
  /** Eigene Importe (Overlay über dem Big Board). */
  dataOverlay: 'dataOverlay',
} as const;

/** Zwischenspeicher (zuletzt geladene Quelldateien). Gehört nicht ins Backup. */
export const CACHE_PREFIX = 'cache:';
