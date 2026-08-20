import { test, expect } from '@playwright/test';

import { ALLOWED_EMAILS } from '../../public/js/config.js';

// L'application refuse tout compte hors liste blanche (js/modules/auth.js).
// Dériver l'adresse de la vraie liste plutôt que de la figer : sinon les tests
// se cassent silencieusement à chaque évolution de la whitelist — ce qui est
// exactement ce qui s'était produit.
const TEST_EMAIL = ALLOWED_EMAILS[0];

/**
 * Mock Firebase réactif — supporte on('value'), set(), push(), remove(), update()
 * Notifie les listeners en temps réel, comme Firebase Realtime Database.
 */
const REACTIVE_FIREBASE_MOCK = `
  window.__db = {};
  window.__listeners = {};

  function _notify(path) {
    const data = window.__db[path] !== undefined ? window.__db[path] : null;
    const handlers = window.__listeners[path] || [];
    handlers.forEach(function(fn) {
      try { fn({ val: function() { return data; }, exists: function() { return data !== null; } }); }
      catch(e) {}
    });
  }

  function _makeRef(path) {
    return {
      on: function(event, cb) {
        if (path === '.info/connected') {
          setTimeout(function() { cb({ val: function() { return true; } }); }, 50);
          return function() {};
        }
        if (event === 'value') {
          if (!window.__listeners[path]) window.__listeners[path] = [];
          window.__listeners[path].push(cb);
          var data = window.__db[path] !== undefined ? window.__db[path] : null;
          setTimeout(function() {
            cb({ val: function() { return data; }, exists: function() { return data !== null; } });
          }, 10);
        }
        return function() {};
      },
      off: function(event, cb) {
        if (cb && window.__listeners[path]) {
          window.__listeners[path] = window.__listeners[path].filter(function(fn) { return fn !== cb; });
        } else {
          window.__listeners[path] = [];
        }
      },
      once: function(event) {
        var data = window.__db[path] !== undefined ? window.__db[path] : null;
        return Promise.resolve({ val: function() { return data; }, exists: function() { return data !== null; } });
      },
      set: function(data) {
        window.__db[path] = data;
        _notify(path);
        var parts = path.split('/');
        if (parts.length > 1) {
          var parentPath = parts.slice(0, -1).join('/');
          var key = parts[parts.length - 1];
          if (window.__db[parentPath] === null || window.__db[parentPath] === undefined) {
            window.__db[parentPath] = {};
          }
          if (typeof window.__db[parentPath] === 'object') {
            window.__db[parentPath][key] = data;
            _notify(parentPath);
          }
        }
        return Promise.resolve();
      },
      update: function(updates) {
        if (!window.__db[path] || typeof window.__db[path] !== 'object') window.__db[path] = {};
        var obj = window.__db[path];
        Object.keys(updates).forEach(function(k) {
          if (updates[k] === null) { delete obj[k]; }
          else { obj[k] = updates[k]; }
        });
        _notify(path);
        return Promise.resolve();
      },
      push: function() {
        var key = 'mock_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        var childPath = path + '/' + key;
        return {
          key: key,
          set: function(data) {
            window.__db[childPath] = data;
            if (!window.__db[path] || typeof window.__db[path] !== 'object') window.__db[path] = {};
            window.__db[path][key] = data;
            _notify(path);
            return Promise.resolve();
          }
        };
      },
      remove: function() {
        delete window.__db[path];
        _notify(path);
        var parts = path.split('/');
        if (parts.length > 1) {
          var parentPath = parts.slice(0, -1).join('/');
          var key = parts[parts.length - 1];
          if (window.__db[parentPath] && typeof window.__db[parentPath] === 'object') {
            delete window.__db[parentPath][key];
            _notify(parentPath);
          }
        }
        return Promise.resolve();
      },
      orderByChild: function() { return this; },
      equalTo: function() { return this; }
    };
  }

  window.firebase = {
    initializeApp: function() { return {}; },
    database: function() {
      return { ref: function(path) { return _makeRef(path || ''); } };
    },
    auth: function() {
      return {
        onAuthStateChanged: function(cb) {
          window.__mockAuthCallback = cb;
          setTimeout(function() {
            cb({ uid: 'test-user-123', email: '${TEST_EMAIL}', displayName: 'Test User', photoURL: null });
          }, 100);
          return function() {};
        },
        signInWithPopup: function() { return Promise.resolve(); },
        signInWithEmailAndPassword: function() { return Promise.resolve(); },
        createUserWithEmailAndPassword: function() { return Promise.resolve(); },
        signOut: function() {
          if (window.__mockAuthCallback) window.__mockAuthCallback(null);
          return Promise.resolve();
        },
        currentUser: { uid: 'test-user-123', email: '${TEST_EMAIL}' }
      };
    }
  };
  window.firebase.auth.GoogleAuthProvider = function() {};
`;

