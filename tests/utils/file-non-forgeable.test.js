/**
 * La file hors ligne ne rejoue que des saisies
 *
 * `empiler()` contrôle le type et le chemin *à la mise en file*, et le rejeu
 * reprenait ensuite l'enregistrement tel quel. Or la file vit en clair dans
 * `localStorage`, sur une origine que GitHub Pages partage entre tous les
 * dépôts d'un même compte : une autre page du compte y écrit sans la moindre
 * injection, et une extension de navigateur aussi.
 *
 * La charge utile tenait en une entrée : `{ type: 'set', chemin: '',
 * donnees: null }`. `getDataPath('')` rend `household` — l'espace entier — et
 * le rejeu partait seul à la reconnexion, sous la session légitime du foyer,
 * sans rien redemander.
 *
 * Le même contrôle sert au dépôt : une restauration de sauvegarde écrit toute
 * la racine, et la différer en l'annonçant comme réussie est pire que la
 * refuser — l'écrasement survenait à la reconnexion, éventuellement sous la
 * session de l'autre compte, par-dessus ce qu'il avait saisi entre-temps.
 */

import { describe, it, expect } from 'vitest';
import { operationRejouable } from '../../public/js/db.js';

const SAISIE = {
  id: 'op-1',
  type: 'set',
  chemin: 'periods/2026-08/variableCharges/c1',
  donnees: { description: 'Courses', amount: 84.3, paidBy: 'vous', timestamp: 1 }
};

describe('Ce que la file accepte de rejouer', () => {
  it('une saisie ordinaire passe', () => {
    expect(operationRejouable(SAISIE)).toBe(true);
  });

  it('une mise à jour partielle passe — c\'est la suppression douce', () => {
    expect(operationRejouable({ ...SAISIE, type: 'update', donnees: { deleted: true } })).toBe(true);
  });

  it('un lot multi-chemins passe', () => {
    expect(operationRejouable({
      ...SAISIE,
      type: 'update',
      chemin: 'periods/2026-08',
      donnees: { 'variableCharges/c1/deleted': true, 'variableCharges/c2/deleted': true }
    })).toBe(true);
  });
});

describe('Ce que la file refuse de rejouer', () => {
  it('la charge utile de l\'effacement : chemin vide et données nulles', () => {
    expect(operationRejouable({ id: 'x', type: 'set', chemin: '', donnees: null })).toBe(false);
  });

  it('un chemin vide, même avec des données', () => {
    // C'est aussi la restauration d'une sauvegarde : elle ne se diffère pas.
    expect(operationRejouable({ id: 'x', type: 'set', chemin: '', donnees: { periods: {} } })).toBe(false);
  });

  it('un chemin qui n\'est que des barres obliques', () => {
    expect(operationRejouable({ id: 'x', type: 'set', chemin: '///', donnees: { a: 1 } })).toBe(false);
  });

  it('un `set` à null — une saisie n\'efface jamais un nœud', () => {
    expect(operationRejouable({ ...SAISIE, donnees: null })).toBe(false);
  });

  it('un type inconnu', () => {
    expect(operationRejouable({ ...SAISIE, type: 'remove' })).toBe(false);
    expect(operationRejouable({ ...SAISIE, type: 'push' })).toBe(false);
  });

  it('un chemin qui n\'est pas une chaîne', () => {
    expect(operationRejouable({ ...SAISIE, chemin: 42 })).toBe(false);
    expect(operationRejouable({ ...SAISIE, chemin: undefined })).toBe(false);
  });

  it('un enregistrement qui n\'est pas un objet', () => {
    for (const brut of [null, undefined, 'op', 7, []]) {
      expect(operationRejouable(brut)).toBe(false);
    }
  });
});
