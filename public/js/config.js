/**
 * FairSplit - Configuration
 * @description Constantes et configuration Firebase
 *
 * Un seul environnement Firebase (fairsplit-foyer), une seule branche (main).
 *
 * Le double environnement TEST/PROD a été retiré : il imposait une divergence
 * permanente de ce fichier entre branches, donc un conflit à chaque merge, et
 * la PROD n'a jamais été alimentée (config en placeholders, base désactivée).
 *
 * Pour essayer sans toucher aux données réelles : FairSplit.html?sandbox=1.
 * Isolation plus stricte si la machine le permet : npm run emulators, puis
 * FairSplit.html?emulator=1.
 */

// ===== VERSION =====
export const VERSION = '4.0.0';

// ===== FIREBASE CONFIGURATION =====
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAq6JXMuVeua9xJ2hEw93GFOa_U8XJplgY",
  authDomain: "fairsplit-foyer.firebaseapp.com",
  databaseURL: "https://fairsplit-foyer-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fairsplit-foyer",
  storageBucket: "fairsplit-foyer.firebasestorage.app",
  messagingSenderId: "41121556897",
  appId: "1:41121556897:web:1ac9a7ab86649d489ec3e0"
};

// ===== APP CHECK =====
/**
 * Clé de site reCAPTCHA, pour App Check
 *
 * App Check atteste que la requête vient bien de cette application, et non
 * d'un script quelconque muni de la clé API — laquelle est publique par
 * construction. C'est ce qui manque aux règles de sécurité : elles vérifient
 * *qui* parle, pas *d'où*. Sans lui, rien ne limite les tentatives de mot de
 * passe contre les comptes du foyer.
 *
 * Cette clé est publique elle aussi : elle est livrée dans le JavaScript, et
 * ne vaut que pour le domaine déclaré dans la console reCAPTCHA. La renseigner
 * ici active l'attestation ; la laisser vide la désactive proprement.
 *
 * ⚠️ Ne pas activer l'application forcée d'App Check dans la console Firebase
 * tant que cette valeur est vide : toute requête serait refusée, et
 * l'application n'afficherait plus rien.
 *
 * Déclarée pour richiebigotscoarnec.github.io, d'où l'application est servie.
 * Renseigner cette clé fait envoyer des attestations sans qu'aucune ne soit
 * encore exigée : c'est la phase d'observation, à lire dans la console Firebase
 * sous App Check → API. L'application forcée ne s'active qu'ensuite, une fois
 * la part de requêtes vérifiées proche de la totalité — sans quoi on coupe
 * l'accès aux appareils qui n'ont pas encore rechargé l'application.
 */
export const APP_CHECK_SITE_KEY = '6Lf5EJMtAAAAAHpw5l7IBNpWnug5K8yaahIYPRDT';

/**
 * Fournisseur d'attestation : 'recaptcha-v3' ou 'recaptcha-enterprise'
 *
 * Les deux se configurent dans la console Firebase, sous App Check. La v3
 * suffit à un usage familial ; Enterprise ne change ici que la classe
 * instanciée.
 */
export const APP_CHECK_PROVIDER = 'recaptcha-v3';

/**
 * `?appcheck=0` — ouvrir l'application sans attestation, le temps d'un essai
 *
 * L'attestation est passée par une panne qu'on ne pouvait ni voir ni écarter :
 * la politique de sécurité de la page interdisait à reCAPTCHA ses propres
 * requêtes, il ne rendait donc aucun jeton, et App Check répondait « 400 » puis
 * se mettait en attente. Pendant ce temps la base restait injoignable, sur un
 * téléphone dont le réseau fonctionnait parfaitement — deux faits qu'aucune
 * observation ne reliait.
 *
 * Ce commutateur est le fil qui les relie : si l'application va bien avec
 * `?appcheck=0` et mal sans, l'attestation est en cause ; si elle va mal des
 * deux côtés, elle est hors de cause. Une réponse en un rechargement, contre
 * une supposition de plus.
 *
 * Il n'ouvre aucun accès : App Check ne protège rien côté client, il *prouve*
 * quelque chose côté serveur. Ne pas le présenter, c'est refuser de s'attester
 * — précisément ce que fait n'importe quel script qui viserait la base. Le
 * jour où l'application forcée sera activée dans la console, une page ouverte
 * ainsi se verra refuser ses requêtes, comme il se doit.
 */
export const APP_CHECK_DESACTIVE =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('appcheck') === '0';

