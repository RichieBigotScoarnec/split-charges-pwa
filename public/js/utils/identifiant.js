/**
 * Fabrique l'identifiant d'une entrée à partir de son libellé
 *
 * L'ancienne formule retirait tout ce qui n'était pas `[a-z0-9-]` après un
 * simple `toLowerCase()`. Les accents ne survivaient donc pas : « Café »
 * donnait `caf`, « Péage » donnait `page`, « Crèche » donnait `crche`. Ces
 * identifiants sont écrits sur chaque charge et servent à retrouver l'entrée —
 * et la détection par le lieu vise `cafe`, qui n'existait donc jamais.
 *
 * Les accents sont désormais dépliés puis retirés : « Café » donne `cafe`.
 *
 * L'unicité est vérifiée ensuite. Deux libellés distincts pouvaient déjà
 * produire le même identifiant, et la recherche par identifiant renvoie la
 * première trouvée : la grille aurait sélectionné la mauvaise tuile, sans
 * qu'aucune erreur ne le dise.
 *
 * Extrait de `modules/custom-lists.js` : catégories, destinations et
 * enveloppes fabriquent leur identifiant de la même façon, et une seconde copie
 * de cette formule aurait dérivé de la première — c'est exactement ainsi que le
 * bogue des accents avait survécu.
 *
 * @param {string} libelle - Libellé saisi
 * @param {Array} existantes - Entrées déjà présentes
 * @returns {string} Identifiant unique dans cette liste
 */
export function identifiantDepuisLibelle(libelle, existantes = []) {
  const base = String(libelle || '')
    // NFD sépare la lettre de son accent, le second intervalle retire l'accent.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  // Un libellé entièrement composé de caractères écartés — « ??? », un emoji
  // seul — ne doit pas produire un identifiant vide, qu'aucune recherche ne
  // retrouverait.
  const racine = base || 'categorie';

  const pris = new Set((existantes || []).map(entree => entree && entree.id));
  if (!pris.has(racine)) return racine;

  let rang = 2;
  while (pris.has(`${racine}-${rang}`)) rang += 1;
  return `${racine}-${rang}`;
}
