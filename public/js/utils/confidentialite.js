/**
 * Chacun écrit chez soi ; lire chez l'autre demande son accord
 *
 * Le périmètre « solo » a sorti une dépense du solde. Il ne l'a pas rendue
 * privée : les deux comptes lisent tout `household`, et une dépense perso s'y
 * affiche avec son montant et son libellé. « Ça ne se partage pas » n'est pas
 * « c'est à moi seul ».
 *
 * ## Ce que l'aval gouverne — et ce qu'il ne gouverne pas
 *
 * **Écrire une dépense privée ne demande la permission de personne.** Chacun a
 * le droit d'avoir des dépenses à soi, sans avoir à la mendier : `/prive/{qui}`
 * est écrivable par `{qui}`, toujours, sans condition.
 *
 * Ce qui est soumis à validation, c'est l'**accès au détail de l'autre**.
 * `/prive/{qui}` n'est lisible que par `{qui}` — sauf si `{qui}` a ouvert son
 * espace, en posant `/aval/{qui}/actif` à vrai. L'aval est donc une permission
 * de **lecture**, accordée par le propriétaire, sur ses propres données.
 *
 * ## Ce qui rend l'aval vrai
 *
 * **Personne ne peut s'accorder l'accès aux données de l'autre** :
 * `/aval/{qui}` n'est écrivable que par `{qui}` lui-même. Vouloir lire l'espace
 * de sa conjointe en écrivant soi-même l'autorisation est refusé par le moteur
 * de règles, pas par cet écran. C'est la même garantie que la version
 * précédente, dans l'autre sens : on ne peut jamais se donner à soi-même la
 * chose qui compte.
 *
 * Le retirer referme l'accès, passé compris — ce qui est cohérent : c'est une
 * permission de lecture, pas un permis d'écrire déjà consommé.
 *
 * ## Pourquoi le mur ne peut pas être ici
 *
 * Une confidentialité écrite en JavaScript est du théâtre. L'autre personne a
 * exactement les mêmes accès à la base : un drapeau « masqué » est un rideau,
 * pas un mur — il suffit d'ouvrir la console Firebase pour lire à travers. Le
 * refus vient du **serveur**. Ce fichier ne fait que du calcul : il ne protège
 * rien, il met en forme ce que les règles garantissent.
 *
 * ## La limite honnête du total publié
 *
 * Sans accord, l'autre voit tout de même un total et un compte — jamais un
 * libellé. Ce total est **déclaratif** : l'application du propriétaire l'écrit,
 * et aucune règle serveur ne peut vérifier qu'il correspond au détail, puisque
 * le serveur n'a pas le droit d'additionner ce qu'il n'a pas le droit de lire.
 * C'est inhérent au choix « détail privé, total public », pas un défaut de mise
 * en œuvre.
 */

import { parseMontant } from './montant.js';

/** Les deux emplacements du foyer */
export const EMPLACEMENTS = Object.freeze(['vous', 'conjointe']);

/** Plafond d'une dépense privée, aligné sur celui d'une charge */
const MONTANT_MAX = 100000;

/** Format d'une date : AAAA-MM-JJ */
const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * L'autre personne du foyer
 *
 * `null` sur un emplacement inconnu : désigner quelqu'un au hasard ferait
 * demander son aval à la mauvaise personne, ou pire, le lui accorder.
 *
 * @param {string} emplacement
 * @returns {'vous'|'conjointe'|null}
 */
export function emplacementOppose(emplacement) {
  if (emplacement === 'vous') return 'conjointe';
  if (emplacement === 'conjointe') return 'vous';
  return null;
}

/**
 * Remet un aval lu en base dans une forme exploitable
 *
 * `/aval/{qui}` dit une seule chose : **`{qui}` a-t-il ouvert le détail de ses
 * dépenses privées à l'autre ?**
 *
 * L'absence vaut refus, et c'est le seul défaut acceptable : un nœud qu'on n'a
 * pas pu lire ne doit jamais être pris pour un accès accordé, sinon l'écran
 * annoncerait un partage qui n'existe pas. `accordePar` vaut toujours
 * l'emplacement propriétaire — c'est lui seul qui peut écrire ici, et le
 * serveur le vérifie.
 *
 * @param {*} brut - Nœud `/aval/{emplacement}` tel que lu
 * @returns {{actif: boolean, accordeLe: number|null, accordePar: string|null}}
 */
