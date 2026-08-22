// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Carte des dépenses : ce qu'elle montre, et ce qu'elle montrait
 *
 * Deux défauts se tenaient dans ce module, et aucun test ne les voyait.
 *
 * Les cases de filtrage étaient figées dans le balisage sur cinq libellés —
 * dont « Alimentation », qui n'a jamais existé dans le projet. Le filtrage
 * étant une correspondance exacte, toute dépense de Courses, Maison, Essence
 * ou Restaurant n'était retenue par aucune case et disparaissait, cases toutes
 * cochées comprises. Les catégories personnalisées subissaient le même sort.
 *
 * À défaut de coordonnées, le module en inventait ensuite à Paris d'après un
 * mot-clé de la description, avec une variation aléatoire à chaque ouverture.
 * Une carte de comptes doit montrer ce qui a été enregistré.
 */

vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategories: vi.fn(() => [
    { id: 'courses', icon: '🛒', label: 'Courses' },
    { id: 'restaurant', icon: '🍕', label: 'Restaurant' },
    { id: 'transport', icon: '🚌', label: 'Transport' },
    { id: 'brocante', icon: '🎪', label: 'Brocante' }
  ]),
  getCategoryIcon: vi.fn(label => ({
    Courses: '🛒', Restaurant: '🍕', Transport: '🚌', Brocante: '🎪'
  }[label] || '📦'))
}));

const { buildCategoryFilters, chargesLocalisees } = await import('../../public/js/modules/map.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** Dépense localisée */
const localisee = (description, category, extra = {}) => ({
  id: description, description, category, amount: 20,
  paidBy: 'vous', deleted: false,
  location: { lat: 48.8, lng: 2.3, name: description },
  ...extra
});

/** Libellés des cases de filtrage rendues */
const casesRendues = () => Array.from(
  document.querySelectorAll('#mapFilters .map-category-filter')
).map(c => c.value);

beforeEach(() => {
  resetState();
  document.body.innerHTML = '<div class="map-filters" id="mapFilters"></div>';
});

describe('Les cases de filtrage suivent les dépenses affichées', () => {
  it('une dépense de Courses a sa case — elle n\'en avait aucune', () => {
    // Le cas qui faisait disparaître la moitié des dépenses : « Courses » ne
    // figurait pas dans la liste figée, donc aucune case ne la retenait.
    buildCategoryFilters([localisee('Leclerc', 'Courses')]);

    expect(casesRendues()).toContain('Courses');
  });

  it('chaque dépense affichée a une case qui la montre', () => {
    // L'invariant qui manquait. Sans lui, un marqueur pouvait exister sans
    // qu'aucune case ne puisse le rendre visible.
    const charges = [
      localisee('Leclerc', 'Courses'),
      localisee('Burger King', 'Restaurant'),
      localisee('Bus', 'Transport')
    ];

    buildCategoryFilters(charges);
    const cases = casesRendues();

    for (const charge of charges) {
      expect(cases, `aucune case pour ${charge.category}`).toContain(charge.category);
    }
  });

  it('une catégorie personnalisée est filtrable', () => {
    buildCategoryFilters([localisee('Vide-grenier', 'Brocante')]);

    expect(casesRendues()).toContain('Brocante');
  });

  it('une catégorie supprimée depuis reste filtrable tant qu\'une dépense la porte', () => {
    // Sinon la dépense resterait sur la carte sans moyen de l'y voir.
    buildCategoryFilters([localisee('Ancienne', 'Catégorie disparue')]);

    expect(casesRendues()).toContain('Catégorie disparue');
  });

  it('aucune case pour une catégorie sans dépense localisée', () => {
    buildCategoryFilters([localisee('Leclerc', 'Courses')]);

    expect(casesRendues()).not.toContain('Restaurant');
    expect(casesRendues()).toHaveLength(1);
  });

  it('les cases sont cochées d\'emblée', () => {
    buildCategoryFilters([localisee('Leclerc', 'Courses')]);

    const cases = document.querySelectorAll('#mapFilters .map-category-filter');
    for (const c of cases) expect(c.checked).toBe(true);
  });

  it('un libellé porteur de balisage est affiché en texte', () => {
    buildCategoryFilters([localisee('Piégée', '<img src=x onerror=alert(1)>')]);

    expect(document.querySelector('#mapFilters img')).toBeNull();
  });

  it('l\'ordre suit les catégories configurées, les héritées à la fin', () => {
    buildCategoryFilters([
      localisee('Ancienne', 'Catégorie disparue'),
      localisee('Bus', 'Transport'),
      localisee('Leclerc', 'Courses')
    ]);

    expect(casesRendues()).toEqual(['Courses', 'Transport', 'Catégorie disparue']);
  });
});

describe('Seules les dépenses réellement localisées sont retenues', () => {
  it('une dépense sans coordonnées est écartée', () => {
    setState('variableCharges', [
      { id: 'a', description: 'Restaurant du coin', category: 'Restaurant', amount: 30, deleted: false }
    ]);
    setState('fixedCharges', []);

    expect(chargesLocalisees()).toHaveLength(0);
  });

  it('une description évoquant un lieu connu n\'invente plus de coordonnées', () => {
    // « carrefour », « restaurant », « essence » déclenchaient une position
    // fabriquée à Paris, présentée comme une donnée enregistrée.
    setState('variableCharges', [
      { id: 'a', description: 'Courses Carrefour', category: 'Courses', amount: 50, deleted: false },
      { id: 'b', description: 'Essence', category: 'Essence', amount: 60, deleted: false }
    ]);
    setState('fixedCharges', []);

    expect(chargesLocalisees()).toHaveLength(0);
  });

  it('une dépense avec de vraies coordonnées est retenue', () => {
    setState('variableCharges', [localisee('Burger King', 'Restaurant')]);
    setState('fixedCharges', []);

    const retenues = chargesLocalisees();
    expect(retenues).toHaveLength(1);
    expect(retenues[0].location.lat).toBe(48.8);
  });

  it('une dépense supprimée est écartée', () => {
    setState('variableCharges', [localisee('Burger King', 'Restaurant', { deleted: true })]);
    setState('fixedCharges', []);

    expect(chargesLocalisees()).toHaveLength(0);
  });

  it('les charges fixes localisées comptent aussi', () => {
    setState('variableCharges', []);
    setState('fixedCharges', [localisee('Parking', 'Transport')]);

    expect(chargesLocalisees()).toHaveLength(1);
  });
});
