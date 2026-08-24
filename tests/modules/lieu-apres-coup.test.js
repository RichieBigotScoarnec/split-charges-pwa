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
    <button type="button" id="variableChargeLieuChercher">🔍</button>
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

  // Laisse les promesses du réseau se dénouer. Compter les microtâches une à
  // une rendait ce banc d'essai solidaire du nombre d'`await` dans le module :
  // en ajouter un cassait dix tests sans qu'aucun défaut n'existe.
  await laisserSeDenouer();

  return [...document.querySelectorAll('.lieu-resultat')];
}

/** Rend la main assez longtemps pour que les promesses en vol se règlent */
async function laisserSeDenouer() {
  for (let tour = 0; tour < 6; tour++) await new Promise(suite => setTimeout(suite, 0));
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
    await laisserSeDenouer();

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

/**
 * Chercher d'abord dans le coin
 *
 * Signalé à l'usage : « je lui mets le Caffe Mamma qui se situe à
 * Argelès-sur-Mer mais il ne trouve et me met des villes lointaines comme à New
 * York ». La recherche marchait — elle cherchait simplement sur toute la
 * planète, et Nominatim classe par notoriété.
 */

const ARGELES = { lat: 42.5450, lng: 3.0244 };

/** Un café à Collioure, à cinq kilomètres d'Argelès */
const PRES = [{
  lat: '42.5250', lon: '3.0830',
  name: 'Caffe Mamma', type: 'cafe',
  address: { amenity: 'Caffe Mamma', postcode: '66190', city: 'Collioure' }
}];

/** Son homonyme new-yorkais, que Nominatim rendait en premier */
const LOIN = [{
  lat: '40.7128', lon: '-74.0060',
  name: 'Caffe Mamma', type: 'cafe',
  address: { amenity: 'Caffe Mamma', postcode: '10007', city: 'New York' }
}];

/**
 * Lance une recherche en enregistrant chaque appel réseau
 * @param {string} saisie
 * @param {Array<Array<Object>>} reponses - Une par appel attendu, dans l'ordre
 * @returns {Promise<{urls: Array<string>, propositions: Array<Element>}>}
 */
async function chercherEnObservant(saisie, reponses) {
  const urls = [];
  let rang = 0;

  globalThis.fetch = vi.fn((url) => {
    urls.push(String(url));
    const corps = reponses[Math.min(rang++, reponses.length - 1)];
    return Promise.resolve({ ok: true, json: () => Promise.resolve(corps) });
  });

  const champ = document.getElementById('variableChargeLieuRecherche');
  champ.value = saisie;
  champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  // Deux appels peuvent s'enchaîner : on laisse les promesses se dénouer.
  await laisserSeDenouer();

  return { urls, propositions: [...document.querySelectorAll('.lieu-resultat')] };
}

/** Lit le paramètre `viewbox` d'une URL, sous forme de nombres */
function viewbox(url) {
  const valeur = new URL(url).searchParams.get('viewbox');
  if (!valeur) return null;
  const [ouest, sud, est, nord] = valeur.split(',').map(Number);
  return { ouest, sud, est, nord };
}

describe('La recherche commence autour de l\'utilisateur', () => {
  it('cadre la requête sur la position connue du téléphone', async () => {
    setState('cachedGpsPosition', { ...ARGELES, accuracy: 30, timestamp: 1_700_000_000_000 });

    const { urls } = await chercherEnObservant('Caffe Mamma', [PRES]);

    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).searchParams.get('bounded')).toBe('1');

    // Le cadre doit entourer Argelès. Deux nombres intervertis, et il
    // désignerait la Somalie.
    const cadre = viewbox(urls[0]);
    expect(cadre.ouest).toBeLessThan(ARGELES.lng);
    expect(cadre.est).toBeGreaterThan(ARGELES.lng);
    expect(cadre.sud).toBeLessThan(ARGELES.lat);
    expect(cadre.nord).toBeGreaterThan(ARGELES.lat);
  });

  it('n\'interroge qu\'une fois quand les environs répondent', async () => {
    // Nominatim est gratuit et plafonné : un second appel inutile se paie sur
    // un service que personne ne facture.
    setState('cachedGpsPosition', { ...ARGELES, timestamp: 1_700_000_000_000 });

    const { urls, propositions } = await chercherEnObservant('Caffe Mamma', [PRES]);

    expect(urls).toHaveLength(1);
    expect(propositions).toHaveLength(1);
    expect(propositions[0].textContent).toContain('Collioure');
  });

  it('affiche la distance sous chaque proposition', async () => {
    setState('cachedGpsPosition', { ...ARGELES, timestamp: 1_700_000_000_000 });

    const { propositions } = await chercherEnObservant('Caffe Mamma', [PRES]);

    expect(propositions[0].querySelector('.lieu-resultat-distance').textContent.trim())
      .toBe('5,3 km');
  });

  it('élargit au monde entier, et le dit, quand les environs ne rendent rien', async () => {
    // Le cas où le lieu n'est pas dans OpenStreetMap près d'ici. On ne peut pas
    // ne rien montrer ; on peut dire pourquoi ce qui est montré est loin.
    setState('cachedGpsPosition', { ...ARGELES, timestamp: 1_700_000_000_000 });

    const { urls, propositions } = await chercherEnObservant('Caffe Mamma', [[], LOIN]);

    expect(urls).toHaveLength(2);
    expect(new URL(urls[0]).searchParams.get('bounded')).toBe('1');
    expect(new URL(urls[1]).searchParams.get('bounded')).toBeNull();
    expect(new URL(urls[1]).searchParams.get('viewbox')).toBeNull();

    expect(document.getElementById('variableChargeLieuResultats').textContent)
      .toContain('près de vous');
    expect(propositions[0].textContent).toContain('New York');
    // La distance rend le problème lisible d'un coup d'œil.
    expect(propositions[0].textContent).toMatch(/6\d{3} km/);
  });

  it('cherche partout, sans cadre, quand on ignore où se trouve l\'utilisateur', async () => {
    // Sur un ordinateur, sans GPS et sans dépense localisée : un cadre inventé
    // masquerait le bon résultat au lieu de le remonter.
    const { urls, propositions } = await chercherEnObservant('Caffe Mamma', [LOIN]);

    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).searchParams.get('viewbox')).toBeNull();
    expect(propositions[0].querySelector('.lieu-resultat-distance')).toBeNull();
    expect(document.getElementById('variableChargeLieuResultats').textContent)
      .not.toContain('près de vous');
  });

  it('à défaut de GPS, se rabat sur la dernière dépense localisée', async () => {
    setState('variableCharges', [
      {
        id: 'vieille', description: 'Un café', amount: 3, category: 'Bar',
        paidBy: 'vous', timestamp: 1_600_000_000_000,
        location: { lat: 48.8566, lng: 2.3522, name: 'Paris' }
      },
      {
        id: 'recente', description: 'Une bière', amount: 6, category: 'Bar',
        paidBy: 'vous', timestamp: 1_700_000_000_000,
        location: { lat: ARGELES.lat, lng: ARGELES.lng, name: 'Argelès-sur-Mer' }
      }
    ]);

    const { urls } = await chercherEnObservant('Caffe Mamma', [PRES]);

    const cadre = viewbox(urls[0]);
    expect(cadre.sud).toBeLessThan(ARGELES.lat);
    expect(cadre.nord).toBeGreaterThan(ARGELES.lat);
    // Paris est plus ancienne : son cadre ne contiendrait pas Argelès.
    expect(cadre.nord).toBeLessThan(48);
  });

  it('ignore une charge supprimée pour choisir le centre', async () => {
    setState('variableCharges', [{
      id: 'jetee', description: 'Erreur', amount: 3, category: 'Bar', paidBy: 'vous',
      deleted: true, timestamp: 1_800_000_000_000,
      location: { lat: 48.8566, lng: 2.3522, name: 'Paris' }
    }]);

    const { urls } = await chercherEnObservant('Caffe Mamma', [LOIN]);
    expect(new URL(urls[0]).searchParams.get('viewbox')).toBeNull();
  });

  it('rouvrir une charge localisée cherche autour de ce lieu', async () => {
    // On corrige le nom d'un bar noté pendant les vacances : c'est là-bas qu'il
    // faut chercher, pas là où l'on se trouve maintenant.
    setState('variableCharges', [{
      id: 'b1', description: 'Une bière', amount: 6.5, category: 'Bar',
      paidBy: 'vous', date: '2026-08-22',
      location: { lat: ARGELES.lat, lng: ARGELES.lng, name: 'Un bar, 66700 Argelès-sur-Mer' }
    }]);

    editVariableCharge('b1');

    const { urls } = await chercherEnObservant('Caffe Mamma', [PRES]);
    const cadre = viewbox(urls[0]);

    expect(cadre.sud).toBeLessThan(ARGELES.lat);
    expect(cadre.nord).toBeGreaterThan(ARGELES.lat);
  });
});

