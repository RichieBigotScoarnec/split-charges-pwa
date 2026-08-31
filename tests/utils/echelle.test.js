import { describe, it, expect } from 'vitest';
import { echelleLisible } from '../../public/js/utils/echelle.js';

/**
 * L'échelle du graphe des tendances.
 *
 * Le défaut mesuré : l'axe divisait le maximum par cinq sans arrondir, et
 * affichait « 1 997,47 · 1 597,97 · 1 198,48 · 798,99 · 399,49 · 0 ». Six
 * graduations dont pas une ne se retient.
 *
 * Ce que ces contrôles tiennent, ce n'est pas une liste de valeurs attendues —
 * ce serait réécrire l'implémentation — mais les deux PROPRIÉTÉS qui font
 * qu'une échelle est lisible : le pas est rond, et la courbe tient dedans.
 */

/** Le pas est-il de la forme 1, 2, 2,5 ou 5 × une puissance de dix ? */
function estRond(pas) {
  const magnitude = 10 ** Math.floor(Math.log10(pas));
  const normalise = Number((pas / magnitude).toFixed(9));
  return [1, 2, 2.5, 5, 10].includes(normalise);
}

describe('echelleLisible — les deux propriétés', () => {
  // Des maximums pris au hasard dans les ordres de grandeur d'un foyer :
  // quelques euros, quelques centaines, quelques milliers, une année entière.
  const CAS = [
    0.42, 3.7, 12, 47.5, 99.99, 128.4, 512, 900, 1009.81, 1171.01,
    1815.88, 1997.47, 2600, 4500, 13668.96, 27000, 99999
  ];

  it('le pas est toujours un nombre rond', () => {
    for (const max of CAS) {
      for (const vise of [3, 5]) {
        const { pas } = echelleLisible(max, vise);
        expect(estRond(pas), `max=${max} visé=${vise} → pas=${pas}`).toBe(true);
      }
    }
  });

  it('le sommet couvre toujours les données — aucune courbe ne sort du cadre', () => {
    for (const max of CAS) {
      for (const vise of [3, 5]) {
        const echelle = echelleLisible(max, vise);
        expect(echelle.maximum, `max=${max} visé=${vise}`).toBeGreaterThanOrEqual(max);
      }
    }
  });

  it('le sommet est un multiple exact du pas', () => {
    for (const max of CAS) {
      const { maximum, pas, graduations } = echelleLisible(max, 5);
      expect(Number((maximum / pas).toFixed(9))).toBe(graduations);
    }
  });

  it('chaque graduation tombe sur une valeur ronde', () => {
    // C'est la propriété qu'on cherchait : les étiquettes de l'axe, une à une.
    const { maximum, pas, graduations } = echelleLisible(1997.47, 5);
    const etiquettes = Array.from({ length: graduations + 1 }, (_, i) => maximum - pas * i);
    expect(etiquettes).toEqual([2000, 1500, 1000, 500, 0]);
  });

  it('le nombre de graduations reste proche de ce qu\'on demande', () => {
    // Sans quoi « rond » se satisferait d'un pas unique couvrant tout.
    for (const max of CAS) {
      const { graduations } = echelleLisible(max, 5);
      expect(graduations, `max=${max}`).toBeGreaterThanOrEqual(2);
      expect(graduations, `max=${max}`).toBeLessThanOrEqual(10);
    }
  });
});

describe('echelleLisible — les cas dégénérés', () => {
  it('un maximum nul ou négatif rend quand même une échelle utilisable', () => {
    // L'appelant divise la hauteur par ce maximum : rendre zéro produirait un
    // infini, et le graphe disparaîtrait au lieu de se montrer plat.
    for (const rien of [0, -12, NaN, null, undefined]) {
      const echelle = echelleLisible(rien, 5);
      expect(echelle.maximum).toBeGreaterThan(0);
      expect(echelle.pas).toBeGreaterThan(0);
      expect(echelle.graduations).toBeGreaterThanOrEqual(1);
    }
  });

  it('un nombre de graduations absurde retombe sur la valeur par défaut', () => {
    for (const absurde of [0, -3, NaN, null, undefined]) {
      const { pas } = echelleLisible(1000, absurde);
      expect(estRond(pas)).toBe(true);
    }
  });

  it('un très petit maximum garde un pas rond', () => {
    // 0,3 / 0,1 vaut 2.9999999999999996 en flottant : un `ceil` naïf ajouterait
    // une graduation vide au-dessus de la courbe.
    const { maximum, graduations } = echelleLisible(0.3, 3);
    expect(maximum).toBeCloseTo(0.3, 9);
    expect(graduations).toBe(3);
  });
});

describe('Le témoin négatif', () => {
  it('l\'ancien calcul — max × 1,1 divisé par cinq — ne passerait pas', () => {
    // C'est très exactement ce que le graphe faisait, et ce que ces contrôles
    // existent pour empêcher de revenir.
    const ancien = 1815.88 * 1.1;
    const pasAncien = ancien / 5;
    expect(estRond(pasAncien)).toBe(false);
    expect(estRond(echelleLisible(1815.88, 5).pas)).toBe(true);
  });
});
