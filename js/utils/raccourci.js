/**
 * FairSplit — Ce que l'URL demande à l'ouverture
 *
 * Le manifeste déclare un raccourci : un appui long sur l'icône propose
 * « ⚡ Saisie rapide », qui ouvre `FairSplit.html?action=quick-add`. La même
 * URL sert à une seconde icône posée sur l'écran d'accueil — celle-là s'ouvre
 * d'un seul appui, ce que le menu contextuel ne permet pas.
 *
 * Un vrai widget Android est hors de portée : il exige un `AppWidgetProvider`,
 * donc une application native. Le membre `widgets` d'un manifeste ne vise que
 * Windows 11. Le raccourci est ce qu'une PWA peut offrir de plus proche.
 *
 * Lire l'intention est une question de chaîne de caractères : elle vit donc
 * ici, sans DOM ni base, pour être vérifiable.
 */

/** Les actions qu'une URL peut demander */
export const ACTIONS = {
  SAISIE_RAPIDE: 'quick-add'
};

/**
 * L'action demandée par une URL, si elle en demande une
 *
 * Une valeur inconnue est ignorée plutôt que rejetée bruyamment : l'URL peut
 * venir d'un raccourci créé par une version antérieure, ou d'un lien recopié à
 * la main. Ouvrir l'application normalement est le bon comportement.
 *
 * @param {string} recherche - `location.search`, ou toute chaîne de requête
 * @returns {string|null} Une valeur de `ACTIONS`, ou null
 */
export function actionDemandee(recherche) {
  if (typeof recherche !== 'string') return null;

  const demandee = new URLSearchParams(recherche).get('action');
  return Object.values(ACTIONS).includes(demandee) ? demandee : null;
}

/**
 * L'ouverture vient-elle du raccourci de saisie rapide ?
 *
 * @param {string} recherche - `location.search`
 * @returns {boolean}
 */
export function ouvreLaSaisieRapide(recherche) {
  return actionDemandee(recherche) === ACTIONS.SAISIE_RAPIDE;
}

/**
 * Retire le paramètre d'action de l'URL affichée
 *
 * Sans cela, `?action=quick-add` reste dans la barre d'adresse : un
 * rafraîchissement rouvrirait la modale sans qu'on l'ait demandé, et le lien
 * partagé ou mis en favori emporterait l'intention avec lui.
 *
 * Les autres paramètres — `?sandbox=1`, `?diag=1`, `?emulator=1` — décrivent le
 * mode d'exécution et doivent survivre au rafraîchissement : seul `action` est
 * retiré.
 *
 * @param {string} url - URL complète courante
 * @returns {string|null} URL nettoyée, ou null s'il n'y avait rien à retirer
 */
export function urlSansAction(url) {
  let adresse;
  try {
    adresse = new URL(url);
  } catch {
    return null;
  }

  if (!adresse.searchParams.has('action')) return null;

  adresse.searchParams.delete('action');

  // `searchParams` laisse un « ? » solitaire quand il ne reste rien.
  const requete = adresse.searchParams.toString();
  return `${adresse.origin}${adresse.pathname}${requete ? `?${requete}` : ''}${adresse.hash}`;
}
