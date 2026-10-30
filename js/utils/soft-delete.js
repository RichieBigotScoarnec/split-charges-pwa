/**
 * FairSplit — Éléments supprimés
 *
 * Les suppressions de l'application sont douces : charges et remboursements
 * reçoivent `deleted: true` et restent en base. Rien n'a donc jamais été
 * réellement effacé — mais rien ne permettait non plus de les revoir ni de
 * les rétablir. Une suppression accidentelle était définitive du point de vue
 * de l'utilisateur, alors que la donnée était toujours là.
 *
 * Les chargeurs lisent déjà le nœud complet et écartent ces entrées. Les
 * recueillir au passage évite toute lecture supplémentaire.
 */

/**
 * Extrait les entrées marquées supprimées d'un nœud Firebase
 *
 * @param {*} node - Nœud brut lu en base (objet indexé par clé, ou null)
 * @returns {Array<Object>} Entrées supprimées, clé reportée en `id`, les plus récemment créées d'abord
 */
export function collectDeleted(node) {
  if (!node || typeof node !== 'object') return [];

  return Object.entries(node)
    .filter(([id, item]) => id && item && item.deleted === true)
    .map(([id, item]) => ({ id, ...item }))
    // Tri par date de création : la suppression douce ne l'horodate pas, il
    // n'existe donc aucune date de mise à la corbeille sur laquelle trier.
    // À défaut, l'ordre reste stable et proche de celui des listes actives.
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}
