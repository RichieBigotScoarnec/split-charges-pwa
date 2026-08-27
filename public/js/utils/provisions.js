/**
 * FairSplit — Ce qu'il faut mettre de côté ce mois-ci
 *
 * Une charge annuelle n'appartient pas au mois où elle tombe. La taxe foncière
 * de 1 200 € payée en octobre appartient aux douze mois qui la précèdent — mais
 * l'application la faisait porter par octobre seul, et le bilan de ce mois-là
 * cessait de vouloir dire quelque chose.
 *
 * Les enveloppes savaient déjà accumuler : une cagnotte porte un objectif, une
 * date de fin, et le contenu réel de son pot. **Rien ne faisait la division.**
 * C'est tout ce que ce module ajoute — et c'est cette division qui transforme
 * une cagnotte en provision.
 *
 * ## Ce qui fait d'une enveloppe une provision
 *
 * Trois conditions, et le rang n'en fait pas partie :
 *
 *   - une **cagnotte** — une mensuelle se recharge, elle ne vise rien ;
 *   - un **objectif** — sans montant à atteindre, il n'y a rien à diviser ;
 *   - une **échéance** — sans date, il n'y a pas de quoi diviser.
 *
 * Le rang `provision` sert au rangement à l'écran, pas au calcul : une épargne
 * qui vise une date obéit à la même arithmétique, et lui refuser le calcul
 * parce qu'elle porte un autre nom n'aurait servi personne.
 *
 * ## Le rattrapage est voulu
 *
 * La part mensuelle se recalcule à chaque mois sur **ce qui manque encore**,
 * divisé par **ce qui reste de mois**. Prendre du retard fait donc monter la
 * part, au lieu de laisser filer un objectif qu'on n'atteindra pas. C'est la
 * réponse honnête : à trois mois de l'échéance avec la moitié du pot, il faut
 * bien mettre le double.
 */

import { NATURES } from './enveloppes.js';

/** Une clé de mois, ou une date dont on ne lit que le mois */
const CLE_MOIS = /^(\d{4})-(0[1-9]|1[0-2])/;

/**
 * Les composantes année/mois d'une clé, ou null
 *
 * @param {*} valeur
 * @returns {{annee: number, mois: number}|null}
 */
function lireLeMois(valeur) {
  if (typeof valeur !== 'string') return null;
  const trouve = valeur.match(CLE_MOIS);
  return trouve ? { annee: Number(trouve[1]), mois: Number(trouve[2]) } : null;
}

/**
 * Combien de mois il reste pour provisionner, échéance comprise
 *
 * Le mois de l'échéance compte : on peut encore mettre de côté en octobre pour
 * une taxe d'octobre. Zéro veut dire « l'échéance est passée » — un cas qui a
 * sa réponse propre, et qu'il ne faut surtout pas confondre avec « un mois ».
 *
 * Les clés sont comparées par leurs nombres plutôt que par des `Date` : une
 * date fabriquée ici introduirait un fuseau dont ce calcul n'a que faire.
 *
 * @param {string} echeance - AAAA-MM ou AAAA-MM-JJ
 * @param {string} moisCourant - AAAA-MM
 * @returns {number} 0 si l'échéance est passée, ou si une borne est illisible
 */
export function moisRestants(echeance, moisCourant) {
  const fin = lireLeMois(echeance);
  const maintenant = lireLeMois(moisCourant);
  if (!fin || !maintenant) return 0;

  const ecart = (fin.annee - maintenant.annee) * 12 + (fin.mois - maintenant.mois) + 1;
  return ecart > 0 ? ecart : 0;
}

/**
 * Ce qu'il faut mettre de côté ce mois-ci pour tenir l'échéance
 *
 * Le manque divisé par les mois restants. Deux cas particuliers, et ils ne se
 * ressemblent pas :
 *
 *   objectif atteint    → 0. Il n'y a plus rien à mettre.
 *   échéance dépassée   → tout ce qui manque, d'un coup. Rendre 0 laisserait
 *                         croire que c'est réglé ; rendre « par mois » n'aurait
 *                         aucun sens, puisqu'il ne reste aucun mois.
 *
 * @param {number} objectif
 * @param {number} dansLePot - Ce que la cagnotte contient déjà
 * @param {number} restants - Rendu par `moisRestants`
 * @returns {number} Jamais négatif
 */
