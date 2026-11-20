/**
 * FairSplit — L'application ne s'affiche pas dans le cadre d'un autre site
 *
 * La production est servie par GitHub Pages, qui ne pose aucun en-tête. Or
 * `frame-ancestors` — la directive qui refuse l'encadrement — est ignorée
 * lorsqu'elle vient d'une balise `<meta>`, et `X-Frame-Options` n'existe qu'en
 * en-tête. Rien n'empêchait donc un site tiers de mettre FairSplit dans une
 * iframe.
 *
 * Ce qu'un tel site peut faire est limité, et il faut le dire : il ne lit
 * rien, l'origine n'étant pas la sienne. Il peut seulement provoquer un clic
 * sur un bouton qu'il aura recouvert — « Régler ce solde », qui inscrit un
 * remboursement, ou « Supprimer », qui fait une suppression douce. Les deux se
 * rattrapent, corbeille comprise, et il faut viser deux personnes précises
 * pendant qu'elles sont connectées.
 *
 * Faible, donc, mais le remède tient en quelques lignes, et il n'a pas de
 * contrepartie : rien n'encadre légitimement cette application.
 *
 * Le choix a été de remplacer la page plutôt que de la quitter. Une
 * redirection depuis une iframe est refusée par les navigateurs quand le cadre
 * porte `sandbox` sans `allow-top-navigation` — c'est-à-dire précisément dans
 * le cas où l'on voudrait qu'elle marche. Vider la page, personne ne peut
 * l'empêcher.
 */

/**
 * La page est-elle affichée dans le cadre d'une autre ?
 *
 * `window.top` reste lisible entre origines : c'est la *comparaison* de
 * références qui est permise, pas la lecture de ce qu'il y a dedans. La garde
 * `try` couvre les environnements exotiques où l'accès lève malgré tout — un
 * doute y vaut mieux qu'une page blanche.
 *
 * @param {Window} [fenetre] - Fenêtre à examiner ; celle du document par défaut
 * @returns {boolean}
 */
export function dansUnCadre(fenetre = typeof window !== 'undefined' ? window : undefined) {
  if (!fenetre) return false;

  try {
    return fenetre.top !== fenetre.self;
  } catch {
    // L'accès a levé : on est presque sûrement encadré par une autre origine.
    return true;
  }
}

/**
 * Refuse d'afficher l'application si elle est encadrée
 *
 * Rend `true` quand elle a refusé, pour que l'appelant s'arrête là plutôt que
 * d'initialiser Firebase dans une page qui ne sera pas montrée.
 *
 * @param {Document} [doc]
 * @returns {boolean} L'affichage a-t-il été refusé ?
 */
export function refuserLEncadrement(doc = typeof document !== 'undefined' ? document : undefined) {
  if (!doc || !dansUnCadre(doc.defaultView)) return false;

  // `textContent`, jamais `innerHTML` : rien de ce qui suit ne vient de
  // l'extérieur, mais la règle vaut aussi pour les pages de refus — c'est
  // celles-là qu'on relit le moins.
  const message = doc.createElement('p');
  message.className = 'cadre-refuse';
  message.textContent =
    'FairSplit ne s\'affiche pas à l\'intérieur d\'un autre site. '
    + 'Ouvrez-le directement pour accéder à vos comptes.';

  const lien = doc.createElement('a');
  lien.href = doc.location ? doc.location.href : '#';
  lien.target = '_blank';
  lien.rel = 'noopener noreferrer';
  lien.textContent = 'Ouvrir FairSplit';

  if (doc.body) {
    doc.body.textContent = '';
    doc.body.appendChild(message);
    doc.body.appendChild(lien);
  }

  return true;
}
