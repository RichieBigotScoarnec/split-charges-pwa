/**
 * FairSplit — Ce que l'appareil garde quand la base est injoignable
 *
 * Signalé à l'usage, capture à l'appui : « je n'arrive pas à aller sur mon
 * application, pas de réseau ; il faudrait une solution en local sinon on ne
 * peut rien faire. »
 *
 * La page, elle, se chargeait : le service worker la garde. Mais chaque
 * lecture attendait dix secondes avant d'abandonner, et chaque écriture quinze
 * avant d'échouer. Restait une application complète, ouverte, et parfaitement
 * inutile — le pire des deux mondes, puisqu'elle avait l'air de fonctionner.
 *
 * Ce module tient deux choses dans le stockage de l'appareil :
 *
 * - un **miroir** : la dernière valeur lue pour chaque chemin, pour qu'un
 *   téléphone hors réseau montre les charges du mois plutôt qu'un écran vide ;
 * - une **file d'attente** : les écritures qui n'ont pas pu partir, dans leur
 *   ordre de saisie, pour qu'elles partent à la reconnexion.
 *
 * Le cœur — `appliquerOperations` — ne touche à aucun stockage : c'est lui qui
 * fait qu'une charge saisie hors réseau apparaît dans la liste immédiatement,
 * et il se vérifie sur de simples objets.
 *
 * Choix du support : `localStorage`, et non IndexedDB. Les données d'un foyer
 * pèsent quelques dizaines de kilo-octets par an, très loin des cinq
 * méga-octets disponibles ; le gain d'IndexedDB serait théorique et son coût,
 * lui, bien réel. Le quota est malgré tout traité comme un cas normal, plus
 * bas : un stockage plein ne doit pas faire perdre une saisie.
 */

/**
 * Version du format enregistré
 *
 * Un dossier d'une autre version est ignoré plutôt que deviné : une file
 * d'attente mal relue rejouerait des écritures fausses sur des comptes.
 */
const VERSION = 1;

/** Une entrée de stockage par espace de données — `household` et `sandbox` ne se mêlent jamais */
const PREFIXE = 'fairsplit:hors-ligne:';

/**
 * Clé de stockage d'un espace de données
 * @param {string} racine - 'household' ou 'sandbox'
 * @returns {string}
 */
export function cleDe(racine) {
  return `${PREFIXE}${racine || 'household'}`;
}

/** Un dossier neuf */
function dossierVide() {
  return { version: VERSION, chemins: {}, file: [] };
}

/**
 * Lit le dossier d'un espace de données
 *
 * Ne lève jamais : un navigateur en navigation privée refuse `localStorage`,
 * et l'application doit rester utilisable en ligne dans ce cas.
 *
 * @param {string} racine
 * @returns {{version: number, chemins: Object, file: Array<Object>}}
 */
export function lireDossier(racine) {
  let brut;
  try {
    brut = window.localStorage.getItem(cleDe(racine));
  } catch {
    return dossierVide();
  }
  if (!brut) return dossierVide();

  try {
    const dossier = JSON.parse(brut);
    if (!dossier || dossier.version !== VERSION) return dossierVide();
    return {
      version: VERSION,
      chemins: (dossier.chemins && typeof dossier.chemins === 'object') ? dossier.chemins : {},
      file: Array.isArray(dossier.file) ? dossier.file : []
    };
  } catch {
    return dossierVide();
  }
}

/**
 * Enregistre le dossier, en sacrifiant le miroir plutôt que la file
 *
 * Le quota atteint n'est pas un cas exotique : c'est ce qui arrive après
 * quelques années de charges. Le miroir n'est qu'un confort de lecture — il se
 * reconstitue à la première connexion. La file, elle, contient des saisies que
 * personne ne pourra retrouver. En cas de refus, on jette donc les chemins
 * mémorisés, du plus ancien au plus récent, et l'on réessaie.
 *
 * @param {string} racine
 * @param {{version: number, chemins: Object, file: Array<Object>}} dossier
 * @returns {boolean} L'enregistrement a-t-il abouti ?
 */
export function ecrireDossier(racine, dossier) {
  const cle = cleDe(racine);
  const aEcrire = {
    version: VERSION,
    chemins: dossier.chemins || {},
    file: dossier.file || []
  };

  if (essayerEcriture(cle, aEcrire)) return true;

  const parAnciennete = Object.keys(aEcrire.chemins)
    .sort((a, b) => (aEcrire.chemins[a]?.t || 0) - (aEcrire.chemins[b]?.t || 0));

  for (const chemin of parAnciennete) {
    delete aEcrire.chemins[chemin];
    if (essayerEcriture(cle, aEcrire)) return true;
  }

  // Plus de miroir du tout et le stockage refuse encore : il ne reste que la
  // file, et si elle ne passe pas non plus, l'appelant doit le savoir.
  return false;
}

/**
 * Une tentative d'écriture, sans lever
 * @param {string} cle
 * @param {Object} contenu
 * @returns {boolean}
 */
function essayerEcriture(cle, contenu) {
  try {
    window.localStorage.setItem(cle, JSON.stringify(contenu));
    return true;
  } catch {
    return false;
  }
}

