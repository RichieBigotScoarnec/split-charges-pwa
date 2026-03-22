import { log, warn } from '../utils/debug.js';
/**
 * FairSplit - Modal Management
 * @description Gestion centralisée des modales
 */

let _escapeHandler = null;

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
 * Cleanup modal event listeners (called on logout)
 */
export function cleanupModals() {
  if (_escapeHandler) {
    document.removeEventListener('keydown', _escapeHandler);
    _escapeHandler = null;
  }
  log('🧹 Listeners modals nettoyés');
}
