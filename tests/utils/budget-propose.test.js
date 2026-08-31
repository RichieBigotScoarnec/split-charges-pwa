import { describe, it, expect } from 'vitest';
import {
  budgetsProposes,
  ordonnerCategories,
  MOIS_MINIMUM
} from '../../public/js/utils/budget-propose.js';

/**
 * Ce que l'application peut proposer plutôt que demander.
 *
 * Le défaut : dix-neuf catégories alphabétiques à champs vides, dont sept
 * seulement portaient une dépense. On demandait d'INVENTER dix-neuf nombres.
 */

/** Un mois, dans la forme du nœud `periods` */
function mois(charges) {
  return {
    variableCharges: Object.fromEntries(
      charges.map(([category, amount], i) => [`v${i}`, { category, amount, deleted: false }])
    )
  };
}

const HISTORIQUE = {
  '2026-05': mois([['Courses', 300], ['Transport', 60], ['Restaurant', 80]]),
  '2026-06': mois([['Courses', 320], ['Transport', 70]]),
  '2026-07': mois([['Courses', 310], ['Transport', 65], ['Restaurant', 120]]),
  // Le mois affiché, incomplet : il ne doit pas peser.
  '2026-08': mois([['Courses', 40]])
};

describe('budgetsProposes — ce que coûte un mois ordinaire', () => {
  it('propose la médiane de chaque catégorie', () => {
    const p = budgetsProposes(HISTORIQUE, '2026-08');
    expect(p.Courses).toBe(310);      // médiane de 300, 320, 310
    expect(p.Transport).toBe(65);     // médiane de 60, 70, 65
  });

  it('n\'inclut PAS le mois affiché, qui est incomplet', () => {
    // Le 3 du mois, « Courses » vaudrait 40 € : proposer cela comme budget
    // mensuel serait pire que ne rien proposer.
    const p = budgetsProposes(HISTORIQUE, '2026-08');
    expect(p.Courses).toBeGreaterThan(200);

    // Témoin : en se plaçant un mois plus tard, juillet entre dans l'assiette
    // et août — 40 € — aussi. La médiane tombe.
    const plusTard = budgetsProposes(HISTORIQUE, '2026-09');
    expect(plusTard.Courses).toBeLessThan(p.Courses);
  });

  it('un mois sans la catégorie compte pour zéro, pas pour absent', () => {
    // « Restaurant » n'apparaît qu'en mai et juillet : 80, 0, 120.
    // Médiane = 80. Sans le zéro de juin, elle vaudrait 100 — et une dépense
    // annuelle proposerait son montant entier comme budget MENSUEL.
    expect(budgetsProposes(HISTORIQUE, '2026-08').Restaurant).toBe(80);
  });

  it('se tait tant que l\'historique révolu est trop court', () => {
    expect(MOIS_MINIMUM).toBe(2);
    const court = { '2026-07': mois([['Courses', 300]]), '2026-08': mois([['Courses', 40]]) };
    expect(budgetsProposes(court, '2026-08')).toEqual({});
  });

  it('ne propose jamais un budget de zéro', () => {
    // « Pas de budget » et « budget de zéro » ne se disent pas de la même
    // façon à l'écran ; l'éditeur dit le premier par un champ vide.
    const zero = {
      '2026-06': mois([['Courses', 0]]),
      '2026-07': mois([['Courses', 0]]),
      '2026-08': mois([])
    };
    expect(budgetsProposes(zero, '2026-08').Courses).toBeUndefined();
  });

  it('résiste à une entrée absente ou mal formée', () => {
    for (const rien of [null, undefined, 'texte', 42, []]) {
      expect(budgetsProposes(rien, '2026-08')).toEqual({});
    }
    expect(budgetsProposes(HISTORIQUE, null)).toEqual({});
  });

  it('écarte les clés qui ne sont pas des mois', () => {
    const pollue = { ...HISTORIQUE, undefined: mois([['Courses', 9999]]), bidon: mois([]) };
    expect(budgetsProposes(pollue, '2026-08').Courses).toBe(310);
  });
});

describe('ordonnerCategories — ce qu\'on montre en premier', () => {
  const TOUTES = ['Jardin', 'Courses', 'Bar', 'Transport', 'Bricolage', 'Restaurant'];
  const DEPENSES = { Courses: 307.92, Transport: 68, Restaurant: 64.5 };
  const PROPOSES = { Courses: 310, Transport: 65, Restaurant: 80 };

  it('classe par dépense décroissante, pas par alphabet', () => {
    const { utilisees } = ordonnerCategories(TOUTES, DEPENSES, PROPOSES, {});
    expect(utilisees).toEqual(['Courses', 'Transport', 'Restaurant']);
  });

  it('range à part celles dont l\'application n\'a rien à dire', () => {
    const { dormantes } = ordonnerCategories(TOUTES, DEPENSES, PROPOSES, {});
    // « Bar », « Bricolage », « Jardin » : jamais dépensées, aucune médiane.
    expect(dormantes).toEqual(['Bar', 'Bricolage', 'Jardin']);
  });

  it('une catégorie qui porte déjà un budget reste visible, même sans dépense', () => {
    // Sinon son budget deviendrait inaccessible : on ne pourrait plus le
    // corriger ni le retirer.
    const { utilisees, dormantes } = ordonnerCategories(TOUTES, {}, {}, { Jardin: 120 });
    expect(utilisees).toContain('Jardin');
    expect(dormantes).not.toContain('Jardin');
  });

  it('une catégorie sans dépense mais avec une proposition reste visible', () => {
    const { utilisees } = ordonnerCategories(TOUTES, {}, { Bar: 30 }, {});
    expect(utilisees).toContain('Bar');
  });

  it('n\'oublie ni ne duplique aucune catégorie', () => {
    const { utilisees, dormantes } = ordonnerCategories(
      [...TOUTES, 'Courses'], DEPENSES, PROPOSES, {}
    );
    expect([...utilisees, ...dormantes].sort()).toEqual([...TOUTES].sort());
  });

  it('départage deux catégories sans dépense par l\'alphabet français', () => {
    const { dormantes } = ordonnerCategories(['Électricité', 'Eau', 'Zoo'], {}, {}, {});
    expect(dormantes).toEqual(['Eau', 'Électricité', 'Zoo']);
  });
});
