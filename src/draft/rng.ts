// Zufall ohne Zustand: Jeder Wert ergibt sich aus Seed + Pick + Spieler.
// Dadurch ist ein Draft nach dem Neuladen exakt reproduzierbar und Tests sind stabil.

export function hash32(seed: number, ...parts: (string | number)[]): number {
  let h = (2166136261 ^ (seed >>> 0)) >>> 0;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Gleichverteilt in [0, 1). */
export function unit(seed: number, ...parts: (string | number)[]): number {
  return hash32(seed, ...parts) / 4294967296;
}

/** Ungefähr normalverteilt (Mittel 0, Streuung 1), begrenzt auf ±3. */
export function gauss(seed: number, ...parts: (string | number)[]): number {
  let sum = 0;
  for (let k = 0; k < 4; k++) sum += unit(seed, ...parts, k);
  const z = (sum - 2) / Math.sqrt(4 / 12);
  return Math.max(-3, Math.min(3, z));
}
