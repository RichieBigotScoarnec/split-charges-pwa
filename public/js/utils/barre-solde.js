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

  observateur = new Classe((entrees) => {
    barre.classList.toggle(CLASSE_REDONDANTE, bilanVisible(entrees));
  });

  observateur.observe(temoin);

  // L'observateur ne rapporte qu'au prochain cycle d'affichage. D'ici là la
  // barre garderait l'état du rendu précédent, et clignoterait au changement de
  // mois. À l'ouverture, le bilan est en haut : c'est lui qui parle.
  barre.classList.add(CLASSE_REDONDANTE);

  return true;
}

/**
 * Le solde du bilan est-il à l'écran ?
 *
 * Rendue à part pour être vérifiable : c'est la seule décision de ce module, et
 * l'inverser rendrait la barre visible exactement quand elle est inutile.
 *
 * @param {Array<{isIntersecting: boolean}>} entrees
 * @returns {boolean}
 */
export function bilanVisible(entrees) {
  if (!Array.isArray(entrees) || entrees.length === 0) return false;
  return entrees.some(entree => entree && entree.isIntersecting);
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
