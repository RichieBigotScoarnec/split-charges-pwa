// ===== LES DEUX POCHES, LUES COMME UNE SEULE =====
//
// Depuis le lot P1a, une charge peut vivre à deux endroits : dans le commun,
// sous `periods/{mois}/…`, ou dans une poche personnelle, sous
// `personnel/{qui}/periods/{mois}/…`. Le mur qui protège la seconde est en
// base — le propriétaire lit toujours, l'autre seulement sous aval.
//
// ─────────────────────────────────────────────────────────────────────────────
// L'INVARIANT QUE CE MODULE EXISTE POUR TENIR
//
//   `getState('variableCharges')` et `getState('fixedCharges')` contiennent le
//   commun ET le personnel qu'on a le droit de lire — comme avant P1a.
//
// C'est tout. Les 33 sites qui lisent ces états, les traversées qui parcourent
// un nœud `periods`, et toute la logique de `utils/perimetre.js` ne savent rien
// de ce fichier et n'ont pas à le savoir. Le personnel n'a jamais pesé sur le
// solde — `chargesCommunes` l'écartait déjà — donc ce que la séparation des
// poches casse n'est pas le calcul, c'est le CONTENU du tableau en mémoire.
//
// Si un jour tenir cet invariant demande de modifier un site en aval, c'est
// qu'il n'est pas tenu ici.
//
// ─────────────────────────────────────────────────────────────────────────────
// UNE SEULE FABRIQUE, POUR DIX-NEUF POINTS DE LECTURE
//
// Dix-neuf endroits lisent la base : trois chargeurs de liste, un lecteur de
// nœud de mois, quinze lecteurs d'historique. Écrire dix-neuf fusions serait la
// règle 2 semée à dix-neuf exemplaires — et son symptôme serait le même total
// affiché différemment à deux endroits de l'application.
//
// Ce qui rend une fabrique unique possible : les DEUX poches ont la même forme.
// `personnel/{qui}/periods/{mois}/variableCharges/{id}` est
// `periods/{mois}/variableCharges/{id}` déplacé d'un préfixe. La fusion est
// donc la même opération, quel que soit le niveau auquel on lit.
//
// ─────────────────────────────────────────────────────────────────────────────
// ELLE NE CONSULTE JAMAIS `aval/`, ET LE REFUS EST LA RÉPONSE
//
// Deux raisons, dont une est bloquante :
//
//   1. `aval/` est une racine SŒUR de l'espace de données, donc seulement
//      atteignable par les quatre accès absolus — et ceux-là LÈVENT en bac à
//      sable (`refuserLePriveHorsDuFoyer`, `db.js`). Une fabrique qui lirait
//      l'aval pour décider ferait planter tout chargement de mois sous
//      `?sandbox=1` ;
//   2. ce serait une seconde rédaction du mur. Le serveur est l'autorité ; un
//      client qui recalcule la permission finit par diverger, et il divergerait
//      sur une frontière de confidentialité.
//
// On TENTE donc la lecture, et un refus vaut « pas de personnel » — jamais une
// erreur. Ce n'est pas de la complaisance : c'est le cas NOMINAL, puisque sans
// aval l'autre poche est refusée à chaque chargement.
//
// ─────────────────────────────────────────────────────────────────────────────
// LE COMMUN N'EST JAMAIS DANS LE MÊME `Promise.all` QU'UNE LECTURE REFUSABLE
//
// Le lot P1a a payé ce défaut une fois : `buildBackup` lisait ses treize nœuds
// en parallèle, et une seule levée emportait la sauvegarde ENTIÈRE. Ici l'enjeu
// est le même d'un cran plus haut — une poche refusée ne doit jamais faire
// disparaître les charges communes de l'écran.
//
// Les trois lectures partent donc ensemble, mais le commun est attendu SEUL :
// sa levée remonte telle quelle, exactement comme avant ce lot, et les poches
// portent chacune son propre `catch`.

