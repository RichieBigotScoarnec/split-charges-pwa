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
