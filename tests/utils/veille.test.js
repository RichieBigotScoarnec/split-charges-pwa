import { describe, it, expect } from 'vitest';
import {
  moisSuivant,
  memeDateLAnProchain,
  provisionARenouveler,
  rythmeDuBudget,
  chargesDisparues,
  veiller
} from '../../public/js/utils/veille.js';

/**
 * Ce que l'application remarque d'elle-même
 *
 * Le cas fondateur est réel, et il vient de l'usage : une enveloppe
 * « Vacances » à 1 009,81 € de dépenses, échéance au 29 août 2026, sur laquelle
 * la question utile n'est plus « où en est-on » mais « combien mettre de côté
 * chaque mois pour que l'an prochain soit déjà payé ».
 *
 * La réponse — 84,15 €/mois — se calcule sur ce que le séjour a RÉELLEMENT
 * coûté, pas sur les 800 € qui avaient été prévus. Reconduire l'objectif prévu
 * reproduirait une erreur que les faits ont déjà démentie de 26 %.
 */

/** L'enveloppe de la capture d'écran du foyer */
const VACANCES = {
  id: 'vacances',
  label: 'Vacances',
  icon: '🧳',
  nature: 'cagnotte',
  budget: 800,
  fin: '2026-08-29'
};

const DEPENSE_REELLE = 1009.81;

describe('moisSuivant', () => {
  it('avance d\'un mois', () => {
    expect(moisSuivant('2026-08')).toBe('2026-09');
  });

  it('passe l\'année sur décembre', () => {
    expect(moisSuivant('2026-12')).toBe('2027-01');
  });

  it('rend null sur une clé illisible', () => {
    expect(moisSuivant('pas-un-mois')).toBeNull();
    expect(moisSuivant('2026-13')).toBeNull();
    expect(moisSuivant(null)).toBeNull();
  });
});

describe('memeDateLAnProchain', () => {
  it('garde le quantième', () => {
    expect(memeDateLAnProchain('2026-08-29')).toBe('2027-08-29');
  });

  it('un 29 février devient un 28 quand l\'année suivante n\'est pas bissextile', () => {
    // 2024 est bissextile, 2025 non. Sans cette garde, la date déborderait sur
    // le 1er mars — une échéance déplacée d'un jour, et d'un mois à l'affichage.
    expect(memeDateLAnProchain('2024-02-29')).toBe('2025-02-28');
  });

  it('rend null sur une date illisible', () => {
    expect(memeDateLAnProchain('2026-08')).toBeNull();
    expect(memeDateLAnProchain(null)).toBeNull();
  });
});

