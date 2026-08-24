/**
 * FairSplit - Database Abstraction
 * @description Couche d'accès à Firebase Realtime Database
 * @version 3.0.0 - Espace foyer unique
 *
 * Toutes les données vivent sous un espace unique `household/`, partagé par
 * les comptes de la liste blanche.
 *
 * L'architecture précédente scopait chaque nœud par UID et ajoutait une table
 * `partners` redirigeant un « Partner » vers l'espace d'un « Owner ». Elle a
 * été retirée : la liste blanche est figée à deux adresses dans les règles, il
 * n'y a donc aucun cloisonnement à assurer, et l'indirection n'apportait pas
 * une capacité de plus. Elle coûtait en revanche une sémantique trompeuse —
 * `partners/{moi} = X` signifiait « je lis les données de X » alors que
 * l'interface laissait croire à une relation mutuelle — qui a produit des
 * accès rompus.
 *
 * Conséquence : plus rien à configurer. Un compte autorisé se connecte et voit
 * les données du foyer.
 */

import { DB_PATHS, resolveDataRoot } from './config.js';
import { log, warn } from './utils/debug.js';
import { noter } from './utils/diagnostics.js';
import {
  memoriserLecture,
  lectureMemorisee,
  empiler,
  operationsEnAttente,
  retirerOperation,
  nombreEnAttente,
  oublierTout,
  appliquerOperations
} from './utils/miroir.js';

// Firebase database reference (set after initialization)
let database = null;

// Un utilisateur est-il authentifié ? Sert uniquement de garde-fou : le
// contrôle d'accès réel est assuré par database.rules.json.
let isAuthenticated = false;

// Racine des données du compte connecté. Un compte de test est cantonné au bac
// à sable quelle que soit l'URL : son mot de passe circule, et faire dépendre
// la séparation des données d'un paramètre d'adresse reviendrait à la confier
// à la mémoire de celui qui ouvre l'application.
let dataRoot = resolveDataRoot(null);

/**
 * Initialize database reference
 * @param {Object} db - Firebase database instance
 */
export function initDatabase(db) {
  database = db;
}

/**
 * Enregistre l'état d'authentification (appelé au changement d'état auth)
 * @param {string|null} uid - UID de l'utilisateur, ou null à la déconnexion
 */
export function setAuthenticatedUser(uid, email = null) {
  isAuthenticated = Boolean(uid);
  dataRoot = resolveDataRoot(isAuthenticated ? email : null);
  log(isAuthenticated
    ? `[DB] Utilisateur authentifié — espace « ${dataRoot} »`
    : '[DB] Utilisateur déconnecté');
}

/**
 * Espace de données du compte connecté
 * @returns {string} 'household' ou 'sandbox'
 */
export function getDataRoot() {
  return dataRoot;
}

/**
 * Construit un chemin dans l'espace de données courant
 *
 * La racine vaut `household` en usage normal, `sandbox` avec ?sandbox=1 ou
 * pour un compte cantonné au bac à sable.
 *
 * @param {string} path - Chemin relatif (ex. 'salaries', 'periods/2026-01')
 * @returns {string} Chemin absolu (ex. 'household/periods/2026-01')
 */
export function getDataPath(path) {
  if (!isAuthenticated) {
    throw new Error('User not authenticated. Cannot access database.');
  }
  return path ? `${dataRoot}/${path}` : dataRoot;
}

// ===== ÉTAT DE LA LIAISON =====

/**
 * La base est-elle joignable ?
 *
 * Trois valeurs, et la troisième compte autant que les deux autres :
 * `null` signifie « on ne sait pas encore ». Firebase annonce « déconnecté »
 * pendant qu'il établit sa liaison, à chaque ouverture. Traiter cet instant
 * comme une coupure enverrait les premières lectures au miroir alors que le
 * réseau va répondre — et le miroir serait alors préféré à la vérité.
 */
let liaison = null;

