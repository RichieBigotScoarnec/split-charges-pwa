import { describe, it, expect } from 'vitest';
import { rapportDuMois } from '../../public/js/utils/rapport-mensuel.js';
import { computeSummary } from '../../public/js/utils/calculations.js';
import { categorieQuiABouge, totauxParCategorie, SANS_CATEGORIE } from '../../public/js/utils/tendances.js';

/**
 * Le mois écoulé, en une page
 *
 * L'application calculait déjà tout ce qu'il faut pour dire comment un mois
 * s'est passé. Aucun écran ne les réunissait : il fallait ouvrir le bilan,
 * puis les tendances, puis les enveloppes, et faire la synthèse de tête.
 *
 * Ce module ne calcule AUCUN chiffre d'argent nouveau — il compose ce qui
 * existe. Le contrôle qui compte le vérifie : le total du rapport doit être
 * celui de `computeSummary`, pas une seconde addition qui finirait par
 * diverger.
 */

const charge = (description, amount, extra = {}) => ({
  description, amount, category: 'Maison', paidBy: 'vous', deleted: false, ...extra
});

const periode = (fixes, variables, salaries = { vous: 2500, conjointe: 1800 }) => ({
  salaries,
  fixedCharges: Object.fromEntries(fixes.map((c, i) => [`f${i}`, c])),
  variableCharges: Object.fromEntries(variables.map((c, i) => [`v${i}`, c]))
});

/** Quatre mois : trois révolus à 1 000 €, puis un mois plus lourd */
const PERIODS = {
  '2026-05': periode([charge('Loyer', 950)], [charge('Courses', 50)]),
  '2026-06': periode([charge('Loyer', 950)], [charge('Courses', 50)]),
  '2026-07': periode([charge('Loyer', 950)], [charge('Courses', 50)]),
  '2026-08': periode(
    [charge('Loyer', 950)],
    [charge('Courses', 50), charge('Restaurant', 300, { category: 'Restaurant' })]
  )
};

/** Le bilan du mois, tel que l'écran le calcule */
function bilanDe(mois) {
  const p = PERIODS[mois];
  return computeSummary({
    salaries: p.salaries,
    fixedCharges: Object.values(p.fixedCharges),
    variableCharges: Object.values(p.variableCharges),
    reimbursements: [],
    shareMode: 'prorata',
    customPercents: { vous: 50, conjointe: 50 }
  });
}

describe('LA PROPRIÉTÉ : le rapport ne recalcule rien', () => {
  it('son total est celui du bilan, au centime', () => {
    // Une seconde addition finirait par diverger de la première : c'est ce
    // qu'ont fait `normalizePair` et `resolveShareMode` avant d'être unifiés.
    const bilan = bilanDe('2026-08');
    const rapport = rapportDuMois({ periods: PERIODS, mois: '2026-08', bilan });

    expect(rapport.total).toBeCloseTo(bilan.total, 6);
  });

  it('la catégorie qui a bougé est celle que le panneau des tendances nomme', () => {
    // Le rapport et les tendances posent la MÊME question à la MÊME fonction.
    // Deux agrégations séparées y répondaient sur des seaux différents : l'une
    // rangeait les charges sans catégorie sous « Autre », l'autre sous « Sans
    // catégorie » — et « Autre » est une catégorie réelle du foyer. Les deux
    // écrans pouvaient donc nommer deux catégories pour le même mois.
    const juillet = {
      salaries: { vous: 2500, conjointe: 1800 },
      variableCharges: {
        v1: { description: 'Divers', amount: 500, category: 'Autre', deleted: false }
      }
    };
    const aout = {
      salaries: { vous: 2500, conjointe: 1800 },
      variableCharges: {
        v1: { description: 'Divers', amount: 100, category: 'Autre', deleted: false },
        // Sans champ `category` : les règles ne l'exigent pas.
        v2: { description: 'Héritée', amount: 400, deleted: false }
      }
    };
    const periods = { '2026-07': juillet, '2026-08': aout };

    const rapport = rapportDuMois({ periods, mois: '2026-08', bilan: null });
    const desTendances = categorieQuiABouge(
      totauxParCategorie(aout), totauxParCategorie(juillet)
    );

    expect(rapport.categorieQuiABouge).toEqual(desTendances);
    // Et les deux seaux restent bien distincts.
    expect(totauxParCategorie(aout)).toEqual({ 'Autre': 100, [SANS_CATEGORIE]: 400 });
  });

  it('le solde et son règlement viennent du bilan, pas d\'un nouveau calcul', () => {
    const bilan = bilanDe('2026-08');
    const rapport = rapportDuMois({ periods: PERIODS, mois: '2026-08', bilan });

    expect(rapport.solde).toBe(bilan.balance);
    expect(rapport.soldeRegle).toBe(Math.abs(bilan.balance) < 0.01);
  });

  it('un mois RÉGLÉ le dit — la branche que le jeu d\'essai ordinaire n\'atteint pas', () => {
    // Le solde du jeu d'essai vaut +244,19 € : `soldeRegle` y est faux partout,
    // et l'assertion ci-dessus comparait donc false à false. Une implémentation
    // rendant toujours `false` la passait. `settleBalance` laisse un résidu de
    // l'ordre du demi-centime : c'est cette frontière qu'il faut tenir.
    const regle = (balance) => rapportDuMois({
      periods: PERIODS, mois: '2026-08', bilan: { ...bilanDe('2026-08'), balance }
    }).soldeRegle;

    expect(regle(0)).toBe(true);
    expect(regle(0.005)).toBe(true);
    expect(regle(-0.005)).toBe(true);
    expect(regle(0.02)).toBe(false);
    expect(regle(-0.02)).toBe(false);
  });
});