describe('provisionARenouveler — le cas qui a motivé ce module', () => {
  it('propose 84,15 € par mois pour les vacances de l\'an prochain', () => {
    const vu = provisionARenouveler({
      enveloppe: VACANCES, depenseReelle: DEPENSE_REELLE, moisCourant: '2026-09'
    });

    expect(vu).not.toBeNull();
    // 1 009,81 / 12 — douze mois pleins à partir de septembre.
    expect(vu.montant).toBeCloseTo(84.15, 2);
    expect(vu.proposition.budget).toBeCloseTo(1009.81, 2);
    expect(vu.proposition.fin).toBe('2027-08-29');
    expect(vu.proposition.debut).toBe('2026-09-01');
  });

  it('la base est la dépense réelle, jamais l\'objectif qui a été démenti', () => {
    // 800 € avaient été prévus, 1 009,81 € ont été dépensés. Reconduire les
    // 800 € reproduirait l'erreur ; l'écart est donné, sans commentaire.
    const vu = provisionARenouveler({
      enveloppe: VACANCES, depenseReelle: DEPENSE_REELLE, moisCourant: '2026-09'
    });

    expect(vu.ecartAuPrevu).toBeCloseTo(209.81, 2);
    expect(vu.montant).not.toBeCloseTo(800 / 12, 2);
    expect(vu.fonde).toContain('1009.81');
  });

  it('se déclenche dès le mois de l\'échéance, en disant que le total est provisoire', () => {
    const vu = provisionARenouveler({
      enveloppe: VACANCES, depenseReelle: DEPENSE_REELLE, moisCourant: '2026-08'
    });

    expect(vu).not.toBeNull();
    expect(vu.fonde).toContain('à ce jour');
  });

  it('et une fois le mois passé, le total est présenté comme définitif', () => {
    const vu = provisionARenouveler({
      enveloppe: VACANCES, depenseReelle: DEPENSE_REELLE, moisCourant: '2026-10'
    });

    expect(vu.fonde).toContain('réellement dépensés');
    expect(vu.fonde).not.toContain('à ce jour');
  });

  it('se tait tant que l\'échéance est loin', () => {
    // Deux mois avant : c'est `etatProvision` qui suit la cagnotte en cours,
    // pas ce module. Deux voix sur le même sujet se contrediraient.
    expect(provisionARenouveler({
      enveloppe: VACANCES, depenseReelle: DEPENSE_REELLE, moisCourant: '2026-06'
    })).toBeNull();
  });

  it('se tait sur une enveloppe sans dépense : il n\'y a rien à reconduire', () => {
    expect(provisionARenouveler({
      enveloppe: VACANCES, depenseReelle: 0, moisCourant: '2026-09'
    })).toBeNull();
  });

  it('se tait sur une mensuelle : elle se recharge, elle ne vise pas une date', () => {
    expect(provisionARenouveler({
      enveloppe: { ...VACANCES, nature: 'mensuelle' },
      depenseReelle: DEPENSE_REELLE, moisCourant: '2026-09'
    })).toBeNull();
  });

  it('se tait sans échéance : il n\'y a pas de quoi diviser', () => {
    expect(provisionARenouveler({
      enveloppe: { ...VACANCES, fin: '' },
      depenseReelle: DEPENSE_REELLE, moisCourant: '2026-09'
    })).toBeNull();
  });
});

describe('rythmeDuBudget', () => {
  const COURSES = { id: 'courses', label: 'Courses', nature: 'mensuelle', budget: 600 };

  it('signale un budget qui ne tiendra pas le mois', () => {
    // 300 € en 10 jours sur un mois de 31 → 930 € projetés pour 600 € prévus.
    const vu = rythmeDuBudget({
      enveloppe: COURSES, depense: 300, jourDuMois: 10, joursDuMois: 31
    });

    expect(vu).not.toBeNull();
    expect(vu.montant).toBeCloseTo(930, 2);
    expect(vu.urgence).toBe('attention');
  });

  it('se tait quand le rythme tient', () => {
    // 150 € en 10 jours → 465 € projetés, sous les 600 €.
    expect(rythmeDuBudget({
      enveloppe: COURSES, depense: 150, jourDuMois: 10, joursDuMois: 31
    })).toBeNull();
  });

  it('se tait les premiers jours : une grosse course n\'est pas une tendance', () => {
    // 200 € au 2e jour projetteraient 3 100 €. C'est du bruit, pas un signal.
    expect(rythmeDuBudget({
      enveloppe: COURSES, depense: 200, jourDuMois: 2, joursDuMois: 31
    })).toBeNull();
  });

  it('se tait sur un budget déjà dépassé : la jauge le dit déjà', () => {
    expect(rythmeDuBudget({
      enveloppe: COURSES, depense: 650, jourDuMois: 20, joursDuMois: 31
    })).toBeNull();
  });

  it('se tait sans budget : il n\'y a rien à dépasser', () => {
    expect(rythmeDuBudget({
      enveloppe: { ...COURSES, budget: 0 }, depense: 300, jourDuMois: 10, joursDuMois: 31
    })).toBeNull();
  });

  it('se tait sur une cagnotte : elle se remplit, elle ne se consomme pas au mois', () => {
    expect(rythmeDuBudget({
      enveloppe: { ...COURSES, nature: 'cagnotte' }, depense: 300, jourDuMois: 10, joursDuMois: 31
    })).toBeNull();
  });
});

