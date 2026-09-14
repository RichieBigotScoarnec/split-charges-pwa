/**
 * Le périmètre d'une charge : ce qui pèse sur le solde, et ce qui n'y pèse pas
 *
 * Jusqu'ici, **toute** charge était commune. `paidBy` dit qui a *avancé*
 * l'argent, jamais à qui la dépense *appartient* — un couple n'avait donc aucun
 * moyen d'écrire « ça, c'est moi seul ». Ses courses de midi, sa séance de
 * sport, un cadeau : tout entrait dans le solde, et il fallait choisir entre
 * fausser le décompte ou ne rien saisir.
 *
 * Le périmètre est cet axe manquant :
 *
 *   commun — la dépense se partage, elle déplace le solde. Le défaut.
 *   solo   — la dépense appartient à une personne, elle ne déplace rien.
 *
 * ## La règle qui protège l'existant
 *
 * Une charge **sans** champ `perimetre` est commune. Ce n'est pas une
 * commodité : c'est la seule lecture qui préserve l'argent déjà en base. Aucune
 * charge écrite avant ce jour ne porte ce champ, et les faire toutes basculer
 * en solo viderait le solde de plusieurs mois d'un coup, sans un mot. Le défaut
 * doit donc être celui qui ne change rien.
 *
 * ## Un solo dont on ne sait pas à qui il est
 *
 * `perimetre: 'solo'` avec `paidBy: 'partage'` n'a pas de sens — une dépense
 * solo est payée par la personne à qui elle appartient. Les règles refusent
 * cette combinaison à l'écriture, mais une donnée ancienne ou forgée peut
 * exister, et la lecture doit trancher.
 *
 * Elle reste **solo**. Le champ dit solo : le respecter ne peut qu'ôter de
 * l'argent du solde, jamais en inventer. La réintégrer au commun, à l'inverse,
 * ferait bouger le solde sur la foi d'un champ qu'on vient de juger illisible —
 * exactement le défaut qui avait fait compter comme « conjointe → vous » les
 * remboursements sans `direction`. Son propriétaire, lui, vaut `null`, et
 * l'écran le dira plutôt que de désigner quelqu'un au hasard.
 *
 * Ce fichier ne contient que des fonctions pures. Le filtre est posé à deux
 * endroits — au chargement (`variable-charges.js`, `fixed-charges.js`) et dans
 * `computeSummary`, l'entonnoir que traverse tout l'argent — et
 * `tests/utils/perimetre-transversal.test.js` rejoue une dépense solo dans
 * *chaque* fonction d'argent pour vérifier qu'aucune ne bouge.
 */

/** Les deux périmètres, et rien d'autre */
export const PERIMETRES = Object.freeze({
  COMMUN: 'commun',
  SOLO: 'solo'
});

/** Les payeurs qui désignent une personne — les seuls qui peuvent posséder un solo */
const PERSONNES = Object.freeze(['vous', 'conjointe']);

/**
 * Le périmètre d'une charge, toujours l'une des deux valeurs connues
 *
 * Tout ce qui n'est pas exactement `'solo'` est commun : une valeur absente,
 * vide, mal orthographiée ou d'un type inattendu retombe sur le défaut qui
 * préserve l'argent existant.
 *
 * @param {Object} charge
 * @returns {'commun'|'solo'}
 */
export function perimetreDeLaCharge(charge) {
  return charge && charge.perimetre === PERIMETRES.SOLO
    ? PERIMETRES.SOLO
    : PERIMETRES.COMMUN;
}

/**
 * Cette charge sort-elle du solde ?
 *
 * @param {Object} charge
 * @returns {boolean}
 */
export function estSolo(charge) {
  return perimetreDeLaCharge(charge) === PERIMETRES.SOLO;
}

/**
 * À qui appartient une dépense solo
 *
 * `null` quand la charge est commune, ou quand son payeur ne désigne personne
 * (`partage`, `both`, champ absent). L'appelant affiche alors « propriétaire
 * inconnu » au lieu d'attribuer la dépense à quelqu'un.
 *
 * @param {Object} charge
 * @returns {'vous'|'conjointe'|null}
 */