/**
 * A-t-on vu la liaison s'établir au moins une fois depuis l'ouverture ?
 *
 * `.info/connected` vaut `false` à la souscription et le reste le temps que la
 * liaison s'établisse — quelques centaines de millisecondes à chaque
 * ouverture. Sans cette distinction, la toute première annonce était prise
 * pour une panne, et l'application servait le miroir au démarrage alors que le
 * réseau allait répondre : elle aurait affiché des données périmées sur une
 * connexion parfaitement saine.
 */
let dejaJointe = false;

/** Un rejeu à la fois : deux en parallèle enverraient les mêmes écritures deux fois */
let rejeuEnCours = false;

/** Prévenu à chaque mouvement de la file, pour que le bandeau reste exact */
let temoinDeFile = null;

/**
 * Fait suivre les mouvements de la file d'attente
 *
 * `db.js` ne connaît aucun élément d'interface, et ne doit pas en connaître :
 * il est importé par vingt-deux modules, dont plusieurs tournent sans DOM dans
 * les bancs d'essai. Le bandeau s'abonne, `db.js` se contente de signaler.
 *
 * @param {Function|null} rappel - Reçoit le nombre de saisies en attente
 * @returns {void}
 */
export function surFileModifiee(rappel) {
  temoinDeFile = typeof rappel === 'function' ? rappel : null;
}

/** Signale le nombre de saisies en attente, sans jamais rompre l'appelant */
function signalerFile() {
  if (!temoinDeFile) return;
  try {
    temoinDeFile(saisiesEnAttente());
  } catch {
    // Un abonné défaillant ne doit pas faire échouer une écriture.
  }
}

/**
 * Enregistre l'état de la liaison, tel que `.info/connected` le rapporte
 *
 * `navigator.onLine` ne convient pas : sur la panne signalée en production le
 * réseau fonctionnait, seul le domaine de la base était refusé par un bouclier
 * de navigateur. Seul Firebase sait s'il joint son serveur.
 *
 * @param {boolean} connecte
 * @returns {void}
 */
export function signalerLiaison(connecte) {
  if (connecte) {
    dejaJointe = true;
    liaison = true;
    return;
  }

  // Une annonce de coupure avant toute connexion, c'est l'établissement de la
  // liaison, pas une panne — à moins que l'appareil ne se sache lui-même hors
  // réseau. `navigator.onLine` ne vaut rien pour affirmer qu'on est en ligne ;
  // il vaut, lui, pour affirmer qu'on ne l'est pas.
  liaison = (dejaJointe || sansReseau()) ? false : null;
}

/**
 * L'appareil se sait-il hors réseau ?
 * @returns {boolean}
 */
function sansReseau() {
  return typeof navigator === 'object' && navigator !== null && navigator.onLine === false;
}

/**
 * Constate une coupure au vu d'une opération restée sans réponse
 *
 * Sans cela, chaque étape de l'initialisation paierait ses dix secondes de
 * délai de garde : une douzaine de lectures, deux minutes d'écran vide. La
 * première qui n'obtient rien renseigne toutes les suivantes.
 *
 * @returns {void}
 */
function constaterCoupure() {
  liaison = false;
}

/**
 * La liaison est-elle rompue de façon établie ?
 * @returns {boolean} false tant que l'état n'est pas connu
 */
export function liaisonRompue() {
  return liaison === false;
}

/**
 * Combien de saisies attendent de partir
 * @returns {number}
 */
export function saisiesEnAttente() {
  return nombreEnAttente(dataRoot);
}

/**
 * Efface le miroir et la file de l'espace courant
 *
 * Appelé à la déconnexion : les montants d'un foyer n'ont rien à faire sur
 * l'appareil d'un compte qui n'y a plus accès.
 *
 * @returns {void}
 */
export function oublierHorsLigne() {
  oublierTout(dataRoot);
}

