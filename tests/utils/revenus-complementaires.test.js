import { describe, it, expect } from 'vitest';
import { resolveIncomeBase, normalizeSalaries } from '../../public/js/utils/salaries.js';
import { computeSummary } from '../../public/js/utils/calculations.js';

/**
 * Le partage au prorata répond à une question de capacité contributive. Il ne
 * portait que sur les salaires : un conjoint au salaire modeste mais percevant
 * des allocations conséquentes se voyait attribuer une part trop faible, et
 * l'autre payait pour un écart de revenus qui n'existait pas.
 */

describe('Assiette du prorata', () => {
  it('sans revenus complémentaires, l\'assiette se confond avec les salaires', () => {
    // Rétrocompatibilité : c'est le cas de toutes les données antérieures.
    expect(resolveIncomeBase({ vous: 2500, conjointe: 1500 }))
      .toEqual({ vous: 2500, conjointe: 1500, total: 4000 });
  });

  it('les revenus complémentaires s\'ajoutent au salaire de chacun', () => {
    expect(resolveIncomeBase({ vous: 2500, conjointe: 1500, extraVous: 0, extraConjointe: 600 }))
      .toEqual({ vous: 2500, conjointe: 2100, total: 4600 });
  });

  it('les valeurs aberrantes sont ramenées à zéro plutôt que propagées', () => {
    // Ces valeurs viennent de Firebase : rien ne garantit leur type.
    expect(resolveIncomeBase({ vous: '2500', conjointe: null, extraVous: -100, extraConjointe: 'abc' }))
      .toEqual({ vous: 2500, conjointe: 0, total: 2500 });
  });

  it('une entrée absente donne une assiette nulle', () => {
    expect(resolveIncomeBase(null)).toEqual({ vous: 0, conjointe: 0, total: 0 });
    expect(resolveIncomeBase(undefined)).toEqual({ vous: 0, conjointe: 0, total: 0 });
    expect(resolveIncomeBase({})).toEqual({ vous: 0, conjointe: 0, total: 0 });
  });

  it('la normalisation conserve les revenus complémentaires', () => {
    expect(normalizeSalaries({ vous: 2000, conjointe: 1000, extraVous: 300, extraConjointe: 700 }))
      .toEqual({ vous: 2000, conjointe: 1000, extraVous: 300, extraConjointe: 700 });
  });
});

describe('Effet sur le partage des charges', () => {
  const mois = (salaries) => ({
    salaries,
    fixedCharges: [],
    variableCharges: [{ id: 'v1', amount: 1000, paidBy: 'vous', deleted: false }],
    reimbursements: [],
    shareMode: 'prorata',
    customPercents: { vous: 50, conjointe: 50 }
  });

  it('sans revenus complémentaires, le résultat est celui d\'avant', () => {
    // Salaires 3000/1000 : elle porte un quart de la charge, soit 250.
    const { partnerShare } = computeSummary(mois({ vous: 3000, conjointe: 1000 }));
    expect(partnerShare).toBeCloseTo(250);
  });

  it('des allocations relèvent la part de celle qui les perçoit', () => {
    // Même salaire, mais 1000 € d'allocations : son assiette passe de 1000 à
    // 2000, sa part de 250 à 400.
    const { partnerShare } = computeSummary(
      mois({ vous: 3000, conjointe: 1000, extraVous: 0, extraConjointe: 1000 })
    );
    expect(partnerShare).toBeCloseTo(400);
  });

  it('des revenus égaux ramènent le partage à parts égales', () => {
    const { yourShare, partnerShare } = computeSummary(
      mois({ vous: 3000, conjointe: 1000, extraVous: 0, extraConjointe: 2000 })
    );
    expect(yourShare).toBeCloseTo(500);
    expect(partnerShare).toBeCloseTo(500);
  });

  it('le solde suit l\'assiette, pas le seul salaire', () => {
    // Vous avancez les 1000 €. Sans allocations elle vous doit 250 ; avec
    // 1000 € d'allocations, 400.
    expect(computeSummary(mois({ vous: 3000, conjointe: 1000 })).balance).toBeCloseTo(250);
    expect(computeSummary(
      mois({ vous: 3000, conjointe: 1000, extraVous: 0, extraConjointe: 1000 })
    ).balance).toBeCloseTo(400);
  });

  it('le mode 50-50 ignore l\'assiette, comme il ignorait les salaires', () => {
    const { yourShare, partnerShare } = computeSummary({
      ...mois({ vous: 3000, conjointe: 1000, extraVous: 0, extraConjointe: 5000 }),
      shareMode: '50-50'
    });
    expect(yourShare).toBeCloseTo(500);
    expect(partnerShare).toBeCloseTo(500);
  });

  it('un foyer sans aucun revenu reste sans bilan calculable', () => {
    const resultat = computeSummary(mois({ vous: 0, conjointe: 0, extraVous: 0, extraConjointe: 0 }));
    expect(resultat.balance).toBe(0);
    expect(resultat.total).toBe(0);
  });

  it('des revenus uniquement complémentaires suffisent à calculer un partage', () => {
    // Un foyer sans salaire mais avec des revenus de remplacement n'était pas
    // calculable du tout : le bilan restait vide.
    const { yourShare, partnerShare } = computeSummary(
      mois({ vous: 0, conjointe: 0, extraVous: 1500, extraConjointe: 500 })
    );
    expect(yourShare).toBeCloseTo(750);
    expect(partnerShare).toBeCloseTo(250);
  });
});
