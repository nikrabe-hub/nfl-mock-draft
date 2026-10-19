// Kanonische Positionen. Quellen schreiben Positionen unterschiedlich – hier wird vereinheitlicht.

export const POSITIONS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'IOL', 'EDGE', 'DI', 'LB', 'CB', 'S', 'K', 'P', 'LS'] as const;
export type Position = (typeof POSITIONS)[number];

const ALIASES: Record<string, Position> = {
  QB: 'QB',
  RB: 'RB',
  HB: 'RB',
  TB: 'RB',
  FB: 'FB',
  WR: 'WR',
  TE: 'TE',
  OT: 'OT',
  T: 'OT',
  // "OL" ohne Angabe wird als Innen-Lineman behandelt; Tackles liefern die Quellen meist als OT.
  OL: 'IOL',
  OG: 'IOL',
  G: 'IOL',
  C: 'IOL',
  IOL: 'IOL',
  EDGE: 'EDGE',
  ED: 'EDGE',
  DE: 'EDGE',
  DI: 'DI',
  DT: 'DI',
  NT: 'DI',
  DL: 'DI',
  LB: 'LB',
  ILB: 'LB',
  MLB: 'LB',
  OLB: 'LB',
  CB: 'CB',
  S: 'S',
  FS: 'S',
  SS: 'S',
  K: 'K',
  PK: 'K',
  P: 'P',
  LS: 'LS',
};

/** Gibt die kanonische Position zurück oder undefined, wenn sie unbekannt ist. */
export function normalizePosition(raw: unknown): Position | undefined {
  if (typeof raw !== 'string') return undefined;
  return ALIASES[raw.trim().toUpperCase().replace(/[^A-Z]/g, '')];
}

export function isPosition(v: unknown): v is Position {
  return typeof v === 'string' && (POSITIONS as readonly string[]).includes(v);
}

/** Wie früh ein Team diese Position typischerweise nimmt (für die KI in Phase 4). 1 = sehr früh. */
export const POSITION_VALUE: Record<Position, number> = {
  QB: 1.12,
  OT: 1.06,
  EDGE: 1.08,
  CB: 1.03,
  WR: 1.02,
  DI: 1.0,
  S: 0.94,
  LB: 0.93,
  TE: 0.93,
  IOL: 0.92,
  RB: 0.9,
  FB: 0.5,
  K: 0.35,
  P: 0.3,
  LS: 0.25,
};
