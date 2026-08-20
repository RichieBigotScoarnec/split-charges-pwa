// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setState, resetState } from '../../public/js/state.js';
import {
  analyzeCategoriesData,
  getCategoryStats,
  compareCategories
} from '../../public/js/modules/categories.js';

beforeEach(() => {
  resetState();
});

// ===== analyzeCategoriesData =====
describe('analyzeCategoriesData', () => {
  it('retourne un objet avec fixed, variable, total', () => {
    const result = analyzeCategoriesData();
    expect(result).toHaveProperty('fixed');
    expect(result).toHaveProperty('variable');
    expect(result).toHaveProperty('total');
  });

  it('retourne une analyse vide si aucune charge', () => {
    const result = analyzeCategoriesData();
    expect(Object.keys(result.total)).toHaveLength(0);
    expect(Object.keys(result.fixed)).toHaveLength(0);
    expect(Object.keys(result.variable)).toHaveLength(0);
  });

  it('groupe les charges fixes par catégorie', () => {
    setState('fixedCharges', [
      { id: '1', description: 'Loyer', amount: 1000, category: 'Loyer', paidBy: 'vous' },
      { id: '2', description: 'EDF', amount: 80, category: 'Énergie', paidBy: 'conjointe' }
    ]);
    const result = analyzeCategoriesData();
    expect(result.fixed).toHaveProperty('Loyer');
    expect(result.fixed).toHaveProperty('Énergie');
  });

  it('groupe les charges variables par catégorie', () => {
    setState('variableCharges', [
      { id: '1', amount: 50, category: 'Alimentation', paidBy: 'vous' },
      { id: '2', amount: 20, category: 'Transport', paidBy: 'vous' }
    ]);
    const result = analyzeCategoriesData();
    expect(result.variable).toHaveProperty('Alimentation');
    expect(result.variable).toHaveProperty('Transport');
  });

  it('calcule le total par catégorie (charges fixes)', () => {
    setState('fixedCharges', [
      { id: '1', amount: 500, category: 'Loyer', paidBy: 'vous' },
      { id: '2', amount: 300, category: 'Loyer', paidBy: 'vous' }
    ]);
    const result = analyzeCategoriesData();
    expect(result.fixed['Loyer'].total).toBe(800);
  });

  it('calcule le total par catégorie (charges variables)', () => {
    setState('variableCharges', [
      { id: '1', amount: 40, category: 'Alimentation', paidBy: 'vous' },
      { id: '2', amount: 60, category: 'Alimentation', paidBy: 'vous' }
    ]);
    const result = analyzeCategoriesData();
    expect(result.variable['Alimentation'].total).toBe(100);
  });

  it('calcule la moyenne par catégorie', () => {
    setState('fixedCharges', [
      { id: '1', amount: 100, category: 'Loyer', paidBy: 'vous' },
      { id: '2', amount: 300, category: 'Loyer', paidBy: 'vous' }
    ]);
    const result = analyzeCategoriesData();
    expect(result.fixed['Loyer'].average).toBe(200);
  });

  it('compte le nombre de charges par catégorie', () => {
    setState('variableCharges', [
      { id: '1', amount: 50, category: 'Alimentation', paidBy: 'vous' },
      { id: '2', amount: 30, category: 'Alimentation', paidBy: 'vous' },
      { id: '3', amount: 20, category: 'Transport', paidBy: 'vous' }
    ]);
    const result = analyzeCategoriesData();
    expect(result.variable['Alimentation'].count).toBe(2);
    expect(result.variable['Transport'].count).toBe(1);
  });

  it('sépare paidByYou et paidByPartner', () => {
    setState('fixedCharges', [
      { id: '1', amount: 300, category: 'Loyer', paidBy: 'vous' },
      { id: '2', amount: 200, category: 'Loyer', paidBy: 'conjointe' }
    ]);
    const result = analyzeCategoriesData();
    expect(result.fixed['Loyer'].paidByYou).toBe(300);
    expect(result.fixed['Loyer'].paidByPartner).toBe(200);
  });

  it('classe toute charge sans catégorie dans "Autre"', () => {
    setState('variableCharges', [
      { id: '1', amount: 50, paidBy: 'vous' }
    ]);
    const result = analyzeCategoriesData();
    expect(result.variable).toHaveProperty('Autre');
  });

  it('fusionne fixed + variable dans total', () => {
    setState('fixedCharges', [{ id: '1', amount: 1000, category: 'Loyer', paidBy: 'vous' }]);
    setState('variableCharges', [{ id: '2', amount: 50, category: 'Loyer', paidBy: 'vous' }]);
    const result = analyzeCategoriesData();
    expect(result.total['Loyer'].total).toBe(1050);
    expect(result.total['Loyer'].fixedTotal).toBe(1000);
    expect(result.total['Loyer'].variableTotal).toBe(50);
  });

  it('fusionne plusieurs catégories dans total', () => {
    setState('fixedCharges', [{ id: '1', amount: 1000, category: 'Loyer', paidBy: 'vous' }]);
    setState('variableCharges', [{ id: '2', amount: 50, category: 'Alimentation', paidBy: 'vous' }]);
    const result = analyzeCategoriesData();
    expect(result.total).toHaveProperty('Loyer');
    expect(result.total).toHaveProperty('Alimentation');
    expect(result.total['Loyer'].variableTotal).toBe(0);
    expect(result.total['Alimentation'].fixedTotal).toBe(0);
  });

  it('calcule le pourcentage par rapport au total de la catégorie', () => {
    setState('fixedCharges', [
      { id: '1', amount: 500, category: 'A', paidBy: 'vous' },
      { id: '2', amount: 500, category: 'B', paidBy: 'vous' }
    ]);
    const result = analyzeCategoriesData();
    expect(result.fixed['A'].percentage).toBeCloseTo(50);
    expect(result.fixed['B'].percentage).toBeCloseTo(50);
  });

  it('pourcentage 100 si une seule catégorie', () => {
    setState('fixedCharges', [{ id: '1', amount: 1000, category: 'Loyer', paidBy: 'vous' }]);
    const result = analyzeCategoriesData();
    expect(result.fixed['Loyer'].percentage).toBeCloseTo(100);
  });

  it('paidByPartner compte toutes les valeurs non-vous', () => {
    setState('variableCharges', [
      { id: '1', amount: 50, category: 'A', paidBy: 'conjointe' },
      { id: '2', amount: 30, category: 'A', paidBy: 'joint' } // joint → paidByPartner
    ]);
    const result = analyzeCategoriesData();
    // paidBy !== 'vous' → paidByPartner
    expect(result.variable['A'].paidByPartner).toBe(80);
  });
});

