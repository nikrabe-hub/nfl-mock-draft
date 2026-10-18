import { useState } from 'preact/hooks';
import { getTeam, readableTextOn, teamLabel } from '../data/teams';

// Logos liegen in public/logos/<KÜRZEL>.<endung>. Probiert wird png, svg, webp.
// Fehlt die Datei, erscheint ein Badge in Teamfarbe – nie ein kaputtes Bild.
const EXTENSIONS = ['png', 'svg', 'webp'] as const;

export function TeamBadge({ abbr, size }: { abbr: string; size: number }) {
  const team = getTeam(abbr);
  const bg = team?.primary ?? '#51607a';
  return (
    <span
      class="badge"
      data-testid={`logo-badge-${abbr}`}
      role="img"
      aria-label={teamLabel(abbr)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: bg,
        color: readableTextOn(bg),
        borderColor: team?.secondary ?? 'transparent',
        fontSize: `${Math.max(10, Math.round(size * (abbr.length > 2 ? 0.3 : 0.38)))}px`,
      }}
    >
      {abbr}
    </span>
  );
}

export function TeamLogo({ abbr, size = 48 }: { abbr: string; size?: number }) {
  // Der Versuchszähler gehört zu einem Kürzel. Ändert sich das Kürzel, gilt wieder Versuch 0 –
  // ohne Effekt, damit ein sehr schneller Ladefehler nie überschrieben wird.
  const [failed, setFailed] = useState({ abbr, count: 0 });
  const attempt = failed.abbr === abbr ? failed.count : 0;

  if (attempt >= EXTENSIONS.length) return <TeamBadge abbr={abbr} size={size} />;
  return (
    <img
      class="logo"
      data-testid={`logo-img-${abbr}`}
      src={`${import.meta.env.BASE_URL}logos/${abbr}.${EXTENSIONS[attempt]}`}
      alt={teamLabel(abbr)}
      width={size}
      height={size}
      decoding="async"
      onError={() => setFailed({ abbr, count: attempt + 1 })}
    />
  );
}
