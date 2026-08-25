/**
 * FairSplit — Attendre que l'application soit vraiment prête
 *
 * `#mainApp` devient visible dès que l'authentification aboutit, bien avant que
 * les modules soient initialisés et que le mois soit lu. Le seul marqueur qui
 * dise la vérité est `document.body.dataset.appReady`, posé par `auth.js` au
 * bout de la séquence.
 *
 * Ce module existe pour la saisie rapide ouverte par le raccourci : la modale
 * paraît immédiatement, avant même que Firebase ait répondu, pour que le
 * montant se tape pendant l'attente au lieu de la suivre. L'écriture, elle, ne
 * peut pas partir avant que la période soit connue — d'où cette attente,
 * placée entre la validation de la saisie et l'écriture.
 *
 * Un observateur plutôt qu'un sondage : la disponibilité est un changement
 * d'attribut, et l'attendre par réveils successifs ajouterait un délai à une
 * séquence dont le but est précisément de n'en plus avoir.
 */

/**
 * Au-delà, l'attente n'est plus une attente
 *
 * Généreux à dessein : la séquence complète — jeton, attestation, lecture du
 * mois — dépasse déjà plusieurs secondes sur un réseau mobile lent, et rendre
 * la main trop tôt ferait perdre une saisie déjà tapée. Ce délai n'est pas un
 * temps d'attente attendu, c'est la borne au-delà de laquelle on renonce.
 */
export const DELAI_APPLICATION_PRETE = 30000;

/**
 * L'application est-elle prête à écrire ?
 *
 * @param {Document} doc - Document à interroger
 * @returns {boolean}
 */
export function applicationPrete(doc) {
  return doc?.body?.dataset?.appReady === 'true';
}

/**
 * Se résout quand l'application devient prête, ou renonce
 *
 * @param {Document} doc - Document à observer
 * @param {{delaiMax?: number}} [options]
 * @returns {Promise<boolean>} true si prête, false si le délai est dépassé
 */
export function quandApplicationPrete(doc, { delaiMax = DELAI_APPLICATION_PRETE } = {}) {
  if (applicationPrete(doc)) return Promise.resolve(true);

  const corps = doc?.body;
  // Sans corps ni observateur, rien ne viendra jamais nous prévenir : mieux vaut
  // rendre un refus tout de suite qu'une promesse qui ne se résout pas.
  if (!corps || typeof doc.defaultView?.MutationObserver !== 'function') {
    return Promise.resolve(false);
  }

  return new Promise(resolve => {
    let minuteur = null;

    const observateur = new doc.defaultView.MutationObserver(() => {
      if (!applicationPrete(doc)) return;
      terminer(true);
    });

    /**
     * Range l'observateur et le minuteur, puis rend le verdict
     * @param {boolean} prete
     */
    function terminer(prete) {
      observateur.disconnect();
      if (minuteur !== null) doc.defaultView.clearTimeout(minuteur);
      resolve(prete);
    }

    observateur.observe(corps, { attributes: true, attributeFilter: ['data-app-ready'] });

    minuteur = doc.defaultView.setTimeout(() => terminer(applicationPrete(doc)), delaiMax);
  });
}