/**
 * Renvoie les écritures en attente, dans l'ordre
 *
 * Toutes s'arrêtent à la première qui résiste. Rejouer la suite reviendrait à
 * écraser une correction par la version qu'elle corrigeait : la file est un
 * ordre, pas un sac.
 *
 * @returns {Promise<{envoyees: number, restantes: number, erreur: string|null}>}
 */
export async function rejouerFileDAttente() {
  if (!database || rejeuEnCours) return { envoyees: 0, restantes: saisiesEnAttente(), erreur: null };

  // La liaison s'établit avant que la session ne soit rétablie : rejouer ici
  // ferait lever `getDataPath` et annoncerait un échec là où il n'y a qu'une
  // attente. `auth.js` rappelle cette fonction une fois les données chargées.
  if (!isAuthenticated) return { envoyees: 0, restantes: saisiesEnAttente(), erreur: null };

  const operations = operationsEnAttente(dataRoot);
  if (operations.length === 0) return { envoyees: 0, restantes: 0, erreur: null };

  rejeuEnCours = true;
  let envoyees = 0;
  let erreur = null;

  try {
    for (const operation of operations) {
      const reference = database.ref(getDataPath(operation.chemin));
      await borner(
        operation.type === 'update'
          ? reference.update(operation.donnees)
          : reference.set(operation.donnees),
        operation.chemin
      );
      retirerOperation(dataRoot, operation.id);
      envoyees++;
    }
  } catch (echec) {
    erreur = echec?.message || String(echec);
    warn('[DB] Rejeu interrompu :', erreur);
  } finally {
    rejeuEnCours = false;
  }

  const restantes = saisiesEnAttente();
  signalerFile();
  noter('hors-ligne', 'rejeu de la file', { envoyees, restantes, erreur: erreur || undefined });
  return { envoyees, restantes, erreur };
}

/**
 * Met une écriture de côté pour la reconnexion
 *
 * @param {string} type - 'set' ou 'update'
 * @param {string} chemin
 * @param {*} donnees
 * @returns {boolean} L'appareil a-t-il accepté de la garder ?
 */
function mettreEnFile(type, chemin, donnees) {
  const gardee = Boolean(empiler(dataRoot, { type, chemin, donnees }));
  noter('hors-ligne', gardee ? 'saisie mise en file' : 'saisie NON gardée', {
    chemin: chemin || '(racine)',
    type,
    enAttente: saisiesEnAttente()
  });
  signalerFile();
  return gardee;
}

/**
 * Ce que l'écran doit montrer quand la base ne répond pas
 *
 * Lève si le chemin n'a jamais été mémorisé. C'est délibéré : rendre `null`
 * afficherait un mois vide parfaitement crédible, et c'est précisément la
 * panne silencieuse que tout le reste de ce fichier cherche à empêcher.
 *
 * @param {string} chemin
 * @returns {*}
 */
function depuisMiroir(chemin) {
  const memoire = lectureMemorisee(dataRoot, chemin);
  const operations = operationsEnAttente(dataRoot);

  if (!memoire && operations.length === 0) {
    throw new Error(`Hors ligne, et « ${chemin || '(racine)'} » n'a jamais été lu sur cet appareil`);
  }

  return appliquerOperations(memoire ? memoire.valeur : null, chemin, operations);
}

// ===== GENERIC OPERATIONS =====

/**
 * Délai au-delà duquel une lecture est considérée comme perdue.
 * Une connexion saine répond en ~130 ms ; 10 s laisse une marge très large
 * même sur un réseau mobile dégradé.
 */
const READ_TIMEOUT_MS = 10000;

/**
 * Délai de garde des écritures, en millisecondes
 *
 * Plus généreux que celui des lectures : une écriture perdue coûte une saisie
 * qu'il faudra refaire, alors qu'une lecture lente ne coûte qu'un affichage
 * tardif. Assez court malgré tout pour qu'un échec se voie tout de suite —
 * au-delà, on repart en pensant que c'est enregistré.
 */
