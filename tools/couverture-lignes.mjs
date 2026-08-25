/**
 * FairSplit — Lire un relevé de couverture, ligne par ligne
 *
 * Le calcul est sorti du script pour être vérifiable : je m'y suis trompé deux
 * fois, et chaque fois l'erreur produisait un chiffre crédible.
 *
 *   — première version : additionner les compteurs des deux outils. Leurs
 *     cartes d'instructions ne se correspondent pas, la fusion retombait donc
 *     sur Vitest seul et jetait l'apport du navigateur qu'elle prétendait
 *     mesurer. Elle annonçait 60,5 % ;
 *   — deuxième version : bâtir le dénominateur sur la carte de
 *     `v8-to-istanbul`. Celle-ci couvre le fichier entier, commentaires et
 *     lignes vides compris : 17 623 lignes « exécutables » pour 17 628 lignes
 *     de fichier. Elle annonçait 87 %.
 *
 * Un taux de couverture ne se vérifie pas à l'œil : c'est précisément le genre
 * de chiffre qu'on accepte parce qu'il ressemble à ce qu'on attendait.
 *
 * Hors de `public/`, donc jamais publié.
 */

/**
 * Ce qu'un relevé Vitest dit d'un fichier
 *
 * Vitest remonte à l'arbre syntaxique : sa carte ne désigne que du code, et
 * c'est elle qui décide de ce qui compte. Une instruction est rattachée à la
 * ligne où elle commence — la définition d'Istanbul.
 *
 * @param {Object} releve - Relevé Istanbul d'un fichier
 * @returns {{executables: Set<number>, atteintes: Set<number>}}
 */
export function lignesDeVitest(releve) {
  const executables = new Set();
  const atteintes = new Set();

  for (const [id, position] of Object.entries(releve?.statementMap || {})) {
    const ligne = position?.start?.line;
    if (!Number.isFinite(ligne)) continue;

    executables.add(ligne);
    if ((releve.s || {})[id] > 0) atteintes.add(ligne);
  }

  return { executables, atteintes };
}

/**
 * Les lignes qu'un relevé de navigateur a réellement traversées
 *
 * Une instruction couverte vaut pour tout son intervalle — c'est ce qui permet
 * de rattraper les lignes que Vitest connaît et que V8 découpe autrement. Mais
 * un intervalle non couvert l'emporte : il est plus précis, et c'est lui qui
 * décrit la branche non prise à l'intérieur d'une fonction pourtant exécutée.
 *
 * Sans cette priorité, une fonction appelée une fois compterait tout son corps
 * comme exécuté, `else` compris.
 *
 * @param {Object} releve - Relevé Istanbul rendu par `v8-to-istanbul`
 * @returns {Set<number>}
 */
export function lignesTraversees(releve) {
  const vues = new Set();
  const evitees = new Set();

  for (const [id, position] of Object.entries(releve?.statementMap || {})) {
    const debut = position?.start?.line;
    const fin = position?.end?.line;
    if (!Number.isFinite(debut)) continue;

    const derniere = Number.isFinite(fin) && fin >= debut ? fin : debut;
    const cible = (releve.s || {})[id] > 0 ? vues : evitees;
    for (let ligne = debut; ligne <= derniere; ligne++) cible.add(ligne);
  }

  for (const ligne of evitees) vues.delete(ligne);
  return vues;
}

/**
 * Ce que le navigateur ajoute, une fois filtré par ce que Vitest reconnaît
 *
 * Une ligne que le navigateur dit avoir traversée mais que l'arbre syntaxique
 * ignore est un commentaire ou une ligne vide : elle n'a rien à faire dans la
 * mesure. C'est ce filtre, et lui seul, qui sépare une couverture d'un compte
 * de lignes de fichier.
 *
 * @param {Object} releve - Relevé rendu par `v8-to-istanbul`
 * @param {Set<number>} reconnues - Lignes que Vitest tient pour du code
 * @returns {Set<number>}
 */
export function apportDuNavigateur(releve, reconnues) {
  const retenues = new Set();

  for (const ligne of lignesTraversees(releve)) {
    if (reconnues.has(ligne)) retenues.add(ligne);
  }

  return retenues;
}
