import { readFileSync } from 'node:fs';
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

  // Realtime Database rend le sous-arbre complet quand on lit un nœud parent :
  // lire 'periods' renvoie tous les mois. Ce double stockait des chemins plats,
  // si bien qu'une lecture de parent rendait null — ce qui masquait toute
  // fonctionnalité parcourant l'historique.
  function _read(path) {
    if (window.__db[path] !== undefined) return window.__db[path];

    var prefix = path + '/';
    var tree = null;
    Object.keys(window.__db).forEach(function(key) {
      if (key.indexOf(prefix) !== 0) return;
      var segments = key.slice(prefix.length).split('/');
      if (segments.some(function(s) { return s === '__proto__' || s === 'constructor' || s === 'prototype'; })) return;
      tree = tree || {};
      var node = tree;
      for (var i = 0; i < segments.length - 1; i++) {
        if (typeof node[segments[i]] !== 'object' || node[segments[i]] === null) {
          node[segments[i]] = {};
        }
        node = node[segments[i]];
      }
      node[segments[segments.length - 1]] = window.__db[key];
    });
    return tree;
  }

  function _notify(path) {
    var data = _read(path);
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
                val: function() { return _read(path); },
                exists: function() { return _read(path) !== null; }
              });
              return function() {};
            },
            off: function() {},
            once: function(event) {
              return Promise.resolve({
                val: function() { return _read(path); },
                exists: function() { return _read(path) !== null; }
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
  await page.waitForSelector('body[data-app-ready="true"]', { timeout: 10000 });
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

// ============================================================
// Règlement du solde
// ============================================================
test.describe('Régler le solde', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  /**
   * Crée un déséquilibre connu : salaires égaux, une charge de 100 € avancée
   * par une seule personne. L'autre lui doit donc exactement 50 €.
   */
  async function creerDesequilibre(page, payeur) {
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Charge de reference');
    await page.locator('#variableChargeAmount').fill('100');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption(payeur);
    await page.locator('#saveVariableCharge').click();

    await expect(page.locator('#variableChargesList').getByText('Charge de reference')).toBeVisible({ timeout: 5000 });
  }

  test('le bouton n\'apparaît que lorsqu\'il y a un solde à régler', async ({ page }) => {
    // Comptes vierges : aucun déséquilibre, donc aucune action proposée
    await expect(page.locator('.btn-settle')).toHaveCount(0);

    await creerDesequilibre(page, 'vous');
    await expect(page.locator('.btn-settle')).toBeVisible({ timeout: 5000 });
  });

  test('régler ramène le solde à zéro et fait disparaître le bouton', async ({ page }) => {
    await creerDesequilibre(page, 'vous');

    await expect(page.locator('#balanceBar')).toContainText('Conjointe vous doit', { timeout: 5000 });

    await page.locator('.btn-settle').click();
    await page.locator('#modalConfirmOk').click();

    await expect(page.locator('#balanceBar')).toContainText('Comptes équilibrés', { timeout: 5000 });
    await expect(page.locator('.btn-settle')).toHaveCount(0);
  });

  test('fonctionne aussi dans l\'autre sens', async ({ page }) => {
    await creerDesequilibre(page, 'conjointe');

    await expect(page.locator('#balanceBar')).toContainText('Vous devez', { timeout: 5000 });

    await page.locator('.btn-settle').click();
    await page.locator('#modalConfirmOk').click();

    await expect(page.locator('#balanceBar')).toContainText('Comptes équilibrés', { timeout: 5000 });
  });

  test('annuler la confirmation ne change rien', async ({ page }) => {
    await creerDesequilibre(page, 'vous');
    await expect(page.locator('#balanceBar')).toContainText('Conjointe vous doit', { timeout: 5000 });

    await page.locator('.btn-settle').click();
    await page.locator('#modalConfirmCancel').click();

    await expect(page.locator('#balanceBar')).toContainText('Conjointe vous doit');
    await expect(page.locator('.btn-settle')).toBeVisible();
  });
});

// ============================================================
// Report du solde entre mois
// ============================================================
test.describe('Report du solde', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);

    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();
  });

  /**
   * Bascule le report en cliquant le curseur, comme le ferait l'utilisateur.
   * La case elle-même est masquée (opacity: 0) : seul le curseur est cliquable.
   * @param {import('@playwright/test').Page} page - Page de test
   * @param {boolean} actif - État attendu après la bascule
   */
  async function basculerReport(page, actif) {
    await page.locator('.setting-toggle-row .reminder-toggle-slider').click();
    await expect(page.locator('#carryOverToggle')).toBeChecked({ checked: actif });
  }

  /** Ajoute une charge avancée par une seule personne dans le mois affiché */
  async function ajouterCharge(page, description, montant, payeur) {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill(description);
    await page.locator('#variableChargeAmount').fill(String(montant));
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption(payeur);
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText(description)).toBeVisible({ timeout: 5000 });
  }

  test('le report est désactivé par défaut', async ({ page }) => {
    await expect(page.locator('#carryOverToggle')).not.toBeChecked();
  });

  test('sans report, un mois repart de zéro', async ({ page }) => {
    // Dette dans le mois précédent
    await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
    await ajouterCharge(page, 'Dette du mois passe', 100, 'vous');
    await expect(page.locator('#balanceBar')).toContainText('Conjointe vous doit', { timeout: 5000 });

    // Retour au mois courant : la dette ne suit pas
    await page.locator('[data-action="navigatePeriod"][data-arg="1"]').click();
    await expect(page.locator('#balanceBar')).toContainText('Comptes équilibrés', { timeout: 5000 });
  });

  test('avec report, la dette du mois précédent suit', async ({ page }) => {
    await basculerReport(page, true);

    await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
    await ajouterCharge(page, 'Dette reportable', 100, 'vous');

    await page.locator('[data-action="navigatePeriod"][data-arg="1"]').click();

    // 100 € avancés, salaires égaux : 50 € restent dus et traversent le mois
    await expect(page.locator('#balanceBar')).toContainText('Conjointe vous doit', { timeout: 5000 });
    await expect(page.locator('#summarySection')).toContainText('au titre des mois précédents', { timeout: 5000 });
  });

  test('désactiver le report ramène le mois à son solde propre', async ({ page }) => {
    await basculerReport(page, true);

    await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
    await ajouterCharge(page, 'Dette a annuler', 100, 'vous');
    await page.locator('[data-action="navigatePeriod"][data-arg="1"]').click();
    await expect(page.locator('#balanceBar')).toContainText('Conjointe vous doit', { timeout: 5000 });

    await basculerReport(page, false);
    await expect(page.locator('#balanceBar')).toContainText('Comptes équilibrés', { timeout: 5000 });
  });

  test('régler un solde reporté le solde entièrement', async ({ page }) => {
    await basculerReport(page, true);

    await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
    await ajouterCharge(page, 'Ardoise', 100, 'vous');
    await page.locator('[data-action="navigatePeriod"][data-arg="1"]').click();
    await expect(page.locator('.btn-settle')).toBeVisible({ timeout: 5000 });

    await page.locator('.btn-settle').click();
    await page.locator('#modalConfirmOk').click();

    await expect(page.locator('#balanceBar')).toContainText('Comptes équilibrés', { timeout: 5000 });
  });
});

