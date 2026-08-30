import { describe, it, expect } from 'vitest';
import {
  calculateChargeShares,
  calculateJointPayment,
  computeSummary,
  computeVirementsByDestination,
  exigeLesSalaires
} from '../../public/js/utils/calculations.js';

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
    // carryOver figure dans la forme de retour même ici : aucun report n'est
    // appliqué faute de salaires, et le dire explicitement évite un undefined
    // chez les consommateurs qui déstructurent ce champ.
    expect(result).toEqual({ total: 0, yourShare: 0, partnerShare: 0, balance: 0, carryOver: 0 });
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

  // Un solde positif signifie « la conjointe vous doit ». Un remboursement est
  // un transfert déjà effectué : verser de l'argent augmente ce qu'on vous
  // doit, en recevoir le diminue. Ces deux tests portaient l'énoncé inverse,
  // et figeaient donc l'inversion de signe qu'ils étaient censés protéger.
  it('un versement vous→conjointe augmente la dette de la conjointe', () => {
    const result = computeSummary({
      ...baseParams,
      variableCharges: [makeCharge({ amount: 500, paidBy: 'vous' })],
      reimbursements: [{
        amount: 100,
        direction: 'vous-to-conjointe',
        deleted: false
      }]
    });
    // Sans remboursement : solde = +200. Vous lui avancez 100 de plus.
    expect(result.balance).toBeCloseTo(300);
    expect(result.reimbursementAdjustment).toBe(100);
  });

  it('un versement conjointe→vous réduit la dette de la conjointe', () => {
    const result = computeSummary({
      ...baseParams,
      variableCharges: [makeCharge({ amount: 500, paidBy: 'conjointe' })],
      reimbursements: [{
        amount: 50,
        direction: 'conjointe-to-vous',
        deleted: false
      }]
    });
    // Sans remboursement : solde = -300 (c'est vous qui devez).
    // Elle vous verse 50 : vous lui devez donc 50 de plus.
    expect(result.balance).toBeCloseTo(-350);
    expect(result.reimbursementAdjustment).toBe(-50);
  });

  it('un remboursement du solde exact ramène à zéro', () => {
    // Le cas qui compte en pratique, et celui qui échouait : loyer payé
    // intégralement par vous, salaires égaux, puis elle solde sa part.
    const result = computeSummary({
      salaries: { vous: 2000, conjointe: 2000 },
      fixedCharges: [{ amount: 1000, paidBy: 'vous', deleted: false }],
      variableCharges: [],
      reimbursements: [{ amount: 500, direction: 'conjointe-to-vous', deleted: false }],
      shareMode: 'prorata',
      customPercents: { vous: 50, conjointe: 50 }
    });
    expect(result.balance).toBeCloseTo(0);
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

  it('LA CORBEILLE : une charge supprimée ne demande aucun virement', () => {
    // La seule garde de tout ce chemin vivait chez l'APPELANT — `summary.js`
    // filtrait `!c.deleted` avant d'appeler — et rien ne la tenait. Mesuré :
    // la retirer laissait les 2 329 tests verts, et le panneau des virements
    // réclamait 380 € pour un loyer mis à la corbeille là où 20 € sont dus.
    //
    // Une garde posée chez l'appelant n'est pas une garde : c'est un usage.
    // Elle est donc DANS la fonction, comme `computeSummary` porte la sienne,
    // et ce contrôle appelle sans filtrer — sinon il n'éprouverait que lui-même.
    const charges = [
      makeCharge({ amount: 50, destination: 'Compte Joint', description: 'Internet' }),
      makeCharge({
        amount: 900, destination: 'Compte Joint', description: 'Loyer', deleted: true
      })
    ];
    const result = computeVirementsByDestination(charges, params);

    expect(result).toHaveLength(1);
    expect(result[0].charges).toHaveLength(1);
    expect(result[0].charges[0].description).toBe('Internet');

    // 50 € × 40 % = 20 €. Avec la corbeille comptée : 950 × 40 % = 380 €.
    expect(result[0].total).toBeCloseTo(20);
  });

  it('et une destination dont TOUTES les charges sont à la corbeille disparaît', () => {
    // Sans quoi le panneau afficherait une ligne « Compte Joint — 0,00 € »,
    // qui se lit comme un virement à faire.
    const charges = [
      makeCharge({ amount: 900, destination: 'Compte Joint', deleted: true })
    ];

    expect(computeVirementsByDestination(charges, params)).toEqual([]);
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
    expect(result.reimbursementAdjustment).toBe(50);
  });
});

/**
 * Le 50-50 n'a pas besoin des salaires
 *
 * La garde `totalSalaires === 0` était inconditionnelle : un couple qui
 * choisissait explicitement le partage à parts égales et ne renseignait aucun
 * salaire voyait « Renseignez vos deux salaires pour obtenir le bilan du
 * mois » — un conseil faux, puisque ce mode ne regarde aucun salaire.
 *
 * L'application exigeait donc que les deux se divulguent leurs revenus pour se
 * servir d'un partage qui les ignore, ce qui est souvent la raison même du
 * choix.
 */
describe('Quels modes ont besoin des salaires', () => {
  it('le prorata, seul', () => {
    expect(exigeLesSalaires('prorata')).toBe(true);
    expect(exigeLesSalaires('50-50')).toBe(false);
    expect(exigeLesSalaires('custom')).toBe(false);
  });

  it('un mode inconnu est traité comme le prorata', () => {
    // Le défaut sûr : mieux vaut réclamer les salaires que rendre un solde
    // calculé sur une règle qu'on ne connaît pas.
    expect(exigeLesSalaires(undefined)).toBe(true);
  });
});

