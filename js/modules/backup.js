// ===== MODULE : SAUVEGARDE ET RESTAURATION =====
//
// Toutes les données du foyer vivent dans un unique projet Firebase. Une
// fausse manœuvre sur la console, un compte fermé, une règle de sécurité mal
// écrite, et plusieurs années de comptes disparaissent sans copie. L'export
// CSV existant ne couvre qu'un mois et perd la structure : il sert à lire dans
// un tableur, pas à reconstituer.
//
// La sauvegarde produit un fichier qui contient tout et qui sait revenir.

import { toast } from '../components/toast.js';
import { showModal, closeModal, showConfirmModal, TON } from '../components/modal.js';
import { log, error as logError } from '../utils/debug.js';
import { ecouterUneFois } from '../utils/ecouteur.js';
import { normaliserEmplacement } from '../utils/members.js';
import { getState } from '../state.js';

/**
 * Marqueur du format, vérifié à la restauration
 *
 * Exporté et lu à la source par `tools/enveloppe-sauvegarde.mjs` : la
 * sauvegarde automatique doit produire exactement l'enveloppe que
 * `validateBackup` accepte. Deux définitions du format finiraient par diverger,
 * et le jour où on s'en apercevrait serait celui d'une restauration.
 */
export const FORMAT = 'fairsplit-backup';

/** Version du format ; un fichier plus récent que le code est refusé */
export const FORMAT_VERSION = 1;

/**
 * Initialise le module de sauvegarde
 */
export function initBackup() {
  window.showBackup = showBackup;
  window.downloadBackup = downloadBackup;
  window.pickBackupFile = pickBackupFile;

  const input = document.getElementById('backupFileInput');
  ecouterUneFois(input, 'change', handleFileSelected);

  log('💾 Sauvegarde initialisée');
}

/**
 * Ouvre la fenêtre de sauvegarde
 */
export function showBackup() {
  showModal('modalBackup');
}

/**
 * Provoque le téléchargement d'un contenu texte
 *
 * L'URL d'objet est révoquée après usage : sans cela, le navigateur retient
 * le contenu en mémoire jusqu'à la fermeture de l'onglet.
 *
 * @param {string} contenu - Contenu du fichier
 * @param {string} nom - Nom du fichier proposé
 */
function telecharger(contenu, nom) {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.style.display = 'none';

  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(url);
}

/**
 * Construit le contenu d'une sauvegarde à partir de la base
 *
 * Exportée pour être ÉPROUVÉE. Depuis que la couverture des nœuds est tenue à
 * la main (voir `plansDeLecture`), la seule façon de vérifier qu'un nœud
 * déclaré est réellement lu est de relever les chemins que cette fonction
 * demande — pas de relire sa boucle.
 *
 * @returns {Promise<{contenu: string, nom: string, periodes: number}>}
 */
export async function buildBackup() {
  const { dbGet, cheminDuPersonnel, NOEUD_PERSONNEL } = await import('../db.js');
  const emplacement = normaliserEmplacement(getState('emplacementCourant'));

  const donnees = {};
  const lectures = await Promise.all(
    plansDeLecture(NOEUD_PERSONNEL, cheminDuPersonnel, emplacement)
      .map(async (plan) => ({ plan, valeur: await dbGet(plan.chemin) }))
  );

  for (const { plan, valeur } of lectures) {
    // Un nœud absent de la base ne produit AUCUNE clé, et ce n'est pas un
    // détail de forme : cinq des treize n'existent pas dans le foyer réel — la
    // lecture de racine ne les a jamais rendus, `validateBackup` ne les a
    // jamais vus, et `tools/enveloppe-sauvegarde.mjs` produit la même
    // enveloppe à partir du vidage de la CLI. Les écrire à `null` ferait
    // diverger trois formes d'un seul fichier.
    if (valeur === null || valeur === undefined) continue;
    // La poche personnelle est rangée sous son propriétaire, comme en base :
    // l'enveloppe garde la forme de l'arbre, et la restauration sait où
    // retrouver la sienne.
    donnees[plan.noeud] = plan.sous ? { [plan.sous]: valeur } : valeur;
  }

  const enveloppe = {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data: donnees || {}
  };

  const horodatage = enveloppe.exportedAt.slice(0, 19).replace(/[:T]/g, '-');

  return {
    contenu: JSON.stringify(enveloppe, null, 2),
    nom: `fairsplit-sauvegarde-${horodatage}.json`,
    periodes: Object.keys(enveloppe.data.periods || {}).length
  };
}

