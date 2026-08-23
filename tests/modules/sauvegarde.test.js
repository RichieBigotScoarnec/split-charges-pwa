// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(),
  showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

const { validateBackup, describeBackup } = await import('../../public/js/modules/backup.js');

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
