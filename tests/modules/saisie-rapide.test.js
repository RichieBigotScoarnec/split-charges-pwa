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

// jsdom n'implémente pas `scrollIntoView`, que la modale appelle 400 ms après
// son ouverture. Les tests qui attendent une réponse réseau laissent ce délai
// s'écouler, et l'exception remontait hors de tout `try` — une lacune de
// l'environnement de test, non de l'application, qui la comble ici plutôt que
// d'ajouter une garde en production pour un navigateur qui n'existe pas.
Element.prototype.scrollIntoView = vi.fn();

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

describe('Le montant se saisit à la virgule comme au point', () => {
  it('une virgule garde les centimes', async () => {
    // Le défaut signalé : sur un clavier français, la touche décimale produit
    // une virgule. `parseFloat('12,50')` rendait 12 — les centimes partaient
    // en base amputés, sans le moindre avertissement.
    saisir({ montant: '12,50' });
    await valider();

    expect(derniereCharge().amount).toBe(12.5);
  });

  it('un point continue de fonctionner', async () => {
    saisir({ montant: '12.50' });
    await valider();

    expect(derniereCharge().amount).toBe(12.5);
  });

  it('un séparateur de milliers ne coupe plus le montant', async () => {
    // `parseFloat('1 234,56')` rendait 1.
    saisir({ montant: '1 234,56' });
    await valider();

    expect(derniereCharge().amount).toBe(1234.56);
  });

  it('un montant à la virgule active le bouton Ajouter', async () => {
    // La validation du formulaire lisait le champ elle aussi : sous 1 €, un
    // « 0,80 » valait 0 et laissait le bouton désactivé.
    document.querySelector('[data-category-id="restaurant"]').click();
    const champ = document.getElementById('quickAddAmount');
    champ.value = '0,80';
    champ.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.getElementById('btnQuickAdd').disabled).toBe(false);
  });

  it('une saisie qui n\'est pas un nombre est refusée, pas devinée', async () => {
    saisir({ montant: '12abc' });
    await valider();

    expect(dbPush).not.toHaveBeenCalled();
  });
});

describe('Le lieu enregistré dit où la dépense a eu lieu', () => {
  /** Réponse Nominatim, forme réelle avec `addressdetails=1` */
  const REPONSE_BRIOCHE = {
    name: 'Brioche Dorée',
    type: 'bakery',
    display_name: 'Brioche Dorée, 12, Rue Le Bastard, Rennes, 35000, France',
    address: {
      shop: 'Brioche Dorée',
      house_number: '12',
      road: 'Rue Le Bastard',
      city: 'Rennes',
      postcode: '35000'
    }
  };

  /**
   * Ouvre la modale avec une position en cache et un géocodage simulé, puis
   * attend que la réponse ait été traitée.
   */
  async function ouvrirAvecPosition(reponse = REPONSE_BRIOCHE) {
    navigator.geolocation = { getCurrentPosition: vi.fn(), watchPosition: vi.fn(), clearWatch: vi.fn() };
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(reponse) }));

    setState('cachedGpsPosition', { lat: 48.11, lng: -1.68, accuracy: 10, timestamp: Date.now() });
    document.body.innerHTML = BALISAGE;
    initQuickAdd();
    window.showQuickAddModal();

    await vi.waitFor(() => {
      expect(document.getElementById('quickAddLocation').textContent).toMatch(/^✓/);
    });
  }

  it('réclame l\'adresse décomposée à Nominatim', async () => {
    // Sans `addressdetails=1`, la réponse ne porte ni rue, ni code postal, ni
    // commune : c'est le paramètre manquant qui expliquait « Brioche Dorée »
    // tout court.
    await ouvrirAvecPosition();

    expect(global.fetch.mock.calls[0][0]).toContain('addressdetails=1');
  });

  it('affiche l\'adresse complète pendant la saisie', async () => {
    await ouvrirAvecPosition();

    expect(document.getElementById('quickAddLocation').textContent)
      .toBe('✓ Brioche Dorée, 12 Rue Le Bastard, 35000 Rennes');
  });

  it('enregistre l\'adresse complète sur le lieu de la charge', async () => {
    await ouvrirAvecPosition();
    saisir({ montant: '9,80' });
    await valider();

    expect(derniereCharge().location.name).toBe('Brioche Dorée, 12 Rue Le Bastard, 35000 Rennes');
    expect(derniereCharge().location.commune).toBe('Rennes');
    expect(derniereCharge().location.codePostal).toBe('35000');
  });

  it('la description à défaut de saisie nomme l\'enseigne et sa commune', async () => {
    // Le cas signalé : « Brioche Dorée » ne disait pas laquelle. La liste des
    // charges reste lisible, donc l'adresse complète y est de trop.
    await ouvrirAvecPosition();
    saisir({ montant: '9,80' });
    await valider();

    expect(derniereCharge().description).toBe('Brioche Dorée, 35000 Rennes');
  });

  it('une adresse sans enseigne reste exploitable', async () => {
    await ouvrirAvecPosition({
      address: { house_number: '5', road: 'Rue des Lilas', town: 'Vitré', postcode: '35500' }
    });
    saisir({ montant: '9,80' });
    await valider();

    expect(derniereCharge().description).toBe('5 Rue des Lilas, 35500 Vitré');
  });

  it('un géocodage muet laisse la position sans inventer de lieu', async () => {
    navigator.geolocation = { getCurrentPosition: vi.fn(), watchPosition: vi.fn(), clearWatch: vi.fn() };
    global.fetch = vi.fn(() => Promise.resolve({ ok: false }));

    setState('cachedGpsPosition', { lat: 48.11, lng: -1.68, accuracy: 10, timestamp: Date.now() });
    document.body.innerHTML = BALISAGE;
    initQuickAdd();
    window.showQuickAddModal();

    await vi.waitFor(() => {
      expect(document.getElementById('quickAddLocation').textContent).toBe('✓ Position enregistrée');
    });

    saisir({ montant: '9,80' });
    await valider();

    expect(derniereCharge().location.name).toBe('Position');
    expect(derniereCharge().location.commune).toBeUndefined();
    expect(derniereCharge().description).toBe('Restaurant');
  });
});
