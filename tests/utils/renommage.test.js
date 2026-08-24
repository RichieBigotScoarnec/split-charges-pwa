import { describe, it, expect } from 'vitest';
import { planRenommage, libelleAcceptable } from '../../public/js/utils/renommage.js';

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
