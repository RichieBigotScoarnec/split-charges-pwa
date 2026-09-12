// ===== MODULE : IMPORT CSV =====
//
// Les données n'entraient que charge par charge. Le premier mois se saisissait
// à la main, et un relevé bancaire — qui contient déjà les trois quarts de ce
// qu'on va retaper — ne pouvait pas être versé. L'export sortait en CSV et en
// PDF ; la seule entrée en masse était la restauration d'une sauvegarde
// complète, qui écrase tout.
//
// Trois principes tiennent cet écran :
//
//   1. **On n'écrase jamais.** Les lignes s'ajoutent au mois affiché. Un import
//      raté se répare à la corbeille, pas par une restauration.
//   2. **On montre avant d'écrire.** Le nombre de lignes prêtes, le nombre de
//      rejetées, et le motif de chaque rejet. Un import qui avale une ligne sur
//      trois sans le dire est pire qu'un import qui refuse tout.
//   3. **On ne devine pas le payeur.** C'est la seule donnée qu'aucun défaut
//      raisonnable ne peut remplacer : l'application entière sert à dire qui
//      doit combien à qui.

import { getState } from '../state.js';
import { toast } from '../components/toast.js';
import { escapeHtml, formatCurrency } from '../utils/format.js';
import { log, error as logError } from '../utils/debug.js';
import { analyserCsv } from '../utils/import-csv.js';
import { memberLabel } from '../utils/members.js';
import { moisLisible } from './envelopes.js';

/** Combien de lignes l'aperçu montre avant de résumer */
const APERCU = 8;

/** Le dernier fichier analysé, gardé entre l'aperçu et la confirmation */
let analyse = null;

/**
 * Ouvre l'écran d'import
 * @returns {void}
 */
function showImportModal() {
  analyse = null;

  let modal = document.getElementById('modalImport');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalImport';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'importTitre');
    document.body.appendChild(modal);
  }

  const periode = getState('currentPeriod') || '';
  const membres = getState('members');

  modal.innerHTML = `
    <div class="modal import-modal">
      <h2 class="modal-header" id="importTitre">📥 Importer un CSV</h2>

      <p class="form-aide">
        Les lignes s'ajouteront à <strong>${escapeHtml(moisLisible(periode) || 'ce mois')}</strong>.
        Rien n'est écrasé : en cas d'erreur, la corbeille rattrape.
      </p>

      <div class="import-format">
        <div class="import-format-titre">Format attendu</div>
        <code class="import-format-exemple">Description;Catégorie;Montant;Payé par;Date;Type
Courses Leclerc;Courses;84,30;vous;2026-08-12;variable</code>
        <p class="form-aide">
          Seuls <strong>Description</strong> et <strong>Montant</strong> sont obligatoires.
          Séparateur <code>;</code> ou <code>,</code> · montant à virgule ou à point ·
          date en <code>AAAA-MM-JJ</code> ou <code>JJ/MM/AAAA</code> ·
          type <code>fixe</code> ou <code>variable</code> (variable par défaut).
        </p>
      </div>

      <div class="form-group">
        <label for="importFichier">Fichier CSV</label>
        <input type="file" id="importFichier" accept=".csv,text/csv,text/plain" />
      </div>

      <div class="form-group" id="importPayeurChamp" hidden>
        <label for="importPayeur">Payé par (le fichier ne le dit pas)</label>
        <select id="importPayeur">
          <option value="">— choisir —</option>
          <option value="vous">${escapeHtml(memberLabel('vous', membres))}</option>
          <option value="conjointe">${escapeHtml(memberLabel('conjointe', membres))}</option>
          <option value="partage">Partagé</option>
        </select>
        <p class="form-aide">Sans ce choix, aucune ligne ne sera importée : le payeur ne se devine pas.</p>
      </div>

      <div id="importApercu"></div>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="importFermer">Annuler</button>
        <button type="button" class="btn btn-primary" id="importValider" disabled>Importer</button>
      </div>
    </div>
  `;

  brancherLEcran(modal);
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('active'));
}

/**
 * Branche les commandes de l'écran
 * @param {HTMLElement} modal
 * @returns {void}
 */
function brancherLEcran(modal) {
  const fermer = () => {
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  };

  modal.querySelector('#importFermer').addEventListener('click', fermer);

  const champFichier = modal.querySelector('#importFichier');
  const champPayeur = modal.querySelector('#importPayeur');

  const relire = async () => {
    const fichier = champFichier.files && champFichier.files[0];
    if (!fichier) return;

    let texte;
    try {
      texte = await fichier.text();
    } catch (erreur) {
      logError('❌ Fichier illisible :', erreur);
      toast.error('Fichier illisible');
      return;
    }

    analyse = analyserCsv(texte, { payeurParDefaut: champPayeur.value || null });

    // Le choix du payeur n'apparaît que s'il manque : le proposer sans raison
    // ferait douter de ce que le fichier contient.
    modal.querySelector('#importPayeurChamp').hidden = !analyse.payeurManquant;

    rendreApercu(modal, analyse);
  };

  champFichier.addEventListener('change', relire);
  champPayeur.addEventListener('change', relire);

  modal.querySelector('#importValider').addEventListener('click', async () => {
    if (!analyse || analyse.lignes.length === 0) return;
    const ecrites = await ecrireLesLignes(analyse.lignes);
    if (ecrites > 0) fermer();
  });
}

