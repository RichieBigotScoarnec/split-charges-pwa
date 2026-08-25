// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
const dbGet = vi.fn(() => Promise.resolve(null));

vi.mock('../../public/js/db.js', () => ({
  dbPush,
  dbGet,
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

const { initQuickAdd, cleanupQuickAdd } = await import('../../public/js/modules/quick-add.js');
const { toast } = await import('../../public/js/components/toast.js');
const { getCategories } = await import('../../public/js/modules/custom-lists.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** Balisage de la modale, réduit à ce que le module manipule */
const BALISAGE = `
  <div id="modalQuickAdd" class="modal-overlay">
    <div class="modal">
      <div class="quick-add-location" id="quickAddLocation"></div>
      <button type="button" id="quickAddLocationDetach" hidden>Ce n'est pas ici</button>
      <input type="text" id="quickAddAmount" />
      <div class="quick-add-phrase" id="quickAddPhrase" role="group"></div>
      <div class="quick-add-panneau" id="quickAddPanneauCategorie">
      <div class="category-frequentes" id="categoryFrequentes" hidden>
        <span class="category-frequentes-titre" id="categoryFrequentesTitre">Souvent</span>
        <div class="category-frequentes-liste" id="categoryFrequentesListe"
             role="group" aria-labelledby="categoryFrequentesTitre"></div>
      </div>
      <div class="category-grid" id="categoryGrid"></div>
      </div>
      <div class="quick-add-panneau" id="quickAddPanneauDate">
        <input type="date" id="quickAddDate" />
      </div>
      <input type="text" id="quickAddDescription" maxlength="100" />
      <div class="quick-add-panneau" id="quickAddPanneauPayeur">
      <div class="payer-toggle" id="quickAddPayer">
        <button type="button" data-payer="vous" data-member="vous" class="selected">Vous</button>
        <button type="button" data-payer="conjointe" data-member="conjointe">Conjointe</button>
        <button type="button" data-payer="partage">Partagé</button>
      </div>
      </div>
      <div class="quick-add-panneau" id="quickAddPanneauRepartition">
      <button type="button" id="quickSplitProrata" class="selected">Prorata</button>
      <button type="button" id="quickSplit5050">50-50</button>
      </div>
      <button type="button" id="btnQuickAdd">Ajouter</button>
    </div>
  </div>
`;

/** Dernière charge transmise à la base */
const derniereCharge = () => dbPush.mock.calls.at(-1)[1];

/** Simule la saisie : catégorie, montant, et options */
function saisir({ categorie = 'restaurant', montant = '12.50', description, payeur } = {}) {
  // Les panneaux sont repliés : le segment de phrase les ouvre, comme au doigt.
  ouvrirSegment('categorie');
  document.querySelector(`[data-category-id="${categorie}"]`).click();
  document.getElementById('quickAddAmount').value = montant;
  if (description !== undefined) document.getElementById('quickAddDescription').value = description;
  if (payeur) {
    ouvrirSegment('payeur');
    document.querySelector(`#quickAddPayer [data-payer="${payeur}"]`).click();
  }
}

/** Touche le segment de phrase qui ouvre un choix */
function ouvrirSegment(cle) {
  const index = ['payeur', 'repartition', 'categorie', 'date'].indexOf(cle);
  document.querySelectorAll('#quickAddPhrase button')[index].click();
}

/** Les libellés de la phrase, dans l'ordre */
function phrase() {
  return [...document.querySelectorAll('#quickAddPhrase button')].map(b => b.textContent);
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
  // La modale ouverte depuis l'application : celle-ci est prête, sinon le
  // bouton n'existerait pas à l'écran. L'écriture ne l'attend donc pas.
  // L'ouverture anticipée par le raccourci, elle, a sa propre suite ci-dessous.
  document.body.dataset.appReady = 'true';
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

describe('La catégorie déduite du lieu', () => {
  /**
   * Signalé à l'usage : à la Brioche Dorée, aucune catégorie n'était proposée.
   * La table n'en connaissait que quatre — supermarché, station-service,
   * restaurant, pharmacie — et une boulangerie est taguée `bakery`.
   */
  it('une boulangerie sélectionne une catégorie, là où rien ne se passait', async () => {
    navigator.geolocation = { getCurrentPosition: vi.fn(), watchPosition: vi.fn(), clearWatch: vi.fn() };
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        name: 'Brioche Dorée',
        type: 'bakery',
        display_name: 'Brioche Dorée, Rue de Nantes, 35000 Rennes',
        address: { shop: 'Brioche Dorée', road: 'Rue de Nantes', postcode: '35000', city: 'Rennes' }
      })
    }));

    setState('cachedGpsPosition', { lat: 48.11, lng: -1.68, accuracy: 10, timestamp: Date.now() });
    document.body.innerHTML = BALISAGE;
    initQuickAdd();
    window.showQuickAddModal();

    await vi.waitFor(() => {
      expect(document.querySelector('.category-btn.selected')).not.toBeNull();
    });

    // « Boulangerie » n'existe pas dans les catégories de ce foyer : le repli
    // sur « Courses » est ce qui évite de ne rien détecter du tout.
    expect(document.querySelector('.category-btn.selected').dataset.categoryId)
      .toBe('courses');
  });

  it('une rue sans commerce ne sélectionne rien', async () => {
    // Le cas de la capture : « Quai Vasco de Gama ». Proposer une catégorie ici
    // serait deviner, et une catégorie fausse part en base sans qu'on la relise.
    navigator.geolocation = { getCurrentPosition: vi.fn(), watchPosition: vi.fn(), clearWatch: vi.fn() };
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        type: 'residential',
        display_name: 'Quai Vasco de Gama, 66700 Argelès-sur-Mer',
        address: { road: 'Quai Vasco de Gama', postcode: '66700', city: 'Argelès-sur-Mer' }
      })
    }));

    setState('cachedGpsPosition', { lat: 42.55, lng: 3.03, accuracy: 10, timestamp: Date.now() });
    document.body.innerHTML = BALISAGE;
    initQuickAdd();
    window.showQuickAddModal();

    await vi.waitFor(() => {
      expect(document.getElementById('quickAddLocation').textContent).toMatch(/Argelès/);
    });

    expect(document.querySelector('.category-btn.selected')).toBeNull();
  });
});