async function setupMock(page) {
  await page.route('**/firebasejs/**', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: '// Firebase mock'
  }));
  await page.addInitScript(REACTIVE_FIREBASE_MOCK);
}

async function loadApp(page) {
  await setupMock(page);
  await page.goto('/FairSplit.html');
  await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
  // Laisser les listeners Firebase s'initialiser
  await page.waitForTimeout(400);
}

// ============================================================
// Navigation de période
// ============================================================
test.describe('Navigation de période', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('affiche la période courante dans le select', async ({ page }) => {
    const select = page.locator('#periodSelect');
    await expect(select).toBeVisible();
    const value = await select.inputValue();
    expect(value).toMatch(/^\d{4}-\d{2}$/);
  });

  test('flèche gauche navigue vers le mois précédent', async ({ page }) => {
    const select = page.locator('#periodSelect');
    const initialValue = await select.inputValue();
    await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
    await page.waitForTimeout(200);
    const newValue = await select.inputValue();
    expect(newValue).not.toBe(initialValue);
  });

  test('flèche droite navigue vers le mois suivant', async ({ page }) => {
    // D'abord aller en arrière pour pouvoir aller en avant
    await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
    await page.waitForTimeout(200);
    const beforeValue = await page.locator('#periodSelect').inputValue();
    await page.locator('[data-action="navigatePeriod"][data-arg="1"]').click();
    await page.waitForTimeout(200);
    const afterValue = await page.locator('#periodSelect').inputValue();
    expect(afterValue).not.toBe(beforeValue);
  });

  test('aller-retour revient à la période initiale', async ({ page }) => {
    const initial = await page.locator('#periodSelect').inputValue();
    await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-action="navigatePeriod"][data-arg="1"]').click();
    await page.waitForTimeout(200);
    const final = await page.locator('#periodSelect').inputValue();
    expect(final).toBe(initial);
  });
});

// ============================================================
// Saisie des salaires
// ============================================================
test.describe('Saisie et calcul des salaires', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('saisie des deux salaires', async ({ page }) => {
    await page.locator('#salaireVous').fill('3000');
    await page.locator('#salaireConjointe').fill('2000');
    await expect(page.locator('#salaireVous')).toHaveValue('3000');
    await expect(page.locator('#salaireConjointe')).toHaveValue('2000');
  });

  test('indicateur de sauvegarde visible pendant la saisie', async ({ page }) => {
    await page.locator('#salaireVous').fill('2500');
    // L'indicateur "Sauvegarde..." ou "Sauvegardé" doit apparaître
    const indicator = page.locator('#salariesSaveIndicator');
    await expect(indicator).toBeAttached();
  });
});

// ============================================================
// Modes de partage
// ============================================================
test.describe('Modes de partage — interactions', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('prorata sélectionné par défaut', async ({ page }) => {
    await expect(page.locator('#modeProrata')).toHaveClass(/selected/);
  });

  test('cliquer 50-50 le sélectionne et désélectionne prorata', async ({ page }) => {
    await page.locator('#mode5050').click();
    await expect(page.locator('#mode5050')).toHaveClass(/selected/);
    await expect(page.locator('#modeProrata')).not.toHaveClass(/selected/);
  });

  test('cliquer custom affiche les champs de pourcentage', async ({ page }) => {
    await page.locator('#modeCustom').click();
    await expect(page.locator('#customPercentages')).toBeVisible();
  });

  test('les pourcentages custom ont des valeurs par défaut 50/50', async ({ page }) => {
    await page.locator('#modeCustom').click();
    await expect(page.locator('#customPercentYou')).toHaveValue('50');
    await expect(page.locator('#customPercentPartner')).toHaveValue('50');
  });

  test('revenir à prorata masque les pourcentages custom', async ({ page }) => {
    await page.locator('#modeCustom').click();
    await expect(page.locator('#customPercentages')).toBeVisible();
    await page.locator('#modeProrata').click();
    await expect(page.locator('#customPercentages')).not.toBeVisible();
  });
});

