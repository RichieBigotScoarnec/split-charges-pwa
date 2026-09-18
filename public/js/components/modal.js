import { log } from '../utils/debug.js';
import { empilerCouche, depilerCouche } from '../utils/retour.js';
/**
 * FairSplit - Modal Management
 * @description Gestion centralisée des modales
 */

let _escapeHandler = null;

/**
 * Le dénouement de la confirmation en cours, s'il y en a une
 *
 * `showConfirmModal` rend une promesse, et son nettoyage — retrait des
 * écouteurs, résolution — ne vivait que dans `onOk`, `onCancel` et `onEscape`.
 * Or la boîte se ferme aussi par `closeModal`, que le clic hors de la boîte
 * déclenche : `#modalConfirm` porte `.modal-overlay`, et
 * `setupModalOverlayClose` y pose ce clic comme sur toutes les autres.
 *
 * Ce chemin-là retirait la classe `active` sans jamais nettoyer. L'écouteur
 * `onOk` restait donc attaché au bouton, et la promesse pendante pour
 * toujours. Chaque hésitation en ajoutait un.
 *
 * Le prix se payait plus tard, et ailleurs : on écarte d'un clic la
 * confirmation « Remplacer toutes vos données par cette sauvegarde ? », puis
 * on supprime une charge de 3,50 € une heure après — les deux `onOk` se
 * déclenchent, et `dbSet(undefined, enveloppe.data)` écrase l'espace entier
 * du foyer. Aucun attaquant n'est nécessaire ; le geste déclencheur est celui
 * de l'hésitation, précisément devant les confirmations qui inquiètent.
 *
 * La couverture ne pouvait pas le voir : les deux chemins sont exercés, et à
 * 100 % des instructions. C'est leur rencontre qui manquait.
 */
let _confirmEnCours = null;

/**
 * Dénoue la confirmation pendante, s'il y en a une
 *
 * Appelée par tout chemin de fermeture qui n'est pas déjà l'un des trois
 * dénouements — aujourd'hui `closeModal`, et l'ouverture d'une confirmation
 * suivante.
 *
 * @param {boolean} [reponse] - Ce que doit rendre la promesse ; refus par défaut
 * @returns {boolean} Une confirmation était-elle pendante ?
 */
export function denouerConfirmation(reponse = false) {
  if (!_confirmEnCours) return false;
  const denouer = _confirmEnCours;
  _confirmEnCours = null;
  denouer(reponse);
  return true;
}

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
 * Le focus a-t-il déjà été posé quelque part dans cette modale ?
 *
 * Le premier champ reçoit le focus cent millisecondes après l'ouverture, le
 * temps que la modale soit affichée. Ce report est un vol quand la personne a
 * touché un autre champ entre-temps : sa frappe part alors dans le premier.
 *
 * Mesuré, et non supposé : la saisie rapide ouverte par le raccourci recevait
 * « 12,50 » dans le montant puis « Cafe » dans la description, et le montant
 * finissait à « 12,50Cafe ». Le raccourci n'a pas créé ce défaut, il l'a rendu
 * atteignable — la modale s'ouvre désormais pendant que le pouce est en
 * mouvement, au lieu d'attendre la fin de l'initialisation.
 *
 * @param {Element} modal - Conteneur de la modale
 * @returns {boolean}
 */
function focusDejaPose(modal) {
  const actif = document.activeElement;
  if (!actif || actif === document.body || actif === document.documentElement) return false;
  return actif !== modal && modal.contains(actif);
}

/**
 * Show modal by ID
 * @param {string} modalId - Modal element ID
 */
export function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');

    // Le geste « retour » referme cette modale au lieu de quitter
    // l'application. Sur Android c'est le geste le plus utilisé du système, et
    // il fermait tout, sans avertissement, potentiellement en pleine saisie.
    // `closeModal` dépile en miroir : voir `utils/retour.js` pour le piège de
    // l'entrée d'historique qu'une fermeture ordinaire doit consommer.
    empilerCouche(modalId, () => closeModal(modalId));

    // Focus first input if exists
    //
    // Sans champ de saisie, le focus RESTE SUR LE BOUTON DÉCLENCHEUR, dans la
    // page, derrière le voile. `trapFocus` pose bien son écouteur sur la
    // modale, mais un écouteur ne reçoit que les touches frappées à
    // l'intérieur : le piège ne s'exécutait jamais. Au clavier, deux Tab
    // suffisaient à atteindre les boutons 🗑️ de la liste des charges, cachés
    // sous le voile, où Entrée supprime pour de bon — pendant qu'un voile
    // indique que la page est bloquée. Et aucun lecteur d'écran n'annonçait le
    // dialogue.
    //
    // Toutes les modales du dépôt y échappaient par accident : elles portent un
    // champ. Le détail des dépenses et le rapport du mois, non — ils ne font
    // que montrer.
    const firstInput = modal.querySelector('input, select, textarea');
    const cible = firstInput || modal;
    if (!firstInput) {
      // Un conteneur ne prend le focus que si on l'y autorise. `-1` le rend
      // focalisable par script sans l'insérer dans l'ordre de tabulation.
      modal.setAttribute('tabindex', '-1');
    }
    setTimeout(() => {
      if (focusDejaPose(modal)) return;
      cible.focus();
    }, 100);

    // Rouvrir une modale déjà ouverte écrasait la fonction de nettoyage sans
    // l'appeler : l'écouteur précédent restait attaché. `showManageModal` se
    // re-rend après chaque ajout ou suppression, les écouteurs s'accumulaient.
    if (_focusTraps[modalId]) _focusTraps[modalId]();
    _focusTraps[modalId] = trapFocus(modal);
  }
}

