import { describe, it, expect } from 'vitest';
import {
  planRecurrence, moisDontLEmpreinteDecide, messageDeReconduction, libelleComparable
} from '../../public/js/utils/recurrence.js';

/**
 * Le point ouvert 8 : une charge fixe posée d'avance bloquait un mois pour
 * toujours — et le mois suivant le prenait pour source, si bien que le loyer
 * disparaissait de TOUTE la suite. Mesuré en phase A du lot 2 (2026-11-01).
 *
 * Deux règles remplacent la garde « mois déjà garni », et ce fichier tient les
 * deux, avec les scénarios de la phase A sous leurs noms :
 *
 *   R5 — un mois sans empreinte ne sert de source que si aucun mois antérieur
 *        ne porte de charges reconductibles ACTIVES, poche par poche ;
 *   D2 — une copie n'est écartée que par un homonyme de même poche, même
 *        collection, lui-même reconductible, compté en multiplicité.
 *
 * L'horloge est figée par construction : `currentMonth` est un paramètre, et ce
 * module ne lit jamais `Date`.
 */

const NOV = '2026-11';
const DEC = '2026-12';
const OCT = '2026-10';

const fixe = (description, extra = {}) => ({
  description, amount: 100, paidBy: 'vous', deleted: false, ...extra
});
const variable = (description, extra = {}) => fixe(description, { amount: 0, recurring: true, ...extra });
const perso = (description, qui = 'vous', extra = {}) => fixe(description, {
  paidBy: qui, perimetre: 'solo', ...extra
});

const noeud = (...charges) => Object.fromEntries(charges.map((c, i) => [`k${i}`, c]));
const libelles = (charges) => charges.map(c => c.description).sort();

/**
 * Joue le plan du commun comme le ferait `reconduction.js` : copie et empreinte
 *
 * C'est ce qui laisse mesurer la CHAÎNE — le défaut d'origine n'était pas dans
 * le mois bloqué, il était dans celui d'après.
 */
function ouvrir(periods, target, currentMonth = target) {
  const plan = planRecurrence({ target, currentMonth, periods })?.commun;
  if (!plan) return periods;

  const mois = periods[target] || {};
  const copies = Object.fromEntries(plan.charges.map((c, i) => [`copie${i}`, c]));
  const copiesV = Object.fromEntries(plan.variables.map((c, i) => [`copieV${i}`, c]));
  return {
    ...periods,
    [target]: {
      ...mois,
      reconductedFrom: plan.source,
      fixedCharges: { ...mois.fixedCharges, ...copies },
      variableCharges: { ...mois.variableCharges, ...copiesV }
    }
  };
}

const fixesDe = (periods, mois) => libelles(Object.values(periods[mois]?.fixedCharges || {}));

describe('a, b, c — un mois futur garni à la main est reconduit, sans doublon', () => {
  it('a. une charge fixe posée en novembre AVANT sa première ouverture', () => {
    const periods = {
      [OCT]: { fixedCharges: noeud(fixe('Loyer'), fixe('Internet')) },
      [NOV]: { fixedCharges: noeud(fixe('Assurance')) }
    };

    const plan = planRecurrence({ target: NOV, currentMonth: NOV, periods }).commun;

    expect(plan.source).toBe(OCT);
    expect(libelles(plan.charges)).toEqual(['Internet', 'Loyer']);
    expect(fixesDe(ouvrir(periods, NOV), NOV)).toEqual(['Assurance', 'Internet', 'Loyer']);
  });

  it('a. et décembre reçoit les TROIS : la cascade du loyer perdu est refermée', () => {
    let periods = {
      [OCT]: { fixedCharges: noeud(fixe('Loyer'), fixe('Internet')) },
      [NOV]: { fixedCharges: noeud(fixe('Assurance')) }
    };
    periods = ouvrir(periods, NOV);
    periods = ouvrir(periods, DEC);

    expect(periods[DEC].reconductedFrom).toBe(NOV);
    expect(fixesDe(periods, DEC)).toEqual(['Assurance', 'Internet', 'Loyer']);
  });

  it('b. la même chose dans un mois lointain : mars, puis avril', () => {
    let periods = {
      [OCT]: { fixedCharges: noeud(fixe('Loyer')) },
      '2027-03': { fixedCharges: noeud(fixe('Assurance')) }
    };
    for (const mois of [NOV, DEC, '2027-01', '2027-02', '2027-03', '2027-04']) {
      periods = ouvrir(periods, mois);
    }

    expect(fixesDe(periods, '2027-02')).toEqual(['Loyer']);
    expect(fixesDe(periods, '2027-03')).toEqual(['Assurance', 'Loyer']);
    expect(fixesDe(periods, '2027-04')).toEqual(['Assurance', 'Loyer']);
  });

  it('c. une charge déplacée vers un mois non reconduit le garnit sans le bloquer', () => {
    // La porte du lot 1 : Netflix a quitté octobre pour novembre.
    const periods = {
      [OCT]: { fixedCharges: noeud(fixe('Loyer')) },
      [NOV]: { fixedCharges: noeud(fixe('Netflix')) }
    };

    expect(fixesDe(ouvrir(periods, NOV), NOV)).toEqual(['Loyer', 'Netflix']);
  });
});

