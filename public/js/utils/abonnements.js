/**
 * FairSplit — Déclarer fixe ce qui revenait déjà chaque mois
 *
 * `anticipation.js` sait dire « Netflix et la salle de sport reviennent chaque
 * mois sans être déclarés fixes ». Le constat était juste, et sans suite : il
 * fallait ouvrir la gestion des charges fixes et ressaisir chaque ligne dans un
 * formulaire à neuf champs. Un conseil qui coûte plus cher que de ne rien faire
 * n'est pas un conseil — et c'est ainsi qu'une application de budget se fait
 * abandonner en novembre.
 *
 * Ce module décide de ce qu'il faut écrire. Il ne touche ni à la base ni au
 * DOM : c'est ce qui permet de l'éprouver, et ce qui compte ici, parce que le
 * geste est le seul de l'application qui écrive plusieurs charges d'un coup.
 *
 * ## LE PIÈGE, ET TOUT EST LÀ
 *
 * L'abonnement est peut-être DÉJÀ SAISI dans le mois affiché, en charge
 * variable — c'est même le cas nominal, puisque le détecteur ne se déclenche
 * que sur des libellés que le foyer saisit à la main tous les mois. Écrire la
 * charge fixe sans rien d'autre le compterait alors DEUX FOIS : le mois
 * gagnerait 13,49 € que personne n'a dépensés, et le solde du couple avec.
 *
 * Le plan met donc les variables de même libellé à la corbeille dans la MÊME
 * écriture, et la charge fixe reprend leur montant exact. La dépense ne change
 * pas de valeur, elle change de collection.
 *
 * La propriété se vérifie, et elle l'est :
 *
 *     total du mois APRÈS  ===  total AVANT                (déjà saisie)
 *     total du mois APRÈS  ===  total AVANT + le montant   (pas encore saisie)
 */

import { estSolo } from './perimetre.js';

/** Les payeurs qu'une charge commune peut porter */
const PAYEURS = ['vous', 'conjointe', 'partage', 'both'];

/** Une clé de mois */
const CLE_MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Deux libellés désignent-ils la même charge ? */
const empreinte = (texte) => (typeof texte === 'string' ? texte.trim().toLowerCase() : '');

/**
 * Les charges communes actives d'une collection, indexées par libellé
 *
 * @param {Object} noeud - `fixedCharges` ou `variableCharges` d'une période
 * @returns {Map<string, Array<Object>>}
 */
function parLibelle(noeud) {
  const index = new Map();
  if (!noeud || typeof noeud !== 'object') return index;

  for (const [cle, charge] of Object.entries(noeud)) {
    if (!charge || charge.deleted || estSolo(charge)) continue;
    if (!Number.isFinite(charge.amount)) continue;

    const nom = empreinte(charge.description);
    if (!nom) continue;

    index.set(nom, [...(index.get(nom) || []), { ...charge, id: charge.id || cle }]);
  }
  return index;
}

/**
 * Ce qu'il faut écrire pour déclarer ces abonnements fixes
 *
 * ## Ce qui est retenu, et ce qui est écarté
 *
 * Une charge dont la fenêtre ne montre pas UN SEUL payeur est écartée, et
 * nommée. C'est la règle que l'import CSV a posée — **le payeur n'est jamais
 * deviné** — et elle vaut d'autant plus ici que ce geste écrit sans montrer de
 * formulaire : un prélèvement avancé tantôt par l'un tantôt par l'autre n'a pas
 * de payeur, il en a deux, et en choisir un ferait basculer le solde sur une
 * déduction que personne n'a validée.
 *
 * Une charge déjà présente parmi les charges FIXES du mois est écartée aussi :
 * le panneau la porte déjà, l'écrire une seconde fois la doublerait.
 *
 * @param {Object} params
 * @param {Array<Object>} params.charges - `propositionFixe.charges` de l'observation
 * @param {Object} params.periode - Nœud de la période affichée, tel qu'il est en base
 * @param {string} params.mois - AAAA-MM affiché
 * @param {number} params.instant - `Date.now()` de l'appelant : ce module ne lit pas l'horloge
 * @returns {{aEcrire: Array<Object>, aRetirer: Array<Object>, ecartees: Array<Object>, total: number}}
 */