/**
 * Close modal by ID
 * @param {string} modalId - Modal element ID
 * @param {boolean} resetForm - Reset form fields
 */
export function closeModal(modalId, resetForm = true) {
  // Fermer la boîte de confirmation, c'est répondre « non ». Sans cette
  // ligne, la question restait ouverte et sa réponse arrivait à la
  // confirmation suivante — voir `_confirmEnCours`.
  if (modalId === 'modalConfirm') denouerConfirmation(false);

  // Avant tout le reste : si la modale se ferme autrement que par le retour,
  // l'entrée d'historique qu'elle avait poussée doit être consommée. Sans
  // cela, la pile grossit et le geste retour devient inerte pendant autant
  // d'appuis qu'il y a eu de modales ouvertes puis refermées.
  depilerCouche(modalId);

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
function setupModalOverlayClose() {
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
function setupModalEscapeClose() {
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
  window.closeModal = closeModal;
}

/**
 * Les deux tons d'une confirmation — deux, et pas trois
 *
 * Même règle que le héros du bilan : deux couleurs disent un fait, trois
 * diraient un jugement. Un geste détruit quelque chose, ou il n'en détruit pas.
 */
export const TON = Object.freeze({
  DESTRUCTIF: 'destructif',
  NORMAL: 'normal'
});

/** Ce que chaque ton peint sur le bouton */
const CLASSE_DU_TON = Object.freeze({
  [TON.DESTRUCTIF]: 'btn-danger',
  [TON.NORMAL]: 'btn-primary'
});

/**
 * LE DÉFAUT EST NEUTRE, ET C'EST LA DÉCISION DU LOT (2026-09-18)
 *
 * Le bouton portait « Supprimer » en rouge, en dur dans le balisage : mesuré,
 * **6 des 11 appels ne supprimaient rien** — créer une cagnotte, se
 * déconnecter, reconduire des charges fixes, déplacer une charge entre poches,
 * restaurer une sauvegarde. Le rouge et le mot sont le SEUL avertissement que
 * porte cette modale ; employés pour une création, ils cessent d'avertir le
 * jour où il le faudrait.
 *
 * Garder « Supprimer » comme défaut aurait fait un diff plus court et laissé le
 * piège entier : le prochain appel écrit sans y penser afficherait de nouveau
 * une fausse destruction. Un défaut neutre produit, lui, un bouton qui
 * n'avertit pas — une information MANQUANTE plutôt qu'une information FAUSSE,
 * et c'est la moins chère des deux.
 */
const DEFAUT = Object.freeze({ libelle: 'Confirmer', ton: TON.NORMAL });

/**
 * Affiche une modale de confirmation et retourne une Promise<boolean>
 * Remplace les confirm() natifs pour une meilleure UX et accessibilité.
 *
 * @param {string} message - Message à afficher (texte brut, pas de HTML)
 * @param {Object} [options]
 * @param {string} [options.libelle] - Ce que fait le bouton : « Restaurer »,
 *   « Créer la cagnotte », « Se déconnecter » — l'ACTION, jamais « Valider »
 * @param {string} [options.ton] - `TON.DESTRUCTIF` ou `TON.NORMAL`
 * @returns {Promise<boolean>} true si confirmé, false si annulé
 */
export function showConfirmModal(message, options = {}) {
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

    // Une question déjà posée et laissée sans réponse est refusée avant d'en
    // poser une nouvelle : deux confirmations ne partagent pas un bouton.
    denouerConfirmation(false);

    msgEl.textContent = message;

    // REPEINT À CHAQUE OUVERTURE, classe ET texte — le bouton est unique dans
    // le balisage et sert toutes les confirmations. Ajouter la classe du ton
    // sans retirer l'autre laisserait le rouge d'une suppression collé sur la
    // création qui suit ; `className` remplace au lieu d'accumuler.
    const { libelle, ton } = { ...DEFAUT, ...options };
    okBtn.className = `btn ${CLASSE_DU_TON[ton] ?? CLASSE_DU_TON[DEFAUT.ton]}`;
    okBtn.textContent = libelle;

    overlay.classList.add('active');
    cancelBtn.focus();

    // Focus trap pour la modale de confirmation
    const removeTrap = trapFocus(overlay);

    function cleanup(result) {
      if (_confirmEnCours === cleanup) _confirmEnCours = null;
      overlay.classList.remove('active');
      removeTrap();
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onEscape);
      resolve(result);
    }

    _confirmEnCours = cleanup;

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