describe('R5 — la source', () => {
  const C = () => ({
    [OCT]: { fixedCharges: noeud(fixe('Loyer'), fixe('Internet')) },
    [NOV]: { fixedCharges: noeud(fixe('Assurance')) }
  });

  it('C. foyer installé, novembre jamais ouvert, une charge posée d\'avance : la cascade est coupée', () => {
    const plan = planRecurrence({ target: DEC, currentMonth: NOV, periods: C() }).commun;

    expect(plan.source).toBe(OCT);
    expect(libelles(plan.charges)).toEqual(['Internet', 'Loyer']);
  });

  it('M2. mois sauté : la même chose, décembre ouvert EN décembre', () => {
    // C'est le cas qui sépare R5 de « un mois présent ou futur non reconduit
    // n'est pas une source » : novembre est passé, cette règle-là l'accepte.
    const plan = planRecurrence({ target: DEC, currentMonth: DEC, periods: C() }).commun;

    expect(plan.source).toBe(OCT);
  });

  it('M1. mois sauté sans rien dedans : la source reste octobre', () => {
    const periods = { [OCT]: { fixedCharges: noeud(fixe('Loyer')) } };

    expect(planRecurrence({ target: DEC, currentMonth: DEC, periods }).commun.source).toBe(OCT);
  });

  it('S1. démarrage : novembre saisi à la main, décembre ouvert en décembre', () => {
    const periods = { [NOV]: { fixedCharges: noeud(fixe('Loyer')) } };

    expect(planRecurrence({ target: DEC, currentMonth: DEC, periods }).commun.source).toBe(NOV);
  });

  it('S2. démarrage : le même, décembre ouvert D\'AVANCE en novembre', () => {
    const periods = { [NOV]: { fixedCharges: noeud(fixe('Loyer')) } };

    expect(planRecurrence({ target: DEC, currentMonth: NOV, periods }).commun.source).toBe(NOV);
  });

  it('E. démarrage : décembre saisi d\'avance, janvier ouvert d\'avance', () => {
    const periods = { [DEC]: { fixedCharges: noeud(fixe('Loyer')) } };

    expect(planRecurrence({ target: '2027-01', currentMonth: NOV, periods }).commun.source).toBe(DEC);
  });

  it('un mois PORTANT son empreinte reste une source, quoi qu\'il y ait avant', () => {
    const periods = {
      [OCT]: { fixedCharges: noeud(fixe('Loyer')) },
      [NOV]: { reconductedFrom: OCT, fixedCharges: noeud(fixe('Loyer'), fixe('Assurance')) }
    };

    expect(planRecurrence({ target: DEC, currentMonth: DEC, periods }).commun.source).toBe(NOV);
  });

  it('LE TÉMOIN RÉEL D\'AOÛT — une reconductible SUPPRIMÉE ne disqualifie pas un mois de démarrage', () => {
    // Relevé sur la sauvegarde du 2026-11-01 : deux charges fixes supprimées en
    // août, dont une de 400 € récurrente, et rien d'actif. Le foyer saisit ses
    // charges en novembre : c'est un mois de démarrage. Compter les supprimées
    // choisirait août, qui n'a rien à copier, et décembre ne recevrait rien.
    const periods = {
      '2026-08': {
        fixedCharges: {
          a: fixe('Ponctuelle', { amount: 37, recurring: false, deleted: true }),
          b: fixe('Récurrente', { amount: 400, recurring: true, deleted: true })
        }
      },
      [NOV]: { fixedCharges: noeud(fixe('Loyer')) }
    };

    const plan = planRecurrence({ target: DEC, currentMonth: DEC, periods }).commun;

    expect(plan.source).toBe(NOV);
    expect(libelles(plan.charges)).toEqual(['Loyer']);
  });

  it('une VARIABLE récurrente antérieure disqualifie autant qu\'une fixe', () => {
    const periods = {
      [OCT]: { variableCharges: noeud(variable('Essence')) },
      [NOV]: { fixedCharges: noeud(fixe('Assurance')) }
    };

    expect(planRecurrence({ target: DEC, currentMonth: DEC, periods }).commun.source).toBe(OCT);
  });

  it('une charge antérieure NON reconductible ne disqualifie rien', () => {
    const periods = {
      [OCT]: {
        fixedCharges: noeud(fixe('Réparation', { recurring: false })),
        variableCharges: noeud(fixe('Courses'))
      },
      [NOV]: { fixedCharges: noeud(fixe('Loyer')) }
    };

    expect(planRecurrence({ target: DEC, currentMonth: DEC, periods }).commun.source).toBe(NOV);
  });

  it('LIMITE ASSUMÉE — le mois d\'après ouvert AVANT : l\'avance n\'y arrive pas', () => {
    // Le point ouvert de CLAUDE.md. Novembre porte l'Assurance d'avance, décembre
    // est ouvert avant novembre : il ne voit pas novembre comme source, et
    // novembre, ouvert ensuite, reçoit bien le loyer. Décembre reste sans
    // l'Assurance. Ce cas tient l'état décidé en v1, pas un idéal.
    let periods = {
      [OCT]: { fixedCharges: noeud(fixe('Loyer')) },
      [NOV]: { fixedCharges: noeud(fixe('Assurance')) }
    };
    periods = ouvrir(periods, DEC, OCT);
    periods = ouvrir(periods, NOV, OCT);

    expect(fixesDe(periods, NOV)).toEqual(['Assurance', 'Loyer']);
    expect(fixesDe(periods, DEC)).toEqual(['Loyer']);
  });

  it('LIMITE ASSUMÉE — un historique sans aucune empreinte : la source est le plus ANCIEN', () => {
    // Avant ce lot, ce serait septembre. R5 ne sait pas distinguer deux mois
    // saisis à la main d'un mois bloqué : elle remonte jusqu'au seul qui ne
    // peut pas être soupçonné. Aucun mois de la sauvegarde du 2026-11-01 n'a
    // cette forme ; ce cas dit ce qui se passerait si l'un l'avait.
    const periods = {
      '2026-08': { fixedCharges: noeud(fixe('Loyer août')) },
      '2026-09': { fixedCharges: noeud(fixe('Loyer septembre')) }
    };

    expect(planRecurrence({ target: OCT, currentMonth: OCT, periods }).commun.source).toBe('2026-08');
  });
});

