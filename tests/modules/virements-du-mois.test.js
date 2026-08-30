// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn()
}));

import { setState, resetState } from '../../public/js/state.js';
import { calculateSummary } from '../../public/js/modules/summary.js';

/**
 * Le panneau des virements calcule sous les termes DU MOIS, et sur la vraie assiette
 *
 * Ce panneau dit à la conjointe combien virer, et vers quelle destination. C'est
 * un chiffre qu'on recopie dans une application bancaire : il n'a pas droit à
 * l'à-peu-près.
 *
 * Or il est calculé par un appel SÉPARÉ de celui du bilan, à
 * `computeVirementsByDestination`, avec ses propres arguments — et rien ne
 * tenait ces arguments. Trois mutants mesurés, trois survivants sur les
 * 2 378 contrôles d'alors :
 *
 *   1. `shareMode` et `customPercents` remplacés par les réglages GLOBAUX du
 *      foyer au lieu de ceux, figés, du mois. C'est le défaut `resolveShareMode`
 *      — celui qui a déjà ressuscité 125 € sur un juillet clos — reproduit sur
 *      la seule surface qui ne l'avait jamais eu.
 *   2. `salaries: incomeBase` remplacé par les salaires BRUTS. Le prorata perd
 *      alors les revenus complémentaires, et les parts se déplacent sans que
 *      rien ne l'annonce.
 *   3. Le filtre `deleted` retiré : une charge à la corbeille se remet à
 *      réclamer un virement.
 *
 * Le bilan, lui, était tenu. Ce fichier tient l'autre moitié — celle qu'on
 * recopie à la banque.
 */

/**
 * Salaires inégaux ET revenus complémentaires DES DEUX CÔTÉS
 *
 * `extraConjointe` n'est pas décoratif. Avec un complément du seul côté de
 * Richard, la part de la conjointe vaut `1000 / total` que l'on parte des
 * salaires bruts ou de l'assiette résolue — les deux lectures coïncident, et le
 * contrôle passait pour la mauvaise raison. Mesuré : le mutant survivait.
 *
 * Assiette : 4 000 / 1 500, total 5 500. La conjointe pèse 27,27 % ; sur les
 * seuls salaires bruts elle pèserait 18,18 %.
 */
const SALAIRES = { vous: 3000, conjointe: 1000, extraVous: 1000, extraConjointe: 500 };

/** Deux charges fixes vers la même destination, une vers une autre */
const FIXES = [
  { id: 'f1', description: 'Loyer', amount: 1000, paidBy: 'vous', destination: 'Compte Joint', deleted: false },
  { id: 'f2', description: 'Électricité', amount: 200, paidBy: 'vous', destination: 'Compte Joint', deleted: false },
  { id: 'f3', description: 'Assurance', amount: 100, paidBy: 'vous', destination: 'Env. Charges Fixes', deleted: false }
];

/**
 * Monte l'état, rend le bilan, et lit le total des virements SUR LA PAGE
 *
 * On lit l'écran plutôt que la valeur de retour : c'est ce chiffre-là que la
 * conjointe recopie, et c'est lui qui doit être juste.
 */
function totalAVirer({ modeDuMois, modeGlobal, partsDuMois, partsGlobales, fixes = FIXES, salaries = SALAIRES }) {
  resetState();
  document.body.innerHTML = '<div id="summarySection"></div>';

  setState('salaries', salaries);
  setState('fixedCharges', fixes);
  setState('variableCharges', []);
  setState('reimbursements', []);
  setState('currentPeriod', '2026-07');
  setState('shareMode', modeGlobal);
  if (modeDuMois) setState('shareModeDuMois', modeDuMois);
  if (partsGlobales) setState('customPercents', partsGlobales);
  if (partsDuMois) setState('customPercentsDuMois', partsDuMois);

  calculateSummary();

  const ligne = document.querySelector('.virement-grand-total strong');
  expect(ligne, 'le panneau des virements n\'a pas été rendu').not.toBeNull();

  // « 1 171,01 € » → 1171.01 : l'espace des milliers est une insécable étroite.
  return Number(ligne.textContent.replace(/[^\d,.-]/g, '').replace(',', '.'));
}