// ===== getCategoryStats =====
describe('getCategoryStats', () => {
  beforeEach(() => {
    setState('fixedCharges', [
      { id: '1', amount: 1000, category: 'Loyer', paidBy: 'vous' },
      { id: '2', amount: 80, category: 'Énergie', paidBy: 'conjointe' }
    ]);
    setState('variableCharges', [
      { id: '3', amount: 200, category: 'Loyer', paidBy: 'vous' }
    ]);
  });

  it('retourne les stats pour une catégorie existante', () => {
    const stats = getCategoryStats('Loyer');
    expect(stats).not.toBeNull();
  });

  it('retourne le total fusionné fixed+variable', () => {
    const stats = getCategoryStats('Loyer');
    expect(stats.total).toBe(1200); // 1000 + 200
  });

  it('retourne le count total', () => {
    const stats = getCategoryStats('Loyer');
    expect(stats.count).toBe(2); // 1 fixed + 1 variable
  });

  it('retourne null pour une catégorie inexistante', () => {
    expect(getCategoryStats('ZZZ')).toBeNull();
  });

  it('retourne null si aucune charge', () => {
    resetState();
    expect(getCategoryStats('Loyer')).toBeNull();
  });

  it('inclut fixedTotal et variableTotal', () => {
    const stats = getCategoryStats('Loyer');
    expect(stats.fixedTotal).toBe(1000);
    expect(stats.variableTotal).toBe(200);
  });

  it('retourne le pourcentage', () => {
    const stats = getCategoryStats('Loyer');
    expect(stats.percentage).toBeGreaterThan(0);
  });
});

// ===== compareCategories =====
describe('compareCategories', () => {
  beforeEach(() => {
    setState('fixedCharges', [
      { id: '1', amount: 1000, category: 'Loyer', paidBy: 'vous' },
      { id: '2', amount: 200, category: 'Énergie', paidBy: 'vous' },
      { id: '3', amount: 300, category: 'Énergie', paidBy: 'vous' }
    ]);
  });

  it('retourne null si la première catégorie n\'existe pas', () => {
    expect(compareCategories('Inexistant', 'Loyer')).toBeNull();
  });

  it('retourne null si la deuxième catégorie n\'existe pas', () => {
    expect(compareCategories('Loyer', 'Inexistant')).toBeNull();
  });

  it('retourne null si les deux n\'existent pas', () => {
    expect(compareCategories('A', 'B')).toBeNull();
  });

  it('calcule la différence de total', () => {
    const comp = compareCategories('Loyer', 'Énergie');
    expect(comp).not.toBeNull();
    expect(comp.totalDifference).toBe(500); // 1000 - 500
  });

  it('calcule la différence de count', () => {
    const comp = compareCategories('Loyer', 'Énergie');
    expect(comp.countDifference).toBe(-1); // 1 - 2
  });

  it('calcule la différence de moyenne', () => {
    // Loyer: 1000/1 = 1000, Énergie: 500/2 = 250 → diff = 750
    const comp = compareCategories('Loyer', 'Énergie');
    expect(comp.averageDifference).toBe(750);
  });

  it('inclut les noms des deux catégories', () => {
    const comp = compareCategories('Loyer', 'Énergie');
    expect(comp.categories).toContain('Loyer');
    expect(comp.categories).toContain('Énergie');
  });

  it('différence de total peut être négative', () => {
    const comp = compareCategories('Énergie', 'Loyer');
    expect(comp.totalDifference).toBe(-500); // 500 - 1000
  });

  it('différence = 0 si même catégorie', () => {
    const comp = compareCategories('Loyer', 'Loyer');
    expect(comp.totalDifference).toBe(0);
    expect(comp.countDifference).toBe(0);
  });
});
