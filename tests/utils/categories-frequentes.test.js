import { describe, it, expect } from 'vitest';
import {
  periodePrecedente,
  categoriesFrequentes,
  categoriesAMontrer,
  TUILES_VISIBLES
} from '../../public/js/utils/categories-frequentes.js';

const CATEGORIES = [
  { id: 'courses', icon: '🛒', label: 'Courses' },
  { id: 'maison', icon: '🏠', label: 'Maison' },
  { id: 'essence', icon: '🚗', label: 'Essence' },
  { id: 'restaurant', icon: '🍕', label: 'Restaurant' },
  { id: 'sante', icon: '💊', label: 'Santé' },
  { id: 'loisirs', icon: '🎮', label: 'Loisirs' },
  { id: 'transport', icon: '🚌', label: 'Transport' },
  { id: 'autre', icon: '⚡', label: 'Autre' },
  { id: 'bar', icon: '🍺', label: 'Bar' }
];

describe('Le mois précédent', () => {
  it('recule d\'un mois', () => {
    expect(periodePrecedente('2026-08')).toBe('2026-07');
  });

  it('passe l\'année sans se tromper', () => {
    // Le cas qu'un décrément naïf rate.
    expect(periodePrecedente('2026-01')).toBe('2025-12');
  });

  it('conserve le format à deux chiffres', () => {
    expect(periodePrecedente('2026-10')).toBe('2026-09');
    expect(periodePrecedente('2026-11')).toBe('2026-10');
  });

  it('refuse ce qui n\'est pas une période', () => {
    expect(periodePrecedente('2026')).toBeNull();
    expect(periodePrecedente('')).toBeNull();
    expect(periodePrecedente(null)).toBeNull();
    expect(periodePrecedente(undefined)).toBeNull();
    expect(periodePrecedente('2026-13')).toBeNull();
  });
});

describe('Compter ce qui est réellement employé', () => {
  const CHARGES = [
    { category: 'Courses', amount: 40 },
    { category: 'Courses', amount: 55 },
    { category: 'Courses', amount: 12 },
    { category: 'Restaurant', amount: 30 },
    { category: 'Restaurant', amount: 24 },
    { category: 'Essence', amount: 60 },
    { category: 'Santé', amount: 18, deleted: true }
  ];

  it('classe de la plus employée à la moins', () => {
    const frequentes = categoriesFrequentes(CHARGES, CATEGORIES);

    expect(frequentes.map(c => c.label)).toEqual(['Courses', 'Restaurant', 'Essence']);
  });

  it('ignore la corbeille : elle n\'apprend rien sur les habitudes', () => {
    const frequentes = categoriesFrequentes(CHARGES, CATEGORIES);

    expect(frequentes.map(c => c.label)).not.toContain('Santé');
  });

  it('compte le libellé, que les deux formulaires écrivent', () => {
    // Le formulaire complet n'écrit pas `categoryId` — seule la saisie rapide
    // le faisait. Compter dessus ignorerait la moitié des charges du foyer.
    const parLeFormulaireComplet = [{ category: 'Maison', amount: 90 }];

    expect(categoriesFrequentes(parLeFormulaireComplet, CATEGORIES)[0].label).toBe('Maison');
  });

  it('se limite au maximum demandé', () => {
    const beaucoup = CATEGORIES.map(c => ({ category: c.label, amount: 10 }));

    expect(categoriesFrequentes(beaucoup, CATEGORIES, { maximum: 3 })).toHaveLength(3);
  });

  it('départage les ex æquo par l\'ordre du foyer, pour que rien ne bouge', () => {
    // Deux catégories à égalité qui changeraient de place d'une ouverture à
    // l'autre rendraient la ligne plus lente qu'une grille fixe.
    const egalite = [
      { category: 'Restaurant', amount: 10 },
      { category: 'Courses', amount: 10 }
    ];

    expect(categoriesFrequentes(egalite, CATEGORIES).map(c => c.label))
      .toEqual(['Courses', 'Restaurant']);
  });

  it('écarte une catégorie supprimée du foyer mais encore portée par une charge', () => {
    const orpheline = [{ category: 'Catégorie disparue', amount: 10 }];

    expect(categoriesFrequentes(orpheline, CATEGORIES)).toEqual([]);
  });

  it('ne lève sur aucune entrée aberrante', () => {
    expect(categoriesFrequentes(null, CATEGORIES)).toEqual([]);
    expect(categoriesFrequentes([], CATEGORIES)).toEqual([]);
    expect(categoriesFrequentes([null, undefined, 42], CATEGORIES)).toEqual([]);
    expect(categoriesFrequentes([{ category: '  ' }], CATEGORIES)).toEqual([]);
    expect(categoriesFrequentes(CHARGES, null)).toEqual([]);
  });
});