describe('Quand le bon lieu est ailleurs', () => {
  it('propose de chercher plus loin même si les environs ont répondu', async () => {
    // Le bar des vacances, à deux cents kilomètres, quand une enseigne du même
    // nom existe près de chez soi : le repli automatique ne se déclenche pas,
    // puisque les environs ont rendu quelque chose. Sans cette sortie, la bonne
    // réponse n'est jamais demandée.
    setState('cachedGpsPosition', { ...ARGELES, timestamp: 1_700_000_000_000 });

    await chercherEnObservant('Caffe Mamma', [PRES]);

    const sortie = document.querySelector('.lieu-elargir');
    expect(sortie).not.toBeNull();
  });

  it('la sortie relance une recherche sans cadre', async () => {
    setState('cachedGpsPosition', { ...ARGELES, timestamp: 1_700_000_000_000 });

    const { urls } = await chercherEnObservant('Caffe Mamma', [PRES, LOIN]);
    expect(urls).toHaveLength(1);

    document.querySelector('.lieu-elargir').click();
    await laisserSeDenouer();

    expect(urls).toHaveLength(2);
    expect(new URL(urls[1]).searchParams.get('viewbox')).toBeNull();
    expect([...document.querySelectorAll('.lieu-resultat')][0].textContent)
      .toContain('New York');
  });

  it('ne propose plus d\'élargir une recherche déjà élargie', async () => {
    // Un bouton qui ne peut plus rien changer est un bouton qui ment.
    setState('cachedGpsPosition', { ...ARGELES, timestamp: 1_700_000_000_000 });

    await chercherEnObservant('Caffe Mamma', [[], LOIN]);

    expect(document.querySelector('.lieu-elargir')).toBeNull();
  });

  it('ne propose pas d\'élargir ce qui n\'a jamais été cadré', async () => {
    await chercherEnObservant('Caffe Mamma', [LOIN]);
    expect(document.querySelector('.lieu-elargir')).toBeNull();
  });

  it('la distance reste affichée après élargissement', async () => {
    // C'est elle qui dit pourquoi la proposition est loin.
    setState('cachedGpsPosition', { ...ARGELES, timestamp: 1_700_000_000_000 });

    await chercherEnObservant('Caffe Mamma', [PRES, LOIN]);
    document.querySelector('.lieu-elargir').click();
    await laisserSeDenouer();

    expect(document.querySelector('.lieu-resultat-distance').textContent)
      .toMatch(/6\d{3} km/);
  });
});
