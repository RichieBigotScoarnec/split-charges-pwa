import { describe, it, expect } from 'vitest';
import { planRenommage, planBudget, libelleAcceptable } from '../../public/js/utils/renommage.js';
import { computeCategoryBudgets, summarizeBudgets } from '../../public/js/utils/budgets.js';

/**
 * Renommer sans détacher l'histoire
 *
 * Les deux boutons annonçaient « Ajouter, renommer ou retirer » ; l'écran ne
 * savait qu'ajouter et retirer. Corriger « Restaurent » imposait de supprimer
 * et recréer — ce qui laissait toutes les charges passées rattachées à un
 * libellé qui n'existait plus.
 *
 * Une charge porte le libellé de sa catégorie, pas son identifiant. Renommer la
 * seule liste reviendrait donc exactement à cette suppression-recréation : le
 * récapitulatif par catégorie, les budgets et les filtres de la carte
 * cesseraient tous de reconnaître l'ancien nom.
 */

const PERIODES = {
  '2026-08': {
    variableCharges: {
      a: { description: 'Midi', category: 'Restaurent', amount: 18 },
      b: { description: 'Plein', category: 'Essence', amount: 62 }
    },
    fixedCharges: {
      c: { description: 'Cantine', category: 'Restaurent', amount: 90 }
    }
  },
  '2025-02': {
    variableCharges: {
      d: { description: 'Brasserie', category: 'Restaurent', amount: 34, deleted: true }
    }
  },
  // Écriture accidentelle : le nœud `periods` en a hébergé.
  undefined: { variableCharges: { e: { category: 'Restaurent' } } }
};

describe('Les écritures qu\'exige un renommage', () => {
  it('touche toutes les charges portant l\'ancien libellé, tous mois confondus', () => {
    const { chemins, nombre } = planRenommage({
      periods: PERIODES, champ: 'category', ancien: 'Restaurent', nouveau: 'Restaurant'
    });

    expect(nombre).toBe(3);
    expect(chemins['periods/2026-08/variableCharges/a/category']).toBe('Restaurant');
    expect(chemins['periods/2026-08/fixedCharges/c/category']).toBe('Restaurant');
    expect(chemins['periods/2025-02/variableCharges/d/category']).toBe('Restaurant');
  });

  it('réécrit aussi les charges supprimées', () => {
    // La corbeille les affiche et permet de les restaurer : les laisser
    // derrière rendrait une charge ressuscitée avec un libellé mort.
    const { chemins } = planRenommage({
      periods: PERIODES, champ: 'category', ancien: 'Restaurent', nouveau: 'Restaurant'
    });

    expect(chemins).toHaveProperty('periods/2025-02/variableCharges/d/category');
  });

  it('laisse tranquilles les charges d\'une autre catégorie', () => {
    const { chemins } = planRenommage({
      periods: PERIODES, champ: 'category', ancien: 'Restaurent', nouveau: 'Restaurant'
    });

    expect(chemins).not.toHaveProperty('periods/2026-08/variableCharges/b/category');
  });

  it('ignore les clés de période qui n\'en sont pas', () => {
    const { chemins } = planRenommage({
      periods: PERIODES, champ: 'category', ancien: 'Restaurent', nouveau: 'Restaurant'
    });

    expect(Object.keys(chemins).some(c => c.includes('undefined'))).toBe(false);
  });

  it('sait renommer une destination', () => {
    const periodes = {
      '2026-08': { fixedCharges: { x: { destination: 'Compte joint', amount: 700 } } }
    };

    const { chemins, nombre } = planRenommage({
      periods: periodes, champ: 'destination', ancien: 'Compte joint', nouveau: 'Compte commun'
    });

    expect(nombre).toBe(1);
    expect(chemins['periods/2026-08/fixedCharges/x/destination']).toBe('Compte commun');
  });
});

describe('Ce qui ne donne lieu à aucune écriture', () => {
  const rien = params => planRenommage({
    periods: PERIODES, champ: 'category', ancien: 'Restaurent', nouveau: 'Restaurant', ...params
  });

  it('un libellé identique', () => {
    expect(rien({ nouveau: 'Restaurent' }).nombre).toBe(0);
  });

  it('un champ inconnu', () => {
    // Écrire sous un champ arbitraire créerait des données que rien ne lit.
    expect(rien({ champ: 'amount' }).nombre).toBe(0);
  });

  it('des entrées inexploitables', () => {
    expect(rien({ periods: null }).nombre).toBe(0);
    expect(rien({ ancien: '' }).nombre).toBe(0);
    expect(rien({ nouveau: '' }).nombre).toBe(0);
  });
});