export function provisionMensuelle(objectif, dansLePot, restants) {
  const cible = Number.isFinite(objectif) ? objectif : 0;
  const acquis = Number.isFinite(dansLePot) ? dansLePot : 0;
  const manque = cible - acquis;

  if (manque <= 0) return 0;
  if (!Number.isFinite(restants) || restants <= 0) return manque;

  return manque / restants;
}

/**
 * L'état complet d'une provision, prêt pour l'écran
 *
 * @param {Object} enveloppe - Enveloppe normalisée
 * @param {number} dansLePot - Contenu réel, rendu par `bilanCagnotte`
 * @param {string} moisCourant - AAAA-MM
 * @returns {{
 *   concernee: boolean, objectif: number, dansLePot: number, manque: number,
 *   restants: number, parMois: number, echeance: string|null,
 *   atteinte: boolean, enRetard: boolean
 * }}
 */
export function etatProvision(enveloppe, dansLePot, moisCourant) {
  const objectif = Number.isFinite(enveloppe?.budget) ? enveloppe.budget : 0;
  const echeance = typeof enveloppe?.fin === 'string' && CLE_MOIS.test(enveloppe.fin)
    ? enveloppe.fin
    : null;

  // Une mensuelle se recharge : elle ne vise aucune date, et lui appliquer ce
  // calcul annoncerait une provision là où il n'y a qu'un budget courant.
  const cagnotte = enveloppe?.nature !== NATURES.MENSUELLE;
  const concernee = Boolean(cagnotte && echeance && objectif > 0);

  const acquis = Number.isFinite(dansLePot) ? dansLePot : 0;
  const restants = concernee ? moisRestants(echeance, moisCourant) : 0;
  const manque = Math.max(0, objectif - acquis);

  return {
    concernee,
    objectif,
    dansLePot: acquis,
    manque,
    restants,
    parMois: concernee ? provisionMensuelle(objectif, acquis, restants) : 0,
    echeance,
    atteinte: concernee && manque === 0,
    // En retard, et pas encore atteinte : l'écran doit le dire autrement qu'une
    // provision qui suit son cours.
    enRetard: concernee && restants === 0 && manque > 0
  };
}

/**
 * Le total à mettre de côté ce mois-ci, et le détail qui le compose
 *
 * C'est le chiffre qui manquait au bilan : une seule somme, à côté de ce qui
 * reste à passer, qui dit ce que le mois doit encore encaisser pour que les
 * échéances de l'année ne surprennent personne.
 *
 * Les provisions atteintes sont écartées du détail : elles ne demandent plus
 * rien, et les laisser paraître ferait chercher un montant qui vaut zéro.
 *
 * @param {Array<{enveloppe: Object, dansLePot: number}>} entrees
 * @param {string} moisCourant - AAAA-MM
 * @returns {{total: number, lignes: Array<Object>, enRetard: number}}
 */
export function provisionsDuMois(entrees, moisCourant) {
  const liste = Array.isArray(entrees) ? entrees : [];

  const lignes = liste
    .map(entree => {
      if (!entree || !entree.enveloppe) return null;
      const etat = etatProvision(entree.enveloppe, entree.dansLePot, moisCourant);
      if (!etat.concernee || etat.atteinte) return null;
      return { ...etat, enveloppe: entree.enveloppe };
    })
    .filter(Boolean)
    // La plus proche d'abord : c'est celle qui presse. Une échéance dépassée
    // passe devant tout le reste.
    .sort((a, b) => {
      if (a.enRetard !== b.enRetard) return a.enRetard ? -1 : 1;
      return a.restants - b.restants;
    });

  return {
    total: lignes.reduce((somme, ligne) => somme + ligne.parMois, 0),
    lignes,
    enRetard: lignes.filter(ligne => ligne.enRetard).length
  };
}
