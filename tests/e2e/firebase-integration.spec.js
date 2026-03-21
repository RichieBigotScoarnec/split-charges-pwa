import { test, expect } from '@playwright/test';

/**
 * Tests d'intégration Firebase avec Emulators
 *
 * Prérequis : Firebase emulators démarrés (auth:9099, database:9000)
 * Lancer : npx firebase emulators:exec "npx playwright test tests/e2e/firebase-integration.spec.js"
 *
 * Ces tests utilisent les vrais SDK Firebase contre les emulators locaux
 * (pas de mock — données réelles en mémoire)
 */

const EMULATOR_AUTH_URL = 'http://127.0.0.1:9099';
const EMULATOR_DB_URL = 'http://127.0.0.1:9000';

/**
 * Configure la page pour utiliser les emulators Firebase
 * Intercepte l'initialisation Firebase pour rediriger vers les emulators
 */
async function setupEmulatorConnection(page) {
  // Injecter le code de connexion aux emulators AVANT le chargement de la page
  await page.addInitScript(`
    window.__FIREBASE_EMULATOR_MODE = true;
    window.__emulatorsConnected = false;

    // Intercepter la création du script Firebase SDK pour ajouter la connexion emulator
    const origCreateElement = document.createElement.bind(document);

    // Observer quand firebase est chargé et patché
    let patchAttempts = 0;
    const patchFirebase = setInterval(() => {
      patchAttempts++;
      if (patchAttempts > 500) { clearInterval(patchFirebase); return; }

      if (typeof window.firebase !== 'undefined' && window.firebase.initializeApp && !window.__emulatorsConnected) {
        const originalInit = window.firebase.initializeApp;
        window.firebase.initializeApp = function(config) {
          const app = originalInit.call(window.firebase, config);

          if (!window.__emulatorsConnected) {
            window.__emulatorsConnected = true;
            try {
              window.firebase.auth().useEmulator('${EMULATOR_AUTH_URL}');
              console.log('[TEST] Auth emulator connecté');
            } catch(e) { console.warn('[TEST] Auth emulator:', e.message); }

            try {
              window.firebase.database().useEmulator('127.0.0.1', 9000);
              console.log('[TEST] Database emulator connecté');
            } catch(e) { console.warn('[TEST] Database emulator:', e.message); }
          }

          return app;
        };
        clearInterval(patchFirebase);
        console.log('[TEST] Firebase patché pour emulators');
      }
    }, 5);
  `);
}

/**
 * Crée un utilisateur de test via l'API REST de l'emulator Auth
 */
