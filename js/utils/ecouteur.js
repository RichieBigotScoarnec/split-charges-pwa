/**
 * FairSplit — Un écouteur posé une fois, quel que soit le nombre d'initialisations
 *
 * `initializeAppData()` n'est pas appelée une seule fois par page. Le drapeau
 * `appInitialized` retombe à `false` à la déconnexion (`updateAuthUI`), et il
 * le faut : la session suivante doit relire les données du foyer. Mais toute
 * la séquence rejoue avec — dont huit modules qui posent leurs écouteurs sur
 * des éléments du HTML, lesquels, eux, n'ont pas bougé.
 *
 * Se déconnecter puis se reconnecter sans recharger la page suffisait donc à
 * doubler chaque écouteur : deux relectures complètes à chaque changement de
 * mois, deux toasts par message, deux ouvertures de modale par appui. Les
 * écritures en double, elles, étaient déjà bloquées par le verrou de
 * `soumission.js` — c'est ce qui rendait le défaut gênant plutôt que grave.
 *
 * L'idiome existait déjà dans le dépôt, mais à un seul endroit et sous forme
 * d'attribut posé sur le DOM (`select.dataset.manageListenerAdded`). Le voici
 * partagé, et tenu hors du balisage : une `WeakMap` n'écrit rien dans la page,
 * fonctionne sur `document` et `window` autant que sur un élément, et libère
 * son entrée avec la cible.
 */

/** Les couples (cible → clés déjà posées) */
const posees = new WeakMap();

/**
 * Pose un écouteur, sauf s'il l'a déjà été sur cette cible
 *
 * La clé par défaut est le type d'événement, ce qui suffit dans presque tous
 * les cas : un bouton n'a qu'un seul gestionnaire de clic. La donner
 * explicitement sert quand une même cible reçoit deux écouteurs du même type
 * pour deux raisons différentes.
 *
 * @param {EventTarget|null} cible - Élément, document ou fenêtre ; `null` toléré
 * @param {string} type - Type d'événement ('click', 'change'…)
 * @param {Function} gestionnaire
 * @param {string} [cle] - Nom distinctif, si le type ne suffit pas
 * @returns {boolean} L'écouteur vient-il d'être posé ?
 */
export function ecouterUneFois(cible, type, gestionnaire, cle = type) {
  if (!cible || typeof cible.addEventListener !== 'function') return false;

  let deja = posees.get(cible);
  if (!deja) {
    deja = new Set();
    posees.set(cible, deja);
  }

  if (deja.has(cle)) return false;

  cible.addEventListener(type, gestionnaire);
  deja.add(cle);
  return true;
}

/**
 * Oublie ce qui a été posé sur une cible
 *
 * Ne retire pas l'écouteur — le registre ne garde pas les fonctions, et rien
 * n'en a besoin : les éléments concernés vivent aussi longtemps que la page.
 * Sert aux tests, qui recréent le balisage entre deux cas et doivent pouvoir
 * repartir d'une cible vierge.
 *
 * @param {EventTarget} cible
 * @returns {void}
 */
export function oublierLesEcouteurs(cible) {
  if (cible) posees.delete(cible);
}
