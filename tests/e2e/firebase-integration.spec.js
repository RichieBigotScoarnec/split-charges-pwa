import { test, expect } from './_couverture.js';

import { ALLOWED_EMAILS, DATA_ROOT } from '../../public/js/config.js';

// L'application refuse tout compte hors liste blanche (js/modules/auth.js).
// Dériver l'adresse de la vraie liste plutôt que de la figer : sinon les tests
// se cassent silencieusement à chaque évolution de la whitelist — ce qui est
// exactement ce qui s'était produit.
const TEST_EMAIL = ALLOWED_EMAILS[0];

/**
 * Tests d'intégration Firebase avec Emulators
 *
 * Prérequis : Firebase emulators démarrés (auth:9099, database:9010)
 * Lancer : npx firebase emulators:exec "npx playwright test tests/e2e/firebase-integration.spec.js"
 *
 * Ces tests utilisent les vrais SDK Firebase contre les emulators locaux
 * (pas de mock — données réelles en mémoire)
 */

const EMULATOR_AUTH_URL = 'http://127.0.0.1:9099';
const EMULATOR_DB_URL = 'http://127.0.0.1:9010';

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
 *
 * L'adresse est marquée vérifiée : les règles exigent `email_verified` sur
 * l'espace du foyer, l'API d'inscription restant joignable avec la clé
 * publique du projet. Un compte créé et laissé en l'état — ce que produit
 * `accounts:signUp` — n'y accède pas, et c'est le but. Ce test-ci reproduit
 * l'état d'un compte Google, les deux seuls qui entrent dans le foyer ;
 * `regles-donnees.spec.js` éprouve le refus symétrique.
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
  const compte = await signUpResponse.json();

  // La revendication ne vaut que pour les jetons émis ensuite : celui que
  // renvoie l'inscription porte encore email_verified: false. L'application se
  // connecte après cet appel, elle obtiendra donc un jeton à jour.
  await request.post(
    `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`,
    { ...ADMIN, data: { localId: compte.localId, emailVerified: true } }
  );

  return compte;
}

/**
 * En-têtes d'administration de l'émulateur
 *
 * L'émulateur RTDB applique database.rules.json aux appels REST comme au
 * client. Les règles refusant tout à la racine, un DELETE sur `/.json`
 * échouait — silencieusement, `failOnStatusCode: false` masquant le 401.
 * Résultat : l'état d'un test fuyait dans le suivant, qui lisait la valeur
 * du précédent.
 *
 * Le jeton littéral `owner` est le contournement d'administration prévu par
 * l'émulateur. Il n'a aucune valeur hors émulateur.
 */
const ADMIN = { headers: { Authorization: 'Bearer owner' } };

/**
 * Nettoie les données de l'emulator Auth
 */
async function clearEmulatorAuth(request) {
  const res = await request.delete(
    `${EMULATOR_AUTH_URL}/emulator/v1/projects/fairsplit-foyer/accounts`,
    { failOnStatusCode: false }
  );
  if (!res.ok()) {
    throw new Error(`Nettoyage Auth échoué (${res.status()}) — les tests ne seraient plus isolés`);
  }
}

/**
 * Nettoie les données de l'emulator Database
 *
 * Volontairement bloquant en cas d'échec : un nettoyage muet rend les tests
 * dépendants de leur ordre d'exécution, ce qui est pire qu'un échec franc.
 */
