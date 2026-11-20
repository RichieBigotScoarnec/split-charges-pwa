/**
 * FairSplit — L'application se souvient de ce que vous rangez où
 *
 * Les concurrents lisent le compte bancaire : chaque opération arrive avec son
 * libellé, et la catégorie se devine du commerçant. FairSplit demande un geste
 * par dépense — description, montant, catégorie, payeur. Ce geste est le vrai
 * coût d'usage d'une application sans lien bancaire, et le risque qui compte :
 * un rapport de plus ne sert à rien si le foyer cesse de saisir en novembre.
 *
 * Ce module réduit le geste d'un cran. Il n'invente rien et n'interroge aucun
 * service : il relit ce que le foyer a lui-même saisi, et propose la catégorie
 * qu'il a lui-même choisie les fois précédentes.
 *
 * Trois règles, du même esprit que la veille :
 *
 *   1. **Rien qui ne vienne de vous.** La proposition est une observation sur
 *      vos saisies passées, jamais une devinette sur le nom du commerce.
 *   2. **Une habitude, pas un accident.** Une seule saisie ne prouve rien —
 *      elle a pu être rangée de travers. Il en faut deux qui s'accordent.
 *   3. **Elle dit sur quoi elle se fonde.** Le nombre de saisies qui la
 *      soutiennent accompagne la proposition, pour que l'écran puisse le dire.
 *
 * Ce module ne fait que du calcul : aucune base, aucun DOM, aucun réseau.
 */

import { plier } from './recherche-texte.js';
import { estSolo } from './perimetre.js';

/** Une clé de mois */
const CLE_MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Les deux collections de charges d'une période */
const COLLECTIONS = ['fixedCharges', 'variableCharges'];

/**
 * Combien de saisies concordantes font une habitude
 *
 * Une seule ne prouve rien : elle a pu être rangée de travers, et la reproposer
 * perpétuerait l'erreur au lieu de la corriger. Deux qui s'accordent, c'est un
 * choix.
 */
const SAISIES_POUR_UNE_HABITUDE = 2;

/**
 * Longueur minimale d'une saisie pour chercher par début de mot
 *
 * En dessous, tout ressemble à tout : « c » désignerait « Courses », « Café »
 * et « Cinéma » à la fois, et la proposition serait tirée au sort.
 */
const AMORCE_MINIMALE = 3;

/**
 * Ce que le foyer a rangé où, d'après tout son historique
 *
 * Les dépenses solo sont écartées : la catégorie qu'une personne donne à ses
 * propres dépenses n'a pas à décider de celles du foyer.
 *
 * **Un objet simple, et non une `Map`.** `getState` rend `{ ...value }` pour
 * tout objet : étaler une `Map` donne un objet VIDE, et la mémoire était
 * détruite à la lecture sans qu'aucune erreur ne le dise. L'état de cette
 * application porte des données simples — c'est une contrainte, pas un goût.
 *
 * @param {Object} periods - Nœud `periods` complet
 * @returns {Object<string, {categorie: string, saisies: number, libelle: string}>}
 */
export function apprendre(periods) {
  const memoire = {};
  if (!periods || typeof periods !== 'object') return memoire;

  // Chaque libellé plié, et le compte de ses catégories.
  const comptes = new Map();

  for (const [cle, periode] of Object.entries(periods)) {
    if (!CLE_MOIS.test(cle) || !periode || typeof periode !== 'object') continue;

    for (const collection of COLLECTIONS) {
      const noeud = periode[collection];
      if (!noeud || typeof noeud !== 'object') continue;

      for (const charge of Object.values(noeud)) {
        if (!charge || charge.deleted || estSolo(charge)) continue;

        const libelle = typeof charge.description === 'string' ? charge.description.trim() : '';
        const categorie = typeof charge.category === 'string' ? charge.category.trim() : '';
        if (!libelle || !categorie) continue;

        const cleLibelle = plier(libelle);
        if (!cleLibelle) continue;

        const suivi = comptes.get(cleLibelle) || { parCategorie: new Map(), libelle };
        suivi.parCategorie.set(categorie, (suivi.parCategorie.get(categorie) || 0) + 1);
        // Le libellé le plus récemment vu sert d'orthographe de référence.
        suivi.libelle = libelle;
        comptes.set(cleLibelle, suivi);
      }
    }
  }

  for (const [cleLibelle, suivi] of comptes) {
    let gagnante = null;
    let total = 0;

    for (const [categorie, saisies] of suivi.parCategorie) {
      total += saisies;
      if (!gagnante || saisies > gagnante.saisies) gagnante = { categorie, saisies };
    }

    if (!gagnante || gagnante.saisies < SAISIES_POUR_UNE_HABITUDE) continue;

    // Une majorité STRICTE. À égalité — trois fois « Courses », trois fois
    // « Maison » — il n'y a pas d'habitude, il y a deux usages du même mot, et
    // trancher au hasard reviendrait à ranger de travers une fois sur deux.
    if (gagnante.saisies * 2 <= total) continue;

    memoire[cleLibelle] = {
      categorie: gagnante.categorie,
      saisies: gagnante.saisies,
      libelle: suivi.libelle
    };
  }

  return memoire;
}

/**
 * La catégorie que ce libellé appelle, s'il en appelle une
 *
 * Deux façons de reconnaître, dans cet ordre :
 *
 *   1. **Le libellé exact**, accents et casse mis de côté — « intermarche »
 *      retrouve « Intermarché », comme la recherche.
 *   2. **Le début du libellé**, une fois trois caractères tapés : « Interm »
 *      pendant qu'on écrit. La proposition n'est rendue que si TOUS les
 *      libellés qui commencent ainsi s'accordent sur la même catégorie —
 *      sinon on choisirait à la place de l'utilisateur, sans le savoir.
 *
 * @param {string} saisie - Ce qui est écrit dans le champ
 * @param {Object} memoire - Rendue par `apprendre`
 * @returns {{categorie: string, saisies: number, exact: boolean}|null}
 */
export function categorieProposee(saisie, memoire) {
  if (!memoire || typeof memoire !== 'object') return null;

  const cle = plier(typeof saisie === 'string' ? saisie.trim() : '');
  if (!cle) return null;

  const exact = Object.prototype.hasOwnProperty.call(memoire, cle) ? memoire[cle] : null;
  if (exact) return { categorie: exact.categorie, saisies: exact.saisies, exact: true };

  if (cle.length < AMORCE_MINIMALE) return null;

  let categorie = null;
  let saisies = 0;

  for (const [connu, entree] of Object.entries(memoire)) {
    if (!connu.startsWith(cle)) continue;

    // Deux libellés qui commencent pareil et se rangent ailleurs : on se tait.
    if (categorie !== null && entree.categorie !== categorie) return null;

    categorie = entree.categorie;
    saisies += entree.saisies;
  }

  return categorie === null ? null : { categorie, saisies, exact: false };
}
