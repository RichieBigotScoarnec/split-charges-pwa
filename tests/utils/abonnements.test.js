import { describe, it, expect } from 'vitest';
import { planDeclarationFixe, questionDeConfirmation } from '../../public/js/utils/abonnements.js';
import { computeSummary } from '../../public/js/utils/calculations.js';

/**
 * Déclarer fixe ce qui revenait déjà chaque mois
 *
 * Le détecteur d'abonnements disait « Netflix revient chaque mois sans être
 * déclaré fixe », et laissait le foyer aller le ressaisir à la main. Ce module
 * décide de ce qu'il faut écrire pour que le constat devienne un geste.
 *
 * **Le piège est le double comptage.** L'abonnement est probablement déjà saisi
 * dans le mois affiché, en charge variable — c'est même le cas nominal, puisque
 * le détecteur ne se déclenche que sur des libellés saisis à la main tous les
 * mois. Écrire la charge fixe sans rien d'autre le compterait deux fois, et le
 * solde du couple avec.
 */

const INSTANT = 1756500000000;
const MOIS = '2026-08';

/** Ce que le détecteur propose */
const NETFLIX = { libelle: 'Netflix', montant: 13.49, payeur: 'vous', categorie: 'Loisirs' };
const SPORT = { libelle: 'Salle de sport', montant: 29.9, payeur: 'conjointe', categorie: 'Sport' };

/** Un mois où Netflix est DÉJÀ saisi en variable, et la salle de sport non */
const PERIODE = {
  variableCharges: {
    v1: {
      description: 'Netflix', amount: 13.49, category: 'Loisirs',
      paidBy: 'vous', date: '2026-08-04', deleted: false
    },
    v2: {
      description: 'Courses', amount: 84.3, category: 'Courses',
      paidBy: 'vous', date: '2026-08-06', deleted: false
    }
  },
  fixedCharges: {
    f1: {
      description: 'Loyer', amount: 900, category: 'Logement',
      paidBy: 'vous', date: '2026-08-01', recurring: true, deleted: false
    }
  }
};

const plan = (charges, periode = PERIODE) =>
  planDeclarationFixe({ charges, periode, mois: MOIS, instant: INSTANT });

describe('LA PROPRIÉTÉ : le total du mois ne bouge pas d\'un centime', () => {
  /**
   * Ce que le bilan compterait, une fois le plan appliqué.
   *
   * On rejoue le plan sur les charges du mois plutôt que de vérifier des
   * champs : c'est le TOTAL que le foyer lit, et c'est lui qui doit tenir.
   */
  const totalApres = (resultat, periode = PERIODE) => {
    const retires = new Set(resultat.aRetirer.map(charge => charge.id));

    return computeSummary({
      salaries: { vous: 3000, conjointe: 1000 },
      fixedCharges: [
        ...Object.values(periode.fixedCharges || {}),
        ...resultat.aEcrire
      ],
      variableCharges: Object.entries(periode.variableCharges || {})
        .filter(([cle]) => !retires.has(cle))
        .map(([, charge]) => charge),
      reimbursements: [],
      shareMode: 'prorata',
      customPercents: { vous: 50, conjointe: 50 }
    }).total;
  };

  const totalAvant = (periode = PERIODE) => computeSummary({
    salaries: { vous: 3000, conjointe: 1000 },
    fixedCharges: Object.values(periode.fixedCharges || {}),
    variableCharges: Object.values(periode.variableCharges || {}),
    reimbursements: [],
    shareMode: 'prorata',
    customPercents: { vous: 50, conjointe: 50 }
  }).total;

  it('une charge DÉJÀ saisie ce mois-ci ne compte pas deux fois', () => {
    // LE contrôle. Sans le déplacement, le mois gagnerait 13,49 € que personne
    // n'a dépensés — et le solde du couple avec.
    const resultat = plan([NETFLIX]);

    expect(resultat.aEcrire).toHaveLength(1);
    expect(resultat.aRetirer).toHaveLength(1);
    expect(totalApres(resultat)).toBeCloseTo(totalAvant(), 2);
  });

  it('et la charge fixe reprend le montant RÉELLEMENT saisi, pas celui de la fenêtre', () => {
    // Le détecteur propose le dernier montant connu ; le mois affiché peut en
    // porter un autre — un abonnement réévalué. C'est celui du mois qui fait
    // foi, sinon le total bougerait de la différence.
    const resultat = plan([{ ...NETFLIX, montant: 11.99 }]);

    expect(resultat.aEcrire[0].amount).toBeCloseTo(13.49, 2);
    expect(totalApres(resultat)).toBeCloseTo(totalAvant(), 2);
  });

  it('plusieurs saisies du même libellé dans le mois sont toutes déplacées', () => {
    // Le détecteur additionne les occurrences d'un mois ; le déplacement doit
    // faire de même, ou le reliquat serait compté en double.
    const periode = {
      ...PERIODE,
      variableCharges: {
        ...PERIODE.variableCharges,
        v3: {
          description: 'netflix', amount: 5, category: 'Loisirs',
          paidBy: 'vous', date: '2026-08-20', deleted: false
        }
      }
    };
    const resultat = plan([NETFLIX], periode);

    expect(resultat.aRetirer).toHaveLength(2);
    expect(resultat.aEcrire[0].amount).toBeCloseTo(18.49, 2);
    expect(totalApres(resultat, periode)).toBeCloseTo(totalAvant(periode), 2);
  });

  it('une charge PAS ENCORE saisie ajoute exactement son montant', () => {
    // Le pendant : le mois gagne la charge, et c'est juste — un prélèvement à
    // venir est ce qu'une charge fixe est.
    const resultat = plan([SPORT]);

    expect(resultat.aRetirer).toHaveLength(0);
    expect(totalApres(resultat)).toBeCloseTo(totalAvant() + 29.9, 2);
  });
});

