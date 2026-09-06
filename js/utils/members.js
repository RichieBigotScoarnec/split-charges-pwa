/**
 * FairSplit — Prénoms des membres du foyer
 *
 * Les données du foyer sont un enregistrement unique, à emplacements fixes :
 * `vous` et `conjointe`. Les deux comptes lisent le même nœud, mais l'écran
 * affichait « Votre salaire » — étiquette juste pour l'un, fausse pour l'autre.
 * La même ambiguïté touchait « Conjointe vous doit » et « Vous → Conjointe ».
 *
 * Ce module sépare l'identité du libellé. `vous` et `conjointe` restent des
 * clés de stockage — les renommer imposerait une migration de toutes les
 * périodes, de toutes les charges et de tous les remboursements, pour un gain
 * nul : ce sont des identifiants, pas des noms. Seul l'affichage change.
 *
 * Sans prénoms renseignés, les libellés d'origine sont conservés : les données
 * antérieures restent lisibles telles quelles.
 */

/** Libellés par défaut, employés tant qu'aucun prénom n'est renseigné */
const DEFAUTS = { vous: 'Vous', conjointe: 'Conjointe' };

/** Longueur maximale d'un prénom */
export const MAX_LONGUEUR_PRENOM = 30;

/**
 * Normalise le couple de prénoms venant de la base
 *
 * @param {*} raw - Valeur brute, éventuellement absente ou mal typée
 * @returns {{vous: string, conjointe: string}} Prénoms exploitables
 */
export function normalizeMembers(raw) {
  const propre = (valeur, defaut) => {
    if (typeof valeur !== 'string') return defaut;
    const net = valeur.trim().slice(0, MAX_LONGUEUR_PRENOM);
    return net || defaut;
  };

  if (!raw || typeof raw !== 'object') return { ...DEFAUTS };

  return {
    vous: propre(raw.vous, DEFAUTS.vous),
    conjointe: propre(raw.conjointe, DEFAUTS.conjointe)
  };
}

/**
 * Un prénom a-t-il été choisi pour cet emplacement ?
 *
 * Sans prénom, les libellés d'origine restent les plus naturels : « Votre
 * salaire » se lit mieux que « Salaire Vous ».
 *
 * @param {string} cle - 'vous' | 'conjointe'
 * @param {Object} members - Prénoms bruts ou normalisés
 * @returns {boolean} true si un prénom distinct du défaut est renseigné
 */
export function hasCustomName(cle, members) {
  return normalizeMembers(members)[cle] !== DEFAUTS[cle];
}

/**
 * Libellé d'affichage d'un emplacement
 *
 * @param {string} cle - 'vous' | 'conjointe' | 'partage' | 'joint'
 * @param {Object} members - Prénoms normalisés
 * @returns {string} Libellé lisible
 */
export function memberLabel(cle, members) {
  const noms = normalizeMembers(members);

  switch (cle) {
    case 'vous': return noms.vous;
    case 'conjointe': return noms.conjointe;
    case 'partage':
    case 'joint': return 'Partagé';
    default: return cle || 'Inconnu';
  }
}

/**
 * Phrase décrivant le solde du mois, encadrant le montant
 *
 * « Conjointe vous doit » désigne un « vous » qui dépend du compte connecté :
 * la phrase disait le contraire à l'une des deux personnes. Avec des prénoms,
 * elle dit la même chose aux deux.
 *
 * La conjugaison suit le sujet. « Vous doit » serait agrammatical, et
 * « Conjointe doit à Vous » plus lourd que « Conjointe vous doit » : sans
 * prénom choisi, les formulations d'origine sont conservées telles quelles.
 *
 * @param {number} balance - Solde du mois ; positif, la conjointe est débitrice
 * @param {Object} members - Prénoms bruts ou normalisés
 * @returns {{prefixe: string, suffixe: string, texte: string, debiteur: string|null, crediteur: string|null}}
 */
