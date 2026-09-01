import { describe, it, expect } from 'vitest';
import { periodeDeLaDate, reporterDansLaPeriode } from '../../public/js/utils/date.js';

/**
 * Le mois auquel une date appartient
 *
 * Le défaut qui a motivé cette fonction ne se voyait pas à l'écran : une
 * dépense du 1er septembre rangée sous `periods/2026-07`, parce que le
 * formulaire pré-remplit la date du JOUR et que l'écriture visait le mois
 * AFFICHÉ. Rien ne réconciliait les deux valeurs, et rien ne les comparait.
 *
 * Ce n'était pas un défaut de rangement : le total de juillet gonflait d'une
 * dépense de septembre, et le solde entre les deux personnes du foyer était
 * faux d'autant.
 */

describe('periodeDeLaDate', () => {
  it('rend le mois de la date', () => {
    expect(periodeDeLaDate('2026-09-01')).toBe('2026-09');
    expect(periodeDeLaDate('2026-07-31')).toBe('2026-07');
    expect(periodeDeLaDate('2026-01-15')).toBe('2026-01');
  });

  it('tient au passage d\'année', () => {
    expect(periodeDeLaDate('2025-12-31')).toBe('2025-12');
    expect(periodeDeLaDate('2026-01-01')).toBe('2026-01');
  });

  it('refuse ce qui n\'est pas une date, plutôt que de deviner', () => {
    // Rendre le mois courant sur une entrée illisible remettrait exactement le
    // défaut qu'on corrige : une valeur inventée qui a l'air juste.
    for (const entree of [null, undefined, '', '2026-09', '2026-13-01', '2026-09-32',
      '01/09/2026', 1756000000000, {}, '2026-00-10']) {
      expect(periodeDeLaDate(entree), `entrée : ${JSON.stringify(entree)}`).toBeNull();
    }
  });

  it('est l\'inverse de reporterDansLaPeriode', () => {
    // Les deux fonctions se répondent : l'une amène une date dans un mois,
    // l'autre lit le mois d'une date. Le tour complet doit être neutre.
    for (const periode of ['2026-01', '2026-02', '2026-07', '2026-12']) {
      const reportee = reporterDansLaPeriode('2026-09-15', periode);
      expect(periodeDeLaDate(reportee)).toBe(periode);
    }
  });

  it('TÉMOIN — le cas réel du 2026-09-01', () => {
    // La dépense saisie ce jour-là, en consultant juillet. Sa date dit
    // septembre ; c'est septembre qui doit l'accueillir.
    expect(periodeDeLaDate('2026-09-01')).not.toBe('2026-07');
    expect(periodeDeLaDate('2026-09-01')).toBe('2026-09');
  });
});
