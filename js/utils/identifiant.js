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
  const racine = racineDepuisLibelle(libelle, 'categorie');

  const pris = new Set((existantes || []).map(entree => entree && entree.id));
  if (!pris.has(racine)) return racine;

  let rang = 2;
  while (pris.has(`${racine}-${rang}`)) rang += 1;
  return `${racine}-${rang}`;
}

/**
 * La part lisible d'un identifiant : le libellé, plié et nettoyé
 *
 * Extraite telle quelle du corps d'`identifiantDepuisLibelle`, sans une seule
 * modification — catégories et destinations doivent continuer de produire
 * exactement les mêmes identifiants qu'avant, sous peine de détacher les
 * charges qui les portent.
 *
 * @param {string} libelle - Libellé saisi
 * @param {string} [repli] - Ce que rend un libellé entièrement écarté
 * @returns {string}
 */
export function racineDepuisLibelle(libelle, repli = 'categorie') {
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
  return base || repli;
}

/**
 * Longueur maximale de la part lisible d'un identifiant d'enveloppe
 *
 * Les deux champs de libellé portent aujourd'hui `maxlength="30"` : un
 * identifiant démesuré n'est pas atteignable, et prétendre le contraire serait
 * faux. La borne existe pour que la part lisible le reste, et pour que
 * l'identifiant tienne sous les 100 caractères qu'exigent les règles quel que
 * soit ce qu'un formulaire futur autorisera.
 */
const RACINE_MAX = 40;

/**
 * Une estampille courte, jamais deux fois la même en pratique
 *
 * L'instant en base 36, plus quatre caractères d'aléa : deux créations dans la
 * même milliseconde restent distinctes.
 *
 * @returns {string}
 */
function estampille() {
  const alea = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${Date.now().toString(36)}${alea}`;
}

/**
 * L'identifiant d'une enveloppe NEUVE — dérivé du libellé, mais pas seulement
 *
 * Une enveloppe portait un identifiant entièrement dérivé de son libellé.
 * « Vacances » donnait donc toujours `vacances` — y compris une « Vacances »
 * créée un an après avoir supprimé la précédente. La nouvelle héritait alors
 * de tout ce qui renvoyait à l'ancienne : ses versements sous
 * `versements/vacances`, et toutes les charges portant `envelope: 'vacances'`.
 *
 * Mesuré : une enveloppe qu'on vient de créer annonçait « 300,00 € dans le
 * pot », une jauge à 15 % et une provision calculée sur un objectif déjà
 * entamé — sur une enveloppe vide.
 *
 * La racine lisible est conservée : un identifiant doit rester reconnaissable
 * quand on regarde la base. L'estampille la rend unique dans le temps, et la
 * boucle de collision est gardée par-dessus — l'unicité devient probabiliste,
 * et on ne fonde pas de l'argent sur une probabilité seule.
 *
 * **Rien n'est migré.** Les enveloppes déjà en base gardent leur identifiant et
 * leurs charges restent attachées : cette fabrique ne décide que de la valeur
 * produite à la prochaine création.
 *
 * Conséquence à connaître : deux créations simultanées du même libellé, sur les
 * deux téléphones, donnent désormais deux enveloppes distinctes là où l'une
 * écrasait l'autre en silence, en fondant les versements des deux dans le même
 * pot. Deux enveloppes homonymes se voient et se corrigent ; un pot fusionné,
 * non.
 *
 * @param {string} libelle - Libellé saisi
 * @param {Array} existantes - Enveloppes déjà présentes
 * @param {Function} [marque] - Fabrique d'estampille, injectable pour les bancs
 * @returns {string} Identifiant unique
 */
export function identifiantEnveloppe(libelle, existantes = [], marque = estampille) {
  const racine = racineDepuisLibelle(libelle, 'enveloppe')
    .slice(0, RACINE_MAX)
    // Une troncature peut tomber sur un tiret : « vacances- » se lit mal.
    .replace(/-+$/, '') || 'enveloppe';

  const propose = `${racine}-${marque()}`;

  const pris = new Set((existantes || []).map(entree => entree && entree.id));
  if (!pris.has(propose)) return propose;

  let rang = 2;
  while (pris.has(`${propose}-${rang}`)) rang += 1;
  return `${propose}-${rang}`;
}
