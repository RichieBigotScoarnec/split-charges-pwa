import { describe, it, expect } from 'vitest';
import {
  calculateChargeShares,
  calculateJointPayment,
  computeSummary,
  computeVirementsByDestination
} from '../public/js/utils/calculations.js';

// ===== Helpers =====
const salaries = { vous: 3000, conjointe: 2000 };
const totalSalaries = 5000;
const customPercents = { vous: 50, conjointe: 50 };

function makeCharge(overrides = {}) {
  return {
    amount: 100,
    paidBy: 'vous',
    splitOverride: null,
    deleted: false,
    description: 'Test',
    category: 'autre',
    ...overrides
  };
}

// ===== calculateChargeShares =====
describe('calculateChargeShares', () => {
  it('prorata : répartit selon les salaires', () => {
    const charge = makeCharge({ amount: 500 });
    const result = calculateChargeShares(charge, 'prorata', salaries, totalSalaries, customPercents);
    expect(result.yourShare).toBeCloseTo(300); // 3000/5000 * 500
    expect(result.partnerShare).toBeCloseTo(200); // 2000/5000 * 500
  });

  it('50-50 : répartit moitié-moitié', () => {
    const charge = makeCharge({ amount: 200 });
    const result = calculateChargeShares(charge, '50-50', salaries, totalSalaries, customPercents);
    expect(result.yourShare).toBe(100);
    expect(result.partnerShare).toBe(100);
  });

  it('custom global : utilise les pourcentages globaux', () => {
    const charge = makeCharge({ amount: 200 });
    const custom = { vous: 70, conjointe: 30 };
    const result = calculateChargeShares(charge, 'custom', salaries, totalSalaries, custom);
    expect(result.yourShare).toBeCloseTo(140);
    expect(result.partnerShare).toBeCloseTo(60);
  });

  it('splitOverride 50-50 sur charge en mode prorata global', () => {
    const charge = makeCharge({
      amount: 400,
      splitOverride: { mode: '50-50' }
    });
    const result = calculateChargeShares(charge, 'prorata', salaries, totalSalaries, customPercents);
    expect(result.yourShare).toBe(200);
    expect(result.partnerShare).toBe(200);
  });

  it('splitOverride custom sur charge en mode prorata global', () => {
    const charge = makeCharge({
      amount: 1000,
      splitOverride: { mode: 'custom', vous: 80, conjointe: 20 }
    });
    const result = calculateChargeShares(charge, 'prorata', salaries, totalSalaries, customPercents);
    expect(result.yourShare).toBe(800);
    expect(result.partnerShare).toBe(200);
  });

  it('splitOverride custom avec valeurs manquantes : fallback vers customPercents', () => {
    const charge = makeCharge({
      amount: 100,
      splitOverride: { mode: 'custom' } // pas de vous/conjointe
    });
    const custom = { vous: 60, conjointe: 40 };
    const result = calculateChargeShares(charge, 'prorata', salaries, totalSalaries, custom);
    expect(result.yourShare).toBeCloseTo(60);
    expect(result.partnerShare).toBeCloseTo(40);
  });

  it('prorata avec salaires égaux = 50-50', () => {
    const equalSalaries = { vous: 2500, conjointe: 2500 };
    const charge = makeCharge({ amount: 200 });
    const result = calculateChargeShares(charge, 'prorata', equalSalaries, 5000, customPercents);
    expect(result.yourShare).toBe(100);
    expect(result.partnerShare).toBe(100);
  });

  it('prorata avec totalSalaries = 0 : fallback 50-50', () => {
    const charge = makeCharge({ amount: 200 });
    const result = calculateChargeShares(charge, 'prorata', { vous: 0, conjointe: 0 }, 0, customPercents);
    expect(result.yourShare).toBe(100);
    expect(result.partnerShare).toBe(100);
  });
});