// ===== MIROIR DES LECTURES =====

/**
 * Retient la valeur lue à un chemin
 * @param {string} racine
 * @param {string} chemin - Chemin relatif à l'espace de données
 * @param {*} valeur
 * @param {number} [instant] - Horodatage, injectable pour les bancs d'essai
 * @returns {boolean}
 */
export function memoriserLecture(racine, chemin, valeur, instant = Date.now()) {
  const dossier = lireDossier(racine);
  dossier.chemins[chemin || ''] = { v: valeur === undefined ? null : valeur, t: instant };
  return ecrireDossier(racine, dossier);
}

/**
 * La dernière valeur connue d'un chemin
 *
 * Rend `null` quand le chemin n'a jamais été lu — ce qui n'est pas la même
 * chose qu'un chemin lu et vide. La distinction décide de tout : sur un chemin
 * jamais mémorisé, l'application doit signaler qu'elle ne sait pas, et non
 * afficher un mois vide parfaitement crédible.
 *
 * @param {string} racine
 * @param {string} chemin
 * @returns {{valeur: *, majLe: number}|null}
 */
export function lectureMemorisee(racine, chemin) {
  const entree = lireDossier(racine).chemins[chemin || ''];
  if (!entree) return null;
  return { valeur: entree.v === undefined ? null : entree.v, majLe: entree.t || 0 };
}

// ===== FILE D'ATTENTE DES ÉCRITURES =====

/**
 * Ajoute une écriture à la file
 *
 * @param {string} racine
 * @param {{type: string, chemin: string, donnees: *}} operation
 * @param {string} [id] - Identifiant, injectable pour les bancs d'essai
 * @param {number} [instant]
 * @returns {Object|null} L'opération enregistrée, null si le stockage a refusé
 */
export function empiler(racine, operation, id = identifiantDOperation(), instant = Date.now()) {
  if (!operation || (operation.type !== 'set' && operation.type !== 'update')) return null;
  if (typeof operation.chemin !== 'string') return null;

  const dossier = lireDossier(racine);
  const enregistree = {
    id,
    type: operation.type,
    chemin: operation.chemin,
    // `undefined` ne survit pas à JSON, et Firebase le refuse : on le fixe ici,
    // pas au rejeu, où l'écart serait invisible.
    donnees: operation.donnees === undefined ? null : operation.donnees,
    cree: instant
  };
  dossier.file.push(enregistree);

  return ecrireDossier(racine, dossier) ? enregistree : null;
}

/**
 * Les écritures en attente, dans leur ordre de saisie
 * @param {string} racine
 * @returns {Array<Object>}
 */
export function operationsEnAttente(racine) {
  return lireDossier(racine).file;
}

/**
 * Combien de saisies attendent encore
 * @param {string} racine
 * @returns {number}
 */
export function nombreEnAttente(racine) {
  return lireDossier(racine).file.length;
}

/**
 * Retire une écriture de la file, une fois partie
 * @param {string} racine
 * @param {string} id
 * @returns {boolean}
 */
export function retirerOperation(racine, id) {
  const dossier = lireDossier(racine);
  const restantes = dossier.file.filter(operation => operation.id !== id);
  if (restantes.length === dossier.file.length) return false;
  dossier.file = restantes;
  return ecrireDossier(racine, dossier);
}

/**
 * Efface tout d'un espace de données
 *
 * Appelé à la déconnexion : les montants d'un foyer n'ont rien à faire sur
 * l'appareil d'un compte qui n'y a plus accès.
 *
 * @param {string} racine
 * @returns {void}
 */
export function oublierTout(racine) {
  try {
    window.localStorage.removeItem(cleDe(racine));
  } catch {
    // Rien à faire de plus : le stockage est déjà hors d'atteinte.
  }
}

