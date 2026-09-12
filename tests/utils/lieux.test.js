import { describe, it, expect } from 'vitest';

import { depensesParLieu } from '../../public/js/utils/lieux.js';

/**
 * Ce que « Où vous dépensez » montre sans qu'on clique.
 *
 * La planche 1 rend « 184,04 € à Landivisiau · 92,02 € par passage, sur
 * 2 passages », puis « Saint-Goazec 45,00 € ». La donnée existe déjà : chaque
 * charge peut porter un `location` avec son nom, et `map.js` s'en sert pour
 * ses marqueurs. Ce qui manquait est l'agrégat.
 *
 * Cette fabrique ne sait rien du PÉRIMÈTRE : une dépense solo appartient à une
 * personne, pas au foyer, et c'est à l'appelant de l'écarter — comme
 * `trends.js` le fait pour ses totaux. Une fabrique de lieux qui filtrerait le
 * solo deviendrait une seconde définition de « ce qui pèse sur le commun ».
 */
describe('depensesParLieu — ce que le mois dit des lieux', () => {
  const a = { amount: 100, location: { lat: 48.1, lng: -4, name: 'Landivisiau' } };
  const b = { amount: 84.04, location: { lat: 48.1, lng: -4, name: 'Landivisiau' } };
  const c = { amount: 45, location: { lat: 48.2, lng: -3.9, name: 'Saint-Goazec' } };

  it('groupe par nom de lieu, somme, et compte les passages', () => {
    const lieux = depensesParLieu([a, b, c]);
    expect(lieux).toHaveLength(2);
    expect(lieux[0]).toMatchObject({ lieu: 'Landivisiau', total: 184.04, passages: 2 });
    expect(lieux[1]).toMatchObject({ lieu: 'Saint-Goazec', total: 45, passages: 1 });
  });

  it('donne le montant par passage, arrondi au centime', () => {
    expect(depensesParLieu([a, b])[0].parPassage).toBe(92.02);
  });

  it('classe par total décroissant — le lieu qui pèse d\'abord', () => {
    expect(depensesParLieu([c, a, b]).map(l => l.lieu)).toEqual(['Landivisiau', 'Saint-Goazec']);
  });

  it('écarte ce qui n\'a pas de nom de lieu : la carte les montre, pas cette liste', () => {
    const sansNom = { amount: 30, location: { lat: 48, lng: -4 } };
    const sansLieu = { amount: 20 };
    expect(depensesParLieu([a, sansNom, sansLieu, b])).toHaveLength(1);
  });

  it('un montant illisible vaut zéro, jamais NaN — même règle que le bilan', () => {
    const casse = { amount: 'beaucoup', location: { name: 'Landivisiau' } };
    const lieux = depensesParLieu([a, casse]);
    expect(lieux[0].total).toBe(100);
    expect(lieux[0].passages).toBe(2);
  });

  it('une entrée vide ne fait rien tomber', () => {
    expect(depensesParLieu([null, undefined, {}])).toEqual([]);
    expect(depensesParLieu(null)).toEqual([]);
  });

  it('les noms se comparent sans leurs espaces de bord', () => {
    const espace = { amount: 10, location: { name: ' Landivisiau ' } };
    expect(depensesParLieu([a, espace])).toHaveLength(1);
    expect(depensesParLieu([a, espace])[0].total).toBe(110);
  });
});