describe('LE PAYEUR N\'EST JAMAIS DEVINÉ', () => {
  it('une charge sans payeur établi est écartée, et nommée', () => {
    // Un prélèvement avancé tantôt par l'un tantôt par l'autre n'a pas de
    // payeur : il en a deux. En choisir un ferait basculer le solde sur une
    // déduction que personne n'a validée.
    const resultat = plan([{ ...NETFLIX, payeur: null }]);

    expect(resultat.aEcrire).toHaveLength(0);
    expect(resultat.ecartees).toEqual([
      { libelle: 'Netflix', motif: 'payeur variable d\'un mois sur l\'autre' }
    ]);
  });

  it('et elle n\'emporte pas les autres', () => {
    const resultat = plan([{ ...NETFLIX, payeur: null }, SPORT]);

    expect(resultat.aEcrire.map(c => c.description)).toEqual(['Salle de sport']);
    expect(resultat.ecartees).toHaveLength(1);
  });

  it.each(['vous', 'conjointe', 'partage', 'both'])('« %s » est un payeur admis', (payeur) => {
    // Les quatre valeurs que les règles acceptent, et pas une de plus : une
    // cinquième serait refusée par le serveur après un toast de succès.
    expect(plan([{ ...SPORT, payeur }]).aEcrire).toHaveLength(1);
  });

  it.each(['moi', 'Vous', '', 'partagé'])('« %s » ne l\'est pas', (payeur) => {
    expect(plan([{ ...SPORT, payeur }]).aEcrire).toHaveLength(0);
  });
});

describe('Ce que le plan écarte encore', () => {
  it('une charge déjà déclarée fixe ce mois-ci', () => {
    // Le panneau la porte déjà : l'écrire une seconde fois la doublerait.
    const resultat = plan([{ ...NETFLIX, libelle: 'Loyer', montant: 900 }]);

    expect(resultat.aEcrire).toHaveLength(0);
    expect(resultat.ecartees[0].motif).toBe('déjà déclarée fixe ce mois-ci');
  });

  it('la comparaison des libellés ignore la casse et les espaces', () => {
    const resultat = plan([{ ...NETFLIX, libelle: '  LOYER  ', montant: 900 }]);

    expect(resultat.aEcrire).toHaveLength(0);
  });

  it('un montant inexploitable', () => {
    const resultat = plan([{ ...SPORT, montant: 0 }]);

    expect(resultat.aEcrire).toHaveLength(0);
    expect(resultat.ecartees[0].motif).toBe('montant inexploitable');
  });

  it('une dépense SOLO du mois n\'est ni déplacée ni comptée', () => {
    // Une charge perso ne pèse pas sur le solde : la verser dans une charge
    // fixe commune y ferait entrer une dépense qui en est sortie à dessein.
    const periode = {
      variableCharges: {
        v1: {
          description: 'Salle de sport', amount: 29.9, perimetre: 'solo',
          paidBy: 'conjointe', date: '2026-08-04', deleted: false
        }
      }
    };
    const resultat = plan([SPORT], periode);

    expect(resultat.aRetirer).toHaveLength(0);
    expect(resultat.aEcrire[0].amount).toBeCloseTo(29.9, 2);
  });

  it('une charge à la corbeille non plus', () => {
    const periode = {
      variableCharges: {
        v1: {
          description: 'Netflix', amount: 13.49,
          paidBy: 'vous', date: '2026-08-04', deleted: true
        }
      }
    };

    expect(plan([NETFLIX], periode).aRetirer).toHaveLength(0);
  });
});