/**
 * Télécharge une sauvegarde complète
 * @returns {Promise<void>}
 */
export async function downloadBackup() {
  try {
    const { contenu, nom, periodes } = await buildBackup();
    telecharger(contenu, nom);
    toast.success(`Sauvegarde téléchargée (${periodes} mois)`);
  } catch (error) {
    logError('❌ Erreur de sauvegarde :', error);
    toast.error('Sauvegarde impossible');
  }
}

/**
 * Ouvre le sélecteur de fichier
 *
 * Le champ natif est masqué : son apparence n'est pas stylable de façon
 * fiable, et le bouton doit ressembler aux autres.
 */
export function pickBackupFile() {
  const input = document.getElementById('backupFileInput');
  if (input) input.click();
}

/**
 * Nœuds que l'application sait écrire, et qu'une restauration peut donc poser
 *
 * Cette liste double celle des règles de sécurité, qui font autorité et
 * refuseraient l'écriture d'un nœud inconnu. Elle existe pour que le refus
 * arrive avant l'écriture, et nomme le nœud en cause : sans elle, un fichier
 * fabriqué déclenchait le téléchargement de la copie de secours, puis un
 * « Restauration impossible » sans le moindre indice.
 */
const NOEUDS_CONNUS = [
  'salaries',
  'members',
  'shareMode',
  'carryOverEnabled',
  'categoryBudgets',
  'customCategories',
  'customDestinations',
  // Les enveloppes transversales. La sauvegarde lit la racine entière : elles y
  // figuraient donc dès leur création, mais la restauration les aurait refusées
  // — « des données que l'application ne connaît pas » — et le foyer aurait
  // perdu la restauration de ses propres sauvegardes récentes.
  'envelopes',
  // Le contenu des cagnottes, arrivé le 2026-08-27. Il a reproduit mot pour mot
  // la panne que le commentaire ci-dessus raconte : toute sauvegarde prise
  // depuis ce jour-là contenait `versements`, et toute restauration de ces
  // fichiers était refusée. On ne l'apprend que le jour où l'on en a besoin.
  //
  // Ajouter une ligne ne suffisait pas — c'était la deuxième fois. Les règles
  // font autorité sur ce qui peut exister sous la racine, et
  // `tests/sauvegarde-noeuds-declares.test.js` compare désormais les deux
  // listes dans les deux sens : un nœud neuf ne peut plus être déclaré d'un
  // côté sans l'autre.
  'versements',
  'reminders',
  'periods',
  // La poche personnelle, arrivée le 2026-09-16 avec le mur. Elle est ici pour
  // la même raison que les trois ci-dessus — les règles la déclarent, donc une
  // restauration doit pouvoir la poser —, mais elle ne se lit ni ne s'écrit
  // comme ses voisines, et les deux exceptions sont dans `buildBackup` et
  // `restoreBackup` :
  //
  //   - à la LECTURE, on ne lit que la sienne. `personnel` en entier est
  //     illisible par construction : son droit de lecture est posé un cran
  //     plus bas, sur chaque moitié, parce que les deux moitiés n'ont pas le
  //     même propriétaire ;
  //   - à l'ÉCRITURE, elle ne passe JAMAIS par la racine. Un `set` de racine
  //     efface ce qu'il ne porte pas : restaurer un fichier qui ne contient
  //     pas la poche de l'autre — et il ne peut pas la contenir — l'aurait
  //     effacée en silence.
  'personnel',
  // Le marqueur de restauration, arrivé avec le déplacement du `.write` vers la
  // feuille. Il PERSISTE en base après une restauration : toute sauvegarde prise
  // ensuite le contient, et sans cette ligne elle serait refusée à la
  // restauration — la panne que les deux commentaires ci-dessus racontent déjà,
  // une troisième fois.
  'restaureLe'
];

