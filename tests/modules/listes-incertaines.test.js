// @vitest-environment jsdom
/**
 * On n'écrit pas une liste qu'on n'a pas pu lire
 *
 * `loadCustomLists` retombait en silence sur les catégories d'origine quand la
 * base ne répondait pas. Le repli n'est pas seulement muet : il ment à
 * `fusionnerListe`.
 *
 * Cette fonction reçoit `base` — « la liste que la session avait sous les
 * yeux » — et s'en sert pour trancher, côté serveur, entre deux cas : ce qui
 * est en base et ne figure pas dans `base` est un ajout de l'autre téléphone,
 * qu'il faut conserver ; ce qui y figure est connu, donc remplaçable. Après une
 * lecture ratée, `base` vaut les dix-neuf catégories d'origine — que le foyer
 * n'a peut-être jamais eues telles quelles.
 *
 * Les identifiants d'origine sont stables (`courses`, `maison`…) et une
 * catégorie renommée garde le sien. Ajouter une seule catégorie après une
 * lecture ratée réécrivait donc « Courses » par-dessus « Supermarché » : le
 * renommage perdu, et les charges qui portaient l'ancien libellé détachées de
 * la liste. Une catégorie supprimée réapparaissait.
 *
 * Les enveloppes ne courent pas ce risque : leur repli est la liste vide, qui
 * ne prétend rien connaître. C'est le repli sur les défauts, et lui seul.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbGet = vi.hoisted(() => vi.fn());
const toasts = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn()
}));
const transaction = vi.hoisted(() => vi.fn());

vi.mock('../../public/js/db.js', () => ({
  dbGet, dbSet: vi.fn(), getDataPath: (c) => `household/${c}`
}));
vi.mock('../../public/js/components/toast.js', () => ({ toast: toasts }));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/firebase-init.js', () => ({
  getFirebaseDatabase: () => ({ ref: () => ({ transaction }) })
}));

import {
  initCustomLists, listesIncertaines, getCategories
} from '../../public/js/modules/custom-lists.js';
import { resetState } from '../../public/js/state.js';
import { CATEGORIES } from '../../public/js/config.js';

/** Ce que le foyer a réellement en base : « Courses » renommée, et une de plus */
const EN_BASE = [
  { id: 'courses', icon: '🛒', label: 'Supermarché', color: '#4caf50' },
  { id: 'brocante', icon: '🪑', label: 'Brocante', color: '#795548' }
];

describe('Listes personnalisées : le repli ne s\'écrit pas', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    dbGet.mockReset();
    transaction.mockReset();
    transaction.mockImplementation(async () => ({ committed: false }));
    resetState();
    document.body.innerHTML = '';
  });

  /**
   * Ajoute une catégorie par le chemin réel : la modale de gestion
   *
   * `saveCategories` n'est pas exportée, et il n'y a pas de raison de l'exporter
   * pour un test — c'est le geste de l'utilisateur qu'on veut éprouver, pas une
   * fonction interne. `showManageCategoriesModal` est posée sur `window` par le
   * module, et c'est par elle que le bouton « 🏷️ Catégories » passe.
   *
   * @param {string} libelle - Le nom de la catégorie à ajouter
   * @returns {Promise<void>}
   */
  async function ajouterParLaModale(libelle) {
    window.showManageCategoriesModal();
    document.getElementById('manageNewLabel').value = libelle;
    document.getElementById('manageAddBtn').click();

    // Le gestionnaire est asynchrone, et `fusionnerListe` passe par deux
    // `import()` dynamiques : vider la file des microtâches ne suffit pas,
    // il faut rendre la main à la boucle d'événements.
    for (let tour = 0; tour < 20; tour += 1) {
      await new Promise(suite => setTimeout(suite, 0));
    }
  }

  it('charge la liste du foyer quand la base répond', async () => {
    dbGet.mockResolvedValue(EN_BASE);

    await expect(initCustomLists()).resolves.toBeUndefined();

    expect(listesIncertaines()).toBe(false);
    expect(getCategories().map(c => c.label)).toContain('Supermarché');
  });

  it('ne se méfie pas d\'un premier usage', async () => {
    // Lecture réussie qui ne rend rien : les défauts sont bien la liste du
    // foyer, et les enregistrer est le comportement voulu. C'est le seul cas
    // où écrire les défauts est juste.
    dbGet.mockResolvedValue(null);

    await initCustomLists();

    expect(listesIncertaines()).toBe(false);
    expect(getCategories()).toHaveLength(CATEGORIES.length);
  });

  it('applique le repli et lève quand la lecture échoue', async () => {
    dbGet.mockRejectedValue(new Error('hors ligne'));

    await expect(initCustomLists()).rejects.toThrow('hors ligne');

    // Le repli reste : sans catégories, aucun formulaire de charge n'est
    // utilisable.
    expect(getCategories()).toHaveLength(CATEGORIES.length);
    expect(listesIncertaines()).toBe(true);
  });

  it('refuse d\'écrire tant que les listes sont incertaines', async () => {
    dbGet.mockRejectedValue(new Error('hors ligne'));
    await initCustomLists().catch(() => {});

    await ajouterParLaModale('Fête');

    // Rien n'est parti : c'est cette écriture-là qui aurait réécrit
    // « Supermarché » en « Courses ».
    expect(transaction, 'une liste non lue a été réécrite en base').not.toHaveBeenCalled();
    expect(toasts.error).toHaveBeenCalledTimes(1);
    expect(toasts.error.mock.calls[0][0]).toContain('Listes non chargées');
  });

  it('écrit de nouveau dès qu\'une lecture aboutit', async () => {
    dbGet.mockRejectedValue(new Error('hors ligne'));
    await initCustomLists().catch(() => {});
    expect(listesIncertaines()).toBe(true);

    // La session suivante, ou un simple retour du réseau.
    dbGet.mockReset();
    dbGet.mockResolvedValue(EN_BASE);
    await initCustomLists();

    await ajouterParLaModale('Fête');

    expect(listesIncertaines()).toBe(false);
    expect(transaction, 'le refus est resté collé après une lecture réussie').toHaveBeenCalled();
  });
});