import { dbGet, cheminDuPersonnel } from './db.js';
import { proprietaireDuSolo } from './utils/perimetre.js';
import { log, warn } from './utils/debug.js';
import { getState } from './state.js';
import { normaliserEmplacement } from './utils/members.js';
import { emplacementOppose } from './utils/confidentialite.js';

/** Les collections de charges qu'une poche personnelle peut porter */
const COLLECTIONS = Object.freeze(['fixedCharges', 'variableCharges']);

/**
 * Profondeur d'une charge sous `periods` : `{mois}/{collection}/{id}`
 *
 * C'est ce qui permet de lire au niveau qu'on veut sans écrire trois fusions :
 * le nombre de segments déjà consommés par le sous-chemin dit ce qu'il reste à
 * parcourir.
 */
const PROFONDEUR_CHARGE = 3;

/** L'emplacement du compte connecté */
function moi() {
  return normaliserEmplacement(getState('emplacementCourant'));
}

/**
 * Les entrées d'un nœud, à plat, jusqu'à une profondeur donnée
 *
 * Rend des couples `[segments, valeur]` — `[['2026-09', 'variableCharges',
 * 'abc'], {amount: 12}]` pour une lecture à la racine de `periods`.
 *
 * La descente s'ARRÊTE à la profondeur demandée : elle n'entre jamais dans une
 * charge. C'est ce qui empêche la fusion de mélanger les CHAMPS de deux charges
 * qui porteraient le même identifiant — elle remplacerait alors une charge par
 * un hybride des deux, sans que rien ne le dise.
 *
 * @param {*} noeud - Nœud lu en base
 * @param {number} profondeur - Niveaux restants avant la charge
 * @returns {Array<[Array<string>, *]>}
 */
function aPlat(noeud, profondeur) {
  if (!noeud || typeof noeud !== 'object' || Array.isArray(noeud)) return [];
  if (profondeur <= 0) return Object.entries(noeud).map(([cle, valeur]) => [[cle], valeur]);

  const entrees = [];
  for (const [cle, valeur] of Object.entries(noeud)) {
    // Une poche personnelle ne porte QUE des collections de charges. Le niveau
    // des collections est le dernier avant la charge : c'est là qu'on écarte
    // tout ce qui n'en est pas une, plutôt que de faire confiance au nœud lu.
    if (profondeur === 1 && !COLLECTIONS.includes(cle)) continue;
    for (const [suite, feuille] of aPlat(valeur, profondeur - 1)) {
      entrees.push([[cle, ...suite], feuille]);
    }
  }
  return entrees;
}

/**
 * Pose une valeur à un chemin de segments, en créant les conteneurs manquants
 *
 * @param {Object} cible - Objet à compléter, modifié en place
 * @param {Array<string>} segments
 * @param {*} valeur
 * @returns {boolean} `false` si la clé existait déjà
 */
function poser(cible, segments, valeur) {
  let courant = cible;
  for (const segment of segments.slice(0, -1)) {
    if (!courant[segment] || typeof courant[segment] !== 'object') courant[segment] = {};
    courant = courant[segment];
  }
  const derniere = segments[segments.length - 1];
  const existait = Object.prototype.hasOwnProperty.call(courant, derniere);
  courant[derniere] = valeur;
  return !existait;
}

/**
 * Fusionne des poches personnelles dans un nœud commun
 *
 * Exportée pour être éprouvée seule : c'est la seule partie de ce module qui
 * n'a pas besoin de la base, et c'est celle où une erreur serait invisible.
 *
 * @param {*} commun - Nœud `periods{/sousChemin}` du foyer
 * @param {Array<*>} poches - Les mêmes nœuds, lus sous `personnel/{qui}`
 * @param {number} profondeur - Niveaux restants avant la charge
 * @returns {*} Le nœud fusionné, ou `null` si tout est vide
 */