// ===== calculateJointPayment =====
describe('calculateJointPayment', () => {
  it('joint prorata : répartit selon les salaires', () => {
    const charge = makeCharge({ amount: 1000, paidBy: 'joint' });
    const result = calculateJointPayment(charge, 'prorata', salaries, totalSalaries, customPercents);
    expect(result.yourPayment).toBeCloseTo(600);
    expect(result.partnerPayment).toBeCloseTo(400);
  });

  it('joint 50-50 : moitié chacun', () => {
    const charge = makeCharge({ amount: 500, paidBy: 'joint' });
    const result = calculateJointPayment(charge, '50-50', salaries, totalSalaries, customPercents);
    expect(result.yourPayment).toBe(250);
    expect(result.partnerPayment).toBe(250);
  });

  it('joint avec splitOverride custom : utilise les % de la charge', () => {
    const charge = makeCharge({
      amount: 1000,
      paidBy: 'joint',
      splitOverride: { mode: 'custom', vous: 30, conjointe: 70 }
    });
    const result = calculateJointPayment(charge, 'prorata', salaries, totalSalaries, customPercents);
    expect(result.yourPayment).toBe(300);
    expect(result.partnerPayment).toBe(700);
  });
});

// ===== computeSummary =====
describe('computeSummary', () => {
  const baseParams = {
    salaries,
    fixedCharges: [],
    variableCharges: [],
    reimbursements: [],
    shareMode: 'prorata',
    customPercents
  };

  it('retourne zéro si salaires = 0', () => {
    const result = computeSummary({
      ...baseParams,
      salaries: { vous: 0, conjointe: 0 }
    });
    expect(result).toEqual({ total: 0, yourShare: 0, partnerShare: 0, balance: 0 });
  });

  it('sans charges : tout à zéro', () => {
    const result = computeSummary(baseParams);
    expect(result.total).toBe(0);
    expect(result.yourShare).toBe(0);
    expect(result.partnerShare).toBe(0);
    expect(result.balance).toBe(0);
  });

  it('une charge payée par vous en prorata', () => {
    const result = computeSummary({
      ...baseParams,
      variableCharges: [makeCharge({ amount: 500, paidBy: 'vous' })]
    });
    expect(result.total).toBe(500);
    expect(result.yourShare).toBeCloseTo(300); // 60% de 500
    expect(result.partnerShare).toBeCloseTo(200); // 40% de 500
    // Vous avez payé 500, votre part est 300 → solde +200 (conjointe vous doit)
    expect(result.balance).toBeCloseTo(200);
  });

  it('une charge payée par conjointe en prorata', () => {
    const result = computeSummary({
      ...baseParams,
      variableCharges: [makeCharge({ amount: 500, paidBy: 'conjointe' })]
    });
    expect(result.total).toBe(500);
    // Vous avez payé 0, votre part est 300 → solde -300 (vous devez)
    expect(result.balance).toBeCloseTo(-300);
  });

  it('charge joint en prorata : solde = 0', () => {
    const result = computeSummary({
      ...baseParams,
      fixedCharges: [makeCharge({ amount: 1000, paidBy: 'joint' })]
    });
    expect(result.total).toBe(1000);
    // Joint : chacun "paie" selon son ratio → payé == théorique → solde 0
    expect(result.balance).toBeCloseTo(0);
  });

  it('charge joint avec splitOverride différent du mode global', () => {
    // Mode global prorata (60/40) mais cette charge est 50-50
    const result = computeSummary({
      ...baseParams,
      fixedCharges: [makeCharge({
        amount: 1000,
        paidBy: 'joint',
        splitOverride: { mode: '50-50' }
      })]
    });
    // Théorique : 500/500 (50-50 via override)
    // Joint payment : 500/500 (50-50 via override)
    // Solde = 500 - 500 = 0
    expect(result.balance).toBeCloseTo(0);
  });

  it('filtre les charges supprimées', () => {
    const result = computeSummary({
      ...baseParams,
      variableCharges: [
        makeCharge({ amount: 100, paidBy: 'vous' }),
        makeCharge({ amount: 200, paidBy: 'vous', deleted: true })
      ]
    });
    expect(result.total).toBe(100); // seule la charge non supprimée
  });

  it('remboursement vous→conjointe réduit le solde', () => {
    const result = computeSummary({
      ...baseParams,
      variableCharges: [makeCharge({ amount: 500, paidBy: 'vous' })],
      reimbursements: [{
        amount: 100,
        direction: 'vous-to-conjointe',
        deleted: false
      }]
    });
    // Sans remboursement : solde = +200
    // Remboursement de 100 : solde = 200 - 100 = +100
    expect(result.balance).toBeCloseTo(100);
    expect(result.reimbursementAdjustment).toBe(-100);
  });

  it('remboursement conjointe→vous augmente le solde', () => {
    const result = computeSummary({
      ...baseParams,
      variableCharges: [makeCharge({ amount: 500, paidBy: 'conjointe' })],
      reimbursements: [{
        amount: 50,
        direction: 'conjointe-to-vous',
        deleted: false
      }]
    });
    // Sans remboursement : solde = -300
    // Remboursement de 50 : solde = -300 + 50 = -250
    expect(result.balance).toBeCloseTo(-250);
    expect(result.reimbursementAdjustment).toBe(50);
  });

  it('mix charges fixes et variables avec splitOverrides différents', () => {
    const result = computeSummary({
      ...baseParams,
      shareMode: 'prorata',
      fixedCharges: [
        makeCharge({ amount: 1000, paidBy: 'vous', splitOverride: { mode: '50-50' } }),
        makeCharge({ amount: 500, paidBy: 'conjointe' }) // prorata global
      ],
      variableCharges: [
        makeCharge({ amount: 200, paidBy: 'vous', splitOverride: { mode: 'custom', vous: 30, conjointe: 70 } })
      ]
    });

    expect(result.total).toBe(1700);

    // Charge 1 (1000, 50-50) : vous=500, conjointe=500
    // Charge 2 (500, prorata) : vous=300, conjointe=200
    // Charge 3 (200, custom 30/70) : vous=60, conjointe=140
    expect(result.yourShare).toBeCloseTo(860);
    expect(result.partnerShare).toBeCloseTo(840);

    // Payé : vous=1200 (1000+200), conjointe=500
    // Balance : 1200 - 860 = +340
    expect(result.balance).toBeCloseTo(340);
  });

  it('mode 50-50 global sans override', () => {
    const result = computeSummary({
      ...baseParams,
      shareMode: '50-50',
      variableCharges: [makeCharge({ amount: 600, paidBy: 'vous' })]
    });
    expect(result.yourShare).toBe(300);
    expect(result.partnerShare).toBe(300);
    expect(result.balance).toBe(300); // payé 600 - part 300
  });
});

