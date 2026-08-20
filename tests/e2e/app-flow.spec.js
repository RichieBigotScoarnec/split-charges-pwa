import { test, expect } from '@playwright/test';

import { ALLOWED_EMAILS } from '../../public/js/config.js';

// L'application refuse tout compte hors liste blanche (js/modules/auth.js).
// Dériver l'adresse de la vraie liste plutôt que de la figer : sinon les tests
// se cassent silencieusement à chaque évolution de la whitelist — ce qui est
// exactement ce qui s'était produit.
const TEST_EMAIL = ALLOWED_EMAILS[0];

/**
 * Mock Firebase pour les tests E2E post-auth
 * Intercepte les scripts Firebase CDN et injecte des mocks
 */

// Listeners enregistrés par l'app
let authStateCallback = null;
let dbData = {};

const FIREBASE_MOCK_SCRIPT = `
  // Mock Firebase global
  window.__mockAuthCallback = null;
  window.__mockDbData = {};

  window.firebase = {
    initializeApp: function() { return {}; },
    database: function() {
      return {
        ref: function(path) {
          return {
            on: function(event, cb) {
              // Pour .info/connected, simuler connecté
              if (path === '.info/connected') {
                setTimeout(() => cb({ val: () => true }), 50);
              }
            },
            off: function() {},
            once: function(event) {
              return Promise.resolve({
                val: function() { return window.__mockDbData[path] || null; },
                exists: function() { return !!window.__mockDbData[path]; }
              });
            },
            set: function(data) {
              window.__mockDbData[path] = data;
              return Promise.resolve();
            },
            update: function(data) {
              window.__mockDbData[path] = Object.assign(window.__mockDbData[path] || {}, data);
              return Promise.resolve();
            },
            push: function() {
              var key = 'mock_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
              var childPath = path + '/' + key;
              return {
                key: key,
                set: function(data) {
                  window.__mockDbData[childPath] = data;
                  return Promise.resolve();
                }
              };
            },
            remove: function() {
              delete window.__mockDbData[path];
              return Promise.resolve();
            },
            orderByChild: function() { return this; },
            equalTo: function() { return this; }
          };
        }
      };
    },
    auth: function() {
      return {
        onAuthStateChanged: function(cb) {
          window.__mockAuthCallback = cb;
          // Simuler un utilisateur connecté après un court délai
          setTimeout(function() {
            cb({
              uid: 'test-user-123',
              email: '${TEST_EMAIL}',
              displayName: 'Test User',
              photoURL: null
            });
          }, 100);
          return function() {}; // unsubscribe
        },
        signInWithPopup: function() { return Promise.resolve(); },
        signInWithEmailAndPassword: function() { return Promise.resolve(); },
        createUserWithEmailAndPassword: function() { return Promise.resolve(); },
        signOut: function() {
          if (window.__mockAuthCallback) {
            window.__mockAuthCallback(null);
          }
          return Promise.resolve();
        },
        currentUser: {
          uid: 'test-user-123',
          email: '${TEST_EMAIL}'
        }
      };
    }
  };

  window.firebase.auth.GoogleAuthProvider = function() {};
`;

/**
 * Setup : intercepter les scripts Firebase CDN et injecter le mock
 */
async function setupFirebaseMock(page) {
  // Intercepter les 3 scripts Firebase CDN
  await page.route('**/firebasejs/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '// Firebase CDN mock - replaced by test'
    });
  });

  // Injecter le mock Firebase AVANT le chargement de la page
  await page.addInitScript(FIREBASE_MOCK_SCRIPT);
}

// ============================================================
// Tests post-authentification
// ============================================================

test.describe('Application post-auth', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await page.goto('/FairSplit.html');
    // Attendre que l'auth mock se déclenche et que mainApp soit visible
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
  });

  test('affiche l\'application principale après auth', async ({ page }) => {
    const mainApp = page.locator('#mainApp');
    await expect(mainApp).toBeVisible();

    const authOverlay = page.locator('#authOverlay');
    await expect(authOverlay).toBeHidden();
  });

  test('affiche la barre utilisateur avec le nom', async ({ page }) => {
    const userInfoBar = page.locator('#userInfoBar');
    await expect(userInfoBar).toBeVisible();

    const userName = page.locator('#userName');
    await expect(userName).toHaveText('Test User');
  });

  test('affiche les sections principales', async ({ page }) => {
    // Salaires
    const salaireVous = page.locator('#salaireVous');
    await expect(salaireVous).toBeVisible();

    const salaireConjointe = page.locator('#salaireConjointe');
    await expect(salaireConjointe).toBeVisible();

    // Boutons de mode de partage
    await expect(page.locator('#modeProrata')).toBeVisible();
    await expect(page.locator('#mode5050')).toBeVisible();
    await expect(page.locator('#modeCustom')).toBeVisible();
  });
});

test.describe('Saisie des salaires', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await page.goto('/FairSplit.html');
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
  });

  test('accepte les salaires numériques', async ({ page }) => {
    const salaireVous = page.locator('#salaireVous');
    await salaireVous.fill('3000');
    await expect(salaireVous).toHaveValue('3000');

    const salaireConjointe = page.locator('#salaireConjointe');
    await salaireConjointe.fill('2000');
    await expect(salaireConjointe).toHaveValue('2000');
  });
});

