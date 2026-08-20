import { test, expect } from '@playwright/test';

import { ALLOWED_EMAILS, DATA_ROOT } from '../../js/config.js';

// L'application refuse tout compte hors liste blanche (js/modules/auth.js).
// Dériver l'adresse de la vraie liste plutôt que de la figer : sinon les tests
// se cassent silencieusement à chaque évolution de la whitelist — ce qui est
// exactement ce qui s'était produit.
const TEST_EMAIL = ALLOWED_EMAILS[0];

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
/**
 * URL de l'application branchée sur les émulateurs
 *
 * L'application expose nativement `?emulator=1` (js/config.js → js/firebase-init.js).
 * L'ancien montage détournait window.firebase.initializeApp depuis un
 * setInterval de 5 ms, en course avec le chargement des scripts `defer` :
 * la bascule arrivait après l'initialisation, l'application parlait au
 * Firebase réel, et l'authentification échouait.
 *
 * Passer par le paramètre supporté rend le branchement déterministe et fait
 * tester le chemin de code que le développeur utilise réellement.
 */
const APP_URL = '/FairSplit.html?emulator=1';

/**
 * Crée un utilisateur de test via l'API REST de l'emulator Auth
 */
async function createTestUser(request) {
  // Créer un compte email/password via l'API REST de l'emulator
  const signUpResponse = await request.post(
    `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      data: {
        email: TEST_EMAIL,
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
    await page.goto(APP_URL);

    // Attendre que l'overlay d'auth soit visible
    await page.waitForSelector('#authOverlay', { state: 'visible', timeout: 10000 });

    // Remplir le formulaire email/password
    const emailInput = page.locator('#authEmail');
    const passwordInput = page.locator('#authPassword');

    // Vérifier que les champs email/password existent
    await expect(emailInput).toBeAttached();
    await expect(passwordInput).toBeAttached();

    // Remplir les champs
    await emailInput.fill(TEST_EMAIL);
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

    await page.goto(APP_URL);

    // Se connecter
    await page.locator('#authEmail').fill(TEST_EMAIL);
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
    await createTestUser(request);

    await page.goto(APP_URL);

    // Se connecter
    await page.locator('#authEmail').fill(TEST_EMAIL);
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
    await createTestUser(request);

    await page.goto(APP_URL);

    // Se connecter
    await page.locator('#authEmail').fill(TEST_EMAIL);
    await page.locator('#authPassword').fill('TestPassword123!');
    await page.locator('.btn-email-signin:not(.btn-create-account)').click();

    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });

    // Basculer en mode 50-50
    await page.locator('#mode5050').click();
    await page.waitForTimeout(500);

    // Vérifier dans la DB
    const dbResponse = await request.get(
      `${EMULATOR_DB_URL}/${DATA_ROOT}/shareMode.json?ns=fairsplit-test-default-rtdb`
    );
    const shareMode = await dbResponse.json();

    // Le mode de partage doit être sauvegardé
    expect(shareMode).not.toBeNull();
  });

  test('déconnexion et reconnexion', async ({ page, request }) => {
    await createTestUser(request);

    await page.goto(APP_URL);

    // Se connecter
    await page.locator('#authEmail').fill(TEST_EMAIL);
    await page.locator('#authPassword').fill('TestPassword123!');
    await page.locator('.btn-email-signin:not(.btn-create-account)').click();

    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });

    // Se déconnecter
    await page.evaluate(() => window.signOut());
    await page.waitForSelector('#authOverlay', { state: 'visible', timeout: 5000 });

    // Se reconnecter
    await page.locator('#authEmail').fill(TEST_EMAIL);
    await page.locator('#authPassword').fill('TestPassword123!');
    await page.locator('.btn-email-signin:not(.btn-create-account)').click();

    // L'app doit réapparaître
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });
    await expect(page.locator('#mainApp')).toBeVisible();
  });
});