describe('Ce que la charge écrite porte', () => {
  it('elle est récurrente : c\'est tout l\'objet du geste', () => {
    expect(plan([SPORT]).aEcrire[0].recurring).toBe(true);
  });

  it('elle est commune, et jamais solo', () => {
    expect(plan([SPORT]).aEcrire[0].perimetre).toBe('commun');
  });

  it('elle garde la date, l\'enveloppe et la répartition de ce qu\'elle remplace', () => {
    // La charge change de collection, elle ne se réinvente pas. `previsionnel`
    // lit cette date pour dire ce qui reste à passer ce mois-ci.
    const periode = {
      variableCharges: {
        v1: {
          description: 'Netflix', amount: 13.49, category: 'Loisirs',
          paidBy: 'vous', date: '2026-08-04', envelope: 'vacances',
          destination: 'Compte Joint', splitOverride: { mode: '50-50' }, deleted: false
        }
      }
    };
    const [charge] = plan([NETFLIX], periode).aEcrire;

    expect(charge.date).toBe('2026-08-04');
    expect(charge.envelope).toBe('vacances');
    expect(charge.destination).toBe('Compte Joint');
    expect(charge.splitOverride).toEqual({ mode: '50-50' });
  });

  it('et le premier du mois à défaut : `timestamp` ne dit que l\'instant d\'écriture', () => {
    expect(plan([SPORT]).aEcrire[0].date).toBe('2026-08-01');
  });

  it('une catégorie non établie retombe sur « Autre », jamais sur une inventée', () => {
    expect(plan([{ ...SPORT, categorie: null }]).aEcrire[0].category).toBe('Autre');
  });

  it('l\'instant vient de l\'appelant : ce module ne lit pas l\'horloge', () => {
    expect(plan([SPORT]).aEcrire[0].timestamp).toBe(INSTANT);
    expect(planDeclarationFixe({
      charges: [SPORT], periode: PERIODE, mois: MOIS, instant: 0
    }).aEcrire).toHaveLength(0);
  });
});

describe('Une entrée abîmée ne fabrique aucune écriture', () => {
  it.each([
    ['sans charges', { charges: [], periode: PERIODE, mois: MOIS, instant: INSTANT }],
    ['charges non tableau', { charges: null, periode: PERIODE, mois: MOIS, instant: INSTANT }],
    ['mois illisible', { charges: [SPORT], periode: PERIODE, mois: '2026-8', instant: INSTANT }],
    ['période absente', { charges: [SPORT], periode: null, mois: MOIS, instant: INSTANT }]
  ])('%s', (_, entree) => {
    const resultat = planDeclarationFixe(entree);

    // La période absente reste écrivable : c'est un mois vierge, pas une erreur.
    if (entree.periode === null) expect(resultat.aEcrire).toHaveLength(1);
    else expect(resultat.aEcrire).toHaveLength(0);
    expect(resultat.aRetirer).toHaveLength(0);
  });
});

