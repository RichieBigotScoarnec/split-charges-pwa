import { describe, it, expect } from 'vitest';
import { computeCategoryBudgets, summarizeBudgets } from '../../public/js/utils/budgets.js';

/**
 * Le budget mensuel global dit qu'on a trop dépensé, jamais en quoi. Un
 * dépassement de 200 € appelle une décision différente selon qu'il vient des
 * courses ou des loisirs.
 */

/** Raccourci pour construire des totaux au format de analyzeCategoriesData */
const depenses = (paires) => Object.fromEntries(
  Object.entries(paires).map(([nom, total]) => [nom, { category: nom, total }])
);

describe('État des catégories face à leur budget', () => {
  it('qualifie une catégorie sous son budget', () => {
    const [ligne] = computeCategoryBudgets(depenses({ Courses: 300 }), { Courses: 400 });

    expect(ligne).toMatchObject({ category: 'Courses', spent: 300, budget: 400, status: 'ok' });
    expect(ligne.percentage).toBeCloseTo(75);
    expect(ligne.remaining).toBeCloseTo(100);
  });

  it('alerte dès 80 % du budget, avant tout dépassement', () => {
    // C'est le seuil qui rend l'information utile : prévenir plutôt que
    // constater.
    const [ligne] = computeCategoryBudgets(depenses({ Courses: 320 }), { Courses: 400 });
    expect(ligne.status).toBe('warning');
  });

  it('un budget atteint au centime près n\'est pas encore dépassé', () => {
    const [ligne] = computeCategoryBudgets(depenses({ Courses: 400 }), { Courses: 400 });
    expect(ligne.status).toBe('warning');
    expect(ligne.remaining).toBeCloseTo(0);
  });

  it('signale un dépassement et son montant', () => {
    const [ligne] = computeCategoryBudgets(depenses({ Courses: 450 }), { Courses: 400 });

    expect(ligne.status).toBe('over');
    expect(ligne.remaining).toBeCloseTo(-50);
  });

  it('une dépense sans budget est montrée sans être jugée', () => {
    const [ligne] = computeCategoryBudgets(depenses({ Loisirs: 120 }), {});

    expect(ligne).toMatchObject({ status: 'unset', budget: 0, spent: 120 });
    expect(ligne.percentage).toBe(0);
  });

  it('un budget sans dépense reste affiché', () => {
    // Son montant intact est une information, pas une absence.
    const [ligne] = computeCategoryBudgets({}, { Vacances: 200 });

    expect(ligne).toMatchObject({ category: 'Vacances', spent: 0, budget: 200, status: 'ok' });
  });

  it('une catégorie sans budget ni dépense n\'encombre pas la liste', () => {
    expect(computeCategoryBudgets(depenses({ Courses: 0 }), { Courses: 0 })).toEqual([]);
  });
});

describe('Ordre d\'affichage', () => {
  it('les catégories budgétées passent devant celles qui ne le sont pas', () => {
    const lignes = computeCategoryBudgets(
      depenses({ Loisirs: 900, Courses: 100 }),
      { Courses: 400 }
    );

    expect(lignes.map(l => l.category)).toEqual(['Courses', 'Loisirs']);
  });

  it('parmi les budgétées, les plus tendues en tête', () => {
    // C'est là qu'une décision se prend.
    const lignes = computeCategoryBudgets(
      depenses({ Courses: 100, Loisirs: 190, Transport: 150 }),
      { Courses: 400, Loisirs: 200, Transport: 300 }
    );

    expect(lignes.map(l => l.category)).toEqual(['Loisirs', 'Transport', 'Courses']);
  });

  it('parmi les non budgétées, les plus dépensières en tête', () => {
    const lignes = computeCategoryBudgets(depenses({ Petit: 20, Gros: 500, Moyen: 100 }), {});
    expect(lignes.map(l => l.category)).toEqual(['Gros', 'Moyen', 'Petit']);
  });
});

describe('Robustesse des entrées', () => {
  it('des entrées absentes donnent une liste vide', () => {
    expect(computeCategoryBudgets(null, null)).toEqual([]);
    expect(computeCategoryBudgets(undefined, undefined)).toEqual([]);
    expect(computeCategoryBudgets({}, {})).toEqual([]);
  });

  it('les valeurs aberrantes venant de la base sont ramenées à zéro', () => {
    // Rien ne garantit le type de ce que renvoie Realtime Database.
    const lignes = computeCategoryBudgets(
      { Courses: { total: 'abc' }, Loisirs: { total: 150 } },
      { Courses: -100, Loisirs: 'beaucoup' }
    );

    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ category: 'Loisirs', spent: 150, budget: 0, status: 'unset' });
  });
});

describe('Résumé d\'ensemble', () => {
  it('ne totalise que les catégories budgétées', () => {
    // Additionner les dépenses non budgétées fausserait le rapport affiché.
    const lignes = computeCategoryBudgets(
      depenses({ Courses: 300, Loisirs: 190, HorsBudget: 1000 }),
      { Courses: 400, Loisirs: 200 }
    );

    expect(summarizeBudgets(lignes)).toEqual({ budgeted: 600, spent: 490, over: 0, warning: 1 });
  });

  it('compte les dépassements et les alertes', () => {
    const lignes = computeCategoryBudgets(
      depenses({ A: 500, B: 190, C: 10 }),
      { A: 400, B: 200, C: 300 }
    );

    expect(summarizeBudgets(lignes)).toMatchObject({ over: 1, warning: 1 });
  });

  it('une liste vide donne un résumé nul', () => {
    expect(summarizeBudgets([])).toEqual({ budgeted: 0, spent: 0, over: 0, warning: 0 });
    expect(summarizeBudgets(null)).toEqual({ budgeted: 0, spent: 0, over: 0, warning: 0 });
  });
});
