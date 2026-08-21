// @vitest-environment jsdom
/**
 * Résilience de l'initialisation des modules.
 *
 * Deux pannes signalées en production sur téléphone — les salaires ne
 * s'enregistrent pas, « + Ajouter » ne réagit pas — avaient la même forme :
 * un bouton bien visible, aucun écouteur derrière, aucune erreur à l'écran.
 *
 * La cause tient à l'ordre. Chaque `initXxx` remplissait d'abord ses listes
 * déroulantes, puis attachait ses écouteurs. Le remplissage lève dès que les
 * catégories sont inexploitables ; `runStep` rattrape, l'application continue,
 * et les écouteurs n'ont jamais été posés. Rien ne distingue alors « le bouton
 * n'a pas d'écouteur » de « le clic n'arrive pas au bouton ».
 *
 * Ces tests fixent la garantie : les écouteurs sont posés avant toute
 * opération susceptible d'échouer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Le remplissage des listes est le point de rupture qu'on simule */
const remplissage = vi.hoisted(() => ({
  categorie: vi.fn(),
  destination: vi.fn()
}));

vi.mock('../../public/js/modules/custom-lists.js', () => ({
  populateCategorySelect: remplissage.categorie,
  populateDestinationSelect: remplissage.destination,
  getCategoryIcon: () => '📦',
  getCategories: () => [],
  populateAllSelects: vi.fn()
}));

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));

vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(),
  closeModal: vi.fn(),
  showConfirmModal: vi.fn()
}));

vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));
vi.mock('../../public/js/modules/trash.js', () => ({ refreshTrashButton: vi.fn() }));
vi.mock('../../public/js/modules/map.js', () => ({ refreshMapButton: vi.fn() }));
vi.mock('../../public/js/modules/trends.js', () => ({ invalidateTrends: vi.fn() }));

/**
 * Pose le balisage minimal attendu par un module
 * @param {string[]} ids - Identifiants d'éléments à créer
 */
function baliser(ids) {
  document.body.innerHTML = ids
    .map(id => (id.startsWith('select:')
      ? `<select id="${id.slice(7)}"></select>`
      : `<button type="button" id="${id}"></button>`))
    .join('');
}

describe("Résilience de l'initialisation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remplissage.categorie.mockReset();
    remplissage.destination.mockReset();
  });

  describe('charges variables', () => {
    it("attache le bouton d'ajout même si le remplissage des catégories échoue", async () => {
      const { initVariableCharges } = await import('../../public/js/modules/variable-charges.js');

      baliser(['addVariableChargeBtn', 'saveVariableCharge', 'select:variableChargeCategory']);
      remplissage.categorie.mockImplementation(() => {
        throw new TypeError('categories.forEach is not a function');
      });

      const bouton = document.getElementById('addVariableChargeBtn');
      const clics = vi.fn();
      bouton.addEventListener('click', clics);

      // L'échec remonte — c'est `runStep` qui le rattrape en conditions
      // réelles — mais il ne doit pas avoir coûté l'écouteur.
      expect(() => initVariableCharges()).toThrow();

      bouton.click();
      expect(clics).toHaveBeenCalledTimes(1);
      // La preuve que l'écouteur du module est bien là : le clic ouvre la modale.
      const { showModal } = await import('../../public/js/components/modal.js');
      expect(showModal).toHaveBeenCalledWith('modalAddVariableCharge');
    });

    it('attache le bouton quand le remplissage réussit', async () => {
      const { initVariableCharges } = await import('../../public/js/modules/variable-charges.js');

      baliser(['addVariableChargeBtn', 'saveVariableCharge', 'select:variableChargeCategory']);
      initVariableCharges();

      document.getElementById('addVariableChargeBtn').click();
      const { showModal } = await import('../../public/js/components/modal.js');
      expect(showModal).toHaveBeenCalledWith('modalAddVariableCharge');
    });
  });

  describe('charges fixes', () => {
    it("attache le bouton d'ajout même si le remplissage des destinations échoue", async () => {
      const { initFixedCharges } = await import('../../public/js/modules/fixed-charges.js');

      baliser([
        'addFixedChargeBtn', 'saveFixedCharge',
        'select:fixedChargeCategory', 'select:fixedChargeDestination'
      ]);
      remplissage.destination.mockImplementation(() => {
        throw new TypeError('destinations.forEach is not a function');
      });

      expect(() => initFixedCharges()).toThrow();

      document.getElementById('addFixedChargeBtn').click();
      const { showModal } = await import('../../public/js/components/modal.js');
      expect(showModal).toHaveBeenCalledWith('modalAddFixedCharge');
    });
  });
});