describe('La question posée avant d\'écrire', () => {
  const euros = (montant) => `${montant.toFixed(2).replace('.', ',')} €`;

  it('nomme la charge et ce qu\'elle engage', () => {
    const question = questionDeConfirmation(plan([SPORT]), euros);

    expect(question).toContain('« Salle de sport »');
    expect(question).toContain('29,90 €');
    expect(question).toContain('reconduits automatiquement');
  });

  it('dit que le total du mois ne change pas, quand il y a déplacement', () => {
    // Sans cela, voir une charge quitter la liste des variables ressemblerait
    // à une suppression.
    expect(questionDeConfirmation(plan([NETFLIX]), euros))
      .toContain('le total du mois ne change pas');
  });

  it('et l\'accorde : UNE saisie se dit « La saisie de ce mois passe »', () => {
    // « Les saisie de ce mois passent » — l'article et le verbe étaient hors du
    // ternaire, donc au pluriel dans les deux cas. Le cas à une saisie est le
    // NOMINAL : le détecteur ne se déclenche que sur des libellés saisis une
    // fois par mois.
    expect(questionDeConfirmation(plan([NETFLIX]), euros))
      .toContain('La saisie de ce mois passe en charges fixes');
  });

  it('et au pluriel quand il y en a plusieurs', () => {
    // Le témoin de l'accord : sans lui, un correctif pourrait figer le
    // singulier partout et personne ne le verrait.
    const periode = {
      ...PERIODE,
      variableCharges: {
        ...PERIODE.variableCharges,
        v3: {
          description: 'Netflix', amount: 5, category: 'Loisirs',
          paidBy: 'vous', date: '2026-08-20', deleted: false
        }
      }
    };

    expect(questionDeConfirmation(plan([NETFLIX], periode), euros))
      .toContain('Les 2 saisies de ce mois passent en charges fixes');
  });

  it('et se tait là-dessus quand il n\'y en a pas', () => {
    expect(questionDeConfirmation(plan([SPORT]), euros))
      .not.toContain('le total du mois ne change pas');
  });

  it('compte les charges au pluriel', () => {
    const question = questionDeConfirmation(plan([NETFLIX, SPORT]), euros);

    expect(question).toContain('2 charges fixes');
    expect(question).toContain('43,39 €');
  });
});

describe('La répartition héritée est NOMMÉE avant qu\'on l\'accepte', () => {
  const euros = (montant) => `${montant.toFixed(2).replace('.', ',')} €`;

  /** Un mois où Netflix est saisi en variable, avec la dérogation demandée */
  const moisAvec = (splitOverride) => ({
    variableCharges: {
      v1: {
        description: 'Netflix', amount: 13.49, category: 'Loisirs',
        paidBy: 'vous', date: '2026-08-04', splitOverride, deleted: false
      }
    }
  });

  it('« 50/50 » figure dans la question quand la source en portait une', () => {
    // La charge fixe héritera de cette répartition (`abonnements.js:149`) — et
    // personne ne l'a choisie POUR UN ABONNEMENT : elle l'a été pour une saisie
    // ponctuelle. Le comportement ne change pas ; ce qui change, c'est qu'on
    // sache ce qu'on reconduit au moment de dire oui.
    const resultat = plan([NETFLIX], moisAvec({ mode: '50-50' }));

    expect(resultat.aEcrire[0].splitOverride).toEqual({ mode: '50-50' });
    expect(questionDeConfirmation(resultat, euros)).toContain('50/50');
  });

  it('et « 70/30 » quand elle était chiffrée, dans l\'ordre « vous / conjointe »', () => {
    // Même grammaire que les quatre autres surfaces, par la même fabrique :
    // `libelleDeLaRepartition`. Une cinquième écriture serait la neuvième
    // occurrence du défaut `normalizePair`.
    const resultat = plan([NETFLIX], moisAvec({ mode: 'custom', vous: 70, conjointe: 30 }));

    expect(questionDeConfirmation(resultat, euros)).toContain('70/30');
  });

  // LES TÉMOINS — sans eux, « ne rien ajouter » serait satisfait par une
  // implémentation qui n'ajoute jamais rien, et les deux contrôles ci-dessus
  // seraient les seuls à mesurer quoi que ce soit.

  it('TÉMOIN — sans dérogation, la question n\'en dit pas un mot', () => {
    // Le déplacement, lui, est bien annoncé : c'est le cas difficile, celui où
    // une saisie source EXISTE et n'a simplement rien à signaler.
    const question = questionDeConfirmation(plan([NETFLIX]), euros);

    expect(question).toContain('le total du mois ne change pas');
    expect(question).not.toMatch(/épartition/i);
    expect(question).not.toMatch(/\d+\/\d+/);
  });

  it('TÉMOIN — « prorata » non plus : le prédicat est celui des quatre autres surfaces', () => {
    // Les règles admettent ce mode (`database.rules.json:364`) ; il ne nomme
    // aucune division fixe et ne s'écarte de rien. `libelleDeLaRepartition`
    // rend '' — une implémentation qui lirait `splitOverride` elle-même
    // écrirait ici « Répartition prorata », et ce témoin tomberait.
    const question = questionDeConfirmation(plan([NETFLIX], moisAvec({ mode: 'prorata' })), euros);

    expect(question).not.toMatch(/épartition/i);
    expect(question).not.toMatch(/\d+\/\d+/);
  });
});
