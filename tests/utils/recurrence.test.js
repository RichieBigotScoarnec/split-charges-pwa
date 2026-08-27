import { describe, it, expect } from 'vitest';
import { planRecurrence } from '../../public/js/utils/recurrence.js';

/**
 * Les charges fixes portaient déjà un indicateur `recurring` et le code savait
 * les recopier, mais rien ne déclenchait jamais la copie : bannière jamais
 * affichée, boutons pointant vers des fonctions absentes, bouton manuel absent
 * du HTML. Chaque mois, il fallait ressaisir le loyer.
 *
 * La décision est ce qui compte : une reconduction qui se rejoue, ou qui
 * s'applique au mauvais mois, abîme des données réelles.
 */

/** Charge fixe minimale */
const charge = (description, extra = {}) => ({
  description, amount: 800, paidBy: 'vous', deleted: false, ...extra
});

/** Nœud fixedCharges à partir d'une liste */
const noeud = (...charges) => Object.fromEntries(charges.map((c, i) => [`k${i}`, c]));

const AOUT = '2026-08';

describe('Décision de reconduire', () => {
  it('reconduit les charges récurrentes du mois précédent', () => {
    const plan = planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: { '2026-07': { fixedCharges: noeud(charge('Loyer'), charge('Internet')) } }
    });

    expect(plan.source).toBe('2026-07');
    expect(plan.charges.map(c => c.description)).toEqual(['Loyer', 'Internet']);
  });

  it('laisse de côté les charges ponctuelles', () => {
    const plan = planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: {
        '2026-07': { fixedCharges: noeud(charge('Loyer'), charge('Réparation', { recurring: false })) }
      }
    });

    expect(plan.charges.map(c => c.description)).toEqual(['Loyer']);
  });

  it('une charge sans indicateur est tenue pour récurrente', () => {
    // C'est le défaut du formulaire, et les charges antérieures à
    // l'indicateur doivent suivre la même règle.
    const sansIndicateur = { description: 'Loyer', amount: 800, paidBy: 'vous' };
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: { '2026-07': { fixedCharges: { k0: sansIndicateur } } }
    });

    expect(plan.charges).toHaveLength(1);
  });

  it('ignore les charges supprimées', () => {
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: {
        '2026-07': { fixedCharges: noeud(charge('Loyer'), charge('Ancienne', { deleted: true })) }
      }
    });

    expect(plan.charges.map(c => c.description)).toEqual(['Loyer']);
  });

  it('un mois sauté n\'interrompt pas la reconduction', () => {
    // Un couple qui n'a rien saisi en juillet doit retrouver ses charges en
    // août, reprises de juin.
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: {
        '2026-06': { fixedCharges: noeud(charge('Loyer')) },
        '2026-07': { fixedCharges: {} }
      }
    });

    expect(plan.source).toBe('2026-06');
  });
});

describe('Ce qui doit rester intouché', () => {
  it('ne se rejoue pas : l\'empreinte fait foi', () => {
    // Sans cette garde, supprimer une charge reconduite la ferait réapparaître
    // à chaque ouverture du mois.
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: {
        '2026-07': { fixedCharges: noeud(charge('Loyer')) },
        '2026-08': { reconductedFrom: '2026-07' }
      }
    });

    expect(plan).toBeNull();
  });

  it('l\'empreinte tient même si toutes les charges ont été supprimées depuis', () => {
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: {
        '2026-07': { fixedCharges: noeud(charge('Loyer')) },
        '2026-08': { reconductedFrom: '2026-07', fixedCharges: noeud(charge('Loyer', { deleted: true })) }
      }
    });

    expect(plan).toBeNull();
  });

  it('un mois déjà garni n\'est pas un mois neuf', () => {
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: {
        '2026-07': { fixedCharges: noeud(charge('Loyer')) },
        '2026-08': { fixedCharges: noeud(charge('Loyer saisi à la main')) }
      }
    });

    expect(plan).toBeNull();
  });

  it('ne remonte jamais dans le passé', () => {
    // Ouvrir un mois ancien et vide est une consultation, pas une reprise
    // d'activité : y déverser les charges du mois d'avant réécrirait
    // l'histoire.
    const plan = planRecurrence({
      target: '2026-03',
      currentMonth: AOUT,
      periods: { '2026-02': { fixedCharges: noeud(charge('Loyer')) } }
    });

    expect(plan).toBeNull();
  });

  it('accepte un mois futur, préparé à l\'avance', () => {
    const plan = planRecurrence({
      target: '2026-09',
      currentMonth: AOUT,
      periods: { '2026-08': { fixedCharges: noeud(charge('Loyer')) } }
    });

    expect(plan.source).toBe(AOUT);
  });

  it('ne fait rien s\'il n\'existe aucun mois antérieur', () => {
    expect(planRecurrence({ target: AOUT, currentMonth: AOUT, periods: {} })).toBeNull();
  });

  it('ne fait rien si le mois précédent n\'a que des charges ponctuelles', () => {
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: { '2026-07': { fixedCharges: noeud(charge('Réparation', { recurring: false })) } }
    });

    expect(plan).toBeNull();
  });
});

