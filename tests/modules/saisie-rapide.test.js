// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Saisie rapide : ce qu'on saisit, et ce qu'on ne saisissait pas
 *
 * La saisie rapide supposait qu'on saisit au moment et à l'endroit de la
 * dépense. Trois conséquences pour qui régularise le lendemain : le payeur
 * était toujours « vous », la description se déduisait du lieu où l'on se
 * trouvait en saisissant, et la position du domicile finissait épinglée sur la
 * carte à la place du restaurant.
 *
 * Ces tests portent sur ce qui part réellement en base — c'est là que se juge
 * un bilan faux.
 */

const dbPush = vi.fn(() => Promise.resolve('cle'));

vi.mock('../../public/js/db.js', () => ({
  dbPush,
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve()),
  getDataPath: vi.fn(path => `household/${path}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/variable-charges.js', () => ({
  loadVariableCharges: vi.fn(() => Promise.resolve())
}));
vi.mock('../../public/js/modules/summary.js', () => ({
  calculateSummary: vi.fn()
}));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategories: vi.fn(() => [
    { id: 'restaurant', icon: '🍕', label: 'Restaurant' },
    { id: 'courses', icon: '🛒', label: 'Courses' }
  ])
}));

const { initQuickAdd } = await import('../../public/js/modules/quick-add.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** Balisage de la modale, réduit à ce que le module manipule */
const BALISAGE = `
  <div id="modalQuickAdd" class="modal-overlay">
    <div class="modal">
      <div class="quick-add-location" id="quickAddLocation"></div>
      <button type="button" id="quickAddLocationDetach" hidden>Ce n'est pas ici</button>
      <div class="category-grid" id="categoryGrid"></div>
      <input type="text" id="quickAddAmount" />
      <input type="text" id="quickAddDescription" maxlength="100" />
      <div class="payer-toggle" id="quickAddPayer">
        <button type="button" data-payer="vous" data-member="vous" class="selected">Vous</button>
        <button type="button" data-payer="conjointe" data-member="conjointe">Conjointe</button>
        <button type="button" data-payer="partage">Partagé</button>
      </div>
      <button type="button" id="quickSplitProrata" class="selected">Prorata</button>
      <button type="button" id="quickSplit5050">50-50</button>
      <button type="button" id="btnQuickAdd" disabled>Ajouter</button>
    </div>
  </div>
`;

/** Dernière charge transmise à la base */
const derniereCharge = () => dbPush.mock.calls.at(-1)[1];

/** Simule la saisie : catégorie, montant, et options */
function saisir({ categorie = 'restaurant', montant = '12.50', description, payeur } = {}) {
  document.querySelector(`[data-category-id="${categorie}"]`).click();
  document.getElementById('quickAddAmount').value = montant;
  if (description !== undefined) document.getElementById('quickAddDescription').value = description;
  if (payeur) document.querySelector(`#quickAddPayer [data-payer="${payeur}"]`).click();
}

/** Déclenche la soumission via le bouton, comme l'utilisateur */
async function valider() {
  const { handleQuickAddSubmit } = window;
  await handleQuickAddSubmit();
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  document.body.innerHTML = BALISAGE;
  setState('currentPeriod', '2026-08');
  initQuickAdd();
  window.showQuickAddModal();
});

describe('Le payeur est choisi, non supposé', () => {
  it('par défaut, la charge revient à « vous »', async () => {
    saisir();
    await valider();

    expect(derniereCharge().paidBy).toBe('vous');
  });

  it('une dépense réglée par la conjointe lui est attribuée', async () => {
    // C'est le cas qui faussait le bilan : la charge était comptée du mauvais
    // côté, et il fallait rouvrir le formulaire complet pour la corriger.
    saisir({ payeur: 'conjointe' });
    await valider();

    expect(derniereCharge().paidBy).toBe('conjointe');
  });

  it('une dépense partagée est enregistrée comme telle', async () => {
    saisir({ payeur: 'partage' });
    await valider();

    expect(derniereCharge().paidBy).toBe('partage');
  });

  it('le payeur revient à « vous » à la réouverture', async () => {
    saisir({ payeur: 'conjointe' });
    window.closeQuickAddModal();
    window.showQuickAddModal();

    saisir();
    await valider();

    expect(derniereCharge().paidBy).toBe('vous');
  });
});

describe('La description saisie prime sur toute déduction', () => {
  it('ce qui est saisi est ce qui est enregistré', async () => {
    saisir({ description: 'Burger King' });
    await valider();

    expect(derniereCharge().description).toBe('Burger King');
  });

  it('sans saisie, le libellé de la catégorie sert de repli', async () => {
    saisir();
    await valider();

    expect(derniereCharge().description).toBe('Restaurant');
  });

  it('les espaces seuls ne valent pas description', async () => {
    saisir({ description: '   ' });
    await valider();

    expect(derniereCharge().description).toBe('Restaurant');
  });

  it('la description ne survit pas à la fermeture de la modale', async () => {
    saisir({ description: 'Burger King' });
    window.closeQuickAddModal();
    window.showQuickAddModal();

    saisir();
    await valider();

    expect(derniereCharge().description).toBe('Restaurant');
  });
});

describe('Le lieu peut être détaché', () => {
  it('détaché, aucune coordonnée n\'est écrite', async () => {
    // Le scénario réel : dépense d'hier au restaurant, saisie ce matin depuis
    // la maison. Sans détachement, la carte montrait le domicile.
    document.getElementById('quickAddLocationDetach').click();

    saisir({ description: 'Burger King' });
    await valider();

    expect(derniereCharge().location).toBeUndefined();
    expect(derniereCharge().description).toBe('Burger King');
  });

  it('le bouton de détachement est masqué tant qu\'il n\'y a rien à détacher', () => {
    expect(document.getElementById('quickAddLocationDetach').hidden).toBe(true);
  });

  it('détacher le dit à l\'écran', () => {
    document.getElementById('quickAddLocationDetach').click();

    expect(document.getElementById('quickAddLocation').textContent).toMatch(/[Ss]ans lieu/);
    expect(document.getElementById('quickAddLocationDetach').hidden).toBe(true);
  });
});
