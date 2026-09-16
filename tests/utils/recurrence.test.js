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

    expect(plan.commun.source).toBe('2026-07');
    expect(plan.commun.charges.map(c => c.description)).toEqual(['Loyer', 'Internet']);
  });

  it('laisse de côté les charges ponctuelles', () => {
    const plan = planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: {
        '2026-07': { fixedCharges: noeud(charge('Loyer'), charge('Réparation', { recurring: false })) }
      }
    });

    expect(plan.commun.charges.map(c => c.description)).toEqual(['Loyer']);
  });

  it('une charge sans indicateur est tenue pour récurrente', () => {
    // C'est le défaut du formulaire, et les charges antérieures à
    // l'indicateur doivent suivre la même règle.
    const sansIndicateur = { description: 'Loyer', amount: 800, paidBy: 'vous' };
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: { '2026-07': { fixedCharges: { k0: sansIndicateur } } }
    });

    expect(plan.commun.charges).toHaveLength(1);
  });

  it('ignore les charges supprimées', () => {
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: {
        '2026-07': { fixedCharges: noeud(charge('Loyer'), charge('Ancienne', { deleted: true })) }
      }
    });

    expect(plan.commun.charges.map(c => c.description)).toEqual(['Loyer']);
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

    expect(plan.commun.source).toBe('2026-06');
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

    expect(plan.commun.source).toBe(AOUT);
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

    expect(plan.commun.source).toBe('2026-07');
    expect(plan.commun.charges.map(c => c.description)).toEqual(['Loyer']);
  });

  it('une période sans nœud fixedCharges ne casse rien', () => {
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT,
      periods: { '2026-06': { fixedCharges: noeud(charge('Loyer')) }, '2026-07': {} }
    });

    expect(plan.commun.source).toBe('2026-06');
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
    expect(plan.commun.variables.map(c => c.description)).toEqual(['Essence']);
  });

  it('une variable sans indicateur n\'est JAMAIS reconduite', () => {
    // Le contrôle qui empêche la catastrophe : « Restaurant » n'a pas demandé
    // à revenir, et ne doit pas revenir.
    const plan = planRecurrence({ target: '2026-08', currentMonth: '2026-08', periods: PERIODS });
    expect(plan.commun.variables.map(c => c.description)).not.toContain('Restaurant');
  });

  it('une variable supprimée ne remonte pas, même marquée', () => {
    const plan = planRecurrence({ target: '2026-08', currentMonth: '2026-08', periods: PERIODS });
    expect(plan.commun.variables.map(c => c.description)).not.toContain('Cantine');
  });

  it('les charges fixes gardent leur défaut : absent vaut récurrent', () => {
    // La règle opposée, vérifiée dans le même souffle pour que personne ne les
    // aligne par mégarde.
    const plan = planRecurrence({ target: '2026-08', currentMonth: '2026-08', periods: PERIODS });
    expect(plan.commun.charges.map(c => c.description)).toEqual(['Loyer']);
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
    expect(plan.commun.source).toBe('2026-07');
    expect(plan.commun.charges).toEqual([]);
    expect(plan.commun.variables).toHaveLength(1);
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
      expect(plan.commun.variables).toEqual([]);
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX POCHES (lot P1b)
 *
 * Le nœud reçu est FUSIONNÉ : ses collections portent le commun et les poches
 * personnelles qu'on a le droit de lire. Trois propriétés en découlent, et
 * aucune ne se déduit des deux autres.
 */

/** Une charge fixe personnelle */
const perso = (description, qui, extra = {}) => ({
  description, amount: 12, paidBy: qui, perimetre: 'solo', deleted: false, ...extra
});

describe('Le périmètre sépare deux décisions', () => {
  const HISTORIQUE = {
    '2026-07': {
      fixedCharges: {
        loyer: charge('Loyer'),
        amoi: perso('Salle de sport', 'vous'),
        aelle: perso('Yoga', 'conjointe')
      }
    }
  };

  it('le commun ne reconduit QUE le commun', () => {
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT, periods: HISTORIQUE, moi: 'vous'
    });

    expect(plan.commun.charges.map(c => c.description)).toEqual(['Loyer']);
  });

  it('ma poche ne reconduit QUE la mienne — jamais celle de l\'autre', () => {
    // On n'a aucun droit d'écriture chez l'autre, et il reconduira la sienne à
    // sa prochaine ouverture. Ses charges ne sont donc pas « écartées » :
    // elles ne sont pas de notre ressort.
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT, periods: HISTORIQUE, moi: 'vous'
    });

    expect(plan.personnel.charges.map(c => c.description)).toEqual(['Salle de sport']);
  });

  it('et le partage change de côté pour l\'autre compte', () => {
    // Le cas symétrique, sur le MÊME historique : c'est lui qui prouve que le
    // filtre lit `moi` et non un nom en dur.
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT, periods: HISTORIQUE, moi: 'conjointe'
    });

    expect(plan.commun.charges.map(c => c.description)).toEqual(['Loyer']);
    expect(plan.personnel.charges.map(c => c.description)).toEqual(['Yoga']);
  });

  it('sans emplacement connu, rien de personnel n\'est reconduit', () => {
    // Ne rien reconduire vaut mieux que de deviner une poche : une charge
    // reconduite chez l'autre serait refusée par les règles, et une charge
    // reconduite dans le commun serait PUBLIÉE.
    const plan = planRecurrence({
      target: AOUT, currentMonth: AOUT, periods: HISTORIQUE
    });

    expect(plan.personnel).toBeNull();
    expect(plan.commun.charges).toHaveLength(1);
  });
});