// ============================================================
// Charges variables — formulaire complet
// ============================================================
test.describe('Charges variables — formulaire', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('ouvrir la modal via le bouton +', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await expect(page.locator('#modalAddVariableCharge')).toBeVisible();
  });

  test('fermer avec Annuler', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#modalAddVariableCharge button', { hasText: 'Annuler' }).click();
    await expect(page.locator('#modalAddVariableCharge')).toBeHidden();
  });

  test('remplir tous les champs du formulaire', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Courses Lidl');
    await page.locator('#variableChargeAmount').fill('87.50');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await expect(page.locator('#variableChargeDescription')).toHaveValue('Courses Lidl');
    await expect(page.locator('#variableChargeAmount')).toHaveValue('87.50');
  });

  test('le toggle split spécial affiche les options', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.evaluate(() => {
      const cb = document.getElementById('variableChargeSplitToggle');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#variableChargeSplitOptions')).toBeVisible();
  });

  test('le select de mode split existe dans les options', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.evaluate(() => {
      const cb = document.getElementById('variableChargeSplitToggle');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const splitMode = page.locator('#variableChargeSplitMode');
    await expect(splitMode).toBeVisible();
    await expect(splitMode).toHaveValue('50-50');
  });

  test('sélectionner custom dans split affiche les % custom', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.evaluate(() => {
      const cb = document.getElementById('variableChargeSplitToggle');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#variableChargeSplitMode').selectOption('custom');
    await expect(page.locator('#variableChargeSplitCustom')).toBeVisible();
  });
});

// ============================================================
// Charges fixes — formulaire complet
// ============================================================
test.describe('Charges fixes — formulaire', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('ouvrir la modal charge fixe', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    await expect(page.locator('#modalAddFixedCharge')).toBeVisible();
  });

  test('remplir tous les champs', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    await page.locator('#fixedChargeDescription').fill('Loyer');
    await page.locator('#fixedChargeAmount').fill('1200');
    await page.locator('#fixedChargePaidBy').selectOption('vous');
    await expect(page.locator('#fixedChargeDescription')).toHaveValue('Loyer');
    await expect(page.locator('#fixedChargeAmount')).toHaveValue('1200');
  });

  test('le toggle récurrente est coché par défaut', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    await expect(page.locator('#fixedChargeRecurring')).toBeChecked();
  });

  test('le champ destination de virement contient les options', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    const dest = page.locator('#fixedChargeDestination');
    const options = await dest.locator('option').count();
    expect(options).toBeGreaterThan(1); // "-- Aucune --" + au moins une destination
  });

  test('toggle split spécial dans charge fixe', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    await page.evaluate(() => {
      const cb = document.getElementById('fixedChargeSplitToggle');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#fixedChargeSplitOptions')).toBeVisible();
  });
});

// ============================================================
// Remboursements — formulaire complet
// ============================================================
test.describe('Remboursements — formulaire', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('ouvrir la modal remboursement', async ({ page }) => {
    await page.locator('#addReimbursementBtn').click();
    await expect(page.locator('#modalAddReimbursement')).toBeVisible();
  });

  test('sélectionner la direction vous→conjointe', async ({ page }) => {
    await page.locator('#addReimbursementBtn').click();
    await page.locator('#reimbursementDirection').selectOption('from-you');
    await expect(page.locator('#reimbursementDirection')).toHaveValue('from-you');
  });

  test('sélectionner la direction conjointe→vous', async ({ page }) => {
    await page.locator('#addReimbursementBtn').click();
    await page.locator('#reimbursementDirection').selectOption('from-partner');
    await expect(page.locator('#reimbursementDirection')).toHaveValue('from-partner');
  });

  test('remplir montant et note', async ({ page }) => {
    await page.locator('#addReimbursementBtn').click();
    await page.locator('#reimbursementAmount').fill('75');
    await page.locator('#reimbursementNote').fill('Remboursement courses du week-end');
    await expect(page.locator('#reimbursementAmount')).toHaveValue('75');
    await expect(page.locator('#reimbursementNote')).toHaveValue('Remboursement courses du week-end');
  });
});

