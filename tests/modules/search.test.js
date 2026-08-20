// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));

import { setState, resetState } from '../../public/js/state.js';
import { performSearch, clearSearch } from '../../public/js/modules/search.js';

/**
 * Configure le DOM avec des charge-items dont les data-id correspondent aux IDs des
 * charges présentes dans le state. Nécessaire pour que filterChargesDisplay() puisse
 * afficher/masquer les items correctement.
 */
function setupDOM(variableIds = [], fixedIds = []) {
  const varItems = variableIds.map(id =>
    `<div class="charge-item" data-id="${id}"><span class="charge-description">${id}</span></div>`
  ).join('');
  const fixItems = fixedIds.map(id =>
    `<div class="charge-item" data-id="${id}"><span class="charge-description">${id}</span></div>`
  ).join('');

  document.body.innerHTML = `
    <input id="searchInput" />
    <div id="searchResultsInfo"></div>
    <button id="searchClearBtn"></button>
    <div id="variableChargesList">
      <div class="charge-category">
        ${varItems}
      </div>
    </div>
    <div id="fixedChargesList">
      <div class="charge-category">
        ${fixItems}
      </div>
    </div>
  `;
}

beforeEach(() => {
  resetState();
  vi.clearAllMocks();
});

// ===== Recherche par description =====
describe('performSearch — recherche par description', () => {
  it('trouve une charge variable dont la description contient la query', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'Courses Carrefour', amount: 50, category: 'Alimentation', paidBy: 'vous' }
    ]);
    setupDOM(['v1']);
    performSearch('carrefour');
    const item = document.querySelector('[data-id="v1"]');
    // Quand trouvée → display non forcé à none
    expect(item.style.display).not.toBe('none');
  });

  it('masque une charge variable dont la description ne contient pas la query', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'Cinéma UGC', amount: 20, category: 'Loisirs', paidBy: 'vous' }
    ]);
    setupDOM(['v1']);
    performSearch('carrefour');
    const item = document.querySelector('[data-id="v1"]');
    expect(item.style.display).toBe('none');
  });

  it('recherche insensible à la casse', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'COURSES Carrefour', amount: 50, category: 'Ali', paidBy: 'vous' }
    ]);
    setupDOM(['v1']);
    performSearch('courses');
    expect(document.querySelector('[data-id="v1"]').style.display).not.toBe('none');
  });

  it('cherche dans plusieurs charges — seule la correspondance reste visible', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'Courses Carrefour', amount: 50, category: 'Ali', paidBy: 'vous' },
      { id: 'v2', description: 'Cinéma UGC', amount: 20, category: 'Loisirs', paidBy: 'vous' }
    ]);
    setupDOM(['v1', 'v2']);
    performSearch('carrefour');
    expect(document.querySelector('[data-id="v1"]').style.display).not.toBe('none');
    expect(document.querySelector('[data-id="v2"]').style.display).toBe('none');
  });
});

// ===== Recherche par catégorie =====
describe('performSearch — recherche par catégorie', () => {
  it('trouve une charge par catégorie', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'Achat X', amount: 100, category: 'Alimentation', paidBy: 'vous' },
      { id: 'v2', description: 'Achat Y', amount: 50, category: 'Transport', paidBy: 'vous' }
    ]);
    setupDOM(['v1', 'v2']);
    performSearch('alimentation');
    expect(document.querySelector('[data-id="v1"]').style.display).not.toBe('none');
    expect(document.querySelector('[data-id="v2"]').style.display).toBe('none');
  });
});

// ===== Recherche par montant =====
describe('performSearch — recherche par montant', () => {
  it('trouve une charge dont le montant contient la query', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'Test', amount: 85.50, category: 'Ali', paidBy: 'vous' },
      { id: 'v2', description: 'Autre', amount: 100, category: 'Ali', paidBy: 'vous' }
    ]);
    setupDOM(['v1', 'v2']);
    performSearch('85');
    expect(document.querySelector('[data-id="v1"]').style.display).not.toBe('none');
    expect(document.querySelector('[data-id="v2"]').style.display).toBe('none');
  });
});

// ===== Recherche dans charges fixes =====
describe('performSearch — charges fixes', () => {
  it('trouve une charge fixe par description', () => {
    setState('fixedCharges', [
      { id: 'f1', description: 'Loyer mensuel', amount: 1200, category: 'Logement', paidBy: 'vous' },
      { id: 'f2', description: 'EDF', amount: 80, category: 'Énergie', paidBy: 'conjointe' }
    ]);
    setupDOM([], ['f1', 'f2']);
    performSearch('loyer');
    expect(document.querySelector('[data-id="f1"]').style.display).not.toBe('none');
    expect(document.querySelector('[data-id="f2"]').style.display).toBe('none');
  });
});

// ===== Recherche sans résultat =====
describe('performSearch — aucun résultat', () => {
  it('masque toutes les charges si aucune ne correspond', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'Courses', amount: 50, category: 'Ali', paidBy: 'vous' },
      { id: 'v2', description: 'Cinéma', amount: 20, category: 'Loisirs', paidBy: 'vous' }
    ]);
    setupDOM(['v1', 'v2']);
    performSearch('zzzinexistant');
    expect(document.querySelector('[data-id="v1"]').style.display).toBe('none');
    expect(document.querySelector('[data-id="v2"]').style.display).toBe('none');
  });

  it('query vide → ne masque rien', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'Test', amount: 10, category: 'Ali', paidBy: 'vous' }
    ]);
    setupDOM(['v1']);
    // Query vide → aucun filtrage (selon logique performSearch)
    // Le comportement dépend du min-length dans initSearch, mais performSearch elle-même
    // appelle searchInCharges('') qui retourne toutes les charges (match si '' ⊂ tout)
    performSearch('');
    expect(document.querySelector('[data-id="v1"]').style.display).not.toBe('none');
  });
});

// ===== Recherche dans note =====
describe('performSearch — recherche par note', () => {
  it('trouve une charge dont la note contient la query', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'Achat', amount: 30, category: 'Divers', note: 'anniversaire conjoint', paidBy: 'vous' },
      { id: 'v2', description: 'Autre', amount: 20, category: 'Divers', note: '', paidBy: 'vous' }
    ]);
    setupDOM(['v1', 'v2']);
    performSearch('anniversaire');
    expect(document.querySelector('[data-id="v1"]').style.display).not.toBe('none');
    expect(document.querySelector('[data-id="v2"]').style.display).toBe('none');
  });
});

// ===== Exclusion des charges supprimées =====
describe('performSearch — exclut les charges supprimées', () => {
  it('une charge deleted=true n\'est jamais dans les résultats', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'Courses', amount: 50, category: 'Ali', paidBy: 'vous', deleted: true }
    ]);
    setupDOM(['v1']);
    // La charge supprimée n'est pas dans les résultats
    // → filterChargesDisplay ne la retrouve pas dans results → style.display = 'none'
    performSearch('courses');
    expect(document.querySelector('[data-id="v1"]').style.display).toBe('none');
  });
});

// ===== clearSearch =====
describe('clearSearch', () => {
  it('remet tous les items à display par défaut', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'Test', amount: 10, category: 'Ali', paidBy: 'vous' }
    ]);
    setupDOM(['v1']);
    // Masquer d'abord via une recherche sans résultat
    performSearch('zzzinexistant');
    expect(document.querySelector('[data-id="v1"]').style.display).toBe('none');

    // Puis clear
    clearSearch();
    expect(document.querySelector('[data-id="v1"]').style.display).toBe('');
  });
});
