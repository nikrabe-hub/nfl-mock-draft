// Zeichnet die Picks-Übersicht eines Teams als PNG (Canvas, 1080 px breit) und liefert sie zum Speichern/Teilen.
// Funktioniert offline: Logos kommen aus dem eigenen Cache (public/logos), Schriften sind Systemschriften.

import { readableTextOn } from '../data/teams';
import { gradeTone } from '../draft/grades';
import { t as translate, type MessageKey, type Params } from '../i18n';
import { RECAP_HEADER, RECAP_ROW, RECAP_WIDTH, recapFileName, recapHeight, type Recap } from './recap';

type Translate = (key: MessageKey, params?: Params) => string;

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const COLORS = {
  bg: '#0e1522',
  card: '#172133',
  cardAlt: '#1c283d',
  text: '#f4f7fb',
  muted: '#9fb0c8',
  good: '#2ecc71',
  ok: '#f5b942',
  bad: '#ef5350',
  line: '#26344d',
};

const toneColor = (g: Parameters<typeof gradeTone>[0]): string => COLORS[gradeTone(g)];

const LOGO_EXT = ['png', 'svg', 'webp'] as const;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Lädt das Teamlogo; fehlt es, wird null geliefert und ein Badge gezeichnet. */
export async function loadLogo(abbr: string): Promise<HTMLImageElement | null> {
  const base = import.meta.env.BASE_URL;
  for (const ext of LOGO_EXT) {
    const img = await loadImage(`${base}logos/${abbr}.${ext}`);
    if (img && img.naturalWidth > 0) return img;
  }
  return null;
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, r: Recap, x: number, y: number, size: number): void {
  if (img) {
    const k = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
    return;
  }
  ctx.fillStyle = r.primary;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = readableTextOn(r.primary);
  ctx.font = `700 ${Math.round(size * 0.34)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(r.team, x + size / 2, y + size / 2);
}

function gradePill(ctx: CanvasRenderingContext2D, grade: Recap['grade'], cx: number, cy: number, w: number, h: number, fontPx: number): void {
  const col = toneColor(grade);
  ctx.fillStyle = col;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 3);
  ctx.fill();
  ctx.fillStyle = '#0b1220';
  ctx.font = `800 ${fontPx}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(grade, cx, cy + 1);
}

/** Zeichnet die ganze Übersicht auf ein Canvas. */
export function drawRecap(ctx: CanvasRenderingContext2D, r: Recap, logo: HTMLImageElement | null, t: Translate): void {
  const W = RECAP_WIDTH;
  const H = recapHeight(r.rows.length);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Kopf in Teamfarbe
  const grad = ctx.createLinearGradient(0, 0, W, RECAP_HEADER);
  grad.addColorStop(0, r.primary);
  grad.addColorStop(1, COLORS.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, RECAP_HEADER - 40);
  ctx.fillStyle = r.secondary;
  ctx.fillRect(0, RECAP_HEADER - 44, W, 4);

  const onPrimary = readableTextOn(r.primary);
  drawLogo(ctx, logo, r, 48, 44, 170);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = onPrimary;
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText(t('export.heading', { year: r.year }), 244, 92);
  ctx.font = `800 54px ${FONT}`;
  ctx.fillText(fit(ctx, r.city, W - 244 - 260), 244, 154);
  ctx.fillText(fit(ctx, r.name, W - 244 - 260), 244, 214);

  // Gesamtnote
  gradePill(ctx, r.grade, W - 130, 120, 170, 130, 66);
  ctx.fillStyle = onPrimary;
  ctx.font = `600 24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(t('grade.team'), W - 130, 208);

  // Kennzahlen
  const statsY = RECAP_HEADER - 20;
  ctx.textAlign = 'left';
  const stat = (label: string, value: number, x: number) => {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 24px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x, statsY);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText(`${Math.round(value)}/100`, x, statsY + 40);
  };
  stat(t('grade.needs60'), r.needScore, 48);
  stat(t('grade.value40'), r.valueScore, 330);
  stat(t('grade.score'), r.score, 612);

  // Pick-Zeilen
  const top = RECAP_HEADER + 60;
  r.rows.forEach((row, i) => {
    const y = top + i * RECAP_ROW;
    ctx.fillStyle = i % 2 ? COLORS.cardAlt : COLORS.card;
    roundRect(ctx, 24, y - 20, W - 48, RECAP_ROW - 14, 18);
    ctx.fill();

    // Pick-Nr. + Runde
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = `800 38px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(row.pick), 92, y + 26);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 21px ${FONT}`;
    ctx.fillText(t('export.round', { round: row.round }), 92, y + 54);

    // Name + Details
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText(fit(ctx, row.name, 560), 168, y + 22);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 24px ${FONT}`;
    const detail = `${row.pos} · ${row.college}${row.rank != null ? ` · Rank ${row.rank}` : ''}`;
    ctx.fillText(fit(ctx, detail, 560), 168, y + 56);

    // Steal/Reach
    if (row.delta != null) {
      const label = row.delta >= 8 ? t('grade.steal', { n: row.delta }) : row.delta <= -8 ? t('grade.reach', { n: Math.abs(row.delta) }) : '';
      if (label) {
        ctx.textAlign = 'right';
        ctx.fillStyle = row.delta > 0 ? COLORS.good : COLORS.bad;
        ctx.font = `700 24px ${FONT}`;
        ctx.fillText(label, W - 190, y + 22);
      }
    }
    if (row.needPos) {
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.muted;
      ctx.font = `500 22px ${FONT}`;
      ctx.fillText(t('export.needHit', { pos: row.needPos }), W - 190, y + 56);
    }

    gradePill(ctx, row.grade, W - 100, y + 29, 110, 72, 40);
  });

  // Needs-Zeile und Fuß
  const footY = top + r.rows.length * RECAP_ROW + 8;
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 24px ${FONT}`;
  const needsLine = `${t('grade.covered')}: ${r.covered.length ? r.covered.join(', ') : '–'}   ·   ${t('grade.open')}: ${r.open.length ? r.open.join(', ') : '–'}`;
  ctx.fillText(fit(ctx, needsLine, W - 64), 32, footY + 6);
  ctx.font = `400 20px ${FONT}`;
  ctx.fillText(fit(ctx, t('export.footer'), W - 64), 32, footY + 44);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob lieferte nichts'))), 'image/png');
  });
}

/** Erstellt das PNG. Wirft einen Fehler, wenn das Canvas nicht verfügbar ist. */
export async function renderRecapPng(r: Recap, t: Translate = translate): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = RECAP_WIDTH;
  canvas.height = recapHeight(r.rows.length);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');
  const logo = await loadLogo(r.team);
  drawRecap(ctx, r, logo, t);
  return toBlob(canvas);
}

/** Lädt die Datei herunter (funktioniert am PC und in Chrome auf Android). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Öffnet das Teilen-Menü des Geräts, falls es Dateien unterstützt. Gibt zurück, ob geteilt wurde. */
export async function shareBlob(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare || !nav.canShare({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], title });
    return true;
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return true; // Nutzer hat abgebrochen – kein Fehler
    return false;
  }
}

export function canShareFiles(): boolean {
  try {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (!nav.share || !nav.canShare) return false;
    return nav.canShare({ files: [new File([new Blob(['x'])], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

export { recapFileName };
