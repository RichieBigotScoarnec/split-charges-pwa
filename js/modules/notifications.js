// ===== MODULE : NOTIFICATIONS ET RAPPELS =====
// Fonctionnalités : rappels échéances, notifications charges récurrentes

import { getState } from '../state.js';
import { toast } from '../components/toast.js';
import { saveReminders, loadReminders } from '../db.js';
import { log, warn, error as logError } from '../utils/debug.js';

let _hourlyIntervalId = null;
let _dailyTimeoutId = null;

/**
 * Initialise le module de notifications
 */
export function initNotifications() {
  log('📦 Initialisation module notifications');

  setupNotificationPermissions();
  scheduleNotificationChecks();
  restoreReminderSettings();

  log('✅ Module notifications initialisé');
}

/**
 * Restaure les réglages de rappels depuis Firebase vers le DOM
 *
 * Sans cet appel, saveReminderSettings() écrivait dans Firebase sans que
 * rien ne relise jamais : les cases revenaient à leurs valeurs par défaut
 * du HTML à chaque rechargement.
 */
async function restoreReminderSettings() {
  try {
    const settings = await loadReminders();

    const finMoisEl = document.getElementById('reminderFinMois');
    const budgetEl = document.getElementById('reminderBudget');
    const budgetAmountEl = document.getElementById('budgetAmount');
    const reimbursementEl = document.getElementById('reminderReimbursement');

    if (finMoisEl) finMoisEl.checked = !!settings.finMois;
    if (budgetEl) budgetEl.checked = !!settings.budget;
    if (reimbursementEl) reimbursementEl.checked = !!settings.reimbursement;
    if (budgetAmountEl && settings.budgetAmount) {
      budgetAmountEl.value = settings.budgetAmount;
    }

    // Réaligner la visibilité du champ budget sur l'état restauré
    toggleBudgetInput();

    log('🔔 Réglages de rappels restaurés');
  } catch (error) {
    warn('⚠️ Impossible de restaurer les réglages de rappels :', error);
  }
}

/**
 * Configure les permissions de notifications du navigateur
 */
async function setupNotificationPermissions() {
  if (!('Notification' in window)) {
    warn('⚠️ Les notifications ne sont pas supportées par ce navigateur');
    return;
  }

  // Vérifier si déjà accordées
  if (Notification.permission === 'granted') {
    log('✅ Permissions de notification accordées');
    return;
  }

  // Si refusées, ne pas redemander
  if (Notification.permission === 'denied') {
    log('❌ Permissions de notification refusées');
    return;
  }

  // Si "default", on peut demander (mais on attend une action utilisateur)
  log('ℹ️ Permissions de notification non encore demandées');
}

/**
 * Demande les permissions de notification (à appeler sur action utilisateur)
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    toast.error('Notifications non supportées par votre navigateur');
    return false;
  }

  if (Notification.permission === 'granted') {
    toast.info('Notifications déjà activées');
    return true;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      toast.success('Notifications activées');

      // Envoyer notification de test
      new Notification('FairSplit - Notifications activées', {
        body: 'Vous recevrez des rappels pour les échéances importantes',
        icon: './icon-192.png',
        badge: './icon-192.png'
      });

      return true;
    } else {
      toast.warning('Notifications refusées');
      return false;
    }
  } catch (error) {
    logError('❌ Erreur demande permission notification :', error);
    toast.error('Erreur lors de l\'activation des notifications');
    return false;
  }
}

/**
 * Programme les vérifications périodiques des notifications
 */
function scheduleNotificationChecks() {
  // Vérification immédiate
  checkUpcomingDeadlines();

  // Vérification toutes les heures
  _hourlyIntervalId = setInterval(() => {
    checkUpcomingDeadlines();
  }, 60 * 60 * 1000); // 1 heure

  // Vérification quotidienne à 9h du matin
  scheduleDailyCheck();
}

/**
 * Programme une vérification quotidienne à 9h
 */
function scheduleDailyCheck() {
  const now = new Date();
  const scheduledTime = new Date();
  scheduledTime.setHours(9, 0, 0, 0);

  // Si déjà passé 9h aujourd'hui, planifier pour demain
  if (now > scheduledTime) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }

  const timeUntilCheck = scheduledTime - now;

  _dailyTimeoutId = setTimeout(() => {
    checkUpcomingDeadlines();
    // Re-planifier pour le lendemain
    scheduleDailyCheck();
  }, timeUntilCheck);
}