test.describe('Modes de partage', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await page.goto('/FairSplit.html');
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
  });

  test('le mode prorata est sélectionné par défaut', async ({ page }) => {
    const modeProrata = page.locator('#modeProrata');
    await expect(modeProrata).toHaveClass(/selected/);
  });

  test('basculer en mode 50-50', async ({ page }) => {
    const mode5050 = page.locator('#mode5050');
    await mode5050.click();
    await expect(mode5050).toHaveClass(/selected/);
  });

  test('basculer en mode custom affiche les pourcentages', async ({ page }) => {
    const modeCustom = page.locator('#modeCustom');
    await modeCustom.click();

    const customPercentages = page.locator('#customPercentages');
    await expect(customPercentages).toBeVisible();
  });
});

test.describe('Modal charge variable', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await page.goto('/FairSplit.html');
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
  });

  test('ouvrir et fermer la modal', async ({ page }) => {
    // Ouvrir la modal
    await page.locator('#addVariableChargeBtn').click();
    const modal = page.locator('#modalAddVariableCharge');
    await expect(modal).toBeVisible();

    // Fermer avec le bouton Annuler
    await modal.locator('button', { hasText: 'Annuler' }).click();
    await expect(modal).toBeHidden();
  });

  test('remplir le formulaire de charge variable', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();

    // Remplir les champs
    await page.locator('#variableChargeDescription').fill('Courses Carrefour');
    await page.locator('#variableChargeAmount').fill('85.50');

    // Vérifier les valeurs
    await expect(page.locator('#variableChargeDescription')).toHaveValue('Courses Carrefour');
    await expect(page.locator('#variableChargeAmount')).toHaveValue('85.50');
  });

  test('le toggle split spécial est présent', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();

    const splitToggle = page.locator('#variableChargeSplitToggle');
    await expect(splitToggle).toBeAttached();
  });

  test('activer le split spécial affiche les options', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();

    // Cocher le checkbox et déclencher l'événement change programmatiquement
    await page.evaluate(() => {
      const cb = document.getElementById('variableChargeSplitToggle');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Les options de split devraient apparaître
    const splitOptions = page.locator('#variableChargeSplitOptions');
    await expect(splitOptions).toBeVisible();
  });
});

test.describe('Modal charge fixe', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await page.goto('/FairSplit.html');
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
  });

  test('ouvrir la modal charge fixe', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    const modal = page.locator('#modalAddFixedCharge');
    await expect(modal).toBeVisible();
  });

  test('remplir le formulaire de charge fixe', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();

    await page.locator('#fixedChargeDescription').fill('Loyer');
    await page.locator('#fixedChargeAmount').fill('1200');

    await expect(page.locator('#fixedChargeDescription')).toHaveValue('Loyer');
    await expect(page.locator('#fixedChargeAmount')).toHaveValue('1200');
  });

  test('le champ destination de virement existe', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();

    const destination = page.locator('#fixedChargeDestination');
    await expect(destination).toBeAttached();
  });
});

test.describe('Modal remboursement', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await page.goto('/FairSplit.html');
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
  });

  test('ouvrir la modal remboursement', async ({ page }) => {
    await page.locator('#addReimbursementBtn').click();
    const modal = page.locator('#modalAddReimbursement');
    await expect(modal).toBeVisible();
  });

  test('remplir le formulaire de remboursement', async ({ page }) => {
    await page.locator('#addReimbursementBtn').click();

    await page.locator('#reimbursementAmount').fill('150');

    await expect(page.locator('#reimbursementAmount')).toHaveValue('150');
  });

  test('sélectionner la direction du remboursement', async ({ page }) => {
    await page.locator('#addReimbursementBtn').click();

    const direction = page.locator('#reimbursementDirection');
    await expect(direction).toBeAttached();
  });
});

test.describe('Recherche', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await page.goto('/FairSplit.html');
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
  });

  test('la recherche est masquée sans charge à filtrer', async ({ page }) => {
    await expect(page.locator('#searchBarContainer')).toBeHidden();
  });

  test('le champ de recherche est fonctionnel', async ({ page }) => {
    // La barre de recherche n'est rendue visible qu'en présence de charges
    // à filtrer — règle éprouvée par le test « masquée sans charge » ci-dessous.
    // On lève ici la contrainte pour éprouver la mécanique du champ lui-même.
    await page.locator('#searchBarContainer').evaluate(el => { el.hidden = false; });
    const searchInput = page.locator('#searchInput');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('Loyer');
    await expect(searchInput).toHaveValue('Loyer');
  });

  test('le bouton clear recherche existe', async ({ page }) => {
    const clearBtn = page.locator('#searchClearBtn');
    await expect(clearBtn).toBeAttached();
  });
});

test.describe('Déconnexion', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await page.goto('/FairSplit.html');
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
  });

  test('la déconnexion masque l\'app et affiche l\'auth', async ({ page }) => {
    // Déclencher signOut via le mock
    await page.evaluate(() => {
      window.signOut();
    });

    // L'overlay d'auth devrait réapparaître
    const authOverlay = page.locator('#authOverlay');
    await expect(authOverlay).toBeVisible({ timeout: 5000 });

    const mainApp = page.locator('#mainApp');
    await expect(mainApp).toBeHidden();
  });
});
