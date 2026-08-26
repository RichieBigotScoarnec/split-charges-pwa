// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Deux appuis ne font pas deux charges — les trois formulaires complets
 *
 * Le défaut avait été mesuré sur la saisie rapide : sur une connexion lente,
 * `dbPush` met le temps qu'il met, la modale reste ouverte, rien ne bouge, et
 * le second appui est le réflexe naturel. Deux charges identiques partaient en
 * base, et le bilan comptait la dépense deux fois.
 *
 * Il avait été corrigé là, et là seulement. Les trois formulaires complets
 * écrivent de la même façon et ne ferment leur modale qu'après — ils sont
 * restés sans garde. Un loyer de 900 € compté deux fois pèse plus lourd qu'un
 * café.
 */

const dbPush = vi.fn();
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
  showModal: vi.fn(),
  closeModal: vi.fn(),
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
  getCategoryIcon: vi.fn(() => '🛒'),
  populateCategorySelect: vi.fn(),
  populateDestinationSelect: vi.fn()
}));
vi.mock('../../public/js/modules/envelopes.js', () => ({
  populateEnvelopeSelect: vi.fn(),
  etiquetteEnveloppe: vi.fn(() => '')
}));

const { saveVariableCharge } = await import('../../public/js/modules/variable-charges.js');
const { saveFixedCharge } = await import('../../public/js/modules/fixed-charges.js');
const { saveReimbursement } = await import('../../public/js/modules/reimbursements.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** Les trois formulaires, réduits à ce que l'écriture manipule */
const FORMULAIRES = {
  'charge variable': {
    enregistrer: () => saveVariableCharge(),
    bouton: 'saveVariableCharge',
    balisage: `
      <input type="hidden" id="variableChargeId" value="" />
      <input id="variableChargeDescription" value="Courses" />
      <input id="variableChargeAmount" value="42,50" />
      <input type="date" id="variableChargeDate" value="2026-08-15" />
      <input type="time" id="variableChargeHeure" value="" />
      <select id="variableChargeCategory"><option value="Courses" selected>Courses</option></select>
      <select id="variableChargePaidBy"><option value="vous" selected>Vous</option></select>
      <select id="variableChargeEnvelope"><option value="" selected></option></select>
      <input type="checkbox" id="variableChargeSplitToggle" />
      <div id="variableChargeSplitOptions"></div>
      <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
      <button id="saveVariableCharge">Ajouter</button>
    `
  },
  'charge fixe': {
    enregistrer: () => saveFixedCharge(),
    bouton: 'saveFixedCharge',
    balisage: `
      <input type="hidden" id="fixedChargeId" value="" />
      <input id="fixedChargeDescription" value="Loyer" />
      <input id="fixedChargeAmount" value="900" />
      <input type="date" id="fixedChargeDate" value="2026-08-05" />
      <select id="fixedChargeCategory"><option value="Maison" selected>Maison</option></select>
      <select id="fixedChargePaidBy"><option value="vous" selected>Vous</option></select>
      <select id="fixedChargeDestination"><option value="" selected></option></select>
      <select id="fixedChargeEnvelope"><option value="" selected></option></select>
      <input type="checkbox" id="fixedChargeRecurring" checked />
      <input type="checkbox" id="fixedChargeSplitToggle" />
      <div id="fixedChargeSplitOptions"></div>
      <div id="fixedChargesList"></div><span id="fixedChargesTotal"></span>
      <button id="saveFixedCharge">Ajouter</button>
    `
  },
  'remboursement': {
    enregistrer: () => saveReimbursement(),
    bouton: 'saveReimbursement',
    balisage: `
      <input type="hidden" id="reimbursementId" value="" />
      <select id="reimbursementDirection">
        <option value="vous-to-conjointe" selected>Vous → Conjointe</option>
      </select>
      <input id="reimbursementAmount" value="50" />
      <input id="reimbursementNote" value="Courses" />
      <input type="date" id="reimbursementDate" value="2026-08-12" />
      <div id="reimbursementsList"></div><span id="reimbursementsTotal"></span>
      <button id="saveReimbursement">Ajouter</button>
    `
  }
};

/**
 * Une écriture qu'on relâche à la demande — une connexion lente, en somme
 * @returns {{terminer: Function}}
 */
function ecritureLente() {
  let terminer;
  const enVol = new Promise(resolve => { terminer = () => resolve('cle-neuve'); });
  dbPush.mockImplementation(() => enVol);
  return { terminer };
}

/**
 * Attend que l'écriture soit réellement partie
 *
 * `saveXxx` traverse validation, lecture du formulaire et import dynamique de
 * `db.js` avant d'atteindre `dbPush` : regarder le bouton tout de suite, c'est
 * le regarder avant que le verrou ne soit pris.
 *
 * @returns {Promise<void>}
 */
async function ecritureLancee() {
  for (let essai = 0; essai < 50 && dbPush.mock.calls.length === 0; essai += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` remet les appels à zéro, pas les implémentations : sans
  // `mockReset`, l'échec réseau simulé par le dernier contrôle débordait sur
  // le premier du formulaire suivant.
  dbPush.mockReset();
  dbPush.mockResolvedValue('cle-neuve');
  dbUpdate.mockReset();
  dbUpdate.mockResolvedValue(undefined);
  resetState();
  setState('currentPeriod', '2026-08');
});

describe.each(Object.entries(FORMULAIRES))('Le formulaire « %s »', (nom, forme) => {

  beforeEach(() => {
    document.body.innerHTML = forme.balisage;
  });

  it('n\'écrit qu\'une fois, même sur deux appuis', async () => {
    const { terminer } = ecritureLente();

    const premier = forme.enregistrer();
    await ecritureLancee();
    await forme.enregistrer();

    expect(dbPush, 'la seconde écriture est partie').toHaveBeenCalledTimes(1);

    terminer();
    await premier;
  });

  it('résiste à une rafale d\'appuis', async () => {
    const { terminer } = ecritureLente();

    const premier = forme.enregistrer();
    await ecritureLancee();
    await Promise.all([forme.enregistrer(), forme.enregistrer(), forme.enregistrer()]);

    expect(dbPush).toHaveBeenCalledTimes(1);

    terminer();
    await premier;
  });

  it('désactive son bouton et dit ce qui se passe', async () => {
    // Le verrou seul empêche la charge en double sans rien montrer : l'appui
    // ne produit rien, et ce silence est indiscernable d'une panne. C'est
    // d'ailleurs lui qui faisait appuyer une seconde fois.
    const { terminer } = ecritureLente();
    const bouton = document.getElementById(forme.bouton);

    const premier = forme.enregistrer();
    await ecritureLancee();

    expect(bouton.disabled).toBe(true);
    expect(bouton.textContent).toBe('Enregistrement…');

    terminer();
    await premier;

    expect(bouton.disabled).toBe(false);
    expect(bouton.textContent).toBe('Ajouter');
  });

  it('laisse repartir une seconde saisie une fois la première écrite', async () => {
    await forme.enregistrer();
    await forme.enregistrer();

    // Deux saisies distinctes restent deux écritures : le verrou protège d'un
    // double appui, pas de deux dépenses.
    expect(dbPush).toHaveBeenCalledTimes(2);
  });

  it('rouvre le formulaire quand l\'écriture échoue', async () => {
    // `dbPush` passe par `borner()`, qui rejette au bout du délai. Un verrou
    // qui ne se relâcherait qu'au succès condamnerait le formulaire pour le
    // reste de la session — hors ligne, précisément quand il faut saisir.
    dbPush.mockRejectedValueOnce(new Error('réseau'));
    await forme.enregistrer();

    const bouton = document.getElementById(forme.bouton);
    expect(bouton.disabled, 'le bouton est resté mort').toBe(false);

    dbPush.mockResolvedValue('cle-neuve');
    await forme.enregistrer();

    expect(dbPush).toHaveBeenCalledTimes(2);
  });
});

describe('Les formulaires ne s\'attendent pas les uns les autres', () => {
  it('une charge fixe en vol n\'empêche pas de saisir une charge variable', async () => {
    // Deux modales différentes n'ont pas à partager un verrou : la saisie
    // rapide ouverte pendant qu'une charge fixe part en base doit rester
    // utilisable.
    document.body.innerHTML = FORMULAIRES['charge fixe'].balisage
      + FORMULAIRES['charge variable'].balisage;

    // Seule la première écriture traîne : la seconde doit aboutir pendant
    // que la première est encore en vol, ce qui est tout l'objet du contrôle.
    let terminer;
    const enVol = new Promise(resolve => { terminer = () => resolve('cle-lente'); });
    dbPush.mockImplementationOnce(() => enVol);

    const fixe = saveFixedCharge();
    await ecritureLancee();
    await saveVariableCharge();

    expect(dbPush, 'la charge variable a été bloquée par la charge fixe')
      .toHaveBeenCalledTimes(2);

    terminer();
    await fixe;
  });
});
