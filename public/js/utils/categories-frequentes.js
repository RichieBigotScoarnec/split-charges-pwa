/**
 * FairSplit — Les catégories que ce foyer emploie vraiment
 *
 * La grille de la saisie rapide présente toutes les catégories du foyer, à
 * poids égal. C'est juste tant qu'elles sont huit ; ça cesse de l'être dès
 * qu'on en crée d'autres, car l'usage réel est très inégal : les courses et le
 * restaurant reviennent chaque semaine, la santé trois fois l'an.
 *
 * Ce module compte, il ne devine pas. Aucun compteur n'est tenu en base : un
 * compteur entretenu à part finit toujours par diverger de ce qu'il compte, et
 * le jour où l'on s'en aperçoit est celui où l'on s'y fiait. Le comptage se
 * fait sur les charges elles-mêmes, à l'ouverture.
 *
 * Le décompte porte sur `category` — le libellé — et non sur `categoryId` : le
 * formulaire complet n'écrit que le libellé, et une statistique qui ignorerait
 * les charges saisies par ce chemin décrirait la moitié du foyer.
 */

/** Format d'une clé de période, tel qu'il est employé partout */
const CLE_PERIODE = /^\d{4}-\d{2}$/;

/**
 * Mois précédant une période
 *
 * @param {string} periode - Clé au format AAAA-MM
 * @returns {string|null} Clé du mois précédent, null si l'entrée est illisible
 */
export function periodePrecedente(periode) {
  if (typeof periode !== 'string' || !CLE_PERIODE.test(periode)) return null;

  const [annee, mois] = periode.split('-').map(Number);
  if (mois < 1 || mois > 12) return null;

  const precedent = mois === 1
    ? { annee: annee - 1, mois: 12 }
    : { annee, mois: mois - 1 };

  return `${precedent.annee}-${String(precedent.mois).padStart(2, '0')}`;
}

/**
 * Catégories les plus employées, de la plus fréquente à la moins
 *
 * @param {Array} charges - Charges à dépouiller, tous mois confondus
 * @param {Array} categories - Catégories du foyer (`getCategories()`)
 * @param {{maximum?: number}} [options]
 * @returns {Array} Catégories, ordonnées par fréquence décroissante
 */
export function categoriesFrequentes(charges, categories, options = {}) {
  const maximum = options.maximum || 4;

  if (!Array.isArray(charges) || !Array.isArray(categories)) return [];

  const comptes = new Map();
  for (const charge of charges) {
    if (!charge || typeof charge !== 'object') continue;
    // Une charge à la corbeille n'apprend rien sur les habitudes : elle a
    // précisément été jugée à retirer.
    if (charge.deleted === true) continue;

    const libelle = typeof charge.category === 'string' ? charge.category.trim() : '';
    if (!libelle) continue;

    comptes.set(libelle, (comptes.get(libelle) || 0) + 1);
  }

  if (comptes.size === 0) return [];

  // L'ordre des catégories du foyer départage les ex æquo : sans cela, deux
  // catégories à égalité changeraient de place d'une ouverture à l'autre, et
  // une grille dont les tuiles bougent seule est plus lente qu'une grille fixe.
  const rang = new Map(categories.map((categorie, index) => [categorie.label, index]));

  return [...comptes.entries()]
    .filter(([libelle]) => rang.has(libelle))
    .sort((a, b) => (b[1] - a[1]) || (rang.get(a[0]) - rang.get(b[0])))
    .slice(0, maximum)
    .map(([libelle]) => categories.find(categorie => categorie.label === libelle));
}

/**
 * La ligne des fréquentes a-t-elle lieu d'être ?
 *
 * Elle ne se justifie que lorsqu'elle épargne du parcours. Sur une grille
 * courte, elle ajoute de la hauteur pour rien — et redouble des tuiles déjà
 * visibles, ce qui fait hésiter au lieu d'aider.
 *
 * @param {Array} frequentes - Sortie de `categoriesFrequentes`
 * @param {Array} categories - Catégories du foyer
 * @returns {boolean}
 */
export function ligneFrequentesUtile(frequentes, categories) {
  if (!Array.isArray(frequentes) || !Array.isArray(categories)) return false;

  // Une seule catégorie employée, c'est un historique trop mince pour qu'on en
  // tire une habitude — et une ligne à une tuile n'a l'air de rien.
  if (frequentes.length < 2) return false;

  // En deçà, la grille entière tient sous le pouce : la ligne ne raccourcit
  // aucun geste.
  if (categories.length <= 6) return false;

  // Si les fréquentes sont toute la liste, la ligne ne fait que la répéter.
  return frequentes.length < categories.length;
}