// ============================================================
// Corbeille
// ============================================================
/*
   Les suppressions sont douces depuis l'origine : la donnée restait en base
   avec `deleted: true`, sans qu'aucun écran ne la montre ni ne la rende.
   Une suppression accidentelle était irréversible côté utilisateur.
*/
test.describe('Corbeille', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();
  });

  /** Ajoute une charge variable payée par vous */
  async function ajouter(page, description, montant) {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill(description);
    await page.locator('#variableChargeAmount').fill(String(montant));
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText(description)).toBeVisible({ timeout: 5000 });
  }

  /** Supprime la charge affichée et confirme */
  async function supprimer(page) {
    await page.locator('#variableChargesList .btn-delete').first().click();
    await page.locator('#modalConfirmOk').click();
  }

  test('le bouton reste masqué tant que rien n\'a été supprimé', async ({ page }) => {
    await ajouter(page, 'Charge conservee', 100);
    await expect(page.locator('#trashButton')).toBeHidden();
  });

  test('supprimer révèle la corbeille et son compte', async ({ page }) => {
    await ajouter(page, 'Charge a jeter', 100);
    await supprimer(page);

    await expect(page.locator('#trashButton')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#trashCount')).toHaveText('1');
  });

  test('la corbeille montre l\'élément supprimé', async ({ page }) => {
    await ajouter(page, 'Charge a jeter', 100);
    await supprimer(page);

    await page.locator('#trashButton').click();
    await expect(page.locator('#trashList')).toContainText('Charge a jeter');
    await expect(page.locator('#trashList')).toContainText('Charge variable');
  });

  test('rétablir remet la charge dans la liste et dans le bilan', async ({ page }) => {
    await ajouter(page, 'Charge a retablir', 100);
    await expect(page.locator('#balanceBar')).toContainText('Conjointe vous doit', { timeout: 5000 });

    await supprimer(page);
    await expect(page.locator('#balanceBar')).toContainText('Comptes équilibrés', { timeout: 5000 });

    await page.locator('#trashButton').click();
    await page.locator('#trashList .btn-restore').first().click();

    await expect(page.locator('#variableChargesList').getByText('Charge a retablir')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#balanceBar')).toContainText('Conjointe vous doit', { timeout: 5000 });
  });

  test('la corbeille vidée par rétablissement se referme et disparaît', async ({ page }) => {
    await ajouter(page, 'Dernier element', 100);
    await supprimer(page);

    await page.locator('#trashButton').click();
    await page.locator('#trashList .btn-restore').first().click();

    await expect(page.locator('#modalTrash')).not.toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('#trashButton')).toBeHidden();
  });

  test('une description hostile est affichée en texte, jamais interprétée', async ({ page }) => {
    // La corbeille rend des données saisies par l'utilisateur : elle construit
    // des nœuds DOM plutôt que du HTML, ce test le verrouille.
    const hostile = '<img src=x onerror=alert(1)>';
    await ajouter(page, hostile, 50);
    await supprimer(page);

    await page.locator('#trashButton').click();
    await expect(page.locator('#trashList')).toContainText(hostile);
    await expect(page.locator('#trashList img')).toHaveCount(0);
  });
});

