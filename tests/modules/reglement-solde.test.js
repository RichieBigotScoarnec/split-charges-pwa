// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { REIMBURSEMENT_DIRECTIONS } from '../../public/js/config.js';
import { computeSummary } from '../../public/js/utils/calculations.js';

const dbPush = vi.fn(() => Promise.resolve('nouvelle-cle'));
/** L'instantané que la relecture obtiendra */
let INSTANTANE = { '2026-08': { variableCharges: { v1: { amount: 10 } } } };
const dbGet = vi.fn(chemin => Promise.resolve(chemin === 'periods' ? INSTANTANE : null));
/** La liaison est-elle rompue ? Remplaçable par test. */
let liaisonRompueMock = () => false;

vi.mock('../../public/js/db.js', () => ({
  dbPush,
  dbGet,
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve()),
  getDataPath: vi.fn(path => `household/${path}`),
  liaisonRompue: vi.fn(() => liaisonRompueMock())
}));

// Les collaborateurs de la relecture. Ce qui est vérifié ici, c'est qu'ils
// sont TOUS appelés, et tous sur le même instantané — pas ce qu'ils font.
const appliquerLesTermesDuMois = vi.fn();
const loadVariableCharges = vi.fn();
const loadFixedCharges = vi.fn();
const refreshCarryOver = vi.fn();
vi.mock('../../public/js/modules/period.js', () => ({ appliquerLesTermesDuMois }));
vi.mock('../../public/js/modules/variable-charges.js', () => ({ loadVariableCharges }));
vi.mock('../../public/js/modules/fixed-charges.js', () => ({ loadFixedCharges }));
vi.mock('../../public/js/modules/carry-over.js', () => ({ refreshCarryOver }));
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

let soldeCourant = 0;
vi.mock('../../public/js/modules/summary.js', () => ({
  calculateSummary: vi.fn(() => ({ balance: soldeCourant }))
}));

const { settleBalance } = await import('../../public/js/modules/reimbursements.js');
const { setState } = await import('../../public/js/state.js');
const { toast } = await import('../../public/js/components/toast.js');
const { showConfirmModal } = await import('../../public/js/components/modal.js');

/** Dernier remboursement transmis à la base */
const dernierEcrit = () => dbPush.mock.calls.at(-1)[1];

describe('Régler le solde d\'un mois', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showConfirmModal.mockResolvedValue(true);
    setState('currentPeriod', '2026-08');
    liaisonRompueMock = () => false;
    INSTANTANE = { '2026-08': { variableCharges: { v1: { amount: 10 } } } };
  });

  it('quand la conjointe doit de l\'argent, c\'est elle qui verse', async () => {
    soldeCourant = 500;
    await settleBalance();

    expect(dernierEcrit()).toMatchObject({
      direction: REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU,
      amount: 500
    });
  });

  it('quand c\'est vous qui devez, c\'est vous qui versez', async () => {
    soldeCourant = -320.5;
    await settleBalance();

    expect(dernierEcrit()).toMatchObject({
      direction: REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER,
      amount: 320.5
    });
  });

  it('le montant écrit est exactement le solde, au centime', async () => {
    soldeCourant = 412.337;
    await settleBalance();

    expect(dernierEcrit().amount).toBe(412.34);
  });

  it('des comptes déjà équilibrés n\'écrivent rien', async () => {
    soldeCourant = 0;
    await settleBalance();

    expect(dbPush).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalled();
  });

  it('un écart inférieur au centime n\'écrit rien non plus', async () => {
    // Un arrondi flottant résiduel ne doit pas produire une écriture de 0 €.
    soldeCourant = 0.004;
    await settleBalance();

    expect(dbPush).not.toHaveBeenCalled();
  });

  it('un refus de confirmation n\'écrit rien', async () => {
    soldeCourant = 500;
    showConfirmModal.mockResolvedValue(false);
    await settleBalance();

    expect(dbPush).not.toHaveBeenCalled();
  });

  it('sans période sélectionnée, rien n\'est écrit', async () => {
    soldeCourant = 500;
    setState('currentPeriod', null);
    await settleBalance();

    expect(dbPush).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});

