/**
 * FairSplit — Trois destinations plutôt qu'un seul long écran
 *
 * La page principale empilait cinq sections et une rangée de dix boutons
 * d'outils. Sur un téléphone, répondre à « qui doit combien à qui » et
 * corriger une charge de la semaine passée demandaient le même geste : faire
 * défiler jusqu'à trouver.
 *
 * Le découpage suit la question qu'on se pose, pas le type de donnée :
 *
 *     📊 Bilan     — où on en est
 *     🧾 Charges   — ce qu'on a dépensé
 *     ⚙️ Réglages  — ce qui ne bouge presque jamais
 *
 * Ce module ne fait qu'une chose : déplacer la classe `panneau--actif` et
 * l'attribut `aria-current`. **C'est `onglets.css` qui décide si masquer a un
 * sens** — au-delà de 900 px les trois panneaux prennent leurs colonnes et la
 * barre disparaît. Aucune requête média n'est donc lue ici : l'état reste
 * juste quelle que soit la largeur, et une rotation d'écran ne demande rien.
 *
 * Volontairement à l'écart de la délégation de `init.js` : celle-ci résout un
 * nom de fonction sur `window` depuis un attribut du DOM, surface qu'une liste
 * blanche de 43 actions borne précisément. Un onglet n'a pas besoin de cette
 * puissance — il désigne un identifiant de panneau, qu'on vérifie être un
 * `.panneau` réel avant d'agir. Rien à ajouter à la liste blanche, donc rien
 * de plus à atteindre par une injection HTML.
 */

import { ecouterUneFois } from './ecouteur.js';

/** La classe qui montre un panneau sous le point de rupture */
const CLASSE_ACTIF = 'panneau--actif';

/**
 * Les identifiants de panneaux que la barre propose réellement
 *
 * Lus du balisage plutôt que codés en dur : un onglet ajouté à la page suffit,
 * et un onglet retiré ne laisse pas de nom fantôme derrière lui.
 *
 * @param {Document|Element} [racine=document]
 * @returns {string[]}
 */
export function panneauxProposes(racine = document) {
  return [...racine.querySelectorAll('.onglet[data-panneau]')]
    .map((onglet) => onglet.dataset.panneau)
    .filter((id) => {
      const panneau = racine.getElementById
        ? racine.getElementById(id)
        : racine.querySelector(`#${CSS.escape(id)}`);
      return Boolean(panneau && panneau.classList.contains('panneau'));
    });
}

/**
 * Le panneau qu'un identifiant demandé désigne, ou le premier à défaut
 *
 * Un identifiant inconnu ne doit jamais laisser l'écran sans aucun panneau
 * visible : sous 900 px, tous les panneaux masqués donnent une page vide, ce
 * qui se lit comme une panne. Le repli est le premier onglet — le bilan.
 *
 * @param {string} demande
 * @param {string[]} proposes
 * @returns {string|null} Identifiant retenu, ou `null` s'il n'y a aucun onglet
 */
export function panneauRetenu(demande, proposes) {
  if (!Array.isArray(proposes) || proposes.length === 0) return null;
  return proposes.includes(demande) ? demande : proposes[0];
}

/**
 * Affiche un panneau et marque son onglet
 *
 * @param {string} id - Identifiant du panneau visé
 * @param {Document} [racine=document]
 * @returns {string|null} Identifiant réellement affiché
 */
export function activerOnglet(id, racine = document) {
  const proposes = panneauxProposes(racine);
  const retenu = panneauRetenu(id, proposes);
  if (!retenu) return null;

  for (const panneau of racine.querySelectorAll('.panneau')) {
    panneau.classList.toggle(CLASSE_ACTIF, panneau.id === retenu);
  }

  for (const onglet of racine.querySelectorAll('.onglet[data-panneau]')) {
    // `aria-current` est retiré et non mis à « false » : la valeur « false »
    // est une valeur comme une autre pour cet attribut, et certains lecteurs
    // d'écran annoncent alors deux onglets courants.
    if (onglet.dataset.panneau === retenu) onglet.setAttribute('aria-current', 'true');
    else onglet.removeAttribute('aria-current');
  }

  return retenu;
}

/**
 * L'onglet actuellement marqué
 *
 * @param {Document} [racine=document]
 * @returns {string|null}
 */
export function ongletCourant(racine = document) {
  const marque = racine.querySelector('.onglet[aria-current="true"]');
  return marque ? marque.dataset.panneau : null;
}

/**
 * Branche la barre d'onglets
 *
 * Un seul écouteur, délégué sur la barre : les trois boutons existent dans le
 * HTML et ne sont jamais recréés, mais `initializeAppData()` rejoue à chaque
 * reconnexion sans rechargement — sans `ecouterUneFois`, un aller-retour de
 * déconnexion doublerait le gestionnaire.
 *
 * @returns {boolean} La barre a-t-elle été trouvée ?
 */
export function initOnglets() {
  const barre = document.getElementById('onglets');
  if (!barre) return false;

  ecouterUneFois(barre, 'click', (evenement) => {
    const onglet = evenement.target.closest('.onglet[data-panneau]');
    if (!onglet || !barre.contains(onglet)) return;

    const affiche = activerOnglet(onglet.dataset.panneau);
    if (!affiche) return;

    // Changer d'onglet sans remonter laisserait le nouveau panneau ouvert au
    // milieu : on aurait quitté le bas du bilan pour le bas des charges, en
    // paraissant n'avoir rien fait. `auto` et non `smooth` : le défilement
    // animé d'une page qui vient de changer entièrement de contenu donne un
    // effet de glissement sans repère.
    window.scrollTo({ top: 0, behavior: 'auto' });
  });

  // L'état de départ vient du balisage — `aria-current` posé sur le premier
  // onglet — et non d'une valeur retenue d'une session précédente : ouvrir
  // l'application doit poser la question à laquelle elle répond, pas rouvrir
  // l'écran de réglages qu'on consultait la dernière fois.
  activerOnglet(ongletCourant() || panneauxProposes()[0]);
  return true;
}
