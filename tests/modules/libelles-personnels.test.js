// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Chacun remet SA poche d'accord avec les listes partagées, à l'ouverture
 *
 * Renommer « Courses » en « Alimentation » suit les charges du foyer et celles
 * de qui renomme. Celles de l'autre restent derrière : personne n'a le droit
 * d'écrire dans la poche de l'autre. Sa liste affiche donc « Alimentation », et
 * ses dépenses personnelles « Courses » — un récapitulatif à deux entrées pour
 * une seule catégorie, chez lui seulement.
 *
 * `tests/utils/renommage.test.js` tient la DÉCISION — quelle charge est reprise,
 * et la limite des deux renommages successifs. Ici, le PARCOURS : ce qui part en
 * base, et ce que l'instantané de l'ouverture porte après.
 */

const dbUpdate = vi.fn(() => Promise.resolve());
const info = vi.fn();

vi.mock('../../public/js/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  dbUpdate: (...a) => dbUpdate(...a),
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  dbPush: vi.fn(() => Promise.resolve('cle')),
  getDataPath: vi.fn(chemin => `household/${chemin}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info, warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

const { reprendreMesLibelles } = await import('../../public/js/modules/custom-lists.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** La liste partagée APRÈS un renommage : l'identifiant a survécu, le libellé non */
const CATEGORIES = [
  { id: 'courses', label: 'Alimentation', icon: '🛒' },
  { id: 'essence', label: 'Essence', icon: '⛽' }
];

/** Un instantané fusionné : le commun, ma poche, celle de l'autre */
const instantane = () => ({
  '2026-09': {
    variableCharges: {
      commune: { category: 'Courses', amount: 40, paidBy: 'vous' },
      amoi: { category: 'Courses', amount: 14, paidBy: 'vous', perimetre: 'solo' },
      aelle: { category: 'Courses', amount: 16, paidBy: 'conjointe', perimetre: 'solo' }
    }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  setState('emplacementCourant', 'vous');
  setState('categories', CATEGORIES);
  setState('destinations', []);
});

describe('Ce qui part en base', () => {
  it('reprend MA charge, et elle seule', async () => {
    const periods = instantane();

    expect(await reprendreMesLibelles(periods)).toBe(1);

    expect(dbUpdate).toHaveBeenCalledTimes(1);
    const [chemin, ecritures] = dbUpdate.mock.calls[0];
    // `undefined` : un lot multi-chemins, tout ou rien.
    expect(chemin).toBeUndefined();
    expect(ecritures).toEqual({
      'personnel/vous/periods/2026-09/variableCharges/amoi/category': 'Alimentation'
    });
  });

  it('n\'écrit rien quand tout est déjà d\'accord', async () => {
    // Le cas NOMINAL, et de loin le plus fréquent : une ouverture ordinaire ne
    // doit rien écrire du tout.
    const periods = instantane();
    for (const charge of Object.values(periods['2026-09'].variableCharges)) {
      charge.category = 'Alimentation';
    }

    expect(await reprendreMesLibelles(periods)).toBe(0);
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('le dit, parce que personne n\'a rien demandé', async () => {
    // Un libellé qui change sous les yeux de quelqu'un sans un mot se lit comme
    // une donnée abîmée.
    await reprendreMesLibelles(instantane());

    expect(info).toHaveBeenCalledTimes(1);
  });

  it('sans instantané, il n\'y a rien à reprendre', async () => {
    // L'étape amont a échoué. Reprendre des libellés sur une lecture qu'on n'a
    // pas obtenue n'aurait aucun sens — et une lecture de plus doublerait le
    // coût d'une ouverture, ce que `lecture-unique.spec.js` tient.
    expect(await reprendreMesLibelles(undefined)).toBe(0);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it('une écriture refusée ne fait pas échouer l\'ouverture', async () => {
    dbUpdate.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));

    await expect(reprendreMesLibelles(instantane())).resolves.toBe(0);
  });
});

describe('L\'INSTANTANÉ est remis d\'accord avec la base', () => {
  it('la charge reprise porte son nouveau libellé en mémoire', async () => {
    // Il sert à tout le reste de l'ouverture. Sans cela, le premier rendu
    // montrerait l'ancien libellé — celui qu'on vient de corriger — et rien ne
    // le referait avant un changement de mois.
    const periods = instantane();

    await reprendreMesLibelles(periods);

    expect(periods['2026-09'].variableCharges.amoi.category).toBe('Alimentation');
  });

  it('LE TÉMOIN — et les deux autres charges ne sont PAS touchées', async () => {
    // Sans lui, « l'instantané est remis d'accord » serait satisfait par une
    // réécriture de toutes les charges du nœud, y compris celles de l'autre —
    // dont l'écran montrerait alors un libellé que la base ne porte pas.
    const periods = instantane();

    await reprendreMesLibelles(periods);

    expect(periods['2026-09'].variableCharges.commune.category).toBe('Courses');
    expect(periods['2026-09'].variableCharges.aelle.category).toBe('Courses');
  });

  it('rien n\'est corrigé en mémoire quand l\'écriture échoue', async () => {
    // L'inverse serait pire que le défaut : l'écran annoncerait une correction
    // que la base n'a pas reçue, et le prochain chargement la défferait.
    dbUpdate.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    const periods = instantane();

    await reprendreMesLibelles(periods);

    expect(periods['2026-09'].variableCharges.amoi.category).toBe('Courses');
  });
});
