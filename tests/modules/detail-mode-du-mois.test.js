// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn()
}));

import { setState, resetState } from '../../public/js/state.js';
import { ouvrirDetailPayeur } from '../../public/js/modules/detail-depenses.js';
import { computeSummary } from '../../public/js/utils/calculations.js';

/**
 * Le détail lit les termes du mois AFFICHÉ, pas ceux du foyer aujourd'hui
 *
 * `tests/utils/detail.test.js` éprouve la fonction pure `detailDuPayeur` en lui
 * passant `shareMode` et `customPercents` explicitement — et il le fait pour
 * les trois modes. Mais il ne touche jamais `termesDuMois()`, la fonction du
 * MODULE qui va chercher ces deux valeurs dans l'état.
 *
 * Le trou : remplacer les deux fabriques de `detail-depenses.js` par les
 * réglages globaux du foyer laissait les 2 323 tests verts. Mesuré. La modale
 * aurait alors calculé la part des charges partagées avec les termes
 * d'aujourd'hui pendant que la ligne du bilan qu'on vient de cliquer utilise
 * ceux, figés, du mois — et la liste n'additionnerait plus jusqu'à son total,
 * ce que l'en-tête du module présente comme sa raison d'être.
 *
 * C'est la classe de défaut la plus coûteuse de ce dépôt, et elle avait déjà
 * coûté 125 € sur un juillet clos. La fabrique est correcte ; c'est son APPEL
 * depuis le module qui n'avait aucun témoin.
 */

/** Salaires inégaux : c'est ce qui sépare le prorata du 50-50 */
const SALAIRES = { vous: 3000, conjointe: 1000 };

/** Une charge PARTAGÉE : c'est la seule dont la part dépende du mode */
const PARTAGEE = {
  id: 'v1', description: 'Week-end', amount: 400, category: 'Loisirs',
  paidBy: 'partage', date: '2026-07-20', deleted: false
};

/** Et une charge avancée par une seule personne, qui n'en dépend pas */
const AVANCEE = {
  id: 'v2', description: 'Courses', amount: 100, category: 'Courses',
  paidBy: 'vous', date: '2026-07-12', deleted: false
};

/**
 * ET UNE CHARGE FIXE — la moitié que le contrôle ne regardait pas
 *
 * `termesDuMois()` rend `fixedCharges` autant que `variableCharges`. Le jeu
 * d'essai ne portait que des variables : mesuré, remplacer
 * `fixedCharges: getState('fixedCharges') || []` par `fixedCharges: []` laissait
 * les 2 378 contrôles verts. La modale aurait alors omis le loyer du détail de
 * son payeur, et son total n'aurait plus rien additionné jusqu'au chiffre du
 * bilan — ce que l'en-tête du module présente comme sa raison d'être.
 */
const FIXE = {
  id: 'f1', description: 'Loyer', amount: 900, category: 'Logement',
  paidBy: 'vous', date: '2026-07-01', deleted: false
};

const CHARGES = [PARTAGEE, AVANCEE];

/**
 * Monte l'état comme `loadPeriodData` le monte, puis ouvre la modale et rend
 * le total qu'elle affiche.
 */
function totalAffiche({ modeDuMois, modeGlobal, partsDuMois, partsGlobales }) {
  resetState();
  document.body.innerHTML = '';

  setState('salaries', SALAIRES);
  setState('fixedCharges', [FIXE]);
  setState('variableCharges', CHARGES);
  setState('reimbursements', []);
  setState('currentPeriod', '2026-07');
  setState('shareMode', modeGlobal);
  if (modeDuMois) setState('shareModeDuMois', modeDuMois);
  if (partsGlobales) setState('customPercents', partsGlobales);
  if (partsDuMois) setState('customPercentsDuMois', partsDuMois);

  ouvrirDetailPayeur('vous');

  const montant = document.querySelector('#modalDetailDepenses .detail-total-montant');
  expect(montant, 'la modale n\'a pas été rendue').not.toBeNull();

  // « 1 171,01 € » → 1171.01 : l'espace des milliers est une insécable étroite.
  return Number(montant.textContent.replace(/[^\d,.-]/g, '').replace(',', '.'));
}

/** Ce que le BILAN attribue à Richard, sous les mêmes termes */
function duBilan({ shareMode, customPercents }) {
  return computeSummary({
    salaries: SALAIRES,
    fixedCharges: [FIXE],
    variableCharges: CHARGES,
    reimbursements: [],
    shareMode,
    customPercents: customPercents || { vous: 50, conjointe: 50 }
  }).yourActualPayments;
}

beforeEach(() => resetState());

describe('LA PROPRIÉTÉ : le détail retrouve le chiffre du bilan, sous le mode FIGÉ du mois', () => {
  it('mois figé au 50-50, foyer passé au prorata', () => {
    const affiche = totalAffiche({ modeDuMois: '50-50', modeGlobal: 'prorata' });

    expect(affiche).toBeCloseTo(duBilan({ shareMode: '50-50' }), 2);
  });

  it('mois figé au prorata, foyer passé au 50-50 — le sens inverse', () => {
    const affiche = totalAffiche({ modeDuMois: 'prorata', modeGlobal: '50-50' });

    expect(affiche).toBeCloseTo(duBilan({ shareMode: 'prorata' }), 2);
  });

  it('mois figé en « custom », foyer passé à d\'autres parts', () => {
    // Figer le mode sans ses paramètres ne protégeait rien sur « custom », le
    // seul mode qui en porte.
    const affiche = totalAffiche({
      modeDuMois: 'custom', modeGlobal: 'custom',
      partsDuMois: { vous: 80, conjointe: 20 },
      partsGlobales: { vous: 30, conjointe: 70 }
    });

    expect(affiche).toBeCloseTo(
      duBilan({ shareMode: 'custom', customPercents: { vous: 80, conjointe: 20 } }), 2
    );
  });

  it('sans mode figé, le détail suit le réglage du foyer', () => {
    const affiche = totalAffiche({ modeDuMois: null, modeGlobal: '50-50' });

    expect(affiche).toBeCloseTo(duBilan({ shareMode: '50-50' }), 2);
  });
});

describe('TÉMOIN NÉGATIF — les termes du mois changent bien le chiffre', () => {
  it('les trois modes figés donnent trois totaux distincts', () => {
    // Sans lui, un détail qui ignorerait le mode passerait tous les contrôles
    // ci-dessus : il suffirait que les termes du foyer soient les mêmes.
    const totaux = [
      totalAffiche({ modeDuMois: 'prorata', modeGlobal: 'prorata' }),
      totalAffiche({ modeDuMois: '50-50', modeGlobal: 'prorata' }),
      totalAffiche({
        modeDuMois: 'custom', modeGlobal: 'prorata',
        partsDuMois: { vous: 80, conjointe: 20 }
      })
    ];

    expect(new Set(totaux.map(t => t.toFixed(2))).size).toBe(3);
  });

  it('et le mode figé l\'emporte réellement sur celui du foyer', () => {
    // Le cœur du contrôle : mêmes charges, même mode global, deux modes figés
    // différents — deux chiffres différents.
    const enProrata = totalAffiche({ modeDuMois: 'prorata', modeGlobal: '50-50' });
    const enMoitie = totalAffiche({ modeDuMois: '50-50', modeGlobal: '50-50' });

    expect(enProrata).not.toBeCloseTo(enMoitie, 2);
  });
});
