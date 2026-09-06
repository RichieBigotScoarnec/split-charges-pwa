/**
 * FairSplit — Chercher au-delà du mois affiché
 *
 * La recherche ne voyait que le mois à l'écran : elle filtrait les lignes déjà
 * rendues, en masquant celles qui ne correspondaient pas. Efficace, et
 * structurellement incapable de trouver quoi que ce soit ailleurs — les autres
 * mois ne sont pas dans la page.
 *
 * « Quand a-t-on acheté la machine à laver ? », « combien a coûté le garage
 * l'an dernier ? » : deux questions sans réponse, alors que la donnée est là.
 * La corbeille et les tendances parcourent déjà tout l'historique ; ce module
 * ouvre le même chemin à la recherche.
 *
 * Il ne fait que **mettre à plat**. Ce qui correspond à la requête reste
 * décidé par `search.js`, avec les mêmes champs que la recherche du mois — sans
 * quoi les deux portées finiraient par ne pas trouver les mêmes choses.
 */

/** Une clé de période valide */
const CLE_PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Les trois collections d'un mois, et comment elles se nomment à l'écran
 *
 * L'ordre compte : à date égale, une charge fixe se lit avant une variable,
 * comme dans les listes du mois.
 */
const COLLECTIONS = [
  { cle: 'fixedCharges', type: 'fixed', libelle: 'Charge fixe' },
  { cle: 'variableCharges', type: 'variable', libelle: 'Charge variable' },
  { cle: 'reimbursements', type: 'reimbursement', libelle: 'Remboursement' }
];

/**
 * Met à plat une collection d'un mois
 *
 * @param {*} noeud - Nœud Firebase, objet indexé par identifiant
 * @param {Object} etiquettes - `{type, libelle, periode}` à reporter
 * @returns {Array<Object>} Entrées actives seulement
 */
function mettreAPlat(noeud, etiquettes) {
  if (!noeud || typeof noeud !== 'object') return [];

  return Object.entries(noeud)
    // Une entrée supprimée reste en base — c'est la corbeille qui la montre,
    // pas la recherche. La faire remonter ici ferait proposer de retrouver une
    // charge qu'on a justement voulu retirer.
    .filter(([, valeur]) => valeur && typeof valeur === 'object' && valeur.deleted !== true)
    .map(([id, valeur]) => ({ ...valeur, id, ...etiquettes }));
}

/**
 * Toutes les charges et tous les remboursements, tous mois confondus
 *
 * @param {*} periods - Nœud `periods` tel que lu en base
 * @returns {Array<Object>} Chaque entrée porte `id`, `periode`, `type`, `typeLabel`
 */
export function chargesDeTousLesMois(periods) {
  if (!periods || typeof periods !== 'object') return [];

  const mois = Object.keys(periods)
    .filter(cle => CLE_PERIODE.test(cle))
    .sort()
    .reverse();

  const tout = [];
  for (const periode of mois) {
    const contenu = periods[periode];
    if (!contenu || typeof contenu !== 'object') continue;

    for (const { cle, type, libelle } of COLLECTIONS) {
      tout.push(...mettreAPlat(contenu[cle], { type, typeLabel: libelle, periode }));
    }
  }

  return tout;
}

/**
 * Regroupe des résultats par mois, du plus récent au plus ancien
 *
 * Un résultat isolé ne dit pas grand-chose ; groupé sous son mois, il répond à
 * la question qu'on posait — « c'était quand ? ».
 *
 * @param {Array<Object>} resultats - Portant chacun une `periode`
 * @returns {Array<{periode: string, lignes: Array<Object>}>}
 */
export function grouperParMois(resultats) {
  const liste = Array.isArray(resultats) ? resultats : [];

  const parMois = new Map();
  for (const resultat of liste) {
    if (!resultat || !CLE_PERIODE.test(String(resultat.periode))) continue;
    if (!parMois.has(resultat.periode)) parMois.set(resultat.periode, []);
    parMois.get(resultat.periode).push(resultat);
  }

  return [...parMois.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([periode, lignes]) => ({ periode, lignes }));
}

/**
 * Combien de mois sont représentés dans un jeu de résultats
 *
 * Sert à l'annonce : « 7 résultats dans 3 mois » situe la réponse là où « 7
 * résultats » laisse chercher.
 *
 * @param {Array<Object>} resultats
 * @returns {number}
 */
export function moisRepresentes(resultats) {
  return grouperParMois(resultats).length;
}
