// @vitest-environment jsdom
/**
 * La reconduction écrit dans la poche où la charge vit
 *
 * `tests/utils/recurrence.test.js` tient la DÉCISION — qui est reconductible,
 * depuis quel mois, et poche par poche. Ici, le PARCOURS : les chemins
 * réellement écrits, et les deux empreintes réellement réservées.
 *
 * Les deux ne se mesurent pas l'une avec l'autre. Une décision juste dont les
 * chemins sont composés en clair publierait une charge personnelle dans le
 * commun ; et deux chemins justes gouvernés par une seule empreinte ne
 * reconduiraient jamais la poche du second à ouvrir l'application.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const toasts = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn()
}));

vi.mock('../../public/js/components/toast.js', () => ({ toast: toasts }));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/fixed-charges.js', () => ({
  loadFixedCharges: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));
// Le double de `db.js` enveloppe l'ORIGINAL : `cheminDuPersonnel` et
// `cheminDeLaCharge` doivent rester ceux de l'application, sinon ces cas
// mesurent un chemin que personne n'emprunte.
vi.mock('../../public/js/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDataPath: (chemin) => `household/${chemin}`,
  dbGet: vi.fn()
}));

const base = vi.hoisted(() => ({ instance: null }));
vi.mock('../../public/js/firebase-init.js', () => ({
  getFirebaseDatabase: () => base.instance
}));

const AOUT = '2026-08';
const SEPT = '2026-09';

/** Août garni : un loyer commun, un abonnement à chacun */
const COMMUN = {
  [AOUT]: {
    fixedCharges: {
      loyer: { description: 'Loyer', amount: 900, recurring: true, date: '2026-08-05' }
    }
  }
};
const MA_POCHE = {
  [AOUT]: {
    fixedCharges: {
      sport: {
        description: 'Salle de sport', amount: 29, recurring: true,
        paidBy: 'vous', perimetre: 'solo'
      }
    }
  }
};
const SA_POCHE = {
  [AOUT]: {
    fixedCharges: {
      yoga: {
        description: 'Yoga', amount: 45, recurring: true,
        paidBy: 'conjointe', perimetre: 'solo'
      }
    }
  }
};

/**
 * Une base factice qui distingue ses références PAR CHEMIN
 *
 * C'est ce qui rend ces cas capables de séparer les deux empreintes : une base
 * qui rend la même référence pour tout chemin les confondrait, et « deux
 * empreintes » serait vert sur une seule.
 */
function baseFactice() {
  const journal = { empreintes: {}, ecritures: null, copies: 0 };
  let compteur = 0;

  const empreinte = (chemin) => ({
    transaction: vi.fn(async (decider) => {
      const valeur = decider(null);
      journal.empreintes[chemin] = [...(journal.empreintes[chemin] || []), valeur];
      return { committed: valeur !== undefined };
    }),
    set: vi.fn(async (valeur) => {
      journal.empreintes[chemin] = [...(journal.empreintes[chemin] || []), valeur];
    })
  });

  const racine = {
    push: () => { compteur += 1; return { key: `cle${compteur}` }; },
    update: vi.fn(async (updates) => {
      journal.copies += 1;
      journal.ecritures = updates;
    })
  };

  return {
    journal,
    instance: { ref: (chemin) => (chemin === undefined ? racine : empreinte(chemin)) }
  };
}

/**
 * Recharge le module et lance la reconduction
 *
 * `reconduction.js` garde sa référence de base entre deux appels — c'est voulu,
 * et c'est ce qui a réparé la reconduction qui ne partait jamais au démarrage.
 * En test, cela ferait hériter chaque cas de la base du précédent.
 *
 * @param {Object} params
 * @param {string} [params.moi] - Emplacement du compte connecté
 * @param {*} [params.empreintePersonnelle] - Ce que la base rend pour la marque de la poche
 * @param {*} [params.empreinteCommune] - Idem pour celle du mois commun
 * @returns {Promise<{nombre: number, journal: Object}>}
 */
async function reconduire({ moi = 'vous', empreintePersonnelle = null, arbre } = {}) {
  vi.resetModules();

  const { setState, resetState } = await import('../../public/js/state.js');
  const { dbGet } = await import('../../public/js/db.js');
  const { applyRecurringCharges } = await import('../../public/js/modules/reconduction.js');

  resetState();
  setState('currentPeriod', SEPT);
  if (moi) setState('emplacementCourant', moi);

  const base = arbre || {
    periods: COMMUN,
    'personnel/vous/periods': MA_POCHE,
    'personnel/conjointe/periods': SA_POCHE
  };

  dbGet.mockImplementation(async (chemin) => {
    if (/reconductedFrom$/.test(chemin)) return empreintePersonnelle;
    return base[chemin] ?? null;
  });

  return applyRecurringCharges();
}

beforeEach(() => {
  vi.clearAllMocks();
  base.instance = null;
});

