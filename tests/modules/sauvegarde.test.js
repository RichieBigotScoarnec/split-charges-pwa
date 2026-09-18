// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', async (reel) => ({
  // Le double part du VRAI module : `TON` y est déclaré, et le
  // recopier ici en ferait une seconde rédaction de la même table.
  ...await reel(),
  showModal: vi.fn(), closeModal: vi.fn(),
  showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

/**
 * `db.js` est mocké AUTOUR de l'original : `cheminDuPersonnel` doit être la
 * vraie fabrique, sinon ces cas mesureraient un chemin que l'application
 * n'emprunte pas.
 */
const dbGet = vi.fn(async () => null);
const dbSet = vi.fn(async () => {});
const dbUpdate = vi.fn(async () => {});

vi.mock('../../public/js/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  dbGet, dbSet, dbUpdate,
  liaisonRompue: vi.fn(() => false)
}));
vi.mock('../../public/js/state.js', () => ({ getState: vi.fn(() => 'vous') }));

const { toast } = await import('../../public/js/components/toast.js');
const {
  validateBackup, describeBackup, restoreBackup, ecrituresDeRestauration
} = await import('../../public/js/modules/backup.js');

/**
 * Restaurer écrase l'intégralité des données du foyer. Le fichier doit donc
 * prouver qu'il est bien une sauvegarde FairSplit avant qu'on le laisse faire,
 * et la confirmation doit dire ce qu'il contient — pas seulement demander
 * « êtes-vous sûr ? ».
 */
describe('Validation d\'un fichier de sauvegarde', () => {
  /** @returns {Object} Une enveloppe valide */
  const valide = (extra = {}) => ({
    format: 'fairsplit-backup',
    version: 1,
    exportedAt: '2026-08-20T10:30:00.000Z',
    data: { periods: { '2026-07': {}, '2026-08': {} } },
    ...extra
  });

  it('accepte une sauvegarde bien formée', () => {
    expect(validateBackup(valide())).toBeNull();
  });

  it('refuse ce qui n\'est pas une enveloppe FairSplit', () => {
    // Un JSON quelconque déposé par erreur ne doit pas pouvoir écraser
    // plusieurs années de comptes.
    expect(validateBackup({ periods: {} })).toMatch(/pas une sauvegarde/);
    expect(validateBackup(valide({ format: 'autre-chose' }))).toMatch(/pas une sauvegarde/);
  });

  it('refuse les valeurs qui ne sont pas des objets', () => {
    expect(validateBackup(null)).toMatch(/pas une sauvegarde/);
    expect(validateBackup('texte')).toMatch(/pas une sauvegarde/);
    expect(validateBackup(42)).toMatch(/pas une sauvegarde/);
    expect(validateBackup([])).toMatch(/pas une sauvegarde/);
  });

  it('refuse une sauvegarde issue d\'une version plus récente', () => {
    // Un format futur peut porter des champs que ce code ignorerait
    // silencieusement : mieux vaut refuser que restaurer à moitié.
    expect(validateBackup(valide({ version: 2 }))).toMatch(/plus récente/);
    expect(validateBackup(valide({ version: '1' }))).toMatch(/plus récente/);
  });

  it('accepte une sauvegarde portant des enveloppes transversales', () => {
    // La sauvegarde lit la racine entière : les enveloppes y figurent dès leur
    // création. Omises de la liste des nœuds connus, elles auraient fait
    // refuser la restauration des sauvegardes les plus récentes du foyer —
    // celles-là mêmes qu'on veut restaurer.
    expect(validateBackup(valide({
      data: { envelopes: [{ id: 'vacances', label: 'Vacances' }], periods: {} }
    }))).toBeNull();
  });

  it('refuse toujours un nœud que l\'application ne sait pas écrire', () => {
    // Le garde-fou reste en place : élargir la liste pour les enveloppes ne
    // doit pas l'avoir ouverte à tout.
    expect(validateBackup(valide({
      data: { periods: {}, nimporteQuoi: { a: 1 } }
    }))).toMatch(/ne connaît pas : nimporteQuoi/);
  });

  it('refuse une enveloppe sans données exploitables', () => {
    expect(validateBackup(valide({ data: null }))).toMatch(/aucune donnée/);
    expect(validateBackup(valide({ data: [] }))).toMatch(/aucune donnée/);
    expect(validateBackup(valide({ data: 'rien' }))).toMatch(/aucune donnée/);
  });

  it('accepte tous les nœuds que l\'application écrit', () => {
    // Cette liste double celle des règles de sécurité : si l'une accepte un
    // nœud que l'autre refuse, une restauration légitime échoue.
    expect(validateBackup(valide({
      data: {
        salaries: { vous: 3000, conjointe: 2000 },
        members: { vous: 'Richard', conjointe: 'Cindy' },
        shareMode: { mode: 'prorata' },
        carryOverEnabled: true,
        categoryBudgets: { Courses: 400 },
        customCategories: [],
        customDestinations: [],
        envelopes: [{ id: 'vacances', label: 'Vacances', icon: '🏖️' }],
        reminders: { finMois: false },
        periods: {}
      }
    }))).toBeNull();
  });

  it('refuse un nœud que l\'application ne sait pas écrire, et le nomme', () => {
    // Les règles le refuseraient de toute façon, mais après le téléchargement
    // de la copie de secours et sans dire lequel.
    const probleme = validateBackup(valide({
      data: { periods: {}, charge_utile: { quoi: 'que ce soit' } }
    }));

    expect(probleme).toMatch(/charge_utile/);
  });

  it('accepte une sauvegarde vide mais structurée', () => {
    // Un foyer qui n'a encore rien saisi produit une sauvegarde vide ; elle
    // reste valide.
    expect(validateBackup(valide({ data: {} }))).toBeNull();
  });
});