export function fusionnerLesPoches(commun, poches, profondeur) {
  const aQuelqueChose = (noeud) => Boolean(noeud) && typeof noeud === 'object';
  const utiles = (Array.isArray(poches) ? poches : []).filter(aQuelqueChose);

  // Rien de personnel à ajouter : on rend le commun TEL QUEL, sans le recopier.
  // C'est le cas de tous les jours — sans aval, l'autre poche est refusée — et
  // c'est aussi ce qui garantit qu'une poche vide ne change rien à ce que
  // l'application lisait avant ce lot.
  if (utiles.length === 0) return commun;

  const fusionne = aQuelqueChose(commun) ? structuredClone(commun) : {};

  for (const poche of utiles) {
    for (const [segments, charge] of aPlat(poche, profondeur)) {
      if (!poser(fusionne, segments, charge)) {
        // Un identifiant présent dans les deux poches. Firebase tire ses clés
        // d'un horodatage et d'un aléa : la collision est hors d'atteinte, et
        // ce qui l'expliquerait est une migration qui a écrit la destination
        // sans effacer l'origine. Le dire fort, plutôt que de laisser un
        // doublon décider lequel des deux gagne en silence.
        warn(`[Poches] « ${segments.join('/')} » existe dans les deux poches `
          + '— une migration a-t-elle laissé son origine en place ?');
      }
    }
  }

  return fusionne;
}

/**
 * Lit `periods{/sousChemin}` et rend LES TROIS NŒUDS, plus leur fusion
 *
 * `lirePeriodes` ne rend que la fusion, et c'est ce dont presque tout le monde
 * a besoin. Deux appelants ont besoin du nœud COMMUN brut :
 *
 *   - la migration des poches, qui ne peut pas déduire du nœud fusionné où une
 *     charge vit physiquement — c'est exactement ce que la fusion efface ;
 *   - rien d'autre, et c'est volontaire : un accès au brut est un accès qui
 *     peut composer un chemin, ce que ce lot a passé son temps à retirer.
 *
 * Les rendre ensemble évite une seconde lecture de l'historique entier.
 * `lecture-unique.spec.js` tient le prix d'une ouverture : à douze mois de
 * données, `periods` pèse 96 % des octets lus.
 *
 * @param {string} [sousChemin] - Sous `periods` : `''`, `'2026-09'`, `'2026-09/variableCharges'`
 * @returns {Promise<{commun: *, poches: Array<*>, fusionne: *}>}
 */
export async function lireLesPoches(sousChemin = '') {
  const segments = String(sousChemin || '').split('/').filter(Boolean);
  if (segments.length >= PROFONDEUR_CHARGE) {
    // Personne ne lit une charge seule aujourd'hui, et la fusion n'aurait aucun
    // sens à ce niveau : deux poches ne peuvent pas porter la MÊME charge.
    throw new Error(
      `lireLesPoches ne descend pas jusqu'à une charge (${sousChemin}) : `
      + 'une charge vit dans une poche et une seule.'
    );
  }

  const chemin = segments.length > 0 ? `periods/${segments.join('/')}` : 'periods';
  const profondeur = PROFONDEUR_CHARGE - 1 - segments.length;

  const proprietaire = moi();
  const autre = emplacementOppose(proprietaire);

  // Les trois lectures partent ENSEMBLE — mais le commun est attendu seul, et
  // les poches portent chacune son `catch`. Voir l'en-tête : une poche refusée
  // ne doit jamais faire disparaître les charges communes de l'écran.
  const promesseCommun = dbGet(chemin);
  const promessesDesPoches = [proprietaire, autre]
    .filter(Boolean)
    .map((qui) => dbGet(cheminDuPersonnel(qui, chemin)).catch((erreur) => {
      // Sans aval, le refus est le cas NOMINAL : il ne mérite pas un
      // avertissement à chaque chargement de mois. Il est journalisé, pas crié.
      log(`[Poches] personnel de « ${qui} » non lu (${erreur?.message || erreur})`);
      return null;
    }));

  const commun = await promesseCommun;
  const poches = await Promise.all(promessesDesPoches);

  return { commun, poches, fusionne: fusionnerLesPoches(commun, poches, profondeur) };
}

