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
  oublierLesLectures,
  appliquerOperations,
  integrerAuMiroir
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

/** Prévenu quand une reprise aboutit, pour refermer le bandeau et rejouer */
let temoinDeReprise = null;

/**
 * Délais successifs entre deux tentatives de reprise, en millisecondes
 *
 * Le mode hors ligne ne savait en sortir que si Firebase annonçait de lui-même
 * la reconnexion. Il ne retentait jamais rien. Un seul délai de garde dépassé —
 * dix secondes sur un réseau mobile hésitant — et l'application se condamnait
 * au miroir jusqu'à ce que le SDK veuille bien se reconnecter. Signalé à
 * l'usage : des heures dans cet état, avec des chiffres justes à l'écran et
 * rien d'autre qu'un bandeau pour le dire.
 *
 * Les délais s'espacent : une coupure de tunnel se rattrape en quinze
 * secondes, une panne de plusieurs heures ne doit pas marteler le réseau ni
 * vider la batterie.
 */
const REPRISES_MS = [15000, 30000, 60000, 120000, 300000];

/** Rang dans le tableau des délais — remis à zéro dès qu'une reprise aboutit */
let rangDeReprise = 0;

/** Minuteur de la prochaine tentative, s'il y en a une en attente */
let minuteurDeReprise = null;

/**
 * Délai d'une tentative de reprise, en millisecondes
 *
 * Bien plus court que celui d'une lecture ordinaire : on ne cherche pas à lire,
 * on cherche à savoir si la base répond. Un test qui prend dix secondes pour
 * conclure « toujours rien » ne vaut pas mieux que pas de test.
 */
const DELAI_REPRISE_MS = 5000;

/**
 * Fait suivre les reprises de liaison réussies
 *
 * @param {Function|null} rappel - Appelé sans argument quand la base répond de nouveau
 * @returns {void}
 */
export function surLiaisonRetablie(rappel) {
  temoinDeReprise = typeof rappel === 'function' ? rappel : null;
}

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
    rangDeReprise = 0;
    annulerLaReprise();
    return;
  }

  // Une annonce de coupure avant toute connexion, c'est l'établissement de la
  // liaison, pas une panne — à moins que l'appareil ne se sache lui-même hors
  // réseau. `navigator.onLine` ne vaut rien pour affirmer qu'on est en ligne ;
  // il vaut, lui, pour affirmer qu'on ne l'est pas.
  liaison = (dejaJointe || sansReseau()) ? false : null;
  if (liaison === false) programmerReprise();
}

/**
 * Annule la tentative de reprise en attente, s'il y en a une
 * @returns {void}
 */
function annulerLaReprise() {
  if (minuteurDeReprise === null) return;
  clearTimeout(minuteurDeReprise);
  minuteurDeReprise = null;
}

/**
 * Programme la prochaine tentative de reprise
 *
 * Une seule à la fois : deux minuteurs en vol doubleraient les tentatives sans
 * rien apprendre de plus.
 *
 * @returns {void}
 */
function programmerReprise() {
  if (minuteurDeReprise !== null) return;

  const delai = REPRISES_MS[Math.min(rangDeReprise, REPRISES_MS.length - 1)];
  minuteurDeReprise = setTimeout(() => {
    minuteurDeReprise = null;
    rangDeReprise += 1;
    retenterLaLiaison();
  }, delai);
}

/**
 * Demande à la base si elle répond de nouveau
 *
 * Une vraie lecture, sur un chemin minuscule : `.info/connected` peut rester
 * faux alors que la base répond parfaitement — c'est même le cas qui a mis des
 * heures à se résoudre. Seule une opération qui aboutit prouve quelque chose.
 *
 * Ne lève jamais : un échec reprogramme simplement la tentative suivante.
 *
 * @returns {Promise<boolean>} La liaison est-elle rétablie ?
 */