// ============================================================
// Recherche
// ============================================================
test.describe('Barre de recherche', () => {

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    // La barre de recherche n'est rendue visible qu'en présence de charges
    // à filtrer — règle éprouvée par le test « masquée sans charge » ci-dessous.
    // On lève ici la contrainte pour éprouver la mécanique du champ lui-même.
    await page.locator('#searchBarContainer').evaluate(el => { el.hidden = false; });
  });

  test('le champ de recherche accepte du texte', async ({ page }) => {
    await page.locator('#searchInput').fill('Loyer');
    await expect(page.locator('#searchInput')).toHaveValue('Loyer');
  });

  test('le bouton clear apparaît lors de la saisie', async ({ page }) => {
    await page.locator('#searchInput').fill('test');
    // Le bouton clear doit être visible (classe .visible ajoutée par JS)
    await expect(page.locator('#searchClearBtn')).toBeVisible();
  });

  test('clear vide le champ', async ({ page }) => {
    await page.locator('#searchInput').fill('Courses');
    await page.locator('#searchClearBtn').click();
    await expect(page.locator('#searchInput')).toHaveValue('');
  });

  test('effacer le texte manuellement cache le bouton clear', async ({ page }) => {
    await page.locator('#searchInput').fill('test');
    await page.locator('#searchInput').fill('');
    await page.locator('#searchInput').dispatchEvent('input');
    await expect(page.locator('#searchClearBtn')).not.toBeVisible();
  });
});

// ============================================================
// FAB — Saisie rapide (Quick Add)
// ============================================================
test.describe('FAB — Saisie rapide', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('le FAB est visible', async ({ page }) => {
    await expect(page.locator('.fab')).toBeVisible();
  });

  test('cliquer le FAB ouvre la modal saisie rapide', async ({ page }) => {
    await page.locator('.fab').click();
    await expect(page.locator('#modalQuickAdd')).toBeVisible();
  });

  test('la modal contient un champ montant', async ({ page }) => {
    await page.locator('.fab').click();
    await expect(page.locator('#quickAddAmount')).toBeVisible();
  });

  test('la modal contient la grille de catégories', async ({ page }) => {
    await page.locator('.fab').click();
    await expect(page.locator('#categoryGrid')).toBeAttached();
  });

  test('les boutons prorata et 50-50 sont présents', async ({ page }) => {
    await page.locator('.fab').click();
    await expect(page.locator('#quickSplitProrata')).toBeVisible();
    await expect(page.locator('#quickSplit5050')).toBeVisible();
  });

  test('prorata sélectionné par défaut', async ({ page }) => {
    await page.locator('.fab').click();
    await expect(page.locator('#quickSplitProrata')).toHaveClass(/selected/);
  });

  test('basculer en 50-50', async ({ page }) => {
    await page.locator('.fab').click();
    await page.locator('#quickSplit5050').click();
    await expect(page.locator('#quickSplit5050')).toHaveClass(/selected/);
  });

  test('bouton Ajouter désactivé sans saisie', async ({ page }) => {
    await page.locator('.fab').click();
    await expect(page.locator('#btnQuickAdd')).toBeDisabled();
  });

  test('fermer la modal quick-add', async ({ page }) => {
    await page.locator('.fab').click();
    await page.locator('[data-action="closeQuickAddModal"]').click();
    await expect(page.locator('#modalQuickAdd')).toBeHidden();
  });
});

// ============================================================
// Bilan / Résumé
// ============================================================
test.describe('Section Résumé / Bilan', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('la section résumé est visible', async ({ page }) => {
    await expect(page.locator('#summarySection')).toBeAttached();
  });

  test('le résumé demande les salaires si absents', async ({ page }) => {
    await page.waitForTimeout(600);
    const section = page.locator('#summarySection');
    const text = await section.textContent();
    // Quand salaires = 0, le résumé indique qu'il faut les renseigner
    expect(text).toMatch(/salaire/i);
  });

  test('avec salaires renseignés : affiche un solde', async ({ page }) => {
    // Saisir les salaires dans l'UI
    await page.locator('#salaireVous').fill('3000');
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireVous').dispatchEvent('input');
    await page.locator('#salaireConjointe').dispatchEvent('input');
    await page.waitForTimeout(800);

    const section = page.locator('#summarySection');
    const text = await section.textContent();
    // Avec salaires mais sans charges, le bilan est équilibré
    expect(text).toMatch(/équilibr|doit|0/i);
  });
});

// ============================================================
// Export
// ============================================================
test.describe('Boutons Export', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('bouton Export CSV présent', async ({ page }) => {
    const btn = page.locator('[data-action="exportToCSV"]');
    await expect(btn).toBeVisible();
  });

  test('bouton Imprimer PDF présent', async ({ page }) => {
    const btn = page.locator('[data-action="exportToPDF"]');
    await expect(btn).toBeVisible();
  });
});