describe('Description d\'une sauvegarde', () => {
  it('annonce le nombre de mois et la date', () => {
    const texte = describeBackup({
      exportedAt: '2026-08-20T10:30:00.000Z',
      data: { periods: { '2026-07': {}, '2026-08': {} } }
    });

    expect(texte).toContain('2 mois');
    expect(texte).toContain('2026');
  });

  it('supporte une sauvegarde sans période', () => {
    expect(describeBackup({ exportedAt: '2026-08-20T10:30:00.000Z', data: {} }))
      .toContain('0 mois');
  });

  it('supporte une date absente', () => {
    expect(describeBackup({ data: { periods: { '2026-08': {} } } }))
      .toContain('date inconnue');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RESTAURATION SE FAIT EN DEUX ÉCRITURES, ET LE MESSAGE DOIT DIRE LAQUELLE
 * A ABOUTI
 *
 * Depuis le mur du 2026-09-16, un fichier de sauvegarde ne peut plus porter la
 * poche personnelle de l'autre — on n'a pas le droit de la lire. Or un `set`
 * de racine supprime ce qu'il ne porte pas : restaurer aurait effacé cette
 * poche, en silence, le jour précis où l'on restaure parce que quelque chose
 * est déjà cassé.
 *
 * La restauration écrit donc le foyer en une mise à jour multi-chemins, puis sa
 * SEULE poche par un chemin dédié. Deux écritures, donc deux issues d'échec —
 * et « vos données n'ont pas été modifiées », qui était vrai quand un seul
 * `set` faisait tout, devient faux sur la seconde.
 */
describe('La restauration, en deux écritures', () => {
  const CHARGE_PERSO = { amount: 30, description: 'Coiffeur', perimetre: 'solo' };

  const fichier = (data) => ({
    text: async () => JSON.stringify({
      format: 'fairsplit-backup',
      version: 1,
      exportedAt: '2026-09-16T10:00:00.000Z',
      data
    })
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dbGet.mockImplementation(async () => null);
    dbSet.mockImplementation(async () => {});
    dbUpdate.mockImplementation(async () => {});
    // `telecharger` prend une copie de sécurité avant toute écriture.
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it("n'écrit JAMAIS `personnel` par la racine", async () => {
    await restoreBackup(fichier({
      periods: {}, personnel: { vous: { periods: { '2026-09': {} } } }
    }));

    expect(dbUpdate).toHaveBeenCalledTimes(1);
    const [chemin, ecritures] = dbUpdate.mock.calls[0];
    expect(chemin).toBeUndefined();
    expect(Object.keys(ecritures)).not.toContain('personnel');
  });

  it('écrit SA poche par son chemin propre, après le foyer', async () => {
    await restoreBackup(fichier({
      periods: {},
      personnel: { vous: { periods: { '2026-09': { variableCharges: { a: CHARGE_PERSO } } } } }
    }));

    expect(dbSet).toHaveBeenCalledWith('personnel/vous', expect.objectContaining({
      periods: { '2026-09': { variableCharges: { a: CHARGE_PERSO } } }
    }));
    expect(dbUpdate.mock.invocationCallOrder[0])
      .toBeLessThan(dbSet.mock.invocationCallOrder[0]);
  });

  it("un fichier sans poche personnelle n'en crée pas une vide", async () => {
    // Sinon la sauvegarde suivante porterait un nœud `personnel` que celle
    // d'avant n'avait pas — et l'enveloppe changerait de forme sans raison.
    await restoreBackup(fichier({ periods: {}, salaries: { vous: 1 } }));

    expect(dbSet).not.toHaveBeenCalled();
  });

  it('un échec du FOYER dit que rien n\'a bougé', async () => {
    dbUpdate.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));

    await restoreBackup(fichier({ periods: {} }));

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('n\'ont pas été modifiées'));
  });

  it('un échec de la POCHE dit que le foyer, lui, est restauré', async () => {
    // Le cas que l'ancien message trahissait : il aurait annoncé « rien n'a
    // été modifié » alors que tout le foyer venait d'être remplacé. La
    // personne aurait relancé, ou pire, ne l'aurait pas fait.
    dbSet.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));

    await restoreBackup(fichier({
      periods: {}, personnel: { vous: { periods: { '2026-09': {} } } }
    }));

    const message = toast.error.mock.calls.at(-1)[0];
    expect(message).toContain('Foyer restauré');
    expect(message).not.toContain('n\'ont pas été modifiées');
  });

  it('LE TÉMOIN — une restauration qui aboutit ne signale aucune erreur', async () => {
    // Sans lui, les deux cas ci-dessus seraient satisfaits par une
    // restauration qui échoue TOUJOURS.
    await restoreBackup(fichier({
      periods: {}, personnel: { vous: { periods: { '2026-09': {} } } }
    }));

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('restaurée'));
  });

  it('la fabrique efface ce que le fichier ne porte pas', async () => {
    // La propriété qui rend la mise à jour multi-chemins équivalente au `set`
    // d'avant SUR LES NŒUDS DU FOYER : un nœud présent en base et absent du
    // fichier ne doit pas survivre à sa propre restauration.
    const ecritures = ecrituresDeRestauration({ salaries: { vous: 1 } }, 'personnel', 7);

    expect(ecritures.salaries).toEqual({ vous: 1 });
    expect(ecritures.periods).toBeNull();
    expect(ecritures.restaureLe).toBe(7);
  });
});
