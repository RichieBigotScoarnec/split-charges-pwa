import { describe, it, expect } from 'vitest';
import { detailDuPayeur, detailDeLaCategorie } from '../../public/js/utils/detail.js';
import { computeSummary } from '../../public/js/utils/calculations.js';
import { computeCategoryBudgets } from '../../public/js/utils/budgets.js';

/**
 * Le détail derrière un chiffre du bilan
 *
 * L'exigence est absolue : le détail doit s'ADDITIONNER jusqu'au chiffre qu'il
 * explique. Un écran qui ouvre un total sur une liste qui ne le retrouve pas
 * est pire que pas d'écran du tout — il fait douter du total.
 *
 * Ces contrôles ne comparent donc pas à des valeurs écrites à la main : ils
 * repassent par `computeSummary` et par l'agrégation des catégories, et
 * exigent l'égalité. C'est le patron de `perimetre-transversal.test.js`.
 */

const MOIS = {
  salaries: { vous: 2500, conjointe: 1800 },
  shareMode: 'prorata',
  customPercents: { vous: 50, conjointe: 50 },
  fixedCharges: [
    { id: 'f1', description: 'Loyer', amount: 950, category: 'Maison', paidBy: 'vous', date: '2026-08-05', deleted: false },
    { id: 'f2', description: 'Internet', amount: 39.99, category: 'Maison', paidBy: 'conjointe', date: '2026-08-03', deleted: false }
  ],
  variableCharges: [
    { id: 'v1', description: 'Courses', amount: 74.25, category: 'Courses', paidBy: 'vous', date: '2026-08-12', deleted: false },
    { id: 'v2', description: 'Restaurant', amount: 88.5, category: 'Restaurant', paidBy: 'conjointe', date: '2026-08-14', deleted: false },
    // Une charge PARTAGÉE : chacun n'en a avancé qu'une part.
    { id: 'v3', description: 'Week-end', amount: 300, category: 'Loisirs', paidBy: 'partage', date: '2026-08-20', deleted: false },
    // Écartées de tout : supprimée, solo, montant absent.
    { id: 'v4', description: 'Annulée', amount: 500, category: 'Courses', paidBy: 'vous', date: '2026-08-08', deleted: true },
    { id: 'v5', description: 'Salle de sport', amount: 35, category: 'Loisirs', paidBy: 'vous', perimetre: 'solo', date: '2026-08-02', deleted: false },
    { id: 'v6', description: 'Sans montant', category: 'Courses', paidBy: 'vous', date: '2026-08-09', deleted: false }
  ],
  reimbursements: []
};

const detailPour = qui => detailDuPayeur({
  fixedCharges: MOIS.fixedCharges,
  variableCharges: MOIS.variableCharges,
  qui,
  shareMode: MOIS.shareMode,
  salaries: MOIS.salaries,
  customPercents: MOIS.customPercents
});

describe('LA PROPRIÉTÉ : le détail retrouve le chiffre du bilan', () => {
  const bilan = computeSummary(MOIS);

  it('le détail de Richard s\'additionne à ce que le bilan lui attribue', () => {
    expect(detailPour('vous').total).toBeCloseTo(bilan.yourActualPayments, 6);
  });

  it('le détail de la conjointe aussi', () => {
    expect(detailPour('conjointe').total).toBeCloseTo(bilan.partnerActualPayments, 6);
  });

  it('les deux détails réunis font le total des charges', () => {
    // Rien n'est compté deux fois, rien n'est perdu en route.
    expect(detailPour('vous').total + detailPour('conjointe').total)
      .toBeCloseTo(bilan.total, 6);
  });

  it('TÉMOIN NÉGATIF : compter une charge partagée en entier casserait l\'égalité', () => {
    // Le défaut le plus facile à commettre ici : afficher le montant plein
    // d'une charge « partagée » de chaque côté. La liste dépasserait alors son
    // propre total de 300 € — le montant du week-end, compté deux fois.
    const naif = qui => detailPour(qui).lignes
      .reduce((somme, ligne) => somme + ligne.amount, 0);

    expect(naif('vous') + naif('conjointe')).toBeCloseTo(bilan.total + 300, 6);
    expect(naif('vous')).not.toBeCloseTo(bilan.yourActualPayments, 2);
  });
});