// ===== ESPACE DE DONNÉES =====
// `?sandbox=1` bascule l'application sur un espace isolé, dans le même projet
// Firebase et sous la même liste blanche. Il remplace l'ancienne base de test
// séparée : essayer librement, puis saisir pour de vrai dans l'espace du foyer.
//
// L'émulateur reste préférable sur une machine qui peut l'exécuter, mais il
// exige un JDK 21+ et un port libre — deux conditions non réunies partout.
export const IS_SANDBOX =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('sandbox') === '1';

/** Racine des données : espace du foyer, ou bac à sable isolé */
export const DATA_ROOT = IS_SANDBOX ? 'sandbox' : 'household';

// ===== ÉMULATEUR LOCAL (opt-in) =====
// Activé uniquement via ?emulator=1 dans l'URL : brancher l'émulateur
// automatiquement sur localhost casserait `npm run serve` quand il n'est
// pas lancé.
export const USE_EMULATOR =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('emulator') === '1';

export const EMULATOR_PORTS = { database: 9010, auth: 9099 };

// ===== CATEGORIES =====
// Les identifiants comptent autant que les libellés : `utils/categorie-lieu.js`
// les vise nommément pour déduire la catégorie du lieu où l'on se trouve.
//
// Cette table reconnaît 81 types de lieux OpenStreetMap, chacun visant
// plusieurs catégories par ordre de préférence. Douze de ces types avaient pour
// premier choix `bar`, `cafe` ou `boulangerie` — trois catégories qui
// n'existaient pas ici. Un café était donc rangé en « Restaurant », une
// boulangerie en « Courses » : le repli fonctionnait, la précision se perdait.
// `tests/utils/categorie-lieu.test.js` compare désormais les deux fichiers, et
// tombe si l'un vise une catégorie que l'autre ne fournit pas.
export const CATEGORIES = [
  { id: 'courses', icon: '🛒', label: 'Courses', color: '#4caf50' },
  { id: 'maison', icon: '🏠', label: 'Maison', color: '#2196f3' },
  { id: 'essence', icon: '🚗', label: 'Essence', color: '#ff9800' },
  { id: 'restaurant', icon: '🍕', label: 'Restaurant', color: '#e91e63' },
  { id: 'cafe', icon: '☕', label: 'Café', color: '#8d6e63' },
  { id: 'bar', icon: '🍺', label: 'Bar', color: '#fbc02d' },
  { id: 'boulangerie', icon: '🥐', label: 'Boulangerie', color: '#d4a373' },
  { id: 'sante', icon: '💊', label: 'Santé', color: '#9c27b0' },
  { id: 'loisirs', icon: '🎮', label: 'Loisirs', color: '#00bcd4' },
  { id: 'transport', icon: '🚌', label: 'Transport', color: '#795548' },
  { id: 'autre', icon: '⚡', label: 'Autre', color: '#607d8b' }
];

// ===== PAYMENT TYPES =====
export const PAYMENT_TYPES = {
  VOUS: 'vous',
  CONJOINTE: 'conjointe',
  PARTAGE: 'partage',
  BOTH: 'both'
};

// ===== SENS D'UN REMBOURSEMENT =====
// Ces valeurs sont écrites en base ET comparées dans les calculs : elles
// doivent aussi être les `value` des <option> du formulaire. L'absence de
// constante partagée avait laissé le HTML dériver vers from-you/from-partner
// pendant que la logique testait encore vous-to-conjointe — donc aucune
// correspondance, et tout remboursement compté à l'envers.
export const REIMBURSEMENT_DIRECTIONS = {
  YOU_TO_PARTNER: 'vous-to-conjointe',
  PARTNER_TO_YOU: 'conjointe-to-vous'
};

// ===== SPLIT MODES =====
export const SPLIT_MODES = {
  PRORATA: 'prorata',
  FIFTY_FIFTY: '50-50',
  CUSTOM: 'custom'
};

// ===== DESTINATIONS DE VIREMENT =====
export const DESTINATIONS = [
  { id: 'env-charges-fixes', label: 'Env. Charges Fixes', icon: '🏦' },
  { id: 'compte-commun', label: 'Compte Commun', icon: '🤝' },
  { id: 'env-ordures', label: 'Env. Ordures', icon: '🗑️' },
  { id: 'env-taxe-fonciere', label: 'Env. Taxe Foncière', icon: '🏡' },
  { id: 'compte-perso', label: 'Compte Perso', icon: '👤' },
  { id: 'autre', label: 'Autre', icon: '📋' }
];

