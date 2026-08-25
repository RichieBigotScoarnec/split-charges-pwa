import { describe, it, expect } from 'vitest';
import {
  getCurrentPeriod,
  formatPeriod,
  formatDate,
  jourEtMois,
} from '../../public/js/utils/date.js';

// ===== getCurrentPeriod =====
describe('getCurrentPeriod', () => {
  it('retourne le format YYYY-MM', () => {
    const result = getCurrentPeriod();
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });

  it('correspond au mois en cours', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(getCurrentPeriod()).toBe(expected);
  });
});

// ===== formatPeriod =====
describe('formatPeriod', () => {
  it('formate en français long', () => {
    const result = formatPeriod('2026-01');
    expect(result).toMatch(/janvier/i);
    expect(result).toMatch(/2026/);
  });

  it('mars 2026', () => {
    expect(formatPeriod('2026-03')).toMatch(/mars/i);
  });

  it('décembre 2025', () => {
    expect(formatPeriod('2025-12')).toMatch(/décembre/i);
  });
});

// ===== formatDate =====
describe('formatDate', () => {
  it('formate un objet Date', () => {
    const date = new Date(2026, 0, 15); // 15 janvier 2026
    const result = formatDate(date);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
  });

  it('formate une chaîne ISO', () => {
    const result = formatDate('2026-03-22T00:00:00.000Z');
    expect(result).toMatch(/2026/);
  });

  it('contient le mois en français', () => {
    const date = new Date(2026, 2, 1); // mars 2026
    const result = formatDate(date);
    expect(result).toMatch(/mars/i);
  });
});

// ===== formatDate : l'absence ne doit pas devenir une affirmation =====
describe('formatDate face à une date absente', () => {
  it('rend une chaîne vide plutôt que la date du jour', () => {
    // `Intl.format(undefined)` formate l'instant présent : une charge sans
    // date s'affichait donc comme datée d'aujourd'hui. Sur une carte de
    // dépenses, c'est une information fausse présentée comme sûre.
    expect(formatDate(undefined)).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('rend une chaîne vide pour une date illisible', () => {
    expect(formatDate('pas une date')).toBe('');
    expect(formatDate(new Date('x'))).toBe('');
  });

  it('formate toujours ce qui est exploitable', () => {
    expect(formatDate('2026-08-22')).toMatch(/2026/);
    expect(formatDate(new Date(2026, 7, 22))).toMatch(/2026/);
    expect(formatDate(1755820800000)).toMatch(/20\d\d/);
  });
});

describe('jourEtMois', () => {
  // Pour nommer une échéance dans le mois qu'on regarde : « EDF le 12 sept. ».
  // `formatDate` y ajoute l'année, ce qui pèse trop dans une phrase qui en
  // enchaîne trois.

  it('rend le jour et le mois abrégé, sans l\'année', () => {
    expect(jourEtMois('2026-09-12')).toBe('12 sept.');
  });

  it('ne recule pas d\'un jour à l\'ouest de Greenwich', () => {
    // « 2026-09-01 » lu par `new Date` vaut minuit UTC : réaffiché à l'ouest,
    // il devenait le 31 août. La date est reconstruite en local.
    expect(jourEtMois('2026-09-01')).toBe('1 sept.');
  });

  it('garde le mois : la ligne peut décrire un mois à venir', () => {
    expect(jourEtMois('2026-10-05')).toBe('5 oct.');
  });

  it('rend une chaîne vide plutôt qu\'une date inventée', () => {
    expect(jourEtMois('')).toBe('');
    expect(jourEtMois(null)).toBe('');
    expect(jourEtMois('05/09/2026')).toBe('');
    expect(jourEtMois(1756000000000)).toBe('');
  });
});
