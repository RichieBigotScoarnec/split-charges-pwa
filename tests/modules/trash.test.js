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

// Le double de `db.js` enveloppe l'ORIGINAL plutôt que de le remplacer.
//
// Depuis le lot P1b, les lectures de charges passent par `poches.js`, qui
// demande `cheminDuPersonnel` à `db.js`. Un double qui ne le porte pas fait
// échouer la fusion ; un double qui le RÉÉCRIT en donnerait une seconde
// rédaction, et ces cas mesureraient alors un chemin que l'application
// n'emprunte pas. Seuls les accès sont remplacés.
vi.mock('../../public/js/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  dbGet: (...a) => dbGet(...a),
  dbUpdate: (...a) => dbUpdate(...a),
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

/** Une charge supprimée, réduite à ce que la corbeille en lit */
const supprimee = (extra = {}) => ({
  description: 'Courses', amount: 12, paidBy: 'vous', deleted: true, ...extra
});

/** Sert un arbre par chemin, comme Realtime Database le ferait */
function servir(arbre) {
  dbGet.mockImplementation(async (chemin) => arbre[chemin] ?? null);
}

/**
 * Ouvre la corbeille, puis oublie ce que l'ouverture a écrit
 *
 * Depuis le lot P1b, le chemin d'un élément supprimé est DÉRIVÉ de la charge au
 * moment où la corbeille la lit, puis retenu en mémoire — une charge
 * personnelle ne vit pas sous `periods/`, et composer ce chemin créerait un
 * fantôme dans le commun. Rétablir exige donc d'avoir ouvert la fenêtre, ce qui
 * est exactement le geste : le bouton « Rétablir » est créé par le rendu.
 *
 * @param {Object} arbre - Chemin complet vers son nœud
 */
async function ouvrirLaCorbeille(arbre) {
  servir(arbre);
  await showTrash();
  dbUpdate.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
}

/** Un mois commun, une charge variable supprimée */
const UN_MOIS = (periode, collection, id, charge = supprimee()) => ({
  periods: { [periode]: { [collection]: { [id]: charge } } }
});

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  setState('currentPeriod', '2026-08');
  document.body.innerHTML = '<div id="trashButton"></div><div id="trashList"></div>';
  dbGet.mockResolvedValue({ '2026-08': {} });
});

describe('Rétablir un élément', () => {
  it('écrit `deleted: false` au bon chemin', async () => {
    await ouvrirLaCorbeille(UN_MOIS('2026-08', 'variableCharges', 'c1'));

    await restoreFromTrash('2026-08:variableCharges:c1');

    expect(cheminsEcrits()).toEqual(['periods/2026-08/variableCharges/c1']);
    expect(dbUpdate.mock.calls[0][1]).toEqual({ deleted: false });
  });

  it('un identifiant Firebase porteur de deux-points n\'est pas tronqué', async () => {
    // La référence est découpée sur les DEUX premiers séparateurs seulement.
    await ouvrirLaCorbeille(UN_MOIS('2026-08', 'variableCharges', 'a:b:c'));

    await restoreFromTrash('2026-08:variableCharges:a:b:c');

    expect(cheminsEcrits()).toEqual(['periods/2026-08/variableCharges/a:b:c']);
  });

  it('un mois autre que celui affiché est rétabli et nommé', async () => {
    await ouvrirLaCorbeille(UN_MOIS('2026-05', 'fixedCharges', 'f1'));

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
 * ─────────────────────────────────────────────────────────────────────────────
 * LA POCHE (lot P1b)
 *
 * Une charge personnelle supprimée doit être rétablie LÀ OÙ ELLE EST. Écrire
 * `periods/…/deleted: false` sur elle créerait un nœud à un seul champ dans le
 * commun — refusé par les règles, faute de montant — et laisserait l'originale
 * à la corbeille : le bouton « Rétablir » paraîtrait inerte.
 */
describe('Rétablir dans la poche où la charge vit', () => {
  const ARBRE = {
    periods: { '2026-08': { variableCharges: { commune: supprimee() } } },
    'personnel/vous/periods': {
      '2026-08': {
        variableCharges: {
          amoi: supprimee({ description: 'Sport', perimetre: 'solo', paidBy: 'vous' })
        }
      }
    },
    'personnel/conjointe/periods': {
      '2026-08': {
        variableCharges: {
          aelle: supprimee({ description: 'Yoga', perimetre: 'solo', paidBy: 'conjointe' })
        }
      }
    }
  };

  beforeEach(async () => {
    setState('emplacementCourant', 'vous');
    await ouvrirLaCorbeille(ARBRE);
  });

  it('MA charge personnelle est rétablie dans MA poche', async () => {
    await restoreFromTrash('2026-08:variableCharges:amoi');

    expect(cheminsEcrits())
      .toEqual(['personnel/vous/periods/2026-08/variableCharges/amoi']);
  });

  it('celle de l\'autre est rétablie DANS LA SIENNE', async () => {
    // Elle est LISIBLE ici — sous aval, la corbeille la montre. L'écriture
    // sera refusée par les règles, et c'est le bon refus : il vient du mur,
    // pas d'un chemin composé de travers qui aurait publié la charge.
    await restoreFromTrash('2026-08:variableCharges:aelle');

    expect(cheminsEcrits())
      .toEqual(['personnel/conjointe/periods/2026-08/variableCharges/aelle']);
  });

  it('LE TÉMOIN — une charge commune garde le chemin commun', async () => {
    // Sans lui, les deux cas ci-dessus seraient satisfaits par un chemin
    // toujours personnel — ce qui mettrait le commun du foyer hors de vue de
    // l'autre, le défaut inverse et pire.
    await restoreFromTrash('2026-08:variableCharges:commune');

    expect(cheminsEcrits()).toEqual(['periods/2026-08/variableCharges/commune']);
  });

  it('la table est REFAITE à chaque rendu, jamais complétée', async () => {
    // Une table qui s'accumulerait garderait le chemin d'un élément qui a
    // changé de poche entre deux ouvertures de la fenêtre — et rétablirait la
    // charge à l'endroit qu'elle occupait avant la bascule.
    await ouvrirLaCorbeille({
      periods: { '2026-08': { variableCharges: { amoi: supprimee() } } }
    });

    await restoreFromTrash('2026-08:variableCharges:amoi');

    expect(cheminsEcrits()).toEqual(['periods/2026-08/variableCharges/amoi']);
  });

  it('aucun marqueur de poche n\'est écrit en base', async () => {
    // La poche est déjà dite par le périmètre et le payeur de la charge. Un
    // champ de plus serait une seconde source pour la même grandeur, et il
    // faudrait une règle pour l'accueillir.
    await restoreFromTrash('2026-08:variableCharges:amoi');

    expect(dbUpdate.mock.calls[0][1]).toEqual({ deleted: false });
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
  // La corbeille est OUVERTE sur un élément sain avant chaque refus. Sans
  // cela, une table de chemins vide suffirait à faire passer ces cas : ils
  // seraient verts sur une corbeille qui refuse tout, y compris le geste
  // légitime — la première réponse condamnante de la règle 1.
  beforeEach(async () => {
    await ouvrirLaCorbeille(UN_MOIS('2026-08', 'variableCharges', '-NabcDEF123'));
  });

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