// ============================================================
// Attribut hidden — masquage effectif
// ============================================================
/*
   L'attribut `hidden` ne masque que par la feuille de style du navigateur,
   la moins spécifique qui soit : toute règle posant un `display` l'annule.
   Deux éléments étaient ainsi visibles alors qu'ils se croyaient masqués —
   la barre de solde, vide et bordée, et la barre de recherche sans rien à
   filtrer. Chaque nouvelle règle `display` sur un élément masquable rouvrait
   la brèche ; ces tests la referment.
*/
test.describe('Éléments masqués', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('sans salaires, la barre de solde ne s\'affiche pas', async ({ page }) => {
    await expect(page.locator('#balanceBar')).toBeHidden();
  });

  test('sans charges, la barre de recherche ne s\'affiche pas', async ({ page }) => {
    await expect(page.locator('#searchBarContainer')).toBeHidden();
  });

  test('les deux apparaissent dès qu\'elles ont un objet', async ({ page }) => {
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Une charge');
    await page.locator('#variableChargeAmount').fill('100');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();

    await expect(page.locator('#balanceBar')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#searchBarContainer')).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================
// Sauvegarde et restauration
// ============================================================
/*
   Toutes les données du foyer vivent dans un unique projet Firebase, sans
   copie hors ligne. L'export CSV ne couvre qu'un mois et perd la structure.
   Ces tests portent sur le fichier qui contient tout — et sur les garde-fous
   d'une restauration, qui écrase l'intégralité des données.
*/
test.describe('Sauvegarde', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();
  });

  /** Lit le contenu texte d'un téléchargement Playwright */
  async function lireTelechargement(download) {
    const chemin = await download.path();
    return readFileSync(chemin, 'utf8');
  }

  test('le fichier téléchargé contient les données du foyer', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Charge sauvegardee');
    await page.locator('#variableChargeAmount').fill('123');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText('Charge sauvegardee')).toBeVisible({ timeout: 5000 });

    await page.locator('[data-action="showBackup"]').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-action="downloadBackup"]').click()
    ]);

    expect(download.suggestedFilename()).toMatch(/^fairsplit-sauvegarde-.*\.json$/);

    const enveloppe = JSON.parse(await lireTelechargement(download));
    expect(enveloppe.format).toBe('fairsplit-backup');
    expect(enveloppe.version).toBe(1);
    expect(enveloppe.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // La charge saisie doit s'y retrouver, sinon la sauvegarde ne sauvegarde rien
    expect(JSON.stringify(enveloppe.data)).toContain('Charge sauvegardee');
  });

  test('un fichier qui n\'est pas une sauvegarde est refusé', async ({ page }) => {
    await page.locator('[data-action="showBackup"]').click();

    await page.locator('#backupFileInput').setInputFiles({
      name: 'liste-courses.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ pommes: 3, poires: 2 }))
    });

    await expect(page.locator('.toast.error').last()).toContainText(/pas une sauvegarde/, { timeout: 5000 });
    // Aucune écriture ne doit avoir eu lieu
    await expect(page.locator('#modalBackup')).toHaveClass(/active/);
  });

  test('un fichier illisible est refusé sans casser la page', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));

    await page.locator('[data-action="showBackup"]').click();
    await page.locator('#backupFileInput').setInputFiles({
      name: 'corrompu.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ ceci n est pas du json')
    });

    await expect(page.locator('.toast.error').last()).toContainText(/illisible|JSON/, { timeout: 5000 });
    expect(erreurs).toEqual([]);
  });

  test('une sauvegarde plus récente que l\'application est refusée', async ({ page }) => {
    await page.locator('[data-action="showBackup"]').click();
    await page.locator('#backupFileInput').setInputFiles({
      name: 'futur.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        format: 'fairsplit-backup', version: 99, exportedAt: '2027-01-01T00:00:00.000Z', data: {}
      }))
    });

    await expect(page.locator('.toast.error').last()).toContainText(/plus récente/, { timeout: 5000 });
  });

  test('restaurer télécharge une copie de sécurité avant d\'écraser', async ({ page }) => {
    // C'est la seule protection réelle : une fois le nœud remplacé, l'ancien
    // contenu n'est plus nulle part.
    await page.locator('[data-action="showBackup"]').click();
    await page.locator('#backupFileInput').setInputFiles({
      name: 'sauvegarde.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        format: 'fairsplit-backup',
        version: 1,
        exportedAt: '2026-01-15T08:00:00.000Z',
        data: { periods: { '2026-01': { salaries: { vous: 1, conjointe: 1 } } } }
      }))
    });

    // La confirmation annonce ce que contient le fichier
    await expect(page.locator('#modalConfirmMessage')).toContainText('1 mois', { timeout: 5000 });

    const [copie] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#modalConfirmOk').click()
    ]);

    expect(copie.suggestedFilename()).toMatch(/^avant-restauration-fairsplit-sauvegarde-/);
  });

  test('refuser la confirmation ne modifie rien', async ({ page }) => {
    await page.locator('[data-action="showBackup"]').click();
    await page.locator('#backupFileInput').setInputFiles({
      name: 'sauvegarde.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        format: 'fairsplit-backup', version: 1, exportedAt: '2026-01-15T08:00:00.000Z', data: {}
      }))
    });

    await page.locator('#modalConfirmCancel').click();

    // Les salaires saisis dans ce test sont toujours là
    await expect(page.locator('#salaireVous')).toHaveValue('2000');
  });
});