/**
 * Vérifie les échéances à venir et envoie des notifications
 */
export function checkUpcomingDeadlines() {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    return;
  }

  try {
    const notifications = [];

    // Vérifier si fin du mois approche (7 jours avant)
    const endOfMonthNotification = checkEndOfMonth(currentPeriod);
    if (endOfMonthNotification) {
      notifications.push(endOfMonthNotification);
    }

    // Vérifier les charges fixes non enregistrées
    const fixedChargesNotification = checkFixedCharges();
    if (fixedChargesNotification) {
      notifications.push(fixedChargesNotification);
    }

    // Vérifier les remboursements en attente
    const reimbursementsNotification = checkPendingReimbursements();
    if (reimbursementsNotification) {
      notifications.push(reimbursementsNotification);
    }

    // Envoyer les notifications
    notifications.forEach(notif => {
      sendNotification(notif.title, notif.body, notif.data);
    });

  } catch (error) {
    logError('❌ Erreur vérification échéances :', error);
  }
}

/**
 * Vérifie si la fin du mois approche
 * @param {string} currentPeriod - Période actuelle (YYYY-MM)
 * @returns {Object|null} Notification ou null
 */
function checkEndOfMonth(currentPeriod) {
  const [year, month] = currentPeriod.split('-').map(Number);
  const endOfMonth = new Date(year, month, 0); // Dernier jour du mois
  const today = new Date();
  const daysUntilEnd = Math.ceil((endOfMonth - today) / (1000 * 60 * 60 * 24));

  // Notifier 7 jours avant la fin du mois
  if (daysUntilEnd === 7) {
    return {
      title: '📅 Fin de période dans 7 jours',
      body: `N'oubliez pas d'enregistrer toutes vos charges pour ${currentPeriod}`,
      data: { type: 'end-of-month', period: currentPeriod }
    };
  }

  // Notifier le dernier jour
  if (daysUntilEnd === 0) {
    return {
      title: '⏰ Dernier jour de la période',
      body: `Aujourd'hui est le dernier jour pour enregistrer vos charges de ${currentPeriod}`,
      data: { type: 'end-of-month', period: currentPeriod }
    };
  }

  return null;
}

/**
 * Vérifie les charges fixes récurrentes
 * @returns {Object|null} Notification ou null
 */
function checkFixedCharges() {
  const fixedCharges = getState('fixedCharges') || [];
  const currentPeriod = getState('currentPeriod');

  if (!currentPeriod) {
    return null;
  }

  // Vérifier si c'est le début du mois (jour 1-3)
  const today = new Date();
  const dayOfMonth = today.getDate();

  if (dayOfMonth >= 1 && dayOfMonth <= 3) {
    // Vérifier si les charges fixes sont bien enregistrées
    const expectedCategories = ['Loyer', 'Énergie', 'Internet', 'Assurances'];
    const registeredCategories = new Set(fixedCharges.map(c => c.category));

    const missingCategories = expectedCategories.filter(cat => !registeredCategories.has(cat));

    if (missingCategories.length > 0 && dayOfMonth === 3) {
      return {
        title: '💡 Charges fixes mensuelles',
        body: `N'oubliez pas d'enregistrer vos charges fixes (${missingCategories.join(', ')})`,
        data: { type: 'fixed-charges-reminder', missing: missingCategories }
      };
    }
  }

  return null;
}

/**
 * Vérifie les remboursements en attente
 * @returns {Object|null} Notification ou null
 */
function checkPendingReimbursements() {
  const reimbursements = getState('reimbursements') || [];

  // Compter les remboursements non marqués comme effectués
  const pendingCount = reimbursements.filter(r => !r.completed).length;

  // Notifier s'il y a des remboursements en attente depuis plus de 7 jours
  if (pendingCount > 0) {
    const oldestPending = reimbursements
      .filter(r => !r.completed)
      .sort((a, b) => a.timestamp - b.timestamp)[0];

    if (oldestPending) {
      const daysSince = Math.floor((Date.now() - oldestPending.timestamp) / (1000 * 60 * 60 * 24));

      if (daysSince >= 7) {
        return {
          title: '💰 Remboursements en attente',
          body: `${pendingCount} remboursement(s) en attente depuis ${daysSince} jours`,
          data: { type: 'pending-reimbursements', count: pendingCount }
        };
      }
    }
  }

  return null;
}