describe('La ligne des catégories souvent employées', () => {
  /**
   * La grille présente toutes les catégories à poids égal. C'est juste tant
   * qu'elles sont huit ; ça cesse de l'être dès qu'on en crée d'autres, car
   * l'usage réel est très inégal.
   */
  const ORIGINE = getCategories();
  afterEach(() => { getCategories.mockReturnValue(ORIGINE); });

  const NEUF = [
    { id: 'courses', icon: '🛒', label: 'Courses' },
    { id: 'maison', icon: '🏠', label: 'Maison' },
    { id: 'essence', icon: '🚗', label: 'Essence' },
    { id: 'restaurant', icon: '🍕', label: 'Restaurant' },
    { id: 'sante', icon: '💊', label: 'Santé' },
    { id: 'loisirs', icon: '🎮', label: 'Loisirs' },
    { id: 'transport', icon: '🚌', label: 'Transport' },
    { id: 'autre', icon: '⚡', label: 'Autre' },
    { id: 'bar', icon: '🍺', label: 'Bar' }
  ];

  /**
   * Rouvre la modale avec une liste de catégories et un historique donnés
   * @param {Array} categories
   * @param {Array} charges
   */
  async function rouvrir(categories, charges) {
    getCategories.mockReturnValue(categories);
    setState('variableCharges', charges);
    document.body.innerHTML = BALISAGE;
    initQuickAdd();
    window.showQuickAddModal();
  }

  it('reste masquée sur une grille courte : elle ne raccourcit aucun geste', async () => {
    await rouvrir(NEUF.slice(0, 3), [
      { category: 'Courses' }, { category: 'Courses' }, { category: 'Maison' }
    ]);

    expect(document.getElementById('categoryFrequentes').hidden).toBe(true);
  });

  it('reste masquée sans historique : rien à en tirer', async () => {
    await rouvrir(NEUF, []);

    expect(document.getElementById('categoryFrequentes').hidden).toBe(true);
  });

  it('apparaît sur une longue grille, la plus employée en tête', async () => {
    await rouvrir(NEUF, [
      { category: 'Bar' }, { category: 'Bar' }, { category: 'Bar' },
      { category: 'Courses' }, { category: 'Courses' },
      { category: 'Restaurant' }
    ]);

    expect(document.getElementById('categoryFrequentes').hidden).toBe(false);

    const libelles = [...document.querySelectorAll('.category-frequente-btn')]
      .map(b => b.dataset.categoryId);
    expect(libelles).toEqual(['bar', 'courses', 'restaurant']);
  });

  it('un raccourci sélectionne la catégorie, comme la tuile', async () => {
    await rouvrir(NEUF, [
      { category: 'Bar' }, { category: 'Bar' }, { category: 'Courses' }
    ]);

    document.querySelector('.category-frequente-btn[data-category-id="bar"]').click();
    document.getElementById('quickAddAmount').value = '7,50';
    await valider();

    expect(derniereCharge().category).toBe('Bar');
    expect(derniereCharge().categoryId).toBe('bar');
  });

  it('le choix se voit sur les deux surfaces, pas sur une seule', async () => {
    // N'en marquer qu'une laisserait croire à deux choix distincts, dont l'un
    // serait resté vide.
    await rouvrir(NEUF, [
      { category: 'Bar' }, { category: 'Bar' }, { category: 'Courses' }
    ]);

    document.querySelector('.category-btn[data-category-id="bar"]').click();

    expect(document.querySelector('.category-frequente-btn[data-category-id="bar"]').className)
      .toContain('selected');
  });

  it('ignore la corbeille : une charge retirée n\'est pas une habitude', async () => {
    await rouvrir(NEUF, [
      { category: 'Santé', deleted: true }, { category: 'Santé', deleted: true },
      { category: 'Bar' }, { category: 'Courses' }
    ]);

    const libelles = [...document.querySelectorAll('.category-frequente-btn')]
      .map(b => b.dataset.categoryId);
    expect(libelles).not.toContain('sante');
  });
});

