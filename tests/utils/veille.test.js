import { describe, it, expect } from 'vitest';
import {
  themesARenouveler,
  libelleRenouvele,
  moisSuivant,
  memeDateLAnProchain,
  provisionARenouveler,
  rythmeDuBudget,
  chargesDisparues,
  veiller
} from '../../public/js/utils/veille.js';
// Les montants sont comparés PAR LA FABRIQUE, jamais par une chaîne écrite à
// la main : `toContain('512.00')` verrouillait le point décimal anglais que
// ces cartes affichaient — le test tenait le défaut en place. Comparer à
// `formatCurrency(512)` dit ce qu'on veut vraiment (le montant paraît, écrit
// comme l'application écrit les montants) et suivra une évolution du format.
import { formatCurrency } from '../../public/js/utils/format.js';

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
    expect(vu.fonde).toContain(formatCurrency(1009.81));
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
      enveloppe: COURSES, moisCourant: '2026-08', moisReel: '2026-08', depense: 300, jourDuMois: 10, joursDuMois: 31
    });

    expect(vu).not.toBeNull();
    expect(vu.montant).toBeCloseTo(930, 2);
    expect(vu.urgence).toBe('attention');
  });

  it('se tait quand le rythme tient', () => {
    // 150 € en 10 jours → 465 € projetés, sous les 600 €.
    expect(rythmeDuBudget({
      enveloppe: COURSES, moisCourant: '2026-08', moisReel: '2026-08', depense: 150, jourDuMois: 10, joursDuMois: 31
    })).toBeNull();
  });

  it('se tait les premiers jours : une grosse course n\'est pas une tendance', () => {
    // 200 € au 2e jour projetteraient 3 100 €. C'est du bruit, pas un signal.
    expect(rythmeDuBudget({
      enveloppe: COURSES, moisCourant: '2026-08', moisReel: '2026-08', depense: 200, jourDuMois: 2, joursDuMois: 31
    })).toBeNull();
  });

  it('se tait sur un budget déjà dépassé : la jauge le dit déjà', () => {
    expect(rythmeDuBudget({
      enveloppe: COURSES, moisCourant: '2026-08', moisReel: '2026-08', depense: 650, jourDuMois: 20, joursDuMois: 31
    })).toBeNull();
  });

  it('se tait sans budget : il n\'y a rien à dépasser', () => {
    expect(rythmeDuBudget({
      enveloppe: { ...COURSES, budget: 0 }, moisCourant: '2026-08', moisReel: '2026-08', depense: 300, jourDuMois: 10, joursDuMois: 31
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
        // `depenseDuMois` : le rythme d'une mensuelle se juge sur le mois
        // affiché, jamais sur le cumul.
        { enveloppe: { id: 'courses', label: 'Courses', nature: 'mensuelle', budget: 600 }, depenseDuMois: 300 }
      ],
      moisCourant: '2026-09',
      moisReel: '2026-09',
      jourDuMois: 10,
      joursDuMois: 30
    });

    expect(vues.length).toBeGreaterThanOrEqual(2);
    expect(vues[0].urgence).toBe('attention');
    expect(vues[vues.length - 1].urgence).toBe('info');
  });

  describe('DEUX TOTAUX, PAS UN : le cumul ne projette pas un budget mensuel', () => {
    // Le câblage passait la même valeur — le cumul de tous les mois — aux deux
    // mesures. La provision en a besoin ; le rythme mensuel, jamais.
    //
    // Mesuré sur le défaut : « Courses », budget 600 €, 200 € en juillet et
    // 150 € en août, au 10 du mois. Le cumul de 350 € projetait 1 085 € et
    // criait « ne tiendra pas le mois » — quand août seul projette 465 € et
    // tient largement. La carte se déclenchait tous les mois, sur toute
    // enveloppe mensuelle ayant un passé.
    const COURSES = { id: 'courses', label: 'Courses', nature: 'mensuelle', budget: 600 };

    it('un mois qui tient ne déclenche rien, même avec un passé chargé', () => {
      const vues = veiller({
        enveloppes: [{ enveloppe: COURSES, depense: 350, depenseDuMois: 150 }],
        moisCourant: '2026-08', moisReel: '2026-08', jourDuMois: 10, joursDuMois: 31
      });

      expect(vues.filter(v => v.cle.startsWith('rythme-du-budget'))).toHaveLength(0);
    });

    it('et un mois qui ne tient pas le déclenche bien', () => {
      // Le témoin positif : sans lui, un câblage qui ne passerait jamais rien
      // satisferait le contrôle ci-dessus.
      const vues = veiller({
        enveloppes: [{ enveloppe: COURSES, depense: 350, depenseDuMois: 300 }],
        moisCourant: '2026-08', moisReel: '2026-08', jourDuMois: 10, joursDuMois: 31
      });

      const rythme = vues.find(v => v.cle.startsWith('rythme-du-budget'));
      expect(rythme).toBeDefined();
      expect(rythme.montant).toBeCloseTo(930, 2);
    });

    it('un mois RÉVOLU ne se projette pas : il est connu', () => {
      // `moisCourant` vient du sélecteur, `jourDuMois` de l'horloge. Sans le
      // rapprochement, choisir un juillet clos projetait ses dépenses sur les
      // dix jours écoulés d'août et annonçait qu'un budget déjà soldé « ne
      // tiendra pas le mois ». Même garde que `rythmeDuMois`.
      const vues = veiller({
        enveloppes: [{ enveloppe: COURSES, depense: 350, depenseDuMois: 300 }],
        moisCourant: '2026-07', moisReel: '2026-08', jourDuMois: 10, joursDuMois: 31
      });

      expect(vues.filter(v => v.cle.startsWith('rythme-du-budget'))).toHaveLength(0);
    });

    it('sans mois réel, la mesure se tait plutôt que de supposer', () => {
      const vues = veiller({
        enveloppes: [{ enveloppe: COURSES, depense: 350, depenseDuMois: 300 }],
        moisCourant: '2026-08', jourDuMois: 10, joursDuMois: 31
      });

      expect(vues.filter(v => v.cle.startsWith('rythme-du-budget'))).toHaveLength(0);
    });

    it('sans le total du mois, la mesure se tait plutôt que de reprendre le cumul', () => {
      // Le silence, jamais un chiffre faux : un appelant qui oublie le champ
      // paie une observation manquante, pas une fausse alerte.
      const vues = veiller({
        enveloppes: [{ enveloppe: COURSES, depense: 350 }],
        moisCourant: '2026-08', moisReel: '2026-08', jourDuMois: 10, joursDuMois: 31
      });

      expect(vues.filter(v => v.cle.startsWith('rythme-du-budget'))).toHaveLength(0);
    });
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

describe('Le nom de l\'enveloppe qui prend la suite', () => {
  it('porte l\'année de sa propre échéance', () => {
    // Renouveler ne peut pas vouloir dire « réutiliser celle-ci » : l'ancienne
    // porte les dépenses de l'année écoulée, et son pot les versements qui les
    // ont financées. Repousser son échéance ferait démarrer le nouveau cycle
    // avec 1 009,81 € déjà dépensés.
    expect(libelleRenouvele('Vacances', '2027-08-29')).toBe('Vacances 2027');
  });

  it('remplace une année déjà présente au lieu de l\'empiler', () => {
    expect(libelleRenouvele('Vacances 2026', '2027-08-29')).toBe('Vacances 2027');
    expect(libelleRenouvele('Vacances 2026', '2028-08-29')).toBe('Vacances 2028');
  });

  it('ne prend pas un nombre du milieu pour une année', () => {
    expect(libelleRenouvele('Chantier 2 pièces', '2027-01-01')).toBe('Chantier 2 pièces 2027');
  });

  it('supporte l\'absence d\'échéance lisible', () => {
    expect(libelleRenouvele('Vacances', '')).toBe('Vacances');
    expect(libelleRenouvele(null, '2027-01-01')).toBe('2027');
  });
});

/**
 * LE THÈME SE TRANSMET AU RENOUVELLEMENT
 *
 * `libelleRenouvele` fait de la suivante une enveloppe NEUVE, estampillée de
 * son année — délibérément : repousser l'échéance de l'ancienne ferait démarrer
 * le cycle avec les dépenses de l'année écoulée. Mais neuve, elle naissait sans
 * thème, et quittait le groupe l'année même où le bilan par thème doit servir.
 */
describe('Le renouvellement reste dans son groupe', () => {
  const cagnotte = (theme) => ({
    id: 'vacances-2026', label: 'Vacances 2026', icon: '🏖️',
    nature: 'cagnotte', budget: 800, fin: '2026-08-29', theme
  });

  it('reporte le thème sur la proposition', () => {
    const vue = provisionARenouveler({
      enveloppe: cagnotte('Vacances'), depenseReelle: 1244, moisCourant: '2026-08'
    });

    expect(vue).not.toBe(null);
    expect(vue.proposition.theme).toBe('Vacances');
    // Le libellé change d'année, le thème non : c'est ce qui les relie.
    expect(vue.proposition.label).not.toBe('Vacances 2026');
  });

  it('et rend null quand l\'enveloppe n\'en porte aucun', () => {
    const vue = provisionARenouveler({
      enveloppe: cagnotte(null), depenseReelle: 1244, moisCourant: '2026-08'
    });

    expect(vue).not.toBe(null);
    expect(vue.proposition.theme).toBe(null);
  });
});

/**
 * LE BILAN D'UN CYCLE DE THÈME — la question que le foyer a posée
 *
 * « Si j'ai plusieurs budgets vacances ou week-ends, combien j'ai dépensé en
 * tout, et combien mensualiser — ou, si une mensualisation existe déjà, combien
 * ajouter ou baisser ? »
 *
 * `provisionARenouveler` y répond pour UNE enveloppe et ne sait pas additionner.
 */
describe('Le cycle d\'un thème', () => {
  const cagnotte = (id, label, theme, budget, fin) => ({
    id, label, icon: '🏖️', nature: 'cagnotte', budget, fin, theme, cloturee: false
  });

  /** Deux séjours arrivés à terme, un troisième qui court encore */
  const entrees = [
    { enveloppe: cagnotte('v26', 'Vacances 2026', 'Vacances', 800, '2026-08-29'), depense: 1500 },
    { enveloppe: cagnotte('wt', 'Week-end Toussaint', 'Vacances', 400, '2026-11-02'), depense: 980 },
    { enveloppe: cagnotte('v27', 'Vacances 2027', 'Vacances', 1200, '2027-08-29'), depense: 0 }
  ];

  it('additionne ce que le cycle a coûté', () => {
    const [vue] = themesARenouveler({ enveloppes: entrees, moisCourant: '2027-02' });

    expect(vue).toBeDefined();
    expect(vue.titre).toContain('Vacances');
    expect(vue.titre).toContain(formatCurrency(2480));
    expect(vue.fonde).toContain('Vacances 2026');
    expect(vue.fonde).toContain('Week-end Toussaint');
  });

  /**
   * LA PROPRIÉTÉ, et ce qu'elle garantit — ni plus, ni moins
   *
   * Le total mensuel du thème doit être la somme des montants que
   * `provisionARenouveler` annonce pour chacune de ses enveloppes — celles-là
   * mêmes qui s'affichent juste en dessous sur le même écran.
   *
   * **Ce contrôle ne peut PAS distinguer cette somme d'un `total ÷ 12`.**
   * `memeDateLAnProchain` rend toujours douze mois, donc `Σ(dᵢ/12)` et
   * `(Σdᵢ)/12` sont arithmétiquement égaux : mesuré 206,6667 des deux côtés.
   * Le mutant correspondant est ÉQUIVALENT, et le dire vaut mieux que
   * prétendre le contraire.
   *
   * Ce qu'il attrape réellement : toute fenêtre AUTRE que celle des cartes.
   * `total ÷ 6` le fait tomber.
   */
  it('sa part mensuelle est la SOMME de celles de ses composantes', () => {
    const [vue] = themesARenouveler({ enveloppes: entrees, moisCourant: '2027-02' });

    const composantes = entrees
      .map(e => provisionARenouveler({
        enveloppe: e.enveloppe, depenseReelle: e.depense, moisCourant: '2027-02'
      }))
      .filter(Boolean);

    // Le témoin positif : sans lui, deux fabriques également fausses
    // satisferaient l'égalité.
    expect(composantes).toHaveLength(2);
    expect(composantes[0].montant).not.toBeCloseTo(composantes[1].montant, 2);

    const somme = composantes.reduce((total, c) => total + c.montant, 0);
    expect(vue.montant).toBeCloseTo(somme, 2);
  });

  it('dit combien il faut AJOUTER quand les provisions en cours n\'y suffisent pas', () => {
    const [vue] = themesARenouveler({ enveloppes: entrees, moisCourant: '2027-02' });

    // « Vacances 2027 » court encore : 1 200 € sur les mois qui restent.
    expect(vue.detail).toContain('il manque');
    expect(vue.detail).toContain('Vos provisions en cours totalisent');
  });

  it('et combien on peut BAISSER quand elles dépassent', () => {
    const genereuse = [
      ...entrees.slice(0, 2),
      { enveloppe: cagnotte('v27', 'Vacances 2027', 'Vacances', 9000, '2027-04-29'), depense: 0 }
    ];
    const [vue] = themesARenouveler({ enveloppes: genereuse, moisCourant: '2027-02' });

    expect(vue.detail).toContain('vous pouvez baisser de');
  });

  it('le dit aussi quand rien n\'est encore provisionné', () => {
    const [vue] = themesARenouveler({ enveloppes: entrees.slice(0, 2), moisCourant: '2027-02' });

    expect(vue.detail).toContain('Aucune provision en cours');
  });

  it('se tait sous deux enveloppes à terme : une seule carte dit déjà tout', () => {
    expect(themesARenouveler({
      enveloppes: [entrees[0], entrees[2]], moisCourant: '2027-02'
    })).toEqual([]);
  });

  it('ne mêle pas deux thèmes', () => {
    const deux = [
      ...entrees.slice(0, 2),
      { enveloppe: cagnotte('t1', 'Cuisine', 'Travaux', 500, '2026-05-01'), depense: 600 },
      { enveloppe: cagnotte('t2', 'Salle de bain', 'Travaux', 500, '2026-06-01'), depense: 700 }
    ];
    const vues = themesARenouveler({ enveloppes: deux, moisCourant: '2027-02' });

    expect(vues).toHaveLength(2);
    const travaux = vues.find(v => v.titre.includes('Travaux'));
    expect(travaux.titre).toContain(formatCurrency(1300));
    expect(travaux.titre).not.toContain(formatCurrency(2480));
  });

  it('réunit les orthographes d\'un même thème', () => {
    const variantes = [
      { enveloppe: cagnotte('a', 'Été', 'Week-end', 400, '2026-08-01'), depense: 500 },
      { enveloppe: cagnotte('b', 'Toussaint', 'week end', 400, '2026-11-01'), depense: 300 }
    ];
    const vues = themesARenouveler({ enveloppes: variantes, moisCourant: '2027-02' });

    expect(vues).toHaveLength(1);
    expect(vues[0].titre).toContain(formatCurrency(800));
  });

  it('ne porte AUCUNE proposition : le même argent serait compté deux fois', () => {
    // `anticiper` additionne les montants de toutes les cartes qui en portent
    // une pour juger la capacité d'épargne. Une proposition ici ferait compter
    // le total du thème EN PLUS de ses composantes.
    const [vue] = themesARenouveler({ enveloppes: entrees, moisCourant: '2027-02' });

    expect(vue.proposition).toBeUndefined();
  });

  it('ignore les enveloppes sans thème, et les entrées illisibles', () => {
    const sansTheme = entrees.map(e => ({ ...e, enveloppe: { ...e.enveloppe, theme: null } }));

    expect(themesARenouveler({ enveloppes: sansTheme, moisCourant: '2027-02' })).toEqual([]);
    expect(themesARenouveler({ enveloppes: null, moisCourant: '2027-02' })).toEqual([]);
    expect(themesARenouveler({ enveloppes: [null], moisCourant: '2027-02' })).toEqual([]);
  });
});