async function clearEmulatorDatabase(request) {
  const res = await request.delete(
    `${EMULATOR_DB_URL}/.json?ns=fairsplit-foyer-default-rtdb`,
    { ...ADMIN, failOnStatusCode: false }
  );
  if (!res.ok()) {
    throw new Error(`Nettoyage Database échoué (${res.status()}) — les tests ne seraient plus isolés`);
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

    const dbResponse = await request.get(`${EMULATOR_DB_URL}/.json?ns=fairsplit-foyer-default-rtdb`, ADMIN);
    expect(dbResponse.ok()).toBeTruthy();
  });

  test("connexion email/password contre l'émulateur Auth", async ({ page, request }) => {
    // Ce test créait le compte en cliquant « Créer un compte ». L'inscription
    // libre est désormais fermée (SIGNUP_ENABLED) : le compte se crée par
    // l'API de l'émulateur, comme dans les autres tests du fichier, et
    // l'interface n'exerce plus que la connexion — ce qu'elle offre.
    await createTestUser(request);

    await page.goto(APP_URL);
    await page.waitForSelector('#authOverlay', { state: 'visible', timeout: 10000 });

    await page.locator('#authEmail').fill(TEST_EMAIL);
    await page.locator('#authPassword').fill('TestPassword123!');
    await page.locator('.btn-email-signin:not(.btn-create-account)').click();

    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });
    // #mainApp apparaît dès l'authentification ; attendre l'initialisation
    // effective des modules avant toute interaction.
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 15000 });

    await expect(page.locator('#authOverlay')).toBeHidden();
  });

  test("l'inscription reste fermée face à un vrai service Auth", async ({ page }) => {
    // La garde de createAccount doit tenir devant un service qui accepterait
    // réellement la création — l'émulateur, ici.
    await page.goto(APP_URL);
    await page.waitForSelector('#authOverlay', { state: 'visible', timeout: 10000 });

    await page.locator('#authEmail').fill('intrus@example.com');
    await page.locator('#authPassword').fill('MotDePasse123!');
    await page.evaluate(() => window.createAccount && window.createAccount());

    await expect(page.locator('#authError')).toContainText(/pas ouverte/);
    await expect(page.locator('#mainApp')).toBeHidden();
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
    // #mainApp apparaît dès l'authentification ; attendre l'initialisation
    // effective des modules avant toute interaction.
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 15000 });

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
    // #mainApp apparaît dès l'authentification ; attendre l'initialisation
    // effective des modules avant toute interaction.
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 15000 });
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
    // #mainApp apparaît dès l'authentification ; attendre l'initialisation
    // effective des modules avant toute interaction.
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 15000 });

    // Saisir des salaires
    await page.locator('#salaireVous').fill('4000');
    await page.locator('#salaireVous').dispatchEvent('change');
    await page.locator('#salaireConjointe').fill('3000');
    await page.locator('#salaireConjointe').dispatchEvent('change');
    await page.waitForTimeout(1500);

    // Recharger la page
    await page.reload();
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });
    // #mainApp apparaît dès l'authentification ; attendre l'initialisation
    // effective des modules avant toute interaction.
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 15000 });

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
    // #mainApp apparaît dès l'authentification ; attendre l'initialisation
    // effective des modules avant toute interaction.
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 15000 });

    // Basculer en mode 50-50
    await page.locator('#mode5050').click();
    await page.waitForTimeout(500);

    // Vérifier dans la DB
    const dbResponse = await request.get(
      `${EMULATOR_DB_URL}/${DATA_ROOT}/shareMode.json?ns=fairsplit-foyer-default-rtdb`,
      ADMIN
    );
    const shareMode = await dbResponse.json();

    // Assertion réelle sur la valeur : sans le bypass admin, la lecture était
    // refusée par les règles et renvoyait un objet d'erreur — non nul, donc
    // « not.toBeNull() » passait quoi qu'il arrive.
    expect(shareMode).not.toBeNull();
    expect(shareMode.mode).toBe('50-50');
  });

  test('déconnexion et reconnexion', async ({ page, request }) => {
    await createTestUser(request);

    await page.goto(APP_URL);

    // Se connecter
    await page.locator('#authEmail').fill(TEST_EMAIL);
    await page.locator('#authPassword').fill('TestPassword123!');
    await page.locator('.btn-email-signin:not(.btn-create-account)').click();

    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });
    // #mainApp apparaît dès l'authentification ; attendre l'initialisation
    // effective des modules avant toute interaction.
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 15000 });

    // Se déconnecter
    await page.evaluate(() => window.signOut());
    await page.waitForSelector('#authOverlay', { state: 'visible', timeout: 5000 });

    // Se reconnecter
    await page.locator('#authEmail').fill(TEST_EMAIL);
    await page.locator('#authPassword').fill('TestPassword123!');
    await page.locator('.btn-email-signin:not(.btn-create-account)').click();

    // L'app doit réapparaître
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 15000 });
    // #mainApp apparaît dès l'authentification ; attendre l'initialisation
    // effective des modules avant toute interaction.
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 15000 });
    await expect(page.locator('#mainApp')).toBeVisible();
  });
});
