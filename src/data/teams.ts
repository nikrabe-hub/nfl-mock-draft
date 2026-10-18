// Stammdaten der 32 NFL-Teams: Kürzel, Name, Teamfarben, Division.
// Die Kürzel entsprechen den Logo-Dateinamen in public/logos/ (z.B. CAR.png).

export type Conference = 'AFC' | 'NFC';
export type Division = 'East' | 'North' | 'South' | 'West';

export interface Team {
  abbr: string;
  city: string;
  name: string;
  conference: Conference;
  division: Division;
  primary: string;
  secondary: string;
}

const t = (
  abbr: string,
  city: string,
  name: string,
  conference: Conference,
  division: Division,
  primary: string,
  secondary: string,
): Team => ({ abbr, city, name, conference, division, primary, secondary });

export const TEAMS: readonly Team[] = [
  // AFC East
  t('BUF', 'Buffalo', 'Bills', 'AFC', 'East', '#00338D', '#C60C30'),
  t('MIA', 'Miami', 'Dolphins', 'AFC', 'East', '#008E97', '#FC4C02'),
  t('NE', 'New England', 'Patriots', 'AFC', 'East', '#002244', '#C60C30'),
  t('NYJ', 'New York', 'Jets', 'AFC', 'East', '#125740', '#000000'),
  // AFC North
  t('BAL', 'Baltimore', 'Ravens', 'AFC', 'North', '#241773', '#000000'),
  t('CIN', 'Cincinnati', 'Bengals', 'AFC', 'North', '#FB4F14', '#000000'),
  t('CLE', 'Cleveland', 'Browns', 'AFC', 'North', '#311D00', '#FF3C00'),
  t('PIT', 'Pittsburgh', 'Steelers', 'AFC', 'North', '#FFB612', '#101820'),
  // AFC South
  t('HOU', 'Houston', 'Texans', 'AFC', 'South', '#03202F', '#A71930'),
  t('IND', 'Indianapolis', 'Colts', 'AFC', 'South', '#002C5F', '#A2AAAD'),
  t('JAX', 'Jacksonville', 'Jaguars', 'AFC', 'South', '#006778', '#D7A22A'),
  t('TEN', 'Tennessee', 'Titans', 'AFC', 'South', '#0C2340', '#4B92DB'),
  // AFC West
  t('DEN', 'Denver', 'Broncos', 'AFC', 'West', '#FB4F14', '#002244'),
  t('KC', 'Kansas City', 'Chiefs', 'AFC', 'West', '#E31837', '#FFB81C'),
  t('LV', 'Las Vegas', 'Raiders', 'AFC', 'West', '#000000', '#A5ACAF'),
  t('LAC', 'Los Angeles', 'Chargers', 'AFC', 'West', '#0080C6', '#FFC20E'),
  // NFC East
  t('DAL', 'Dallas', 'Cowboys', 'NFC', 'East', '#003594', '#869397'),
  t('NYG', 'New York', 'Giants', 'NFC', 'East', '#0B2265', '#A71930'),
  t('PHI', 'Philadelphia', 'Eagles', 'NFC', 'East', '#004C54', '#A5ACAF'),
  t('WAS', 'Washington', 'Commanders', 'NFC', 'East', '#5A1414', '#FFB612'),
  // NFC North
  t('CHI', 'Chicago', 'Bears', 'NFC', 'North', '#0B162A', '#C83803'),
  t('DET', 'Detroit', 'Lions', 'NFC', 'North', '#0076B6', '#B0B7BC'),
  t('GB', 'Green Bay', 'Packers', 'NFC', 'North', '#203731', '#FFB612'),
  t('MIN', 'Minnesota', 'Vikings', 'NFC', 'North', '#4F2683', '#FFC62F'),
  // NFC South
  t('ATL', 'Atlanta', 'Falcons', 'NFC', 'South', '#A71930', '#000000'),
  t('CAR', 'Carolina', 'Panthers', 'NFC', 'South', '#0085CA', '#101820'),
  t('NO', 'New Orleans', 'Saints', 'NFC', 'South', '#D3BC8D', '#101820'),
  t('TB', 'Tampa Bay', 'Buccaneers', 'NFC', 'South', '#D50A0A', '#34302B'),
  // NFC West
  t('ARI', 'Arizona', 'Cardinals', 'NFC', 'West', '#97233F', '#000000'),
  t('LAR', 'Los Angeles', 'Rams', 'NFC', 'West', '#003594', '#FFA300'),
  t('SF', 'San Francisco', '49ers', 'NFC', 'West', '#AA0000', '#B3995D'),
  t('SEA', 'Seattle', 'Seahawks', 'NFC', 'West', '#002244', '#69BE28'),
];

const BY_ABBR = new Map(TEAMS.map((x) => [x.abbr, x]));

/** Kürzel, die Quellen oder Nutzer manchmal anders schreiben. */
const ALIASES: Record<string, string> = {
  WSH: 'WAS',
  JAC: 'JAX',
  LVR: 'LV',
  OAK: 'LV',
  SD: 'LAC',
  STL: 'LAR',
  GNB: 'GB',
  KAN: 'KC',
  NWE: 'NE',
  NOR: 'NO',
  SFO: 'SF',
  TAM: 'TB',
};

export function normalizeAbbr(abbr: string): string {
  const up = abbr.trim().toUpperCase();
  return ALIASES[up] ?? up;
}

export function getTeam(abbr: string): Team | undefined {
  return BY_ABBR.get(normalizeAbbr(abbr));
}

export function teamLabel(abbr: string): string {
  const team = getTeam(abbr);
  return team ? `${team.city} ${team.name}` : abbr;
}

/** Schwarz oder Weiß – je nachdem, was auf der Teamfarbe lesbar ist. */
export function readableTextOn(hex: string): '#000000' | '#ffffff' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.4 ? '#000000' : '#ffffff';
}
