/**
 * FairSplit — La barre de solde ne dit rien que le bilan ne dise mieux
 *
 * L'application répond à une question : qui doit combien à qui. La barre garde
 * cette réponse à l'écran pendant qu'on fait défiler les charges, et c'est une
 * bonne idée — sans elle, il fallait remonter jusqu'au bilan.
 *
 * Mais au repos, elle se pose juste au-dessus du « Résumé du Mois », qui dit
 * exactement la même chose en plus gros et avec son explication : « Cindy a
 * payé 7,49 € de plus que sa part ». Sur un écran de 448 px, le premier écran
 * est alors presque entièrement consacré à dire une chose deux fois.
 *
 * Ce module ne la fait paraître qu'une fois le solde du bilan sorti de l'écran.
 * Elle gagne ainsi sa place exactement quand elle sert, et ne répète jamais.
 *
 * Le repli est délibérément le comportement d'avant : sans
 * `IntersectionObserver` — navigateur ancien, banc d'essai sans DOM complet —
 * la barre reste visible en permanence. Une redondance vaut mieux qu'un solde
 * qu'on ne trouve plus.
 */

/**
 * Classe posée sur la barre tant que le bilan dit déjà la même chose
 *
 * Une classe plutôt que `hidden` : cet attribut appartient à `summary.js`, qui
 * s'en sert pour masquer la barre quand aucun solde n'est calculable. Les deux
 * raisons de ne pas s'afficher sont distinctes, et se les disputer produirait
 * une barre qui reparaît au premier rafraîchissement.
 */
export const CLASSE_REDONDANTE = 'balance-bar--redondante';

/**
 * Part du solde du bilan qui doit rester à l'écran pour que la barre se taise
 *
 * `isIntersecting` est vrai dès un seul pixel de recouvrement. La barre se
 * repliait donc alors qu'il ne restait qu'un liseré du bilan en haut de
 * l'écran — c'est-à-dire au moment précis où elle devait prendre le relais.
 * Mesuré sur un iPhone 13 : 57 px visibles sur 198, et plus de solde nulle
 * part.
 *
 * Deux tiers : en deçà, ce qui reste du bilan ne se lit plus comme une réponse.
 */
const PART_SUFFISANTE = 0.66;

/**
 * Le plancher du seuil bas de l'hystérésis
 *
 * Garantit qu'un bilan entièrement sorti de l'écran fait toujours paraître la
 * barre, quelle que soit l'empreinte mesurée. Voir `doitSeTaire`.
 */
const PLANCHER_BAS = 0.02;

/**
 * La barre déplace ce qu'elle observe — d'où l'hystérésis
 *
 * `#balanceBar` vit dans `.bandeau-colle`, qui est dans le flux ; le bilan,
 * lui, est **après** dans le document. Faire paraître la barre pousse donc le
 * bilan vers le bas de la hauteur de la barre, et le faire disparaître le
 * remonte d'autant. Or c'est précisément la part visible du bilan qui décide
 * de la barre : **chaque bascule provoque la suivante.**
 *
 * Mesuré sur 390 × 844, en descendant d'un trait : le navigateur rapporte
 * 0,62 barre masquée et 0,93 barre affichée, de part et d'autre du seuil —
 * **62 bascules réelles, une par image d'affichage**. À l'œil, une bande qui
 * scintille sur toute une plage de défilement. Aucune capture ne la montre :
 * une image en fige un état.
 *
 * Le remède est de n'accorder à un changement d'état que ce qui lui survit.
 * La barre se tait dès que le bilan atteint `PART_SUFFISANTE`, mais elle ne
 * reparaît qu'une fois **passée sous ce seuil diminué de sa propre empreinte**.
 * L'écart couvre exactement le déplacement qu'elle cause : après chaque
 * bascule, la nouvelle mesure confirme la décision au lieu de l'annuler.
 *
 * L'empreinte est mesurée, jamais devinée : elle dépend de la hauteur du
 * bilan, qui change avec le mois — un solde nul n'a ni explication ni bouton.
 */
export function empreinteDeLaBarre(barre, temoin) {
  if (!barre || !temoin) return 0;

  const hauteurTemoin = temoin.getBoundingClientRect().height;
  if (!(hauteurTemoin > 0)) return 0;

  // `display: none` rend une hauteur nulle : la barre doit être mesurée
  // affichée. On la rend le temps de la mesure, avant le premier rendu.
  const cachee = barre.classList.contains(CLASSE_REDONDANTE);
  if (cachee) barre.classList.remove(CLASSE_REDONDANTE);

  const rect = barre.getBoundingClientRect();
  // La marge basse fait partie du déplacement : elle occupe le flux comme
  // le reste. L'oublier laisserait une frange d'oscillation.
  const marge = parseFloat(getComputedStyle(barre).marginBottom) || 0;
  const empreinte = rect.height + marge;

  if (cachee) barre.classList.add(CLASSE_REDONDANTE);

  if (!(empreinte > 0)) return 0;
  return empreinte / hauteurTemoin;
}

/**
 * La barre doit-elle se taire ?
 *
 * Deux seuils, et lequel s'applique dépend de l'état courant — c'est là toute
 * l'hystérésis. Rendue à part parce que c'est la seule décision du module, et
 * qu'un seul seuil des deux côtés la fait osciller.
 *
 * @param {Object} params
 * @param {number} params.part - Part visible du bilan
 * @param {boolean} params.redondanteAvant - La barre est-elle déjà tue ?
 * @param {number} [params.empreinte] - Part du bilan que la barre déplace
 * @returns {boolean}
 */
