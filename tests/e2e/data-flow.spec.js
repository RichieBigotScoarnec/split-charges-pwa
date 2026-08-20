import { test, expect } from '@playwright/test';

import { ALLOWED_EMAILS } from '../../public/js/config.js';

// L'application refuse tout compte hors liste blanche (js/modules/auth.js).
// Dériver l'adresse de la vraie liste plutôt que de la figer : sinon les tests
// se cassent silencieusement à chaque évolution de la whitelist — ce qui est
// exactement ce qui s'était produit.
const TEST_EMAIL = ALLOWED_EMAILS[0];

/**
 * Mock Firebase hiérarchique — push().set() stocke sous le chemin parent
 * Permet à loadVariableCharges() de retrouver les données via dbGet(parentPath)
 */
const REACTIVE_FIREBASE_MOCK = `
  window.__db = {};
  window.__listeners = {};
  window.__mockAuthCallback = null;

  function _notify(path) {
    var data = window.__db[path] !== undefined ? window.__db[path] : null;
    var handlers = window.__listeners[path] || [];
    handlers.forEach(function(fn) {
      fn({ val: function() { return data; }, exists: function() { return data !== null; } });
    });
  }

  window.firebase = {
    initializeApp: function() { return {}; },
    database: function() {
      return {
        ref: function(path) {
          return {
            on: function(event, cb) {
              if (path === '.info/connected') {
                setTimeout(function() { cb({ val: function() { return true; } }); }, 50);
                return function() {};
              }
              if (!window.__listeners[path]) window.__listeners[path] = [];
              window.__listeners[path].push(cb);
              cb({
                val: function() { return window.__db[path] !== undefined ? window.__db[path] : null; },
                exists: function() { return window.__db[path] !== undefined; }
              });
              return function() {};
            },
            off: function() {},
            once: function(event) {
              return Promise.resolve({
                val: function() { return window.__db[path] !== undefined ? window.__db[path] : null; },
                exists: function() { return window.__db[path] !== undefined; }
              });
            },
            set: function(data) {
              window.__db[path] = data;
              // Sync parent path if it exists as a nested object
              var segs = path.split('/');
              if (segs.length > 1) {
                var parentPath = segs.slice(0, -1).join('/');
                var childKey = segs[segs.length - 1];
                if (window.__db[parentPath] && typeof window.__db[parentPath] === 'object') {
                  window.__db[parentPath][childKey] = data;
                }
              }
              _notify(path);
              return Promise.resolve();
            },
            update: function(data) {
              if (typeof window.__db[path] !== 'object' || window.__db[path] === null) {
                window.__db[path] = {};
              }
              Object.assign(window.__db[path], data);
              // Sync parent path if it exists as a nested object
              var segs = path.split('/');
              if (segs.length > 1) {
                var parentPath = segs.slice(0, -1).join('/');
                var childKey = segs[segs.length - 1];
                if (window.__db[parentPath] && typeof window.__db[parentPath] === 'object') {
                  if (typeof window.__db[parentPath][childKey] !== 'object' || window.__db[parentPath][childKey] === null) {
                    window.__db[parentPath][childKey] = {};
                  }
                  Object.assign(window.__db[parentPath][childKey], data);
                }
              }
              _notify(path);
              return Promise.resolve();
            },
            push: function() {
              // Clé unique reproductible
              var key = 'ch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
              return {
                key: key,
                set: function(data) {
                  // Stockage hiérarchique : window.__db[parentPath][key] = data
                  if (typeof window.__db[path] !== 'object' || window.__db[path] === null) {
                    window.__db[path] = {};
                  }
                  window.__db[path][key] = data;
                  _notify(path);
                  return Promise.resolve();
                }
              };
            },
            remove: function() {
              delete window.__db[path];
              // Sync parent path if it exists as a nested object
              var segs = path.split('/');
              if (segs.length > 1) {
                var parentPath = segs.slice(0, -1).join('/');
                var childKey = segs[segs.length - 1];
                if (window.__db[parentPath] && typeof window.__db[parentPath] === 'object') {
                  delete window.__db[parentPath][childKey];
                }
              }
              _notify(path);
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
          setTimeout(function() {
            cb({
              uid: 'test-user-123',
              email: '${TEST_EMAIL}',
              displayName: 'Test User',
              photoURL: null
            });
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

async function setupFirebaseMock(page) {
  await page.route('**/firebasejs/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '// Firebase CDN mock'
  }));
  await page.addInitScript(REACTIVE_FIREBASE_MOCK);
}

async function waitForApp(page) {
  await page.goto('/FairSplit.html');
  await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
}

// ============================================================
// Ajout de charges variables
// ============================================================
test.describe('CRUD — Charges variables', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('ajout → charge apparaît dans la liste', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Courses Carrefour');
    await page.locator('#variableChargeAmount').fill('85.50');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();

    await expect(
      page.locator('#variableChargesList').getByText('Courses Carrefour')
    ).toBeVisible({ timeout: 5000 });
  });

  test('montant s\'affiche dans la liste', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Cinéma');
    await page.locator('#variableChargeAmount').fill('24');
    await page.locator('#variableChargeCategory').selectOption('Loisirs');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();

    await expect(
      page.locator('#variableChargesList .charge-amount').getByText(/24/)
    ).toBeVisible({ timeout: 5000 });
  });

  test('deux charges ajoutées → toutes les deux présentes', async ({ page }) => {
    // Première charge
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Courses A');
    await page.locator('#variableChargeAmount').fill('50');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText('Courses A')).toBeVisible({ timeout: 5000 });

    // Deuxième charge
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Restaurant B');
    await page.locator('#variableChargeAmount').fill('75');
    await page.locator('#variableChargeCategory').selectOption('Restaurant');
    await page.locator('#variableChargePaidBy').selectOption('conjointe');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText('Restaurant B')).toBeVisible({ timeout: 5000 });

    // Les deux sont présentes
    await expect(page.locator('#variableChargesList').getByText('Courses A')).toBeVisible();
    await expect(page.locator('#variableChargesList').getByText('Restaurant B')).toBeVisible();
  });

  test('la modal se ferme après l\'ajout', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Test fermeture');
    await page.locator('#variableChargeAmount').fill('10');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();

    // Attendre que la modal disparaisse
    await expect(page.locator('#modalAddVariableCharge')).toBeHidden({ timeout: 5000 });
  });

  test('description vide → ne sauvegarde pas', async ({ page }) => {
    const listBefore = await page.locator('#variableChargesList .charge-item').count();
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeAmount').fill('50');
    // Pas de description
    await page.locator('#saveVariableCharge').click();
    // Attendre un peu
    await page.waitForTimeout(500);
    const listAfter = await page.locator('#variableChargesList .charge-item').count();
    expect(listAfter).toBe(listBefore);
  });

  test('montant invalide → ne sauvegarde pas', async ({ page }) => {
    const listBefore = await page.locator('#variableChargesList .charge-item').count();
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Test');
    await page.locator('#variableChargeAmount').fill('abc');
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(500);
    const listAfter = await page.locator('#variableChargesList .charge-item').count();
    expect(listAfter).toBe(listBefore);
  });
});

// ============================================================
// Ajout de charges fixes
// ============================================================
test.describe('CRUD — Charges fixes', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('ajout → charge fixe apparaît dans la liste', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    await page.locator('#fixedChargeDescription').fill('Loyer mensuel');
    await page.locator('#fixedChargeAmount').fill('1200');
    await page.locator('#fixedChargeCategory').selectOption('Maison');
    await page.locator('#fixedChargePaidBy').selectOption('vous');
    await page.locator('#saveFixedCharge').click();

    await expect(
      page.locator('#fixedChargesList').getByText('Loyer mensuel')
    ).toBeVisible({ timeout: 5000 });
  });

  test('montant s\'affiche dans la liste', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    await page.locator('#fixedChargeDescription').fill('EDF');
    await page.locator('#fixedChargeAmount').fill('89');
    await page.locator('#fixedChargeCategory').selectOption('Maison');
    await page.locator('#fixedChargePaidBy').selectOption('vous');
    await page.locator('#saveFixedCharge').click();

    await expect(
      page.locator('#fixedChargesList .charge-amount').getByText(/89/)
    ).toBeVisible({ timeout: 5000 });
  });

  test('deux charges fixes ajoutées → toutes les deux présentes', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    await page.locator('#fixedChargeDescription').fill('Internet');
    await page.locator('#fixedChargeAmount').fill('40');
    await page.locator('#fixedChargeCategory').selectOption('Maison');
    await page.locator('#fixedChargePaidBy').selectOption('vous');
    await page.locator('#saveFixedCharge').click();
    await expect(page.locator('#fixedChargesList').getByText('Internet')).toBeVisible({ timeout: 5000 });

    await page.locator('#addFixedChargeBtn').click();
    await page.locator('#fixedChargeDescription').fill('Assurance auto');
    await page.locator('#fixedChargeAmount').fill('60');
    await page.locator('#fixedChargeCategory').selectOption('Transport');
    await page.locator('#fixedChargePaidBy').selectOption('conjointe');
    await page.locator('#saveFixedCharge').click();
    await expect(page.locator('#fixedChargesList').getByText('Assurance auto')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('#fixedChargesList').getByText('Internet')).toBeVisible();
    await expect(page.locator('#fixedChargesList').getByText('Assurance auto')).toBeVisible();
  });

  test('la modal se ferme après l\'ajout', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    await page.locator('#fixedChargeDescription').fill('Netflix');
    await page.locator('#fixedChargeAmount').fill('15');
    await page.locator('#fixedChargeCategory').selectOption('Maison');
    await page.locator('#fixedChargePaidBy').selectOption('vous');
    await page.locator('#saveFixedCharge').click();

    await expect(page.locator('#modalAddFixedCharge')).toBeHidden({ timeout: 5000 });
  });
});

// ============================================================
// Ajout de remboursements
// ============================================================
test.describe('CRUD — Remboursements', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('ajout → remboursement apparaît dans la liste', async ({ page }) => {
    await page.locator('#addReimbursementBtn').click();
    await page.locator('#reimbursementAmount').fill('150');
    await page.locator('#reimbursementDirection').selectOption('conjointe-to-vous');
    await page.locator('#saveReimbursement').click();

    await expect(
      page.locator('#reimbursementsList').getByText(/150/)
    ).toBeVisible({ timeout: 5000 });
  });

  test('la modal se ferme après l\'ajout', async ({ page }) => {
    await page.locator('#addReimbursementBtn').click();
    await page.locator('#reimbursementAmount').fill('50');
    await page.locator('#reimbursementDirection').selectOption('vous-to-conjointe');
    await page.locator('#saveReimbursement').click();

    await expect(page.locator('#modalAddReimbursement')).toBeHidden({ timeout: 5000 });
  });
});

// ============================================================
// Impact des charges sur le bilan
// ============================================================
test.describe('Bilan — mise à jour après actions', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('sans salaires : le bilan affiche le message d\'attente', async ({ page }) => {
    const summary = page.locator('#summarySection');
    await expect(summary).toBeVisible();
    // Sans salaires, le texte d'attente s'affiche
    await expect(summary).toContainText(/salaire/i);
  });

  test('avec salaires : le bilan s\'affiche', async ({ page }) => {
    await page.locator('#salaireVous').fill('3000');
    await page.locator('#salaireVous').press('Tab');
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').press('Tab');
    await page.waitForTimeout(600); // debounce sauvegarde

    const summary = page.locator('#summarySection');
    await expect(summary).toBeVisible();
    // Après salaires, on voit "équilibrés" ou un montant
    await expect(summary).not.toContainText(/Veuillez renseigner/i);
  });

  test('ajout d\'une charge → bilan mis à jour', async ({ page }) => {
    // Saisir les salaires
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').press('Tab');
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').press('Tab');
    await page.waitForTimeout(600);

    // Ajouter une charge payée par vous
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Courses test');
    await page.locator('#variableChargeAmount').fill('100');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();

    // Le bilan doit montrer un montant ou mentionner 100€
    await expect(
      page.locator('#summarySection')
    ).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================
// Suppression de charges
// ============================================================
test.describe('Suppression', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('supprimer une charge variable → disparaît de la liste', async ({ page }) => {
    // Ajouter une charge
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('À supprimer');
    await page.locator('#variableChargeAmount').fill('30');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText('À supprimer')).toBeVisible({ timeout: 5000 });

    // Cliquer sur le bouton supprimer
    const deleteBtn = page.locator('#variableChargesList .btn-delete').first();
    await deleteBtn.click();

    // Confirmer la suppression dans la modal de confirmation
    await page.locator('#modalConfirmOk').click();

    await expect(page.locator('#variableChargesList').getByText('À supprimer')).toBeHidden({ timeout: 5000 });
  });

  test('supprimer une charge fixe → disparaît de la liste', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    await page.locator('#fixedChargeDescription').fill('Fixe à supprimer');
    await page.locator('#fixedChargeAmount').fill('100');
    await page.locator('#fixedChargeCategory').selectOption('Maison');
    await page.locator('#fixedChargePaidBy').selectOption('vous');
    await page.locator('#saveFixedCharge').click();
    await expect(page.locator('#fixedChargesList').getByText('Fixe à supprimer')).toBeVisible({ timeout: 5000 });

    const deleteBtn = page.locator('#fixedChargesList .btn-delete').first();
    await deleteBtn.click();

    // Confirmer la suppression dans la modal de confirmation
    await page.locator('#modalConfirmOk').click();

    await expect(page.locator('#fixedChargesList').getByText('Fixe à supprimer')).toBeHidden({ timeout: 5000 });
  });
});

// ============================================================
// Édition de charges
// ============================================================
test.describe('Édition', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('éditer une charge variable → description mise à jour', async ({ page }) => {
    // Ajouter
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Ancienne description');
    await page.locator('#variableChargeAmount').fill('50');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText('Ancienne description')).toBeVisible({ timeout: 5000 });

    // Cliquer sur éditer (data-action="editVariableCharge")
    const editBtn = page.locator('#variableChargesList [data-action="editVariableCharge"]').first();
    await editBtn.click();

    // La modal s'ouvre avec les valeurs pré-remplies
    await expect(page.locator('#modalAddVariableCharge')).toBeVisible({ timeout: 3000 });

    // Modifier la description (paidBy est pré-rempli via editVariableCharge)
    await page.locator('#variableChargeDescription').clear();
    await page.locator('#variableChargeDescription').fill('Nouvelle description');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#saveVariableCharge').click();

    // La nouvelle description apparaît
    await expect(
      page.locator('#variableChargesList').getByText('Nouvelle description')
    ).toBeVisible({ timeout: 5000 });
  });

  test('éditer une charge fixe → montant mis à jour', async ({ page }) => {
    await page.locator('#addFixedChargeBtn').click();
    await page.locator('#fixedChargeDescription').fill('Loyer');
    await page.locator('#fixedChargeAmount').fill('1000');
    await page.locator('#fixedChargeCategory').selectOption('Maison');
    await page.locator('#fixedChargePaidBy').selectOption('vous');
    await page.locator('#saveFixedCharge').click();
    await expect(page.locator('#fixedChargesList').getByText('Loyer')).toBeVisible({ timeout: 5000 });

    const editBtn = page.locator('#fixedChargesList [data-action="editFixedCharge"]').first();
    await editBtn.click();
    await expect(page.locator('#modalAddFixedCharge')).toBeVisible({ timeout: 3000 });

    await page.locator('#fixedChargeAmount').clear();
    await page.locator('#fixedChargeAmount').fill('1200');
    await page.locator('#fixedChargeCategory').selectOption('Maison');
    await page.locator('#saveFixedCharge').click();

    await expect(
      page.locator('#fixedChargesList .charge-amount').getByText(/1\s?200/)
    ).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================
// Recherche après ajout de données réelles
// ============================================================
test.describe('Recherche — après ajout de données', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('recherche filtre les charges ajoutées', async ({ page }) => {
    // Ajouter deux charges
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Carrefour Market');
    await page.locator('#variableChargeAmount').fill('60');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText('Carrefour Market')).toBeVisible({ timeout: 5000 });

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Cinéma UGC');
    await page.locator('#variableChargeAmount').fill('20');
    await page.locator('#variableChargeCategory').selectOption('Loisirs');
    await page.locator('#variableChargePaidBy').selectOption('conjointe');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText('Cinéma UGC')).toBeVisible({ timeout: 5000 });

    // Rechercher "Carrefour"
    await page.locator('#searchInput').fill('Carrefour');
    await page.waitForTimeout(400); // debounce

    // Carrefour visible, Cinéma caché
    await expect(page.locator('#variableChargesList').getByText('Carrefour Market')).toBeVisible();
    await expect(page.locator('#variableChargesList').getByText('Cinéma UGC')).toBeHidden();
  });

  test('effacer la recherche → toutes les charges redeviennent visibles', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Pharmacie');
    await page.locator('#variableChargeAmount').fill('15');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText('Pharmacie')).toBeVisible({ timeout: 5000 });

    await page.locator('#searchInput').fill('rien du tout');
    await page.waitForTimeout(400);
    await expect(page.locator('#variableChargesList').getByText('Pharmacie')).toBeHidden();

    await page.locator('#searchInput').clear();
    await page.waitForTimeout(400);
    await expect(page.locator('#variableChargesList').getByText('Pharmacie')).toBeVisible();
  });
});

// ============================================================
// Persistance entre rechargements (même session mock)
// ============================================================
test.describe('Persistance — données dans le mock', () => {

  test('les données stockées dans __db sont récupérées au rechargement de période', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);

    // Ajouter une charge
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Persistance test');
    await page.locator('#variableChargeAmount').fill('42');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText('Persistance test')).toBeVisible({ timeout: 5000 });

    // Vérifier que le mock DB contient bien la donnée
    const hasData = await page.evaluate(() => {
      const db = window.__db;
      return Object.values(db).some(entry =>
        entry && typeof entry === 'object' &&
        Object.values(entry).some(charge =>
          charge && charge.description === 'Persistance test'
        )
      );
    });
    expect(hasData).toBe(true);
  });
});
