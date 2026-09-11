import { describe, it, expect } from 'vitest';
import { decomposerParRegle } from '../../public/js/utils/decomposition.js';

/**
 * La décomposition dit la part de QUI TIENT LE TÉLÉPHONE
 *
 * Elle était toujours celle de `vous`. Sur le téléphone de la conjointe,
 * « Pourquoi votre part » et le grand-livre de « Moi » décomposaient la part de
 * l'autre — et leurs lignes ne sommaient pas au chiffre qu'elles prétendaient
 * expliquer.
 *
 * Le jeu d'essai SÉPARE les deux points de vue : sur des salaires égaux, les
 * deux parts seraient identiques et le défaut vivrait sans que rien bronche.
 */

const CTX = { shareMode: 'prorata', salaries: { vous: 3000, conjointe: 1000 }, totalSalaries: 4000, customPercents: { vous: 50, conjointe: 50 } };

// 100 € au prorata (75 / 25), 40 € en 50/50 (20 / 20).
const CHARGES = [
  { amount: 100 },
  { amount: 40, splitOverride: { mode: '50-50' } }
];

const somme = (lignes) => lignes.reduce((s, l) => s + l.mien, 0);

describe('La part décomposée est celle du compte connecté', () => {
  it('par défaut, celle de `vous` — le comportement d\'avant', () => {
    expect(somme(decomposerParRegle(CHARGES, CTX))).toBeCloseTo(95, 2);
  });

  it('pour la conjointe, SA part : 25 + 20', () => {
    const lignes = decomposerParRegle(CHARGES, { ...CTX, personne: 'conjointe' });
    expect(somme(lignes)).toBeCloseTo(45, 2);
    expect(lignes.find((l) => !l.derogatoire).mien).toBeCloseTo(25, 2);
  });

  it('et le pourcentage du libellé est le sien', () => {
    const base = decomposerParRegle(CHARGES, { ...CTX, personne: 'conjointe' })
      .find((l) => !l.derogatoire);
    expect(base.libelle).toContain('25,0');
  });

  it('la dérogation garde sa pastille, quel que soit le point de vue', () => {
    const pastilles = (personne) => decomposerParRegle(CHARGES, { ...CTX, personne })
      .filter((l) => l.derogatoire).map((l) => l.pastille);
    expect(pastilles('conjointe')).toEqual(pastilles('vous'));
  });
});
