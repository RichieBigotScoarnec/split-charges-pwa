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
 */

/** Format d'une clé de période : AAAA-MM */
const PERIOD_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Détermine les charges à reconduire dans une période
 *
 * La reconduction ne s'exécute qu'une fois par mois cible, et son empreinte
 * est écrite avec les charges : sans cela, supprimer une charge reconduite la
 * ferait réapparaître à chaque ouverture du mois.
 *
 * Elle ne remonte jamais dans le passé. Ouvrir un mois ancien et vide est une
 * consultation, pas une reprise d'activité — y déverser les charges du mois
 * d'avant réécrirait l'histoire.
 *
 * @param {Object} params - Contexte de décision
 * @param {string} params.target - Période à remplir (AAAA-MM)
 * @param {string} params.currentMonth - Mois calendaire courant (AAAA-MM)
 * @param {Object} params.periods - Nœud `periods` complet, tel que lu en base
 * @returns {{source: string, charges: Array<Object>, variables: Array<Object>}|null}
 *   Le plan, ou null s'il n'y a rien à faire
 */
export function planRecurrence({ target, currentMonth, periods }) {
  if (!PERIOD_KEY.test(target || '')) return null;
  if (!periods || typeof periods !== 'object') return null;

  // Jamais vers le passé.
  if (target < currentMonth) return null;

  const cible = periods[target] || {};

  // Déjà reconduit : l'empreinte fait foi, même si les charges ont depuis été
  // supprimées.
  if (cible.reconductedFrom) return null;

  // Un mois déjà garni n'est pas un mois neuf.
  if (countActiveFixed(cible.fixedCharges) > 0) return null;

  const source = findSource(periods, target);
  if (!source) return null;

  const charges = recurringCharges(periods[source].fixedCharges);
  const variables = variablesReconductibles(periods[source].variableCharges);
  return (charges.length > 0 || variables.length > 0)
    ? { source, charges, variables }
    : null;
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
 * @param {Object} periods - Nœud `periods`
 * @param {string} target - Période cible
 * @returns {string|null} Clé de la période source
 */
function findSource(periods, target) {
  const anterieures = Object.keys(periods)
    .filter(key => PERIOD_KEY.test(key) && key < target)
    .sort()
    .reverse();

  for (const key of anterieures) {
    const mois = periods[key] || {};
    // Un foyer peut n'avoir aucune charge fixe et une essence mensuelle : ne
    // regarder que les fixes lui refuserait la reconduction sans rien dire.
    if (recurringCharges(mois.fixedCharges).length > 0) return key;
    if (variablesReconductibles(mois.variableCharges).length > 0) return key;
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
