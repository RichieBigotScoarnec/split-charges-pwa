// ===== MODULE : EXPORT DE DONNÉES =====
// Fonctionnalités : CSV, PDF (optionnel)

import { getState } from '../state.js';
import { formatCurrency, escapeHtml, formatPaidBy } from '../utils/format.js';
import { formatDate } from '../utils/date.js';
import { toast } from '../components/toast.js';

/**
 * Initialise le module d'export
 */
export function initExport() {
  console.log('📦 Initialisation module export');

  setupExportUI();

  console.log('✅ Module export initialisé');
}

/**
 * Configure les listeners UI d'export
 */
function setupExportUI() {
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', exportToCSV);
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', exportToPDF);
  }
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
    csv += `Vous;${salaries.vous}\n`;
    csv += `Conjointe;${salaries.conjointe}\n`;
    csv += '\n';

    // Charges fixes
    csv += '=== CHARGES FIXES ===\n';
    csv += 'Description;Catégorie;Montant;Payé par;Date\n';
    fixedCharges.forEach(charge => {
      csv += `"${charge.description}";"${charge.category}";${charge.amount};"${formatPaidBy(charge.paidBy)}";"${formatDate(charge.timestamp)}"\n`;
    });
    csv += `\nTotal charges fixes: ${formatCurrency(fixedCharges.reduce((sum, c) => sum + c.amount, 0))}\n`;
    csv += '\n';

    // Charges variables
    csv += '=== CHARGES VARIABLES ===\n';
    csv += 'Description;Catégorie;Montant;Payé par;Date\n';
    variableCharges.forEach(charge => {
      csv += `"${charge.description}";"${charge.category}";${charge.amount};"${formatPaidBy(charge.paidBy)}";"${formatDate(charge.timestamp)}"\n`;
    });
    csv += `\nTotal charges variables: ${formatCurrency(variableCharges.reduce((sum, c) => sum + c.amount, 0))}\n`;
    csv += '\n';

    // Remboursements
    if (reimbursements.length > 0) {
      csv += '=== REMBOURSEMENTS ===\n';
      csv += 'De;Vers;Montant;Date\n';
      reimbursements.forEach(reimb => {
        const dir = parseReimbDirection(reimb.direction);
        csv += `"${dir.from}";"${dir.to}";${reimb.amount};"${formatDate(reimb.timestamp)}"\n`;
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
    console.error('❌ Erreur export CSV :', error);
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

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>FairSplit - Export ${currentPeriod}</title>
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
        <p><strong>Période :</strong> ${currentPeriod}</p>
        <p><strong>Date d'export :</strong> ${new Date().toLocaleString('fr-FR')}</p>

        <div class="section">
          <h2>Salaires</h2>
          <table>
            <tr>
              <th>Personne</th>
              <th>Salaire</th>
            </tr>
            <tr>
              <td>Vous</td>
              <td>${formatCurrency(salaries.vous)}</td>
            </tr>
            <tr>
              <td>Conjointe</td>
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
                <td>${formatPaidBy(charge.paidBy)}</td>
                <td>${formatDate(charge.timestamp)}</td>
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
                <td>${formatPaidBy(charge.paidBy)}</td>
                <td>${formatDate(charge.timestamp)}</td>
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
                <td>${parseReimbDirection(reimb.direction).from}</td>
                <td>${parseReimbDirection(reimb.direction).to}</td>
                <td>${formatCurrency(reimb.amount)}</td>
                <td>${formatDate(reimb.timestamp)}</td>
              </tr>
            `).join('')}
          </table>
        </div>
        ` : ''}

        <button onclick="window.print()">Imprimer / Enregistrer en PDF</button>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();

    toast.info('Fenêtre d\'impression ouverte');

  } catch (error) {
    console.error('❌ Erreur export PDF :', error);
    toast.error('Erreur lors de l\'export PDF');
  }
}

/**
 * Parse le champ direction d'un remboursement en from/to lisibles
 * @param {string} direction - "vous-to-conjointe" ou "conjointe-to-vous"
 * @returns {{from: string, to: string}}
 */
function parseReimbDirection(direction) {
  if (direction === 'vous-to-conjointe') return { from: 'Vous', to: 'Conjointe' };
  if (direction === 'conjointe-to-vous') return { from: 'Conjointe', to: 'Vous' };
  return { from: '?', to: '?' };
}

// Exposer globalement pour compatibilité
window.exportToCSV = exportToCSV;
window.exportToPDF = exportToPDF;
