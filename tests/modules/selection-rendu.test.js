// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * La moitié visible du mode sélection : ce que la liste dessine
 *
 * Le mode n'existe qu'à travers les lignes. `selection-charges.test.js` juge
 * des écritures et bouchonne donc le rendu ; cette suite-ci fait l'inverse —
 * le vrai `renderVariableCharges`, et l'état pour seule entrée.
 *
 * Ce qui s'y vérifie : qu'une ligne porte une case quand il le faut, et qu'elle
 * perd alors les deux boutons qui feraient double emploi avec le lot.
 */

vi.mock('../../public/js/db.js', () => ({
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve()),
  dbPush: vi.fn(() => Promise.resolve('cle')),
  getDataPath: vi.fn(path => `household/${path}`)
}));
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
vi.mock('../../public/js/modules/summary.js', () => ({
  calculateSummary: vi.fn(() => ({ balance: 0 }))
}));
vi.mock('../../public/js/modules/trash.js', () => ({ refreshTrashButton: vi.fn() }));
vi.mock('../../public/js/modules/map.js', () => ({ refreshMapButton: vi.fn() }));
vi.mock('../../public/js/modules/trends.js', () => ({ invalidateTrends: vi.fn() }));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategoryIcon: vi.fn(() => '🛒'),
  getCategories: vi.fn(() => [{ id: 'courses', icon: '🛒', label: 'Courses' }]),
  populateCategorySelect: vi.fn(),
  populateDestinationSelect: vi.fn()
}));
vi.mock('../../public/js/modules/envelopes.js', () => ({
  populateEnvelopeSelect: vi.fn(),
  etiquetteEnveloppe: vi.fn(() => '')
}));

const { renderVariableCharges } = await import('../../public/js/modules/variable-charges.js');
const { setState, resetState } = await import('../../public/js/state.js');

const CHARGES = [
  { id: 'a', amount: 12.5, description: 'Courses', category: 'Autre', paidBy: 'vous' },
  { id: 'b', amount: 30, description: 'Essence', category: 'Autre', paidBy: 'vous' },
  { id: 'c', amount: 7.25, description: 'Pain', category: 'Autre', paidBy: 'vous' }
];

/** Rend la liste dans l'état de sélection demandé */
function rendreAvec({ actif, ids }) {
  setState('selectionCharges', { actif, ids });
  renderVariableCharges();
}

beforeEach(() => {
  resetState();
  document.body.innerHTML = `
    <button type="button" id="selectionBasculer" aria-pressed="false">Sélectionner</button>
    <div class="selection-barre" id="selectionBarre" hidden>
      <div id="selectionCompte"></div>
      <select id="selectionCategorie"></select>
      <select id="selectionEnveloppe"></select>
      <button type="button" id="selectionSupprimer">Supprimer</button>
    </div>
    <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
  `;
  setState('currentPeriod', '2026-08');
  setState('variableCharges', CHARGES);
});

describe('Hors mode sélection, rien ne change', () => {
  it('le crayon et la corbeille sont là, aucune case', () => {
    rendreAvec({ actif: false, ids: [] });

    expect(document.querySelectorAll('.charge-choix')).toHaveLength(0);
    expect(document.querySelectorAll('[data-action="editVariableCharge"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-action="deleteVariableCharge"]')).toHaveLength(3);
  });
});

