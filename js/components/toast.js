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
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
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
