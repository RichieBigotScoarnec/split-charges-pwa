// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Rattacher un lieu à une dépense déjà saisie
 *
 * Signalé à l'usage : « nous avons bu un coup, je n'ai pas noté de suite, mais
 * j'aimerais pouvoir dire où nous étions. »
 *
 * Le lieu ne s'écrivait que par le GPS, au moment de la saisie rapide. C'est le
 * bon moment quand on paie, le mauvais dès qu'on note la dépense plus tard : la
 * position du téléphone désigne alors le domicile. Et le formulaire complet,
 * lui, n'a jamais su écrire de lieu du tout.
 *
 * On cherche donc par le nom, et on peut le faire après coup.
 */

const dbPush = vi.fn(() => Promise.resolve('cle-neuve'));
const dbUpdate = vi.fn(() => Promise.resolve());

vi.mock('../../public/js/db.js', () => ({
  dbPush,
  dbUpdate,
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  getDataPath: vi.fn(path => `household/${path}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(),
  showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));
vi.mock('../../public/js/modules/trash.js', () => ({ refreshTrashButton: vi.fn() }));
vi.mock('../../public/js/modules/map.js', () => ({ refreshMapButton: vi.fn() }));
vi.mock('../../public/js/modules/trends.js', () => ({ invalidateTrends: vi.fn() }));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategoryIcon: vi.fn(() => '🍺'),
  populateCategorySelect: vi.fn(),
  populateDestinationSelect: vi.fn()
}));
vi.mock('../../public/js/modules/envelopes.js', () => ({
  populateEnvelopeSelect: vi.fn(),
  etiquetteEnveloppe: vi.fn(() => '')
}));

const {
  initChoixLieu, lieuChoisi, poserLieu, reinitialiserLieu
} = await import('../../public/js/modules/choix-lieu.js');
const {
  saveVariableCharge, editVariableCharge, showAddVariableChargeModal
} = await import('../../public/js/modules/variable-charges.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** Le formulaire, tel que le livre FairSplit.html */
const formulaire = `
  <h2 id="modalAddVariableChargeTitle">Ajouter Charge Variable</h2>
  <input type="hidden" id="variableChargeId" value="" />
  <input id="variableChargeDescription" value="Une bière" />
  <input id="variableChargeAmount" value="6,50" />
  <input type="date" id="variableChargeDate" value="2026-08-22" />
  <select id="variableChargeCategory"><option value="Bar" selected>Bar</option></select>
  <select id="variableChargePaidBy"><option value="vous" selected>Vous</option></select>
  <select id="variableChargeEnvelope"><option value="" selected></option></select>
  <div class="lieu-recherche">
    <input type="text" id="variableChargeLieuRecherche" />
    <button type="button" id="variableChargeLieuIci">📍</button>
  </div>
  <div id="variableChargeLieuResultats" hidden></div>
  <div id="variableChargeLieuRetenu" hidden>
    <span>📍</span><span id="variableChargeLieuNom"></span>
    <button type="button" id="variableChargeLieuRetirer">✕</button>
  </div>
  <input type="checkbox" id="variableChargeSplitToggle" />
  <div id="variableChargeSplitOptions"></div>
  <button id="saveVariableCharge">Ajouter</button>
  <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
`;

/** Une réponse de recherche Nominatim */
const REPONSE = [{
  lat: '48.1113',
  lon: '-1.6800',
  name: 'Le Bistrot',
  type: 'bar',
  address: { amenity: 'Le Bistrot', postcode: '35000', city: 'Rennes' }
}];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  resetState();
  setState('currentPeriod', '2026-08');
  document.body.innerHTML = formulaire;
  reinitialiserLieu();
  initChoixLieu();
});

/** Simule une recherche aboutie et rend la liste des propositions */
async function chercher(saisie, reponse = REPONSE) {
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(reponse) }));

  const champ = document.getElementById('variableChargeLieuRecherche');
  champ.value = saisie;
  // Entrée court-circuite l'attente de fin de frappe.
  champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  // Laisse la promesse du fetch se dénouer.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  return [...document.querySelectorAll('.lieu-resultat')];
}

describe('Chercher un lieu par son nom', () => {
  it('propose ce que Nominatim rend', async () => {
    const propositions = await chercher('Le Bistrot Rennes');

    expect(propositions).toHaveLength(1);
    expect(propositions[0].textContent.trim()).toBe('Le Bistrot, 35000 Rennes');
  });

  it('choisir une proposition retient le lieu', async () => {
    const [proposition] = await chercher('Le Bistrot Rennes');
    proposition.click();

    const lieu = lieuChoisi();
    expect(lieu.name).toBe('Le Bistrot, 35000 Rennes');
    expect(lieu.lat).toBeCloseTo(48.1113, 4);
    expect(lieu.commune).toBe('Rennes');
  });

  it('le lieu retenu s\'affiche, et la liste se referme', async () => {
    const [proposition] = await chercher('Le Bistrot Rennes');
    proposition.click();

    expect(document.getElementById('variableChargeLieuRetenu').hidden).toBe(false);
    expect(document.getElementById('variableChargeLieuNom').textContent).toContain('Bistrot');
    expect(document.getElementById('variableChargeLieuResultats').hidden).toBe(true);
  });

  it('le dit quand aucun lieu ne correspond', async () => {
    await chercher('zzzzzzzz', []);
    expect(document.getElementById('variableChargeLieuResultats').textContent)
      .toContain('Aucun lieu');
  });

  it('reste utilisable hors ligne', async () => {
    // Le lieu est un confort : son indisponibilité ne doit pas empêcher
    // d'enregistrer la dépense.
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('hors ligne')));

    const champ = document.getElementById('variableChargeLieuRecherche');
    champ.value = 'Le Bistrot';
    champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('variableChargeLieuResultats').textContent)
      .toContain('indisponible');
    expect(lieuChoisi()).toBeNull();
  });

  it('n\'interroge pas le service pour deux lettres', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));

    const champ = document.getElementById('variableChargeLieuRecherche');
    champ.value = 'Le';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('échappe le libellé d\'une proposition', async () => {
    // Il vient d'un service tiers et traverse `innerHTML`.
    const propositions = await chercher('piège', [{
      lat: '48.1', lon: '-1.6',
      name: '<img src=x onerror=alert(1)>',
      address: { amenity: '<img src=x onerror=alert(1)>', city: 'Rennes' }
    }]);

    expect(propositions).toHaveLength(1);
    expect(document.querySelector('#variableChargeLieuResultats img')).toBeNull();
  });
});

describe('Le lieu part avec la charge', () => {
  it('une charge enregistrée porte le lieu choisi', async () => {
    const [proposition] = await chercher('Le Bistrot Rennes');
    proposition.click();

    await saveVariableCharge();

    const ecrite = dbPush.mock.calls.at(-1)[1];
    expect(ecrite.location.name).toBe('Le Bistrot, 35000 Rennes');
    expect(ecrite.location.lat).toBeCloseTo(48.1113, 4);
  });

  it('sans lieu, la charge s\'enregistre quand même', async () => {
    await saveVariableCharge();
    expect(dbPush.mock.calls.at(-1)[1].location).toBeNull();
  });
});

describe('Rouvrir une charge pour lui ajouter un lieu', () => {
  const biere = {
    id: 'b1', description: 'Une bière', amount: 6.5,
    category: 'Bar', paidBy: 'vous', date: '2026-08-22'
  };

  it('la charge sans lieu s\'ouvre sans lieu', () => {
    setState('variableCharges', [biere]);
    editVariableCharge('b1');

    expect(lieuChoisi()).toBeNull();
    expect(document.getElementById('variableChargeLieuRetenu').hidden).toBe(true);
  });

  it('le lieu ajouté après coup est écrit sur la charge existante', async () => {
    // Le cas signalé, de bout en bout.
    setState('variableCharges', [biere]);
    editVariableCharge('b1');

    const [proposition] = await chercher('Le Bistrot Rennes');
    proposition.click();

    await saveVariableCharge();

    const [chemin, donnees] = dbUpdate.mock.calls.at(-1);
    expect(chemin).toContain('variableCharges/b1');
    expect(donnees.location.name).toBe('Le Bistrot, 35000 Rennes');
  });

  it('une charge qui portait déjà un lieu le retrouve à la réouverture', () => {
    // Sans cela, rouvrir pour corriger le montant effacerait le lieu.
    setState('variableCharges', [{
      ...biere,
      location: { lat: 48.1, lng: -1.6, name: 'Le Bistrot, 35000 Rennes', timestamp: 1_700_000_000_000 }
    }]);

    editVariableCharge('b1');

    expect(lieuChoisi().name).toBe('Le Bistrot, 35000 Rennes');
    expect(document.getElementById('variableChargeLieuNom').textContent).toContain('Bistrot');
  });

  it('le lieu d\'origine survit à une modification du montant', async () => {
    setState('variableCharges', [{
      ...biere,
      location: { lat: 48.1, lng: -1.6, name: 'Le Bistrot, 35000 Rennes', timestamp: 1_700_000_000_000 }
    }]);

    editVariableCharge('b1');
    document.getElementById('variableChargeAmount').value = '7,50';
    await saveVariableCharge();

    const donnees = dbUpdate.mock.calls.at(-1)[1];
    expect(donnees.location.name).toBe('Le Bistrot, 35000 Rennes');
    // L'horodatage du relevé GPS d'origine est conservé : c'était une mesure.
    expect(donnees.location.timestamp).toBe(1_700_000_000_000);
    expect(donnees.amount).toBe(7.5);
  });

  it('le retrait détache le lieu', async () => {
    setState('variableCharges', [{
      ...biere,
      location: { lat: 48.1, lng: -1.6, name: 'Le Bistrot, 35000 Rennes' }
    }]);

    editVariableCharge('b1');
    document.getElementById('variableChargeLieuRetirer').click();
    await saveVariableCharge();

    // `null` supprime la clé côté Firebase : le lieu disparaît vraiment.
    expect(dbUpdate.mock.calls.at(-1)[1].location).toBeNull();
  });

  it('ouvrir un ajout après une édition ne conserve pas le lieu précédent', () => {
    setState('variableCharges', [{
      ...biere,
      location: { lat: 48.1, lng: -1.6, name: 'Le Bistrot, 35000 Rennes' }
    }]);

    editVariableCharge('b1');
    showAddVariableChargeModal();

    expect(lieuChoisi()).toBeNull();
  });
});

describe('Le lieu reste une étiquette', () => {
  it('poserLieu écarte des coordonnées inexploitables', () => {
    // Les règles de sécurité les refuseraient à l'écriture ; mieux vaut ne rien
    // retenir que de faire échouer l'enregistrement de la charge entière.
    poserLieu({ name: 'Sans coordonnées' });
    expect(lieuChoisi()).toBeNull();

    poserLieu({ lat: 'x', lng: -1.6, name: 'Abîmée' });
    expect(lieuChoisi()).toBeNull();
  });
});