export function planDeclarationFixe({ charges, periode, mois, instant }) {
  const vide = { aEcrire: [], aRetirer: [], ecartees: [], total: 0 };

  if (!Array.isArray(charges) || charges.length === 0) return vide;
  if (!CLE_MOIS.test(mois || '')) return vide;
  if (!Number.isFinite(instant) || instant <= 0) return vide;

  const noeud = periode && typeof periode === 'object' ? periode : {};
  const fixes = parLibelle(noeud.fixedCharges);
  const variables = parLibelle(noeud.variableCharges);

  const aEcrire = [];
  const aRetirer = [];
  const ecartees = [];
  let total = 0;

  for (const proposee of charges) {
    const libelle = typeof proposee?.libelle === 'string' ? proposee.libelle.trim() : '';
    const nom = empreinte(libelle);
    if (!libelle) continue;

    if (fixes.has(nom)) {
      ecartees.push({ libelle, motif: 'déjà déclarée fixe ce mois-ci' });
      continue;
    }

    if (!PAYEURS.includes(proposee?.payeur)) {
      ecartees.push({ libelle, motif: 'payeur variable d\'un mois sur l\'autre' });
      continue;
    }

    // Les occurrences DÉJÀ SAISIES ce mois-ci, s'il y en a. Leur somme fait le
    // montant de la charge fixe : c'est ce qui garde le total du mois intact.
    const dejaLa = variables.get(nom) || [];
    const montant = dejaLa.length > 0
      ? dejaLa.reduce((somme, charge) => somme + charge.amount, 0)
      : Number(proposee?.montant);

    if (!Number.isFinite(montant) || montant <= 0) {
      ecartees.push({ libelle, motif: 'montant inexploitable' });
      continue;
    }

    // La date et l'enveloppe de ce qui existe déjà sont conservées : la charge
    // change de collection, elle ne se réinvente pas. `previsionnel.js` lit
    // cette date pour dire ce qui reste à passer.
    const source = dejaLa[0] || null;

    aEcrire.push({
      description: libelle,
      amount: Math.round(montant * 100) / 100,
      category: typeof proposee?.categorie === 'string' && proposee.categorie
        ? proposee.categorie
        : (source?.category || 'Autre'),
      paidBy: proposee.payeur,
      perimetre: 'commun',
      destination: source?.destination || '',
      envelope: source?.envelope || '',
      date: source?.date || `${mois}-01`,
      // C'est tout l'objet du geste : la reconduction la portera désormais.
      recurring: true,
      splitOverride: source?.splitOverride || null,
      timestamp: instant,
      deleted: false
    });

    for (const charge of dejaLa) aRetirer.push({ id: charge.id, description: charge.description });
    total += montant;
  }

  return { aEcrire, aRetirer, ecartees, total: Math.round(total * 100) / 100 };
}

/**
 * La phrase qui demande confirmation
 *
 * Elle nomme ce qui sera créé ET ce que ça engage, comme celle de la cagnotte :
 * « mettre en charge fixe » n'a de sens que si l'on sait laquelle, pour combien,
 * et que ça reviendra tous les mois sans qu'on le redemande.
 *
 * @param {{aEcrire: Array<Object>, aRetirer: Array<Object>, total: number}} plan
 * @param {(montant: number) => string} formatMontant - `formatCurrency`, injecté
 * @returns {string}
 */
export function questionDeConfirmation(plan, formatMontant) {
  const noms = plan.aEcrire.map(charge => `« ${charge.description} »`).join(', ');
  const combien = plan.aEcrire.length === 1
    ? `Déclarer ${noms} en charge fixe ?`
    : `Déclarer ${plan.aEcrire.length} charges fixes : ${noms} ?`;

  const engage = `\n\n${formatMontant(plan.total)} par mois, reconduits automatiquement.`;

  // Le déplacement se dit : sans cela, voir une charge quitter la liste des
  // variables ressemblerait à une suppression.
  const deplace = plan.aRetirer.length > 0
    ? `\n\nLes ${plan.aRetirer.length === 1 ? 'saisie' : `${plan.aRetirer.length} saisies`} `
      + 'de ce mois passent en charges fixes : le total du mois ne change pas.'
    : '';

  return combien + engage + deplace;
}