describe('L\'historique retenu ne déborde pas de son mois ni de son compte', () => {
  /**
   * Les charges du mois précédent sont lues une fois, puis gardées en mémoire.
   * Un cache anonyme aurait servi les charges de juin en naviguant vers
   * septembre, et celles du foyer à un compte du bac à sable. Rien n'aurait
   * signalé l'erreur : la ligne aurait l'air aussi crédible dans un cas que
   * dans l'autre.
   */
  const NEUF = [
    { id: 'courses', icon: '🛒', label: 'Courses' },
    { id: 'maison', icon: '🏠', label: 'Maison' },
    { id: 'essence', icon: '🚗', label: 'Essence' },
    { id: 'restaurant', icon: '🍕', label: 'Restaurant' },
    { id: 'sante', icon: '💊', label: 'Santé' },
    { id: 'loisirs', icon: '🎮', label: 'Loisirs' },
    { id: 'transport', icon: '🚌', label: 'Transport' },
    { id: 'autre', icon: '⚡', label: 'Autre' },
    { id: 'bar', icon: '🍺', label: 'Bar' }
  ];

  const ORIGINE = getCategories();

  beforeEach(() => {
    // Le `beforeEach` global ouvre déjà la modale, ce qui remplit le cache
    // pour la période en cours. On repart donc d'un module vierge.
    cleanupQuickAdd();
    dbGet.mockClear();
  });

  afterEach(() => {
    getCategories.mockReturnValue(ORIGINE);
    dbGet.mockResolvedValue(null);
  });

  /** Libellés actuellement proposés dans la ligne */
  const proposes = () => [...document.querySelectorAll('.category-frequente-btn')]
    .map(b => b.dataset.categoryId);

  it('l\'historique d\'un mois ne sert pas à un autre', async () => {
    getCategories.mockReturnValue(NEUF);
    setState('variableCharges', []);
    setState('currentPeriod', '2026-08');
    dbGet.mockResolvedValue({ a: { category: 'Bar' }, b: { category: 'Bar' }, c: { category: 'Loisirs' } });

    document.body.innerHTML = BALISAGE;
    initQuickAdd();
    window.showQuickAddModal();
    await vi.waitFor(() => expect(proposes()).toEqual(['bar', 'loisirs']));

    // On navigue vers un autre mois : juillet n'a rien à dire de septembre.
    setState('currentPeriod', '2026-10');
    dbGet.mockResolvedValue(null);

    document.body.innerHTML = BALISAGE;
    window.showQuickAddModal();

    expect(document.getElementById('categoryFrequentes').hidden).toBe(true);
  });

  it('la déconnexion efface l\'historique : le compte suivant part de zéro', async () => {
    // Le compte de test vit dans le bac à sable. Lui servir les habitudes du
    // foyer — ou l'inverse — ne lèverait aucune erreur.
    getCategories.mockReturnValue(NEUF);
    setState('variableCharges', []);
    setState('currentPeriod', '2026-08');
    dbGet.mockResolvedValue({ a: { category: 'Bar' }, b: { category: 'Bar' }, c: { category: 'Loisirs' } });

    document.body.innerHTML = BALISAGE;
    initQuickAdd();
    window.showQuickAddModal();
    await vi.waitFor(() => expect(proposes()).toEqual(['bar', 'loisirs']));

    cleanupQuickAdd();
    dbGet.mockResolvedValue(null);

    document.body.innerHTML = BALISAGE;
    initQuickAdd();
    window.showQuickAddModal();

    expect(document.getElementById('categoryFrequentes').hidden).toBe(true);
  });

  it('ne relit pas la base quand le mois n\'a pas changé', async () => {
    // Le confort ne vaut pas un aller-retour par ouverture de la modale.
    getCategories.mockReturnValue(NEUF);
    setState('variableCharges', []);
    setState('currentPeriod', '2026-08');
    dbGet.mockResolvedValue({ a: { category: 'Bar' }, b: { category: 'Bar' } });

    document.body.innerHTML = BALISAGE;
    initQuickAdd();
    window.showQuickAddModal();
    await vi.waitFor(() => expect(dbGet).toHaveBeenCalledTimes(1));

    window.showQuickAddModal();
    window.showQuickAddModal();

    expect(dbGet).toHaveBeenCalledTimes(1);
  });
});

