// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Une charge est rangée dans le mois de sa date
 *
 * Signalé en usage le 2026-09-01 : « j'ai mis une charge en septembre et elle
 * a été mise en juillet ». Ce n'était pas un défaut d'affichage — le total de
 * juillet incluait 45 € dépensés en septembre, et le solde entre les deux
 * personnes du foyer était faux d'autant.
 *
 * Le mécanisme tenait à deux valeurs qui vivaient séparément, sans que rien ne
 * les compare : le formulaire pré-remplit la date du JOUR, et l'écriture visait
 * le mois AFFICHÉ. Consulter juillet suffisait.
 *
 * `tests/utils/periode-de-la-date.test.js` couvre le calcul. Ici, le parcours :
 * où la charge est réellement écrite, et ce qui est dit à l'écran.
 */

const dbPush = vi.fn(() => Promise.resolve('cle-neuve'));
const dbUpdate = vi.fn(() => Promise.resolve());
const succes = vi.fn();

vi.mock('../../public/js/db.js', () => ({
  dbPush,
  dbUpdate,
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  getDataPath: vi.fn(path => `household/${path}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: succes, error: vi.fn(), info: vi.fn(), warning: vi.fn() }
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

/** Le formulaire de charge variable, tel que le livre FairSplit.html */
const formulaire = `
  <input type="hidden" id="variableChargeId" value="" />
  <input id="variableChargeDescription" value="Festival" />
  <input id="variableChargeAmount" value="45" />
  <input type="date" id="variableChargeDate" value="" />
  <input type="time" id="variableChargeHeure" value="" />
  <select id="variableChargeCategory"><option value="Loisirs" selected>Loisirs</option></select>
  <select id="variableChargePaidBy"><option value="vous" selected>Vous</option></select>
  <select id="variableChargeEnvelope"><option value="" selected></option></select>
  <input type="checkbox" id="variableChargeSplitToggle" />
  <div id="variableChargeSplitOptions"></div>
  <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
`;

/** Le formulaire de charge fixe */
const formulaireFixe = `
  <input type="hidden" id="fixedChargeId" value="" />
  <input id="fixedChargeDescription" value="Loyer" />
  <input id="fixedChargeAmount" value="900" />
  <input type="date" id="fixedChargeDate" value="" />
  <select id="fixedChargeCategory"><option value="Maison" selected>Maison</option></select>
  <select id="fixedChargePaidBy"><option value="vous" selected>Vous</option></select>
  <select id="fixedChargeDestination"><option value="" selected></option></select>
  <select id="fixedChargeEnvelope"><option value="" selected></option></select>
  <input type="checkbox" id="fixedChargeRecurring" checked />
  <input type="checkbox" id="fixedChargeSplitToggle" />
  <div id="fixedChargeSplitOptions"></div>
  <div id="fixedChargesList"></div><span id="fixedChargesTotal"></span>
`;

/** Le formulaire de remboursement */
const formulaireRemboursement = `
  <form id="reimbursementForm">
    <input type="hidden" id="reimbursementId" value="" />
    <select id="reimbursementDirection"><option value="conjointe-vers-vous" selected>Elle → vous</option></select>
    <input type="text" id="reimbursementAmount" value="50" />
    <input type="date" id="reimbursementDate" value="" />
    <input type="text" id="reimbursementNote" value="Courses" />
  </form>
  <div id="reimbursementsList"></div><span id="reimbursementsTotal"></span>
`;

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  document.body.innerHTML = formulaire;
});

/** Le chemin visé par la dernière écriture */
const dernierChemin = () => dbPush.mock.calls.at(-1)[0];

describe('Le mois d\'arrivée suit la date, pas l\'écran', () => {
  it('LE CAS RÉEL — consulter juillet, saisir le 1er septembre', async () => {
    setState('currentPeriod', '2026-07');
    document.getElementById('variableChargeDate').value = '2026-09-01';

    await saveVariableCharge();

    // Avant le correctif : `periods/2026-07/variableCharges`.
    expect(dernierChemin()).toBe('periods/2026-09/variableCharges');
  });

  it('et l\'écran nomme le mois où elle est partie', async () => {
    setState('currentPeriod', '2026-07');
    document.getElementById('variableChargeDate').value = '2026-09-01';

    await saveVariableCharge();

    // Sans ce mot, la charge semblerait ne s'être enregistrée nulle part : la
    // liste affichée est celle de juillet, elle n'y paraîtra pas.
    const message = succes.mock.calls.at(-1)[0];
    expect(message).toMatch(/septembre 2026/i);
  });

  it('le mois affiché reste le mois d\'arrivée quand la date y appartient', async () => {
    setState('currentPeriod', '2026-09');
    document.getElementById('variableChargeDate').value = '2026-09-15';

    await saveVariableCharge();

    expect(dernierChemin()).toBe('periods/2026-09/variableCharges');
    // Rien à annoncer : le cas de loin le plus fréquent doit rester silencieux.
    expect(succes.mock.calls.at(-1)[0]).toBe('Charge ajoutée');
  });

  it('une date d\'un mois passé range la charge dans ce mois', async () => {
    // Le sens inverse : régulariser en septembre une dépense de fin août.
    setState('currentPeriod', '2026-09');
    document.getElementById('variableChargeDate').value = '2026-08-30';

    await saveVariableCharge();

    expect(dernierChemin()).toBe('periods/2026-08/variableCharges');
  });

  it('une date illisible retombe sur le mois affiché, sans rien inventer', async () => {
    setState('currentPeriod', '2026-09');
    document.getElementById('variableChargeDate').value = '';

    await saveVariableCharge();

    // Le champ vide prend le jour courant en amont ; le repli sur le mois
    // affiché ne sert qu'aux valeurs que `periodeDeLaDate` refuse.
    expect(dernierChemin()).toMatch(/^periods\/\d{4}-\d{2}\/variableCharges$/);
  });

  it('LA MÊME RÈGLE POUR UN REMBOURSEMENT — il pèse sur le solde', async () => {
    // Un versement rangé dans le mauvais mois fausse DEUX soldes : celui qu'il
    // quitte et celui qu'il n'a pas rejoint.
    document.body.innerHTML = formulaireRemboursement;
    setState('currentPeriod', '2026-07');
    document.getElementById('reimbursementDate').value = '2026-09-01';

    await saveReimbursement();

    expect(dernierChemin()).toBe('periods/2026-09/reimbursements');
  });

  it('LA MÊME RÈGLE POUR UNE CHARGE FIXE', async () => {
    // `reconduction.js` tient déjà cet invariant à chaque report — il redate la
    // charge « pour éviter une charge qui dit appartenir à un mois où elle ne
    // figure pas ». La création ne le tenait pas.
    document.body.innerHTML = formulaireFixe;
    setState('currentPeriod', '2026-07');
    document.getElementById('fixedChargeDate').value = '2026-09-05';

    await saveFixedCharge();

    expect(dernierChemin()).toBe('periods/2026-09/fixedCharges');
  });

  it('et la date saisie n\'est jamais réécrite pour entrer dans le mois', async () => {
    // Le report REDATE, parce qu'il recopie une charge qui revient vraiment.
    // La création, non : la date est ce que la personne a déclaré.
    document.body.innerHTML = formulaireFixe;
    setState('currentPeriod', '2026-07');
    document.getElementById('fixedChargeDate').value = '2026-09-05';

    await saveFixedCharge();

    expect(dbPush.mock.calls.at(-1)[1].date).toBe('2026-09-05');
  });

  it('l\'édition ne déplace pas la charge — limite assumée', async () => {
    document.body.innerHTML = formulaire;
    // Deux écritures non atomiques la dupliqueraient ou la perdraient. La
    // charge reste où elle est ; c'est écrit dans le module.
    setState('currentPeriod', '2026-07');
    document.getElementById('variableChargeId').value = 'cle-existante';
    document.getElementById('variableChargeDate').value = '2026-09-01';

    await saveVariableCharge();

    expect(dbPush).not.toHaveBeenCalled();
    expect(dbUpdate.mock.calls.at(-1)[0]).toBe('periods/2026-07/variableCharges/cle-existante');
  });
});