describe('Les chemins écrits', () => {
  it('le loyer commun va dans le commun, mon abonnement dans MA poche', async () => {
    const factice = baseFactice();
    base.instance = factice.instance;

    const nombre = await reconduire({ moi: 'vous' });

    expect(nombre).toBe(2);
    const chemins = Object.keys(factice.journal.ecritures);
    expect(chemins.some(c => /^household\/periods\/2026-09\/fixedCharges\//.test(c))).toBe(true);
    expect(chemins.some(
      c => /^household\/personnel\/vous\/periods\/2026-09\/fixedCharges\//.test(c)
    )).toBe(true);
  });

  it('JAMAIS la poche de l\'autre — on n\'a pas le droit d\'y écrire', async () => {
    // Elle est LISIBLE ici (le jeu d'essai la sert), et c'est ce qui rend ce
    // cas capable de mesurer quelque chose : sous aval, la charge de l'autre
    // arrive dans le nœud fusionné comme les miennes.
    const factice = baseFactice();
    base.instance = factice.instance;

    await reconduire({ moi: 'vous' });

    expect(Object.keys(factice.journal.ecritures).some(c => c.includes('conjointe')))
      .toBe(false);
  });

  it('et la poche change de côté pour l\'autre compte', async () => {
    const factice = baseFactice();
    base.instance = factice.instance;

    await reconduire({ moi: 'conjointe' });

    const chemins = Object.keys(factice.journal.ecritures);
    expect(chemins.some(
      c => /^household\/personnel\/conjointe\/periods\/2026-09\//.test(c)
    )).toBe(true);
    expect(chemins.some(c => c.includes('personnel/vous'))).toBe(false);
  });

  it('TOUT part dans UNE seule mise à jour', async () => {
    // Les deux poches dans la même écriture multi-chemins : un mois à moitié
    // reconduit porterait une empreinte que `planRecurrence` tient pour
    // définitive.
    const factice = baseFactice();
    base.instance = factice.instance;

    await reconduire({ moi: 'vous' });

    expect(factice.journal.copies).toBe(1);
  });
});

describe('Les deux empreintes', () => {
  it('sont réservées séparément, chacune à son chemin', async () => {
    const factice = baseFactice();
    base.instance = factice.instance;

    await reconduire({ moi: 'vous' });

    expect(factice.journal.empreintes).toEqual({
      'household/periods/2026-09/reconductedFrom': [AOUT],
      'household/personnel/vous/periods/2026-09/reconductedFrom': [AOUT]
    });
  });

  it('celle de ma poche déjà posée n\'empêche pas le commun', async () => {
    const factice = baseFactice();
    base.instance = factice.instance;

    const nombre = await reconduire({ moi: 'vous', empreintePersonnelle: AOUT });

    expect(nombre).toBe(1);
    expect(Object.keys(factice.journal.empreintes))
      .toEqual(['household/periods/2026-09/reconductedFrom']);
  });

  it('les deux sont rendues quand la copie échoue', async () => {
    // Une empreinte posée sans charge en face arrête la reconduction pour de
    // bon : « l'empreinte fait foi, même si les charges ont depuis été
    // supprimées ». Il y en a deux maintenant, donc deux à rendre.
    const factice = baseFactice();
    factice.instance.ref(undefined).update = vi.fn(async () => {
      throw new Error('liaison perdue pendant la copie');
    });
    base.instance = factice.instance;

    const nombre = await reconduire({ moi: 'vous' });

    expect(nombre).toBe(0);
    expect(factice.journal.empreintes['household/periods/2026-09/reconductedFrom'])
      .toEqual([AOUT, null]);
    expect(factice.journal.empreintes[
      'household/personnel/vous/periods/2026-09/reconductedFrom'
    ]).toEqual([AOUT, null]);
  });

  it('sans emplacement connu, une seule empreinte est touchée', async () => {
    const factice = baseFactice();
    base.instance = factice.instance;

    const nombre = await reconduire({ moi: null });

    expect(nombre).toBe(1);
    expect(Object.keys(factice.journal.empreintes))
      .toEqual(['household/periods/2026-09/reconductedFrom']);
  });
});

describe('LE TÉMOIN du jeu d\'essai', () => {
  it('les trois poches sont bien servies, sinon ces cas ne mesurent rien', async () => {
    // Sans lui, « jamais la poche de l'autre » et « mon abonnement dans ma
    // poche » seraient satisfaits par une lecture qui ne rend que le commun :
    // il n'y aurait alors aucune charge personnelle à mal ranger.
    const factice = baseFactice();
    base.instance = factice.instance;

    await reconduire({ moi: 'vous' });

    // Le lot porte aussi le mode de partage du mois : on ne garde que les
    // charges, sinon le témoin mesurerait la présence d'un terme du mois.
    const ecrites = Object.values(factice.journal.ecritures)
      .filter(valeur => valeur && typeof valeur === 'object' && valeur.description)
      .map(charge => charge.description);

    expect(ecrites.sort()).toEqual(['Loyer', 'Salle de sport']);
  });
});
