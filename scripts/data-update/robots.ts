// Minimaler robots.txt-Parser (Gruppen nach User-Agent, Allow/Disallow, längste Übereinstimmung gewinnt).

export interface RobotsRules {
  isAllowed(path: string): boolean;
}

interface Rule {
  allow: boolean;
  pattern: string;
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/**
 * Wertet robots.txt für unseren User-Agent aus. Gibt es eine Gruppe, die unser Produkt-Token nennt,
 * gilt nur sie; sonst gilt die Gruppe "*". Ohne passende Gruppe ist alles erlaubt.
 */
export function parseRobots(text: string, userAgent: string): RobotsRules {
  const token = userAgent.toLowerCase();
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const field = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'allow' || field === 'disallow') && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: field === 'allow', pattern: value });
    } else {
      lastWasAgent = false;
    }
  }

  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && a.length > 0 && token.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules);

  return {
    isAllowed(path: string): boolean {
      let best: { len: number; allow: boolean } | null = null;
      for (const r of rules) {
        if (!patternToRegex(r.pattern).test(path)) continue;
        const len = r.pattern.length;
        if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
      }
      return best ? best.allow : true;
    },
  };
}