/**
 * Ce que la sauvegarde va lire, nœud par nœud
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI LA LECTURE DE RACINE A DISPARU
 *
 * `dbGet()` sans argument rendait la racine de l'espace en une requête. Depuis
 * que le droit de lecture a descendu d'un cran — retiré de `household`, reposé
 * sur chacun de ses enfants —, cette requête est refusée : Realtime Database
 * refuse un nœud EN ENTIER, jamais partiellement. Elle ne rendait pas une
 * sauvegarde amputée, elle ne rendait rien.
 *
 * La couverture change de nature avec elle. Elle était STRUCTURELLE : lire la
 * racine emportait tout ce qui s'y trouvait, y compris un nœud dont personne
 * ne se souvenait. Elle est désormais tenue À LA MAIN, par cette liste — et
 * c'est exactement le genre de liste que ce dépôt paie en boucle. D'où le
 * troisième cas de `tests/sauvegarde-noeuds-declares.test.js` : tout nœud
 * déclaré doit être effectivement lu.
 *
 * ─────────────────────────────────────────────────────────────────────
 * L'ORDRE EST FIXÉ
 *
 * Realtime Database rend les enfants d'un objet dans l'ordre de leurs clés.
 * Trier reproduit donc l'enveloppe que produisait la lecture de racine, et
 * rend le fichier comparable d'une sauvegarde à l'autre. Tenu par
 * `sauvegarde-noeuds-declares.test.js`, qui compare les deux enveloppes.
 *
 * @param {string} noeudPersonnel - Nom du nœud de la poche personnelle
 * @param {Function} cheminDuPersonnel - Fabrique de chemin, depuis `db.js`
 * @param {'vous'|'conjointe'} emplacement - Le propriétaire connecté
 * @returns {Array<{noeud: string, chemin: string, sous: string|null}>}
 */
export function plansDeLecture(noeudPersonnel, cheminDuPersonnel, emplacement) {
  return NOEUDS_CONNUS
    .map((noeud) => (noeud === noeudPersonnel
      // On ne lit que la sienne, et c'est structurel : `personnel` en entier
      // n'est lisible par personne, son droit vit sur chaque moitié.
      ? { noeud, chemin: cheminDuPersonnel(emplacement), sous: emplacement }
      : { noeud, chemin: noeud, sous: null }))
    .sort((a, b) => (a.noeud < b.noeud ? -1 : a.noeud > b.noeud ? 1 : 0));
}

/**
 * Ce qu'une restauration écrit à la racine de l'espace
 *
 * ─────────────────────────────────────────────────────────────────────
 * UN `set` DE RACINE AURAIT EFFACÉ LA POCHE DE L'AUTRE
 *
 * La restauration faisait `dbSet(undefined, …)` : un remplacement de la racine
 * entière, autorisé par `household/.write` sans que rien n'exige que l'auteur
 * puisse LIRE ce qu'il écrase. Un `set` supprime ce qu'il ne porte pas — et
 * depuis le mur, un fichier de sauvegarde ne PEUT PLUS porter la poche de
 * l'autre, faute du droit de la lire. Restaurer l'aurait donc effacée, sans un
 * mot, le jour précis où l'on restaure parce que quelque chose est déjà cassé.
 *
 * D'où une mise à jour multi-chemins plutôt qu'un `set`. Elle garde la
 * sémantique « on remplace tout » sur les nœuds du foyer — un nœud absent du
 * fichier part à `null`, donc s'efface — et ne touche pas à `personnel`.
 *
 * `restaureLe` reste ce qui distingue une restauration d'un écrasement
 * accidentel : `household/.write` n'autorise le remplacement d'un conteneur
 * qu'à une écriture qui CHANGE ce marqueur. Il est donc porté ici aussi.
 *
 * @param {Object} donnees - `enveloppe.data` du fichier
 * @param {string} noeudPersonnel - Nom du nœud à laisser de côté
 * @param {number} maintenant - Valeur du marqueur de restauration
 * @returns {Object} Mise à jour multi-chemins, relative à l'espace
 */
