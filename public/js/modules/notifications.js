// ===== MODULE : NOTIFICATIONS ET RAPPELS =====
// Fonctionnalités : rappels échéances, notifications charges récurrentes

import { getState } from '../state.js';
import { toast } from '../components/toast.js';
import { saveReminders, loadReminders } from '../db.js';
import { log, warn, error as logError } from '../utils/debug.js';

let _hourlyIntervalId = null;
let _dailyTimeoutId = null;

/**
 * Réglages de rappels en vigueur
 *
 * Les trois cases étaient enregistrées, restaurées à l'écran… et jamais
 * consultées : `checkUpcomingDeadlines` notifiait quoi qu'il arrive. Les
 * décocher n'avait aucun effet.
 *
 * Tout est faux au départ, et le reste tant que la base n'a pas répondu :
 * notifier avant de savoir ce que la personne a demandé, c'est notifier contre
 * son choix.
 */
let reglages = { finMois: false, budget: false, budgetAmount: 0, reimbursement: false };

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
    reglages = { ...reglages, ...settings };

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

    // Les réglages sont connus : c'est maintenant, et pas avant, qu'une
    // vérification a un sens.
    checkUpcomingDeadlines();

    log('🔔 Réglages de rappels restaurés');
  } catch (error) {
    warn('⚠️ Impossible de restaurer les réglages de rappels :', error);
  }
}

/**
 * Configure les permissions de notifications du navigateur
 */
async function setupNotificationPermissions() {
  window.requestNotificationPermission = async () => {
    await requestNotificationPermission();
    renderNotificationStatus();
  };

  renderNotificationStatus();

  if (!('Notification' in window)) {
    warn('⚠️ Les notifications ne sont pas supportées par ce navigateur');
    return;
  }

  log(`ℹ️ Permission de notification : ${Notification.permission}`);
}

/**
 * Affiche l'état réel des notifications, et le moyen de les activer
 *
 * Le bloc annonçait « Activez les notifications pour recevoir les rappels »
 * quel que soit l'état réel — y compris une fois accordées — et n'offrait
 * aucun moyen de les activer. Rien ne le remplissait : le texte était figé
 * dans le HTML.
 */
export function renderNotificationStatus() {
  const bloc = document.getElementById('notificationsStatus');
  if (!bloc) return;

  bloc.replaceChildren();

  if (!('Notification' in window)) {
    bloc.textContent = 'Notifications non prises en charge par ce navigateur.';
    return;
  }

  if (Notification.permission === 'granted') {
    bloc.textContent = '🔔 Notifications activées.';
    return;
  }

  if (Notification.permission === 'denied') {
    // Le navigateur ne permet plus de redemander : seul un réglage manuel
    // peut revenir dessus, et le dire évite un bouton sans effet.
    bloc.textContent = '🔕 Notifications refusées — à réactiver dans les réglages du navigateur.';
    return;
  }

  const texte = document.createElement('span');
  texte.textContent = '📱 Les rappels demandent votre autorisation. ';

  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'btn-link';
  bouton.dataset.action = 'requestNotificationPermission';
  bouton.textContent = 'Autoriser';

  bloc.append(texte, bouton);
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
  // Pas de vérification immédiate ici : elle s'exécutait avant que les
  // réglages soient lus, donc sur des valeurs qui ne sont pas celles de la
  // personne. `restoreReminderSettings` déclenche la première vérification une
  // fois la base revenue — c'est le seul moment où elle veut dire quelque
  // chose.

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

    // Chaque rappel est subordonné à la case correspondante. Sans cela, les
    // décocher ne changeait rien.
    if (reglages.finMois) {
      const endOfMonthNotification = checkEndOfMonth(currentPeriod);
      if (endOfMonthNotification) {
        notifications.push(endOfMonthNotification);
      }
    }

    if (reglages.reimbursement) {
      const soldeNotification = checkSoldeNonRegle();
      if (soldeNotification) {
        notifications.push(soldeNotification);
      }
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
 * Signale un solde du mois qui reste à régler
 *
 * Remplace deux vérifications qui portaient sur des états que les données ne
 * produisent pas.
 *
 * La première comparait les charges fixes du mois à une liste attendue —
 * « Loyer », « Énergie », « Internet », « Assurances » — dont aucune n'existe
 * dans les catégories du projet. Les quatre étaient donc déclarées manquantes
 * chaque 3 du mois, quoi qu'on ait saisi. La reconduction automatique rend de
 * toute façon ce rappel sans objet : les charges fixes se recopient seules à
 * l'ouverture d'un mois neuf.
 *
 * La seconde comptait les remboursements « non effectués » via un champ
 * `completed` qui n'est écrit nulle part : tous comptaient comme en attente,
 * indéfiniment. La notion était fausse à la racine — un remboursement
 * enregistré est un transfert déjà fait. Ce qui reste en attente, c'est le
 * solde du mois, et lui se calcule.
 *
 * @returns {Object|null} Notification ou null
 */
function checkSoldeNonRegle() {
  const solde = getState('dernierSolde');
  if (typeof solde !== 'number') return null;

  // En deçà de l'euro, l'écart relève de l'arrondi, pas d'une dette.
  if (Math.abs(solde) < 1) return null;

  return {
    title: '💰 Solde du mois non réglé',
    body: `Il reste ${Math.abs(solde).toFixed(2)} € à régler entre vous.`,
    data: { type: 'solde-non-regle', montant: solde }
  };
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

  // Les réglages en vigueur suivent la saisie : sans cela, décocher une case
  // n'aurait d'effet qu'au prochain chargement de l'application.
  reglages = { ...reglages, ...settings };

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
