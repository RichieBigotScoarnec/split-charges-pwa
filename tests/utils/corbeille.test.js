import { describe, it, expect } from 'vitest';
import { collectDeleted } from '../../public/js/utils/soft-delete.js';

/**
 * Les suppressions de l'application sont douces depuis l'origine : la donnée
 * reste en base avec `deleted: true`. Les chargeurs l'écartaient sans jamais
 * la conserver, ce qui rendait toute suppression irréversible côté utilisateur
 * alors que rien n'avait été perdu.
 */
describe('Recueil des éléments supprimés', () => {
  it('ne retient que les entrées marquées supprimées', () => {
    const supprimes = collectDeleted({
      a: { amount: 10, deleted: false },
      b: { amount: 20, deleted: true },
      c: { amount: 30 }
    });

    expect(supprimes).toHaveLength(1);
    expect(supprimes[0]).toMatchObject({ id: 'b', amount: 20 });
  });

  it('reporte la clé Firebase en identifiant', () => {
    // Sans cet identifiant, aucun rétablissement n'est possible : c'est lui
    // qui désigne le nœud à réécrire.
    const [item] = collectDeleted({ '-NxAbc123': { amount: 5, deleted: true } });

    expect(item.id).toBe('-NxAbc123');
  });

  it('présente les plus récentes en premier', () => {
    const supprimes = collectDeleted({
      vieux: { amount: 1, deleted: true, timestamp: 1000 },
      recent: { amount: 2, deleted: true, timestamp: 3000 },
      moyen: { amount: 3, deleted: true, timestamp: 2000 }
    });

    expect(supprimes.map(i => i.id)).toEqual(['recent', 'moyen', 'vieux']);
  });

  it('une entrée sans horodatage ne casse pas le tri', () => {
    const supprimes = collectDeleted({
      sansDate: { amount: 1, deleted: true },
      avecDate: { amount: 2, deleted: true, timestamp: 5000 }
    });

    expect(supprimes.map(i => i.id)).toEqual(['avecDate', 'sansDate']);
  });

  it('un nœud vide, nul ou non-objet donne une liste vide', () => {
    expect(collectDeleted(null)).toEqual([]);
    expect(collectDeleted(undefined)).toEqual([]);
    expect(collectDeleted({})).toEqual([]);
    expect(collectDeleted('pas un objet')).toEqual([]);
    expect(collectDeleted(42)).toEqual([]);
  });

  it('une entrée nulle est ignorée sans erreur', () => {
    // Realtime Database peut rendre un enfant null après suppression partielle.
    expect(collectDeleted({ a: null, b: { amount: 1, deleted: true } })).toHaveLength(1);
  });

  it('`deleted` doit valoir exactement true', () => {
    // Une valeur simplement vraie au sens large — chaîne, nombre — traduirait
    // une donnée corrompue, pas une suppression.
    const supprimes = collectDeleted({
      a: { amount: 1, deleted: 'true' },
      b: { amount: 2, deleted: 1 },
      c: { amount: 3, deleted: true }
    });

    expect(supprimes.map(i => i.id)).toEqual(['c']);
  });
});