describe('« Un mois déjà garni » se compte POCHE PAR POCHE', () => {
  it('un abonnement personnel dans le mois cible ne bloque PAS le loyer', () => {
    // Compté sur le nœud fusionné, un seul abonnement personnel dans le mois
    // cible bloquerait la reconduction du LOYER — et rien ne le dirait. C'est
    // le défaut que ce cas ferme, et il est silencieux : un mois qui devait
    // s'ouvrir avec le loyer s'ouvre vide, ce qui se lit comme un mois où il
    // n'y a rien à payer.
    const plan = planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: {
        '2026-07': { fixedCharges: { loyer: charge('Loyer'), amoi: perso('Sport', 'vous') } },
        [AOUT]: { fixedCharges: { deja: perso('Sport', 'vous') } }
      },
      moi: 'vous'
    });

    expect(plan.commun.charges.map(c => c.description)).toEqual(['Loyer']);
  });

  it('LE TÉMOIN — et ce même abonnement bloque bien MA poche', () => {
    // Sans lui, le cas ci-dessus serait satisfait par un compte qui ne mesure
    // plus rien du tout : « garni » cesserait d'arrêter quoi que ce soit, et
    // chaque ouverture redéposerait la charge.
    const plan = planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: {
        '2026-07': { fixedCharges: { loyer: charge('Loyer'), amoi: perso('Sport', 'vous') } },
        [AOUT]: { fixedCharges: { deja: perso('Sport', 'vous') } }
      },
      moi: 'vous'
    });

    expect(plan.personnel).toBeNull();
  });

  it('une charge COMMUNE dans le mois cible ne bloque pas ma poche', () => {
    // Le sens inverse, et il compte autant : le foyer a saisi le loyer à la
    // main, mon abonnement personnel doit revenir quand même.
    const plan = planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: {
        '2026-07': { fixedCharges: { loyer: charge('Loyer'), amoi: perso('Sport', 'vous') } },
        [AOUT]: { fixedCharges: { saisi: charge('Loyer') } }
      },
      moi: 'vous'
    });

    expect(plan.commun).toBeNull();
    expect(plan.personnel.charges.map(c => c.description)).toEqual(['Sport']);
  });
});

describe('Chaque poche porte SON empreinte', () => {
  const HISTORIQUE = {
    '2026-07': { fixedCharges: { loyer: charge('Loyer'), amoi: perso('Sport', 'vous') } }
  };

  it('l\'empreinte du commun n\'arrête pas la poche', () => {
    // C'est la raison d'être de la seconde empreinte : celui des deux qui
    // ouvre l'application le premier réserve celle du mois commun, et la poche
    // de l'autre ne serait alors JAMAIS reconduite.
    const plan = planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: { ...HISTORIQUE, [AOUT]: { reconductedFrom: '2026-07' } },
      moi: 'vous'
    });

    expect(plan.commun).toBeNull();
    expect(plan.personnel.charges).toHaveLength(1);
  });

  it('et l\'empreinte de la poche n\'arrête pas le commun', () => {
    const plan = planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: HISTORIQUE,
      moi: 'vous',
      empreintePersonnelle: '2026-07'
    });

    expect(plan.personnel).toBeNull();
    expect(plan.commun.charges).toHaveLength(1);
  });

  it('les deux empreintes posées : aucun plan', () => {
    expect(planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: { ...HISTORIQUE, [AOUT]: { reconductedFrom: '2026-07' } },
      moi: 'vous',
      empreintePersonnelle: '2026-07'
    })).toBeNull();
  });
});

describe('Les deux mois sources sont INDÉPENDANTS', () => {
  it('ma poche peut venir d\'un mois plus ancien que le commun', () => {
    // Un mois où le foyer a des charges fixes mais où je n'ai rien de
    // personnel ne doit pas interrompre ma reconduction — la recherche de
    // source est faite poche par poche, et c'est ce qui la rend vraie.
    const plan = planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: {
        '2026-05': { fixedCharges: { amoi: perso('Sport', 'vous') } },
        '2026-07': { fixedCharges: { loyer: charge('Loyer') } }
      },
      moi: 'vous'
    });

    expect(plan.commun.source).toBe('2026-07');
    expect(plan.personnel.source).toBe('2026-05');
  });

  it('un foyer sans aucune charge fixe commune garde sa reconduction personnelle', () => {
    const plan = planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: { '2026-07': { fixedCharges: { amoi: perso('Sport', 'vous') } } },
      moi: 'vous'
    });

    expect(plan.commun).toBeNull();
    expect(plan.personnel.charges).toHaveLength(1);
  });

  it('une variable personnelle marquée est reconductible, elle aussi', () => {
    const plan = planRecurrence({
      target: AOUT,
      currentMonth: AOUT,
      periods: {
        '2026-07': {
          variableCharges: {
            v: perso('Essence perso', 'vous', { amount: 60, recurring: true })
          }
        }
      },
      moi: 'vous'
    });

    expect(plan.commun).toBeNull();
    expect(plan.personnel.variables).toHaveLength(1);
  });
});
