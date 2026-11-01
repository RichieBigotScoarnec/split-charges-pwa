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
 * relise, alors qu'une absence se voit et se corrige. Les types réellement
 * ambigus (`building=yes`, `shop=yes`) ne figurent donc pas ici.
 *
 * `shop=clothes` et `shop=hairdresser` y figuraient à tort : ils ne sont pas
 * ambigus, ils n'avaient simplement aucune catégorie à viser.
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
import { CATEGORIES } from '../config.js';
import { plier } from './recherche-texte.js';

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

  // Le stationnement et le péage sortent de « Transport », où ils se
  // confondaient avec le billet de train. Ce sont des dépenses de voiture, et
  // c'est à ce titre qu'on veut les lire.
  //
  // Le péage se paie en roulant : la position détectée sera rarement la
  // barrière elle-même, plutôt l'aire d'après. La détection ne le rattrapera
  // donc pas toujours — mais la catégorie existe pour la saisie du soir, et
  // c'est déjà ce qui manquait.
  parking: ['parking', 'transport'],
  toll_booth: ['peage', 'transport'],
  toll_gantry: ['peage', 'transport'],

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

  // ===== Culture =====
  // Dix-sept types tombaient dans « Loisirs » : un cinéma, une séance de
  // piscine et une console y comptaient pour la même chose, et le bilan ne
  // pouvait rien en dire. Le repli sur « Loisirs » reste, pour les foyers qui
  // n'ont pas ces catégories.
  cinema: ['culture', 'loisirs'],
  theatre: ['culture', 'loisirs'],
  museum: ['culture', 'loisirs'],
  gallery: ['culture', 'loisirs'],
  books: ['culture', 'loisirs'],
  music: ['culture', 'loisirs'],
  musical_instrument: ['culture', 'loisirs'],

  // ===== Sport =====
  fitness_centre: ['sport', 'loisirs'],
  sports_centre: ['sport', 'loisirs'],
  swimming_pool: ['sport', 'loisirs'],
  golf_course: ['sport', 'loisirs'],
  climbing: ['sport', 'loisirs'],
  sports: ['sport', 'loisirs'],

  // ===== Se distraire =====
  casino: ['loisirs'],
  zoo: ['loisirs'],
  theme_park: ['loisirs'],
  water_park: ['loisirs'],
  bowling_alley: ['loisirs'],
  video_games: ['loisirs'],
  toys: ['loisirs'],

  // ===== S'habiller, se coiffer =====
  // `shop=clothes` et `shop=hairdresser` figuraient parmi les types écartés
  // pour ambiguïté. Ils ne l'étaient pas : ils n'avaient simplement aucune
  // catégorie à viser, et les ranger sous « Maison » ou « Autre » n'apprenait
  // rien. Maintenant qu'il existe où les mettre, ils entrent.
  clothes: ['vetements'],
  shoes: ['vetements'],
  bag: ['vetements'],
  jewelry: ['vetements'],
  boutique: ['vetements'],
  hairdresser: ['coiffeur'],
  beauty: ['coiffeur', 'sante'],

  // ===== Maison =====
  furniture: ['maison'],
  houseware: ['maison'],
  appliance: ['maison'],
  electronics: ['maison'],
  bed: ['maison'],
  kitchen: ['maison'],

  // ===== Bricolage =====
  // Douze types tombaient dans « Maison » : une perceuse et un canapé y
  // comptaient pour la même chose.
  doityourself: ['bricolage', 'maison'],
  hardware: ['bricolage', 'maison'],
  paint: ['bricolage', 'maison'],
  trade: ['bricolage', 'maison'],

  // ===== Jardin =====
  garden_centre: ['jardin', 'maison'],
  florist: ['jardin', 'maison']
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
  // Mêmes candidates que le type correspondant plus haut : reconnaître un bar
  // par son nom ou par son tag ne doit pas ouvrir deux jeux de choix
  // différents, sinon l'arbitrage par les habitudes dépend de la façon dont
  // OpenStreetMap se trouve avoir décrit l'endroit.
  { motif: /\bbar\b|\bpub\b|taverne|brewery|brasserie artisanale/, vise: ['bar', 'restaurant', 'loisirs'] },
  { motif: /caf[ée]|starbucks|columbus caf/, vise: ['cafe', 'bar', 'restaurant'] },
  { motif: /pharmacie|clinique|h[ôo]pital|m[ée]decin|laboratoire|dentiste|opticien|krys|afflelou/, vise: ['sante'] },
  { motif: /cin[ée]ma|pathé|gaumont|ugc|kinepolis|mus[ée]e|th[ée][âa]tre|bowling|piscine|patinoire/, vise: ['loisirs'] },
  { motif: /leroy merlin|castorama|bricomarch|bricorama|weldom|ikea|but\b|conforama|jardiland|truffaut|gamm vert/, vise: ['maison'] },
  { motif: /sncf|gare\b|a[ée]roport|p[ée]age|autoroute|parking|vinci park/, vise: ['transport'] }
];

