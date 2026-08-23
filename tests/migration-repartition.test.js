import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  attendSonCorrectif,
  planifier,
  montantsParPeriode,
  verifier
} from '../tools/migration-repartition.mjs';
import { computeSummary } from '../public/js/utils/calculations.js';

/**
 * Une migration qui touche à des comptes doit d'abord prouver ce qu'elle ne
 * touche pas.
 *
 * Le défaut réparé : la saisie rapide écrivait `splitMode: '50-50'`, que
 * personne ne lit — le calcul du solde n'interroge que `splitOverride`. Les
 * charges concernées sont donc restées réparties selon le mode du foyer.
 */

describe('Reconnaître une charge à migrer', () => {
  it('« 50-50 » sans dérogation : à migrer', () => {
    expect(attendSonCorrectif({ splitMode: '50-50' })).toBe(true);
    expect(attendSonCorrectif({ splitMode: '50-50', splitOverride: null })).toBe(true);
  });

  it('« 50-50 » avec une dérogation déjà posée : on n\'y touche pas', () => {
    // C'est le cas qui compte. Une charge saisie ou corrigée depuis un
    // formulaire complet peut porter un 70/30 : la réécrire en 50/50
    // abîmerait exactement ce qu'on prétend réparer.
    expect(attendSonCorrectif({
      splitMode: '50-50',
      splitOverride: { mode: 'custom', vous: 70, conjointe: 30 }
    })).toBe(false);
  });

  it('« prorata » : rien à faire, l\'absence de dérogation est déjà correcte', () => {
    expect(attendSonCorrectif({ splitMode: 'prorata' })).toBe(false);
  });

  it('une charge sans `splitMode` — la forme d\'aujourd\'hui — est laissée', () => {
    expect(attendSonCorrectif({ splitOverride: { mode: '50-50' } })).toBe(false);
    expect(attendSonCorrectif({ amount: 12 })).toBe(false);
  });

  it('ne lève sur aucune entrée aberrante', () => {
    expect(attendSonCorrectif(null)).toBe(false);
    expect(attendSonCorrectif(undefined)).toBe(false);
    expect(attendSonCorrectif('50-50')).toBe(false);
    expect(attendSonCorrectif([])).toBe(false);
  });
});

/** Un foyer plausible : deux périodes, les quatre cas de figure */
const VIDAGE = {
  periods: {
    '2026-07': {
      variableCharges: {
        a1: { description: 'Restaurant', amount: 48, splitMode: '50-50' },
        a2: { description: 'Courses', amount: 120, splitMode: 'prorata' },
        a3: {
          description: 'Cadeau',
          amount: 200,
          splitMode: '50-50',
          splitOverride: { mode: 'custom', vous: 70, conjointe: 30 }
        }
      }
    },
    '2026-08': {
      variableCharges: {
        b1: { description: 'Essence', amount: 62.4, splitMode: '50-50' },
        b2: { description: 'Erreur', amount: 30, splitMode: '50-50', deleted: true },
        b3: { description: 'Pain', amount: 3.2, splitOverride: { mode: '50-50' } }
      },
      fixedCharges: {
        c1: { description: 'Internet', amount: 39.99, splitOverride: { mode: '50-50' } }
      }
    }
  },
  salaries: { vous: 2400, conjointe: 1600 }
};

describe('Construire le correctif', () => {
  const { correctif, concernees, ignorees } = planifier(VIDAGE);

  it('ne retient que les charges réellement concernées', () => {
    expect(Object.keys(correctif).sort()).toEqual([
      'periods/2026-07/variableCharges/a1/splitOverride',
      'periods/2026-08/variableCharges/b1/splitOverride',
      'periods/2026-08/variableCharges/b2/splitOverride'
    ]);
  });

  it('n\'écrit que la dérogation, jamais la charge entière', () => {
    // Une écriture de la charge complète recopierait des champs lus ailleurs,
    // et perdrait ceux que ce script ne connaît pas.
    for (const [chemin, valeur] of Object.entries(correctif)) {
      expect(chemin.endsWith('/splitOverride'), chemin).toBe(true);
      expect(valeur).toEqual({ mode: '50-50' });
    }
  });

  it('épargne la répartition personnalisée, et le dit', () => {
    expect(ignorees).toHaveLength(1);
    expect(ignorees[0].id).toBe('a3');
    expect(ignorees[0].motif).toMatch(/déjà/);
  });

  it('migre aussi une charge à la corbeille, en la signalant', () => {
    // Elle ne compte dans aucun bilan aujourd'hui, mais compterait si elle
    // était restaurée : autant qu'elle soit juste dès maintenant.
    const corbeille = concernees.find(c => c.id === 'b2');
    expect(corbeille.supprimee).toBe(true);
  });

  it('ne touche pas aux charges fixes, qui n\'ont jamais eu le défaut', () => {
    expect(Object.keys(correctif).some(c => c.includes('fixedCharges'))).toBe(false);
  });

  it('un vidage sans périodes ne produit aucune écriture', () => {
    expect(planifier({}).correctif).toEqual({});
    expect(planifier({ periods: {} }).correctif).toEqual({});
    expect(planifier(null).correctif).toEqual({});
  });
});

