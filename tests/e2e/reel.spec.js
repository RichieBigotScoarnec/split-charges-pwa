import { test, expect } from '@playwright/test';

/**
 * Validation contre le vrai Firebase, avec le compte de test cantonné au bac
 * à sable.
 *
 * Le simulateur des autres suites a déjà montré deux infidélités — lectures de
 * nœud parent rendant `null`, écritures multi-chemins ignorées — qui masquaient
 * des fonctionnalités entières. Ces tests-ci ne simulent rien : ils exercent
 * l'authentification réelle, les règles de sécurité réelles et la persistance
 * réelle.
 *
 * Le mot de passe vient de l'environnement, jamais du dépôt. Il n'est ni
 * journalisé, ni inclus dans un message d'échec. Les traces Playwright sont
 * désactivées dans la configuration : elles enregistreraient l'argument de
 * `fill`.
 *
 * Sans le secret, la suite est ignorée — la CI ne l'a pas et ne doit pas
 * l'avoir.
 */

const EMAIL = process.env.FAIRSPLIT_TEST_EMAIL || 'testfairsplit@gmail.com';
const MOT_DE_PASSE = process.env.FAIRSPLIT_TEST_PASSWORD;

test.describe('Contre le vrai Firebase', () => {
  test.skip(!MOT_DE_PASSE, 'FAIRSPLIT_TEST_PASSWORD absent — voir docs/compte-de-test.md');

  // Une connexion réelle et l'initialisation complète prennent plus de temps
  // qu'un simulateur en mémoire.
  test.setTimeout(60000);

  /**
   * Ouvre l'application et s'authentifie réellement.
   * @param {import('@playwright/test').Page} page - Page de test
   */
  async function seConnecter(page) {
    await page.goto('/FairSplit.html');
    await page.locator('#authEmail').fill(EMAIL);
    await page.locator('#authPassword').fill(MOT_DE_PASSE);
    await page.locator('[data-action="signInWithEmail"]').click();

    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 30000 });
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 30000 });
  }

  test('le compte se connecte et l\'application s\'initialise entièrement', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));

    await seConnecter(page);

    // Le sélecteur de mois est le premier signe que l'initialisation a abouti.
    await expect(page.locator('#periodSelect option')).toHaveCount(12);
    expect(erreurs).toEqual([]);
  });

  test('l\'écran signale le bac à sable', async ({ page }) => {
    // Sans ce repère, rien ne distinguerait un essai des vraies données.
    await seConnecter(page);

    await expect(page.locator('#sandboxBanner')).toBeVisible();
    await expect(page).toHaveTitle(/Bac à sable/);
  });

  test('toutes les étapes d\'initialisation aboutissent', async ({ page }) => {
    // Un échec partiel produit une notification nommant l'étape fautive : elle
    // ne doit pas apparaître.
    await seConnecter(page);

    await expect(page.locator('.toast.error')).toHaveCount(0);
  });

  test('les règles de sécurité refusent household à ce compte', async ({ page }) => {
    // La garantie qui compte. Le cantonnement applicatif évite d'y toucher ;
    // ce test vérifie que même une tentative directe est refusée par le
    // serveur.
    await seConnecter(page);

    const verdict = await page.evaluate(() => new Promise(resolve => {
      const minuteur = setTimeout(() => resolve('SANS RÉPONSE'), 15000);
      firebase.database().ref('household').once('value')
        .then(() => { clearTimeout(minuteur); resolve('LECTURE AUTORISÉE'); })
        .catch(e => { clearTimeout(minuteur); resolve(e.code || e.message); });
    }));

    expect(verdict).toMatch(/PERMISSION_DENIED/i);
  });

  test('une écriture dans le bac à sable persiste après rechargement', async ({ page }) => {
    await seConnecter(page);

    const repere = `essai-${await page.evaluate(() => performance.now().toFixed(0))}`;

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill(repere);
    await page.locator('#variableChargeAmount').fill('12.34');
    await page.locator('#variableChargeCategory').selectOption({ index: 1 });
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText(repere)).toBeVisible({ timeout: 15000 });

    await page.reload();
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 30000 });

    // La persistance réelle : ce que le simulateur, remis à zéro à chaque
    // chargement, ne peut pas démontrer.
    await expect(page.locator('#variableChargesList').getByText(repere)).toBeVisible({ timeout: 15000 });

    // Nettoyage : la charge d'essai ne doit pas s'accumuler dans le bac à sable.
    await page.locator('#variableChargesList').getByText(repere)
      .locator('xpath=ancestor::*[contains(@class,"charge-item")][1]')
      .locator('.btn-delete').click();
    await page.locator('#modalConfirmOk').click();
    await expect(page.locator('#variableChargesList').getByText(repere)).toHaveCount(0, { timeout: 15000 });
  });
});