/**
 * Meilleure catégorie parmi celles que vise un type
 *
 * L'ordre de la table classe les candidates par précision : pour un bar,
 * « Bar » dit exactement la chose, « Restaurant » l'approche, « Loisirs » la
 * range. La règle en découle, en deux temps.
 *
 * La candidate exacte, si le foyer l'a créée, l'emporte toujours : elle ne se
 * discute pas.
 *
 * À défaut, ce sont les habitudes qui tranchent, et non l'ordre écrit ici. Un
 * foyer qui range invariablement ses sorties sous « Loisirs » a raison contre
 * la table : c'est lui qui saisit. Le classement par précision ne sert plus
 * alors qu'à départager ce que l'usage laisse à égalité.
 *
 * @param {string[]} vises - Identifiants de catégories, du plus précis au plus large
 * @param {Array} categories - Catégories réellement définies par le foyer
 * @param {Array} habitudes - Catégories du foyer, de la plus employée à la moins
 * @returns {Object|null}
 */
function meilleureCandidate(vises, categories, habitudes) {
  const existantes = vises
    .map(id => categories.find(categorie => categorie && categorie.id === id))
    .filter(Boolean);

  if (existantes.length === 0) return null;

  // La candidate exacte est le premier élément de la table : si elle existe,
  // elle est en tête de `existantes`.
  if (existantes[0].id === vises[0]) return existantes[0];

  if (!Array.isArray(habitudes) || habitudes.length === 0) return existantes[0];

  const employeeLe = new Map(habitudes.map((categorie, rang) => [categorie && categorie.id, rang]));

  // Jamais employée : reléguée derrière toutes celles qui le sont, sans être
  // écartée — c'est peut-être la première fois qu'on va dans ce genre d'endroit.
  const rangDusage = categorie => (
    employeeLe.has(categorie.id) ? employeeLe.get(categorie.id) : Number.MAX_SAFE_INTEGER
  );

  return existantes.reduce((meilleure, candidate) => (
    rangDusage(candidate) < rangDusage(meilleure) ? candidate : meilleure
  ));
}

/**
 * Catégorie déduite d'un lieu, ou null si rien de sûr ne s'en dégage
 *
 * @param {Object|null} lieu - Sortie de `decrireLieu`
 * @param {Array} categories - Catégories du foyer (`getCategories()`)
 * @param {Array} [habitudes] - Catégories du foyer, de la plus employée à la
 *        moins (`categoriesFrequentes`). Départage les replis quand la
 *        catégorie exacte n'existe pas. Omise, la table décide seule.
 * @returns {Object|null} Catégorie choisie, null si aucune certitude
 */
export function categoriePourLieu(lieu, categories, habitudes = []) {
  if (!lieu || typeof lieu !== 'object') return null;
  if (!Array.isArray(categories) || categories.length === 0) return null;

  // Le type d'abord : c'est une donnée structurée, là où le nom est une chaîne
  // que n'importe qui a pu saisir dans OpenStreetMap.
  const type = typeof lieu.type === 'string' ? lieu.type.toLowerCase() : '';
  if (TYPES[type]) {
    const parLeType = meilleureCandidate(TYPES[type], categories, habitudes);
    if (parLeType) return parLeType;
  }

  const texte = `${lieu.nom || ''} ${lieu.adresseComplete || ''}`.toLowerCase();
  if (!texte.trim()) return null;

  for (const { motif, vise } of ENSEIGNES) {
    if (motif.test(texte)) {
      const parLeNom = meilleureCandidate(vise, categories, habitudes);
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

/**
 * Les catégories que cette table sait reconnaître et qui manquent au foyer
 *
 * Ajouter des catégories aux défauts de `config.js` ne suffit pas : dès qu'un
 * foyer a modifié sa liste une fois, elle est écrite en base et les défauts ne
 * l'atteignent plus jamais. Un foyer installé de longue date resterait donc
 * sans « Café », « Bar » ni « Boulangerie », et douze types de lieux
 * continueraient de se ranger sous un à-peu-près.
 *
 * D'où cette fonction, qui alimente une proposition explicite dans la gestion
 * des catégories. Rien n'est ajouté sans qu'on le demande : la liste appartient
 * au foyer, et la compléter d'office reviendrait à décider à sa place.
 *
 * La comparaison porte sur l'identifiant **et** sur le libellé plié : un foyer
 * qui a créé « Cafe » sans accent possède déjà cette catégorie, sous un
 * identifiant que la table ne vise pas. La lui proposer ferait un doublon.
 *
 * @param {Array} actuelles - Catégories du foyer (`getCategories()`)
 * @returns {Array} Définitions complètes à ajouter, vide s'il n'en manque aucune
 */
export function categoriesQueLeGpsAttend(actuelles) {
  const liste = Array.isArray(actuelles) ? actuelles.filter(Boolean) : [];

  const identifiants = new Set(liste.map(c => String(c.id || '').toLowerCase()));
  const libelles = new Set(liste.map(c => plier(String(c.label || ''))));

  const visees = new Set(Object.values(TYPES).flat());

  return CATEGORIES.filter(categorie =>
    visees.has(categorie.id)
    && !identifiants.has(categorie.id)
    && !libelles.has(plier(categorie.label))
  );
}