describe('Ce que le rapport dit du mois', () => {
  const RAPPORT = rapportDuMois({
    periods: PERIODS, mois: '2026-08',
    bilan: bilanDe('2026-08'), salaries: { vous: 2500, conjointe: 1800 }
  });

  it('situe le mois par rapport à un mois ordinaire', () => {
    // Trois mois révolus à 1 000 € : l'ordinaire vaut 1 000, le mois en fait
    // 1 300, l'écart est de 300.
    expect(RAPPORT.ordinaire).toBeCloseTo(1000, 6);
    expect(RAPPORT.ecart).toBeCloseTo(300, 6);
  });

  it('nomme la catégorie qui a le plus bougé, et le mois comparé', () => {
    expect(RAPPORT.categorieQuiABouge).toMatchObject({ categorie: 'Restaurant', variation: 300 });
    expect(RAPPORT.comparee).toBe('2026-07');
  });

  it('donne le taux d\'effort et le reste à vivre', () => {
    // 1 300 € sur 4 300 € de revenus.
    expect(RAPPORT.tauxDEffort).toBeCloseTo((1300 / 4300) * 100, 4);
    expect(RAPPORT.resteAVivre).toBeCloseTo(3000, 6);
  });

  it('donne la part du fixe', () => {
    // 950 de fixe sur 1 300.
    expect(RAPPORT.partFixe).toBeCloseTo((950 / 1300) * 100, 4);
  });

  it('compte les charges du mois', () => {
    expect(RAPPORT.nombre).toBe(3);
  });
});

describe('Ce qui manque, et le dit', () => {
  it('sans trois mois révolus, il n\'y a pas de mois ordinaire', () => {
    const court = { '2026-08': PERIODS['2026-08'] };
    const rapport = rapportDuMois({ periods: court, mois: '2026-08', bilan: bilanDe('2026-08') });

    expect(rapport.ordinaire).toBe(null);
    expect(rapport.ecart).toBe(null);
    // Le reste du rapport tient quand même.
    expect(rapport.total).toBeCloseTo(1300, 6);
  });

  it('sans revenus, ni taux d\'effort ni reste à vivre', () => {
    const rapport = rapportDuMois({
      periods: PERIODS, mois: '2026-08', bilan: bilanDe('2026-08'), salaries: null
    });

    expect(rapport.tauxDEffort).toBe(null);
    expect(rapport.resteAVivre).toBe(null);
  });

  it('sans mois précédent, aucune catégorie n\'a bougé', () => {
    const seul = { '2026-08': PERIODS['2026-08'] };
    const rapport = rapportDuMois({ periods: seul, mois: '2026-08', bilan: bilanDe('2026-08') });

    expect(rapport.categorieQuiABouge).toBe(null);
    expect(rapport.comparee).toBe(null);
  });

  it('un mois sans rien de saisi s\'annonce vide plutôt que d\'aligner des zéros', () => {
    const vide = { '2026-08': periode([], []) };
    const rapport = rapportDuMois({ periods: vide, mois: '2026-08', bilan: null });

    expect(rapport.vide).toBe(true);
  });

  it('situe le mois par rapport au calendrier : révolu, en cours, ou à venir', () => {
    // Un seul des trois états autorise à qualifier l'écart. Le 6 du mois, un
    // mois entamé pèse 1 050 € contre 2 000 € d'ordinaire, et l'écart est celui
    // des jours qui restent, pas une économie. Un mois à VENIR — le sélecteur
    // en propose un d'avance — est pire encore : rien n'y est passé.
    const etatPour = (moisReel) => rapportDuMois({
      periods: PERIODS, mois: '2026-08', bilan: bilanDe('2026-08'), moisReel
    }).etat;

    expect(etatPour('2026-08')).toBe('en-cours');
    expect(etatPour('2026-09')).toBe('revolu');
    expect(etatPour('2026-07')).toBe('a-venir');
  });

  it('sans mois réel, on ne suppose pas que le mois est clos', () => {
    // Le silence plutôt qu'une affirmation : `null` se distingue des trois
    // états, et l'écran ne qualifie alors rien.
    const rapport = rapportDuMois({ periods: PERIODS, mois: '2026-08', bilan: bilanDe('2026-08') });
    expect(rapport.etat).toBe(null);
  });

  it('un mois absent ou une entrée illisible rend null', () => {
    expect(rapportDuMois({ periods: PERIODS, mois: '2020-01', bilan: null })).toBe(null);
    expect(rapportDuMois({ periods: null, mois: '2026-08', bilan: null })).toBe(null);
    expect(rapportDuMois({ periods: PERIODS, mois: 'pas un mois', bilan: null })).toBe(null);
  });
});

describe('Ce que le rapport écarte', () => {
  it('la corbeille et les dépenses solo, comme le bilan', () => {
    const avecBruit = {
      '2026-08': periode(
        [charge('Loyer', 950)],
        [
          charge('Annulée', 500, { deleted: true }),
          charge('Salle de sport', 35, { perimetre: 'solo' })
        ]
      )
    };
    const rapport = rapportDuMois({ periods: avecBruit, mois: '2026-08', bilan: null });

    expect(rapport.total).toBeCloseTo(950, 6);
    expect(rapport.nombre).toBe(1);
  });
});
