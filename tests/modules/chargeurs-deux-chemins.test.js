// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Les deux chemins d'appel d'un chargeur rendent la MÊME liste
 *
 * `loadVariableCharges` et `loadFixedCharges` ont deux entrées :
 *
 *   - sans argument, ils LISENT le mois ;
 *   - avec un instantané, ils s'en servent — c'est ce que fait
 *     `reimbursements.js`, qui lit l'historique une fois et le passe aux trois
 *     chargeurs plutôt que de les laisser relire chacun.
 *
 * Depuis le lot P1b, lire un mois veut dire lire TROIS nœuds : le commun et les
 * deux poches personnelles. Si la fusion n'alimente qu'un seul des deux chemins,
 * un rechargement par instantané rend une liste sans personnel et l'autre avec
 * — la même grandeur, deux valeurs, selon la façon dont on y arrive. C'est la
 * règle 2, et son symptôme serait un total qui change en changeant d'écran.
 *
 * Le jeu d'essai porte une poche personnelle NON VIDE, et c'est ce qui rend ces
 * cas capables de séparer les deux chemins : sur un `personnel/` vide, une
 * fusion qui ne ferait rien les satisferait tous les deux.
 */

const dbGet = vi.fn();

vi.mock('../../public/js/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // Accesseur PARESSEUX : le facteur d'un double `async` est invoqué avant les
  // `const` du fichier, et une référence directe y tombe en zone morte
  // temporelle — Vitest sert alors le module ORIGINAL, en silence.
  dbGet: (...args) => dbGet(...args),
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve()),
  dbPush: vi.fn(() => Promise.resolve('cle')),
  getDataPath: vi.fn((chemin) => `household/${chemin}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', async (reel) => ({
  // Le double part du VRAI module : `TON` y est déclaré, et le
  // recopier ici en ferait une seconde rédaction de la même table.
  ...await reel(),
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));
vi.mock('../../public/js/modules/trash.js', () => ({ refreshTrashButton: vi.fn() }));
vi.mock('../../public/js/modules/map.js', () => ({ refreshMapButton: vi.fn() }));
vi.mock('../../public/js/modules/trends.js', () => ({ invalidateTrends: vi.fn() }));
vi.mock('../../public/js/modules/envelopes.js', () => ({ renderCarteEnveloppes: vi.fn() }));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategoryIcon: vi.fn(() => '🛒'),
  populateCategorySelect: vi.fn(),
  populateDestinationSelect: vi.fn()
}));

const { loadVariableCharges } = await import('../../public/js/modules/variable-charges.js');
const { loadFixedCharges } = await import('../../public/js/modules/fixed-charges.js');
const { lirePeriodes } = await import('../../public/js/poches.js');
const { setState, resetState, getState } = await import('../../public/js/state.js');

const MOIS = '2026-09';

/** La base : un commun, et DEUX poches personnelles garnies */
const BASE = () => ({
  periods: {
    [MOIS]: {
      salaries: { vous: 3000, conjointe: 2000 },
      variableCharges: {
        c1: { amount: 40, description: 'Courses', paidBy: 'vous' },
        c2: { amount: 15, description: 'Pain', paidBy: 'conjointe', deleted: true }
      },
      fixedCharges: { f1: { amount: 900, description: 'Loyer', paidBy: 'vous' } }
    }
  },
  'personnel/vous/periods': {
    [MOIS]: {
      variableCharges: {
        m1: { amount: 30, description: 'Sport', paidBy: 'vous', perimetre: 'solo' }
      },
      fixedCharges: {
        mf1: { amount: 12, description: 'Abonnement', paidBy: 'vous', perimetre: 'solo' }
      }
    }
  },
  'personnel/conjointe/periods': {
    [MOIS]: {
      variableCharges: {
        s1: { amount: 45, description: 'Coiffeur', paidBy: 'conjointe', perimetre: 'solo' }
      }
    }
  }
});

/** Sert un arbre par chemin, comme Realtime Database le ferait */
function servir(arbre) {
  dbGet.mockImplementation(async (chemin) => {
    if (Object.prototype.hasOwnProperty.call(arbre, chemin)) return arbre[chemin];
    // Une lecture plus profonde qu'un nœud déclaré : on descend.
    for (const [racine, noeud] of Object.entries(arbre)) {
      if (!chemin.startsWith(`${racine}/`)) continue;
      let courant = noeud;
      for (const segment of chemin.slice(racine.length + 1).split('/')) {
        if (!courant || typeof courant !== 'object') return null;
        courant = courant[segment];
      }
      return courant ?? null;
    }
    return null;
  });
}

/** Les identifiants d'une liste de l'état, triés */
const identifiants = (cle) => (getState(cle) || []).map((charge) => charge.id).sort();

beforeEach(() => {
  resetState();
  dbGet.mockReset();
  document.body.innerHTML = `
    <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
    <div id="fixedChargesList"></div><span id="fixedChargesTotal"></span>
    <span id="fixedChargesAnnuel"></span>
  `;
  setState('currentPeriod', MOIS);
  setState('emplacementCourant', 'vous');
  servir(BASE());
});

describe('Le chargeur des charges variables', () => {
  it('rend la même liste par lecture directe et par instantané', async () => {
    await loadVariableCharges();
    const parLecture = identifiants('variableCharges');

    resetState();
    setState('currentPeriod', MOIS);
    setState('emplacementCourant', 'vous');
    const instantane = await lirePeriodes();
    await loadVariableCharges(instantane[MOIS]);
    const parInstantane = identifiants('variableCharges');

    expect(parInstantane).toEqual(parLecture);
  });

  it('LE TÉMOIN — et cette liste porte bien les DEUX poches', async () => {
    // Sans lui, l'égalité ci-dessus serait satisfaite par deux chemins qui
    // ignorent le personnel tous les deux. `c2` est supprimée : elle n'a pas à
    // y figurer, et sa présence dirait que le filtre d'origine a sauté.
    await loadVariableCharges();

    expect(identifiants('variableCharges')).toEqual(['c1', 'm1', 's1']);
  });
});

describe('Le chargeur des charges fixes', () => {
  it('rend la même liste par lecture directe et par instantané', async () => {
    await loadFixedCharges();
    const parLecture = identifiants('fixedCharges');

    resetState();
    setState('currentPeriod', MOIS);
    setState('emplacementCourant', 'vous');
    const instantane = await lirePeriodes();
    await loadFixedCharges(instantane[MOIS]);

    expect(identifiants('fixedCharges')).toEqual(parLecture);
  });

  it('LE TÉMOIN — et cette liste porte bien la poche qui la garnit', async () => {
    await loadFixedCharges();

    expect(identifiants('fixedCharges')).toEqual(['f1', 'mf1']);
  });
});

describe('La corbeille suit la même route', () => {
  it('le compte des supprimées vient du nœud FUSIONNÉ', async () => {
    // `deleted.variableCharges` alimente le compte du bouton de corbeille, et
    // il sort du même nœud que la liste. Le lire sur le seul commun ferait
    // disparaître du compteur les charges personnelles mises à la corbeille.
    servir({
      ...BASE(),
      'personnel/vous/periods': {
        [MOIS]: {
          variableCharges: {
            m1: { amount: 30, description: 'Sport', paidBy: 'vous', deleted: true }
          }
        }
      }
    });

    await loadVariableCharges();

    expect((getState('deleted.variableCharges') || []).map((entree) => entree.id).sort())
      .toEqual(['c2', 'm1']);
  });
});