describe('Le libellé proposé', () => {
  const LISTE = [{ label: 'Courses' }, { label: 'Essence' }, { label: 'Restaurant' }];

  it('accepte un nom neuf', () => {
    expect(libelleAcceptable('Santé', LISTE, 0).valide).toBe(true);
  });

  it('accepte de garder son propre nom', () => {
    // Renommer sans changer le nom — parce qu'on ne modifie que l'emoji — ne
    // doit pas se heurter à soi-même.
    expect(libelleAcceptable('Courses', LISTE, 0).valide).toBe(true);
  });

  it('refuse un nom déjà pris, à la casse près', () => {
    // « Courses » et « courses » seraient deux entrées et une seule à l'œil,
    // et les charges de l'une n'apparaîtraient pas sous l'autre.
    expect(libelleAcceptable('essence', LISTE, 0).valide).toBe(false);
    expect(libelleAcceptable('ESSENCE', LISTE, 0).erreur).toBe('Ce nom existe déjà');
  });

  it('refuse le vide et l\'excessif', () => {
    expect(libelleAcceptable('   ', LISTE, 0).erreur).toBe('Nom requis');
    expect(libelleAcceptable('x'.repeat(31), LISTE, 0).valide).toBe(false);
  });
});

/**
 * Le budget suit sa catégorie
 *
 * `category-budgets.js` indexe les budgets **par libellé** :
 * `categoryBudgets['Courses'] = 600`. La clé EST le nom. Le renommage
 * déplaçait donc toutes les charges et laissait le budget derrière, sous un
 * nom que plus rien ne portait.
 *
 * Mesuré : 600 € budgétés sur « Courses », 450 € dépensés. Après renommage en
 * « Alimentation », l'écran annonçait « 0,00 € dépensés sur 600,00 €
 * budgétés » — et les 600 € restaient orphelins, invisibles et inatteignables.
 */
describe('planBudget — le déplacement décidé', () => {
  const BUDGETS = { Courses: 600, Essence: 100 };

  it('déplace le montant, et supprime l\'ancienne clé', () => {
    const { chemins, montant } = planBudget({
      budgets: BUDGETS, ancien: 'Courses', nouveau: 'Alimentation'
    });

    expect(montant).toBe(600);
    expect(chemins).toEqual({
      'categoryBudgets/Courses': null,
      'categoryBudgets/Alimentation': 600
    });
  });

  it('ne touche jamais à l\'objet reçu', () => {
    // Il vient de `state.js` : une mutation ferait diverger l'écran de la base
    // au premier échec d'écriture.
    planBudget({ budgets: BUDGETS, ancien: 'Courses', nouveau: 'Alimentation' });

    expect(BUDGETS).toEqual({ Courses: 600, Essence: 100 });
  });

  it('ne décide rien quand il n\'y a rien à déplacer', () => {
    const rien = (params) => planBudget({ budgets: BUDGETS, ancien: 'Courses', nouveau: 'Alimentation', ...params });

    // Une catégorie sans budget : le renommage des charges suffit.
    expect(rien({ ancien: 'Santé' }).chemins).toEqual({});
    expect(rien({ budgets: null }).chemins).toEqual({});
    expect(rien({ nouveau: 'Courses' }).chemins).toEqual({});
    expect(rien({ ancien: '' }).chemins).toEqual({});
    expect(rien({ nouveau: '' }).chemins).toEqual({});
    expect(rien({ ancien: null }).montant).toBe(null);
  });

  it('un montant illisible n\'est pas recopié', () => {
    // Le propager écrirait une valeur que l'écran ne saurait pas afficher —
    // et `.validate` ne repêcherait pas une chaîne sous une clé libre.
    expect(planBudget({ budgets: { Courses: 'six cents' }, ancien: 'Courses', nouveau: 'X' }).chemins)
      .toEqual({});
    expect(planBudget({ budgets: { Courses: NaN }, ancien: 'Courses', nouveau: 'X' }).chemins)
      .toEqual({});
  });

  it('une collision ne peut viser qu\'un orphelin, et le budget vivant l\'emporte', () => {
    // `libelleAcceptable` refuse de renommer vers un libellé de la liste : si
    // `categoryBudgets[nouveau]` existe, c'est un vestige d'un renommage
    // antérieur — donc du défaut qu'on répare ici.
    const { chemins } = planBudget({
      budgets: { Courses: 600, Alimentation: 42 }, ancien: 'Courses', nouveau: 'Alimentation'
    });

    expect(chemins['categoryBudgets/Alimentation']).toBe(600);
  });
});

