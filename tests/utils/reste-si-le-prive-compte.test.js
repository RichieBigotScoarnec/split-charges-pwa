import { describe, it, expect } from 'vitest';
import { resteSiLePriveCompte } from '../../public/js/utils/calculations.js';

/**
 * Ce qui resterait, si l'on comptait les dépenses privées
 *
 * « Il te reste » les exclut — c'est un plafond, pas un solde. « Les compter »
 * dit ce qu'il deviendrait. Une seconde lecture du reste à vivre, donc sa
 * propre fabrique, arrondie au centime comme la première.
 */
describe('resteSiLePriveCompte', () => {
  it('retranche le total privé du reste', () => {
    expect(resteSiLePriveCompte(2888.43, 45)).toBe(2843.43);
  });

  it('arrondit au centime, sans résidu de virgule flottante', () => {
    expect(resteSiLePriveCompte(0.3, 0.1)).toBe(0.2);
  });

  it('un reste inconnu reste inconnu — jamais un chiffre inventé', () => {
    expect(resteSiLePriveCompte(null, 45)).toBeNull();
    expect(resteSiLePriveCompte(NaN, 45)).toBeNull();
  });

  it('un total privé illisible compte pour zéro, pas pour NaN', () => {
    expect(resteSiLePriveCompte(100, undefined)).toBe(100);
  });

  it('peut devenir négatif : le plafond était dépassé, et c\'est ce qu\'il fallait dire', () => {
    expect(resteSiLePriveCompte(30, 45)).toBe(-15);
  });
});