describe('Ce qu\'une ligne de payeur porte', () => {
  it('une charge avancée en entier porte son montant', () => {
    const loyer = detailPour('vous').lignes.find(l => l.description === 'Loyer');
    expect(loyer.part).toBe(950);
    expect(loyer.partielle).toBe(false);
  });

  it('une charge partagée est marquée comme partielle', () => {
    // Sans ce drapeau, le lecteur additionne les montants affichés et ne
    // retombe pas sur le total : il faut que l'écran puisse le dire.
    const weekend = detailPour('vous').lignes.find(l => l.description === 'Week-end');
    expect(weekend.partielle).toBe(true);
    expect(weekend.part).toBeGreaterThan(0);
    expect(weekend.part).toBeLessThan(300);
  });

  it('les charges fixes sont distinguées des variables', () => {
    const lignes = detailPour('vous').lignes;
    expect(lignes.find(l => l.description === 'Loyer').fixe).toBe(true);
    expect(lignes.find(l => l.description === 'Courses').fixe).toBe(false);
  });

  it('une ligne sans part n\'apparaît pas : elle n\'explique rien', () => {
    const lignes = detailPour('vous').lignes.map(l => l.description);
    expect(lignes).not.toContain('Internet');   // avancée par la conjointe
  });

  it('la corbeille, le solo et un montant absent restent dehors', () => {
    const lignes = detailPour('vous').lignes.map(l => l.description);
    expect(lignes).not.toContain('Annulée');
    expect(lignes).not.toContain('Salle de sport');
    // Montant ramené à zéro, donc part nulle, donc pas de ligne.
    expect(lignes).not.toContain('Sans montant');
  });

  it('le plus récent d\'abord, comme partout ailleurs', () => {
    const dates = detailPour('vous').lignes.map(l => l.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe('LA PROPRIÉTÉ : le détail d\'une catégorie retrouve son total', () => {
  /** Les totaux par catégorie tels que le panneau des budgets les calcule */
  function totauxParCategorie() {
    const totaux = {};
    for (const charge of [...MOIS.fixedCharges, ...MOIS.variableCharges]) {
      if (charge.deleted || charge.perimetre === 'solo') continue;
      const nom = charge.category || 'Autre';
      totaux[nom] = totaux[nom] || { total: 0 };
      totaux[nom].total += Number.isFinite(charge.amount) ? charge.amount : 0;
    }
    return totaux;
  }

  const attendus = totauxParCategorie();

  it('chaque catégorie affichée retrouve exactement son détail', () => {
    const lignes = computeCategoryBudgets(attendus, {});
    expect(lignes.length).toBeGreaterThan(2);

    for (const ligne of lignes) {
      const detail = detailDeLaCategorie({
        fixedCharges: MOIS.fixedCharges,
        variableCharges: MOIS.variableCharges,
        categorie: ligne.category
      });

      expect(detail.total, `« ${ligne.category} » ne retrouve pas son total`)
        .toBeCloseTo(ligne.spent, 6);
    }
  });

  it('« Maison » réunit les deux charges fixes, quel que soit le payeur', () => {
    const detail = detailDeLaCategorie({
      fixedCharges: MOIS.fixedCharges,
      variableCharges: MOIS.variableCharges,
      categorie: 'Maison'
    });

    expect(detail.lignes.map(l => l.description).sort()).toEqual(['Internet', 'Loyer']);
    expect(detail.total).toBeCloseTo(989.99, 6);
  });

  it('une charge sans catégorie se retrouve sous « Autre »', () => {
    // Même repli que `analyzeCategoriesData` : sans cela le détail serait vide
    // sous un nom que le panneau affiche pourtant.
    const detail = detailDeLaCategorie({
      fixedCharges: [],
      variableCharges: [{ id: 'x', description: 'Divers', amount: 12, paidBy: 'vous', deleted: false }],
      categorie: 'Autre'
    });

    expect(detail.lignes).toHaveLength(1);
    expect(detail.total).toBe(12);
  });

  it('une catégorie inconnue rend une liste vide plutôt qu\'une erreur', () => {
    const detail = detailDeLaCategorie({
      fixedCharges: MOIS.fixedCharges,
      variableCharges: MOIS.variableCharges,
      categorie: 'Cette catégorie n\'existe pas'
    });

    expect(detail.lignes).toEqual([]);
    expect(detail.total).toBe(0);
  });

  it('des entrées inexploitables ne font pas tomber le calcul', () => {
    expect(() => detailDeLaCategorie({ categorie: 'Maison' })).not.toThrow();
    expect(detailDeLaCategorie({ categorie: 'Maison' }).total).toBe(0);
    expect(detailDuPayeur({ qui: 'vous', shareMode: 'prorata' }).total).toBe(0);
  });
});