describe('Annoncer ce qui est en jeu', () => {
  it('totalise par période les montants dont la répartition change', () => {
    const { concernees } = planifier(VIDAGE);

    expect(montantsParPeriode(concernees)).toEqual({
      '2026-07': 48,
      '2026-08': 62.4
    });
  });

  it('exclut la corbeille du total : elle ne pèse dans aucun bilan', () => {
    const { concernees } = planifier(VIDAGE);

    // 62,40 seul, et non 92,40 : la charge supprimée n'est pas comptée.
    expect(montantsParPeriode(concernees)['2026-08']).toBe(62.4);
  });
});

describe('Le workflow qui l\'exécute', () => {
  const source = readFileSync(
    resolve(process.cwd(), '.github/workflows/migration-repartition.yml'),
    'utf8'
  );

  it('ne se déclenche qu\'à la main', () => {
    // Une migration de comptes qui part sur minuterie est une migration qui
    // part un jour où personne ne regarde.
    expect(source).toContain('workflow_dispatch');
    expect(source).not.toContain('schedule:');
  });

  it('simule par défaut : appliquer est un choix explicite', () => {
    const bloc = source.slice(source.indexOf('appliquer:'), source.indexOf('jobs:'));
    expect(bloc).toMatch(/default:\s*'?false'?/);
  });

  it('sauvegarde avant d\'écrire, et l\'archive avant l\'application', () => {
    const sauvegarde = source.indexOf('Déposer la sauvegarde');
    const application = source.indexOf('Appliquer le correctif');

    expect(sauvegarde, 'étape de sauvegarde absente').toBeGreaterThan(-1);
    expect(application, 'étape d\'application absente').toBeGreaterThan(-1);
    expect(sauvegarde, 'la sauvegarde doit précéder l\'écriture').toBeLessThan(application);
  });

  it('l\'écriture est conditionnée, jamais inconditionnelle', () => {
    const etape = source.slice(source.indexOf('Appliquer le correctif'));
    expect(etape.slice(0, etape.indexOf('run:'))).toContain('if:');
  });
});

describe('L\'effet réel sur le solde, mesuré par le code du bilan', () => {
  /**
   * Le reste de ce fichier vérifie la forme du correctif. Ceci vérifie sa
   * conséquence : une migration de comptes doit prouver ce qu'elle déplace,
   * avec le code qui calcule vraiment, et non avec une arithmétique refaite
   * pour l'occasion — qui pourrait se tromper de la même façon.
   */
  const salaries = { vous: 2400, conjointe: 1600 };   // prorata 60 / 40

  /** Une charge saisie en « 50-50 » depuis l'écran express, avant correctif */
  const avant = { description: 'Brioche Dorée', amount: 14.6, paidBy: 'vous', splitMode: '50-50' };

  /** La même, après application du correctif */
  const apres = { ...avant, splitOverride: { mode: '50-50' } };

  /**
   * @param {Object} charge
   * @returns {number} Solde du mois
   */
  function solde(charge) {
    return computeSummary({
      salaries,
      fixedCharges: [],
      variableCharges: [charge],
      reimbursements: [],
      shareMode: 'prorata',
      customPercents: { vous: 50, conjointe: 50 }
    }).balance;
  }

  it('avant, le « 50-50 » demandé est ignoré : la charge part au prorata', () => {
    // 14,60 avancés, 60 % à votre charge → 8,76. Elle vous doit 5,84.
    expect(solde(avant)).toBeCloseTo(5.84, 2);
  });

  it('après, la charge est bien partagée en deux', () => {
    // 14,60 avancés, la moitié à votre charge → 7,30.
    expect(solde(apres)).toBeCloseTo(7.30, 2);
  });

  it('l\'écart est exactement ce que la répartition non appliquée coûtait', () => {
    // 1,46 € sur cette seule charge — soit 10 % de son montant, l'écart entre
    // 60/40 et 50/50. C'est le montant dont le bilan était faux.
    expect(solde(apres) - solde(avant)).toBeCloseTo(1.46, 2);
  });

  it('une charge « prorata » ne bouge pas : elle n\'est pas migrée', () => {
    const prorata = { description: 'Courses', amount: 87.3, paidBy: 'vous', splitMode: 'prorata' };

    expect(attendSonCorrectif(prorata)).toBe(false);
    expect(solde(prorata)).toBeCloseTo(87.3 * 0.4, 2);
  });
});

describe('Le contrôle après écriture', () => {
  /**
   * L'écriture repose sur une hypothèse : que Realtime Database interprète les
   * barres des clés du correctif comme une descente dans l'arbre. Elle est
   * fondée, mais elle ne serait exercée pour la première fois que sur les
   * vraies données. On la vérifie au lieu de s'y fier.
   */
  it('une base correctement migrée ne présente aucune anomalie', () => {
    const migre = {
      periods: {
        '2026-08': {
          variableCharges: {
            b1: { amount: 62.4, splitMode: '50-50', splitOverride: { mode: '50-50' } }
          }
        }
      }
    };

    expect(verifier(migre)).toEqual([]);
  });

  it('détecte les clés littérales, si les chemins n\'étaient pas interprétés', () => {
    const rate = {
      periods: { '2026-08': { variableCharges: { b1: { amount: 62.4, splitMode: '50-50' } } } },
      'periods/2026-08/variableCharges/b1/splitOverride': { mode: '50-50' }
    };

    expect(verifier(rate).join(' ')).toMatch(/littérale/);
  });

  it('détecte une écriture qui n\'a pas pris', () => {
    const inchange = {
      periods: { '2026-08': { variableCharges: { b1: { amount: 62.4, splitMode: '50-50' } } } }
    };

    expect(verifier(inchange).join(' ')).toMatch(/attendent encore/);
  });
});