// ===== computeVirementsByDestination =====
describe('computeVirementsByDestination', () => {
  const params = { shareMode: 'prorata', salaries, totalSalaries, customPercents };

  it('retourne vide si pas de charges', () => {
    const result = computeVirementsByDestination([], params);
    expect(result).toEqual([]);
  });

  it('ignore les charges sans destination', () => {
    const charges = [makeCharge({ destination: '' })];
    const result = computeVirementsByDestination(charges, params);
    expect(result).toEqual([]);
  });

  it('groupe les charges par destination', () => {
    const charges = [
      makeCharge({ amount: 500, destination: 'Env. Charges Fixes', description: 'Loyer' }),
      makeCharge({ amount: 200, destination: 'Env. Charges Fixes', description: 'Électricité' }),
      makeCharge({ amount: 100, destination: 'Compte Joint', description: 'Internet' })
    ];
    const result = computeVirementsByDestination(charges, params);

    expect(result).toHaveLength(2);

    // Trié par total décroissant
    const envGroup = result.find(g => g.destination === 'Env. Charges Fixes');
    const jointGroup = result.find(g => g.destination === 'Compte Joint');

    // Part conjointe prorata (40%) : 500*0.4=200, 200*0.4=80 → total 280
    expect(envGroup.total).toBeCloseTo(280);
    expect(envGroup.charges).toHaveLength(2);

    // Part conjointe prorata (40%) : 100*0.4=40
    expect(jointGroup.total).toBeCloseTo(40);
  });

  it('splitOverride 50-50 sur une charge groupée', () => {
    const charges = [
      makeCharge({
        amount: 1000,
        destination: 'Env. Charges Fixes',
        splitOverride: { mode: '50-50' }
      })
    ];
    const result = computeVirementsByDestination(charges, params);
    expect(result[0].total).toBe(500); // 50% conjointe
  });

  it('splitOverride custom sur une charge groupée', () => {
    const charges = [
      makeCharge({
        amount: 1000,
        destination: 'Test',
        splitOverride: { mode: 'custom', vous: 80, conjointe: 20 }
      })
    ];
    const result = computeVirementsByDestination(charges, params);
    expect(result[0].total).toBe(200); // 20% conjointe
  });

  it('trie par total décroissant', () => {
    const charges = [
      makeCharge({ amount: 100, destination: 'Petit' }),
      makeCharge({ amount: 1000, destination: 'Grand' })
    ];
    const result = computeVirementsByDestination(charges, params);
    expect(result[0].destination).toBe('Grand');
    expect(result[1].destination).toBe('Petit');
  });
});

