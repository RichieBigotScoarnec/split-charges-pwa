/**
 * FairSplit — Déduire la catégorie d'une dépense du lieu où l'on se trouve
 *
 * La saisie rapide connaissait quatre types de lieux : supermarché, station-
 * service, restaurant, pharmacie. OpenStreetMap en distingue des centaines. Une
 * boulangerie est taguée `bakery`, un bar `bar`, un cinéma `cinema` : aucun
 * n'était reconnu, et le repli sur le nom ne rattrapait qu'une poignée
 * d'enseignes. « Brioche Dorée » ne correspondait à rien.
 *
 * Deux principes tiennent cette table.
 *
 * D'abord : ne proposer que ce dont on est sûr. Une catégorie choisie à tort
 * est pire que pas de catégorie du tout — elle part en base sans qu'on la
 * relise, alors qu'une absence se voit et se corrige. Les types ambigus
 * (`shop=clothes`, `building=yes`) ne figurent donc pas ici.
 *
 * Ensuite : chaque type vise plusieurs catégories, par ordre de préférence. Le
 * foyer choisit ses catégories ; rien ne garantit qu'il ait un « Bar ». Un
 * `bar` cherche donc « bar », puis « restaurant », puis « loisirs », et retient
 * la première qui existe réellement. Viser une seule catégorie reviendrait à ne
 * rien détecter chez qui ne l'a pas créée.
 */

/**
 * Types de lieux OpenStreetMap, et les catégories qu'ils visent.
 *
 * Les identifiants sont ceux qu'engendre la création d'une catégorie dans
 * l'application : le libellé en minuscules, espaces en tirets. « Bar » donne
 * donc `bar`, « Boulangerie » donne `boulangerie`.
 */
const TYPES = {
  // ===== Boire =====
  bar: ['bar', 'restaurant', 'loisirs'],
  pub: ['bar', 'restaurant', 'loisirs'],
  biergarten: ['bar', 'restaurant', 'loisirs'],
  nightclub: ['bar', 'loisirs'],
  cafe: ['cafe', 'bar', 'restaurant'],
  coffee: ['cafe', 'bar', 'restaurant'],

  // ===== Manger sur place =====
  restaurant: ['restaurant'],
  fast_food: ['restaurant'],
  food_court: ['restaurant'],
  ice_cream: ['restaurant'],

  // ===== Boulangerie et pâtisserie =====
  // Le cas signalé : « Brioche Dorée » est taguée `bakery`.
  bakery: ['boulangerie', 'courses'],
  pastry: ['boulangerie', 'courses'],
  confectionery: ['boulangerie', 'courses'],
  chocolate: ['boulangerie', 'courses'],

  // ===== Courses =====
  supermarket: ['courses'],
  convenience: ['courses'],
  grocery: ['courses'],
  greengrocer: ['courses'],
  butcher: ['courses'],
  seafood: ['courses'],
  deli: ['courses'],
  cheese: ['courses'],
  farm: ['courses'],
  frozen_food: ['courses'],
  beverages: ['courses'],
  alcohol: ['courses'],
  wine: ['courses'],
  marketplace: ['courses'],

  // ===== Véhicule =====
  fuel: ['essence'],
  charging_station: ['essence'],
  car_wash: ['transport', 'essence'],
  car_repair: ['transport'],
  parking: ['transport'],

  // ===== Se déplacer =====
  bus_station: ['transport'],
  train_station: ['transport'],
  station: ['transport'],
  subway: ['transport'],
  tram_stop: ['transport'],
  taxi: ['transport'],
  ferry_terminal: ['transport'],
  aerodrome: ['transport'],
  bicycle_rental: ['transport'],
  car_rental: ['transport'],

  // ===== Santé =====
  pharmacy: ['sante'],
  chemist: ['sante'],
  doctors: ['sante'],
  dentist: ['sante'],
  hospital: ['sante'],
  clinic: ['sante'],
  veterinary: ['sante'],
  optician: ['sante'],
  hearing_aids: ['sante'],

  // ===== Loisirs =====
  cinema: ['loisirs'],
  theatre: ['loisirs'],
  museum: ['loisirs'],
  casino: ['loisirs'],
  zoo: ['loisirs'],
  theme_park: ['loisirs'],
  water_park: ['loisirs'],
  bowling_alley: ['loisirs'],
  fitness_centre: ['loisirs'],
  sports_centre: ['loisirs'],
  swimming_pool: ['loisirs'],
  golf_course: ['loisirs'],
  climbing: ['loisirs'],
  books: ['loisirs'],
  video_games: ['loisirs'],
  music: ['loisirs'],
  toys: ['loisirs'],

  // ===== Maison =====
  doityourself: ['maison'],
  hardware: ['maison'],
  furniture: ['maison'],
  garden_centre: ['maison'],
  houseware: ['maison'],
  paint: ['maison'],
  florist: ['maison'],
  appliance: ['maison'],
  electronics: ['maison'],
  bed: ['maison'],
  kitchen: ['maison'],
  trade: ['maison']
};

