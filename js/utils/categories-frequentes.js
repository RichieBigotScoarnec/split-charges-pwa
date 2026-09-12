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
 * Combien de tuiles la grille montre avant de proposer le reste
 *
 * Deux rangées de trois : la grille tient sous le pouce, et le bouton
 * d'enregistrement reste visible sans défiler. Au-delà, chaque tuile ajoutée
 * repousse ce bouton — et c'est lui qu'on vise à la fin.
 */
export const TUILES_VISIBLES = 6;

/**
 * Les catégories que la grille montre, et combien elle en garde en réserve
 *
 * La liste du foyer est passée de huit à dix-neuf pour suivre la table des
 * lieux OpenStreetMap de plus près. Les montrer toutes rendrait la saisie
 * rapide plus lente qu'avant : dix-neuf tuiles à parcourir pour en toucher une,
 * quand trois d'entre elles couvrent l'essentiel des dépenses.
 *
 * L'ordre vient de l'usage réel, pas d'une supposition. Tant qu'aucune habitude
 * n'est connue — un foyer neuf, un mois vide — c'est l'ordre de `config.js` qui
 * décide, et il place les plus courantes en tête.
 *
 * La catégorie épinglée est toujours montrée, même rare : c'est celle que le
 * GPS vient de deviner, ou celle déjà choisie. Une grille qui ne montre pas le
 * choix en cours donne à croire qu'il a été perdu.
 *
 * @param {Array} categories - Catégories du foyer (`getCategories()`)
 * @param {Array} charges - Charges connues, pour compter les habitudes
 * @param {{epinglee?: Object|null, maximum?: number}} [options]
 * @returns {{visibles: Array, reste: number}}
 */
export function categoriesAMontrer(categories, charges, options = {}) {
  const liste = Array.isArray(categories) ? categories.filter(Boolean) : [];
  const maximum = options.maximum || TUILES_VISIBLES;

  if (liste.length <= maximum) return { visibles: liste, reste: 0 };

  // Les employées d'abord, dans l'ordre de l'usage ; les autres ensuite, dans
  // l'ordre du foyer. `categoriesFrequentes` ne rend que celles qui ont servi.
  const employees = categoriesFrequentes(charges, liste, { maximum: Number.MAX_SAFE_INTEGER });
  const vues = new Set(employees.map(categorie => categorie.id));
  const ordonnees = [...employees, ...liste.filter(categorie => !vues.has(categorie.id))];

  const visibles = ordonnees.slice(0, maximum);

  const epinglee = options.epinglee;
  if (epinglee && !visibles.some(categorie => categorie.id === epinglee.id)) {
    // Elle prend la place de la dernière : la grille garde sa hauteur, et la
    // moins employée des visibles est celle qui manquera le moins.
    const dansLaListe = liste.find(categorie => categorie.id === epinglee.id);
    if (dansLaListe) visibles[visibles.length - 1] = dansLaListe;
  }

  return { visibles, reste: liste.length - visibles.length };
}
