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
import { showModal, closeModal, showConfirmModal } from '../components/modal.js';
import { log, error as logError } from '../utils/debug.js';

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
  if (input) input.addEventListener('change', handleFileSelected);

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
 * @returns {Promise<{contenu: string, nom: string, periodes: number}>}
 */
async function buildBackup() {
  const { dbGet } = await import('../db.js');
  const donnees = await dbGet();

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
  'reminders',
  'periods'
];

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

  const confirme = await showConfirmModal(
    `Remplacer toutes vos données par cette sauvegarde (${describeBackup(enveloppe)}) ? ` +
    'Une copie de l\'état actuel sera téléchargée avant le remplacement.'
  );
  if (!confirme) return;

  try {
    // Copie de sécurité d'abord : si l'écriture qui suit se révèle être une
    // erreur, c'est le seul chemin de retour.
    const secours = await buildBackup();
    telecharger(secours.contenu, `avant-restauration-${secours.nom}`);

    const { dbSet } = await import('../db.js');
    await dbSet(undefined, enveloppe.data);

    closeModal('modalBackup', false);
    toast.success('Sauvegarde restaurée — rechargement…');

    // Tout l'état en mémoire décrit désormais des données périmées. Recharger
    // est plus sûr que de tenter de remettre à jour chaque module.
    setTimeout(() => window.location.reload(), 1200);
  } catch (error) {
    logError('❌ Erreur de restauration :', error);
    toast.error('Restauration impossible — vos données n\'ont pas été modifiées');
  }
}