describe('D2 — ce qui écarte une copie', () => {
  /** Le plan du commun de novembre, avec octobre et novembre fournis */
  const planNov = (oct, nov) => planRecurrence({
    target: NOV, currentMonth: NOV, periods: { [OCT]: oct, [NOV]: nov }
  }).commun;

  it('d1. un « Loyer » saisi à la main : seul Internet est copié', () => {
    const plan = planNov(
      { fixedCharges: noeud(fixe('Loyer'), fixe('Internet')) },
      { fixedCharges: noeud(fixe('Loyer')) }
    );

    expect(libelles(plan.charges)).toEqual(['Internet']);
    expect(plan.ecartees).toEqual(['Loyer']);
    expect(plan.doublonsPossibles).toEqual([]);
  });

  it('d2. une variable récurrente déjà présente n\'est pas doublée', () => {
    const plan = planNov(
      { variableCharges: noeud(variable('Essence'), variable('Cantine')) },
      { variableCharges: noeud(variable('Essence')) }
    );

    expect(libelles(plan.variables)).toEqual(['Cantine']);
    expect(plan.ecartees).toEqual(['Essence']);
  });

  it('multiplicité : deux à la source, une à destination, une copie', () => {
    const plan = planNov(
      { fixedCharges: noeud(fixe('Assurance', { amount: 30 }), fixe('Assurance', { amount: 50 })) },
      { fixedCharges: noeud(fixe('Assurance')) }
    );

    expect(libelles(plan.charges)).toEqual(['Assurance']);
    expect(plan.ecartees).toEqual(['Assurance']);
  });

  it('multiplicité, dans l\'autre sens : deux à destination n\'écartent qu\'une copie par exemplaire', () => {
    const plan = planNov(
      { fixedCharges: noeud(fixe('Assurance')) },
      { fixedCharges: noeud(fixe('Assurance'), fixe('Assurance')) }
    );

    expect(plan.charges).toEqual([]);
    expect(plan.ecartees).toEqual(['Assurance']);
  });

  it('casse et espaces de bord : « loyer » écarte « Loyer »', () => {
    const plan = planNov(
      { fixedCharges: noeud(fixe('Loyer')) },
      { fixedCharges: noeud(fixe('  loyer ')) }
    );

    expect(plan.charges).toEqual([]);
    expect(plan.ecartees).toEqual(['Loyer']);
  });

  it('un libellé différent n\'écarte rien', () => {
    const plan = planNov(
      { fixedCharges: noeud(fixe('Loyer')) },
      { fixedCharges: noeud(fixe('Loyer garage')) }
    );

    expect(libelles(plan.charges)).toEqual(['Loyer']);
    expect(plan.ecartees).toEqual([]);
    expect(plan.doublonsPossibles).toEqual([]);
  });

  it('une destination supprimée n\'écarte rien et ne signale rien', () => {
    const plan = planNov(
      { fixedCharges: noeud(fixe('Loyer')) },
      { fixedCharges: noeud(fixe('Loyer', { deleted: true })) }
    );

    expect(libelles(plan.charges)).toEqual(['Loyer']);
    expect(plan.ecartees).toEqual([]);
    expect(plan.doublonsPossibles).toEqual([]);
  });

  it('un libellé VIDE ne se compare à rien', () => {
    // Deux charges sans description ne sont pas la même charge.
    const plan = planNov(
      { fixedCharges: noeud(fixe('')) },
      { fixedCharges: noeud(fixe('')) }
    );

    expect(plan.charges).toHaveLength(1);
    expect(plan.ecartees).toEqual([]);
    expect(plan.doublonsPossibles).toEqual([]);
  });

  it('TOUT est écarté : le plan existe quand même, pour que l\'empreinte soit posée', () => {
    // Sans plan, pas d'empreinte. Et sans empreinte, R5 disqualifie ce mois au
    // tour suivant : décembre remonterait à octobre, et l'Assurance saisie en
    // novembre sortirait de la chaîne sans un mot.
    let periods = {
      [OCT]: { fixedCharges: noeud(fixe('Loyer')) },
      [NOV]: { fixedCharges: noeud(fixe('Loyer'), fixe('Assurance')) }
    };

    const plan = planRecurrence({ target: NOV, currentMonth: NOV, periods }).commun;
    expect(plan.source).toBe(OCT);
    expect(plan.charges).toEqual([]);
    expect(plan.ecartees).toEqual(['Loyer']);

    periods = ouvrir(periods, NOV);
    periods = ouvrir(periods, DEC);
    expect(periods[DEC].reconductedFrom).toBe(NOV);
    expect(fixesDe(periods, DEC)).toEqual(['Assurance', 'Loyer']);
  });
});