/**
 * Lit `periods{/sousChemin}`, les deux poches réunies
 *
 * C'est le remplaçant des lectures de `periods` pour tout ce qui touche aux
 * charges. Il rend exactement la forme que `dbGet` rendait : les appelants —
 * chargeurs, traversées, calculs — ne changent pas.
 *
 * @param {string} [sousChemin] - Sous `periods` : `''`, `'2026-09'`, `'2026-09/variableCharges'`
 * @returns {Promise<*>} Le nœud fusionné
 */
export async function lirePeriodes(sousChemin = '') {
  return (await lireLesPoches(sousChemin)).fusionne;
}

/**
 * Où vit une charge — DÉDUIT de la charge, jamais d'un marqueur
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE CHEMIN SE DÉRIVE ET NE SE COMPOSE PAS
 *
 * Avant ce lot, chaque site d'écriture composait `periods/{mois}/{collection}/
 * {id}` à la main — vrai tant qu'il n'y avait qu'une poche. Depuis qu'il y en a
 * deux, une charge personnelle écrite à ce chemin-là atterrit dans le commun,
 * c'est-à-dire sous les yeux de l'autre.
 *
 * La tentation est de faire porter à la charge un marqueur disant d'où elle
 * vient. Il ne faut pas : `$id/$autre` accepte tout scalaire court — relevé au
 * lot P1a, 26 `$autre` ouverts —, donc un marqueur posé en mémoire finirait
 * ÉCRIT en base au premier enregistrement, accepté par le serveur, et
 * indiscernable d'un champ légitime.
 *
 * `perimetre.js` sait déjà répondre : `proprietaireDuSolo` rend l'emplacement
 * d'une charge personnelle, et `null` pour une charge commune. La question « où
 * vit-elle » n'a donc pas besoin d'être mémorisée, seulement posée.
 *
 * @param {Object} charge - La charge, telle qu'elle sera écrite
 * @param {Object} ou
 * @param {string} ou.periode - Clé de mois, `AAAA-MM`
 * @param {'fixedCharges'|'variableCharges'} ou.collection
 * @param {string} [ou.id] - Omis pour le conteneur, par exemple avant un `push`
 * @returns {string} Chemin relatif à l'espace de données
 */
export function cheminDeLaCharge(charge, { periode, collection, id = '' }) {
  const suite = `periods/${periode}/${collection}${id ? `/${id}` : ''}`;
  const proprietaire = proprietaireDuSolo(charge);
  return proprietaire ? cheminDuPersonnel(proprietaire, suite) : suite;
}

/**
 * Ce qu'un déplacement de poche écrit — destination posée, origine effacée
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ATOMIQUE, ET IL LE FAUT
 *
 * En deux écritures, l'échec de la seconde laisse la charge DEUX FOIS : une
 * fois dans chaque poche, comptée deux fois par tout ce qui additionne. L'échec
 * de la première la laisse zéro fois. Une mise à jour multi-chemins tranche :
 * elle passe entière ou pas du tout.
 *
 * Hors réseau, elle échoue franchement — `operationRejouable` refuse de différer
 * une écriture qui vise la racine de l'espace. C'est le bon comportement : un
 * déplacement de poche différé changerait la visibilité d'une dépense bien plus
 * tard, sans que personne ne le voie partir.
 *
 * L'identifiant est CONSERVÉ : une charge qui en changerait perdrait sa
 * corbeille, et le geste « annuler » ne retrouverait plus rien.
 *
 * @param {Object} params
 * @param {Object} params.avant - La charge telle qu'elle est en base
 * @param {Object} params.apres - La charge telle qu'on veut l'écrire
 * @param {string} params.periode
 * @param {'fixedCharges'|'variableCharges'} params.collection
 * @param {string} params.id
 * @returns {Object|null} Écritures multi-chemins, ou `null` si rien ne bouge
 */
export function ecrituresDuDeplacement({ avant, apres, periode, collection, id }) {
  const origine = cheminDeLaCharge(avant, { periode, collection, id });
  const destination = cheminDeLaCharge(apres, { periode, collection, id });

  if (origine === destination) return null;

  return { [destination]: apres, [origine]: null };
}
