// Datenformate. Alle JSON-Dateien beginnen mit quelle, abgerufenAm und version (SourceInfo).

export interface SourceInfo {
  /** Woher die Daten stammen, z.B. "Tankathon Big Board". */
  quelle: string;
  /** ISO-Zeitstempel des Abrufs. */
  abgerufenAm: string;
  /** Ganze Zahl, steigt mit jeder Änderung des Dateiformats/Inhalts. */
  version: number;
}

export interface PlayerProfile {
  strengths?: string;
  weaknesses?: string;
  comparison?: string;
}

export interface Player {
  /** Stabile ID aus Name + College, z.B. "will-echoles__mississippi". */
  id: string;
  name: string;
  /** Kanonische Position, siehe positions.ts. */
  pos: string;
  /** Weitere Positionen, die die Quelle nennt (z.B. "OT/IOL" -> pos OT, altPos [IOL]). */
  altPos?: string[];
  /** Rang innerhalb der Position (wird aus dem Rank berechnet, wenn nicht vorhanden). */
  posRank?: number | null;
  college: string;
  rank: number;
  adp?: number | null;
  /** Größe in Zoll (6'4" = 76). */
  heightIn?: number | null;
  /** Gewicht in Pfund. */
  weightLb?: number | null;
  age?: number | null;
  /** Jahrgang, z.B. "Junior" oder "2026". Freitext, wie die Quelle ihn liefert. */
  klasse?: string | null;
  profile?: PlayerProfile | null;
  /** Von der Quelle nicht mehr gelistet (wird nicht gelöscht). */
  notListed?: boolean;
  /** Felder, die der Daten-Job nie überschreiben darf (manuelle Korrekturen). */
  manual?: string[];
}

export type IncomingPlayer = Partial<Omit<Player, 'id'>> & { name: string; id?: string };

export interface BigBoardFile extends SourceInfo {
  players: Player[];
}

export interface DraftPick {
  pick: number;
  round: number;
  /** Aktueller Besitzer (Teamkürzel). */
  team: string;
  /** Ursprüngliches Team, wenn der Pick getradet wurde. */
  from?: string;
}

export interface DraftOrderFile extends SourceInfo {
  /** Draft-Jahr, z.B. 2027. */
  year: number;
  picks: DraftPick[];
}

export interface CollegeStatsFile extends SourceInfo {
  season: number;
  /** Spieler-ID -> Kennzahl -> Wert, z.B. { "pass_yds": 3120 }. */
  stats: Record<string, Record<string, number>>;
}

export interface UnmatchedStatsFile extends SourceInfo {
  unmatched: { name: string; college: string; pos?: string; category: string; values: Record<string, number>; reason: string }[];
}

export type DataSourceId = 'draft-order' | 'big-board' | 'college-stats';
