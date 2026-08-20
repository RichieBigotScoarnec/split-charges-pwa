import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCurrentPeriod,
  parsePeriod,
  formatPeriod,
  formatPeriodShort,
  getPreviousPeriod,
  getNextPeriod,
  generatePeriodList,
  isCurrentPeriod,
  formatDate,
  formatDateTime,
  getRelativeTime
} from '../public/js/utils/date.js';

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

// ===== parsePeriod =====
describe('parsePeriod', () => {
  it('retourne une Date au 1er du mois', () => {
    const date = parsePeriod('2026-03');
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2); // 0-indexé
    expect(date.getDate()).toBe(1);
  });

  it('janvier 2026', () => {
    const date = parsePeriod('2026-01');
    expect(date.getMonth()).toBe(0);
  });

  it('décembre 2025', () => {
    const date = parsePeriod('2025-12');
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(11);
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

// ===== formatPeriodShort =====
describe('formatPeriodShort', () => {
  it('formate en version courte', () => {
    const result = formatPeriodShort('2026-01');
    expect(result).toMatch(/janv/i);
    expect(result).toMatch(/2026/);
  });

  it('plus court que le format long', () => {
    const long = formatPeriod('2026-03');
    const short = formatPeriodShort('2026-03');
    expect(short.length).toBeLessThanOrEqual(long.length);
  });
});

// ===== getPreviousPeriod =====
describe('getPreviousPeriod', () => {
  it('mars → février', () => {
    expect(getPreviousPeriod('2026-03')).toBe('2026-02');
  });

  it('janvier → décembre de l\'année précédente', () => {
    expect(getPreviousPeriod('2026-01')).toBe('2025-12');
  });

  it('décembre → novembre', () => {
    expect(getPreviousPeriod('2026-12')).toBe('2026-11');
  });

  it('format YYYY-MM respecté', () => {
    expect(getPreviousPeriod('2026-10')).toMatch(/^\d{4}-\d{2}$/);
  });
});

// ===== getNextPeriod =====
describe('getNextPeriod', () => {
  it('janvier → février', () => {
    expect(getNextPeriod('2026-01')).toBe('2026-02');
  });

  it('décembre → janvier de l\'année suivante', () => {
    expect(getNextPeriod('2026-12')).toBe('2027-01');
  });

  it('novembre → décembre', () => {
    expect(getNextPeriod('2026-11')).toBe('2026-12');
  });

  it('format YYYY-MM respecté', () => {
    expect(getNextPeriod('2026-03')).toMatch(/^\d{4}-\d{2}$/);
  });
});

// ===== generatePeriodList =====
describe('generatePeriodList', () => {
  it('retourne le bon nombre de périodes', () => {
    // 2 avant + current + 1 après = 4
    const result = generatePeriodList(2, 1);
    expect(result).toHaveLength(4);
  });

  it('chaque item a value, label, isCurrent', () => {
    const result = generatePeriodList(1, 0);
    result.forEach(item => {
      expect(item).toHaveProperty('value');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('isCurrent');
    });
  });

  it('value est au format YYYY-MM', () => {
    const result = generatePeriodList(3, 1);
    result.forEach(item => {
      expect(item.value).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  it('un seul item a isCurrent = true', () => {
    const result = generatePeriodList(3, 1);
    const current = result.filter(i => i.isCurrent);
    expect(current).toHaveLength(1);
  });

  it('isCurrent correspond au mois en cours', () => {
    const result = generatePeriodList(3, 1);
    const current = result.find(i => i.isCurrent);
    expect(current.value).toBe(getCurrentPeriod());
  });

  it('sans arguments : par défaut 12+1 = 14 périodes', () => {
    const result = generatePeriodList();
    expect(result).toHaveLength(14); // 12 avant + current + 1 après
  });
});

// ===== isCurrentPeriod =====
describe('isCurrentPeriod', () => {
  it('mois en cours → true', () => {
    expect(isCurrentPeriod(getCurrentPeriod())).toBe(true);
  });

  it('mois passé → false', () => {
    expect(isCurrentPeriod('2020-01')).toBe(false);
  });

  it('mois futur → false', () => {
    expect(isCurrentPeriod('2099-12')).toBe(false);
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

// ===== formatDateTime =====
describe('formatDateTime', () => {
  it('inclut la date et l\'heure', () => {
    const date = new Date(2026, 2, 22, 14, 30); // 22 mars 2026, 14:30
    const result = formatDateTime(date);
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/14/);
    expect(result).toMatch(/30/);
  });

  it('plus long que formatDate seul', () => {
    const date = new Date(2026, 2, 22, 14, 30);
    expect(formatDateTime(date).length).toBeGreaterThan(formatDate(date).length);
  });
});

// ===== getRelativeTime =====
describe('getRelativeTime', () => {
  it('à l\'instant (< 1 min)', () => {
    const now = new Date();
    expect(getRelativeTime(now)).toBe("à l'instant");
  });

  it('il y a quelques secondes', () => {
    const date = new Date(Date.now() - 30 * 1000); // 30 secondes
    expect(getRelativeTime(date)).toBe("à l'instant");
  });

  it('il y a N minutes', () => {
    const date = new Date(Date.now() - 30 * 60 * 1000); // 30 min
    expect(getRelativeTime(date)).toBe('il y a 30 min');
  });

  it('il y a 1 minute', () => {
    const date = new Date(Date.now() - 90 * 1000); // 1.5 min
    expect(getRelativeTime(date)).toBe('il y a 1 min');
  });

  it('il y a N heures', () => {
    const date = new Date(Date.now() - 3 * 3600 * 1000); // 3h
    expect(getRelativeTime(date)).toBe('il y a 3h');
  });

  it('il y a N jours', () => {
    const date = new Date(Date.now() - 4 * 86400 * 1000); // 4j
    expect(getRelativeTime(date)).toBe('il y a 4j');
  });

  it('plus de 7 jours → retourne formatDate', () => {
    const date = new Date(Date.now() - 10 * 86400 * 1000); // 10j
    const result = getRelativeTime(date);
    // doit ressembler à une date, pas "il y a X"
    expect(result).not.toMatch(/il y a/);
    expect(result).toMatch(/\d{4}/); // contient l'année
  });

  it('accepte une chaîne ISO', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000); // 5 min
    expect(getRelativeTime(date.toISOString())).toBe('il y a 5 min');
  });
});