/**
 * Envoie une notification système
 * @param {string} title - Titre de la notification
 * @param {string} body - Corps de la notification
 * @param {Object} data - Données additionnelles
 */
function sendNotification(title, body, data = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  try {
    const notification = new Notification(title, {
      body: body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: data.type || 'fairsplit-notification',
      requireInteraction: false,
      data: data
    });

    // Ouvrir l'app au clic sur la notification
    notification.onclick = function(event) {
      event.preventDefault();
      window.focus();
      notification.close();
    };

    // Auto-fermer après 10 secondes
    setTimeout(() => {
      notification.close();
    }, 10000);

    log('📬 Notification envoyée :', title);

  } catch (error) {
    logError('❌ Erreur envoi notification :', error);
  }
}

/**
 * Affiche un rappel dans l'interface (toast)
 * @param {string} message - Message du rappel
 * @param {string} type - Type de rappel (info, warning)
 */
export function showReminder(message, type = 'info') {
  if (type === 'warning') {
    toast.warning(message);
  } else {
    toast.info(message);
  }
}

/**
 * Obtient le statut des notifications
 * @returns {Object} Statut des notifications
 */
export function getNotificationStatus() {
  const supported = 'Notification' in window;
  return {
    supported,
    permission: supported ? Notification.permission : 'denied',
    enabled: supported && Notification.permission === 'granted'
  };
}

/**
 * Nettoie les timers de notifications (appeler au logout)
 */
export function cleanupNotifications() {
  if (_hourlyIntervalId) {
    clearInterval(_hourlyIntervalId);
    _hourlyIntervalId = null;
  }
  if (_dailyTimeoutId) {
    clearTimeout(_dailyTimeoutId);
    _dailyTimeoutId = null;
  }
  log('🧹 Timers notifications nettoyés');
}

/**
 * Sauvegarde les paramètres de rappels depuis le DOM vers Firebase
 * Appelée via data-on-change depuis FairSplit.html
 */
function saveReminderSettings() {
  const budgetAmount = parseFloat(document.getElementById('budgetAmount').value) || 3000;
  const settings = {
    finMois: document.getElementById('reminderFinMois').checked,
    budget: document.getElementById('reminderBudget').checked,
    budgetAmount: budgetAmount,
    reimbursement: document.getElementById('reminderReimbursement').checked
  };

  // Request notification permission if any toggle is on
  if (settings.finMois || settings.budget || settings.reimbursement) {
    requestNotificationPermission();
  }

  // Save to Firebase via db.js abstraction
  log('💾 Sauvegarde rappels:', JSON.stringify(settings));
  saveReminders(settings)
    .then(() => toast.success('Rappels sauvegardés'))
    .catch(() => toast.error('Erreur : impossible de sauvegarder les paramètres'));
}

/**
 * Toggle le panneau Rappels et Notifications (expand/collapse)
 */
function toggleRemindersPanel() {
  const body = document.getElementById('remindersBody');
  const icon = document.getElementById('remindersToggleIcon');
  const header = body?.closest('.reminders-section')?.querySelector('.reminders-header');

  if (!body) return;

  const isOpen = body.classList.toggle('open');
  if (icon) icon.textContent = isOpen ? '▲' : '▼';
  if (header) header.setAttribute('aria-expanded', String(isOpen));
}

// Exposer globalement pour compatibilité
window.saveReminderSettings = saveReminderSettings;
/**
 * Affiche/masque le champ budget quand le toggle Budget est activé/désactivé
 */
function toggleBudgetInput() {
  const budgetCheckbox = document.getElementById('reminderBudget');
  const budgetRow = document.getElementById('budgetInputRow');
  if (budgetRow) {
    budgetRow.classList.toggle('visible', !!budgetCheckbox?.checked);
  }
}

window.saveReminderSettings = saveReminderSettings;
window.toggleRemindersPanel = toggleRemindersPanel;
window.toggleBudgetInput = toggleBudgetInput;
window.requestNotificationPermission = requestNotificationPermission;
window.checkUpcomingDeadlines = checkUpcomingDeadlines;