export function ecrituresDeRestauration(donnees, noeudPersonnel, maintenant) {
  const ecritures = { restaureLe: maintenant };

  for (const noeud of NOEUDS_CONNUS) {
    if (noeud === noeudPersonnel || noeud === 'restaureLe') continue;
    // `null` efface : c'est ce qui rend cette mise à jour équivalente au `set`
    // d'avant sur les nœuds du foyer. Sans lui, un nœud présent en base et
    // absent du fichier survivrait à sa propre restauration.
    ecritures[noeud] = donnees[noeud] ?? null;
  }

  return ecritures;
}

/**
 * Valide l'enveloppe d'un fichier de sauvegarde
 *
 * Restaurer écrase l'intégralité des données : le fichier doit prouver qu'il
 * est bien une sauvegarde FairSplit avant qu'on le laisse faire.
 *
 * @param {*} enveloppe - Contenu analysé du fichier
 * @returns {string|null} Message d'erreur, ou null si le fichier est valide
 */
export function validateBackup(enveloppe) {
  if (!enveloppe || typeof enveloppe !== 'object' || Array.isArray(enveloppe)) {
    return 'Ce fichier n\'est pas une sauvegarde FairSplit.';
  }
  if (enveloppe.format !== FORMAT) {
    return 'Ce fichier n\'est pas une sauvegarde FairSplit.';
  }
  if (typeof enveloppe.version !== 'number' || enveloppe.version > FORMAT_VERSION) {
    return 'Cette sauvegarde vient d\'une version plus récente de l\'application.';
  }
  if (!enveloppe.data || typeof enveloppe.data !== 'object' || Array.isArray(enveloppe.data)) {
    return 'Cette sauvegarde ne contient aucune donnée exploitable.';
  }

  const inconnus = Object.keys(enveloppe.data).filter(cle => !NOEUDS_CONNUS.includes(cle));
  if (inconnus.length) {
    return `Cette sauvegarde contient des données que l'application ne connaît pas : ${inconnus.join(', ')}.`;
  }

  return null;
}

/**
 * Décrit ce qu'une sauvegarde contient, pour que la confirmation soit éclairée
 * @param {Object} enveloppe - Sauvegarde validée
 * @returns {string} Résumé lisible
 */
export function describeBackup(enveloppe) {
  const periodes = Object.keys(enveloppe.data.periods || {}).length;
  const date = enveloppe.exportedAt
    ? new Date(enveloppe.exportedAt).toLocaleString('fr-FR')
    : 'date inconnue';

  return `${periodes} mois, sauvegardés le ${date}`;
}

/**
 * Traite le fichier choisi par l'utilisateur
 * @param {Event} event - Événement change du champ fichier
 * @returns {Promise<void>}
 */
async function handleFileSelected(event) {
  const input = event.target;
  const fichier = input.files && input.files[0];

  // Réarmer le champ : sans cela, choisir deux fois le même fichier
  // n'émettrait pas de second événement.
  input.value = '';

  if (!fichier) return;
  await restoreBackup(fichier);
}

/**
 * Restaure une sauvegarde, en écrasant les données existantes
 *
 * Une copie de l'état courant est téléchargée avant toute écriture. C'est la
 * seule protection réelle : une fois le nœud remplacé, l'ancien contenu n'est
 * plus nulle part.
 *
 * @param {File} fichier - Fichier de sauvegarde choisi
 * @returns {Promise<void>}
 */
