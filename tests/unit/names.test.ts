import { describe, expect, it } from 'vitest';
import { collegeKey, formatHeight, makeId, normalizeName, parseHeight, parseWeight } from '../../src/data/names';
import { normalizePosition } from '../../src/data/positions';

describe('Namen und Colleges', () => {
  it('vereinheitlicht Namen', () => {
    expect(normalizeName('Ahmad Moten Sr.')).toBe('ahmad moten');
    expect(normalizeName("  Ja'Marr  Chase ")).toBe('jamarr chase');
    expect(normalizeName('José Núñez III')).toBe('jose nunez');
    expect(normalizeName('Jeremiah Smith')).toBe('jeremiah smith');
  });

  it('vereinheitlicht Colleges', () => {
    expect(collegeKey('Miami (FL)')).toBe('miami fl');
    expect(collegeKey('Miami (OH)')).toBe('miami oh');
    expect(collegeKey('Ohio St.')).toBe('ohio state');
    expect(collegeKey('Ohio State')).toBe('ohio state');
    expect(collegeKey('Ole Miss')).toBe(collegeKey('Mississippi'));
    expect(collegeKey('Texas A&M')).toBe('texas am');
  });

  it('erzeugt stabile IDs', () => {
    expect(makeId('Will Echoles', 'Mississippi')).toBe('will-echoles__mississippi');
    expect(makeId('Will Echoles', 'Ole Miss')).toBe('will-echoles__mississippi');
    expect(makeId('Ahmad Moten Sr.', 'Miami (FL)')).toBe('ahmad-moten__miami-fl');
  });
});

describe('Größe und Gewicht', () => {
  it('liest Größen in vielen Schreibweisen', () => {
    expect(parseHeight(`6'4"`)).toBe(76);
    expect(parseHeight('6-4')).toBe(76);
    expect(parseHeight('6’2”')).toBe(74);
    expect(parseHeight('6 ft 4 in')).toBe(76);
    expect(parseHeight('5\'11')).toBe(71);
    expect(parseHeight(76)).toBe(76);
    expect(parseHeight('76')).toBe(76);
    expect(parseHeight('193 cm')).toBe(76);
    expect(parseHeight(193)).toBe(76);
    expect(parseHeight(`6'`)).toBe(72);
  });

  it('lehnt unsinnige Größen ab', () => {
    expect(parseHeight('')).toBeNull();
    expect(parseHeight('groß')).toBeNull();
    expect(parseHeight(`6'14"`)).toBeNull();
    expect(parseHeight(12)).toBeNull();
    expect(parseHeight(null)).toBeNull();
    expect(parseHeight(NaN)).toBeNull();
  });

  it('zeigt Größen lesbar an', () => {
    expect(formatHeight(76)).toBe(`6'4"`);
    expect(formatHeight(71)).toBe(`5'11"`);
    expect(formatHeight(null)).toBe('–');
  });

  it('liest Gewichte', () => {
    expect(parseWeight(222)).toBe(222);
    expect(parseWeight('222 lbs')).toBe(222);
    expect(parseWeight('222')).toBe(222);
    expect(parseWeight('100 kg')).toBe(220);
    expect(parseWeight('zu schwer')).toBeNull();
    expect(parseWeight(50)).toBeNull();
    expect(parseWeight(900)).toBeNull();
  });
});

describe('Positionen', () => {
  it('vereinheitlicht Schreibweisen', () => {
    expect(normalizePosition('ED')).toBe('EDGE');
    expect(normalizePosition('DE')).toBe('EDGE');
    expect(normalizePosition('dt')).toBe('DI');
    expect(normalizePosition('FS')).toBe('S');
    expect(normalizePosition('HB')).toBe('RB');
    expect(normalizePosition(' ot ')).toBe('OT');
    expect(normalizePosition('OG')).toBe('IOL');
  });

  it('meldet Unbekanntes', () => {
    expect(normalizePosition('XYZ')).toBeUndefined();
    expect(normalizePosition(7)).toBeUndefined();
    expect(normalizePosition('')).toBeUndefined();
  });
});
