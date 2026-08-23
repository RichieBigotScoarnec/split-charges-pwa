import { describe, it, expect } from 'vitest';
import {
  periodePrecedente,
  categoriesFrequentes,
  ligneFrequentesUtile
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

describe('La ligne ne s\'affiche que si elle sert', () => {
  const TROIS = CATEGORIES.slice(0, 3);

  it('s\'affiche sur une longue liste avec des habitudes établies', () => {
    const frequentes = CATEGORIES.slice(0, 3);

    expect(ligneFrequentesUtile(frequentes, CATEGORIES)).toBe(true);
  });

  it('se tait sur une liste courte : la grille entière tient déjà sous le pouce', () => {
    expect(ligneFrequentesUtile(TROIS.slice(0, 2), TROIS)).toBe(false);
  });

  it('se tait faute d\'historique', () => {
    expect(ligneFrequentesUtile([], CATEGORIES)).toBe(false);
    expect(ligneFrequentesUtile(CATEGORIES.slice(0, 1), CATEGORIES)).toBe(false);
  });

  it('se tait si elle ne ferait que répéter la grille', () => {
    expect(ligneFrequentesUtile(CATEGORIES, CATEGORIES)).toBe(false);
  });

  it('ne lève sur aucune entrée aberrante', () => {
    expect(ligneFrequentesUtile(null, CATEGORIES)).toBe(false);
    expect(ligneFrequentesUtile(CATEGORIES, null)).toBe(false);
  });
});