// ===== Edge Cases =====
describe('Edge Cases', () => {
  it('charge de montant 0', () => {
    const result = computeSummary({
      salaries,
      fixedCharges: [makeCharge({ amount: 0, paidBy: 'vous' })],
      variableCharges: [],
      reimbursements: [],
      shareMode: 'prorata',
      customPercents
    });
    expect(result.total).toBe(0);
    expect(result.balance).toBe(0);
  });

  it('un seul salaire (conjointe = 0)', () => {
    const soloSalaries = { vous: 3000, conjointe: 0 };
    const result = computeSummary({
      salaries: soloSalaries,
      fixedCharges: [],
      variableCharges: [makeCharge({ amount: 1000, paidBy: 'vous' })],
      reimbursements: [],
      shareMode: 'prorata',
      customPercents
    });
    // Prorata : vous payez 100% (3000/3000)
    expect(result.yourShare).toBe(1000);
    expect(result.partnerShare).toBe(0);
    expect(result.balance).toBe(0); // payé 1000, part 1000
  });

  it('très grands montants (précision float)', () => {
    const result = computeSummary({
      salaries,
      fixedCharges: [makeCharge({ amount: 99999.99, paidBy: 'vous' })],
      variableCharges: [],
      reimbursements: [],
      shareMode: 'prorata',
      customPercents
    });
    expect(result.total).toBeCloseTo(99999.99, 2);
    expect(result.yourShare + result.partnerShare).toBeCloseTo(99999.99, 2);
  });

  it('nombreuses charges : total cohérent', () => {
    const charges = Array.from({ length: 50 }, (_, i) =>
      makeCharge({ amount: 10 + i, paidBy: i % 3 === 0 ? 'vous' : i % 3 === 1 ? 'conjointe' : 'joint' })
    );
    const result = computeSummary({
      salaries,
      fixedCharges: charges,
      variableCharges: [],
      reimbursements: [],
      shareMode: 'prorata',
      customPercents
    });
    const expectedTotal = charges.reduce((s, c) => s + c.amount, 0);
    expect(result.total).toBeCloseTo(expectedTotal);
    expect(result.yourShare + result.partnerShare).toBeCloseTo(expectedTotal, 1);
  });

  it('remboursement supprimé est ignoré', () => {
    const result = computeSummary({
      salaries,
      fixedCharges: [],
      variableCharges: [makeCharge({ amount: 500, paidBy: 'vous' })],
      reimbursements: [
        { amount: 100, direction: 'vous-to-conjointe', deleted: true },
        { amount: 50, direction: 'vous-to-conjointe', deleted: false }
      ],
      shareMode: 'prorata',
      customPercents
    });
    // Seul le remboursement de 50 non supprimé est comptabilisé
    expect(result.reimbursementAdjustment).toBe(-50);
  });
});