export async function retenterLaLiaison() {
  if (!database || !isAuthenticated) {
    programmerReprise();
    return false;
  }

  try {
    await withTimeout(
      database.ref(getDataPath(DB_PATHS.SHARE_MODE)).once('value'),
      'reprise', DELAI_REPRISE_MS, 'Reprise'
    );
  } catch (erreur) {
    noter('hors-ligne', 'reprise sans succès', {
      motif: erreur?.message || String(erreur),
      prochaineDansMs: REPRISES_MS[Math.min(rangDeReprise, REPRISES_MS.length - 1)]
    });
    programmerReprise();
    return false;
  }

  liaison = true;
  dejaJointe = true;
  rangDeReprise = 0;
  annulerLaReprise();
  noter('hors-ligne', 'liaison rétablie par une reprise');

  if (temoinDeReprise) {
    try {
      temoinDeReprise();
    } catch {
      // Un abonné défaillant ne doit pas annuler une reprise réussie.
    }
  }

  return true;
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
  programmerReprise();
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
 * Efface le miroir de l'espace courant, et lui seul
 *
 * Appelé à la déconnexion : les montants d'un foyer n'ont rien à faire sur
 * l'appareil d'un compte qui n'y a plus accès. Le miroir n'étant qu'une copie
 * de ce qui est en base, l'effacer ne perd rien.
 *
 * La file d'attente, elle, survit. Elle porte des saisies dont aucune autre
 * copie n'existe, et la déconnexion est justement le geste qu'on demande à
 * quelqu'un dont la base reste injoignable : lui faire payer ce remède du prix
 * de ses saisies revenait à n'en offrir aucun. Elle repart à la connexion
 * suivante, comme après un rechargement.
 *
 * L'espace se passe en argument, et ce n'est pas une commodité. Appelée sans
 * lui, la fonction lisait `dataRoot` — que `setAuthenticatedUser(null)` vient
 * précisément de ramener à `household`, puisque `auth.signOut()` a déjà
 * déclenché le changement d'état. Un compte cantonné au bac à sable effaçait
 * donc le miroir du foyer, et laissait le sien sur l'appareil : exactement
 * l'inverse de ce que la déconnexion promet. L'appelant relève l'espace avant
 * de se déconnecter, quand il est encore juste.
 *
 * @param {string} [racine] - Espace à oublier ; l'espace courant par défaut
 * @returns {void}
 */
export function oublierHorsLigne(racine = dataRoot) {
  oublierLesLectures(racine);
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
  /** Ce qui a été écarté parce que le serveur ne l'acceptera jamais */
  const refusees = [];

  try {
    for (const operation of operations) {
      // Ce que la file porte n'est pas ce que l'application y a mis.
      //
      // `empiler()` contrôle le type et le chemin *à la mise en file*, et le
      // rejeu reprenait ensuite l'enregistrement tel quel. Or la file vit en
      // clair dans `localStorage`, sur une origine que GitHub Pages partage
      // entre tous les dépôts d'un même compte : une autre page du compte y
      // écrit sans la moindre injection, et une extension de navigateur aussi.
      //
      // La charge utile tenait en une entrée : `{ type: 'set', chemin: '',
      // donnees: null }`. `getDataPath('')` rend `household` — l'espace
      // entier —, et le rejeu partait seul à la reconnexion, sous la session
      // légitime du foyer, sans rien redemander. Les règles refusent désormais
      // d'effacer la racine, mais une file n'a de toute façon aucune raison de
      // porter autre chose que des saisies.
      if (!operationRejouable(operation)) {
        warn('[DB] Opération écartée du rejeu :', operation?.chemin ?? '(racine)');
        noter('hors-ligne', 'opération écartée du rejeu', {
          chemin: operation?.chemin ?? '(racine)',
          type: operation?.type
        });
        retirerOperation(dataRoot, operation.id);
        continue;
      }

      // Un refus définitif n'est pas une panne : le distinguer, ou la file se
      // bloque pour toujours.
      //
      // S'arrêter au premier échec est le bon choix — « la file est un ordre,
      // pas un sac » : rejouer la suite écraserait une correction par la
      // version qu'elle corrige. Mais rien ne séparait le transitoire du
      // définitif. Une écriture que les règles rejetteront toujours restait en
      // tête, et tout ce qui avait été saisi ensuite s'empilait derrière sans
      // jamais partir. L'utilisateur lisait « N saisies restent sur cet
      // appareil » à chaque reconnexion, sans aucun moyen de voir laquelle
      // bloque ni de l'abandonner — sauf effacer les données du site, ce qui
      // emporte tout.
      //
      // Le déclencheur est dans la CI elle-même : `deploy-rules` redéploie les
      // règles à chaque fusion sur main. Une saisie mise en file avant un
      // durcissement de `.validate` est refusée après. Ce n'est pas un cas de
      // laboratoire, c'est le fonctionnement normal du dépôt.
      //
      // Le `try` est ici, dans la boucle, et non autour d'elle : écarter la
      // saisie fautive puis sortir aurait coûté une reconnexion par saisie
      // refusée, et laissé l'utilisateur devant un compte qui ne descend que
      // d'un cran à chaque fois. Un refus définitif écarte UNE opération, pas
      // la file.
      try {
        const reference = database.ref(getDataPath(operation.chemin));
        await borner(
          operation.type === 'update'
            ? reference.update(operation.donnees)
            : reference.set(operation.donnees),
          operation.chemin
        );
      } catch (echec) {
        const motif = echec?.message || String(echec);

        if (!estRefusDefinitif(echec)) {
          // Transitoire : la saisie reste en tête, elle repartira.
          erreur = motif;
          warn('[DB] Rejeu interrompu :', motif);
          break;
        }

        warn('[DB] Saisie refusée définitivement, écartée de la file :', operation.chemin);
        noter('hors-ligne', 'saisie refusée définitivement', {
          chemin: operation.chemin || '(racine)',
          type: operation.type,
          motif
        });
        // Le miroir la porte encore : la valeur reste à l'écran, et l'appelant
        // apprend qu'elle n'ira pas plus loin.
        retirerOperation(dataRoot, operation.id);
        refusees.push({ chemin: operation.chemin, motif });
        continue;
      }

      // Le miroir prend le relais de la file : elle va être vidée, et sans ce
      // report la saisie ne serait plus portée par personne.
      //
      // L'ordre est le plus prudent des deux — reporter puis retirer — mais il
      // ne garantit rien de plus : les deux écritures visent le même stockage,
      // qui les refuse ou les accepte ensemble. Un sabotage les a interverties
      // sans qu'aucun contrôle ne bronche, et c'est exact.
      integrerAuMiroir(dataRoot, operation);
      retirerOperation(dataRoot, operation.id);
      envoyees++;
    }
  } catch (echec) {
    // Ce qui parvient ici n'est plus une écriture refusée, mais une panne du
    // rejeu lui-même — stockage inaccessible, dossier illisible.
    erreur = echec?.message || String(echec);
    warn('[DB] Rejeu interrompu :', erreur);
  } finally {
    rejeuEnCours = false;
  }

  const restantes = saisiesEnAttente();
  signalerFile();
  noter('hors-ligne', 'rejeu de la file', {
    envoyees, restantes, refusees: refusees.length, erreur: erreur || undefined
  });
  return { envoyees, restantes, erreur, refusees };
}

/**
 * Les motifs de refus dont il est inutile de réessayer
 *
 * Un jeton expiré ou une coupure se rattrapent à la reconnexion suivante ;
 * une donnée que les règles refusent ne passera jamais, quel que soit le
 * nombre de tentatives.
 *
 * @param {*} echec - Erreur rendue par Firebase
 * @returns {boolean}
 */
function estRefusDefinitif(echec) {
  const code = String(echec?.code || '').toLowerCase();
  const message = String(echec?.message || echec || '').toLowerCase();
  return code.includes('permission_denied')
    || message.includes('permission_denied')
    || message.includes('permission denied');
}

/**
 * Les formes de chemin qu'une saisie peut viser
 *
 * Une liste blanche de DESTINATIONS, et non une liste noire de formes. La
 * différence n'est pas de style : une liste noire n'arrête que ce à quoi on a
 * pensé, et il faut y avoir pensé avant. `set('periods', …)` remplace tout
 * l'historique du foyer, et aucun des refus précédents ne le voyait — le nœud
 * est nommé, la valeur n'est pas `null`.
 *
 * Ce que chaque ligne autorise est exactement ce que le code écrit :
 *
 *   1. les réglages du foyer, dont le nœud EST la valeur — ils s'écrivent en
 *      entier, c'est leur forme normale ;
 *   2. une PARTIE d'un mois, jamais le mois entier : `periods/{mois}` et
 *      `periods` sont des conteneurs, et aucun appel ne les vise ;
 *   3. une cagnotte : le lot d'un versement mensuel, ou un versement isolé.
 *
 * Les trois listes du foyer — `customCategories`, `customDestinations`,
 * `envelopes` — n'y figurent pas, et ce n'est pas un oubli : `fusionnerListe`
 * les écrit par une `transaction` posée directement sur la référence Firebase,
 * qui ne passe pas par ce fichier et n'est donc jamais mise en file.
 *
 * `tests/modules/hors-ligne.test.js` compare cette liste aux chemins que
 * `public/js` écrit réellement, dans les deux sens : une forme oubliée ferait
 * perdre une saisie hors ligne, une forme morte élargirait pour rien.
 */
const FORMES_DIFFERABLES = [
  /^(?:salaries|shareMode|carryOverEnabled|categoryBudgets|members|reminders)$/,
  /^periods\/\d{4}-(?:0[1-9]|1[0-2])\/[A-Za-z][A-Za-z0-9]*(?:\/[^/]+)?$/,
  /^versements\/[^/]+(?:\/[^/]+)?$/
];

/**
 * Une opération de la file est-elle rejouable telle quelle ?
 *
 * Les mêmes contrôles qu'à la mise en file, refaits au rejeu — parce qu'entre
 * les deux, le dossier a passé du temps dans un stockage que l'application ne
 * possède pas seule : `localStorage` vit sur une origine que partagent tous les
 * sites Pages du compte.
 *
 * Ce que l'application écrit légitimement à la racine — la restauration d'une
 * sauvegarde — n'a rien à faire dans une file : elle serait différée, annoncée
 * comme réussie, et rejouée bien plus tard, éventuellement sous la session de
 * l'autre compte.
 *
 * **Ce que ce contrôle ne peut pas faire.** Il ramène la surface d'une entrée
 * forgée à ce que l'application elle-même écrit — il ne la ramène pas à rien.
 * Un `update` sur `salaries` avec des revenus inventés est, au caractère près,
 * l'écriture que `period.js` produit quand on corrige un salaire : aucun
 * contrôle posé ici ne peut les distinguer. Ce qui fermerait ce reste, c'est
 * un nom de domaine propre, qui rendrait l'origine à cette application seule.
 *
 * @param {*} operation - Enregistrement relu du stockage, donc non fiable
 * @returns {boolean}
 */
export function operationRejouable(operation) {
  if (!operation || typeof operation !== 'object') return false;
  if (operation.type !== 'set' && operation.type !== 'update') return false;
  if (typeof operation.chemin !== 'string') return false;

  // `set(null)` supprime le nœud visé ; une saisie ne fait jamais cela.
  if (operation.type === 'set' && operation.donnees === null) return false;

  // Un chemin vide vise la racine de l'espace de données. La liste ci-dessous
  // le refuserait aussi, mais le dire ici nomme le cas fondateur.
  const chemin = operation.chemin.replace(/^\/+|\/+$/g, '');
  if (chemin === '') return false;

  return FORMES_DIFFERABLES.some(forme => forme.test(chemin));
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
  // Le même contrôle qu'au rejeu, mais posé ici, où l'on peut encore le dire.
  // Différer l'écrasement de tout un espace en l'annonçant comme réussi est
  // pire que de le refuser : la restauration d'une sauvegarde partait en file,
  // « Sauvegarde restaurée » s'affichait, et l'écrasement réel survenait à la
  // reconnexion — après que l'autre téléphone a pu saisir entre-temps.
  if (!operationRejouable({ type, chemin, donnees })) {
    noter('hors-ligne', 'saisie NON gardée — opération non différable', {
      chemin: chemin || '(racine)',
      type
    });
    return false;
  }

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

  // Sans cette trace, une application entièrement servie par le miroir est
  // indiscernable d'une application qui lit la base : toutes les étapes
  // réussissent, « FairSplit chargé » s'affiche, les chiffres sont justes — et
  // rien ne dit qu'ils datent. Le bandeau seul ne suffit pas à trancher.
  noter('hors-ligne', 'lecture servie par le miroir', {
    chemin: chemin || '(racine)',
    memoriseeLe: memoire ? new Date(memoire.majLe).toISOString() : 'jamais',
    enAttente: operations.length
  });

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
  return withTimeout(promise, path || '(racine)', delaiEcriture(), 'Écriture');
}

/**
 * Délais du tout premier contact, en millisecondes
 *
 * Mesuré : sur un appareil dont la base ne répond pas, la toute première
 * lecture paie l'intégralité du délai de garde avant que la coupure ne soit
 * constatée — dix secondes d'écran figé, à chaque ouverture. Les onze
 * suivantes sont instantanées, servies par le miroir. Ce n'est donc pas le
 * stockage local qui coûte cher, c'est cette unique attente.
 *
 * Une liaison saine répond en ~130 ms : trois secondes lui laissent vingt fois
 * la marge nécessaire. Et se tromper ne coûte rien — une reprise est
 * programmée dans la foulée, et la première qui aboutit rend la liaison.
 *
 * Passé ce premier contact, les délais complets reprennent : une écriture
 * perdue coûte une saisie, on ne l'abandonne pas au bout de trois secondes.
 */
const PREMIER_CONTACT_LECTURE_MS = 3000;
const PREMIER_CONTACT_ECRITURE_MS = 5000;

/**
 * Le premier contact avec la base est-il encore à établir ?
 *
 * `dejaJointe` ne devient vrai qu'une fois la liaison réellement établie : tant
 * qu'elle ne l'a jamais été, on ne sait pas si la base répond, et c'est
 * précisément le cas où il faut le découvrir vite.
 *
 * @returns {boolean}
 */
function premierContact() {
  return !dejaJointe;
}

/** Délai à accorder à une lecture, selon qu'on a déjà joint la base ou non */
function delaiLecture() {
  return premierContact() ? PREMIER_CONTACT_LECTURE_MS : READ_TIMEOUT_MS;
}

/** Délai à accorder à une écriture, même raisonnement */
function delaiEcriture() {
  return premierContact() ? PREMIER_CONTACT_ECRITURE_MS : WRITE_TIMEOUT_MS;
}

// ===== ACCÈS ABSOLUS — hors de l'espace de données =====
//
// `dbGet` et ses voisines préfixent tout par `DATA_ROOT` (`household/`, ou
// `sandbox/`). Trois racines échappent à ce préfixe, et ce n'est pas une
// commodité : `.write` **cascade** dans les règles Firebase — une règle
// profonde peut élargir un accès, jamais le restreindre. Sous `household`,
// dont l'écriture est ouverte aux deux comptes, il aurait été impossible
// d'exiger d'être l'autre pour accorder un aval, ou de réserver une lecture à
// une seule personne.
//
// Ces quatre fonctions ne passent **ni par le miroir, ni par la file hors
// ligne**, et c'est délibéré :
//
//   1. La file vit dans `localStorage`, sur une origine que partagent tous les
//      dépôts Pages du compte — l'audit a montré qu'on pouvait y écrire depuis
//      un autre dépôt. Y déposer le détail d'une dépense privée la mettrait
//      exactement là où elle ne doit pas être.
//   2. Le miroir garde la dernière valeur lue de chaque chemin, au même
//      endroit et avec le même défaut.
//
// Hors ligne, une écriture privée échoue donc franchement plutôt que
// d'attendre. C'est le bon compromis : la confidentialité vaut mieux qu'une
// saisie différée.

/**
 * Lecture à un chemin absolu, sans préfixe d'espace
 * @param {string} chemin - Chemin depuis la racine de la base
 * @returns {Promise<*>}
 */
export async function dbGetAbsolu(chemin) {
  if (!database) throw new Error('Database not initialized');
  const snapshot = await withTimeout(
    database.ref(chemin).once('value'), chemin, delaiLecture());
  return snapshot.val();
}

/**
 * Écriture à un chemin absolu
 * @param {string} chemin
 * @param {*} donnees
 * @returns {Promise<void>}
 */
export async function dbSetAbsolu(chemin, donnees) {
  if (!database) throw new Error('Database not initialized');
  await withTimeout(database.ref(chemin).set(donnees), chemin, delaiEcriture());
}

/**
 * Mise à jour partielle à un chemin absolu
 * @param {string} chemin
 * @param {Object} modifications
 * @returns {Promise<void>}
 */
export async function dbUpdateAbsolu(chemin, modifications) {
  if (!database) throw new Error('Database not initialized');
  await withTimeout(database.ref(chemin).update(modifications), chemin, delaiEcriture());
}

/**
 * Ajout sous clé poussée, à un chemin absolu
 * @param {string} chemin
 * @param {*} donnees
 * @returns {Promise<string>} La clé créée
 */
export async function dbPushAbsolu(chemin, donnees) {
  if (!database) throw new Error('Database not initialized');
  const reference = database.ref(chemin).push();
  await withTimeout(reference.set(donnees), `${chemin}/${reference.key}`, delaiEcriture());
  return reference.key;
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
      chemin || '(racine)',
      delaiLecture()
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