describe('D2 — un homonyme NON reconductible n\'écarte rien, il est signalé', () => {
  const planNov = (oct, nov) => planRecurrence({
    target: NOV, currentMonth: NOV, periods: { [OCT]: oct, [NOV]: nov }
  }).commun;

  it('« Loyer » ponctuel à destination : la copie part, et le doublon est nommé', () => {
    const plan = planNov(
      { fixedCharges: noeud(fixe('Loyer')) },
      { fixedCharges: noeud(fixe('Loyer', { recurring: false })) }
    );

    expect(libelles(plan.charges)).toEqual(['Loyer']);
    expect(plan.ecartees).toEqual([]);
    expect(plan.doublonsPossibles).toEqual(['Loyer']);
  });

  it('LA CHAÎNE TIENT — décembre reçoit toujours le Loyer', () => {
    // Le cas qui a tranché D2 contre « tout homonyme écarte » : la mensualité
    // serait sortie de la reconduction pour tous les mois suivants.
    let periods = {
      [OCT]: { fixedCharges: noeud(fixe('Loyer'), fixe('Internet')) },
      [NOV]: { fixedCharges: noeud(fixe('Loyer', { recurring: false })) }
    };
    periods = ouvrir(periods, NOV);
    periods = ouvrir(periods, DEC);

    expect(fixesDe(periods, DEC)).toEqual(['Internet', 'Loyer']);
  });

  it('un achat ordinaire n\'écarte pas la variable récurrente du même nom', () => {
    const plan = planNov(
      { variableCharges: noeud(variable('Courses')) },
      { variableCharges: noeud(fixe('Courses', { amount: 42 })) }
    );

    expect(libelles(plan.variables)).toEqual(['Courses']);
    expect(plan.doublonsPossibles).toEqual(['Courses']);
  });

  it('même reconductible, un homonyme de l\'AUTRE collection n\'écarte rien', () => {
    const plan = planNov(
      { fixedCharges: noeud(fixe('Loyer')) },
      { variableCharges: noeud(variable('Loyer')) }
    );

    expect(libelles(plan.charges)).toEqual(['Loyer']);
    expect(plan.ecartees).toEqual([]);
    expect(plan.doublonsPossibles).toEqual(['Loyer']);
  });

  it('une charge écartée n\'est pas AUSSI un doublon possible : rien n\'a été copié', () => {
    const plan = planNov(
      { fixedCharges: noeud(fixe('Loyer')) },
      { fixedCharges: noeud(fixe('Loyer'), fixe('Loyer', { recurring: false })) }
    );

    expect(plan.charges).toEqual([]);
    expect(plan.ecartees).toEqual(['Loyer']);
    expect(plan.doublonsPossibles).toEqual([]);
  });

  it('un doublon possible n\'est nommé qu\'une fois', () => {
    const plan = planNov(
      { fixedCharges: noeud(fixe('Assurance'), fixe('Assurance')) },
      { fixedCharges: noeud(fixe('Assurance', { recurring: false })) }
    );

    expect(plan.charges).toHaveLength(2);
    expect(plan.doublonsPossibles).toEqual(['Assurance']);
  });
});

