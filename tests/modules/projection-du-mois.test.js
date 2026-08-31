// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn()
}));

import { setState, resetState } from '../../public/js/state.js';
import { calculateSummary } from '../../public/js/modules/summary.js';
import { projectionDuMois } from '../../public/js/utils/anticipation.js';
import { formatCurrency } from '../../public/js/utils/format.js';

/**
 * La projection est-elle BRANCHÉE sur l'horloge, ou sur le sélecteur ?
 *
 * `projectionDuMois` est éprouvée sous tous ses angles par
 * `tests/utils/anticipation.test.js` — la fonction pure. Mais aucun contrôle ne
 * regardait son APPEL depuis `summary.js`, et c'est le trou que ce dépôt a
 * refermé cinq fois déjà : `resolvePercents`, `termesDuMois`, la garde
 * `deleted` des virements, `operationRejouable`, `customPercentsDuMois`. À
 * chaque fois la même phrase : « la fabrique était juste ; c'est son appel qui
 * n'était pas tenu. »
 *
 * Le mutant qu'il fallait attraper : passer `moisReel: getState('currentPeriod')`
 * au lieu de l'horloge. La garde interne devient alors toujours vraie —
 * `moisCourant === moisReel` par construction — et choisir un juillet clos
 * annoncerait « il reste 22 jours, le mois finira autour de 5 580 € » sur un
 * mois terminé depuis des semaines. La fonction pure resterait parfaite.
 *
 * Le second : rendre la ligne sans passer par la fabrique, en recalculant. Le
 * contrôle de raccord ci-dessous l'attrape — la projection et le prévisionnel
 * doivent partir du MÊME total engagé.
 */

/** Salaires : sans eux `calculateSummary` sort avant de rendre quoi que ce soit */
const SALAIRES = { vous: 2500, conjointe: 1800 };

/** Une charge commune minimale */
const charge = (id, amount, extra = {}) => ({
  id, description: 'Vie', amount, category: 'Maison',
  paidBy: 'vous', deleted: false, ...extra
});

/** Un mois révolu, tel que l'historique le porte */
const moisRevolu = (amount) => ({
  salaries: SALAIRES,
  variableCharges: { [`v${amount}`]: charge(`v${amount}`, amount) }
});

/**
 * Cinq mois révolus à 1 000 €, puis un août qui part deux fois plus vite
 *
 * 600 € en 10 jours → 1 860 € sur 31, contre 1 000 € d'ordinaire.
 */
const HISTORIQUE = {
  '2026-03': moisRevolu(1000),
  '2026-04': moisRevolu(1000),
  '2026-05': moisRevolu(1000),
  '2026-06': moisRevolu(1000),
  '2026-07': moisRevolu(1000),
  '2026-08': {
    salaries: SALAIRES,
    variableCharges: { v8: charge('v8', 600, { date: '2026-08-04' }) }
  }
};

/** Le 10 août 2026, midi : dix jours écoulés sur trente et un */
const LE_10_AOUT = new Date(2026, 7, 10, 12, 0, 0);

/**
 * Monte l'état comme `loadPeriodData` le monte, et rend le bilan peint
 *
 * @param {string} moisAffiche - Ce que le sélecteur montre
 * @param {Object} [historique]
 * @returns {HTMLElement}
 */
function bilanRendu(moisAffiche, historique = HISTORIQUE) {
  resetState();

  const duMois = historique[moisAffiche] || {};

  setState('currentPeriod', moisAffiche);
  setState('salaries', duMois.salaries || SALAIRES);
  setState('variableCharges', Object.values(duMois.variableCharges || {}));
  setState('fixedCharges', Object.values(duMois.fixedCharges || {}));
  setState('reimbursements', []);
  setState('shareMode', 'prorata');

  // La signature déstructure : `calculateSummary(historique)` passerait
  // l'instantané en pure perte, et la ligne ne paraîtrait jamais — pour une
  // raison qui n'a rien à voir avec ce qu'on mesure.
  calculateSummary({ historique });

  return document.getElementById('summarySection');
}

