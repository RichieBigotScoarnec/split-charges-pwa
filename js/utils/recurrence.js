/**
 * FairSplit — Reconduction des charges récurrentes
 *
 * Les charges fixes portent depuis toujours un indicateur `recurring`, activé
 * par défaut, et le code savait déjà les recopier d'un mois sur l'autre. Mais
 * rien ne déclenchait jamais cette copie : la bannière censée la proposer
 * n'était affichée par aucun chemin de code, ses boutons appelaient des
 * fonctions inexistantes, et le bouton de reconduction manuelle n'était pas
 * dans le HTML. Chaque mois, il fallait donc ressaisir le loyer.
 *
 * Décider ce qui doit être reconduit est une question de données pures : ce
 * module la traite sans base ni DOM, pour qu'elle soit vérifiable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEPUIS LE LOT P1b : DEUX POCHES, DEUX DÉCISIONS, UNE SEULE RÈGLE
 *
 * Le nœud reçu est FUSIONNÉ : ses collections portent le commun et les poches
 * personnelles qu'on a le droit de lire. Trois conséquences, et aucune ne se
 * déduit des deux autres.
 *
 * 1. **« Un mois déjà garni n'est pas un mois neuf » doit se compter par
 *    poche.** Compté sur le nœud fusionné, un seul abonnement personnel dans
 *    le mois cible bloquerait la reconduction du LOYER — et rien ne le dirait.
 * 2. **Une charge personnelle se reconduit dans la poche de SON
 *    propriétaire**, jamais dans le commun : le chemin se dérive d'elle, comme
 *    partout depuis P1b.
 * 3. **Jamais celle de l'autre.** On n'a aucun droit d'écriture chez lui, et
 *    il reconduira la sienne à sa prochaine ouverture. Ses charges ne sont donc
 *    pas « écartées » : elles ne sont pas de notre ressort.
 *
 * Les deux décisions sont INDÉPENDANTES — deux mois sources peuvent différer,
 * un foyer sans charge fixe commune peut avoir un abonnement personnel
 * mensuel — mais elles passent par la MÊME fabrique, `planDeLaPoche` : la règle
 * de décision est une seule grandeur, et deux rédactions divergeraient au
 * premier correctif.
 *
 * ## L'empreinte, elle aussi, est par poche
 *
 * `periods/$periode/reconductedFrom` marque le mois COMMUN. Elle ne peut pas
 * servir pour le personnel : celui des deux qui ouvre l'application le premier
 * la réserve, et la poche de l'autre ne serait alors jamais reconduite. Chaque
 * poche porte donc la sienne, sous
 * `personnel/{qui}/periods/$periode/reconductedFrom`, écrite par son seul
 * propriétaire. Elle est passée à ce module, qui ne lit pas la base.
 */

import { proprietaireDuSolo } from './perimetre.js';

/** Format d'une clé de période : AAAA-MM */
const PERIOD_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Ne retient d'une collection que les charges d'une poche
 *
 * @param {*} node - Nœud `fixedCharges` ou `variableCharges`, fusionné
 * @param {string|null} poche - `null` pour le commun, sinon un emplacement
 * @returns {Object} Un nœud de même forme, réduit
 */
function deLaPoche(node, poche) {
  if (!node || typeof node !== 'object') return {};

  const retenues = {};
  for (const [cle, charge] of Object.entries(node)) {
    if (!charge || typeof charge !== 'object') continue;
    if (proprietaireDuSolo(charge) !== poche) continue;
    retenues[cle] = charge;
  }
  return retenues;
}

/**
 * Le plan d'UNE poche — la décision, appliquée à un périmètre
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` fusionné
 * @param {string} params.target - Période à remplir
 * @param {*} params.empreinte - Marque de reconduction de CETTE poche
 * @param {string|null} params.poche - `null` pour le commun, sinon un emplacement
 * @returns {{source: string, charges: Array<Object>, variables: Array<Object>}|null}
 */
function planDeLaPoche({ periods, target, empreinte, poche }) {
  // Déjà reconduit : l'empreinte fait foi, même si les charges ont depuis été
  // supprimées.
  if (empreinte) return null;

  const cible = periods[target] || {};

  // Un mois déjà garni n'est pas un mois neuf — compté DANS CETTE POCHE.
  if (countActiveFixed(deLaPoche(cible.fixedCharges, poche)) > 0) return null;

  const source = findSource(periods, target, poche);
  if (!source) return null;

  const charges = recurringCharges(deLaPoche(periods[source].fixedCharges, poche));
  const variables = variablesReconductibles(
    deLaPoche(periods[source].variableCharges, poche)
  );

  return (charges.length > 0 || variables.length > 0)
    ? { source, charges, variables }
    : null;
}