describe('Les poches sont indépendantes', () => {
  it('un homonyme dans MA poche n\'écarte rien du commun', () => {
    const plan = planRecurrence({
      target: NOV, currentMonth: NOV, moi: 'vous',
      periods: {
        [OCT]: { fixedCharges: { a: fixe('Sport'), b: perso('Sport') } },
        [NOV]: { fixedCharges: { c: perso('Sport') } }
      }
    });

    expect(libelles(plan.commun.charges)).toEqual(['Sport']);
    expect(plan.commun.ecartees).toEqual([]);
    expect(plan.commun.doublonsPossibles).toEqual([]);
    // Et ma poche, elle, a bien écarté la sienne.
    expect(plan.personnel.charges).toEqual([]);
    expect(plan.personnel.ecartees).toEqual(['Sport']);
  });

  it('un homonyme dans le commun n\'écarte rien de ma poche', () => {
    const plan = planRecurrence({
      target: NOV, currentMonth: NOV, moi: 'vous',
      periods: {
        [OCT]: { fixedCharges: { a: fixe('Sport'), b: perso('Sport') } },
        [NOV]: { fixedCharges: { c: fixe('Sport') } }
      }
    });

    expect(libelles(plan.personnel.charges)).toEqual(['Sport']);
    expect(plan.personnel.ecartees).toEqual([]);
    expect(plan.commun.charges).toEqual([]);
    expect(plan.commun.ecartees).toEqual(['Sport']);
  });

  it('la poche de L\'AUTRE, lisible sous aval, n\'écarte rien et ne se signale pas', () => {
    // Le nœud fusionné la porte. Son libellé ne doit pas paraître dans un
    // message : elle ne se lit que sous aval, pas dans un toast de reconduction.
    const plan = planRecurrence({
      target: NOV, currentMonth: NOV, moi: 'vous',
      periods: {
        [OCT]: { fixedCharges: { a: perso('Sport') } },
        [NOV]: { fixedCharges: { c: perso('Sport', 'conjointe') } }
      }
    });

    expect(libelles(plan.personnel.charges)).toEqual(['Sport']);
    expect(plan.personnel.doublonsPossibles).toEqual([]);
  });

  it('un homonyme PONCTUEL d\'une autre poche ne se signale pas non plus', () => {
    // La forme qui pourrait fuir : un ponctuel n'écarte rien, il se signale. Le
    // signalement se compte donc dans la poche, lui aussi — sans quoi le libellé
    // d'une dépense de l'autre, lue sous aval, partirait dans un toast.
    const ponctuelle = { recurring: false };
    const plan = planRecurrence({
      target: NOV, currentMonth: NOV, moi: 'vous',
      periods: {
        [OCT]: { fixedCharges: { a: fixe('Sport'), b: perso('Yoga') } },
        [NOV]: {
          fixedCharges: {
            c: perso('Sport', 'vous', ponctuelle),
            d: perso('Yoga', 'conjointe', ponctuelle)
          }
        }
      }
    });

    expect(libelles(plan.commun.charges)).toEqual(['Sport']);
    expect(plan.commun.doublonsPossibles).toEqual([]);
    expect(libelles(plan.personnel.charges)).toEqual(['Yoga']);
    expect(plan.personnel.doublonsPossibles).toEqual([]);
  });

  it('LE TÉMOIN — et dans SA poche, le même ponctuel se signale bien', () => {
    const plan = planRecurrence({
      target: NOV, currentMonth: NOV, moi: 'vous',
      periods: {
        [OCT]: { fixedCharges: { b: perso('Yoga') } },
        [NOV]: { fixedCharges: { d: perso('Yoga', 'vous', { recurring: false }) } }
      }
    });

    expect(plan.personnel.doublonsPossibles).toEqual(['Yoga']);
  });

  it('R5 se juge poche par poche : l\'empreinte du COMMUN ne qualifie pas ma poche', () => {
    const periods = {
      '2026-09': { fixedCharges: { a: perso('Sport') } },
      [OCT]: { reconductedFrom: '2026-09', fixedCharges: { b: perso('Yoga') } }
    };

    expect(planRecurrence({ target: NOV, currentMonth: NOV, moi: 'vous', periods }).personnel.source)
      .toBe('2026-09');
  });

  it('R5 lit l\'empreinte de ma poche dans `empreintesPersonnelles`', () => {
    const periods = {
      '2026-09': { fixedCharges: { a: perso('Sport') } },
      [OCT]: { fixedCharges: { b: perso('Yoga') } }
    };

    const plan = planRecurrence({
      target: NOV, currentMonth: NOV, moi: 'vous', periods,
      empreintesPersonnelles: { [OCT]: '2026-09' }
    });

    expect(plan.personnel.source).toBe(OCT);
  });

  it('une poche qui démarre garde sa source, même si le commun est ancien', () => {
    const periods = {
      '2026-08': { fixedCharges: { a: fixe('Loyer') } },
      [OCT]: { fixedCharges: { b: perso('Sport') } }
    };

    const plan = planRecurrence({ target: NOV, currentMonth: NOV, moi: 'vous', periods });

    expect(plan.commun.source).toBe('2026-08');
    expect(plan.personnel.source).toBe(OCT);
  });
});