describe('La projection du mois, telle que le bilan la peint', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="summarySection"></div>
      <div id="balanceBar"></div>
      <div id="categoryBudgets"></div>
      <section id="trendsSection"></section>
    `;
    vi.useFakeTimers();
    vi.setSystemTime(LE_10_AOUT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('annonce où va le mois en cours, avec le nombre de la fabrique', () => {
    const bilan = bilanRendu('2026-08');
    const ligne = bilan.querySelector('.summary-projection');

    expect(ligne).not.toBe(null);

    // Le montant est REPRIS de la fabrique, jamais réécrit à la main ici : si
    // le rendu se met à recalculer, les deux divergeront et ce contrôle le dira.
    const attendu = projectionDuMois({
      periods: HISTORIQUE, moisCourant: '2026-08', moisReel: '2026-08',
      jourDuMois: 10, joursDuMois: 31
    });

    expect(ligne.textContent).toContain(formatCurrency(attendu.projection));
    expect(ligne.textContent).toContain(formatCurrency(attendu.ordinaire));
  });

  it('compte les jours restants le jour même compris', () => {
    const bilan = bilanRendu('2026-08');

    // Le 10 d'un mois de 31 jours : 22, comme la cadence d'une enveloppe.
    expect(bilan.querySelector('.summary-projection').textContent)
      .toContain('Il reste 22 jours');
  });

  it('hausse le ton quand le rythme dépasse, sans déplacer le montant', () => {
    const bilan = bilanRendu('2026-08');
    const ligne = bilan.querySelector('.summary-projection');

    // 1 860 € contre 1 000 € d'ordinaire : bien au-delà du seuil.
    expect(ligne.classList.contains('summary-projection--attention')).toBe(true);
    expect(ligne.textContent).toContain('de plus qu\'un mois ordinaire');
  });

  it('reste neutre quand le mois suit son cours', () => {
    // 320 € en 10 jours → 992 € sur 31 : un mois normal, et la ligne le dit
    // quand même. C'est tout ce qui la sépare de la carte d'alerte qu'elle
    // remplace, laquelle laissait le premier écran muet le reste du temps.
    const calme = {
      ...HISTORIQUE,
      '2026-08': {
        salaries: SALAIRES,
        variableCharges: { v8: charge('v8', 320, { date: '2026-08-04' }) }
      }
    };
    const ligne = bilanRendu('2026-08', calme).querySelector('.summary-projection');

    expect(ligne).not.toBe(null);
    expect(ligne.classList.contains('summary-projection--attention')).toBe(false);
    expect(ligne.textContent).toContain('un mois ordinaire coûte');
  });

  /**
   * LE TÉMOIN DU CÂBLAGE — celui qui manquait
   *
   * Le mois vient du sélecteur, le jour de l'horloge. Les confondre rend la
   * garde interne toujours vraie, et la fonction pure ne s'en apercevrait
   * jamais.
   */
  it('ne projette RIEN sur un mois révolu, même chargé de dépenses', () => {
    // Juillet porte 1 000 € : sans la garde, 1 000 × 31/10 = 3 100 € « à la
    // fin » d'un mois clos depuis dix jours.
    const bilan = bilanRendu('2026-07');

    expect(bilan.querySelector('.summary-projection')).toBe(null);
  });

  it('ni sur le mois d\'avance que le sélecteur propose', () => {
    const avecSeptembre = {
      ...HISTORIQUE,
      '2026-09': {
        salaries: SALAIRES,
        variableCharges: { v9: charge('v9', 900, { date: '2026-09-01' }) }
      }
    };
    const bilan = bilanRendu('2026-09', avecSeptembre);

    expect(bilan.querySelector('.summary-projection')).toBe(null);
  });

  /**
   * LE RACCORD ENTRE LES DEUX NOMBRES
   *
   * Le prévisionnel et la projection sont peints l'un sous l'autre et parlent
   * tous deux du même mois. Deux totaux engagés qui divergeraient mettraient
   * deux réponses à la même question sur le premier écran — et « un chiffre
   * qu'on ne sait pas raccorder au précédent est pire qu'un chiffre absent »
   * est déjà écrit dans le contrôle du prévisionnel.
   */
  it('part du même total engagé que le prévisionnel', () => {
    const attendu = projectionDuMois({
      periods: HISTORIQUE, moisCourant: '2026-08', moisReel: '2026-08',
      jourDuMois: 10, joursDuMois: 31
    });

    // `previsionnelDuMois` additionne les charges du mois depuis l'état ;
    // `projectionDuMois` les additionne depuis `periods`. Les deux doivent
    // retomber sur le même engagé — 600 € ici.
    expect(attendu.fixe + attendu.variable).toBeCloseTo(600, 2);
  });

  it('se tait sans historique plutôt que d\'inventer un mois ordinaire', () => {
    resetState();
    setState('currentPeriod', '2026-08');
    setState('salaries', SALAIRES);
    setState('variableCharges', [charge('v8', 600)]);
    setState('fixedCharges', []);
    setState('reimbursements', []);
    setState('shareMode', 'prorata');

    calculateSummary();

    expect(document.getElementById('summarySection').querySelector('.summary-projection'))
      .toBe(null);
  });
});
