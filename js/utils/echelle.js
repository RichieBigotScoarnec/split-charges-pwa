/**
 * FairSplit — Une échelle qu'un humain lit d'un coup d'œil
 *
 * Le graphe des tendances graduait son axe en divisant le maximum par cinq,
 * sans rien arrondir. Il affichait donc :
 *
 *     1 997,47 · 1 597,97 · 1 198,48 · 798,99 · 399,49 · 0
 *
 * Six graduations, aucune mémorisable. Or un axe ne sert pas à donner des
 * valeurs — les valeurs sont dans la courbe : il sert à SITUER la courbe d'un
 * coup d'œil. Avec des graduations à trois chiffres significatifs, il faut lire
 * chaque étiquette au lieu de reconnaître un repère, et le graphe demande un
 * effort sans rapport avec ce qu'il apprend.
 *
 * D'où cette fabrique, que toute bibliothèque de graphes possède sous un nom
 * ou un autre : on cherche le plus petit pas « rond » — 1, 2, 2,5 ou 5 fois une
 * puissance de dix — qui couvre les données avec à peu près le nombre de
 * graduations demandé, puis on étend le sommet au multiple suivant de ce pas.
 *
 *     echelleLisible(1815.88, 5)  →  { maximum: 2000, pas: 500, graduations: 4 }
 *
 * Le sommet est toujours SUPÉRIEUR OU ÉGAL au maximum réel : une courbe ne
 * sort jamais de son cadre. C'est ce qui remplace la marge de 10 % que le
 * module appliquait à la main — marge qui, elle, ne garantissait rien de rond.
 */

/** Les pas admis, à une puissance de dix près */
const PAS_RONDS = [1, 2, 2.5, 5, 10];

/**
 * Une échelle aux graduations rondes, couvrant les données
 *
 * @param {number} maximum - La plus grande valeur à représenter
 * @param {number} [graduationsVisees=5] - Nombre souhaité, approché et non garanti
 * @returns {{maximum: number, pas: number, graduations: number}}
 *   `maximum` : le sommet de l'axe, multiple du pas et ≥ au maximum reçu.
 *   `pas` : l'écart entre deux graduations.
 *   `graduations` : le nombre d'intervalles, donc `graduations + 1` étiquettes.
 */
export function echelleLisible(maximum, graduationsVisees = 5) {
  const vise = Number.isFinite(graduationsVisees) && graduationsVisees >= 1
    ? Math.round(graduationsVisees)
    : 5;

  // Un maximum absent, négatif ou nul ne décrit aucune échelle : on rend la
  // plus petite qui soit lisible, plutôt que zéro — un axe de zéro à zéro
  // produirait une division par zéro chez l'appelant.
  if (!Number.isFinite(maximum) || maximum <= 0) {
    return { maximum: vise, pas: 1, graduations: vise };
  }

  const pasBrut = maximum / vise;
  const magnitude = 10 ** Math.floor(Math.log10(pasBrut));
  const normalise = pasBrut / magnitude;

  const pas = (PAS_RONDS.find(candidat => normalise <= candidat) ?? 10) * magnitude;

  // `Math.ceil` sur le quotient plutôt qu'une comparaison de flottants : à
  // 1 000 / 500 le quotient vaut exactement 2, mais 0.3 / 0.1 vaut
  // 2.9999999999999996, et un `ceil` naïf ajouterait une graduation vide.
  const graduations = Math.max(1, Math.ceil(Number((maximum / pas).toFixed(9))));

  return { maximum: pas * graduations, pas, graduations };
}