const WRITE_TIMEOUT_MS = 15000;

/**
 * Borne une promesse dans le temps.
 *
 * Realtime Database ne rejette pas quand le client ne joint pas le serveur : il
 * met l'opération en file d'attente et la promesse reste en attente
 * indéfiniment.
 *
 * En lecture, un `await` gelait la séquence d'initialisation sans lever la
 * moindre erreur : l'application paraissait simplement vide.
 *
 * En écriture, c'était pire encore. Le gestionnaire du bouton restait suspendu
 * sur son `await` : pas de message, pas de fermeture de fenêtre, aucun retour.
 * « J'appuie sur Ajouter et il ne se passe rien » — la panne signalée sous un
 * navigateur qui bloque l'accès à la base. Une écriture qui n'aboutit pas doit
 * échouer bruyamment, comme une lecture.
 *
 * @param {Promise<*>} promise - Promesse à borner
 * @param {string} label - Chemin visé, pour un message exploitable
 * @param {number} [ms] - Délai maximum en millisecondes
 * @param {string} [verbe] - « Lecture » ou « Écriture », pour le message
 * @returns {Promise<*>} La valeur, ou un rejet après expiration du délai
 */
function withTimeout(promise, label, ms = READ_TIMEOUT_MS, verbe = 'Lecture') {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new SansReponse(`${verbe} « ${label} » sans réponse après ${ms / 1000} s`)),
      ms
    );
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

/**
 * Une opération restée sans réponse, par opposition à une opération refusée
 *
 * La distinction commande deux décisions qu'il ne faut surtout pas prendre
 * ensemble. Une absence de réponse autorise à servir le miroir : la donnée
 * était bonne la dernière fois qu'on l'a lue, et le serveur ne dit rien.
 * Un refus, lui, est une réponse — et servir alors le miroir montrerait à un
 * compte les données que la base vient de lui refuser.
 */
export class SansReponse extends Error {
  constructor(message) {
    super(message);
    this.name = 'SansReponse';
  }
}

/**
 * Borne une écriture dans le temps
 * @param {Promise<*>} promise - Promesse d'écriture
 * @param {string} path - Chemin visé
 * @returns {Promise<*>} La valeur, ou un rejet après expiration du délai
 */
function borner(promise, path) {
  return withTimeout(promise, path || '(racine)', WRITE_TIMEOUT_MS, 'Écriture');
}

/**
 * Get data from path
 * @param {string} path - Chemin relatif à l'espace de données
 * @returns {Promise<*>} Data at path
 */
export async function dbGet(path) {
  if (!database) throw new Error('Database not initialized');
  const chemin = path || '';

  // Liaison rompue de façon établie : inutile d'attendre dix secondes pour
  // l'apprendre une nouvelle fois. C'est ce délai, répété à chaque étape de
  // l'initialisation, qui rendait l'application inutilisable hors réseau.
  if (liaisonRompue()) return depuisMiroir(chemin);

  try {
    const snapshot = await withTimeout(
      database.ref(getDataPath(path)).once('value'),
      chemin || '(racine)'
    );
    const valeur = snapshot.val();
    memoriserLecture(dataRoot, chemin, valeur);

    // Les écritures encore en file s'appliquent même sur une lecture fraîche :
    // le serveur ne les a pas encore reçues, et l'écran doit montrer ce que
    // l'utilisateur a saisi, pas ce qui est parti.
    return appliquerOperations(valeur, chemin, operationsEnAttente(dataRoot));
  } catch (erreur) {
    // Un refus est une réponse : le miroir montrerait alors des données que la
    // base vient de refuser à ce compte. Seule une absence de réponse ouvre le
    // repli.
    if (!(erreur instanceof SansReponse)) throw erreur;
    constaterCoupure();

    const memoire = lectureMemorisee(dataRoot, chemin);
    if (!memoire) throw erreur;

    warn(`[DB] « ${chemin || '(racine)'} » sans réponse — valeur mémorisée sur l'appareil`);
    noter('hors-ligne', 'lecture servie par le miroir', {
      chemin: chemin || '(racine)',
      memoriseeLe: new Date(memoire.majLe).toISOString()
    });
    return appliquerOperations(memoire.valeur, chemin, operationsEnAttente(dataRoot));
  }
}