describe('Deux appuis ne font pas deux charges', () => {
  /**
   * Rien n'empêchait d'entrer deux fois dans l'écriture. Sur une connexion
   * lente, `dbPush` met le temps qu'il met : la modale reste ouverte, rien ne
   * bouge, et le second appui est le réflexe naturel. Mesuré avant correctif :
   * le second appel franchissait toute la validation et atteignait la base.
   */
  it('un second appui pendant l\'écriture est ignoré', async () => {
    dbPush.mockImplementation(() => new Promise(r => setTimeout(() => r('cle'), 30)));

    saisir({ montant: '12,50' });
    const { handleQuickAddSubmit } = window;
    await Promise.all([handleQuickAddSubmit(), handleQuickAddSubmit()]);

    expect(dbPush).toHaveBeenCalledTimes(1);
    // Et surtout : aucune erreur affichée. Le second appui n'a pas à produire
    // un bandeau rouge pour une charge qui, elle, s'est bien enregistrée.
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('le verrou est relâché : la charge suivante passe', async () => {
    // Un verrou qui ne se rouvre pas rendrait la saisie rapide inutilisable
    // pour le reste de la session.
    saisir({ montant: '12,50' });
    await valider();

    document.body.innerHTML = BALISAGE;
    initQuickAdd();
    window.showQuickAddModal();
    saisir({ montant: '8' });
    await valider();

    expect(dbPush).toHaveBeenCalledTimes(2);
  });

  it('un refus de validation ne referme pas le verrou sur lui-même', async () => {
    // Le verrou est posé avant la validation : s'il n'était pas relâché sur les
    // chemins de refus, une saisie incomplète condamnerait toutes les suivantes.
    document.querySelector('[data-category-id="restaurant"]').click();
    await valider();                       // montant vide → refus
    expect(dbPush).not.toHaveBeenCalled();

    document.getElementById('quickAddAmount').value = '9,90';
    await valider();

    expect(dbPush).toHaveBeenCalledTimes(1);
  });
});

describe('Les écouteurs ne s\'empilent pas au fil des connexions', () => {
  /**
   * `initQuickAdd` est rappelé à chaque connexion, tandis que les éléments de
   * la modale vivent aussi longtemps que la page. Mesuré avant correctif :
   * trois connexions posaient trois écouteurs sur chaque élément, et une
   * pression sur Entrée entrait trois fois dans la soumission.
   */
  it('trois connexions successives n\'en posent qu\'un par élément', () => {
    const poses = {};
    const cibles = [
      'quickAddAmount', 'quickAddDescription', 'quickSplitProrata',
      'quickSplit5050', 'quickAddPayer', 'quickAddLocationDetach', 'modalQuickAdd'
    ];

    for (const id of cibles) {
      const element = document.getElementById(id);
      const pose = element.addEventListener.bind(element);
      const retire = element.removeEventListener.bind(element);
      element.addEventListener = (type, fn, opts) => {
        poses[`${id}:${type}`] = (poses[`${id}:${type}`] || 0) + 1;
        return pose(type, fn, opts);
      };
      element.removeEventListener = (type, fn, opts) => {
        if (poses[`${id}:${type}`]) poses[`${id}:${type}`] -= 1;
        return retire(type, fn, opts);
      };
    }

    cleanupQuickAdd(); initQuickAdd();
    cleanupQuickAdd(); initQuickAdd();
    cleanupQuickAdd(); initQuickAdd();

    const empiles = Object.entries(poses).filter(([, n]) => n > 1);
    expect(empiles, `écouteurs empilés : ${JSON.stringify(empiles)}`).toEqual([]);
  });
});

describe('La phrase, et les panneaux qu\'elle ouvre', () => {
  /**
   * Quatre blocs empilés — catégories, payeur, répartition, date — obligeaient
   * à reconstituer de tête l'état de quatre contrôles, et reléguaient le payeur
   * sous neuf tuiles de catégories. C'est lui qui décide qui doit combien :
   * atteint par défilement, il n'était pas vérifié.
   */

  it('dit l\'état par défaut dès l\'ouverture', () => {
    // Une phrase vide à l'ouverture laisserait croire qu'aucun défaut n'est
    // posé — alors qu'il y en a quatre, et qu'ils vont partir en base.
    expect(phrase()).toEqual([
      'Payé par Vous',
      'Au prorata',
      'Choisir une catégorie',
      "Aujourd'hui"
    ]);
  });

  it('les panneaux partent repliés : c\'est tout le gain', () => {
    // Repliés par le module à l'ouverture, et non par le balisage — voir le
    // contrôle « la page ne les replie pas elle-même » plus bas.
    for (const panneau of document.querySelectorAll('.quick-add-panneau')) {
      expect(panneau.hidden, `${panneau.id} déplié à l'ouverture`).toBe(true);
    }
  });

  it('un segment ouvre son panneau, et lui seul', () => {
    ouvrirSegment('payeur');

    expect(document.getElementById('quickAddPanneauPayeur').hidden).toBe(false);
    expect(document.getElementById('quickAddPanneauCategorie').hidden).toBe(true);
    expect(document.getElementById('quickAddPanneauDate').hidden).toBe(true);
  });

  it('n\'en laisse jamais deux ouverts', () => {
    // Deux dépliés reproduiraient l'empilement qu'on vient de défaire, et
    // repousseraient le bouton d'enregistrement hors de l'écran.
    ouvrirSegment('payeur');
    ouvrirSegment('categorie');

    const ouverts = [...document.querySelectorAll('.quick-add-panneau')].filter(p => !p.hidden);
    expect(ouverts.map(p => p.id)).toEqual(['quickAddPanneauCategorie']);
  });

  it('le choix fait, le panneau se referme', () => {
    // Le geste suivant est « Ajouter » : le laisser ouvert oblige à faire
    // défiler pour retrouver le bouton.
    ouvrirSegment('payeur');
    document.querySelector('#quickAddPayer [data-payer="conjointe"]').click();

    expect(document.getElementById('quickAddPanneauPayeur').hidden).toBe(true);
    expect(phrase()[0]).toBe('Payé par Conjointe');
  });

  it('la phrase suit chaque choix', () => {
    saisir({ categorie: 'restaurant', payeur: 'partage' });
    ouvrirSegment('repartition');
    document.getElementById('quickSplit5050').click();

    expect(phrase()).toEqual([
      'Payé à deux',
      'Partagé 50-50',
      '🍕 Restaurant',
      "Aujourd'hui"
    ]);
  });

  it('le segment de catégorie signale ce qui manque, sans désactiver le bouton', () => {
    // Un bouton désactivé n'émet aucun événement au toucher : on tape dessus
    // et il ne se passe rien, sans que rien ne dise ce qui manque.
    const segment = document.querySelectorAll('#quickAddPhrase button')[2];
    expect(segment.classList.contains('quick-add-segment--manquant')).toBe(true);
    expect(document.getElementById('btnQuickAdd').disabled).toBe(false);

    saisir({ categorie: 'courses' });
    const apres = document.querySelectorAll('#quickAddPhrase button')[2];
    expect(apres.classList.contains('quick-add-segment--manquant')).toBe(false);
  });

  it('un refus faute de catégorie ouvre le panneau avant d\'y renvoyer', () => {
    // Le défaut que ce contrôle ferme : la grille est repliée, et le focus sur
    // un élément masqué ne fait rien. On aurait nommé le champ manquant tout en
    // le laissant hors de vue — pire que se taire.
    document.getElementById('quickAddAmount').value = '12.50';

    return valider().then(() => {
      expect(toast.error).toHaveBeenCalledWith('Choisissez une catégorie');
      expect(document.getElementById('quickAddPanneauCategorie').hidden,
        'la grille est restée masquée').toBe(false);
    });
  });

  it('rouvrir la modale referme les panneaux', () => {
    ouvrirSegment('categorie');
    window.showQuickAddModal();

    for (const panneau of document.querySelectorAll('.quick-add-panneau')) {
      expect(panneau.hidden, `${panneau.id} rouvert déplié`).toBe(true);
    }
  });

  it('chaque segment annonce l\'état de son panneau', () => {
    // `aria-expanded` est ce qui distingue, à la synthèse vocale, un bouton qui
    // déplie d'un bouton qui agit.
    ouvrirSegment('date');

    const segments = [...document.querySelectorAll('#quickAddPhrase button')];
    expect(segments.map(b => b.getAttribute('aria-expanded')))
      .toEqual(['false', 'false', 'false', 'true']);
    expect(segments[3].getAttribute('aria-controls')).toBe('quickAddPanneauDate');
  });
});

describe('La page livre bien ce que le module manipule', () => {
  it('porte la phrase et les quatre panneaux', () => {
    // Le balisage de ce banc d'essai est écrit à la main : il peut diverger de
    // la page livrée sans que rien ne le signale, et le module écrirait alors
    // dans des identifiants que la page ne porte plus.
    const page = readFileSync(resolve(process.cwd(), 'public/FairSplit.html'), 'utf8');

    for (const id of [
      'quickAddPhrase',
      'quickAddPanneauPayeur',
      'quickAddPanneauRepartition',
      'quickAddPanneauCategorie',
      'quickAddPanneauDate'
    ]) {
      expect(page, `${id} absent de FairSplit.html`).toContain(`id="${id}"`);
    }
  });

  it('ne replie pas les panneaux elle-même : le script s\'en charge', () => {
    // Constaté en production, six minutes après un déploiement : le nouveau
    // balisage était servi avec l'ancien script, encore en cache HTTP. Les
    // panneaux pré-repliés restaient fermés, aucune phrase ne venait les
    // ouvrir — plus de catégorie, plus de payeur, plus de répartition. Un
    // formulaire inutilisable, là où chacune des deux versions seule
    // fonctionnait.
    //
    // Le script les replie à l'ouverture de la modale, avant qu'elle
    // n'apparaisse. Le pire des cas rend donc l'écran d'avant : long, mais
    // entier.
    const page = readFileSync(resolve(process.cwd(), 'public/FairSplit.html'), 'utf8');

    for (const id of ['Payeur', 'Repartition', 'Categorie', 'Date']) {
      expect(page, `quickAddPanneau${id} est pré-replié dans le balisage`)
        .toContain(`<div class="quick-add-panneau" id="quickAddPanneau${id}">`);
    }
  });

  it('garde les contrôles à l\'intérieur des panneaux, non à côté', () => {
    // Un contrôle resté hors de son panneau ne se replierait jamais : la
    // modale retrouverait sa hauteur d'avant sans que rien ne le dise.
    const page = readFileSync(resolve(process.cwd(), 'public/FairSplit.html'), 'utf8');
    const modale = page.slice(page.indexOf('id="modalQuickAdd"'));

    for (const id of ['quickAddPayer', 'categoryGrid', 'quickSplitProrata', 'quickAddDate']) {
      const avant = modale.slice(0, modale.indexOf(`id="${id}"`));
      const dernierPanneau = avant.lastIndexOf('quick-add-panneau');
      const dernieresFermetures = avant.lastIndexOf('</div>\n\n');

      expect(dernierPanneau, `${id} n'est dans aucun panneau`).toBeGreaterThan(-1);
      expect(dernierPanneau, `${id} est hors de son panneau`).toBeGreaterThan(dernieresFermetures);
    }
  });
});

/**
 * Ouverte par le raccourci, avant que l'application soit prête
 *
 * Le raccourci d'appui long ouvrait la modale au bout de la séquence
 * d'initialisation : jeton, attestation, listes du foyer, salaires, charges du
 * mois. Le temps gagné sur les gestes était repris par l'attente.
 *
 * Elle s'ouvre désormais tout de suite, sur les valeurs par défaut. Ce qui se
 * juge ici : que rien ne parte en base avant qu'il y ait de quoi écrire, et
 * que ce qui a été tapé pendant l'attente survive.
 */
describe('Saisie ouverte avant que l\'application soit prête', () => {

  beforeEach(() => {
    // L'état d'avant l'authentification : le marqueur n'est pas encore posé.
    delete document.body.dataset.appReady;
    document.body.innerHTML = BALISAGE;
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.dataset.appReady = 'true';
  });

  it('n\'écrit rien tant que l\'application n\'est pas prête', async () => {
    initQuickAdd();
    window.showQuickAddModal({ anticipee: true });
    saisir({ montant: '12,50', description: 'Cafe' });

    const partie = valider();
    // Le temps de laisser passer les micro-tâches : sans la garde, l'écriture
    // serait déjà partie — sans période lisible, et avec des règles qui la
    // refuseraient.
    await Promise.resolve();
    await Promise.resolve();
    expect(dbPush).not.toHaveBeenCalled();

    document.body.dataset.appReady = 'true';
    await partie;

    expect(dbPush).toHaveBeenCalledTimes(1);
    expect(derniereCharge()).toMatchObject({ amount: 12.5, description: 'Cafe' });
  });

  it('l\'ouverture ordinaire n\'attend rien', async () => {
    document.body.dataset.appReady = 'true';
    initQuickAdd();
    window.showQuickAddModal();
    saisir();

    await valider();

    expect(dbPush).toHaveBeenCalledTimes(1);
  });

  it('passe devant l\'écran de connexion, et redescend ensuite', async () => {
    initQuickAdd();
    window.showQuickAddModal({ anticipee: true });

    const modale = document.getElementById('modalQuickAdd');
    expect(modale.classList.contains('modal-overlay--anticipee')).toBe(true);

    document.body.dataset.appReady = 'true';
    await vi.waitFor(() => {
      expect(modale.classList.contains('modal-overlay--anticipee')).toBe(false);
    });
  });

  it('anticiper alors que tout est prêt est une ouverture ordinaire', () => {
    document.body.dataset.appReady = 'true';
    initQuickAdd();
    window.showQuickAddModal({ anticipee: true });

    const modale = document.getElementById('modalQuickAdd');
    expect(modale.classList.contains('modal-overlay--anticipee')).toBe(false);
  });

  it('un payeur choisi à la main survit à l\'arrivée des données', async () => {
    initQuickAdd();
    window.showQuickAddModal({ anticipee: true });

    ouvrirSegment('payeur');
    document.querySelector('#quickAddPayer [data-payer="conjointe"]').click();

    setState('emplacementCourant', 'vous');
    document.body.dataset.appReady = 'true';
    document.getElementById('modalQuickAdd').classList.add('active');

    saisir({ montant: '30' });
    await valider();

    expect(derniereCharge().paidBy).toBe('conjointe');
  });
});
