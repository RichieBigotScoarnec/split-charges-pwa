import { describe, it, expect } from 'vitest';
import { computeBalanceChain, computeSummary } from '../../public/js/utils/calculations.js';
import { REIMBURSEMENT_DIRECTIONS } from '../../public/js/config.js';

/**
 * Report du solde entre mois.
 *
 * Sans report, un mois non soldé s'évapore : août se termine avec 500 € dus,
 * septembre repart de zéro et la dette n'apparaît plus nulle part.
 */

const CONTEXTE = {
  shareMode: 'prorata',
  customPercents: { vous: 50, conjointe: 50 },
  globalSalaries: { vous: 2000, conjointe: 2000 }
};

/**
 * Construit un mois où une seule personne avance une charge.
 * Salaires égaux : l'autre lui doit donc la moitié.
 * @param {number} montant - Montant de la charge
 * @param {string} payeur - 'vous' ou 'conjointe'
 * @returns {Object} Un nœud de période tel que stocké en base
 */
const mois = (montant, payeur) => ({
  salaries: { vous: 2000, conjointe: 2000 },
  variableCharges: {
    'cle-poussee': { amount: montant, paidBy: payeur, description: 'Charge', deleted: false }
  }
});

describe('Chaîne des soldes cumulés', () => {
  it('un seul mois : le report est nul, le total vaut le solde propre', () => {
    const chain = computeBalanceChain({ '2026-06': mois(1000, 'vous') }, CONTEXTE);

    expect(chain.get('2026-06')).toEqual({ own: 500, carry: 0, total: 500 });
  });

  it('trois mois non réglés s\'additionnent', () => {
    const chain = computeBalanceChain({
      '2026-06': mois(1000, 'vous'),
      '2026-07': mois(400, 'vous'),
      '2026-08': mois(200, 'vous')
    }, CONTEXTE);

    expect(chain.get('2026-06').total).toBeCloseTo(500);
    expect(chain.get('2026-07')).toMatchObject({ own: 200, carry: 500 });
    expect(chain.get('2026-07').total).toBeCloseTo(700);
    expect(chain.get('2026-08')).toMatchObject({ own: 100, carry: 700 });
    expect(chain.get('2026-08').total).toBeCloseTo(800);
  });

  it('des dettes de sens opposés se compensent', () => {
    const chain = computeBalanceChain({
      '2026-06': mois(1000, 'vous'),      // elle vous doit 500
      '2026-07': mois(600, 'conjointe')   // vous lui devez 300
    }, CONTEXTE);

    expect(chain.get('2026-07').total).toBeCloseTo(200);
  });

  it('l\'ordre des clés en base n\'influe pas sur le cumul', () => {
    // Realtime Database ne garantit aucun ordre d'itération : la chaîne doit
    // trier elle-même, sinon le cumul suit l'ordre d'insertion.
    const desordre = computeBalanceChain({
      '2026-08': mois(200, 'vous'),
      '2026-06': mois(1000, 'vous'),
      '2026-07': mois(400, 'vous')
    }, CONTEXTE);

    expect(desordre.get('2026-08')).toMatchObject({ carry: 700, total: 800 });
  });

  it('un mois réglé remet la chaîne à zéro pour la suite', () => {
    const chain = computeBalanceChain({
      '2026-06': mois(1000, 'vous'),
      '2026-07': {
        ...mois(0, 'vous'),
        salaries: { vous: 2000, conjointe: 2000 },
        variableCharges: {},
        // Elle solde les 500 € du mois de juin
        reimbursements: {
          'r1': { amount: 500, direction: REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU, deleted: false }
        }
      },
      '2026-08': mois(100, 'vous')
    }, CONTEXTE);

    expect(chain.get('2026-07').total).toBeCloseTo(0);
    expect(chain.get('2026-08')).toMatchObject({ carry: 0 });
    expect(chain.get('2026-08').total).toBeCloseTo(50);
  });

  it('les clés hors format AAAA-MM sont écartées du cumul', () => {
    // Le nœud periods a hébergé des écritures accidentelles sous
    // `periods/undefined` : elles ne doivent pas fausser la chaîne.
    const chain = computeBalanceChain({
      'undefined': mois(9999, 'vous'),
      '2026-13': mois(9999, 'vous'),
      'salaries': { vous: 1, conjointe: 1 },
      '2026-06': mois(1000, 'vous')
    }, CONTEXTE);

    expect(chain.size).toBe(1);
    expect(chain.get('2026-06').total).toBeCloseTo(500);
  });

  it('un mois sans instantané de salaires retombe sur les salaires courants', () => {
    const chain = computeBalanceChain({
      '2026-06': { variableCharges: { k: { amount: 1000, paidBy: 'vous', deleted: false } } }
    }, CONTEXTE);

    expect(chain.get('2026-06').own).toBeCloseTo(500);
  });

  it('un mois sans salaires exploitables ne casse pas la chaîne', () => {
    const chain = computeBalanceChain({
      '2026-06': mois(1000, 'vous'),
      '2026-07': { salaries: { vous: 0, conjointe: 0 }, variableCharges: {} },
      '2026-08': mois(100, 'vous')
    }, { ...CONTEXTE, globalSalaries: null });

    // Le mois sans salaires ne produit aucun solde propre, mais laisse
    // passer la dette antérieure au lieu de l'effacer.
    expect(chain.get('2026-07')).toMatchObject({ own: 0, carry: 500, total: 500 });
    expect(chain.get('2026-08').carry).toBeCloseTo(500);
  });

  it('une base vide ou absente donne une chaîne vide', () => {
    expect(computeBalanceChain(null, CONTEXTE).size).toBe(0);
    expect(computeBalanceChain({}, CONTEXTE).size).toBe(0);
    expect(computeBalanceChain('pas un objet', CONTEXTE).size).toBe(0);
  });

  it('les charges supprimées ne comptent pas dans le cumul', () => {
    const chain = computeBalanceChain({
      '2026-06': {
        salaries: { vous: 2000, conjointe: 2000 },
        variableCharges: {
          a: { amount: 1000, paidBy: 'vous', deleted: false },
          b: { amount: 5000, paidBy: 'vous', deleted: true }
        }
      }
    }, CONTEXTE);

    expect(chain.get('2026-06').total).toBeCloseTo(500);
  });
});