/** Un identifiant d'opération, unique sans dépendre du réseau */
function identifiantDOperation() {
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Reporte dans le miroir une écriture qui vient de partir pour de bon
 *
 * Sans cela, le miroir garde la valeur lue **avant** la saisie, et la file qui
 * la compensait vient d'être vidée. La charge est alors en base, correctement,
 * et disparaît pourtant de l'écran dès qu'on repasse hors ligne — jusqu'à la
 * prochaine lecture en ligne du chemin concerné. Dans une application de
 * comptes, une dépense qui s'évapore est la pire des frayeurs, et elle serait
 * ici parfaitement injustifiée.
 *
 * L'horodatage de chaque entrée n'est pas touché : il dit quand le serveur a
 * parlé pour la dernière fois, et ce n'est pas ce qui vient de se passer.
 *
 * @param {string} racine
 * @param {Object} operation - Opération telle qu'elle a été rejouée
 * @returns {boolean} Le miroir a-t-il été modifié et réenregistré ?
 */
export function integrerAuMiroir(racine, operation) {
  const dossier = lireDossier(racine);
  let touche = false;

  for (const chemin of Object.keys(dossier.chemins)) {
    const entree = dossier.chemins[chemin];
    const avant = entree.v === undefined ? null : entree.v;
    const apres = appliquerOperations(avant, chemin, [operation]);

    // `appliquerOperations` rend la valeur d'origine, à l'identique, quand
    // l'écriture ne la concerne pas : comparer les références suffit.
    if (apres === avant) continue;

    dossier.chemins[chemin] = { v: apres, t: entree.t };
    touche = true;
  }

  return touche ? ecrireDossier(racine, dossier) : false;
}

// ===== CŒUR : CE QUE VOIT UNE LECTURE =====

/**
 * Applique les écritures en attente à une valeur lue
 *
 * Sans cela, une charge saisie hors réseau serait bien enregistrée sur
 * l'appareil et resterait invisible à l'écran : le miroir date d'avant la
 * saisie. L'utilisateur la saisirait donc une seconde fois.
 *
 * @param {*} valeur - Valeur mémorisée, ou fraîchement lue
 * @param {string} chemin - Chemin dont on vient de lire la valeur
 * @param {Array<Object>} operations - File d'attente, dans l'ordre
 * @returns {*} Ce que l'écran doit montrer
 */
export function appliquerOperations(valeur, chemin, operations) {
  if (!Array.isArray(operations) || operations.length === 0) return valeur;

  let resultat = valeur;

  for (const operation of operations) {
    for (const ecriture of ecrituresElementaires(operation)) {
      const dessous = cheminRelatif(chemin, ecriture.chemin);
      if (dessous !== null) {
        resultat = poser(resultat, decouper(dessous), ecriture.valeur);
        continue;
      }

      // L'écriture porte sur un nœud qui contient celui qu'on lit : la valeur
      // à afficher se trouve alors *dans* ce qui a été écrit.
      const dessus = cheminRelatif(ecriture.chemin, chemin);
      if (dessus !== null) resultat = descendre(ecriture.valeur, decouper(dessus));
    }
  }

  return resultat;
}

/**
 * Décompose une opération en écritures de valeur, chacune à un chemin absolu
 *
 * Un `update` Firebase est un lot : ses clés sont des chemins relatifs, et
 * elles peuvent elles-mêmes contenir des barres obliques. Les traiter une à
 * une évite d'avoir à distinguer les deux formes partout ailleurs.
 *
 * @param {Object} operation
 * @returns {Array<{chemin: string, valeur: *}>}
 */
function ecrituresElementaires(operation) {
  if (!operation || typeof operation.chemin !== 'string') return [];

  if (operation.type === 'set') {
    return [{ chemin: operation.chemin, valeur: operation.donnees }];
  }

  if (operation.type !== 'update') return [];
  if (!operation.donnees || typeof operation.donnees !== 'object') return [];

  return Object.keys(operation.donnees).map(cle => ({
    chemin: [operation.chemin, cle].filter(Boolean).join('/'),
    valeur: operation.donnees[cle]
  }));
}

/**
 * Position d'un chemin par rapport à un autre
 *
 * @param {string} parent
 * @param {string} enfant
 * @returns {string|null} Chemin de `enfant` sous `parent`, '' s'ils sont
 *                        identiques, null si `enfant` n'est pas dessous
 */
export function cheminRelatif(parent, enfant) {
  const hautSegments = decouper(parent);
  const basSegments = decouper(enfant);

  if (basSegments.length < hautSegments.length) return null;

  for (let rang = 0; rang < hautSegments.length; rang++) {
    if (hautSegments[rang] !== basSegments[rang]) return null;
  }

  return basSegments.slice(hautSegments.length).join('/');
}

/**
 * Découpe un chemin en segments, en ignorant les barres superflues
 * @param {string} chemin
 * @returns {Array<string>}
 */
function decouper(chemin) {
  if (typeof chemin !== 'string') return [];
  return chemin.split('/').filter(Boolean);
}

/**
 * Pose une valeur dans une arborescence, sans modifier l'originale
 *
 * `null` supprime la clé, comme côté Firebase : c'est ainsi que la suppression
 * douce et le retrait d'un lieu s'écrivent, et une charge « supprimée » qui
 * réapparaîtrait hors réseau serait pire que pas de hors-ligne du tout.
 *
 * @param {*} racine
 * @param {Array<string>} segments
 * @param {*} valeur
 * @returns {*}
 */
function poser(racine, segments, valeur) {
  if (segments.length === 0) return valeur === undefined ? null : valeur;

  const [tete, ...reste] = segments;
  const objet = (racine && typeof racine === 'object' && !Array.isArray(racine)) ? { ...racine } : {};

  if (reste.length === 0) {
    if (valeur === null || valeur === undefined) delete objet[tete];
    else objet[tete] = valeur;
    return objet;
  }

  objet[tete] = poser(objet[tete], reste, valeur);
  return objet;
}

/**
 * Suit un chemin dans une valeur, ou rend null s'il n'y mène nulle part
 * @param {*} valeur
 * @param {Array<string>} segments
 * @returns {*}
 */
function descendre(valeur, segments) {
  let courant = valeur;
  for (const segment of segments) {
    if (!courant || typeof courant !== 'object') return null;
    courant = courant[segment];
  }
  return courant === undefined ? null : courant;
}