beforeEach(() => resetState());

describe('LES TERMES FIGÉS DU MOIS valent aussi pour ce qu\'on vire', () => {
  it('un mois figé au 50-50 vire la moitié, le foyer fût-il passé au prorata', () => {
    // 1 300 € de charges fixes, moitié = 650 €.
    expect(totalAVirer({ modeDuMois: '50-50', modeGlobal: 'prorata' })).toBeCloseTo(650, 2);
  });

  it('un mois figé au prorata garde SES parts, le foyer fût-il passé au 50-50', () => {
    // Assiette 1 500 / 5 500 : la conjointe doit 1 300 × 0,272727 = 354,55 €.
    expect(totalAVirer({ modeDuMois: 'prorata', modeGlobal: '50-50' })).toBeCloseTo(354.55, 1);
  });

  it('et les POURCENTAGES figés l\'emportent sur ceux du foyer', () => {
    // Figer le mode sans ses paramètres ne protégerait rien sur « custom », le
    // seul mode qui en porte. 1 300 × 0,30 = 390 €, et non × 0,70.
    //
    // 30 % et non 20 : à 20 % la part vaudrait 260 €, exactement ce que rend le
    // prorata sur cette assiette. Le contrôle serait alors passé même si le
    // panneau ignorait « custom » — c'est le témoin ci-dessous qui l'a dit.
    const affiche = totalAVirer({
      modeDuMois: 'custom', modeGlobal: 'custom',
      partsDuMois: { vous: 70, conjointe: 30 },
      partsGlobales: { vous: 30, conjointe: 70 }
    });

    expect(affiche).toBeCloseTo(390, 2);
  });

  it('TÉMOIN — les trois modes figés donnent trois totaux distincts', () => {
    // Sans lui, un panneau qui ignorerait le mode passerait les trois contrôles
    // ci-dessus dès lors que les réglages du foyer coïncideraient.
    const totaux = [
      totalAVirer({ modeDuMois: 'prorata', modeGlobal: 'prorata' }),
      totalAVirer({ modeDuMois: '50-50', modeGlobal: 'prorata' }),
      totalAVirer({
        modeDuMois: 'custom', modeGlobal: 'prorata',
        partsDuMois: { vous: 70, conjointe: 30 }
      })
    ];

    expect(new Set(totaux.map(t => t.toFixed(2))).size).toBe(3);
  });
});

describe('L\'ASSIETTE du prorata, et non les salaires bruts', () => {
  it('les revenus complémentaires déplacent ce qu\'il y a à virer', () => {
    // Déclarer les compléments change ce qu'il y a à virer : 325 € sans eux,
    // 354,55 € avec. Trente euros d'écart sur un chiffre qu'on recopie à la
    // banque — et le mutant qui passe les salaires BRUTS à la place de
    // l'assiette descendrait, lui, à 236,36 €.
    const avecComplement = totalAVirer({ modeDuMois: 'prorata', modeGlobal: 'prorata' });
    const sansComplement = totalAVirer({
      modeDuMois: 'prorata', modeGlobal: 'prorata',
      salaries: { vous: 3000, conjointe: 1000 }
    });

    expect(avecComplement).toBeCloseTo(354.55, 1);
    expect(sansComplement).toBeCloseTo(325, 2);
    expect(avecComplement).not.toBeCloseTo(sansComplement, 1);
  });
});

describe('LA CORBEILLE, sur la surface qu\'on recopie à la banque', () => {
  it('une charge fixe supprimée ne réclame aucun virement', () => {
    // Le filtre vit chez l'appelant ET dans la fonction. Ce contrôle-ci tient le
    // chemin complet, jusqu'au chiffre affiché.
    const avecCorbeille = totalAVirer({
      modeDuMois: '50-50', modeGlobal: '50-50',
      fixes: [...FIXES, {
        id: 'f4', description: 'Ancien loyer', amount: 900,
        paidBy: 'vous', destination: 'Compte Joint', deleted: true
      }]
    });

    expect(avecCorbeille).toBeCloseTo(650, 2);
  });
});
