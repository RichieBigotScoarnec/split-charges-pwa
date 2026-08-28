// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));

/**
 * Lire une fois et passer la valeur doit donner EXACTEMENT le même résultat
 * que relire à chaque fois
 *
 * L'initialisation lisait le nœud `periods` quatre fois — le complément des
 * salaires, la chaîne de report, la reconduction, le sélecteur de mois — et un
 * changement de mois le relisait deux fois. Mesuré à douze mois de données :
 * 4 × 113 Ko à l'ouverture, soit 96 % de tout ce que l'application télécharge.
 *
 * La correction ne stocke aucun chiffre dérivé : elle lit une fois par geste et
 * passe la valeur brute en paramètre. Chaque paramètre est OPTIONNEL, et son
 * absence rend le comportement d'avant — un appelant qui l'oublie paie une
 * lecture, jamais un chiffre faux. C'est le mode de dégradation choisi, et
 * c'est ce qui distingue cette approche d'un agrégat stocké, dont l'oubli
 * serait silencieux et monétaire.
 *
 * Reste à prouver la seule chose qui compte : que les deux chemins donnent le
 * même résultat. Le contrôle porte sur la PROPRIÉTÉ — `f(instantané)` égale
 * `f(lecture fraîche)` — et non sur la façon dont chacun s'y prend.
 *
 * Le dernier bloc est le témoin négatif : sans lui, ces égalités passeraient
 * aussi sur un instantané vide.
 */

/** Un historique de quatre mois, dont un au mode de partage figé */
const HISTORIQUE = {
  '2026-05': {
    salaries: { vous: 2000, conjointe: 2000 },
    variableCharges: { a: { amount: 600, paidBy: 'vous', description: 'Courses', deleted: false } }
  },
  '2026-06': {
    salaries: { vous: 2000, conjointe: 2000 },
    variableCharges: { b: { amount: 400, paidBy: 'conjointe', description: 'Essence', deleted: false } }
  },
  '2026-07': {
    salaries: { vous: 3000, conjointe: 1000 },
    shareMode: 'prorata',
    fixedCharges: { c: { amount: 1000, paidBy: 'vous', description: 'Loyer', deleted: false } }
  },
  '2026-08': {
    salaries: { vous: 3000, conjointe: 1000 },
    variableCharges: { d: { amount: 200, paidBy: 'vous', description: 'Resto', deleted: false } }
  }
};

const SALAIRES = { vous: 3000, conjointe: 1000 };

/** Compte les lectures et sert l'historique, comme le ferait la base */
let lectures;
function poserLaBase() {
  lectures = [];
  return {
    dbGet: vi.fn(async (chemin) => {
      lectures.push(chemin);
      if (chemin === 'periods') return structuredClone(HISTORIQUE);
      if (chemin === 'salaries') return SALAIRES;
      const m = /^periods\/([^/]+)(?:\/(.+))?$/.exec(chemin || '');
      if (!m) return null;
      const mois = structuredClone(HISTORIQUE[m[1]]) || null;
      return m[2] ? (mois?.[m[2]] ?? null) : mois;
    }),
    dbSet: vi.fn(async () => {}),
    dbUpdate: vi.fn(async () => {})
  };
}

let base = poserLaBase();
vi.mock('../../public/js/db.js', () => ({
  get dbGet() { return base.dbGet; },
  get dbSet() { return base.dbSet; },
  get dbUpdate() { return base.dbUpdate; },
  getDataPath: (p) => `household/${p}`
}));

import { setState, resetState, getState } from '../../public/js/state.js';
import { chargerLesPeriodesConnues, backfillPeriodSalaries } from '../../public/js/modules/period.js';
import { refreshCarryOver } from '../../public/js/modules/carry-over.js';

beforeEach(() => {
  resetState();
  base = poserLaBase();
  document.body.innerHTML = '<select id="periodSelect"></select><div id="periodInfo"></div>';
});

/** Prépare l'état minimal d'un mois affiché */
function afficher(mois, { report = true } = {}) {
  setState('currentPeriod', mois);
  setState('carryOverEnabled', report);
  setState('shareMode', '50-50');
  setState('customPercents', { vous: 50, conjointe: 50 });
}

describe('refreshCarryOver — le report, au centime', () => {
  it('l\'instantané donne le même report qu\'une lecture fraîche', async () => {
    afficher('2026-08');
    const avecLecture = await refreshCarryOver();
    const lecturesDuCheminLent = lectures.filter(c => c === 'periods').length;

    resetState();
    afficher('2026-08');
    const avecInstantane = await refreshCarryOver({
      historique: structuredClone(HISTORIQUE), salairesGlobaux: SALAIRES
    });

    expect(avecInstantane).toBeCloseTo(avecLecture, 6);
    expect(lecturesDuCheminLent).toBe(1);
  });

  it('et le chemin rapide ne lit rien du tout', async () => {
    afficher('2026-08');
    await refreshCarryOver({ historique: structuredClone(HISTORIQUE), salairesGlobaux: SALAIRES });
    expect(lectures).toEqual([]);
  });

  it('l\'égalité tient sur chacun des quatre mois', async () => {
    // C'est `carry` qui s'accumule : une divergence sur un seul mois se
    // propage à tous les suivants. Le dépôt a déjà payé 100 €/mois nés de
    // rien sur exactement cette mécanique.
    for (const mois of Object.keys(HISTORIQUE)) {
      resetState();
      afficher(mois);
      const lent = await refreshCarryOver();

      resetState();
      afficher(mois);
      const rapide = await refreshCarryOver({
        historique: structuredClone(HISTORIQUE), salairesGlobaux: SALAIRES
      });

      expect(rapide, `mois ${mois}`).toBeCloseTo(lent, 6);
    }
  });
});