describe('Robustesse des entrées', () => {
  it('des entrées absentes ou mal formées ne produisent aucun plan', () => {
    expect(planRecurrence({ target: AOUT, currentMonth: AOUT, periods: null })).toBeNull();
    expect(planRecurrence({ target: null, currentMonth: AOUT, periods: {} })).toBeNull();
    expect(planRecurrence({ target: 'pas-une-periode', currentMonth: AOUT, periods: {} })).toBeNull();
    expect(planRecurrence({ target: '2026-13', currentMonth: AOUT, periods: {} })).toBeNull();
  });

  it('les clés hors format sont écartées de la recherche de source', () => {
    // Le nœud periods a hébergé des écritures accidentelles sous
    // `periods/undefined`.
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: {
        'undefined': { fixedCharges: noeud(charge('Fantôme')) },
        '2026-07': { fixedCharges: noeud(charge('Loyer')) }
      }
    });

    expect(plan.source).toBe('2026-07');
    expect(plan.charges.map(c => c.description)).toEqual(['Loyer']);
  });

  it('une période sans nœud fixedCharges ne casse rien', () => {
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: { '2026-06': { fixedCharges: noeud(charge('Loyer')) }, '2026-07': {} }
    });

    expect(plan.source).toBe('2026-06');
  });
});

describe('Les charges variables : l\'indicateur doit être demandé', () => {
  /**
   * La règle est **l'inverse exacte** de celle des charges fixes, et c'est
   * délibéré. Une charge fixe sans `recurring` est récurrente — c'est le défaut
   * de son formulaire, et le loyer d'avant l'indicateur doit continuer d'être
   * reconduit. Appliquer ce défaut aux variables recopierait d'un coup tout ce
   * que le foyer a jamais saisi : chaque course, chaque restaurant, chaque
   * plein d'essence, tous les mois.
   */

  const PERIODS = {
    '2026-07': {
      fixedCharges: { f1: { description: 'Loyer', amount: 950 } },
      variableCharges: {
        v1: { description: 'Essence', amount: 78, recurring: true },
        v2: { description: 'Restaurant', amount: 46 },
        v3: { description: 'Cantine', amount: 120, recurring: true, deleted: true },
        v4: { description: 'Ponctuelle', amount: 12, recurring: false }
      }
    }
  };

  it('ne reconduit que celles marquées explicitement', () => {
    const plan = planRecurrence({ target: '2026-08', currentMonth: '2026-08', periods: PERIODS });
    expect(plan.variables.map(c => c.description)).toEqual(['Essence']);
  });

  it('une variable sans indicateur n\'est JAMAIS reconduite', () => {
    // Le contrôle qui empêche la catastrophe : « Restaurant » n'a pas demandé
    // à revenir, et ne doit pas revenir.
    const plan = planRecurrence({ target: '2026-08', currentMonth: '2026-08', periods: PERIODS });
    expect(plan.variables.map(c => c.description)).not.toContain('Restaurant');
  });

  it('une variable supprimée ne remonte pas, même marquée', () => {
    const plan = planRecurrence({ target: '2026-08', currentMonth: '2026-08', periods: PERIODS });
    expect(plan.variables.map(c => c.description)).not.toContain('Cantine');
  });

  it('les charges fixes gardent leur défaut : absent vaut récurrent', () => {
    // La règle opposée, vérifiée dans le même souffle pour que personne ne les
    // aligne par mégarde.
    const plan = planRecurrence({ target: '2026-08', currentMonth: '2026-08', periods: PERIODS });
    expect(plan.charges.map(c => c.description)).toEqual(['Loyer']);
  });

  it('un mois sans charge fixe mais avec une variable marquée est une source', () => {
    // Un foyer peut n'avoir aucune charge fixe et une essence mensuelle : ne
    // regarder que les fixes lui refuserait la reconduction sans rien dire.
    const plan = planRecurrence({
      target: '2026-08',
      currentMonth: '2026-08',
      periods: { '2026-07': { variableCharges: { v: { description: 'Essence', amount: 78, recurring: true } } } }
    });
    expect(plan).not.toBeNull();
    expect(plan.source).toBe('2026-07');
    expect(plan.charges).toEqual([]);
    expect(plan.variables).toHaveLength(1);
  });

  it('un mois sans rien de reconductible ne fait pas de plan', () => {
    expect(planRecurrence({
      target: '2026-08',
      currentMonth: '2026-08',
      periods: { '2026-07': { variableCharges: { v: { description: 'Restaurant', amount: 46 } } } }
    })).toBeNull();
  });

  it('un nœud de variables absent ou abîmé ne fait pas tomber le plan', () => {
    for (const variableCharges of [null, undefined, 'rien', 42]) {
      const plan = planRecurrence({
        target: '2026-08',
        currentMonth: '2026-08',
        periods: { '2026-07': { fixedCharges: { f: { description: 'Loyer', amount: 950 } }, variableCharges } }
      });
      expect(plan.variables).toEqual([]);
    }
  });
});