/**
 * Montre ce qui sera écrit, et ce qui a été refusé
 *
 * @param {HTMLElement} modal
 * @param {Object} resultat - Sortie de `analyserCsv`
 * @returns {void}
 */
function rendreApercu(modal, resultat) {
  const zone = modal.querySelector('#importApercu');
  const valider = modal.querySelector('#importValider');
  const { lignes, rejets } = resultat;

  valider.disabled = lignes.length === 0;

  if (lignes.length === 0 && rejets.length === 0) {
    zone.innerHTML = '<p class="empty-state">Aucune colonne « Description » ni « Montant » reconnue dans l\'en-tête.</p>';
    return;
  }

  const total = lignes.reduce((somme, ligne) => somme + ligne.amount, 0);

  const apercu = lignes.slice(0, APERCU).map(ligne => `
    <div class="import-ligne">
      <span class="import-ligne-titre">${escapeHtml(ligne.description)}</span>
      <span class="import-ligne-detail">${escapeHtml(ligne.category)} · ${escapeHtml(ligne.paidBy)}${ligne.date ? ` · ${escapeHtml(ligne.date)}` : ''}${ligne.type === 'fixe' ? ' · fixe' : ''}</span>
      <span class="import-ligne-montant">${formatCurrency(ligne.amount)}</span>
    </div>
  `).join('');

  const reste = lignes.length - Math.min(lignes.length, APERCU);

  const bloquees = rejets.length === 0 ? '' : `
    <div class="import-rejets">
      <div class="import-rejets-titre">
        <span aria-hidden="true">⚠️</span>
        ${rejets.length} ligne${rejets.length > 1 ? 's' : ''} non importée${rejets.length > 1 ? 's' : ''}
      </div>
      ${rejets.slice(0, APERCU).map(rejet => `
        <div class="import-rejet">Ligne ${rejet.ligne} — ${escapeHtml(rejet.motif)}</div>
      `).join('')}
      ${rejets.length > APERCU ? `<div class="import-rejet">et ${rejets.length - APERCU} autre${rejets.length - APERCU > 1 ? 's' : ''}…</div>` : ''}
    </div>
  `;

  zone.innerHTML = `
    <div class="import-resume">
      <strong>${lignes.length}</strong> ligne${lignes.length > 1 ? 's' : ''} prête${lignes.length > 1 ? 's' : ''}
      · ${formatCurrency(total)}
    </div>
    ${apercu}
    ${reste > 0 ? `<div class="import-ligne-detail">et ${reste} autre${reste > 1 ? 's' : ''}…</div>` : ''}
    ${bloquees}
  `;
}

/**
 * Écrit les lignes retenues dans le mois affiché
 *
 * Une seule écriture multi-chemins : soit tout entre, soit rien. Un import à
 * moitié fait laisserait à chercher ce qui est passé et ce qui manque.
 *
 * @param {Array<Object>} lignes
 * @returns {Promise<number>} Combien de lignes ont été écrites
 */
async function ecrireLesLignes(lignes) {
  const periode = getState('currentPeriod');
  if (!periode) {
    toast.error('Aucun mois sélectionné');
    return 0;
  }

  try {
    const { dbUpdate } = await import('../db.js');
    const { getFirebaseDatabase } = await import('../firebase-init.js');
    const database = getFirebaseDatabase();
    if (!database) throw new Error('base indisponible');

    const ecritures = {};
    for (const ligne of lignes) {
      const cle = database.ref().push().key;
      const noeud = ligne.type === 'fixe' ? 'fixedCharges' : 'variableCharges';
      ecritures[`periods/${periode}/${noeud}/${cle}`] = {
        description: ligne.description,
        amount: ligne.amount,
        category: ligne.category,
        paidBy: ligne.paidBy,
        // Les règles acceptent la chaîne vide ; `null` supprimerait la clé, ce
        // qui revient au même mais se lit moins bien dans la base.
        date: ligne.date || '',
        deleted: false,
        timestamp: Date.now()
      };
    }

    await dbUpdate(undefined, ecritures);
  } catch (erreur) {
    logError('❌ Import impossible :', erreur);
    toast.error('Import non enregistré');
    return 0;
  }

  toast.success(`${lignes.length} charge${lignes.length > 1 ? 's' : ''} importée${lignes.length > 1 ? 's' : ''}`);

  // Relire par le chemin de l'application, comme le fait le sélecteur de mois.
  if (typeof window.changePeriod === 'function') window.changePeriod();
  return lignes.length;
}

/**
 * Initialise le module
 * @returns {void}
 */
export function initImport() {
  log('📦 Module import CSV initialisé');
}

window.showImportModal = showImportModal;
export { showImportModal };