export function describeBalance(balance, members) {
  const noms = normalizeMembers(members);
  const nomme = hasCustomName('vous', members) || hasCustomName('conjointe', members);

  if (balance === 0) {
    return {
      prefixe: 'Comptes équilibrés', suffixe: '', texte: 'Comptes équilibrés',
      debiteur: null, crediteur: null, sens: ''
    };
  }

  const conjointeDoit = balance > 0;
  const debiteur = conjointeDoit ? noms.conjointe : noms.vous;
  const crediteur = conjointeDoit ? noms.vous : noms.conjointe;

  let prefixe, suffixe;

  if (nomme) {
    prefixe = `${debiteur} doit`;
    suffixe = `à ${crediteur}`;
  } else if (conjointeDoit) {
    prefixe = 'Conjointe vous doit';
    suffixe = '';
  } else {
    prefixe = 'Vous devez';
    suffixe = 'à Conjointe';
  }

  return {
    prefixe,
    suffixe,
    texte: suffixe ? `${prefixe} ${suffixe}` : prefixe,
    debiteur,
    crediteur,

    // LE MÊME SENS, DIT SANS LE VERBE « DEVOIR »
    //
    // Le bilan ouvre désormais sur ce que le foyer a dépensé ENSEMBLE, et
    // range l'écart en dessous : « À rééquilibrer : 408,37 € — Claire vers
    // vous ». « Doit » reste le mot juste au moment de régler, et la barre
    // collante le garde ; il n'a pas à être la première phrase que lit, chaque
    // jour, celui des deux qui est débiteur.
    //
    // Cette seconde formulation vit ICI et non dans le rendu : c'est la
    // fabrique unique du sens du solde, et un état ajouté demain doit traverser
    // les deux surfaces ou aucune. La rédiger dans `summary.js` aurait fait un
    // second registre de « qui doit à qui » sur le même écran.
    sens: `${debiteur} vers ${crediteur}`
  };
}

/**
 * Libellé d'un sens de remboursement
 *
 * @param {string} direction - Valeur de REIMBURSEMENT_DIRECTIONS
 * @param {Object} members - Prénoms normalisés
 * @param {string} versPartenaire - Valeur signifiant « vous → conjointe »
 * @returns {string} Libellé fléché
 */
export function directionLabel(direction, members, versPartenaire) {
  const noms = normalizeMembers(members);

  return direction === versPartenaire
    ? `${noms.vous} → ${noms.conjointe}`
    : `${noms.conjointe} → ${noms.vous}`;
}

/**
 * Ramène une valeur d'emplacement à l'une des deux clés de stockage
 *
 * Trois modules doivent proposer « celui qui tient le téléphone » comme payeur.
 * Recopier le test dans chacun les ferait diverger le jour où un troisième
 * emplacement apparaîtrait ; et une valeur inattendue — état non encore
 * renseigné, lecture ratée — doit retomber sur le comportement d'avant plutôt
 * que d'atteindre un `<select>` qui l'ignorera en silence.
 *
 * @param {*} valeur - Emplacement supposé
 * @returns {string} 'vous' ou 'conjointe'
 */
export function normaliserEmplacement(valeur) {
  return valeur === 'conjointe' ? 'conjointe' : 'vous';
}

/**
 * Emplacement du foyer qu'occupe un compte
 *
 * L'application connaissait l'adresse du compte connecté et ne s'en servait
 * jamais pour cela : la saisie rapide proposait `vous` en dur, quel que soit le
 * téléphone. Sur celui de la conjointe, chaque dépense expédiée en trois gestes
 * était donc attribuée à l'autre.
 *
 * La comparaison ignore la casse et les espaces : une adresse saisie
 * « Bigot.Richard@gmail.com » désigne le même compte, et la table serait sinon
 * silencieusement inopérante.
 *
 * Le repli est `vous` — le comportement d'avant. Un compte absent de la table
 * garde donc une application utilisable, simplement sans cette amélioration.
 *
 * @param {string|null} email - Adresse du compte authentifié
 * @param {Object} [table] - Table `adresse → emplacement`
 * @returns {string} 'vous' ou 'conjointe'
 */
export function emplacementDuCompte(email, table) {
  if (typeof email !== 'string' || !table || typeof table !== 'object') return 'vous';

  const recherchee = email.trim().toLowerCase();
  if (!recherchee) return 'vous';

  for (const [adresse, emplacement] of Object.entries(table)) {
    if (typeof adresse !== 'string') continue;
    if (adresse.trim().toLowerCase() !== recherchee) continue;
    return emplacement === 'conjointe' ? 'conjointe' : 'vous';
  }

  return 'vous';
}

/**
 * Valide un prénom saisi
 *
 * Un prénom vide est accepté : il rétablit le libellé par défaut plutôt que
 * d'imposer une saisie.
 *
 * @param {string} valeur - Prénom saisi
 * @returns {{valid: boolean, error?: string}} Validité et motif du refus
 */
export function validateMemberName(valeur) {
  if (typeof valeur !== 'string') {
    return { valid: false, error: 'Prénom invalide' };
  }

  if (valeur.trim().length > MAX_LONGUEUR_PRENOM) {
    return { valid: false, error: `Un prénom ne peut pas dépasser ${MAX_LONGUEUR_PRENOM} caractères` };
  }

  return { valid: true };
}