/**
 * Set data at path
 * @param {string} path - Chemin relatif à l'espace de données
 * @param {*} data - Data to set
 * @returns {Promise<void>}
 */
export async function dbSet(path, data) {
  if (!database) throw new Error('Database not initialized');
  const chemin = path || '';

  if (liaisonRompue()) {
    if (!mettreEnFile('set', chemin, data)) {
      throw new Error('Hors ligne, et cet appareil ne peut pas garder la saisie');
    }
    return;
  }

  try {
    await borner(database.ref(getDataPath(path)).set(data), path);
  } catch (erreur) {
    // La liaison a lâché pendant l'écriture. La garder vaut mieux que la
    // perdre : au rejeu, la même valeur au même chemin ne fait pas de mal si
    // Firebase l'avait tout de même reçue. Un refus, lui, se rejouerait
    // indéfiniment : il doit remonter au formulaire.
    if (!(erreur instanceof SansReponse)) throw erreur;
    constaterCoupure();
    if (!mettreEnFile('set', chemin, data)) throw erreur;
  }
}

/**
 * Update data at path
 * @param {string} path - Chemin relatif à l'espace de données
 * @param {Object} updates - Partial updates
 * @returns {Promise<void>}
 */
export async function dbUpdate(path, updates) {
  if (!database) throw new Error('Database not initialized');
  const chemin = path || '';

  if (liaisonRompue()) {
    if (!mettreEnFile('update', chemin, updates)) {
      throw new Error('Hors ligne, et cet appareil ne peut pas garder la saisie');
    }
    return;
  }

  try {
    await borner(database.ref(getDataPath(path)).update(updates), path);
  } catch (erreur) {
    if (!(erreur instanceof SansReponse)) throw erreur;
    constaterCoupure();
    if (!mettreEnFile('update', chemin, updates)) throw erreur;
  }
}

/**
 * Push new data to path with auto-generated key
 * @param {string} path - Chemin relatif à l'espace de données
 * @param {*} data - Data to push
 * @returns {Promise<string>} The generated key
 */
export async function dbPush(path, data) {
  if (!database) throw new Error('Database not initialized');

  // `push()` sans valeur ne touche pas au réseau : la clé est fabriquée sur
  // l'appareil, à partir de l'horloge et du hasard. Elle vaut donc hors ligne,
  // et c'est ce qui permet de mettre l'écriture en file comme un `set` à un
  // chemin déjà connu — rejouable sans risque de doublon.
  const newRef = database.ref(getDataPath(path)).push();
  const cle = newRef.key;
  const chemin = path ? `${path}/${cle}` : cle;

  if (liaisonRompue()) {
    if (!mettreEnFile('set', chemin, data)) {
      throw new Error('Hors ligne, et cet appareil ne peut pas garder la saisie');
    }
    return cle;
  }

  try {
    await borner(newRef.set(data), path);
  } catch (erreur) {
    if (!(erreur instanceof SansReponse)) throw erreur;
    constaterCoupure();
    if (!mettreEnFile('set', chemin, data)) throw erreur;
  }

  return cle;
}

// ===== REMINDERS =====

/**
 * Load reminder settings
 * @returns {Promise<Object>}
 */
export async function loadReminders() {
  const data = await dbGet(DB_PATHS.REMINDERS);
  return data || {
    finMois: false,
    budget: false,
    budgetAmount: 0,
    reimbursement: false
  };
}

/**
 * Save reminder settings
 * @param {Object} settings
 */
export async function saveReminders(settings) {
  await dbSet(DB_PATHS.REMINDERS, settings);
}