describe('Les empreintes personnelles à lire', () => {
  const periods = {
    '2026-08': { fixedCharges: { a: perso('Sport') } },
    '2026-09': { fixedCharges: { x: fixe('Loyer') } },
    [OCT]: { fixedCharges: { b: perso('Sport') } },
    [NOV]: { fixedCharges: { c: perso('Sport') } }
  };

  it('les mois porteurs, du plus récent au plus ancien, sans le plus ancien', () => {
    // Le plus ancien n'a rien à prouver : aucun mois avant lui ne le disqualifie.
    expect(moisDontLEmpreinteDecide({ periods, target: DEC, currentMonth: DEC, moi: 'vous' }))
      .toEqual([NOV, OCT]);
  });

  it('un seul mois porteur : aucune lecture à faire', () => {
    expect(moisDontLEmpreinteDecide({
      periods: { [OCT]: { fixedCharges: { b: perso('Sport') } } },
      target: DEC, currentMonth: DEC, moi: 'vous'
    })).toEqual([]);
  });

  it('rien de personnel : aucune lecture à faire', () => {
    expect(moisDontLEmpreinteDecide({
      periods: { [OCT]: { fixedCharges: { a: fixe('Loyer') } } },
      target: DEC, currentMonth: DEC, moi: 'vous'
    })).toEqual([]);
  });

  it('les mois à venir et la cible ne comptent pas', () => {
    expect(moisDontLEmpreinteDecide({ periods, target: NOV, currentMonth: NOV, moi: 'vous' }))
      .toEqual([OCT]);
  });

  it('consulter un mois PASSÉ ne coûte aucune lecture : il ne sera pas reconduit', () => {
    expect(moisDontLEmpreinteDecide({ periods, target: NOV, currentMonth: DEC, moi: 'vous' }))
      .toEqual([]);
  });

  it('emplacement inconnu ou entrée abîmée : rien', () => {
    expect(moisDontLEmpreinteDecide({ periods, target: DEC, currentMonth: DEC, moi: null }))
      .toEqual([]);
    expect(moisDontLEmpreinteDecide({ periods: null, target: DEC, currentMonth: DEC, moi: 'vous' }))
      .toEqual([]);
  });
});

