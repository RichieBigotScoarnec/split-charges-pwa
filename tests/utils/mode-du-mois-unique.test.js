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
import { computeBalanceChain, resolveShareMode, resolvePercents } from '../../public/js/utils/calculations.js';

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

/**
 * Ce que l'écran calcule, l'état monté comme `loadPeriodData` le monte
 *
 * Les PARTS du mois s'y montent aussi. Elles manquaient, et c'est ce qui a
 * laissé un trou : figer le mode sans ses paramètres ne protège rien sur
 * « custom », le seul mode qui en porte — et l'écran était le seul des deux
 * côtés à n'avoir aucun témoin.
 */
function soldeAffiche({ modeDuMois, modeGlobal, partsDuMois, partsGlobales, mois = MOIS }) {
  resetState();
  setState('salaries', mois.salaries || SALAIRES);
  setState('variableCharges', Object.values(mois.variableCharges || {}));
  setState('fixedCharges', Object.values(mois.fixedCharges || {}));
  setState('reimbursements', Object.values(mois.reimbursements || {}));
  setState('shareMode', modeGlobal);
  setState('shareModeDuMois', modeDuMois);
  if (partsGlobales) setState('customPercents', partsGlobales);
  if (partsDuMois) setState('customPercentsDuMois', partsDuMois);
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

describe('resolvePercents — figer le mode ne suffisait pas', () => {
  it('les pourcentages du mois l\'emportent sur ceux du foyer', () => {
    expect(resolvePercents({ vous: 70, conjointe: 30 }, { vous: 60, conjointe: 40 }))
      .toEqual({ vous: 70, conjointe: 30 });
  });

  it('sans pourcentages figés, ceux du foyer s\'appliquent', () => {
    expect(resolvePercents(null, { vous: 60, conjointe: 40 })).toEqual({ vous: 60, conjointe: 40 });
  });

  it('une paire à moitié lisible n\'est pas un instantané', () => {
    // La leçon de `salaries.js` : une clé absente y mettait l'autre à zéro.
    expect(resolvePercents({ vous: 70 }, { vous: 60, conjointe: 40 })).toEqual({ vous: 60, conjointe: 40 });
  });
});

describe('Un mois « custom » figé ne bouge plus quand le foyer change ses parts', () => {
  /** Juillet soldé : loyer 1 000 € avancé par vous, 700 € de part, 300 € remboursés */
  const JUILLET = {
    salaries: { vous: 2000, conjointe: 2000 },
    shareMode: 'custom',
    fixedCharges: { l: { amount: 1000, paidBy: 'vous', description: 'Loyer', deleted: false } },
    reimbursements: { r: { amount: 300, direction: 'conjointe-to-vous', deleted: false } }
  };

  const chaine = (periods, parts) => computeBalanceChain(periods, {
    shareMode: 'custom',
    customPercents: parts,
    globalSalaries: { vous: 2000, conjointe: 2000 }
  }).get('2026-07');

  it('nominal : en 70/30, juillet est soldé', () => {
    expect(chaine({ '2026-07': JUILLET }, { vous: 70, conjointe: 30 }).total).toBeCloseTo(0, 6);
  });

  it('avec ses parts figées, passer le foyer à 60/40 ne le rouvre pas', () => {
    const fige = { '2026-07': { ...JUILLET, customPercents: { vous: 70, conjointe: 30 } } };
    expect(chaine(fige, { vous: 60, conjointe: 40 }).total).toBeCloseTo(0, 6);
  });

  it('TÉMOIN NÉGATIF : sans parts figées, 100 € de dette ressuscitent', () => {
    // C'est l'état des mois déjà en base, écrits avant cette correction : elle
    // protège les mois à venir, elle ne réécrit pas le passé.
    expect(chaine({ '2026-07': JUILLET }, { vous: 60, conjointe: 40 }).total).toBeCloseTo(100, 6);
  });

  /**
   * L'ÉCRAN AUSSI, et c'est la moitié qui manquait.
   *
   * `resolvePercents` est appelée des deux côtés — `calculations.js` pour la
   * chaîne, `summary.js` pour l'écran — mais un seul appel avait un témoin.
   * Mutant vérifié : remplacer l'appel de `summary.js:47` par le seul réglage
   * du foyer laissait les 2 319 tests verts, et faisait annoncer 100,00 € à
   * l'écran quand la chaîne annonçait 0,00 € pour le même mois. Une dette
   * ressuscitée, puis reportée de mois en mois.
   *
   * La propriété est la même que pour le mode : quel que soit le chemin, un
   * mois se lit sous UN seul jeu de parts.
   */
  const ecran = (partsDuMois, partsGlobales) => soldeAffiche({
    modeDuMois: 'custom', modeGlobal: 'custom',
    partsDuMois, partsGlobales, mois: JUILLET
  });

  it('L\'ÉCRAN : avec ses parts figées, juillet reste soldé', () => {
    expect(ecran({ vous: 70, conjointe: 30 }, { vous: 60, conjointe: 40 })).toBeCloseTo(0, 6);
  });

  it('L\'ÉCRAN et la chaîne annoncent le même solde, parts figées comprises', () => {
    const fige = { '2026-07': { ...JUILLET, customPercents: { vous: 70, conjointe: 30 } } };

    expect(ecran({ vous: 70, conjointe: 30 }, { vous: 60, conjointe: 40 }))
      .toBeCloseTo(chaine(fige, { vous: 60, conjointe: 40 }).total, 6);
  });

  it('TÉMOIN NÉGATIF : sans parts figées, l\'écran ressuscite les mêmes 100 €', () => {
    // Le témoin qui donne son sens au contrôle ci-dessus : si l'écran ne lisait
    // pas les parts du mois, il rendrait CE chiffre-là.
    expect(ecran(null, { vous: 60, conjointe: 40 })).toBeCloseTo(100, 6);
  });

  it('et les deux côtés se trompent alors ensemble, ce qui est le seul cas sain', () => {
    expect(ecran(null, { vous: 60, conjointe: 40 }))
      .toBeCloseTo(chaine({ '2026-07': JUILLET }, { vous: 60, conjointe: 40 }).total, 6);
  });

  it('et la dette ressuscitée se reporte sur les mois suivants', () => {
    const deuxMois = { '2026-07': JUILLET, '2026-08': { salaries: { vous: 2000, conjointe: 2000 } } };
    const aout = computeBalanceChain(deuxMois, {
      shareMode: 'custom', customPercents: { vous: 60, conjointe: 40 },
      globalSalaries: { vous: 2000, conjointe: 2000 }
    }).get('2026-08');
    expect(aout.carry).toBeCloseTo(100, 6);
  });
});
