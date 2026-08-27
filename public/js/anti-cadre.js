/**
 * FairSplit — Refuser l'encadrement avant le premier pixel
 *
 * `frame-ancestors` est ignorée en balise `<meta>`, et GitHub Pages ne pose
 * aucun en-tête : `utils/cadre.js` est le seul rempart contre l'affichage de
 * l'application dans le cadre d'un autre site.
 *
 * Mais il est importé par `app.js`, chargé en `<script type="module">`, donc
 * différé jusqu'après l'analyse complète du document. Toute l'interface —
 * « Régler ce solde », « Supprimer » — était peinte avant que la garde ne vide
 * la page. Et si `app.js` échouait à charger, pour une raison quelconque, elle
 * ne tournait pas du tout alors que le balisage statique s'affichait.
 *
 * Ce fichier est chargé sans `defer` en tête de `<head>` : il s'exécute avant
 * la première feuille de style, donc avant le premier pixel. Il ne fait qu'une
 * chose, et n'a besoin de rien.
 *
 * `utils/cadre.js` garde son rôle : afficher l'explication et le lien de
 * sortie, une fois le DOM disponible.
 */

(function () {
  // `window.top !== window.self` reste lisible entre origines : c'est la
  // comparaison de références qui est permise, pas la lecture de ce qu'il y a
  // dedans. Le `try` couvre les environnements où l'accès lève malgré tout —
  // un doute y vaut mieux qu'une page laissée visible.
  let encadre;
  try {
    encadre = window.top !== window.self;
  } catch {
    encadre = true;
  }

  if (encadre && document.documentElement) {
    document.documentElement.style.display = 'none';
  }
})();
