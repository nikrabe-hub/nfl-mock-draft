import { describe, expect, it } from 'vitest';
import { de } from '../../src/i18n/de';
import { en } from '../../src/i18n/en';
import { translate } from '../../src/i18n';
import { sanitizeSettings } from '../../src/storage/settings';

describe('Einstellungen', () => {
  it('ersetzt ungültige Werte durch Standardwerte', () => {
    expect(sanitizeSettings(undefined)).toEqual({ theme: 'system', lang: 'de' });
    expect(sanitizeSettings(null, 'en')).toEqual({ theme: 'system', lang: 'en' });
    expect(sanitizeSettings({ theme: 'pink', lang: 'fr' }, 'en')).toEqual({ theme: 'system', lang: 'en' });
    expect(sanitizeSettings('quatsch')).toEqual({ theme: 'system', lang: 'de' });
  });

  it('behält gültige Werte', () => {
    expect(sanitizeSettings({ theme: 'dark', lang: 'en' })).toEqual({ theme: 'dark', lang: 'en' });
  });
});

describe('Sprachen DE/EN', () => {
  it('haben dieselben Schlüssel', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });

  it('haben keine leeren Texte', () => {
    for (const v of [...Object.values(de), ...Object.values(en)]) expect(v.trim().length).toBeGreaterThan(0);
  });

  it('verwenden in beiden Sprachen dieselben Platzhalter', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const key of Object.keys(de) as (keyof typeof de)[]) expect(ph(en[key]), key).toBe(ph(de[key]));
  });

  it('setzt Platzhalter ein', () => {
    expect(translate('de', 'settings.backup.restored', { count: 3 })).toContain('3');
    expect(translate('en', 'settings.backup.exported', { name: 'x.json' })).toContain('x.json');
  });
});