/**
 * La relecture qui précède l'écriture
 *
 * Le geste promet en toutes lettres « le solde du mois reviendra à zéro ». Il
 * relisait pourtant les seuls remboursements avant d'écrire — un sixième de ce
 * dont le solde dépend. Une dépense saisie en face pendant que la confirmation
 * était à l'écran restait invisible, et le montant écrit était celui d'avant.
 *
 * Et il l'écrivait quand même : `amount` et `direction` étaient figés AVANT la
 * confirmation, si bien que la relecture ne servait qu'à détecter le cas où
 * tout était déjà soldé. Dans tous les autres, elle ne changeait rien.
 */
describe('Ce que le règlement relit avant d\'écrire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showConfirmModal.mockResolvedValue(true);
    setState('currentPeriod', '2026-08');
    liaisonRompueMock = () => false;
    INSTANTANE = { '2026-08': { variableCharges: { v1: { amount: 10 } } } };
  });

  it('tout ce dont le solde dépend, et d\'un seul instantané', async () => {
    soldeCourant = 500;
    await settleBalance();

    // Le mois affiché, tiré de l'instantané, va aux trois listes et aux termes.
    const mois = INSTANTANE['2026-08'];
    expect(appliquerLesTermesDuMois).toHaveBeenCalledWith(mois, null);
    expect(loadVariableCharges).toHaveBeenCalledWith(mois);
    expect(loadFixedCharges).toHaveBeenCalledWith(mois);
    // Le report dépend des mois précédents : il reçoit l'instantané entier.
    expect(refreshCarryOver).toHaveBeenCalledWith({
      historique: INSTANTANE, salairesGlobaux: null
    });

    // Deux lectures pour la relecture entière, pas une par collaborateur.
    const lus = dbGet.mock.calls.map(c => c[0]);
    expect(lus.filter(c => c === 'periods')).toHaveLength(1);
    expect(lus.filter(c => c === 'salaries')).toHaveLength(1);
    // La seule autre lecture est celle qui suit l'écriture : le remboursement
    // qu'on vient de pousser n'est dans aucun instantané pris avant lui.
    expect(lus.filter(c => c !== 'periods' && c !== 'salaries'))
      .toEqual(['periods/2026-08/reimbursements']);
  });

  it('TÉMOIN NÉGATIF : le montant d\'avant la confirmation n\'est plus celui qu\'on écrit', async () => {
    // L'autre personne saisit une dépense pendant que la modale est ouverte :
    // le solde passe de 500 à 180. L'ancien code écrivait 500 — le mois
    // restait déséquilibré de 320 €, après avoir promis zéro.
    soldeCourant = 500;
    showConfirmModal.mockImplementation(async () => {
      soldeCourant = 180;
      return true;
    });

    await settleBalance();

    expect(dbPush, 'un montant que personne n\'a validé a été écrit')
      .not.toHaveBeenCalled();
    // Et on dit lequel, pour qu'un second appui règle le bon.
    expect(toast.warning.mock.calls.at(-1)[0]).toContain('180');
  });

  it('un solde qui a changé de SENS n\'est pas écrit non plus', async () => {
    soldeCourant = 500;
    showConfirmModal.mockImplementation(async () => {
      soldeCourant = -500;
      return true;
    });

    await settleBalance();

    // Même montant, sens inverse : verser dans le mauvais sens double l'écart.
    expect(dbPush).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalled();
  });

  it('un solde inchangé s\'écrit, au centime près', async () => {
    soldeCourant = 412.337;
    await settleBalance();

    expect(dbPush.mock.calls.at(-1)[1]).toMatchObject({
      amount: 412.34,
      direction: REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU
    });
  });

  it('un solde réglé en face pendant la confirmation ne produit rien', async () => {
    soldeCourant = 500;
    showConfirmModal.mockImplementation(async () => {
      soldeCourant = 0;
      return true;
    });

    await settleBalance();

    expect(dbPush).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalled();
  });
});

