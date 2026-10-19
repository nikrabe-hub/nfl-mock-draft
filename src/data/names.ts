// Namen, Colleges, Größe und Gewicht vereinheitlichen. Grundlage für IDs und das Zusammenführen.

const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "Ahmad Moten Sr." -> "ahmad moten" */
export function normalizeName(name: string): string {
  let s = stripDiacritics(String(name)).toLowerCase();
  s = s.replace(/[.'’`"]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.replace(/\s(jr|sr|ii|iii|iv|v)$/, '');
}

const COLLEGE_ALIASES: Record<string, string> = {
  'ole miss': 'mississippi',
  usc: 'southern california',
  'miami florida': 'miami fl',
  'miami fla': 'miami fl',
  'miami ohio': 'miami oh',
  'miami university': 'miami oh',
  'pitt': 'pittsburgh',
  'uconn': 'connecticut',
  'texas a and m': 'texas am',
  'ucf': 'central florida',
  'unlv': 'nevada las vegas',
  'utsa': 'texas san antonio',
  'smu': 'southern methodist',
  'tcu': 'texas christian',
  'byu': 'brigham young',
};

/** "Miami (FL)" -> "miami fl", "Ohio St." -> "ohio state" */
export function collegeKey(college: string): string {
  let s = stripDiacritics(String(college)).toLowerCase();
  s = s.replace(/&/g, ' and ').replace(/[().'’]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\bst\b/g, 'state');
  return COLLEGE_ALIASES[s] ?? s;
}

export function makeId(name: string, college: string): string {
  const n = normalizeName(name).replace(/ /g, '-');
  const c = collegeKey(college).replace(/ /g, '-');
  return `${n}__${c}`;
}

/** Größe in Zoll: 6'4", 6-4, 6 ft 4 in, 76, 193 cm -> 76. Sonst null. */
export function parseHeight(v: unknown): number | null {
  const inRange = (n: number) => (n >= 60 && n <= 90 ? Math.round(n) : null);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    if (v >= 150 && v <= 230) return inRange(v / 2.54);
    return inRange(v);
  }
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/[’′`]/g, "'").replace(/[”″]/g, '"').replace(/½/g, '.5');
  if (!s) return null;
  const cm = /^(\d{3}(?:\.\d+)?)\s*cm$/i.exec(s);
  if (cm) return inRange(Number(cm[1]) / 2.54);
  const ftIn = /^(\d)\s*(?:'|-|ft\.?|feet)\s*(\d{1,2}(?:\.\d+)?)?\s*(?:"|in\.?|inches)?$/i.exec(s);
  if (ftIn) {
    const inches = ftIn[2] === undefined ? 0 : Number(ftIn[2]);
    if (inches >= 12) return null;
    return inRange(Number(ftIn[1]) * 12 + inches);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return parseHeight(Number(s));
  return null;
}

export function formatHeight(inches: number | null | undefined): string {
  if (inches === null || inches === undefined || !Number.isFinite(inches)) return '–';
  return `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"`;
}

/** Gewicht in Pfund: 222, "222 lbs", "100 kg" -> 222 bzw. 220. Sonst null. */
export function parseWeight(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const m = /^(\d{2,3}(?:\.\d+)?)\s*(lbs?|pounds?|kg)?$/i.exec(v.trim());
    if (!m) return null;
    n = Number(m[1]);
    if (m[2] && m[2].toLowerCase() === 'kg') n *= 2.20462;
  } else return null;
  if (!Number.isFinite(n)) return null;
  n = Math.round(n);
  return n >= 120 && n <= 450 ? n : null;
}
