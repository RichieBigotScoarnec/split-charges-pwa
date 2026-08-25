// ===== MODULE : EXPORT DE DONNÉES =====
// Fonctionnalités : CSV, PDF (optionnel)

import { getState } from '../state.js';
import { REIMBURSEMENT_DIRECTIONS } from '../config.js';
import { memberLabel } from '../utils/members.js';
import { formatCurrency, escapeHtml, formatPaidBy } from '../utils/format.js';
import { formatDate, dateDeLaCharge, formatDateEtHeure, heureDeLaCharge } from '../utils/date.js';
import { toast } from '../components/toast.js';
import { log, error as logError } from '../utils/debug.js';

/**
 * Initialise le module d'export
 */
export function initExport() {
  log('📦 Initialisation module export');

  // Les deux boutons passent par data-action ; les fonctions sont exposées
  // en fin de module.
  log('✅ Module export initialisé');
}


/**
 * Met une valeur en forme pour une cellule CSV
 *
 * Deux défauts se corrigent au même endroit.
 *
 * Le guillemet, d'abord : les champs étaient encadrés de `"` sans que les
 * guillemets du contenu soient doublés. Une description en contenant décalait
 * toutes les colonnes suivantes — le fichier restait lisible, mais faux.
 *
 * La formule ensuite : un tableur interprète toute cellule commençant par
 * `=`, `+`, `-` ou `@` comme une formule, et l'exécute à l'ouverture du
 * fichier. Une description valant `=HYPERLINK("http://…")` devient un appel
 * sortant chez qui ouvre l'export. L'apostrophe de tête est la parade
 * habituelle : elle force le type texte et reste invisible à l'affichage.
 *
 * @param {*} valeur - Contenu de la cellule
 * @returns {string} Cellule encadrée, sûre à l'ouverture
 */
export function champCsv(valeur) {
  const texte = valeur === null || valeur === undefined ? '' : String(valeur);
  const protege = /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
  return `"${protege.replace(/"/g, '""')}"`;
}

/**
 * Exporte les données au format CSV
 */
