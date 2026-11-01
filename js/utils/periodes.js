/**
 * FairSplit — Quels mois le sélecteur doit proposer
 *
 * Il fabriquait douze mois glissants, et rien d'autre :
 *
 *   for (let i = 0; i < 12; i++) { … }
 *
 * Or c'est le seul moyen de naviguer — les flèches ne font que se déplacer
 * dans ses options. Passé un an, les données d'un mois restaient donc en base
 * sans qu'aucun chemin de l'application ne puisse les afficher. Pour une
 * application dont l'objet est l'historique financier d'un couple, la
 * fonctionnalité se perdait toute seule, sans alerte, et ne se découvrait que
 * le jour où l'on cherchait un vieux mois.
 *
 * Symétriquement, aucun mois futur n'était proposé : impossible de saisir le
 * loyer du mois prochain ou de préparer une enveloppe de vacances en juin,
 * c'est-à-dire au moment où l'on a l'information en main.
 *
 * La liste réunit donc quatre sources, sans doublon, du plus récent au plus
 * ancien : ce que la base contient, les douze derniers mois, le mois consulté,
 * et un mois d'avance.
 */

/** Format d'une clé de période : AAAA-MM */
const CLE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Nombre de mois glissants toujours proposés, même vides */
export const MOIS_GLISSANTS = 12;

/**
 * Une clé de période est-elle exploitable ?
 *
 * Le nœud `periods` a hébergé des écritures accidentelles — `periods/undefined`
 * en a fait partie — qui ne doivent pas atterrir dans le sélecteur.
 *
 * @param {*} valeur
 * @returns {boolean}
 */
export function clePeriodeValide(valeur) {
  return typeof valeur === 'string' && CLE.test(valeur);
}

/**
 * Décale une période d'un nombre de mois
 *
 * Le calcul passe par les nombres plutôt que par `Date` : `setMonth` conserve
 * le quantième, et le 31 mars un `setMonth(1)` donne le 31 février, que
 * JavaScript reporte au 3 mars. La liste affichait alors deux fois le même mois
 * et en omettait un — visible seulement du 29 au 31, donc presque jamais
 * pendant qu'on développe.
 *
 * @param {string} periode - Clé AAAA-MM
 * @param {number} decalage - Nombre de mois, négatif vers le passé
 * @returns {string|null} Clé décalée, ou null si l'entrée n'en est pas une
 */
export function decalerPeriode(periode, decalage) {
  if (!clePeriodeValide(periode) || !Number.isInteger(decalage)) return null;

  const [annee, mois] = periode.split('-').map(Number);
  // Mois comptés depuis zéro pour que le report d'année tombe juste.
  const total = annee * 12 + (mois - 1) + decalage;
  if (total < 0) return null;

  const anneeCible = Math.floor(total / 12);
  const moisCible = (total % 12) + 1;

  return `${String(anneeCible).padStart(4, '0')}-${String(moisCible).padStart(2, '0')}`;
}

/**
 * Les mois à proposer, du plus récent au plus ancien
 *
 * @param {Object} params
 * @param {string} params.moisCourant - Mois calendaire du jour (AAAA-MM)
 * @param {Array<string>|Object} [params.enBase] - Clés du nœud `periods`, ou le nœud lui-même
 * @param {string} [params.consultee] - Mois affiché, à ne jamais faire disparaître
 * @param {number} [params.moisEnAvant] - Mois futurs proposés
 * @returns {Array<string>} Clés AAAA-MM, sans doublon, décroissantes
 */
export function listePeriodes({ moisCourant, enBase = [], consultee = null, moisEnAvant = 1 } = {}) {
  if (!clePeriodeValide(moisCourant)) return [];

  const retenues = new Set();

  // Un mois d'avance : préparer le loyer du mois prochain, ou l'enveloppe d'un
  // séjour, se fait quand on a l'information — pas le 1er du mois.
  for (let i = moisEnAvant; i >= 1; i--) {
    const cle = decalerPeriode(moisCourant, i);
    if (cle) retenues.add(cle);
  }

  // Les douze derniers mois, même vides : ouvrir un mois neuf doit rester
  // possible sans qu'il ait déjà des données.
  for (let i = 0; i < MOIS_GLISSANTS; i++) {
    const cle = decalerPeriode(moisCourant, -i);
    if (cle) retenues.add(cle);
  }

  // Tout ce que la base contient, quel que soit son âge. C'est ce qui manquait :
  // au-delà d'un an, plus rien n'y menait.
  const cles = Array.isArray(enBase)
    ? enBase
    : (enBase && typeof enBase === 'object' ? Object.keys(enBase) : []);
  cles.filter(clePeriodeValide).forEach(cle => retenues.add(cle));

  // Le mois consulté, enfin : un mois ouvert par un lien ou resté sélectionné
  // ne doit pas s'évaporer de la liste qui le montre.
  if (clePeriodeValide(consultee)) retenues.add(consultee);

  return [...retenues].sort().reverse();
}
