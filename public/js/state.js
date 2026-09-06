import { log, warn } from './utils/debug.js';
import { PORTEE_PAR_DEFAUT } from './utils/portee.js';
/**
 * FairSplit - State Management
 * @description Gestion d'état centralisée avec pattern Observer
 */

// ===== INITIAL STATE =====
const initialState = {
  // User & Auth
  currentUser: null,
  isAuthenticated: false,

  // Period
  currentPeriod: null,

  // Sur quel argent l'écran porte : à deux, solo, ou privé.
  //
  // En mémoire vive, et nulle part ailleurs — ni base, ni `localStorage`. Ce
  // n'est pas un oubli : c'est ce qui fait qu'un rechargement rouvre sur « à
  // deux » sans qu'aucune ligne ne s'en occupe. Rouvrir l'application
  // directement sur l'espace privé l'exposerait au premier regard par-dessus
  // l'épaule.
  //
  // Elle PERSISTE en revanche d'un mois à l'autre, à l'intérieur d'une session :
  // comparer son solo de septembre à celui d'août est un seul geste, et le
  // ramener à « à deux » à chaque flèche le ferait payer. La décision, et le
  // raisonnement qui la fonde, sont dans `utils/portee.js`.
  porteeCourante: PORTEE_PAR_DEFAUT,

  // Data
  salaries: { vous: 0, conjointe: 0 },
  fixedCharges: [],
  variableCharges: [],
  reimbursements: [],

  // Enveloppes transversales — étiquettes de lecture, sans effet sur le solde
  envelopes: [],

  // Share settings
  shareMode: 'prorata',
  customPercents: { vous: 50, conjointe: 50 },

  // UI State
  editingCharge: null,

  // Le lot en cours de constitution dans la liste des charges variables.
  // `ids` peut désigner des charges d'un autre mois après une navigation : les
  // gestes purgent la liste avant d'agir, jamais l'inverse.
  selectionCharges: { actif: false, ids: [] },
  quickAddState: {
    selectedCategory: null,
    splitMode: 'prorata',
    gpsLocation: null
  },

  // Reconduction
  previousMonthCharges: [],
  selectedReconductionItems: [],

  // GPS background cache (pre-fetched position for instant quick-add)
  cachedGpsPosition: null, // { lat, lng, accuracy, timestamp }

  // Map
  mapInstance: null,

  // App state
  appInitialized: false,
  isOnline: navigator.onLine
};

// ===== STATE STORE =====
let state = JSON.parse(JSON.stringify(initialState));

// ===== PUBLIC API =====

/**
 * Get current state value
 * @param {string} key - State key (supports dot notation: 'salaries.vous')
 * @returns {*} State value
 */
export function getState(key) {
  if (!key) return { ...state };

  const keys = key.split('.');
  let value = state;

  for (const k of keys) {
    if (value === undefined || value === null) return undefined;
    value = value[k];
  }

  // Return copy for objects/arrays to prevent mutation
  if (Array.isArray(value)) return [...value];
  if (typeof value === 'object' && value !== null) return { ...value };
  return value;
}

/**
 * Écrit une valeur dans l'état
 *
 * Un registre d'abonnés vivait ici, avec `subscribe()`, la propagation aux
 * clés parentes et un joker `*`. Personne ne s'y est jamais abonné : chaque
 * module appelle directement ses fonctions de rendu après avoir écrit. La
 * machinerie ne faisait donc que s'exécuter à vide à chaque écriture, tout en
 * laissant croire à un mécanisme de réaction qui n'existait pas.
 *
 * @param {string} key - Clé, notation pointée acceptée
 * @param {*} value - Nouvelle valeur
 */
/** Segments de clé qui atteindraient le prototype au lieu de l'état */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function setState(key, value) {
  const keys = key.split('.');

  // Un segment nomme __proto__, constructor ou prototype permettrait d'écrire
  // sur le prototype d'Object plutôt que dans l'état — toute l'application
  // héritant alors de la propriété. Les clés viennent aujourd'hui du code,
  // mais setState est un utilitaire générique : la garde appartient ici.
  if (keys.some(k => UNSAFE_KEYS.has(k))) {
    warn(`[STATE] Clé refusée (segment interdit) : ${key}`);
    return;
  }

  if (keys.length === 1) {
    state[key] = value;
  } else {
    let current = state;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      // Comparaison littérale, volontairement redondante avec UNSAFE_KEYS :
      // l'analyse statique ne suit pas un Set défini hors de la fonction, et
      // un invariant de sécurité gagne à être vérifiable là où il s'applique.
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;

      // hasOwnProperty plutôt que `in` : ce dernier traverse la chaîne de
      // prototypes et ferait passer une propriété héritée pour un niveau
      // existant.
      if (!Object.prototype.hasOwnProperty.call(current, k)) {
        current[k] = {};
      }
      current = current[k];
    }

    const last = keys[keys.length - 1];
    if (last === '__proto__' || last === 'constructor' || last === 'prototype') return;
    current[last] = value;
  }

  // Debug log for GPS location updates
  if (key.includes('gpsLocation')) {
    log(`📝 [STATE] setState("${key}") =`, JSON.stringify(value));
    log('📝 [STATE] État complet quickAddState:', JSON.stringify(state.quickAddState));
  }

}

/**
 * Reset state to initial values
 */
export function resetState() {
  state = JSON.parse(JSON.stringify(initialState));
}

/**
 * Reset user data on logout (keep app state like isOnline, mapInstance)
 */
export function resetUserData() {
  // Reset user & auth
  setState('currentUser', null);
  setState('isAuthenticated', false);

  // Keep currentPeriod (will be reinitialized on next login)
  // But clear user data
  setState('salaries', { vous: 0, conjointe: 0 });
  setState('fixedCharges', []);
  setState('variableCharges', []);
  setState('reimbursements', []);

  // Reset share settings to defaults
  setState('shareMode', 'prorata');
  setState('customPercents', { vous: 50, conjointe: 50 });

  // Clear UI state
  setState('editingCharge', null);

  // La portée revient à « à deux ». Se reconnecter sur un autre compte sans
  // recharger la page laisserait autrement l'écran ouvert sur « Privé » — la
  // seule des trois dont l'ouverture par accident a un coût. Même exigence que
  // la mémoire des libellés et l'historique du rapport, quelques lignes plus bas.
  setState('porteeCourante', PORTEE_PAR_DEFAUT);
  setState('quickAddState', {
    selectedCategory: null,
    splitMode: 'prorata',
    gpsLocation: null
  });

  // Clear reconduction data
  setState('previousMonthCharges', []);
  setState('selectedReconductionItems', []);

  // Ce que le foyer a appris de son propre historique, et l'historique lui-même.
  // Se reconnecter sur un autre compte sans recharger la page ferait autrement
  // lire les mois d'un foyer par l'autre — la mémoire des libellés a la même
  // exigence, et le rapport garde le nœud `periods` en entier.
  setState('historiquePourLeRapport', null);
  setState('memoireLibelles', {});
  setState('haussesChargesFixes', null);
  setState('rapportDuMois', null);
  setState('observations', []);

  log('🧹 User data reset on logout');
}

// ===== INITIALIZE CURRENT PERIOD =====
function initCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  state.currentPeriod = `${year}-${month}`;
}

initCurrentPeriod();
