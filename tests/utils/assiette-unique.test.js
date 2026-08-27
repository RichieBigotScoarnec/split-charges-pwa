/**
 * Une seule assiette de revenus, et un sens de remboursement qui se prouve
 *
 * Trois défauts que rien ne pouvait montrer à l'écran, parce qu'aucun écran ne
 * met les deux chiffres côte à côte. Chacun a été mesuré avant d'être corrigé,
 * et ce fichier garde la mesure.
 *
 * 1. **L'instantané partiel.** `period.js` n'écrit que le champ modifié — bon
 *    réflexe, il évite qu'une saisie faite sur un téléphone n'emporte celle de
 *    l'autre. Mais dès que la première saisie du mois créait le nœud,
 *    `resolveSalaries` déclarait l'instantané souverain et les trois autres
 *    revenus valaient zéro. Le prorata basculait à 100 / 0, et un solde nul est
 *    un état parfaitement crédible.
 *
 * 2. **Les deux formules.** `computeBalanceChain` lisait `vous` et `conjointe`
 *    par une normalisation locale, quand `computeSummary` passe par
 *    `resolveIncomeBase`, qui ajoute les revenus complémentaires. Deux chemins,
 *    deux assiettes, deux réponses pour le même mois — et l'écart se cumulait,
 *    la chaîne repartant de son propre total.
 *
 * 3. **Le sens absent.** Le `else` comptait comme « conjointe → vous » tout ce
 *    qui n'était pas « vous → conjointe » : un champ absent, vide ou mal
 *    orthographié désignait donc quelqu'un.
 */

import { describe, it, expect } from 'vitest';
import { resolveSalaries } from '../../public/js/utils/salaries.js';
import { computeSummary, computeBalanceChain } from '../../public/js/utils/calculations.js';

const GLOBAUX = { vous: 2500, conjointe: 1800, extraVous: 0, extraConjointe: 0 };

describe('Un instantané partiel ne met pas les autres revenus à zéro', () => {
  it('les clés absentes retombent sur les valeurs globales', () => {
    // Ce qu'écrit `dbUpdate(periods/2026-09/salaries, { vous: 2600 })`.
    const { salaries, fromSnapshot } = resolveSalaries({ vous: 2600 }, GLOBAUX);

    expect(fromSnapshot).toBe(true);
    expect(salaries.vous).toBe(2600);
    expect(salaries.conjointe).toBe(1800); // valait 0 : le prorata basculait
  });

  it('un zéro saisi reste un zéro, il n\'est pas confondu avec une absence', () => {
    const { salaries } = resolveSalaries({ vous: 2600, conjointe: 0 }, GLOBAUX);

    expect(salaries.conjointe).toBe(0);
  });

  it('le prorata ne bascule plus à 100 / 0 après une correction de salaire', () => {
    const { salaries } = resolveSalaries({ vous: 2600 }, GLOBAUX);
    const bilan = computeSummary({
      salaries,
      fixedCharges: [{ amount: 1000, paidBy: 'vous' }],
      variableCharges: [], reimbursements: [],
      shareMode: 'prorata', customPercents: {}
    });

    // Mesuré avant correction : 0 € — elle était réputée sans revenu.
    // 1 000 × 1 800 / 4 400 = 409,09 €, au centime près comme le fait le bilan.
    expect(bilan.balance).toBe(409.09);
  });

  it('un instantané absent retombe entièrement sur les globaux, comme avant', () => {
    expect(resolveSalaries(null, GLOBAUX)).toEqual({ salaries: GLOBAUX, fromSnapshot: false });
  });

  it('sans globaux exploitables, la forme reste complète', () => {
    const { salaries } = resolveSalaries(undefined, undefined);
    expect(salaries).toEqual({ vous: 0, conjointe: 0, extraVous: 0, extraConjointe: 0 });
  });
});

describe('Le report et l\'écran calculent le même solde', () => {
  /** Le même mois, dit des deux façons */
  const MOIS_PLAT = { fixedCharges: [{ amount: 1000, paidBy: 'vous' }], variableCharges: [], reimbursements: [] };
  const MOIS_ARBRE = { fixedCharges: { f1: { amount: 1000, paidBy: 'vous' } }, variableCharges: {}, reimbursements: {} };

  it('les revenus complémentaires comptent des deux côtés', () => {
    const salaries = { vous: 2000, conjointe: 2000, extraVous: 1000, extraConjointe: 0 };

    const ecran = computeSummary({ salaries, ...MOIS_PLAT, shareMode: 'prorata', customPercents: {} });
    const report = computeBalanceChain(
      { '2026-07': MOIS_ARBRE },
      { shareMode: 'prorata', customPercents: {}, globalSalaries: salaries }
    );

    // Mesuré avant correction : écran 400 €, report 500 €. Cent euros nés de
    // rien, et cumulés chaque mois.
    expect(ecran.balance).toBeCloseTo(400, 6);
    expect(report.get('2026-07').own).toBeCloseTo(ecran.balance, 6);
  });

  it('l\'égalité tient aussi quand la période porte son propre instantané', () => {
    const salaries = { vous: 3000, conjointe: 1000, extraVous: 0, extraConjointe: 500 };
    const mois = { ...MOIS_ARBRE, salaries };

    const ecran = computeSummary({ salaries, ...MOIS_PLAT, shareMode: 'prorata', customPercents: {} });
    const report = computeBalanceChain(
      { '2026-07': mois },
      { shareMode: 'prorata', customPercents: {}, globalSalaries: { vous: 1, conjointe: 1 } }
    );

    expect(report.get('2026-07').own).toBeCloseTo(ecran.balance, 6);
  });

  it('l\'égalité tient sur un instantané partiel', () => {
    const mois = { ...MOIS_ARBRE, salaries: { vous: 2600 } };

    const { salaries } = resolveSalaries({ vous: 2600 }, GLOBAUX);
    const ecran = computeSummary({ salaries, ...MOIS_PLAT, shareMode: 'prorata', customPercents: {} });
    const report = computeBalanceChain(
      { '2026-07': mois },
      { shareMode: 'prorata', customPercents: {}, globalSalaries: GLOBAUX }
    );

    expect(report.get('2026-07').own).toBeCloseTo(ecran.balance, 6);
  });
});

describe('Un sens de remboursement inconnu ne désigne personne', () => {
  const base = {
    salaries: { vous: 2000, conjointe: 2000 },
    fixedCharges: [], variableCharges: [],
    shareMode: '50-50', customPercents: { vous: 50, conjointe: 50 }
  };
  const solde = (reimbursements) => computeSummary({ ...base, reimbursements }).balance;

  it('les deux sens reconnus déplacent le solde, chacun dans le sien', () => {
    expect(solde([{ amount: 500, direction: 'vous-to-conjointe' }])).toBe(500);
    expect(solde([{ amount: 500, direction: 'conjointe-to-vous' }])).toBe(-500);
  });

  it('un remboursement sans sens ne déplace plus rien', () => {
    // Mesuré avant correction : -500, soit exactement « conjointe → vous ».
    // Mille euros d'écart entre les deux lectures possibles d'une même donnée.
    expect(solde([{ amount: 500 }])).toBe(0);
  });

  it('un sens mal orthographié ne déplace plus rien non plus', () => {
    expect(solde([{ amount: 500, direction: 'from-you' }])).toBe(0);
    expect(solde([{ amount: 500, direction: '' }])).toBe(0);
  });

  it('un remboursement supprimé reste ignoré', () => {
    expect(solde([{ amount: 500, direction: 'vous-to-conjointe', deleted: true }])).toBe(0);
  });
});