export function normaliserAval(brut) {
  if (!brut || typeof brut !== 'object') {
    // `publieLeTotal` vaut vrai ICI AUSSI, et c'est le cas le plus fréquent :
    // un foyer qui n'a jamais touché au partage n'a pas de nœud `/aval` du
    // tout. L'omettre sur ce chemin ferait basculer tout le monde en « rien »
    // à la première lecture, et l'application cesserait de publier les totaux
    // qu'elle publie depuis toujours — sans que personne ne l'ait demandé.
    return { actif: false, accordeLe: null, accordePar: null, publieLeTotal: true };
  }

  return {
    actif: brut.actif === true,
    accordeLe: Number.isFinite(brut.accordeLe) ? brut.accordeLe : null,
    accordePar: EMPLACEMENTS.includes(brut.accordePar) ? brut.accordePar : null,
    // L'ABSENCE VAUT « JE PUBLIE », à l'inverse de `actif`.
    //
    // Les deux défauts vont dans des directions opposées, et c'est délibéré :
    // chacun préserve ce qui existait avant lui. Aucun aval n'a jamais été
    // accordé par défaut, donc l'absence vaut refus. Le total, lui, a toujours
    // été publié — c'est le contrat « détail privé, total public ». Un nœud
    // écrit avant ce champ n'en porte pas : le lire comme « ne publie pas »
    // effacerait en silence le seul repère dont l'autre dispose.
    publieLeTotal: brut.publieLeTotal !== false
  };
}

/** Les trois postures de partage, du plus fermé au plus ouvert */
export const POSTURES = Object.freeze(['rien', 'total', 'detail']);

/**
 * Ce que je partage, en un mot
 *
 * Deux drapeaux indépendants en base — `actif` ouvre le détail, `publieLeTotal`
 * ouvre le chiffre — mais une seule échelle à l'écran, parce qu'ouvrir le
 * détail sans publier le total n'a aucun sens : le détail contient le total.
 *
 * ## Une base incohérente se lit vers le HAUT
 *
 * `actif` vrai et `publieLeTotal` faux est atteignable : deux appareils, deux
 * écritures. La posture rendue est alors **`detail`**, la plus ouverte des deux.
 *
 * C'est l'inverse de ce qu'on ferait pour un solde, et c'est l'inverse de ce que
 * j'avais d'abord écrit. Pour un réglage de confidentialité, le défaut sûr n'est
 * pas le plus rassurant : il est le plus fidèle à ce que l'autre peut REELLEMENT
 * lire. Tant que `aval/{qui}/actif` vaut vrai, la règle serveur laisse passer la
 * lecture du détail — afficher « Rien » annoncerait une fermeture qui n'existe
 * pas, ce qui est exactement le mensonge le plus coûteux ici.
 *
 * ## Elle ne dépend pas des totaux déjà publiés
 *
 * La posture est un RÉGLAGE, pas un état des lieux. La déduire de la présence
 * d'un total en base la rendrait instable : « rien publié » se confondrait avec
 * « rien à publier », et la première dépense privée du mois ferait basculer le
 * réglage toute seule.
 *
 * @param {*} aval - Nœud `/aval/{emplacement}` tel que lu
 * @returns {'rien'|'total'|'detail'}
 */
export function posturePartage(aval) {
  const normalise = normaliserAval(aval);
  if (normalise.actif) return 'detail';
  return normalise.publieLeTotal ? 'total' : 'rien';
}

/**
 * Ce qu'une posture écrit
 *
 * Les deux drapeaux sont posés ENSEMBLE, jamais l'un sans l'autre : c'est ce
 * qui empêche l'échelle de produire les combinaisons qu'elle ne sait pas
 * afficher.
 *
 * `accordePar` vaut toujours l'emplacement propriétaire — la règle serveur
 * l'exige, et c'est ce qui interdit de s'accorder l'accès aux données d'autrui.
 *
 * @param {string} posture
 * @param {string} emplacement - Le propriétaire, seul auteur possible
 * @param {number} [maintenant] - Injectable pour les bancs d'essai
 * @returns {{aval: Object, publieLeTotal: boolean}|null} Null si l'un des deux est inconnu
 */
export function ecrituresDeLaPosture(posture, emplacement, maintenant = Date.now()) {
  if (!POSTURES.includes(posture)) return null;
  if (!EMPLACEMENTS.includes(emplacement)) return null;

  const publieLeTotal = posture !== 'rien';

  return {
    aval: {
      actif: posture === 'detail',
      publieLeTotal,
      accordeLe: maintenant,
      accordePar: emplacement
    },
    publieLeTotal
  };
}

