// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * La corbeille : rétablir ce qu'on a supprimé, et rien d'autre
 *
 * Son seul verbe est « rétablir ». Ce qui se juge ici : le chemin qu'elle
 * compose avant d'écrire, et ce qu'elle refuse de composer.
 *
 * Le module n'avait aucun test — il fait partie des douze absents du
 * référentiel (AUDIT-007), et c'est là qu'AUDIT-008 vivait.
 */

const dbGet = vi.fn(() => Promise.resolve(null));
const dbUpdate = vi.fn(() => Promise.resolve());

vi.mock('../../public/js/db.js', () => ({
  dbGet, dbUpdate,
  dbSet: vi.fn(() => Promise.resolve()),
  dbPush: vi.fn(() => Promise.resolve('cle')),
  getDataPath: vi.fn(chemin => `household/${chemin}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn()
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));
vi.mock('../../public/js/modules/variable-charges.js', () => ({
  loadVariableCharges: vi.fn(() => Promise.resolve())
}));
vi.mock('../../public/js/modules/fixed-charges.js', () => ({
  loadFixedCharges: vi.fn(() => Promise.resolve())
}));
vi.mock('../../public/js/modules/reimbursements.js', () => ({
  loadReimbursements: vi.fn(() => Promise.resolve())
}));

const { restoreFromTrash, showTrash } = await import('../../public/js/modules/trash.js');
const { toast } = await import('../../public/js/components/toast.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** Les chemins réellement écrits */
const cheminsEcrits = () => dbUpdate.mock.calls.map(appel => appel[0]);

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  setState('currentPeriod', '2026-08');
  document.body.innerHTML = '<div id="trashButton"></div><div id="trashList"></div>';
  dbGet.mockResolvedValue({ '2026-08': {} });
});

describe('Rétablir un élément', () => {
  it('écrit `deleted: false` au bon chemin', async () => {
    await restoreFromTrash('2026-08:variableCharges:c1');

    expect(cheminsEcrits()).toEqual(['periods/2026-08/variableCharges/c1']);
    expect(dbUpdate.mock.calls[0][1]).toEqual({ deleted: false });
  });

  it('un identifiant Firebase porteur de deux-points n\'est pas tronqué', async () => {
    // La référence est découpée sur les DEUX premiers séparateurs seulement.
    await restoreFromTrash('2026-08:variableCharges:a:b:c');

    expect(cheminsEcrits()).toEqual(['periods/2026-08/variableCharges/a:b:c']);
  });

  it('un mois autre que celui affiché est rétabli et nommé', async () => {
    await restoreFromTrash('2026-05:fixedCharges:f1');

    expect(cheminsEcrits()).toEqual(['periods/2026-05/fixedCharges/f1']);
    expect(toast.success.mock.calls[0][0]).toContain('mai');
  });

  it('une collection inconnue n\'écrit rien', async () => {
    await restoreFromTrash('2026-08:inventee:c1');

    expect(dbUpdate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('une référence tronquée n\'écrit rien', async () => {
    for (const reference of ['', '2026-08', '2026-08:variableCharges', null, undefined]) {
      await restoreFromTrash(reference);
    }
    expect(dbUpdate).not.toHaveBeenCalled();
  });
});

/**
 * AUDIT-008 — la période et l'identifiant n'étaient pas validés
 *
 * `collection` était cherchée dans `COLLECTIONS`, donc close. `periode` et
 * `id` n'étaient contrôlés que sur leur présence, alors qu'ils composent
 * directement `periods/${periode}/${collection}/${id}`. Le module définit
 * pourtant `PERIOD_KEY` et s'en sert dans `collectAll`.
 *
 * La valeur vient de `data-arg`, donc du DOM : l'exploitation suppose une
 * injection HTML préalable, et Firebase refuse déjà les clés contenant `.` ou
 * `/`, ce qui ferme la traversée de chemin. C'est de la défense en
 * profondeur — la même garde, appliquée aux deux autres champs.
 */
describe('AUDIT-008 · Ce que la corbeille refuse de composer', () => {
  it('une période qui n\'en est pas une n\'écrit rien', async () => {
    for (const periode of ['2026-13', '26-08', '2026-8', '..', 'periods', '2026-08x', '']) {
      await restoreFromTrash(`${periode}:variableCharges:c1`);
    }

    expect(cheminsEcrits(), 'aucun chemin ne devrait partir').toEqual([]);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it('un identifiant portant un caractère interdit par Firebase n\'écrit rien', async () => {
    // `.` `$` `#` `[` `]` `/` sont refusés comme clés par Realtime Database :
    // les composer produit une écriture vouée au refus, ou — pour `/` — un
    // chemin qui ne désigne plus ce qu'on croit.
    for (const id of ['a/b', 'a.b', 'a$b', 'a#b', 'a[b', 'a]b']) {
      await restoreFromTrash(`2026-08:variableCharges:${id}`);
    }

    expect(cheminsEcrits(), 'aucun chemin ne devrait partir').toEqual([]);
  });

  it('et le refus se voit, plutôt que de disparaître en silence', async () => {
    await restoreFromTrash('2026-13:variableCharges:c1');

    expect(toast.error).toHaveBeenCalled();
  });

  it('TÉMOIN — une référence saine passe toujours', async () => {
    // Sans lui, une garde qui refuserait tout passerait les trois contrôles
    // ci-dessus sans rien mesurer.
    await restoreFromTrash('2026-08:variableCharges:-NabcDEF123');

    expect(cheminsEcrits()).toEqual(['periods/2026-08/variableCharges/-NabcDEF123']);
  });
});

/**
 * Point voisin de la même fiche : `collectAll` déréférence `periods[periode][cle]`
 * sans garde. Une clé de mois de valeur `null` — impossible en base, concevable
 * dans le miroir `localStorage` — lèverait.
 */
describe('AUDIT-008 · Un historique abîmé ne fait pas tomber la corbeille', () => {
  it('un mois de valeur nulle est ignoré, et la fenêtre s\'ouvre quand même', async () => {
    dbGet.mockResolvedValue({ '2026-08': null, '2026-07': { variableCharges: {} } });

    await showTrash();

    const texte = document.getElementById('trashList').textContent;
    expect(texte, 'la corbeille ne devrait pas annoncer une panne').not.toContain('illisible');
  });
});
