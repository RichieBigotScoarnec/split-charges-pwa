// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

// jsdom ne l'implémente pas. La modale ne l'appelle plus, mais d'autres
// modules chargés par cette suite peuvent le faire : le bouchon reste, ici
// plutôt qu'en production, où ce serait une garde pour un navigateur qui
// n'existe pas.
Element.prototype.scrollIntoView = vi.fn();

const { initQuickAdd } = await import('../../public/js/modules/quick-add.js');
const { toast } = await import('../../public/js/components/toast.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** Balisage de la modale, réduit à ce que le module manipule */
const BALISAGE = `
  <div id="modalQuickAdd" class="modal-overlay">
    <div class="modal">
      <div class="quick-add-location" id="quickAddLocation"></div>
      <button type="button" id="quickAddLocationDetach" hidden>Ce n'est pas ici</button>
      <input type="text" id="quickAddAmount" />
      <div class="category-grid" id="categoryGrid"></div>
      <input type="text" id="quickAddDescription" maxlength="100" />
      <div class="payer-toggle" id="quickAddPayer">
        <button type="button" data-payer="vous" data-member="vous" class="selected">Vous</button>
        <button type="button" data-payer="conjointe" data-member="conjointe">Conjointe</button>
        <button type="button" data-payer="partage">Partagé</button>
      </div>
      <button type="button" id="quickSplitProrata" class="selected">Prorata</button>
      <button type="button" id="quickSplit5050">50-50</button>
      <button type="button" id="btnQuickAdd">Ajouter</button>
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

  it('un montant à la virgule sous 1 € est accepté', async () => {
    // La validation du formulaire lisait le champ elle aussi : sous 1 €, un
    // « 0,80 » valait 0 et bloquait la saisie.
    saisir({ montant: '0,80' });
    await valider();

    expect(derniereCharge().amount).toBe(0.8);
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

  it('affiche l\'enseigne et sa commune pendant la saisie', async () => {
    await ouvrirAvecPosition();

    expect(document.getElementById('quickAddLocation').textContent)
      .toBe('✓ Brioche Dorée, 35000 Rennes');
  });

  it('ne reprend pas la rue', async () => {
    // Le code postal et la commune suffisent à savoir de quel établissement il
    // s\'agit, et l\'étiquette se lit dans une liste de charges.
    await ouvrirAvecPosition();

    expect(document.getElementById('quickAddLocation').textContent)
      .not.toContain('Rue Le Bastard');
  });

  it('enregistre la commune et le code postal sur le lieu', async () => {
    await ouvrirAvecPosition();
    saisir({ montant: '9,80' });
    await valider();

    expect(derniereCharge().location.name).toBe('Brioche Dorée, 35000 Rennes');
    expect(derniereCharge().location.commune).toBe('Rennes');
    expect(derniereCharge().location.codePostal).toBe('35000');
  });

  it('la description à défaut de saisie nomme l\'enseigne et sa commune', async () => {
    // Le cas signalé : « Brioche Dorée » ne disait pas laquelle.
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

describe('Un refus dit toujours ce qui manque', () => {
  /**
   * Le bouton « Ajouter » était désactivé tant que catégorie et montant
   * n'étaient pas tous deux renseignés. Un bouton désactivé n'émet aucun
   * événement au toucher : sur téléphone, on tapait dessus et il ne se passait
   * rien — pas de message, pas d'indication de ce qui manquait.
   *
   * Les garde-fous de la soumission savaient pourtant nommer la cause depuis
   * toujours. L'attribut les empêchait simplement de parler.
   */
  it('le bouton reste actif : c\'est la soumission qui explique', () => {
    expect(document.getElementById('btnQuickAdd').disabled).toBe(false);
  });

  it('sans montant, le refus nomme le montant et n\'écrit rien', async () => {
    document.querySelector('[data-category-id="restaurant"]').click();
    await valider();

    expect(dbPush).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Montant'));
  });

  it('sans catégorie, le refus nomme la catégorie et n\'écrit rien', async () => {
    document.getElementById('quickAddAmount').value = '12,50';
    await valider();

    expect(dbPush).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('catégorie'));
  });

  it('un champ vide n\'est pas annoncé comme « pas un nombre »', async () => {
    // Le montant partait déjà converti : `parseMontant('')` vaut NaN, et le
    // champ auquel on n'avait pas touché se voyait reprocher sa syntaxe.
    document.querySelector('[data-category-id="restaurant"]').click();
    await valider();

    expect(toast.error).toHaveBeenCalledWith('Montant est requis');
  });

  it('les deux manquants : c\'est le montant qui est signalé, il vient en premier', async () => {
    // L'ordre des refus suit l'ordre de lecture. Renvoyer vers la grille alors
    // qu'un champ plus haut est vide fait chercher au mauvais endroit.
    await valider();

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Montant'));
  });
});

describe('La répartition choisie est celle qui s\'applique', () => {
  /**
   * La saisie rapide écrivait `splitMode`. Le calcul du bilan ne lit que
   * `splitOverride` — `calculateChargeShares` et `calculateJointPayment` n'ont
   * jamais regardé ailleurs. Choisir « 50-50 » ici n'avait donc aucun effet sur
   * le solde, et le toast de confirmation affichait pourtant « (50-50) ».
   */
  it('« 50-50 » écrit la dérogation que le calcul lit', async () => {
    document.getElementById('quickSplit5050').click();
    saisir({ montant: '20' });
    await valider();

    expect(derniereCharge().splitOverride).toEqual({ mode: '50-50' });
  });

  it('« Prorata » n\'écrit aucune dérogation : le mode du foyer s\'applique', async () => {
    saisir({ montant: '20' });
    await valider();

    expect(derniereCharge().splitOverride).toBeNull();
  });

  it('n\'écrit plus le champ que personne ne lisait', async () => {
    // Un champ écrit et jamais lu est précisément ce qui a produit ce défaut.
    document.getElementById('quickSplit5050').click();
    saisir({ montant: '20' });
    await valider();

    expect(derniereCharge().splitMode).toBeUndefined();
  });
});

describe('Le balisage livré, et non celui des tests', () => {
  /**
   * Les cas ci-dessus posent leur propre balisage, réduit à ce que le module
   * manipule. Ils ne diraient donc rien d'un retour en arrière dans
   * `FairSplit.html` — or c'est ce fichier qui est servi.
   */
  const livre = readFileSync(resolve(process.cwd(), 'public/FairSplit.html'), 'utf8');
  const modale = livre.slice(
    livre.indexOf('<div id="modalQuickAdd"'),
    livre.indexOf('<!-- Modal: Confirmation')
  );

  it('le bouton Ajouter n\'est pas livré désactivé', () => {
    const bouton = modale.slice(modale.indexOf('id="btnQuickAdd"'));
    expect(bouton.slice(0, bouton.indexOf('>'))).not.toContain('disabled');
  });

  it('le montant précède la grille des catégories', () => {
    // Le champ reçoit le focus à l'ouverture : le placer sous huit tuiles
    // ouvrait le clavier pour un champ qu'il fallait aller chercher.
    expect(modale.indexOf('id="quickAddAmount"'))
      .toBeLessThan(modale.indexOf('id="categoryGrid"'));
  });
});