describe('Ce que l\'écran des budgets montre après un renommage', () => {
  /** Applique des chemins `update` à une base simulée ; `null` supprime */
  function appliquer(base, chemins) {
    const copie = structuredClone(base);
    for (const [chemin, valeur] of Object.entries(chemins)) {
      const segments = chemin.split('/');
      const feuille = segments.pop();
      let noeud = copie;
      for (const segment of segments) {
        if (!noeud[segment] || typeof noeud[segment] !== 'object') noeud[segment] = {};
        noeud = noeud[segment];
      }
      if (valeur === null) delete noeud[feuille];
      else noeud[feuille] = valeur;
    }
    return copie;
  }

  /** Les totaux par catégorie du mois affiché, comme les produit `analyzeCategoriesData` */
  function totauxDuMois(base, periode) {
    const totaux = {};
    const contenu = base.periods?.[periode] || {};
    for (const collection of ['fixedCharges', 'variableCharges']) {
      for (const charge of Object.values(contenu[collection] || {})) {
        if (!charge || charge.deleted) continue;
        const nom = charge.category;
        totaux[nom] = totaux[nom] || { total: 0 };
        totaux[nom].total += charge.amount;
      }
    }
    return totaux;
  }

  const BASE = {
    periods: {
      '2026-08': {
        variableCharges: {
          a: { description: 'Marché', amount: 200, category: 'Courses', paidBy: 'vous' },
          b: { description: 'Supérette', amount: 250, category: 'Courses', paidBy: 'conjointe' },
          c: { description: 'Plein', amount: 60, category: 'Essence', paidBy: 'vous' }
        }
      }
    },
    categoryBudgets: { Courses: 600, Essence: 100 }
  };

  const AVANT = computeCategoryBudgets(totauxDuMois(BASE, '2026-08'), BASE.categoryBudgets);

  /** Le renommage, avec ou sans le déplacement du budget */
  function renommer({ avecLeBudget }) {
    const { chemins } = planRenommage({
      periods: BASE.periods, champ: 'category', ancien: 'Courses', nouveau: 'Alimentation'
    });
    const budget = avecLeBudget
      ? planBudget({ budgets: BASE.categoryBudgets, ancien: 'Courses', nouveau: 'Alimentation' }).chemins
      : {};

    const apres = appliquer(BASE, { ...chemins, ...budget });
    return computeCategoryBudgets(totauxDuMois(apres, '2026-08'), apres.categoryBudgets);
  }

  it('TÉMOIN NÉGATIF : sans le déplacement, le budget se détachait de sa dépense', () => {
    const lignes = renommer({ avecLeBudget: false });

    // La dépense d'un côté, sans plafond…
    expect(lignes.find(l => l.category === 'Alimentation')).toMatchObject({ spent: 450, budget: 0 });
    // …et le plafond de l'autre, sur un nom que plus aucune charge ne porte.
    expect(lignes.find(l => l.category === 'Courses')).toMatchObject({ spent: 0, budget: 600 });
  });

  it('avec le déplacement, la ligne est exactement celle d\'avant, sous son nouveau nom', () => {
    const lignes = renommer({ avecLeBudget: true });

    expect(lignes.find(l => l.category === 'Courses')).toBeUndefined();

    const avant = AVANT.find(l => l.category === 'Courses');
    const apres = lignes.find(l => l.category === 'Alimentation');
    expect(apres).toMatchObject({
      spent: avant.spent, budget: avant.budget,
      percentage: avant.percentage, remaining: avant.remaining, status: avant.status
    });
  });

  it('le total budgété du foyer est inchangé : renommer ne dépense ni ne budgète', () => {
    expect(summarizeBudgets(renommer({ avecLeBudget: true })))
      .toEqual(summarizeBudgets(AVANT));
  });
});
