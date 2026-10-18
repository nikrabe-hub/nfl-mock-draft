/** Alle Schlüssel, unter denen die App Daten speichert (und die ins Backup wandern). */
export const KEYS = {
  settings: 'settings',
  // Ab Phase 4/5 belegt:
  activeDraft: 'activeDraft',
  mocks: 'mocks',
  watchlist: 'watchlist',
  needsOverride: 'needsOverride',
  orderOverride: 'orderOverride',
} as const;
