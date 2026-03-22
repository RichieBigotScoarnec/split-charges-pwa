/**
 * FairSplit Init
 * @description Délégation d'événements globale + enregistrement du Service Worker
 *
 * Ce fichier est intentionnellement non-module (pas de type="module").
 * Il est chargé avec defer après le parsing HTML.
 *
 * Responsabilités :
 *   1. Délégation click → data-action (boutons, liens)
 *   2. Délégation change → data-on-change (selects, checkboxes)
 *   3. Délégation input  → data-on-input  (champs texte)
 *   4. Enregistrement du Service Worker
 *
 * Les modules ES6 (app.js et ses imports) exposent leurs fonctions
 * via window.* pour que la délégation puisse les appeler.
 */

// ===== 1. DÉLÉGATION CLICK (data-action) =====
document.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const arg = btn.dataset.arg;

  if (typeof window[action] === 'function') {
    e.preventDefault();
    window[action](arg);
  } else {
    // Fonction pas encore exposée (module pas encore initialisé) — ignorer silencieusement
    // console.warn('[Init] Action non trouvée sur window:', action);
  }
});

// ===== 2. DÉLÉGATION CHANGE (data-on-change) =====
document.addEventListener('change', function (e) {
  const el = e.target.closest('[data-on-change]');
  if (!el) return;

  const fns = el.dataset.onChange.split(',');
  fns.forEach(function (fnName) {
    const fn = fnName.trim();
    if (typeof window[fn] === 'function') {
      window[fn](el.value, el);
    }
  });
});

// ===== 3. DÉLÉGATION INPUT (data-on-input) =====
document.addEventListener('input', function (e) {
  const el = e.target.closest('[data-on-input]');
  if (!el) return;

  const fns = el.dataset.onInput.split(',');
  fns.forEach(function (fnName) {
    const fn = fnName.trim();
    if (typeof window[fn] === 'function') {
      window[fn](el.value, el);
    }
  });
});

// ===== 4. SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw-test.js')
      .catch(function (err) {
        // Erreur non-bloquante : l'app fonctionne sans SW
        void err;
      });
  });
}