describe('chargerLesPeriodesConnues — les mois proposés', () => {
  it('l\'instantané donne la même liste qu\'une lecture fraîche', async () => {
    afficher('2026-08');
    await chargerLesPeriodesConnues();
    const lent = [...getState('periodesConnues')].sort();

    resetState();
    afficher('2026-08');
    await chargerLesPeriodesConnues(structuredClone(HISTORIQUE));
    const rapide = [...getState('periodesConnues')].sort();

    expect(rapide).toEqual(lent);
  });

  it('le mois affiché figure toujours, même absent de l\'instantané', async () => {
    // Le piège de l'ordonnancement : l'instantané est lu AVANT la reconduction,
    // qui peut créer le mois courant. Une liste bâtie sur le seul instantané
    // perdrait le mois qu'on est en train de regarder.
    afficher('2026-09');
    await chargerLesPeriodesConnues(structuredClone(HISTORIQUE));

    expect(getState('periodesConnues')).toContain('2026-09');
  });

  it('sans instantané, elle lit — et une seule fois', async () => {
    afficher('2026-08');
    await chargerLesPeriodesConnues();
    expect(lectures.filter(c => c === 'periods')).toHaveLength(1);
  });
});

describe('backfillPeriodSalaries — et l\'instantané qu\'il rend exact', () => {
  const SANS_INSTANTANE = {
    '2026-06': { variableCharges: { b: { amount: 400, paidBy: 'vous', deleted: false } } },
    '2026-07': { salaries: { vous: 1, conjointe: 1 }, variableCharges: {} }
  };

  it('complète les mêmes mois par les deux chemins', async () => {
    const lent = await backfillPeriodSalaries();
    const ecrituresLentes = base.dbSet.mock.calls.map(c => c[0]);

    base = poserLaBase();
    const rapide = await backfillPeriodSalaries({
      historique: structuredClone(SANS_INSTANTANE), salairesGlobaux: SALAIRES
    });

    expect(rapide).toBe(1);
    expect(base.dbSet.mock.calls.map(c => c[0])).toEqual(['periods/2026-06/salaries']);
    // Le chemin lent voit l'historique complet, qui n'a qu'un mois sans
    // instantané lui aussi : les deux comptes se rejoignent.
    expect(lent).toBe(0);
    expect(ecrituresLentes).toEqual([]);
  });

  it('reporte ses écritures dans l\'instantané qu\'on lui confie', async () => {
    // Sans ce report, la chaîne de report verrait ces mois sans instantané et
    // retomberait sur les salaires globaux — c'est-à-dire sur la valeur qu'on
    // vient d'écrire. Même résultat, mais par coïncidence arithmétique. On ne
    // fonde pas un calcul d'argent sur une coïncidence.
    const instantane = structuredClone(SANS_INSTANTANE);
    await backfillPeriodSalaries({ historique: instantane, salairesGlobaux: SALAIRES });

    // La propriété exacte : l'instantané porte ce que l'écriture a posé, à
    // l'identique — normalisation des revenus complémentaires comprise. Le
    // comparer aux salaires bruts serait plus faible, et faux.
    const [chemin, ecrit] = base.dbSet.mock.calls[0];
    expect(chemin).toBe('periods/2026-06/salaries');
    expect(instantane['2026-06'].salaries).toEqual(ecrit);

    // Un mois qui en avait déjà un n'est pas écrasé.
    expect(instantane['2026-07'].salaries).toEqual({ vous: 1, conjointe: 1 });
  });

  it('avec instantané, il ne lit rien', async () => {
    await backfillPeriodSalaries({
      historique: structuredClone(SANS_INSTANTANE), salairesGlobaux: SALAIRES
    });
    expect(lectures).toEqual([]);
  });
});

describe('Témoin négatif — le contrôle sait échouer', () => {
  it('un instantané tronqué fait diverger le report', async () => {
    // Sans ce contrôle, toutes les égalités ci-dessus passeraient sur un
    // instantané vide : elles ne prouveraient rien.
    afficher('2026-08');
    const complet = await refreshCarryOver();

    const tronque = structuredClone(HISTORIQUE);
    delete tronque['2026-05'];
    delete tronque['2026-06'];

    resetState();
    afficher('2026-08');
    const ampute = await refreshCarryOver({ historique: tronque, salairesGlobaux: SALAIRES });

    expect(ampute).not.toBeCloseTo(complet, 6);
  });

  it('un instantané tronqué fait diverger la liste des mois', async () => {
    afficher('2026-08');
    const tronque = structuredClone(HISTORIQUE);
    delete tronque['2026-05'];

    await chargerLesPeriodesConnues(tronque);
    expect(getState('periodesConnues')).not.toContain('2026-05');
  });
});