export function exportToCSV() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  try {
    const fixedCharges = (getState('fixedCharges') || []).filter(c => !c.deleted);
    const variableCharges = (getState('variableCharges') || []).filter(c => !c.deleted);
    const reimbursements = (getState('reimbursements') || []).filter(r => !r.deleted);
    const salaries = getState('salaries') || { vous: 0, conjointe: 0 };

    // Construire CSV
    let csv = '';

    // Header
    csv += '=== FAIRSPLIT - EXPORT DONNÉES ===\n';
    csv += `Période: ${currentPeriod}\n`;
    csv += `Date export: ${new Date().toLocaleString('fr-FR')}\n`;
    csv += '\n';

    // Salaires
    csv += '=== SALAIRES ===\n';
    csv += 'Personne;Salaire\n';
    const membres = getState('members');
    csv += `${champCsv(memberLabel('vous', membres))};${Number(salaries.vous) || 0}\n`;
    csv += `${champCsv(memberLabel('conjointe', membres))};${Number(salaries.conjointe) || 0}\n`;
    csv += '\n';

    // Charges fixes
    csv += '=== CHARGES FIXES ===\n';
    csv += 'Description;Catégorie;Montant;Payé par;Date\n';
    fixedCharges.forEach(charge => {
      csv += `${champCsv(charge.description)};${champCsv(charge.category)};${Number(charge.amount) || 0};${champCsv(formatPaidBy(charge.paidBy))};${champCsv(formatDate(dateDeLaCharge(charge)))}\n`;
    });
    csv += `\nTotal charges fixes: ${formatCurrency(fixedCharges.reduce((sum, c) => sum + c.amount, 0))}\n`;
    csv += '\n';

    // Charges variables
    csv += '=== CHARGES VARIABLES ===\n';
    // L'heure dans sa propre colonne, et non collée à la date : un tableur trie
    // et filtre deux colonnes, pas une phrase. Les charges fixes n'en ont pas —
    // un prélèvement mensuel n'a pas d'heure.
    csv += 'Description;Catégorie;Montant;Payé par;Date;Heure\n';
    variableCharges.forEach(charge => {
      csv += `${champCsv(charge.description)};${champCsv(charge.category)};${Number(charge.amount) || 0};${champCsv(formatPaidBy(charge.paidBy))};${champCsv(formatDate(dateDeLaCharge(charge)))};${champCsv(heureDeLaCharge(charge))}\n`;
    });
    csv += `\nTotal charges variables: ${formatCurrency(variableCharges.reduce((sum, c) => sum + c.amount, 0))}\n`;
    csv += '\n';

    // Remboursements
    if (reimbursements.length > 0) {
      csv += '=== REMBOURSEMENTS ===\n';
      csv += 'De;Vers;Montant;Date\n';
      reimbursements.forEach(reimb => {
        const dir = parseReimbDirection(reimb.direction);
        csv += `${champCsv(dir.from)};${champCsv(dir.to)};${Number(reimb.amount) || 0};${champCsv(formatDate(reimb.timestamp))}\n`;
      });
      csv += '\n';
    }

    // Télécharger fichier
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `fairsplit_${currentPeriod}_${Date.now()}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Export CSV réussi');

  } catch (error) {
    logError('❌ Erreur export CSV :', error);
    toast.error('Erreur lors de l\'export CSV');
  }
}

/**
 * Exporte les données au format PDF (utilise print pour l'instant)
 */
export function exportToPDF() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  try {
    // Créer une nouvelle fenêtre avec les données formatées pour impression
    const fixedCharges = (getState('fixedCharges') || []).filter(c => !c.deleted);
    const variableCharges = (getState('variableCharges') || []).filter(c => !c.deleted);
    const reimbursements = (getState('reimbursements') || []).filter(r => !r.deleted);
    const salaries = getState('salaries') || { vous: 0, conjointe: 0 };

    const printWindow = window.open('', '', 'width=800,height=600');

    // Un bloqueur de fenêtres renvoie null. Sans ce contrôle, l'accès à
    // `printWindow.document` levait une exception rattrapée plus bas, et
    // l'utilisateur lisait « Erreur lors de l'export PDF » là où il fallait
    // lui dire d'autoriser les fenêtres.
    if (!printWindow) {
      toast.error('Fenêtre bloquée par le navigateur — autorisez les fenêtres pour ce site');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <!--
          La page principale porte sa politique de sécurité en balise meta. Un
          document écrit dans une fenêtre vierge en hérite selon les
          navigateurs, pas selon une garantie : ce relevé est donc le seul
          endroit de l'application où du balisage injecté pourrait s'exécuter.
          Il porte sa propre politique, et n'a besoin d'aucun script pour
          fonctionner — le bouton est câblé depuis la fenêtre appelante.
        -->
        <meta http-equiv="Content-Security-Policy"
              content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'">
        <title>FairSplit - Export ${escapeHtml(currentPeriod)}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
          }
          h1, h2 {
            color: #667eea;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
            font-weight: bold;
          }
          .total {
            font-weight: bold;
            background-color: #f9f9f9;
          }
          .section {
            margin: 30px 0;
          }
          @media print {
            button {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <h1>FairSplit - Relevé de Charges</h1>
        <p><strong>Période :</strong> ${escapeHtml(currentPeriod)}</p>
        <p><strong>Date d'export :</strong> ${new Date().toLocaleString('fr-FR')}</p>

        <div class="section">
          <h2>Salaires</h2>
          <table>
            <tr>
              <th>Personne</th>
              <th>Salaire</th>
            </tr>
            <tr>
              <td>${escapeHtml(memberLabel('vous', getState('members')))}</td>
              <td>${formatCurrency(salaries.vous)}</td>
            </tr>
            <tr>
              <td>${escapeHtml(memberLabel('conjointe', getState('members')))}</td>
              <td>${formatCurrency(salaries.conjointe)}</td>
            </tr>
          </table>
        </div>

        <div class="section">
          <h2>Charges Fixes</h2>
          <table>
            <tr>
              <th>Description</th>
              <th>Catégorie</th>
              <th>Montant</th>
              <th>Payé par</th>
              <th>Date</th>
            </tr>
            ${fixedCharges.map(charge => `
              <tr>
                <td>${escapeHtml(charge.description)}</td>
                <td>${escapeHtml(charge.category)}</td>
                <td>${formatCurrency(charge.amount)}</td>
                <td>${escapeHtml(formatPaidBy(charge.paidBy))}</td>
                <td>${escapeHtml(formatDate(dateDeLaCharge(charge)))}</td>
              </tr>
            `).join('')}
            <tr class="total">
              <td colspan="2"><strong>Total</strong></td>
              <td colspan="3"><strong>${formatCurrency(fixedCharges.reduce((sum, c) => sum + c.amount, 0))}</strong></td>
            </tr>
          </table>
        </div>

        <div class="section">
          <h2>Charges Variables</h2>
          <table>
            <tr>
              <th>Description</th>
              <th>Catégorie</th>
              <th>Montant</th>
              <th>Payé par</th>
              <th>Date</th>
            </tr>
            ${variableCharges.map(charge => `
              <tr>
                <td>${escapeHtml(charge.description)}</td>
                <td>${escapeHtml(charge.category)}</td>
                <td>${formatCurrency(charge.amount)}</td>
                <td>${escapeHtml(formatPaidBy(charge.paidBy))}</td>
                <td>${escapeHtml(formatDateEtHeure(charge))}</td>
              </tr>
            `).join('')}
            <tr class="total">
              <td colspan="2"><strong>Total</strong></td>
              <td colspan="3"><strong>${formatCurrency(variableCharges.reduce((sum, c) => sum + c.amount, 0))}</strong></td>
            </tr>
          </table>
        </div>

        ${reimbursements.length > 0 ? `
        <div class="section">
          <h2>Remboursements</h2>
          <table>
            <tr>
              <th>De</th>
              <th>Vers</th>
              <th>Montant</th>
              <th>Date</th>
            </tr>
            ${reimbursements.map(reimb => `
              <tr>
                <td>${escapeHtml(parseReimbDirection(reimb.direction).from)}</td>
                <td>${escapeHtml(parseReimbDirection(reimb.direction).to)}</td>
                <td>${formatCurrency(reimb.amount)}</td>
                <td>${formatDate(reimb.timestamp)}</td>
              </tr>
            `).join('')}
          </table>
        </div>
        ` : ''}

        <button type="button" id="imprimer">Imprimer / Enregistrer en PDF</button>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();

    // Le bouton portait un `onclick` inline : bloqué par toute politique de
    // sécurité digne de ce nom, donc silencieusement inerte. Le câbler depuis
    // ici fonctionne — même origine — et n'exige aucun script dans le document.
    const bouton = printWindow.document.getElementById('imprimer');
    if (bouton) bouton.addEventListener('click', () => printWindow.print());

    toast.info('Fenêtre d\'impression ouverte');

  } catch (error) {
    logError('❌ Erreur export PDF :', error);
    toast.error('Erreur lors de l\'export PDF');
  }
}

/**
 * Parse le champ direction d'un remboursement en from/to lisibles
 *
 * Les deux libellés étaient figés à « Vous » et « Conjointe ». Un relevé
 * exporté portait donc des noms que l'application n'utilise plus dès qu'un
 * prénom est renseigné — et c'est le document qu'on transmet, celui où
 * l'ambiguïté coûte le plus cher : « Vous » ne désigne personne pour qui le
 * lit.
 *
 * Les deux valeurs de direction étaient par ailleurs écrites en clair ici,
 * alors qu'elles ont des constantes partagées : c'est exactement la divergence
 * qui avait déjà fait compter des remboursements à l'envers.
 *
 * @param {string} direction - Valeur de REIMBURSEMENT_DIRECTIONS
 * @returns {{from: string, to: string}} Prénoms du foyer, ou « ? » si inconnue
 */
function parseReimbDirection(direction) {
  const membres = getState('members');
  const vous = memberLabel('vous', membres);
  const conjointe = memberLabel('conjointe', membres);

  if (direction === REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER) return { from: vous, to: conjointe };
  if (direction === REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU) return { from: conjointe, to: vous };
  return { from: '?', to: '?' };
}

// Exposer globalement pour compatibilité
window.exportToCSV = exportToCSV;
window.exportToPDF = exportToPDF;