/**
 * Remet une dépense privée dans une forme exploitable
 *
 * Un montant inexploitable écarte l'entrée plutôt que de la compter pour zéro :
 * une dépense à zéro gonflerait le nombre publié à l'autre sans rien ajouter au
 * total, et le compte annoncé cesserait de correspondre.
 *
 * @param {*} brut
 * @param {string} [id] - Clé Firebase, reportée sur l'entrée
 * @returns {{id: string, montant: number, description: string, category: string, date: string|null, deleted: boolean}|null}
 */
export function normaliserDepensePrivee(brut, id = '') {
  if (!brut || typeof brut !== 'object') return null;

  const montant = parseMontant(brut.montant);
  if (!Number.isFinite(montant) || montant < 0 || montant > MONTANT_MAX) return null;

  const texte = (valeur, longueur) =>
    (typeof valeur === 'string' ? valeur.trim().slice(0, longueur) : '');

  return {
    id: typeof brut.id === 'string' && brut.id ? brut.id : String(id || ''),
    montant,
    description: texte(brut.description, 200),
    category: texte(brut.category, 100),
    date: typeof brut.date === 'string' && FORMAT_DATE.test(brut.date.trim())
      ? brut.date.trim()
      : null,
    deleted: brut.deleted === true
  };
}

/**
 * Normalise un mois de dépenses privées, tel que Firebase le rend
 *
 * @param {*} noeud - Nœud `depenses` d'une période
 * @returns {Array<Object>} Les plus récentes d'abord
 */
export function normaliserDepensesPrivees(noeud) {
  if (!noeud || typeof noeud !== 'object') return [];

  return Object.entries(noeud)
    .map(([cle, valeur]) => normaliserDepensePrivee(valeur, cle))
    .filter(Boolean)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/**
 * Les dépenses qui comptent — celles qui ne sont pas à la corbeille
 *
 * @param {Array<Object>} depenses
 * @returns {Array<Object>}
 */
export function depensesActives(depenses) {
  return (Array.isArray(depenses) ? depenses : []).filter(d => d && !d.deleted);
}

/**
 * Ce qui franchit le mur : le total et le compte, jamais le détail
 *
 * Le compte accompagne le montant parce qu'il change ce qu'on en comprend :
 * « 340 € en 2 dépenses » et « 340 € en 27 dépenses » ne décrivent pas le même
 * mois, et aucun des deux ne dit ce qui a été acheté.
 *
 * @param {Array<Object>} depenses
 * @returns {{montant: number, nombre: number}}
 */
export function resumePublie(depenses) {
  const actives = depensesActives(depenses);
  return {
    montant: actives.reduce(
      (somme, d) => somme + (Number.isFinite(d.montant) ? d.montant : 0),
      0
    ),
    nombre: actives.length
  };
}

/**
 * Le résumé publié par l'autre, remis en forme
 *
 * Un nœud absent n'est pas « zéro dépense privée » : c'est « on n'en sait
 * rien », et les deux se lisent très différemment. `publie` distingue les deux
 * pour que l'écran puisse se taire au lieu d'affirmer.
 *
 * @param {*} brut - Nœud `/totauxPrives/{emplacement}/{periode}`
 * @returns {{publie: boolean, montant: number, nombre: number}}
 */
export function resumeLu(brut) {
  if (!brut || typeof brut !== 'object' || !Number.isFinite(brut.montant)) {
    return { publie: false, montant: 0, nombre: 0 };
  }
  return {
    publie: true,
    montant: brut.montant,
    nombre: Number.isFinite(brut.nombre) ? brut.nombre : 0
  };
}

/**
 * Cette dépense privée est-elle écrivable ?
 *
 * Rejoue côté client ce que les règles appliquent côté serveur, pour que le
 * refus s'explique avant l'écriture.
 *
 * **Aucun aval n'est demandé ici, et c'est le point.** Chacun a le droit
 * d'avoir des dépenses à soi sans avoir à la mendier ; ce qui se demande, c'est
 * l'accès au détail de l'autre. Une version antérieure exigeait l'accord de la
 * conjointe pour écrire ses propres dépenses privées : elle inversait le sujet
 * et rendait la fonction inutilisable tant que personne n'avait rien accordé.
 *
 * @param {*} montantSaisi
 * @returns {{valide: boolean, montant?: number, erreur?: string}}
 */
export function depensePriveeEcrivable(montantSaisi) {
  const montant = parseMontant(montantSaisi);
  if (!Number.isFinite(montant) || montant <= 0) {
    return { valide: false, erreur: 'Montant requis' };
  }
  if (montant > MONTANT_MAX) {
    return { valide: false, erreur: 'Montant trop élevé' };
  }

  return { valide: true, montant };
}