export async function restoreBackup(fichier) {
  let enveloppe;

  try {
    enveloppe = JSON.parse(await fichier.text());
  } catch {
    toast.error('Fichier illisible : ce n\'est pas du JSON valide.');
    return;
  }

  const probleme = validateBackup(enveloppe);
  if (probleme) {
    toast.error(probleme);
    return;
  }

  // Une restauration ne se diffère pas.
  //
  // Hors ligne, `dbSet` mettait l'écrasement de toute la racine en file et
  // rendait la main sans lever : l'application annonçait « Sauvegarde
  // restaurée », rechargeait, et l'écrasement réel survenait à la reconnexion
  // — bien plus tard, éventuellement sous la session de l'autre compte, et
  // par-dessus les dépenses qu'il avait saisies entre-temps.
  //
  // C'est le cas nominal, pas un cas tordu : on va chercher « Restaurer une
  // sauvegarde » précisément quand l'application paraît cassée, c'est-à-dire
  // quand la base est injoignable.
  const { liaisonRompue } = await import('../db.js');
  if (liaisonRompue()) {
    toast.error('Restauration impossible hors ligne — la base doit être joignable');
    return;
  }

  const confirme = await showConfirmModal(
    `Remplacer toutes vos données par cette sauvegarde (${describeBackup(enveloppe)}) ? ` +
    'Une copie de l\'état actuel sera téléchargée avant le remplacement.',
    { libelle: 'Restaurer', ton: TON.DESTRUCTIF }
  );
  if (!confirme) return;

  // Suit laquelle des deux écritures a abouti, pour que le message d'échec
  // reste exact. Voir le `catch`.
  let foyerEcrit = false;

  try {
    // Copie de sécurité d'abord : si l'écriture qui suit se révèle être une
    // erreur, c'est le seul chemin de retour.
    const secours = await buildBackup();
    telecharger(secours.contenu, `avant-restauration-${secours.nom}`);

    const { dbSet, dbUpdate, cheminDuPersonnel, NOEUD_PERSONNEL } =
      await import('../db.js');
    const maintenant = Date.now();

    // Les nœuds du foyer, en une mise à jour multi-chemins. Ce n'est plus un
    // `set` de racine : celui-là effaçait ce qu'il ne portait pas, donc la
    // poche personnelle de l'autre, qu'un fichier ne peut plus contenir.
    // `ecrituresDeRestauration` dit pourquoi, et porte le marqueur.
    await dbUpdate(undefined,
      ecrituresDeRestauration(enveloppe.data, NOEUD_PERSONNEL, maintenant));

    // À partir d'ici, le foyer EST restauré. Ce qui suit peut encore échouer,
    // et le message d'échec ne peut donc plus dire « rien n'a été modifié ».
    foyerEcrit = true;

    // Puis la sienne, et elle seule. Chacun restaure sa poche ; personne
    // n'écrase celle de l'autre. Le fichier d'un foyer qui n'a rien de
    // personnel n'en porte pas : on n'écrit alors rien du tout, plutôt que de
    // créer un nœud vide qui changerait la forme des sauvegardes suivantes.
    const emplacement = normaliserEmplacement(getState('emplacementCourant'));
    const mienne = enveloppe.data[NOEUD_PERSONNEL]
      && enveloppe.data[NOEUD_PERSONNEL][emplacement];
    if (mienne) {
      await dbSet(cheminDuPersonnel(emplacement), { ...mienne, restaureLe: maintenant });
    }

    closeModal('modalBackup', false);
    toast.success('Sauvegarde restaurée — rechargement…');

    // Tout l'état en mémoire décrit désormais des données périmées. Recharger
    // est plus sûr que de tenter de remettre à jour chaque module.
    setTimeout(() => window.location.reload(), 1200);
  } catch (error) {
    logError('❌ Erreur de restauration :', error);

    // La restauration se fait désormais en DEUX écritures — le foyer, puis la
    // poche personnelle —, et le message doit dire laquelle a abouti.
    //
    // « Vos données n'ont pas été modifiées » était vrai tant qu'un seul `set`
    // faisait tout : il passait ou il ne passait pas. Le laisser tel quel
    // ferait dire à l'écran, sur un échec de la seconde écriture, que rien n'a
    // bougé alors que tout le foyer vient d'être remplacé — et la personne
    // relancerait, ou pire, ne relancerait pas.
    toast.error(foyerEcrit
      ? 'Foyer restauré, mais vos dépenses personnelles ne l\'ont pas été — '
        + 'relancez la restauration'
      : 'Restauration impossible — vos données n\'ont pas été modifiées');
  }
}
