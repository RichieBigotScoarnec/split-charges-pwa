/**
 * FairSplit - Toast Notifications
 * @description Système de notifications toast
 */

import { UI } from '../config.js';

let toastContainer = null;

/**
 * Initialize toast container
 */
function ensureContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';

    // Une région vivante, sans quoi rien de tout cela n'est annoncé.
    //
    // Le conteneur n'en portait aucune : « Charge enregistrée », « Erreur :
    // impossible de sauvegarder », tout le retour de l'application passait
    // muet pour un lecteur d'écran — alors que chaque bandeau du HTML porte
    // scrupuleusement son `role="status"`. Le seul retour de la saisie était
    // donc la fermeture de la modale, qui ne distingue pas la réussite de
    // l'échec.
    //
    // Elle est posée sur le conteneur et non sur chaque message : une région
    // doit exister dans la page *avant* que son contenu change, sinon
    // l'insertion n'est pas détectée. Les messages arrivent ensuite dedans.
    //
    // `polite` par défaut, `aria-atomic="false"` pour que deux messages
    // simultanés soient lus l'un puis l'autre, et non le bloc entier relu à
    // chaque ajout. Les erreurs relèvent la voix, plus bas, sur le message
    // lui-même.
    toastContainer.setAttribute('role', 'status');
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('aria-atomic', 'false');
    // La marge basse tient compte de la barre de navigation du téléphone.
    // `.toast` déclarait bien `bottom: env(safe-area-inset-bottom, 20px)`, mais
    // la ligne suivante l'écrasait par `bottom: 20px` : le repli était pris
    // pour la valeur, et les messages passaient sous la barre. Ici la garde
    // s'ajoute aux 80 px qui laissent le bouton flottant dégagé.
    toastContainer.style.cssText = `
      position: fixed;
      bottom: calc(80px + env(safe-area-inset-bottom, 0px));
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type: 'success', 'error', 'info', 'warning'
 * @param {Object} options - Additional options
 * @param {number} options.duration - Duration in ms
 * @param {Function} options.onUndo - Undo callback (shows undo button)
 * @returns {HTMLElement} Toast element
 */
function showToast(message, type = 'success', options = {}) {
  ensureContainer();

  const {
    duration = UI.TOAST_DURATION,
    onUndo = null
  } = options;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  // Une erreur interrompt, le reste attend son tour. « Erreur : impossible de
  // sauvegarder le mode de partage » n'a pas à patienter derrière la fin d'une
  // autre phrase — le message dure dix secondes et disparaît.
  if (type === 'error') {
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
  }

  // Toast content
  const content = document.createElement('span');
  content.textContent = message;
  toast.appendChild(content);

  // Undo button if callback provided
  if (onUndo) {
    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Annuler';
    undoBtn.style.cssText = `
      margin-left: 12px;
      padding: 4px 12px;
      background: rgba(255,255,255,0.2);
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      font-weight: 600;
    `;
    undoBtn.onclick = () => {
      onUndo();
      removeToast(toast);
    };
    toast.appendChild(undoBtn);
  }

  toastContainer.appendChild(toast);

  // Auto-remove
  const timeout = setTimeout(() => {
    removeToast(toast);
  }, onUndo ? UI.UNDO_DURATION : duration);

  // Store timeout for manual removal
  toast._timeout = timeout;

  return toast;
}

/**
 * Remove toast
 * @param {HTMLElement} toast
 */
function removeToast(toast) {
  if (toast._timeout) {
    clearTimeout(toast._timeout);
  }

  toast.style.animation = 'slideOut 0.3s ease-out forwards';
  setTimeout(() => {
    toast.remove();
  }, 300);
}

/**
 * Shorthand methods
 */
export const toast = {
  success: (msg, opts) => showToast(msg, 'success', opts),
  error: (msg, opts) => showToast(msg, 'error', opts),
  info: (msg, opts) => showToast(msg, 'info', opts),
  warning: (msg, opts) => showToast(msg, 'warning', opts)
};