export function doitSeTaire({ part, redondanteAvant, empreinte = 0 }) {
  const vue = Number.isFinite(part) ? part : 0;
  const jeu = Number.isFinite(empreinte) && empreinte > 0 ? empreinte : 0;

  // Le seuil bas garde un plancher STRICTEMENT positif. À zéro, « la part
  // visible est-elle au-dessus du seuil ? » serait vrai même à zéro : la barre
  // ne reparaîtrait jamais, pas même le bilan entièrement sorti de l'écran —
  // c'est-à-dire précisément quand elle est le seul endroit qui porte le solde.
  //
  // Il ne mord que si la barre dépassait les deux tiers de la hauteur du bilan,
  // ce qu'aucune géométrie de cette application ne produit (mesuré : 0,30).
  const bas = Math.max(PLANCHER_BAS, PART_SUFFISANTE - jeu);

  return redondanteAvant ? vue >= bas : vue >= PART_SUFFISANTE;
}

/**
 * La part du bilan que l'observateur a vue
 *
 * @param {Array<{isIntersecting: boolean, intersectionRatio: number}>} entrees
 * @returns {number}
 */
export function partVisible(entrees) {
  if (!Array.isArray(entrees) || entrees.length === 0) return 0;

  let part = 0;
  for (const entree of entrees) {
    if (!entree || !entree.isIntersecting) continue;
    if (!Number.isFinite(entree.intersectionRatio)) continue;
    part = Math.max(part, entree.intersectionRatio);
  }
  return part;
}

/** Observateur en cours, pour ne jamais en laisser deux derrière soi */
let observateur = null;

/**
 * Fait suivre à la barre la visibilité du solde du bilan
 *
 * À rappeler après chaque rendu du bilan : `summary.js` réécrit tout son
 * contenu, l'élément observé n'est donc plus le même. Un observateur laissé sur
 * un élément détaché ne lève pas d'erreur — il cesse simplement de rapporter,
 * et la barre se fige dans son dernier état.
 *
 * @param {Object} [options]
 * @param {Function} [options.Observateur] - Injectable pour les bancs d'essai
 * @returns {boolean} true si l'observation est en place
 */
export function suivreLeBilan({ Observateur } = {}) {
  arreterDeSuivre();

  const barre = document.getElementById('balanceBar');
  if (!barre) return false;

  const Classe = Observateur
    || (typeof window !== 'undefined' ? window.IntersectionObserver : undefined);

  // Sans observateur, on rend la barre à son comportement d'avant plutôt que
  // de la laisser dans l'état où le dernier rendu l'avait mise.
  if (typeof Classe !== 'function') {
    barre.classList.remove(CLASSE_REDONDANTE);
    return false;
  }

  const temoin = document.querySelector('.summary-balance');

  // Pas de bilan à l'écran — mois vide, salaires absents : la barre est alors
  // le seul endroit qui puisse porter le solde.
  if (!temoin) {
    barre.classList.remove(CLASSE_REDONDANTE);
    return false;
  }

  // Mesurée AVANT le premier rendu, tant que la géométrie est celle qu'on
  // observera. Une valeur nulle — bilan de hauteur inconnue, barre vide —
  // ramène au comportement d'un seul seuil, qui reste correct partout où la
  // barre ne déplace rien.
  const empreinte = empreinteDeLaBarre(barre, temoin);

  // Les seuils font rapporter l'observateur aux passages qui décident. Les
  // DEUX y figurent : sans le seuil bas, la barre ne reparaîtrait qu'au
  // prochain franchissement du seuil haut, c'est-à-dire jamais en descendant.
  const seuilBas = Math.max(0, PART_SUFFISANTE - empreinte);

  observateur = new Classe((entrees) => {
    barre.classList.toggle(CLASSE_REDONDANTE, doitSeTaire({
      part: partVisible(entrees),
      redondanteAvant: barre.classList.contains(CLASSE_REDONDANTE),
      empreinte
    }));
  }, { threshold: [...new Set([0, seuilBas, PART_SUFFISANTE, 1])].sort((a, b) => a - b) });

  observateur.observe(temoin);

  // L'observateur ne rapporte qu'au prochain cycle d'affichage. D'ici là la
  // barre garderait l'état du rendu précédent, et clignoterait au changement de
  // mois. À l'ouverture, le bilan est en haut : c'est lui qui parle.
  barre.classList.add(CLASSE_REDONDANTE);

  return true;
}

/**
 * Le solde du bilan est-il assez à l'écran pour se passer de la barre ?
 *
 * Le seuil unique d'une barre qui ne déplacerait rien. Conservée parce qu'elle
 * dit la règle de fond — au-dessus de `PART_SUFFISANTE`, le bilan suffit — mais
 * **ce n'est plus elle qui décide** : `doitSeTaire` s'en charge, avec les deux
 * seuils qu'exige une barre qui bouge ce qu'elle regarde.
 *
 * Une part manquante compte comme insuffisante : le défaut sûr est de montrer
 * la barre — une redondance vaut mieux qu'un solde introuvable.
 *
 * @param {Array<{isIntersecting: boolean, intersectionRatio: number}>} entrees
 * @returns {boolean}
 */
export function bilanVisible(entrees) {
  return partVisible(entrees) >= PART_SUFFISANTE;
}

/**
 * Cesse d'observer
 *
 * Appelée à chaque nouvelle installation, et à la déconnexion.
 *
 * @returns {void}
 */
export function arreterDeSuivre() {
  if (!observateur) return;
  observateur.disconnect();
  observateur = null;
}