export function proprietaireDuSolo(charge) {
  if (!estSolo(charge)) return null;
  return PERSONNES.includes(charge?.paidBy) ? charge.paidBy : null;
}

/**
 * Les charges qui pèsent sur le solde
 *
 * La fonction que toute fonction d'argent doit traverser. Elle ne filtre pas
 * les charges supprimées : c'est un autre critère, et le mélanger ici rendrait
 * les deux invisibles l'un à l'autre.
 *
 * @param {Array<Object>} charges
 * @returns {Array<Object>}
 */
export function chargesCommunes(charges) {
  return (Array.isArray(charges) ? charges : []).filter(charge => !estSolo(charge));
}

/**
 * Les dépenses solo, éventuellement d'une seule personne
 *
 * @param {Array<Object>} charges
 * @param {'vous'|'conjointe'} [proprietaire] - Restreint à cette personne
 * @returns {Array<Object>}
 */
export function chargesSolo(charges, proprietaire) {
  const solos = (Array.isArray(charges) ? charges : []).filter(estSolo);
  if (proprietaire === undefined || proprietaire === null) return solos;
  return solos.filter(charge => proprietaireDuSolo(charge) === proprietaire);
}

/**
 * Le total d'une liste de charges, un montant abîmé valant zéro
 *
 * Même garde que `computeSummary` et `computeVirementsByDestination`, pour la
 * même raison : `somme + undefined` donne `NaN`, et `NaN` se propage jusqu'à
 * l'écran. C'est la quatrième fois que cette garde manque quelque part ; elle
 * est ici pour que le total des dépenses solo n'ait pas à la redécouvrir.
 *
 * @param {Array<Object>} charges
 * @returns {number}
 */
export function totalDesCharges(charges) {
  return (Array.isArray(charges) ? charges : []).reduce(
    (somme, charge) => somme + (Number.isFinite(charge?.amount) ? charge.amount : 0),
    0
  );
}

/**
 * Les deux totaux d'une liste, séparés
 *
 * Le pied de liste affichait un total unique. Y verser les dépenses solo le
 * mettrait en contradiction avec le bilan placé juste au-dessus — mesuré sur
 * le jeu d'essai : 1 817 € sous une liste que le bilan chiffre à 1 215 €. Et
 * les en retirer sans le dire donnerait une liste dont les lignes ne
 * s'additionnent pas jusqu'à son propre total.
 *
 * Les deux nombres, donc. Les charges supprimées sont écartées : elles ne
 * comptent nulle part ailleurs.
 *
 * @param {Array<Object>} charges
 * @returns {{commun: number, solo: number, total: number, nombreSolo: number}}
 */
export function totauxParPerimetre(charges) {
  const actives = (Array.isArray(charges) ? charges : []).filter(c => c && !c.deleted);
  const solos = chargesSolo(actives);
  const commun = totalDesCharges(chargesCommunes(actives));
  const solo = totalDesCharges(solos);
  return { commun, solo, total: commun + solo, nombreSolo: solos.length };
}

/**
 * Ce couple périmètre/payeur est-il écrivable ?
 *
 * Rejoue côté client le contrôle que les règles Firebase appliquent côté
 * serveur : une dépense solo doit désigner son propriétaire. Les deux existent
 * à dessein — le serveur pour que ce soit vrai, le client pour que le refus
 * s'explique avant l'écriture plutôt qu'après.
 *
 * @param {string} perimetre
 * @param {string} paidBy
 * @returns {{valide: boolean, erreur?: string}}
 */
export function perimetreEcrivable(perimetre, paidBy) {
  if (perimetre !== PERIMETRES.SOLO && perimetre !== PERIMETRES.COMMUN) {
    return { valide: false, erreur: 'Périmètre inconnu' };
  }
  if (perimetre === PERIMETRES.SOLO && !PERSONNES.includes(paidBy)) {
    return {
      valide: false,
      erreur: 'Une dépense perso doit être payée par une personne, pas partagée'
    };
  }
  return { valide: true };
}