/**
 * Ce que la grille montre, et ce qu'elle garde en réserve
 *
 * La liste du foyer est passée à dix-neuf catégories pour suivre la table des
 * lieux OpenStreetMap. Les montrer toutes rendrait la saisie rapide plus lente
 * qu'un formulaire complet : la grille s'en tient aux plus employées, et une
 * dernière tuile déplie le reste.
 */
describe('Les catégories que la grille montre', () => {
  const ids = liste => liste.map(categorie => categorie.id);

  /** Autant de charges d'une catégorie qu'annoncé */
  const charges = paires => paires.flatMap(([category, nombre]) =>
    Array.from({ length: nombre }, () => ({ category }))
  );

  it('montre tout, sans réserve, quand la liste tient dans la grille', () => {
    const courte = CATEGORIES.slice(0, 4);

    const { visibles, reste } = categoriesAMontrer(courte, []);

    expect(visibles).toEqual(courte);
    expect(reste).toBe(0);
  });

  it('n\'en montre pas plus que la grille n\'en porte', () => {
    const { visibles, reste } = categoriesAMontrer(CATEGORIES, []);

    expect(visibles).toHaveLength(TUILES_VISIBLES);
    expect(reste).toBe(CATEGORIES.length - TUILES_VISIBLES);
  });

  it('met en tête ce que le foyer emploie, pas ce que la liste déclare', () => {
    // « Bar » ferme la liste du foyer et ne serait jamais visible ; c'est
    // pourtant la catégorie la plus employée ici.
    const { visibles } = categoriesAMontrer(CATEGORIES, charges([
      ['Bar', 5], ['Santé', 3]
    ]));

    expect(ids(visibles).slice(0, 2)).toEqual(['bar', 'sante']);
  });

  it('complète avec l\'ordre du foyer quand les habitudes ne suffisent pas', () => {
    // Deux catégories employées, six tuiles à remplir : les quatre suivantes
    // viennent de `config.js`, qui place les plus courantes en tête.
    const { visibles } = categoriesAMontrer(CATEGORIES, charges([
      ['Bar', 5], ['Santé', 3]
    ]));

    expect(ids(visibles)).toEqual(['bar', 'sante', 'courses', 'maison', 'essence', 'restaurant']);
  });

  it('suit l\'ordre du foyer tant qu\'aucune habitude n\'est connue', () => {
    // Un foyer neuf, ou le premier du mois : rien à compter, et il faut
    // pourtant proposer six tuiles.
    const { visibles } = categoriesAMontrer(CATEGORIES, []);

    expect(visibles).toEqual(CATEGORIES.slice(0, TUILES_VISIBLES));
  });

  it('montre la catégorie épinglée, si rare soit-elle', () => {
    // Celle que le GPS vient de deviner, ou celle déjà choisie. Une grille qui
    // ne montre pas le choix en cours donne à croire qu'il a été perdu.
    const { visibles, reste } = categoriesAMontrer(CATEGORIES, [], {
      epinglee: { id: 'bar' }
    });

    expect(ids(visibles)).toContain('bar');
    expect(visibles).toHaveLength(TUILES_VISIBLES);
    expect(reste).toBe(CATEGORIES.length - TUILES_VISIBLES);
  });

  it('épingle à la place de la dernière, celle qui manquera le moins', () => {
    const { visibles } = categoriesAMontrer(CATEGORIES, [], {
      epinglee: { id: 'bar' }
    });

    expect(ids(visibles)).toEqual(['courses', 'maison', 'essence', 'restaurant', 'sante', 'bar']);
  });

  it('ne déplace rien si l\'épinglée est déjà montrée', () => {
    const sansEpingle = categoriesAMontrer(CATEGORIES, []);
    const avec = categoriesAMontrer(CATEGORIES, [], { epinglee: { id: 'courses' } });

    expect(avec.visibles).toEqual(sansEpingle.visibles);
  });

  it('ignore une épinglée que le foyer ne possède pas', () => {
    // Une catégorie supprimée depuis la saisie, ou devinée par le GPS avant que
    // la liste ne soit lue. La grille ne doit pas perdre une tuile pour elle.
    const { visibles } = categoriesAMontrer(CATEGORIES, [], {
      epinglee: { id: 'inconnue' }
    });

    expect(visibles).toEqual(CATEGORIES.slice(0, TUILES_VISIBLES));
  });

  it('ne lève sur aucune entrée aberrante', () => {
    expect(categoriesAMontrer(null, null)).toEqual({ visibles: [], reste: 0 });
    expect(categoriesAMontrer(undefined, undefined)).toEqual({ visibles: [], reste: 0 });
    expect(categoriesAMontrer([null, undefined], []).visibles).toEqual([]);
    expect(categoriesAMontrer(CATEGORIES, 'des charges').visibles).toHaveLength(TUILES_VISIBLES);
  });
});