/**
 * Hors ligne, la vérification est impossible — donc la promesse aussi
 *
 * `dbGet` ne lève pas quand la liaison est rompue : il sert le miroir. La
 * relecture rendrait donc les valeurs de la dernière connexion, et le « solde
 * vérifié » n'aurait rien vérifié. Pire, `dbPush` met l'écriture en file et
 * rend la main : l'application annoncerait « Solde réglé » pour un règlement
 * qui partira plus tard, calculé sur un solde périmé.
 */
describe('Régler hors ligne', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showConfirmModal.mockResolvedValue(true);
    setState('currentPeriod', '2026-08');
    INSTANTANE = { '2026-08': { variableCharges: { v1: { amount: 10 } } } };
  });

  it('refuse avant même de faire confirmer', async () => {
    soldeCourant = 500;
    liaisonRompueMock = () => true;

    await settleBalance();

    expect(showConfirmModal, 'on a fait confirmer un geste qu\'on refuse')
      .not.toHaveBeenCalled();
    expect(dbPush).not.toHaveBeenCalled();
    expect(toast.error.mock.calls.at(-1)[0]).toContain('hors ligne');
  });

  it('refuse aussi quand la liaison se rompt PENDANT la confirmation', async () => {
    // C'est le contrôle qui décide : le premier n'est qu'une courtoisie.
    soldeCourant = 500;
    let rompue = false;
    liaisonRompueMock = () => rompue;
    showConfirmModal.mockImplementation(async () => {
      rompue = true;
      return true;
    });

    await settleBalance();

    expect(dbPush).not.toHaveBeenCalled();
    expect(toast.error.mock.calls.at(-1)[0]).toContain('hors ligne');
  });

  it('les deux refus disent la même chose', async () => {
    soldeCourant = 500;

    liaisonRompueMock = () => true;
    await settleBalance();
    const avant = toast.error.mock.calls.at(-1)[0];

    let rompue = false;
    liaisonRompueMock = () => rompue;
    showConfirmModal.mockImplementation(async () => { rompue = true; return true; });
    await settleBalance();
    const apres = toast.error.mock.calls.at(-1)[0];

    expect(apres).toBe(avant);
  });
});

/**
 * Le test qui compte vraiment : le règlement doit ramener le solde à zéro.
 *
 * Il ne vérifie pas une valeur écrite mais la conséquence de cette écriture,
 * en repassant par le vrai moteur de calcul. Un tel test aurait suffi à
 * détecter l'inversion de signe des remboursements corrigée en amont : avec
 * l'ancienne convention, régler un solde de 500 l'aurait porté à 1000.
 */
describe('Après règlement, les comptes sont soldés', () => {
  /** @returns {Object} Un mois où vous avez payé 1000 € pour des salaires égaux */
  const moisDesequilibre = (payeur) => ({
    salaries: { vous: 2000, conjointe: 2000 },
    fixedCharges: [{ id: 'f1', amount: 1000, paidBy: payeur, deleted: false }],
    variableCharges: [],
    reimbursements: [],
    shareMode: 'prorata',
    customPercents: { vous: 50, conjointe: 50 }
  });

  it.each([
    ['vous', 'vous'],
    ['conjointe', 'conjointe']
  ])('quand %s avance la totalité, le règlement ramène le solde à zéro', (payeur) => {
    const mois = moisDesequilibre(payeur);
    const { balance } = computeSummary(mois);

    // Le déséquilibre doit être réel, sinon le test ne prouve rien
    expect(Math.abs(balance)).toBeCloseTo(500);

    // Même règle de décision que settleBalance
    const direction = balance > 0
      ? REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU
      : REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER;

    const apres = computeSummary({
      ...mois,
      reimbursements: [{ id: 'r1', amount: Math.abs(balance), direction, deleted: false }]
    });

    expect(apres.balance).toBeCloseTo(0, 5);
  });
});
