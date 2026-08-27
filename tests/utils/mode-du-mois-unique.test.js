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
import { computeBalanceChain, resolveShareMode } from '../../public/js/utils/calculations.js';

/**
 * Un mois se calcule sous UN seul mode de partage — écran et report compris
 *
 * `reconduction.js` fige le mode d'un mois neuf dans `periods/{mois}/shareMode`,
 * dans la même écriture atomique que ses charges. L'intention est claire et
 * documentée : changer le mode global pour l'avenir ne doit pas réécrire un
 * mois déjà soldé.
 *
 * `computeBalanceChain` respectait cette intention depuis toujours.
 * `summary.js` — l'écran — ne l'a jamais lue : il calculait avec le seul mode
 * global. Sur un mois reconduit au prorata puis un passage du foyer au 50-50,
 * les deux annonçaient donc deux soldes différents pour le même mois, et aucun
 * écran ne les montre côte à côte.
 *
 * C'est le jumeau du défaut `normalizePair` (mesuré à l'époque : écran 400 €,
 * report 500 €, cumulés chaque mois). Le remède est le même : une seule
 * fabrique, `resolveShareMode`, appelée des deux côtés.
 *
 * Le contrôle porte donc sur la PROPRIÉTÉ, pas sur l'implémentation :
 *
 *     solde affiché pour le mois M  ===  chaîne.get(M).own
 *
 * quelle que soit la façon dont chacun s'y prend.
 */

/** Salaires volontairement inégaux : c'est ce qui sépare prorata et 50-50 */
const SALAIRES = { vous: 3000, conjointe: 1000 };

/** Un mois où vous avancez 1 000 € seul */
const MOIS = {
  salaries: SALAIRES,
  variableCharges: {
    cle: { amount: 1000, paidBy: 'vous', description: 'Courses', deleted: false }
  }
};

/** Ce que l'écran calcule, l'état monté comme `loadPeriodData` le monte */
function soldeAffiche({ modeDuMois, modeGlobal }) {
  resetState();
  setState('salaries', SALAIRES);
  setState('variableCharges', Object.values(MOIS.variableCharges));
  setState('fixedCharges', []);
  setState('reimbursements', []);
  setState('shareMode', modeGlobal);
  setState('shareModeDuMois', modeDuMois);
  return calculateSummary().balance;
}

/** Ce que la chaîne de report calcule pour ce même mois */
function soldeDeLaChaine({ modeDuMois, modeGlobal }) {
  const periods = { '2026-06': modeDuMois ? { ...MOIS, shareMode: modeDuMois } : MOIS };
  return computeBalanceChain(periods, {
    shareMode: modeGlobal,
    customPercents: { vous: 50, conjointe: 50 },
    globalSalaries: SALAIRES
  }).get('2026-06').own;
}

beforeEach(() => resetState());

describe('resolveShareMode — la fabrique unique', () => {
  it('le mode figé du mois l\'emporte sur le réglage du foyer', () => {
    expect(resolveShareMode('prorata', '50-50')).toBe('prorata');
  });

  it('sans mode figé, le réglage du foyer s\'applique', () => {
    expect(resolveShareMode(null, '50-50')).toBe('50-50');
    expect(resolveShareMode(undefined, '50-50')).toBe('50-50');
  });

  it('sans rien du tout, le prorata — le défaut historique', () => {
    expect(resolveShareMode(null, null)).toBe('prorata');
  });

  it('une chaîne vide ne fige rien : elle se lit comme une absence', () => {
    // Firebase accepte la chaîne vide là où les règles bornent un format.
    // La traiter comme un mode figerait un mois sous un mode inexistant.
    expect(resolveShareMode('', '50-50')).toBe('50-50');
  });
});

describe('L\'écran et la chaîne de report donnent le même solde', () => {
  // Le cas qui cassait : mois figé au prorata, foyer passé au 50-50.
  //
  // Prorata sur 3 000/1 000 : votre part vaut 750 € sur 1 000 avancés,
  // donc elle vous doit 250 €. En 50-50 elle vous devrait 500 €.
  // L'écart entre les deux lectures était donc de 250 € sur ce seul mois.
  it('mois figé au prorata, foyer passé au 50-50', () => {
    const cas = { modeDuMois: 'prorata', modeGlobal: '50-50' };
    expect(soldeAffiche(cas)).toBeCloseTo(soldeDeLaChaine(cas), 6);
  });

  it('et le chiffre est bien celui du mode figé, pas celui du foyer', () => {
    // Sans quoi le test précédent passerait aussi si les deux côtés se
    // trompaient de la même façon.
    expect(soldeAffiche({ modeDuMois: 'prorata', modeGlobal: '50-50' })).toBeCloseTo(250, 6);
    expect(soldeAffiche({ modeDuMois: null, modeGlobal: '50-50' })).toBeCloseTo(500, 6);
  });

  it('mois figé au 50-50, foyer resté au prorata — le sens inverse', () => {
    const cas = { modeDuMois: '50-50', modeGlobal: 'prorata' };
    expect(soldeAffiche(cas)).toBeCloseTo(soldeDeLaChaine(cas), 6);
    expect(soldeAffiche(cas)).toBeCloseTo(500, 6);
  });

  it('mois sans mode figé : les deux suivent le foyer', () => {
    for (const modeGlobal of ['prorata', '50-50']) {
      const cas = { modeDuMois: null, modeGlobal };
      expect(soldeAffiche(cas)).toBeCloseTo(soldeDeLaChaine(cas), 6);
    }
  });

  it('l\'égalité tient sur les quatre combinaisons', () => {
    for (const modeDuMois of [null, 'prorata', '50-50']) {
      for (const modeGlobal of ['prorata', '50-50']) {
        const cas = { modeDuMois, modeGlobal };
        expect(soldeAffiche(cas), `figé=${modeDuMois} global=${modeGlobal}`)
          .toBeCloseTo(soldeDeLaChaine(cas), 6);
      }
    }
  });
});

describe('Témoin négatif — le contrôle sait échouer', () => {
  it('un écran qui ignorerait le mode figé serait pris', () => {
    // Reproduit le défaut : l'écran calcule avec le seul mode global.
    const ecranFautif = calculateSummaireAvecModeGlobalSeul();
    const chaine = soldeDeLaChaine({ modeDuMois: 'prorata', modeGlobal: '50-50' });

    // Sans cet écart, les tests ci-dessus ne prouveraient rien : ils
    // passeraient sur un jeu de données où les deux modes coïncident.
    expect(ecranFautif).not.toBeCloseTo(chaine, 6);
    expect(Math.abs(ecranFautif - chaine)).toBeCloseTo(250, 6);
  });

  /** L'ancien `summary.js` : `getState('shareMode')`, sans le mode du mois */
  function calculateSummaireAvecModeGlobalSeul() {
    resetState();
    setState('salaries', SALAIRES);
    setState('variableCharges', Object.values(MOIS.variableCharges));
    setState('shareMode', '50-50');
    setState('shareModeDuMois', 'prorata');
    // On neutralise la correction en effaçant le mode du mois de l'état :
    // c'est exactement ce que voyait l'ancien code.
    setState('shareModeDuMois', null);
    return calculateSummary().balance;
  }
});
