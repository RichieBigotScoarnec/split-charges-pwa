// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { REIMBURSEMENT_DIRECTIONS } from '../../public/js/config.js';
import { computeSummary } from '../../public/js/utils/calculations.js';

const dbPush = vi.fn(() => Promise.resolve('nouvelle-cle'));

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