describe('En mode sélection', () => {
  it('une case par ligne, et plus de boutons de ligne', () => {
    // Les garder ferait deux suppressions concurrentes sur la même ligne —
    // l'unitaire et celle du lot — et le crayon ouvrirait une modale par-dessus
    // une sélection en cours.
    rendreAvec({ actif: true, ids: [] });

    expect(document.querySelectorAll('.charge-choix')).toHaveLength(3);
    expect(document.querySelectorAll('[data-action="editVariableCharge"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-action="deleteVariableCharge"]')).toHaveLength(0);
  });

  it('le montant reste : c\'est sur lui qu\'on juge ce qu\'on coche', () => {
    rendreAvec({ actif: true, ids: [] });

    expect(document.querySelectorAll('.charge-amount')).toHaveLength(3);
  });

  it('les cases cochées sont celles de la sélection', () => {
    rendreAvec({ actif: true, ids: ['a', 'c'] });

    const cochees = [...document.querySelectorAll('.charge-choix')]
      .filter(case_ => case_.checked)
      .map(case_ => case_.dataset.arg);
    expect(cochees).toEqual(['a', 'c']);
  });

  it('la case porte l\'action et l\'identifiant de sa ligne', () => {
    rendreAvec({ actif: true, ids: [] });

    const premiere = document.querySelector('.charge-choix');
    expect(premiere.dataset.action).toBe('basculerChargeChoisie');
    expect(premiere.dataset.arg).toBe('a');
  });

  it('chaque case se nomme, description et montant', () => {
    // Trois cases identiques ne disent rien à un lecteur d'écran, et c'est le
    // montant qui décide de ce qu'on coche.
    rendreAvec({ actif: true, ids: [] });

    const nom = document.querySelector('.charge-choix').getAttribute('aria-label');
    expect(nom).toContain('Courses');
    expect(nom).toContain('12,50');
  });

  it('la ligne retenue se distingue à l\'œil', () => {
    rendreAvec({ actif: true, ids: ['a'] });

    const lignes = [...document.querySelectorAll('.charge-item')];
    expect(lignes[0].classList.contains('charge-item--choisie')).toBe(true);
    expect(lignes[1].classList.contains('charge-item--choisie')).toBe(false);
  });
});

describe('La barre suit la liste', () => {
  it('un mois vide ramène le compte à zéro', () => {
    // Le cas réel : on coche en août, on navigue vers septembre. Personne ne
    // prévient la sélection — c'est le rendu de la nouvelle liste qui le fait.
    rendreAvec({ actif: true, ids: ['a', 'b'] });
    expect(document.getElementById('selectionCompte').textContent).toContain('2 sélectionnées');

    setState('variableCharges', []);
    renderVariableCharges();

    expect(document.getElementById('selectionCompte').textContent)
      .toContain('Touchez les charges');
  });

  it('les identifiants d\'un autre mois ne comptent pas', () => {
    rendreAvec({ actif: true, ids: ['a', 'b'] });
    setState('variableCharges', [{ id: 'z', amount: 5, description: 'Autre mois', paidBy: 'vous' }]);
    renderVariableCharges();

    expect(document.getElementById('selectionCompte').textContent)
      .toContain('Touchez les charges');
  });
});

describe('Une description hostile', () => {
  it('n\'ouvre aucun nœud depuis le nom de la case', () => {
    // `aria-label` est un attribut : sans échappement, un guillemet le referme
    // et ce qui suit devient du balisage. La politique de sécurité empêcherait
    // l'exécution, mais elle est la dernière ligne, pas la première.
    setState('variableCharges', [
      { id: 'x', amount: 5, description: '"><img src=x onerror=alert(1)>', category: 'Autre', paidBy: 'vous' }
    ]);
    rendreAvec({ actif: true, ids: [] });

    expect(document.querySelector('#variableChargesList img')).toBeNull();
  });
});

/**
 * Le focus, après un rendu qui détruit ce qu'on venait de toucher
 *
 * Cocher redessine la liste entière. À la souris cela ne se voit pas ; au
 * clavier, le focus retombe sur le corps du document, et cocher trois charges
 * de suite demande de re-tabuler depuis le haut de la page à chaque fois.
 */
describe('Le focus revient à la case qu\'on vient de cocher', () => {
  it('après une bascule, la case garde la main', async () => {
    const { initSelectionCharges, basculerModeSelection, basculerChargeChoisie } =
      await import('../../public/js/modules/selection-charges.js');

    initSelectionCharges();
    basculerModeSelection();
    basculerChargeChoisie('b');

    // Le rendu passe par un import différé : laisser la microtâche s'achever.
    await vi.waitFor(() => {
      expect(document.activeElement.dataset.arg).toBe('b');
    });
    expect(document.activeElement.classList.contains('charge-choix')).toBe(true);
  });
});