describe('chargesDisparues', () => {
  const mois = (...libelles) => ({
    fixedCharges: Object.fromEntries(
      libelles.map((l, i) => [`c${i}`, { description: l, amount: 100, deleted: false }])
    )
  });

  it('repère une charge habituelle absente du mois', () => {
    const vu = chargesDisparues({
      periods: {
        '2026-06': mois('Loyer', 'Assurance'),
        '2026-07': mois('Loyer', 'Assurance'),
        '2026-08': mois('Loyer')
      },
      moisCourant: '2026-08'
    });

    expect(vu).not.toBeNull();
    expect(vu.detail).toContain('assurance');
    expect(vu.detail).not.toContain('loyer');
  });

  it('se tait quand rien ne manque', () => {
    expect(chargesDisparues({
      periods: {
        '2026-06': mois('Loyer'),
        '2026-07': mois('Loyer'),
        '2026-08': mois('Loyer')
      },
      moisCourant: '2026-08'
    })).toBeNull();
  });

  it('une charge vue une seule fois ne fait pas une habitude', () => {
    expect(chargesDisparues({
      periods: {
        '2026-06': mois('Loyer', 'Cadeau exceptionnel'),
        '2026-07': mois('Loyer'),
        '2026-08': mois('Loyer')
      },
      moisCourant: '2026-08'
    })).toBeNull();
  });

  it('une charge supprimée ne compte pas comme présente', () => {
    const vu = chargesDisparues({
      periods: {
        '2026-06': mois('Loyer', 'Assurance'),
        '2026-07': mois('Loyer', 'Assurance'),
        '2026-08': {
          fixedCharges: {
            a: { description: 'Loyer', amount: 900, deleted: false },
            b: { description: 'Assurance', amount: 40, deleted: true }
          }
        }
      },
      moisCourant: '2026-08'
    });

    expect(vu.detail).toContain('assurance');
  });

  it('une dépense solo n\'engage pas le foyer : son absence ne le regarde pas', () => {
    expect(chargesDisparues({
      periods: {
        '2026-06': { fixedCharges: { a: { description: 'Salle de sport', perimetre: 'solo', paidBy: 'vous', deleted: false } } },
        '2026-07': { fixedCharges: { a: { description: 'Salle de sport', perimetre: 'solo', paidBy: 'vous', deleted: false } } },
        '2026-08': mois('Loyer')
      },
      moisCourant: '2026-08'
    })).toBeNull();
  });

  it('se tait sur un historique trop court pour établir une habitude', () => {
    expect(chargesDisparues({
      periods: { '2026-07': mois('Loyer'), '2026-08': {} },
      moisCourant: '2026-08'
    })).toBeNull();
  });
});

describe('veiller — l\'assemblage', () => {
  it('rend une liste vide quand tout va bien : c\'est le cas courant', () => {
    expect(veiller({ enveloppes: [], periods: null, moisCourant: '2026-08' })).toEqual([]);
  });

  it('ce qui demande une décision passe devant ce qui informe', () => {
    const vues = veiller({
      enveloppes: [
        { enveloppe: VACANCES, depense: DEPENSE_REELLE },
        { enveloppe: { id: 'courses', label: 'Courses', nature: 'mensuelle', budget: 600 }, depense: 300 }
      ],
      moisCourant: '2026-09',
      jourDuMois: 10,
      joursDuMois: 30
    });

    expect(vues.length).toBeGreaterThanOrEqual(2);
    expect(vues[0].urgence).toBe('attention');
    expect(vues[vues.length - 1].urgence).toBe('info');
  });

  it('supporte une entrée abîmée sans rien casser', () => {
    expect(() => veiller({
      enveloppes: [null, {}, { enveloppe: VACANCES, depense: undefined }],
      moisCourant: '2026-09'
    })).not.toThrow();
  });

  it('chaque observation dit sur quoi elle se fonde', () => {
    // La règle du module : un conseil dont on ne peut pas vérifier l'assise
    // n'est pas un conseil.
    const vues = veiller({
      enveloppes: [{ enveloppe: VACANCES, depense: DEPENSE_REELLE }],
      periods: {
        '2026-06': { fixedCharges: { a: { description: 'Assurance', deleted: false } } },
        '2026-07': { fixedCharges: { a: { description: 'Assurance', deleted: false } } },
        '2026-09': {}
      },
      moisCourant: '2026-09'
    });

    expect(vues.length).toBeGreaterThan(0);
    for (const vue of vues) {
      expect(vue.fonde, `« ${vue.titre} » doit dire sur quoi elle se fonde`).toBeTruthy();
      expect(vue.cle).toBeTruthy();
      expect(vue.titre).toBeTruthy();
    }
  });
});