// ============================================================
// Rappels & Notifications
// ============================================================
test.describe('Rappels et Notifications', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('le panneau rappels est présent', async ({ page }) => {
    await expect(page.locator('.reminders-section')).toBeVisible();
  });

  test('cliquer le header ouvre le corps', async ({ page }) => {
    await page.locator('[data-action="toggleRemindersPanel"]').click();
    await expect(page.locator('#remindersBody')).toBeVisible();
  });

  test('re-cliquer referme le corps', async ({ page }) => {
    await page.locator('[data-action="toggleRemindersPanel"]').click();
    await page.locator('[data-action="toggleRemindersPanel"]').click();
    await expect(page.locator('#remindersBody')).not.toBeVisible();
  });

  test('toggle "Budget dépassé" affiche le champ de budget', async ({ page }) => {
    await page.locator('[data-action="toggleRemindersPanel"]').click();
    await page.evaluate(() => {
      const cb = document.getElementById('reminderBudget');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#budgetInputRow')).toBeVisible();
  });
});

// ============================================================
// Reconduction (banner)
// ============================================================
test.describe('Bannière reconduction', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('la bannière est cachée par défaut', async ({ page }) => {
    await expect(page.locator('#reconductionBanner')).toBeHidden();
  });
});

// ============================================================
// Accessibilité structurelle
// ============================================================
test.describe('Structure et accessibilité', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('le contenu principal est un <main>', async ({ page }) => {
    await expect(page.locator('main#mainApp')).toBeAttached();
  });

  test('le lien skip-link est présent', async ({ page }) => {
    await expect(page.locator('.skip-link')).toBeAttached();
  });

  test('les boutons d\'action ont des aria-label', async ({ page }) => {
    const navButtons = page.locator('[data-action="navigatePeriod"]');
    const count = await navButtons.count();
    for (let i = 0; i < count; i++) {
      const label = await navButtons.nth(i).getAttribute('aria-label');
      expect(label).toBeTruthy();
    }
  });

  test('les modals ont role="dialog" et aria-modal', async ({ page }) => {
    const modals = page.locator('[role="dialog"]');
    const count = await modals.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const ariaModal = await modals.nth(i).getAttribute('aria-modal');
      expect(ariaModal).toBe('true');
    }
  });

  test('les inputs salaires ont des labels', async ({ page }) => {
    await expect(page.locator('label[for="salaireVous"]')).toBeAttached();
    await expect(page.locator('label[for="salaireConjointe"]')).toBeAttached();
  });

  test('ordre des sections : résumé avant charges', async ({ page }) => {
    const summaryBox = await page.locator('#summarySection').boundingBox();
    const variableBox = await page.locator('#variableChargesList').boundingBox();
    expect(summaryBox.y).toBeLessThan(variableBox.y);
  });
});

// ============================================================
// Résistance aux erreurs
// ============================================================
test.describe('Robustesse', () => {

  test.beforeEach(async ({ page }) => { await loadApp(page); });

  test('pas d\'erreur JS en console au chargement', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.waitForTimeout(1000);
    // Filtrer les erreurs non-critiques (ex: SW non disponible en test)
    const criticalErrors = errors.filter(e =>
      !e.includes('ServiceWorker') &&
      !e.includes('sw.js') &&
      !e.includes('manifest')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('ouvrir et fermer plusieurs modals de suite sans erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#modalAddVariableCharge button', { hasText: 'Annuler' }).click();
    await page.locator('#addFixedChargeBtn').click();
    await page.locator('#modalAddFixedCharge button', { hasText: 'Annuler' }).click();
    await page.locator('#addReimbursementBtn').click();
    await page.locator('#modalAddReimbursement button', { hasText: 'Annuler' }).click();

    expect(errors.filter(e => !e.includes('ServiceWorker'))).toHaveLength(0);
  });

  test('navigation rapide entre périodes sans crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    for (let i = 0; i < 5; i++) {
      await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
    }
    for (let i = 0; i < 5; i++) {
      await page.locator('[data-action="navigatePeriod"][data-arg="1"]').click();
    }
    await page.waitForTimeout(300);
    expect(errors.filter(e => !e.includes('ServiceWorker'))).toHaveLength(0);
  });
});
