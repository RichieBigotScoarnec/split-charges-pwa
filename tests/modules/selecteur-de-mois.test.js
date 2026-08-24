// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Le sélecteur de mois, éprouvé aux fins de mois
 *
 * La liste se construisait en reculant le mois d'une date portant le quantième
 * du jour : `date.setMonth(date.getMonth() - i)`. Or `setMonth` conserve le
 * quantième, et le 31 mars un recul d'un mois donne le 31 février, que
 * JavaScript reporte au 3 mars. Le mois de février disparaissait de la liste,
 * mars y figurait deux fois.
 *
 * Le défaut ne se voit que du 29 au 31 : trois jours sur trente, soit presque
 * jamais pendant qu'on développe, et toujours au pire moment pour qui saisit
 * ses comptes de fin de mois.
 *
 * La liste compte désormais treize entrées : les douze mois glissants, plus un
 * mois d'avance. Le loyer du mois prochain, ou l'enveloppe d'un séjour, se
 * saisit quand on a l'information en main — pas le 1er du mois. Elle s'étend
 * en outre à tout mois présent en base, ce que ces cas ne couvrent pas : ils
 * n'en fournissent aucun, et éprouvent ici la seule suite glissante.
 */

vi.mock('../../public/js/db.js', () => ({
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve()),
  dbPush: vi.fn(() => Promise.resolve('cle')),
  getDataPath: vi.fn(path => `household/${path}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/variable-charges.js', () => ({
  loadVariableCharges: vi.fn(() => Promise.resolve())
}));
vi.mock('../../public/js/modules/fixed-charges.js', () => ({
  loadFixedCharges: vi.fn(() => Promise.resolve())
}));
vi.mock('../../public/js/modules/reimbursements.js', () => ({
  loadReimbursements: vi.fn(() => Promise.resolve())
}));
vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));

const { initPeriod } = await import('../../public/js/modules/period.js');
const { resetState } = await import('../../public/js/state.js');

/** Valeurs proposées par le sélecteur, dans l'ordre */
const moisProposes = () =>
  [...document.querySelectorAll('#periodSelect option')].map(o => o.value);

beforeEach(() => {
  resetState();
  document.body.innerHTML = `
    <select id="periodSelect"></select>
    <div id="periodInfo"></div>
    <input id="salaireVous"><input id="salaireConjointe">
    <input id="revenusVous"><input id="revenusConjointe">
    <button id="extraIncomeToggle"></button>
    <div id="extraIncomeFields" hidden></div>
  `;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Une suite continue, quel que soit le jour', () => {
  // Les trois quantièmes qui déclenchaient le report, et un témoin.
  for (const jour of [29, 30, 31, 15]) {
    it(`le ${jour} mars, la liste ne saute ni ne double aucun mois`, () => {
      vi.setSystemTime(new Date(2026, 2, jour, 12, 0, 0));

      initPeriod();
      const mois = moisProposes();

      expect(mois, 'un mois d\'avance, puis les douze glissants').toHaveLength(13);
      expect(new Set(mois).size, `doublon dans ${mois.join(', ')}`).toBe(13);
      expect(mois[0], 'le mois d\'avance vient en tête').toBe('2026-04');
      expect(mois[1]).toBe('2026-03');
      expect(mois[2], 'février doit suivre mars').toBe('2026-02');
    });
  }

  it('le 31 mai, la suite reste continue', () => {
    vi.setSystemTime(new Date(2026, 4, 31, 8, 0, 0));

    initPeriod();

    expect(moisProposes()).toEqual([
      '2026-06',
      '2026-05', '2026-04', '2026-03', '2026-02', '2026-01',
      '2025-12', '2025-11', '2025-10', '2025-09', '2025-08',
      '2025-07', '2025-06'
    ]);
  });

  it('le passage d\'année est correct', () => {
    vi.setSystemTime(new Date(2026, 0, 31, 8, 0, 0));

    initPeriod();
    const mois = moisProposes();

    expect(mois[0]).toBe('2026-02');
    expect(mois[1]).toBe('2026-01');
    expect(mois[2]).toBe('2025-12');
    expect(new Set(mois).size).toBe(13);
  });

  it('le mois en cours reste celui qui est sélectionné', () => {
    // Le mois d'avance ouvre la liste : sans cette garde, l'application
    // s'ouvrirait sur un mois futur et vide.
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));

    initPeriod();

    expect(document.getElementById('periodSelect').value).toBe('2026-03');
  });
});
