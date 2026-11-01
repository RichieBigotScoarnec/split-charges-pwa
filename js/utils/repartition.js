/**
 * La façon d'écrire une répartition dérogatoire — une seule, pour trois écrans
 *
 * Une charge peut déroger au mode de partage du foyer : `splitOverride` porte
 * alors « 50-50 » ou deux pourcentages, et le calcul les applique. Trois
 * surfaces doivent le dire — les deux listes de charges, et le récap des
 * virements — et elles doivent le dire À L'IDENTIQUE.
 *
 * ## Pourquoi une fabrique plutôt qu'une troisième copie
 *
 * La formule était déjà écrite deux fois, mot pour mot (`variable-charges.js`,
 * `fixed-charges.js`). En ajouter une troisième dans `summary.js` aurait été la
 * neuvième occurrence du défaut `normalizePair` dans ce dépôt — et commise par
 * le lot qui existe pour en refermer une. Une copie ne se dégrade pas d'un
 * coup : elle se dégrade au correctif suivant que personne n'y reporte.
 *
 * L'enjeu n'est pas cosmétique. Le récap des virements vit dans l'onglet
 * « Bilan », les listes dans l'onglet « Charges » : sous 900 px ce sont deux
 * écrans que rien ne relie. C'est la GRAMMAIRE identique — mêmes mots, même
 * pastille, même prédicat — qui permet au lecteur de faire le lien entre un
 * montant à virer qui le surprend et la charge qui l'explique.
 *
 * ## Ce que la pastille dit, et ce qu'elle ne dit pas
 *
 * Elle répond à « pourquoi ce chiffre n'est pas celui que j'attendais », jamais
 * à « ce chiffre est-il exact ». La seconde question demanderait le montant
 * plein de la charge : elle a sa réponse dans les listes, où il est affiché
 * avec cette même pastille.
 *
 * @module utils/repartition
 */

/**
 * Le libellé d'une répartition dérogatoire, ou la chaîne vide
 *
 * Rend du TEXTE et non du balisage : chaque appelant l'échappe et l'enveloppe
 * lui-même, dans le gabarit qui est le sien. Une fabrique qui rendrait du HTML
 * ferait de ce fichier un site d'injection de plus, que `plafond-innerhtml.mjs`
 * compte et refuse sans relecture.
 *
 * ## Les quatre cas, et pourquoi aucun ne rend « undefined »
 *
 * - `'50-50'` → `50/50`, la moitié pour chacun.
 * - Deux pourcentages exploitables → `70/30`, dans l'ordre « vous / conjointe ».
 * - **`{mode: 'custom'}` SANS ses chiffres** → `50/50`. Les règles acceptent
 *   cette forme — elles n'exigent la somme que si les deux clés sont présentes —
 *   et `pourcentages()` retombe alors sur le partage en deux : la pastille dit
 *   donc la règle réellement appliquée au montant qu'elle accompagne. Les deux
 *   listes affichaient ici `undefined/undefined`.
 * - **Tout autre mode** — `'prorata'`, que les règles admettent (`:278`) mais
 *   qu'aucun formulaire n'écrit → chaîne vide, donc pas de pastille. Ce mode ne
 *   nomme aucune division fixe : il n'a pas d'écriture dans cette grammaire, et
 *   il ne s'écarte de rien puisque c'est le partage par défaut du foyer.
 *
 * @param {Object|null|undefined} splitOverride - Le champ, tel qu'il est en base
 * @returns {string} Le libellé, ou `''` s'il n'y a rien à signaler
 */
export function libelleDeLaRepartition(splitOverride) {
  if (!splitOverride) return '';

  if (splitOverride.mode === '50-50') return '50/50';
  if (splitOverride.mode !== 'custom') return '';

  const vous = Number(splitOverride.vous);
  const conjointe = Number(splitOverride.conjointe);

  // Le repli est celui de `pourcentages()`, et c'est ce qui les tient
  // ensemble : la pastille nomme la règle qui a produit le montant d'à côté,
  // jamais une règle que le calcul n'a pas appliquée.
  if (!Number.isFinite(vous) || !Number.isFinite(conjointe)) return '50/50';

  return `${vous}/${conjointe}`;
}
