import { describe, it, expect } from 'vitest';
import {
  basculerDansLaSelection, selectionPurgee, resumeDeLaSelection, compteRenduDuLot
} from '../../public/js/utils/selection-lot.js';

/**
 * Agir sur plusieurs charges à la fois
 *
 * Quatre décisions, dont deux portent tout le sujet : purger une sélection
 * devenue caduque, et rendre compte d'un lot qui n'est pas passé en entier.
 */

const CHARGES = [
  { id: 'a', amount: 12.5, description: 'Courses' },
  { id: 'b', amount: 30, description: 'Essence' },
  { id: 'c', amount: 7.25, description: 'Pain' }
];

describe('Basculer une charge dans la sélection', () => {
  it('ajoute ce qui n\'y était pas', () => {
    expect(basculerDansLaSelection(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('retire ce qui y était', () => {
    expect(basculerDansLaSelection(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('ne modifie pas le tableau reçu', () => {
    // L'état est lu par copie ailleurs : une mutation en place s'y perdrait
    // sans bruit, et la sélection paraîtrait n'avoir pas bougé.
    const depart = ['a'];
    basculerDansLaSelection(depart, 'b');
    expect(depart).toEqual(['a']);
  });

  it('une entrée illisible laisse la sélection intacte', () => {
    expect(basculerDansLaSelection(['a'], '')).toEqual(['a']);
    expect(basculerDansLaSelection(['a'], null)).toEqual(['a']);
    expect(basculerDansLaSelection(null, 'a')).toEqual(['a']);
  });
});

describe('Purger une sélection devenue caduque', () => {
  it('écarte ce qui n\'existe plus', () => {
    // Le cas réel : on coche en août, on navigue vers septembre. Les
    // identifiants d'août n'y désignent personne.
    expect(selectionPurgee(['a', 'zz', 'c'], CHARGES)).toEqual(['a', 'c']);
  });

  it('écarte ce qui vient d\'être supprimé', () => {
    const avecSupprimee = [...CHARGES, { id: 'd', amount: 5, deleted: true }];
    expect(selectionPurgee(['a', 'd'], avecSupprimee)).toEqual(['a']);
  });

  it('garde l\'ordre de la sélection, pas celui des charges', () => {
    // C'est la sélection qu'on relit, pas la liste : l'ordre des coches est le
    // seul qui ait été choisi par quelqu'un.
    expect(selectionPurgee(['c', 'a'], CHARGES)).toEqual(['c', 'a']);
  });

  it('une liste de charges vide ne retient rien', () => {
    expect(selectionPurgee(['a', 'b'], [])).toEqual([]);
    expect(selectionPurgee(['a'], null)).toEqual([]);
  });
});

describe('Ce que la sélection représente', () => {
  it('compte les lignes et somme les montants', () => {
    expect(resumeDeLaSelection(['a', 'b'], CHARGES)).toEqual({ nombre: 2, total: 42.5 });
  });

  it('ne compte que ce qui existe encore', () => {
    // Le compte et le total sortent de la MÊME purge que le geste : sans cela,
    // la barre annoncerait « 3 sélectionnées · 49,75 € » sur un lot qui n'en
    // touchera que deux.
    expect(resumeDeLaSelection(['a', 'zz'], CHARGES)).toEqual({ nombre: 1, total: 12.5 });
  });

  it('le total est donné parce qu\'une suppression se juge sur lui', () => {
    // « 3 charges » ne dit pas si l'on efface 50 € ou 1 400 €.
    expect(resumeDeLaSelection(['a', 'b', 'c'], CHARGES).total).toBe(49.75);
  });

  it('un montant illisible vaut zéro, il n\'annule pas le total', () => {
    const bancales = [{ id: 'a', amount: 'douze' }, { id: 'b', amount: 30 }];
    expect(resumeDeLaSelection(['a', 'b'], bancales)).toEqual({ nombre: 2, total: 30 });
  });

  it('les centimes ne dérivent pas', () => {
    const flottants = [{ id: 'a', amount: 0.1 }, { id: 'b', amount: 0.2 }];
    expect(resumeDeLaSelection(['a', 'b'], flottants).total).toBe(0.3);
  });

  it('sélection vide : zéro et zéro', () => {
    expect(resumeDeLaSelection([], CHARGES)).toEqual({ nombre: 0, total: 0 });
  });
});

describe('Ce qu\'un lot a réellement fait', () => {
  it('tout est passé : le compte, et rien d\'autre', () => {
    expect(compteRenduDuLot({ faites: 6, refusees: 0, geste: 'supprimées' }))
      .toEqual({ texte: '6 charges supprimées', complet: true });
  });

  it('une seule charge accorde aussi le participe', () => {
    // « 1 charge supprimées » se lit d'autant plus que la phrase paraît au
    // moment où l'on vérifie ce qui vient d'être fait.
    expect(compteRenduDuLot({ faites: 1, refusees: 0, geste: 'supprimées' }).texte)
      .toBe('1 charge supprimée');
  });

  it('l\'accord ne touche que le participe, pas son complément', () => {
    expect(compteRenduDuLot({ faites: 1, refusees: 0, geste: 'rangées dans « Courses »' }).texte)
      .toBe('1 charge rangée dans « Courses »');
    expect(compteRenduDuLot({ faites: 1, refusees: 0, geste: 'détachées de leur enveloppe' }).texte)
      .toBe('1 charge détachée de leur enveloppe');
  });

  it('le pluriel reste intact', () => {
    expect(compteRenduDuLot({ faites: 4, refusees: 0, geste: 'rangées dans « Courses »' }).texte)
      .toBe('4 charges rangées dans « Courses »');
  });

  it('un lot partiel dit LES DEUX nombres', () => {
    // Annoncer « 6 modifiées » quand 5 le sont est le pire des deux mondes : le
    // geste paraît fait, et le chiffre qu'on ira vérifier ailleurs ne collera
    // pas.
    const rendu = compteRenduDuLot({ faites: 5, refusees: 1, geste: 'rangées' });
    expect(rendu.texte).toContain('5 charges rangées');
    expect(rendu.texte).toContain('1 refusée');
    expect(rendu.complet).toBe(false);
  });

  it('un lot entièrement refusé ne prétend rien avoir fait', () => {
    const rendu = compteRenduDuLot({ faites: 0, refusees: 3, geste: 'rangées' });
    expect(rendu.texte).toContain('Aucune charge');
    expect(rendu.texte).toContain('3 refusées');
    expect(rendu.complet).toBe(false);
  });

  it('un lot partiel n\'est jamais annoncé comme complet', () => {
    // `complet` décide du ton : vert quand tout est passé, ambre sinon. Le
    // mutant qui le laisse à `true` fait passer un échec partiel pour une
    // réussite.
    expect(compteRenduDuLot({ faites: 5, refusees: 1, geste: 'x' }).complet).toBe(false);
    expect(compteRenduDuLot({ faites: 0, refusees: 1, geste: 'x' }).complet).toBe(false);
  });

  it('rien à faire n\'est pas un échec', () => {
    expect(compteRenduDuLot({ faites: 0, refusees: 0, geste: 'x' }))
      .toEqual({ texte: 'Rien à faire', complet: true });
  });

  it('des entrées absurdes ne fabriquent pas de nombres', () => {
    expect(compteRenduDuLot({}).texte).toBe('Rien à faire');
    expect(compteRenduDuLot({ faites: -3, refusees: NaN, geste: 'x' }).texte).toBe('Rien à faire');
  });
});
