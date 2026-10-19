// Zeitsteuerung: GitHub-Cron läuft in UTC. Damit die Uhrzeit auch bei Sommer-/Winterzeit stimmt,
// wird je Quelle zu beiden möglichen UTC-Zeiten gestartet; dieses Tor lässt nur die Berliner Zeit passen.

export type SourceName = 'tankathon-order' | 'tankathon-board';

export interface SourceSchedule {
  /** 0 = Sonntag … 6 = Samstag (Berliner Zeit) */
  weekday: number;
  hour: number;
  minute: number;
}

export const SCHEDULES: Record<SourceName, SourceSchedule> = {
  'tankathon-order': { weekday: 2, hour: 8, minute: 0 }, // Dienstag 08:00
  'tankathon-board': { weekday: 2, hour: 8, minute: 20 }, // Dienstag 08:20
};

/** GitHub startet Cron-Jobs oft mit Verspätung; so lange nach der Sollzeit gilt der Lauf noch als pünktlich. */
export const GRACE_MINUTES = 180;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface BerlinTime {
  date: string; // YYYY-MM-DD
  weekday: number;
  minutesOfDay: number;
  month: number;
  day: number;
}

export function berlinTime(now: Date): BerlinTime {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS.indexOf(get('weekday')),
    minutesOfDay: Number(get('hour')) * 60 + Number(get('minute')),
    month: Number(get('month')),
    day: Number(get('day')),
  };
}

export type GateResult = { run: true } | { run: false; reason: string };

/** Entscheidet für einen planmäßigen Lauf, ob jetzt wirklich gestartet wird. */
export function scheduledGate(source: SourceName, now: Date, lastRunBerlinDate: string | undefined): GateResult {
  const s = SCHEDULES[source];
  const t = berlinTime(now);
  if (t.weekday !== s.weekday) return { run: false, reason: 'falscher Wochentag (Berliner Zeit)' };
  const target = s.hour * 60 + s.minute;
  if (t.minutesOfDay < target) return { run: false, reason: 'Sollzeit (Berliner Zeit) noch nicht erreicht' };
  if (t.minutesOfDay > target + GRACE_MINUTES) return { run: false, reason: 'Sollzeit zu lange vorbei' };
  if (lastRunBerlinDate === t.date) return { run: false, reason: 'heute bereits gelaufen' };
  return { run: true };
}

/** Manueller Start: höchstens einmal pro Tag und Quelle. */
export function manualGate(lastManualBerlinDate: string | undefined, now: Date): GateResult {
  const today = berlinTime(now).date;
  return lastManualBerlinDate === today ? { run: false, reason: 'heute schon manuell gestartet (maximal 1× pro Tag und Quelle)' } : { run: true };
}