/**
 * Enseignes reconnues par leur nom, quand le type ne dit rien.
 *
 * Certains lieux sont mal tagués, ou tagués trop généralement
 * (`building=retail`). Le nom reste alors le seul indice. Ces motifs ne servent
 * qu'en second : un type explicite prime toujours.
 */
const ENSEIGNES = [
  { motif: /leclerc|carrefour|intermarch|auchan|lidl|aldi|super\s?u|hyper\s?u|casino shop|monoprix|franprix|picard|grand frais|biocoop|netto|cora/, vise: ['courses'] },
  { motif: /total|totalenergies|esso|shell|\bbp\b|avia|elan\b|station[- ]service/, vise: ['essence'] },
  { motif: /boulangerie|p[âa]tisserie|brioche dor[ée]e|paul\b|marie blachère|ange\b|banette/, vise: ['boulangerie', 'courses'] },
  { motif: /restaurant|pizzeria|brasserie|bistrot|bistro|kebab|mcdo|mcdonald|burger|sushi|tacos|buffalo grill|flunch|courtepaille/, vise: ['restaurant'] },
  { motif: /\bbar\b|\bpub\b|taverne|brewery|brasserie artisanale/, vise: ['bar', 'restaurant'] },
  { motif: /caf[ée]|starbucks|columbus caf/, vise: ['cafe', 'bar', 'restaurant'] },
  { motif: /pharmacie|clinique|h[ôo]pital|m[ée]decin|laboratoire|dentiste|opticien|krys|afflelou/, vise: ['sante'] },
  { motif: /cin[ée]ma|pathé|gaumont|ugc|kinepolis|mus[ée]e|th[ée][âa]tre|bowling|piscine|patinoire/, vise: ['loisirs'] },
  { motif: /leroy merlin|castorama|bricomarch|bricorama|weldom|ikea|but\b|conforama|jardiland|truffaut|gamm vert/, vise: ['maison'] },
  { motif: /sncf|gare\b|a[ée]roport|p[ée]age|autoroute|parking|vinci park/, vise: ['transport'] }
];

/**
 * Première catégorie existante parmi celles visées
 *
 * @param {string[]} vises - Identifiants de catégories, par préférence
 * @param {Array} categories - Catégories réellement définies par le foyer
 * @returns {Object|null}
 */
function premiereExistante(vises, categories) {
  for (const id of vises) {
    const trouvee = categories.find(categorie => categorie && categorie.id === id);
    if (trouvee) return trouvee;
  }
  return null;
}

/**
 * Catégorie déduite d'un lieu, ou null si rien de sûr ne s'en dégage
 *
 * @param {Object|null} lieu - Sortie de `decrireLieu`
 * @param {Array} categories - Catégories du foyer (`getCategories()`)
 * @returns {Object|null} Catégorie choisie, null si aucune certitude
 */
export function categoriePourLieu(lieu, categories) {
  if (!lieu || typeof lieu !== 'object') return null;
  if (!Array.isArray(categories) || categories.length === 0) return null;

  // Le type d'abord : c'est une donnée structurée, là où le nom est une chaîne
  // que n'importe qui a pu saisir dans OpenStreetMap.
  const type = typeof lieu.type === 'string' ? lieu.type.toLowerCase() : '';
  if (TYPES[type]) {
    const parLeType = premiereExistante(TYPES[type], categories);
    if (parLeType) return parLeType;
  }

  const texte = `${lieu.nom || ''} ${lieu.adresseComplete || ''}`.toLowerCase();
  if (!texte.trim()) return null;

  for (const { motif, vise } of ENSEIGNES) {
    if (motif.test(texte)) {
      const parLeNom = premiereExistante(vise, categories);
      if (parLeNom) return parLeNom;
    }
  }

  return null;
}

/**
 * Types reconnus, pour les tests et le diagnostic
 * @returns {string[]}
 */
export function typesReconnus() {
  return Object.keys(TYPES);
}