// ===== ACCÈS AUTORISÉS =====
/**
 * L'inscription libre est-elle ouverte ?
 *
 * Le fournisseur e-mail/mot de passe étant actif, un bouton « Créer un compte »
 * exposé publiquement permettrait à quiconque atteint l'URL de créer un compte
 * dans le projet Firebase. La liste blanche le déconnecterait aussitôt et les
 * règles lui refuseraient toute lecture — l'effet se limite à l'accumulation de
 * comptes parasites, mais elle est inutile : les comptes du foyer existent.
 *
 * Ce drapeau ne ferme pour autant aucune porte : `accounts:signUp` reste
 * joignable avec la clé publique du projet, qui figure ci-dessus. Masquer un
 * bouton n'est pas une mesure de sécurité. Ce qui protège l'espace du foyer,
 * c'est que ses règles exigent `email_verified` : un compte créé par cette API
 * et laissé en l'état n'y accède pas, même s'il porte une adresse de la liste
 * blanche. Le bac à sable, lui, accueille le compte de test, qui s'authentifie
 * par mot de passe sans adresse à prouver.
 *
 * Le parcours d'inscription est conservé, pas supprimé : une mise à disposition
 * plus large de l'application le rendrait nécessaire. Passer cette valeur à
 * `true` le rétablit, bouton et fonction comprises.
 */
export const SIGNUP_ENABLED = false;

export const ALLOWED_EMAILS = [
  'bigot.richard@gmail.com',
  'cindypepe.cp95@gmail.com',
  'testfairsplit@gmail.com'
];

/**
 * Quel emplacement du foyer occupe chaque compte
 *
 * Les données ont deux emplacements fixes, `vous` et `conjointe`, et les deux
 * comptes lisent le même enregistrement. L'application savait donc afficher les
 * bons prénoms, mais elle ignorait lequel des deux tenait le téléphone : la
 * saisie rapide partait sur `vous` en dur, à chaque ouverture.
 *
 * Conséquence, sur le second téléphone : chaque dépense saisie sans y penser
 * était attribuée à l'autre, et le solde — la seule chose que cette application
 * calcule — partait de travers sans le moindre signal.
 *
 * Une adresse absente de cette table retombe sur `vous`, c'est-à-dire sur le
 * comportement d'avant : aucun compte ne perd l'usage de l'application faute
 * d'y figurer.
 *
 * Le compte de test occupe `vous` : il travaille seul dans le bac à sable, et
 * n'a pas de conjoint dont il faudrait le distinguer.
 */
export const EMPLACEMENTS_PAR_COMPTE = {
  'bigot.richard@gmail.com': 'vous',
  'cindypepe.cp95@gmail.com': 'conjointe',
  'testfairsplit@gmail.com': 'vous'
};

/**
 * Comptes cantonnés au bac à sable, quelle que soit l'URL.
 *
 * Le compte de test existe pour exercer l'application contre le vrai Firebase,
 * et son mot de passe circule. Faire dépendre son isolement du paramètre
 * `?sandbox=1` reviendrait à confier la séparation des données à la mémoire de
 * celui qui ouvre l'application. Les règles de sécurité lui refusent déjà
 * `household` ; cette liste évite en plus qu'il ne s'y adresse pour rien.
 */
export const SANDBOX_ONLY_EMAILS = [
  'testfairsplit@gmail.com'
];

/**
 * Racine des données applicable à un compte
 *
 * @param {string|null} email - Adresse du compte authentifié
 * @returns {string} 'sandbox' ou 'household'
 */
export function resolveDataRoot(email) {
  if (email && SANDBOX_ONLY_EMAILS.includes(email)) return 'sandbox';
  return DATA_ROOT;
}

// ===== VALIDATION LIMITS =====
export const LIMITS = {
  MAX_SALARY: 100000,
  // Les formulaires de charge, de charge fixe et de remboursement plafonnaient
  // a 100 000 EUR, la saisie rapide a 50 000, et cette constante -- que
  // personne ne consultait -- a 50 000. Une meme charge etait donc acceptee
  // par un formulaire et refusee par l'autre. On retient la valeur des trois
  // chemins principaux : aucune saisie valide aujourd'hui ne devient invalide.
  MAX_CHARGE: 100000,
  MAX_NAME_LENGTH: 100,
  MAX_NOTE_LENGTH: 500
};

// ===== UI CONSTANTS =====
export const UI = {
  TOAST_DURATION: 3000,
  UNDO_DURATION: 5000,
  DEBOUNCE_DELAY: 300,
  ANIMATION_DURATION: 300
};

// ===== DATABASE PATHS =====
export const DB_PATHS = {
  SALARIES: 'salaries',
  PERIODS: 'periods',
  SHARE_MODE: 'shareMode',
  REMINDERS: 'reminders',
  CUSTOM_CATEGORIES: 'customCategories',
  CUSTOM_DESTINATIONS: 'customDestinations'
};