async function createTestUser(request) {
  // Créer un compte email/password via l'API REST de l'emulator
  const signUpResponse = await request.post(
    `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      data: {
        email: 'test-integration@fairsplit.dev',
        password: 'TestPassword123!',
        displayName: 'Integration Test User',
        returnSecureToken: true
      }
    }
  );
  return signUpResponse.json();
}

/**
 * Nettoie les données de l'emulator Auth
 */
async function clearEmulatorAuth(request) {
  try {
    await request.delete(
      `${EMULATOR_AUTH_URL}/emulator/v1/projects/fairsplit-test/accounts`,
      { failOnStatusCode: false }
    );
  } catch (e) {
    // Ignorer si pas encore de données
  }
}

/**
 * Nettoie les données de l'emulator Database
 */
async function clearEmulatorDatabase(request) {
  try {
    await request.delete(
      `${EMULATOR_DB_URL}/.json?ns=fairsplit-test-default-rtdb`,
      { failOnStatusCode: false }
    );
  } catch (e) {
    // Ignorer si pas encore de données
  }
}

// ============================================================
// Tests d'intégration
// ============================================================

test.describe('Firebase Emulator Integration', () => {

  test.beforeAll(async ({ request }) => {
    // Vérifier que les emulators sont démarrés
    try {
      const authCheck = await request.get(EMULATOR_AUTH_URL, { failOnStatusCode: false });
      if (!authCheck.ok()) {
        test.skip(true, 'Firebase Auth emulator not running on port 9099');
      }
    } catch (e) {
      test.skip(true, 'Firebase emulators not running. Start with: npx firebase emulators:start');
    }
  });

  test.beforeEach(async ({ request }) => {
    // Nettoyer les emulators avant chaque test
    await clearEmulatorAuth(request);
    await clearEmulatorDatabase(request);
  });

  test('les emulators répondent', async ({ request }) => {
    const authResponse = await request.get(EMULATOR_AUTH_URL);
    expect(authResponse.ok()).toBeTruthy();

    const dbResponse = await request.get(`${EMULATOR_DB_URL}/.json`);
    expect(dbResponse.ok()).toBeTruthy();
  });

  test('création de compte et connexion email/password', async ({ page, request }) => {
    await setupEmulatorConnection(page);
    await page.goto('/FairSplit.html');

    // Attendre que l'overlay d'auth soit visible
    await page.waitForSelector('#authOverlay', { state: 'visible', timeout: 10000 });

    // Remplir le formulaire email/password
    const emailInput = page.locator('#authEmail');
    const passwordInput = page.locator('#authPassword');

    // Vérifier que les champs email/password existent
    await expect(emailInput).toBeAttached();
    await expect(passwordInput).toBeAttached();

    // Remplir les champs
    await emailInput.fill('test@fairsplit.dev');
    await passwordInput.fill('TestPassword123!');

    // Cliquer sur le bouton de création de compte
    const signupBtn = page.locator('.btn-create-account');
    await expect(signupBtn).toBeAttached();
    await signupBtn.click();

    // Attendre que l'app principale soit visible (auth réussie)
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });

    // L'overlay d'auth doit être masqué
    const authOverlay = page.locator('#authOverlay');
    await expect(authOverlay).toBeHidden();
  });

  test('persistance des salaires dans la database', async ({ page, request }) => {
    // Créer un utilisateur via l'API REST
    await createTestUser(request);

    await setupEmulatorConnection(page);
    await page.goto('/FairSplit.html');

    // Se connecter
    await page.locator('#authEmail').fill('test-integration@fairsplit.dev');
    await page.locator('#authPassword').fill('TestPassword123!');
    await page.locator('.btn-email-signin:not(.btn-create-account)').click();

    // Attendre l'app
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });

    // Saisir les salaires et déclencher change event
    await page.locator('#salaireVous').fill('3500');
    await page.locator('#salaireVous').dispatchEvent('change');
    await page.locator('#salaireConjointe').fill('2800');
    await page.locator('#salaireConjointe').dispatchEvent('change');

    // Attendre que la sauvegarde se fasse
    await page.waitForTimeout(1500);

    // Recharger la page pour vérifier la persistance
    await page.reload();
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(1500);

    // Vérifier que les salaires sont restaurés depuis la database
    const vousValue = await page.locator('#salaireVous').inputValue();
    const conjointeValue = await page.locator('#salaireConjointe').inputValue();

    expect(vousValue).toBe('3500');
    expect(conjointeValue).toBe('2800');
  });

  test('les données survivent à un rechargement de page', async ({ page, request }) => {
    // Créer un utilisateur
    const userData = await createTestUser(request);

    await setupEmulatorConnection(page);
    await page.goto('/FairSplit.html');

    // Se connecter
    await page.locator('#authEmail').fill('test-integration@fairsplit.dev');
    await page.locator('#authPassword').fill('TestPassword123!');
    await page.locator('.btn-email-signin:not(.btn-create-account)').click();

    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });

    // Saisir des salaires
    await page.locator('#salaireVous').fill('4000');
    await page.locator('#salaireVous').dispatchEvent('change');
    await page.locator('#salaireConjointe').fill('3000');
    await page.locator('#salaireConjointe').dispatchEvent('change');
    await page.waitForTimeout(1500);

    // Recharger la page
    await page.reload();
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });

    // Les salaires devraient être rechargés depuis la database
    await page.waitForTimeout(1500);

    const vousValue = await page.locator('#salaireVous').inputValue();
    const conjointeValue = await page.locator('#salaireConjointe').inputValue();

    // Les valeurs doivent être restaurées
    expect(vousValue).toBe('4000');
    expect(conjointeValue).toBe('3000');
  });

  test('changement de mode de partage persisté', async ({ page, request }) => {
    const userData = await createTestUser(request);
    const uid = userData.localId;

    await setupEmulatorConnection(page);
    await page.goto('/FairSplit.html');

    // Se connecter
    await page.locator('#authEmail').fill('test-integration@fairsplit.dev');
    await page.locator('#authPassword').fill('TestPassword123!');
    await page.locator('.btn-email-signin:not(.btn-create-account)').click();

    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });

    // Basculer en mode 50-50
    await page.locator('#mode5050').click();
    await page.waitForTimeout(500);

    // Vérifier dans la DB
    const dbResponse = await request.get(
      `${EMULATOR_DB_URL}/shareMode/${uid}.json?ns=fairsplit-test-default-rtdb`
    );
    const shareMode = await dbResponse.json();

    // Le mode de partage doit être sauvegardé
    expect(shareMode).not.toBeNull();
  });

  test('déconnexion et reconnexion', async ({ page, request }) => {
    await createTestUser(request);

    await setupEmulatorConnection(page);
    await page.goto('/FairSplit.html');

    // Se connecter
    await page.locator('#authEmail').fill('test-integration@fairsplit.dev');
    await page.locator('#authPassword').fill('TestPassword123!');
    await page.locator('.btn-email-signin:not(.btn-create-account)').click();

    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });

    // Se déconnecter
    await page.evaluate(() => window.signOut());
    await page.waitForSelector('#authOverlay', { state: 'visible', timeout: 5000 });

    // Se reconnecter
    await page.locator('#authEmail').fill('test-integration@fairsplit.dev');
    await page.locator('#authPassword').fill('TestPassword123!');
    await page.locator('.btn-email-signin:not(.btn-create-account)').click();

    // L'app doit réapparaître
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });
    await expect(page.locator('#mainApp')).toBeVisible();
  });
});
