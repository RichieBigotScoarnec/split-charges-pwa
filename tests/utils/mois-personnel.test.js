import { describe, it, expect } from 'vitest';
import { computeMoisPersonnel } from '../../public/js/utils/calculations.js';

/**
 * Le versant personnel du résumé : ce que le mois me coûte, ce qu'il me reste.
 *
 * Le fil de ces tests est une seule propriété — reste à vivre et taux d'effort
 * sont la même soustraction lue dans les deux sens, donc leurs pourcentages
 * font 100. Tout ce qui entre dans l'un doit entrer dans l'autre, et rien ne
 * doit entrer deux fois.
 */

const revenus = { vous: 3650.72, conjointe: 1965.77 };

function charge(overrides = {}) {
  return { amount: 100, paidBy: 'vous', deleted: false, ...overrides };
}

function solo(overrides = {}) {
  return charge({ perimetre: 'solo', ...overrides });
}

describe('computeMoisPersonnel', () => {
  describe('la propriété qui tient tout', () => {
    it('reste à vivre et taux d\'effort se complètent à 100 %', () => {
      const r = computeMoisPersonnel({
        salaries: revenus,
        fixedCharges: [solo({ amount: 85 })],
        variableCharges: [],
        partDue: 806.52
      });

      expect(r.resteAVivre).toBeCloseTo(2759.20, 2);
      expect(r.tauxEffort).toBeCloseTo(0.244206, 5);
      expect(r.resteAVivre / r.revenus + r.tauxEffort).toBeCloseTo(1, 6);
    });

    it('la propriété tient aussi quand rien n\'est engagé', () => {
      const r = computeMoisPersonnel({
        salaries: revenus, fixedCharges: [], variableCharges: [], partDue: 0
      });

      expect(r.resteAVivre).toBeCloseTo(3650.72, 2);
      expect(r.tauxEffort).toBe(0);
      expect(r.resteAVivre / r.revenus + r.tauxEffort).toBeCloseTo(1, 6);
    });
  });

  describe('ce qui entre dans l\'engagé', () => {
    it('additionne la part du commun et les charges solo', () => {
      const r = computeMoisPersonnel({
        salaries: { vous: 2000, conjointe: 0 },
        fixedCharges: [solo({ amount: 60 })],
        variableCharges: [solo({ amount: 40 })],
        partDue: 400
      });

      expect(r.solo).toBe(100);
      expect(r.partDue).toBe(400);
      expect(r.engage).toBe(500);
      expect(r.resteAVivre).toBe(1500);
      expect(r.tauxEffort).toBeCloseTo(0.25, 6);
    });

    it('ne compte pas une charge commune deux fois — elle arrive par partDue', () => {
      const commune = charge({ amount: 900 });

      const r = computeMoisPersonnel({
        salaries: { vous: 2000, conjointe: 0 },
        fixedCharges: [commune],
        variableCharges: [],
        partDue: 450
      });

      // La charge commune est dans la liste, mais `solo` l'ignore : sa
      // contribution est déjà dans `partDue`.
      expect(r.solo).toBe(0);
      expect(r.engage).toBe(450);
    });

    it('ignore les charges solo de l\'autre personne', () => {
      const r = computeMoisPersonnel({
        salaries: { vous: 2000, conjointe: 1000 },
        fixedCharges: [solo({ amount: 85 }), solo({ amount: 300, paidBy: 'conjointe' })],
        variableCharges: [],
        partDue: 0
      });

      expect(r.solo).toBe(85);
    });

    it('ignore un solo dont le propriétaire est indéterminé', () => {
      // `perimetre: 'solo'` avec `paidBy: 'partage'` : les règles le refusent à
      // l'écriture, mais une donnée ancienne ou forgée peut exister. Elle reste
      // solo — donc hors du solde — sans appartenir à personne.
      const r = computeMoisPersonnel({
        salaries: { vous: 2000, conjointe: 0 },
        fixedCharges: [solo({ amount: 500, paidBy: 'partage' })],
        variableCharges: [],
        partDue: 0
      });

      expect(r.solo).toBe(0);
      expect(r.engage).toBe(0);
    });

    it('écarte les charges solo mises à la corbeille', () => {
      const r = computeMoisPersonnel({
        salaries: { vous: 2000, conjointe: 0 },
        fixedCharges: [solo({ amount: 85 }), solo({ amount: 900, deleted: true })],
        variableCharges: [],
        partDue: 0
      });

      expect(r.solo).toBe(85);
    });

    it('un montant abîmé vaut zéro, jamais NaN', () => {
      const r = computeMoisPersonnel({
        salaries: { vous: 2000, conjointe: 0 },
        fixedCharges: [solo({ amount: undefined }), solo({ amount: 50 })],
        variableCharges: [],
        partDue: undefined
      });

      expect(r.solo).toBe(50);
      expect(r.partDue).toBe(0);
      expect(Number.isNaN(r.resteAVivre)).toBe(false);
      expect(r.resteAVivre).toBe(1950);
    });
  });

  describe('les revenus', () => {
    it('comprend les revenus complémentaires', () => {
      const r = computeMoisPersonnel({
        salaries: { vous: 2000, extraVous: 500, conjointe: 1000 },
        fixedCharges: [], variableCharges: [], partDue: 500
      });

      expect(r.revenus).toBe(2500);
      expect(r.tauxEffort).toBeCloseTo(0.2, 6);
    });

    it('ne regarde que les revenus de la personne, pas ceux du foyer', () => {
      const r = computeMoisPersonnel({
        salaries: { vous: 2000, conjointe: 8000 },
        fixedCharges: [], variableCharges: [], partDue: 500
      });

      expect(r.revenus).toBe(2000);
      expect(r.tauxEffort).toBeCloseTo(0.25, 6);
    });

    it('sans revenus, l\'indicateur se déclare indisponible plutôt que d\'inventer', () => {
      // 50-50 et custom ne demandent aucun salaire : un foyer entier peut vivre
      // sans qu'aucun revenu soit renseigné. Il n'y a alors rien à diviser.
      const r = computeMoisPersonnel({
        salaries: { vous: 0, conjointe: 0 },
        fixedCharges: [solo({ amount: 85 })],
        variableCharges: [],
        partDue: 400
      });

      expect(r.disponible).toBe(false);
      expect(r.resteAVivre).toBeNull();
      expect(r.tauxEffort).toBeNull();
      // Ce qui est connu reste rendu : seuls les deux quotients manquent.
      expect(r.engage).toBe(485);
      expect(r.solo).toBe(85);
    });

    it('un instantané de revenus absent ne lève pas', () => {
      const r = computeMoisPersonnel({
        salaries: undefined, fixedCharges: undefined, variableCharges: undefined, partDue: 0
      });

      expect(r.disponible).toBe(false);
      expect(r.engage).toBe(0);
    });
  });

  describe('les mois qui débordent', () => {
    it('un engagement supérieur aux revenus donne un reste à vivre négatif', () => {
      const r = computeMoisPersonnel({
        salaries: { vous: 1000, conjointe: 0 },
        fixedCharges: [solo({ amount: 200 })],
        variableCharges: [],
        partDue: 1000
      });

      expect(r.disponible).toBe(true);
      expect(r.resteAVivre).toBe(-200);
      expect(r.tauxEffort).toBeCloseTo(1.2, 6);
      // La propriété tient même là : le mois est décrit, pas corrigé.
      expect(r.resteAVivre / r.revenus + r.tauxEffort).toBeCloseTo(1, 6);
    });
  });

  describe('le versant de la conjointe', () => {
    it('lit ses revenus et ses seules charges solo', () => {
      const r = computeMoisPersonnel({
        salaries: revenus,
        fixedCharges: [solo({ amount: 85 }), solo({ amount: 300, paidBy: 'conjointe' })],
        variableCharges: [],
        partDue: 434.28,
        personne: 'conjointe'
      });

      expect(r.revenus).toBeCloseTo(1965.77, 2);
      expect(r.solo).toBe(300);
      expect(r.engage).toBeCloseTo(734.28, 2);
      expect(r.resteAVivre / r.revenus + r.tauxEffort).toBeCloseTo(1, 6);
    });
  });
});