describe('Report appliqué au bilan d\'un mois', () => {
  const base = {
    salaries: { vous: 2000, conjointe: 2000 },
    fixedCharges: [],
    variableCharges: [{ id: 'v1', amount: 1000, paidBy: 'vous', deleted: false }],
    reimbursements: [],
    shareMode: 'prorata',
    customPercents: { vous: 50, conjointe: 50 }
  };

  it('sans report, le comportement est inchangé', () => {
    // Le paramètre est optionnel : son absence doit valoir zéro.
    expect(computeSummary(base).balance).toBeCloseTo(500);
    expect(computeSummary(base).carryOver).toBe(0);
  });

  it('le report s\'ajoute au solde propre du mois', () => {
    const avec = computeSummary({ ...base, carryOver: 300 });

    expect(avec.ownBalance).toBeCloseTo(500);
    expect(avec.carryOver).toBe(300);
    expect(avec.balance).toBeCloseTo(800);
  });

  it('un report de sens opposé réduit le solde', () => {
    expect(computeSummary({ ...base, carryOver: -200 }).balance).toBeCloseTo(300);
  });

  it('régler un mois reporté ramène le total à zéro', () => {
    // Le test de bouclage : le règlement porte sur le solde affiché, report
    // compris. C'est ce qui garantit qu'on ne solde pas seulement le mois
    // courant en laissant l'ardoise du passé.
    const avec = computeSummary({ ...base, carryOver: 300 });
    expect(avec.balance).toBeCloseTo(800);

    const direction = avec.balance > 0
      ? REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU
      : REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER;

    const apres = computeSummary({
      ...base,
      carryOver: 300,
      reimbursements: [{ id: 'r1', amount: Math.abs(avec.balance), direction, deleted: false }]
    });

    expect(apres.balance).toBeCloseTo(0, 5);
  });
});
