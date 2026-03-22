import { log, warn } from '../utils/debug.js';
/**
 * FairSplit - Modal Management
 * @description Gestion centralisée des modales
 */

let _escapeHandler = null;

// Sélecteurs des éléments focusables à l'intérieur d'une modale
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Piège le focus à l'intérieur d'une modale (WCAG 2.1 — 2.1.2 No Keyboard Trap)
 * @param {HTMLElement} modal
 * @returns {Function} cleanup — appeler pour supprimer le listener
 */
function trapFocus(modal) {
  const focusableEls = Array.from(modal.querySelectorAll(FOCUSABLE));
  if (focusableEls.length === 0) return () => {};

  const first = focusableEls[0];
  const last = focusableEls[focusableEls.length - 1];

  function onKeyDown(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        last.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  }

  modal.addEventListener('keydown', onKeyDown);
  return () => modal.removeEventListener('keydown', onKeyDown);
}

// Stocke les fonctions de cleanup du focus trap par modalId
const _focusTraps = {};

/**
 * Show modal by ID
 * @param {string} modalId - Modal element ID
 */
export function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');

    // Focus first input if exists
    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }

    // Activer le focus trap
    _focusTraps[modalId] = trapFocus(modal);
  }
}

/**
 * Close modal by ID
 * @param {string} modalId - Modal element ID
 * @param {boolean} resetForm - Reset form fields
 */
export function closeModal(modalId, resetForm = true) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');

    // Désactiver le focus trap
    if (_focusTraps[modalId]) {
      _focusTraps[modalId]();
      delete _focusTraps[modalId];
    }

    if (resetForm) {
      // Reset all inputs in modal
      const inputs = modal.querySelectorAll('input, textarea');
      inputs.forEach(input => {
        if (input.type === 'checkbox') {
          input.checked = false;
        } else {
          input.value = '';
        }
      });

      // Reset selects to first option
      const selects = modal.querySelectorAll('select');
      selects.forEach(select => {
        select.selectedIndex = 0;
      });
    }
  }
}

/**
 * Setup modal close on overlay click
 */
export function setupModalOverlayClose() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });
}

/**
 * Setup modal close on Escape key
 */
export function setupModalEscapeClose() {
  if (_escapeHandler) {
    document.removeEventListener('keydown', _escapeHandler);
  }
  _escapeHandler = (e) => {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal-overlay.active');
      if (activeModal) {
        closeModal(activeModal.id);
      }
    }
  };
  document.addEventListener('keydown', _escapeHandler);
}

/**
 * Initialize all modal behaviors
 */
export function initModals() {
  setupModalOverlayClose();
  setupModalEscapeClose();

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.showModal = showModal;
  window.closeModal = closeModal;
}

/**
 * Affiche une modale de confirmation et retourne une Promise<boolean>
 * Remplace les confirm() natifs pour une meilleure UX et accessibilité.
 * @param {string} message - Message à afficher (texte brut, pas de HTML)
 * @returns {Promise<boolean>} true si confirmé, false si annulé
 */
export function showConfirmModal(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modalConfirm');
    const msgEl = document.getElementById('modalConfirmMessage');
    const okBtn = document.getElementById('modalConfirmOk');
    const cancelBtn = document.getElementById('modalConfirmCancel');

    if (!overlay || !msgEl || !okBtn || !cancelBtn) {
      // Fallback si la modale n'est pas dans le DOM
      resolve(window.confirm(message));
      return;
    }

    msgEl.textContent = message;
    overlay.classList.add('active');
    cancelBtn.focus();

    // Focus trap pour la modale de confirmation
    const removeTrap = trapFocus(overlay);

    function cleanup(result) {
      overlay.classList.remove('active');
      removeTrap();
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onEscape);
      resolve(result);
    }

    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    // Escape = annuler (résout la Promise avec false)
    function onEscape(e) { if (e.key === 'Escape') cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    document.addEventListener('keydown', onEscape);
  });
}

/**
 * Cleanup modal event listeners (called on logout)
 */
export function cleanupModals() {
  if (_escapeHandler) {
    document.removeEventListener('keydown', _escapeHandler);
    _escapeHandler = null;
  }
  log('🧹 Listeners modals nettoyés');
}