/**
 * Détermine les charges à reconduire dans une période
 *
 * La reconduction ne s'exécute qu'une fois par mois cible et par poche, et son
 * empreinte est écrite avec les charges : sans cela, supprimer une charge
 * reconduite la ferait réapparaître à chaque ouverture du mois.
 *
 * Elle ne remonte jamais dans le passé. Ouvrir un mois ancien et vide est une
 * consultation, pas une reprise d'activité — y déverser les charges du mois
 * d'avant réécrirait l'histoire.
 *
 * @param {Object} params - Contexte de décision
 * @param {string} params.target - Période à remplir (AAAA-MM)
 * @param {string} params.currentMonth - Mois calendaire courant (AAAA-MM)
 * @param {Object} params.periods - Nœud `periods` fusionné, tel que `lirePeriodes` le rend
 * @param {string} [params.moi] - Emplacement du compte connecté
 * @param {*} [params.empreintePersonnelle] - Marque de reconduction de MA poche
 * @returns {{commun: Object|null, personnel: Object|null}|null}
 *   Les deux plans, ou null s'il n'y a rien à faire ni dans l'une ni dans
 *   l'autre. Chaque plan porte son propre mois source.
 */
export function planRecurrence({
  target, currentMonth, periods, moi, empreintePersonnelle
}) {
  if (!PERIOD_KEY.test(target || '')) return null;
  if (!periods || typeof periods !== 'object') return null;

  // Jamais vers le passé.
  if (target < currentMonth) return null;

  const cible = periods[target] || {};

  const commun = planDeLaPoche({
    periods, target, empreinte: cible.reconductedFrom, poche: null
  });

  // Sans emplacement connu, on ne sait pas de qui serait la charge : ne rien
  // reconduire de personnel plutôt que de deviner une poche.
  const personnel = moi
    ? planDeLaPoche({ periods, target, empreinte: empreintePersonnelle, poche: moi })
    : null;

  return (commun || personnel) ? { commun, personnel } : null;
}

/**
 * Charges variables actives et **explicitement** marquées à reconduire
 *
 * L'inverse exact de `recurringCharges` sur un point décisif : ici, l'absence
 * de l'indicateur vaut **non**. Une charge fixe sans `recurring` est récurrente
 * — c'est le défaut de son formulaire, et le loyer d'avant l'indicateur doit
 * continuer d'être reconduit. Appliquer la même règle aux variables recopierait
 * d'un coup tout ce que le foyer a jamais saisi : chaque course, chaque
 * restaurant, chaque essence, tous les mois. Il faut donc l'avoir demandé.
 *
 * @param {*} node - Nœud `variableCharges` d'une période
 * @returns {Array<Object>}
 */
function variablesReconductibles(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.values(node)
    .filter(charge => charge && typeof charge === 'object'
      && charge.deleted !== true && charge.recurring === true);
}

/**
 * Cherche le mois antérieur le plus récent portant des charges reconductibles
 *
 * Le mois précédent immédiat n'est pas toujours le bon : un mois sauté ne doit
 * pas interrompre la reconduction.
 *
 * La recherche est faite POCHE PAR POCHE, et c'est ce qui rend les deux
 * décisions indépendantes : un foyer sans aucune charge fixe commune peut
 * avoir un abonnement personnel mensuel, et un mois source commun peut ne rien
 * porter de personnel.
 *
 * @param {Object} periods - Nœud `periods` fusionné
 * @param {string} target - Période cible
 * @param {string|null} poche - `null` pour le commun, sinon un emplacement
 * @returns {string|null} Clé de la période source
 */
function findSource(periods, target, poche) {
  const anterieures = Object.keys(periods)
    .filter(key => PERIOD_KEY.test(key) && key < target)
    .sort()
    .reverse();

  for (const key of anterieures) {
    const mois = periods[key] || {};
    // Un foyer peut n'avoir aucune charge fixe et une essence mensuelle : ne
    // regarder que les fixes lui refuserait la reconduction sans rien dire.
    if (recurringCharges(deLaPoche(mois.fixedCharges, poche)).length > 0) return key;
    if (variablesReconductibles(
      deLaPoche(mois.variableCharges, poche)
    ).length > 0) return key;
  }
  return null;
}

/**
 * Charges fixes actives et marquées récurrentes
 *
 * `recurring` absent vaut récurrent : c'est le défaut du formulaire, et les
 * charges créées avant l'indicateur doivent suivre la même règle.
 *
 * @param {*} node - Nœud fixedCharges d'une période
 * @returns {Array<Object>} Les charges à reconduire
 */
function recurringCharges(node) {
  if (!node || typeof node !== 'object') return [];

  return Object.values(node).filter(
    charge => charge && !charge.deleted && charge.recurring !== false
  );
}

/**
 * Compte les charges fixes encore actives d'une période
 * @param {*} node - Nœud fixedCharges
 * @returns {number} Nombre de charges non supprimées
 */
function countActiveFixed(node) {
  if (!node || typeof node !== 'object') return 0;
  return Object.values(node).filter(charge => charge && !charge.deleted).length;
}
