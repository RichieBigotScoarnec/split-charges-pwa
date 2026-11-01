/**
 * FairSplit — Lecture d'un montant saisi à la main
 *
 * Tous les champs de montant sont des `<input type="text" inputmode="decimal">`,
 * et tous étaient lus par `parseFloat`. Or sur un clavier français, la touche
 * décimale produit une virgule : `parseFloat('12,50')` rend 12. Les centimes
 * disparaissaient sans un mot — ni refus, ni avertissement — et la charge
 * partait en base arrondie à l'euro inférieur.
 *
 * Le pire cas n'était pas la virgule seule. `parseFloat('2 450,50')`, saisie
 * plausible pour un salaire, rend 2. Un revenu de deux euros fausse toutes les
 * parts du mois.
 *
 * Une seule fonction lit les montants, et `validation.js` s'appuie dessus :
 * la règle ne peut plus différer d'un formulaire à l'autre.
 */

/**
 * Espaces employés comme séparateurs de milliers. `\s` couvre à lui seul la
 * catégorie Unicode des séparateurs, donc l'insécable et la fine insécable que
 * produit `Intl.NumberFormat` en français — c'est ce que rend `formatCurrency`,
 * et donc ce qu'une personne recopie.
 */
const ESPACES = /\s/g;

/** Un nombre décimal et rien d'autre — ni notation scientifique, ni texte en fin */
const NOMBRE_SEUL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Lit un montant saisi, en acceptant la virgule comme le point.
 *
 * Accepte « 12,50 », « 12.50 », « 1 234,56 », « 1,234.56 » — quand les deux
 * séparateurs sont présents, le dernier est le séparateur décimal et l'autre
 * groupait les milliers. Refuse tout le reste, y compris ce que `parseFloat`
 * acceptait à moitié : « 12abc » ne vaut plus 12, il ne vaut rien.
 *
 * @param {string|number|null|undefined} saisie - Ce que la personne a tapé
 * @returns {number} Le montant, ou NaN si la saisie n'est pas un nombre
 */
export function parseMontant(saisie) {
  if (typeof saisie === 'number') {
    return Number.isFinite(saisie) ? saisie : NaN;
  }
  if (saisie === null || saisie === undefined) return NaN;

  let texte = String(saisie).replace(ESPACES, '');
  if (texte === '') return NaN;

  const point = texte.lastIndexOf('.');
  const virgule = texte.lastIndexOf(',');

  if (point !== -1 && virgule !== -1) {
    const separateurMilliers = point > virgule ? ',' : '.';
    texte = texte.split(separateurMilliers).join('');
  }
  texte = texte.replace(',', '.');

  if (!NOMBRE_SEUL.test(texte)) return NaN;

  return parseFloat(texte);
}

/**
 * Même lecture, avec une valeur de repli quand la saisie n'est pas un nombre.
 *
 * Remplace les `parseFloat(...) || 0` des appelants, qui confondaient « champ
 * vide » et « zéro saisi » sans le dire.
 *
 * @param {string|number|null|undefined} saisie
 * @param {number} repli - Valeur rendue si la saisie n'est pas un nombre
 * @returns {number}
 */
export function parseMontantOu(saisie, repli = 0) {
  const valeur = parseMontant(saisie);
  return Number.isNaN(valeur) ? repli : valeur;
}
