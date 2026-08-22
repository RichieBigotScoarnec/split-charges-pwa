import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCurrentPeriod,
  formatPeriod,
  formatDate,
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