describe('Un bilan sans salaire renseigné', () => {
  const charges = [{ amount: 1000, paidBy: 'vous', description: 'Loyer' }];
  const sansSalaire = {
    salaries: { vous: 0, conjointe: 0 },
    fixedCharges: charges, variableCharges: [], reimbursements: [],
    customPercents: { vous: 70, conjointe: 30 }
  };

  it('se calcule en 50-50', () => {
    // Mesuré avant correction : total 0 €, solde 0 €, alors qu'une personne
    // avait avancé 1 000 €.
    const bilan = computeSummary({ ...sansSalaire, shareMode: '50-50' });

    expect(bilan.total).toBe(1000);
    expect(bilan.balance).toBe(500);
  });

  it('se calcule avec des pourcentages choisis', () => {
    const bilan = computeSummary({ ...sansSalaire, shareMode: 'custom' });

    expect(bilan.total).toBe(1000);
    expect(bilan.balance).toBe(300);
  });

  it('reste impossible au prorata, comme avant', () => {
    // Là, les salaires manquent vraiment : rendre un solde calculé en 50-50
    // sans le dire serait pire que de le refuser.
    const bilan = computeSummary({ ...sansSalaire, shareMode: 'prorata' });

    expect(bilan.total).toBe(0);
    expect(bilan.balance).toBe(0);
  });
});

/**
 * Une donnée abîmée ne doit pas emporter tout le bilan
 *
 * `sum + undefined` donne NaN, et NaN se propage. Mesuré avant correction :
 * une seule charge sans montant rendait le bilan entier — total, parts, solde
 * — égal à NaN, soit « NaN € » à l'écran. Les charges variables étaient
 * filtrées au chargement, mais ni les charges fixes ni les remboursements.
 */
describe('Une charge sans montant exploitable', () => {
  const base = {
    salaries: { vous: 2000, conjointe: 1000 },
    shareMode: 'prorata', customPercents: { vous: 50, conjointe: 50 },
    fixedCharges: [], variableCharges: [], reimbursements: []
  };

  it('vaut zéro, et le reste du bilan tient', () => {
    const bilan = computeSummary({
      ...base,
      fixedCharges: [
        { description: 'Loyer', amount: 900, paidBy: 'vous' },
        { description: 'Abîmée', paidBy: 'vous' }
      ]
    });

    expect(Number.isFinite(bilan.total), 'le total est NaN').toBe(true);
    expect(bilan.total).toBe(900);
    expect(Number.isFinite(bilan.balance)).toBe(true);
  });

  it('vaut aussi pour un remboursement', () => {
    const bilan = computeSummary({
      ...base,
      fixedCharges: [{ description: 'Loyer', amount: 900, paidBy: 'vous' }],
      reimbursements: [{ direction: 'conjointe-to-vous' }]
    });

    expect(Number.isFinite(bilan.balance), 'le solde est NaN').toBe(true);
  });
});

/**
 * Le panneau des virements, sur les mêmes charges abîmées
 *
 * `computeSummary` avait été durci contre un montant inexploitable. Le calcul
 * des virements, non — et c'est pourtant lui qui dit combien virer. Mesuré
 * avant correctif : le bilan annonçait 900 €, le panneau juste en dessous
 * « NaN € ».
 */
describe('Un virement sur une charge sans montant', () => {
  const params = {
    shareMode: '50-50',
    salaries: { vous: 2000, conjointe: 2000 },
    totalSalaries: 4000,
    customPercents: { vous: 50, conjointe: 50 }
  };

  it('ne rend jamais NaN, quel que soit le mode', () => {
    for (const mode of ['50-50', 'prorata', 'custom']) {
      const [groupe] = computeVirementsByDestination(
        [{ description: 'Abîmée', destination: 'compte-commun' }],
        { ...params, shareMode: mode }
      );

      expect(Number.isFinite(groupe.total), `total NaN en mode ${mode}`).toBe(true);
      expect(groupe.total).toBe(0);
    }
  });

  it('n\'emporte pas les charges saines du même virement', () => {
    // Le défaut ne coûtait pas une ligne mais tout le groupe : le total
    // devenait NaN, et le montant à virer avec lui.
    const [groupe] = computeVirementsByDestination([
      { description: 'Loyer', amount: 900, destination: 'compte-commun' },
      { description: 'Abîmée', destination: 'compte-commun' }
    ], params);

    expect(groupe.total).toBe(450);
    expect(groupe.charges).toHaveLength(2);
  });

  it('dit le même total que le bilan', () => {
    // Deux chiffres qui décrivent la même chose ne doivent pas se contredire :
    // c'est ainsi que le défaut se voyait à l'écran.
    const charges = [
      { description: 'Loyer', amount: 900, destination: 'compte-commun', paidBy: 'vous' },
      { description: 'Abîmée', destination: 'compte-commun', paidBy: 'vous' }
    ];

    const [groupe] = computeVirementsByDestination(charges, params);
    const bilan = computeSummary({
      salaries: { vous: 2000, conjointe: 2000 }, fixedCharges: charges,
      variableCharges: [], reimbursements: [], shareMode: '50-50',
      customPercents: { vous: 50, conjointe: 50 }
    });

    expect(groupe.total).toBe(bilan.partnerShare);
  });

  it('ramène le montant affiché à zéro plutôt qu\'à rien', () => {
    // La ligne reste, avec un montant lisible : la retirer ferait disparaître
    // une charge que le bilan compte, et l'écart serait introuvable.
    const [groupe] = computeVirementsByDestination(
      [{ description: 'Abîmée', destination: 'compte-commun', amount: 'douze euros' }],
      params
    );

    expect(groupe.charges[0].amount).toBe(0);
    expect(groupe.charges[0].partnerShare).toBe(0);
  });
});