describe('Le libellé comparable', () => {
  it('sans casse ni espaces de bord, accents conservés', () => {
    expect(libelleComparable('  LOYER ')).toBe('loyer');
    expect(libelleComparable('Électricité')).toBe('électricité');
    expect(libelleComparable('Électricité')).not.toBe(libelleComparable('Electricite'));
  });

  it('ce qui n\'est pas un texte vaut vide', () => {
    expect(libelleComparable(undefined)).toBe('');
    expect(libelleComparable(12)).toBe('');
  });
});

describe('Le message de reconduction', () => {
  it('le cas courant ne change pas', () => {
    expect(messageDeReconduction({
      nombre: 3, depuis: 'octobre 2026', ecartees: [], doublonsPossibles: []
    })).toBe('3 charges fixes reconduites depuis octobre 2026');
  });

  it('au singulier, et sans mois quand deux sources se mêlent', () => {
    expect(messageDeReconduction({
      nombre: 1, depuis: null, ecartees: [], doublonsPossibles: []
    })).toBe('1 charge fixe reconduite');
  });

  it('il nomme les charges écartées', () => {
    expect(messageDeReconduction({
      nombre: 2, depuis: 'octobre 2026', ecartees: ['Loyer'], doublonsPossibles: []
    })).toBe('2 charges fixes reconduites depuis octobre 2026. '
      + 'Déjà présente, non recopiée : Loyer.');
  });

  it('il nomme les doublons possibles', () => {
    expect(messageDeReconduction({
      nombre: 2, depuis: 'octobre 2026', ecartees: [], doublonsPossibles: ['Loyer', 'Eau']
    })).toBe('2 charges fixes reconduites depuis octobre 2026. '
      + 'Doublons possibles, à vérifier : Loyer, Eau.');
  });

  it('les deux ensemble, au pluriel, dans cet ordre', () => {
    const message = messageDeReconduction({
      nombre: 1, depuis: 'octobre 2026', ecartees: ['A', 'B'], doublonsPossibles: ['C']
    });

    expect(message).toContain('Déjà présentes, non recopiées : A, B.');
    expect(message).toContain('Doublon possible, à vérifier : C.');
    expect(message.indexOf('Déjà')).toBeLessThan(message.indexOf('Doublon'));
  });

  it('rien de copié : la phrase ne prétend pas qu\'il s\'est passé quelque chose', () => {
    expect(messageDeReconduction({
      nombre: 0, depuis: 'octobre 2026', ecartees: ['Loyer'], doublonsPossibles: []
    })).toBe('Aucune charge fixe reconduite depuis octobre 2026. '
      + 'Déjà présente, non recopiée : Loyer.');
  });
});
