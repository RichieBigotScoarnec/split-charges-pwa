import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Le premier contact : ce qu'une application vide dit d'elle-même
 *
 * Un état vide est le SEUL moment où l'application a l'attention entière de
 * quelqu'un qui ne sait rien. Elle en faisait deux mauvais usages :
 *
 *   - le bilan proposait « 📈 Tendances sur 6 mois » au-dessus de zéro
 *     donnée — un outil d'analyse sur rien, qui enseigne que la moitié des
 *     boutons ne font rien ;
 *   - l'onglet Charges montrait trois sections identiques à 0,00 €
 *     — « Variables », « Fixes », « Remboursements » — sans un mot sur ce qui
 *     les distingue, alors que cette distinction structure la reconduction, le
 *     coût annuel et le prévisionnel. On la découvrait par essais.
 */

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Une application encore vide', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('ne propose pas d\'analyser ce qui n\'existe pas', async ({ page }) => {
    await allerAuPanneau(page, 'panneauBilan');
    await expect(page.locator('#trendsSection')).toBeHidden();
  });

  test('garde en revanche ce qui CRÉE quelque chose', async ({ page }) => {
    // Ouvrir une cagnotte avant d'avoir saisi une dépense est un ordre
    // parfaitement légitime : ces deux-là ne se masquent pas.
    await allerAuPanneau(page, 'panneauBilan');
    await expect(page.locator('[data-action="showManageEnvelopesModal"]')).toBeVisible();
    await expect(page.locator('[data-action="showPrivateExpensesModal"]')).toBeVisible();
  });

  test('explique ce que chaque section attend', async ({ page }) => {
    await allerAuPanneau(page, 'panneauCharges');

    await expect(page.locator('#variableChargesList')).toContainText('courses');
    await expect(page.locator('#fixedChargesList')).toContainText('loyer');
    await expect(page.locator('#fixedChargesList'), 'la reconduction est ce qui les distingue')
      .toContainText('automatiquement');
    await expect(page.locator('#reimbursementsList'))
      .toContainText('Ce ne sont pas des dépenses');
  });

  test('les explications disparaissent dès qu\'il y a des charges', async ({ page }) => {
    // Sinon elles deviendraient un décor permanent, et le premier écran des
    // charges y perdrait ce que l'état vide y avait gagné.
    await page.evaluate(async () => {
      const { dbUpdate } = await import('/js/db.js');
      const now = new Date();
      const p = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await dbUpdate(undefined, {
        [`periods/${p}/variableCharges/v0`]: {
          description: 'Intermarché', amount: 94.15, category: 'Courses',
          paidBy: 'vous', date: `${p}-02`, deleted: false }
      });
      await window.changePeriod(p);
    });
    await page.waitForTimeout(2000);
    await allerAuPanneau(page, 'panneauCharges');

    await expect(page.locator('#variableChargesList')).not.toContainText('Les dépenses du quotidien');
    await expect(page.locator('#variableChargesList')).toContainText('Intermarché');
    // Et les tendances reparaissent, puisqu'il y a désormais de quoi analyser.
    await allerAuPanneau(page, 'panneauBilan');
    await expect(page.locator('#trendsSection')).toBeVisible();
  });
});

test.describe('Le vocabulaire de l\'interface', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await allerAuPanneau(page, 'panneauReglages');
  });

  test('les prénoms se demandent en français, pas en noms de cases', async ({ page }) => {
    // « Prénom (emplacement 1) » : « emplacement » est le nom de la CASE dans
    // laquelle vit la personne. L'utilisateur, lui, remplit son prénom.
    const reglages = page.locator('#panneauReglages');
    await expect(reglages).not.toContainText('emplacement');
    await expect(page.locator('label[for="prenomVous"]')).toHaveText('Votre prénom');
    await expect(page.locator('label[for="prenomConjointe"]'))
      .toHaveText('Le prénom de votre partenaire');
  });

  test('aucun libellé anglais parmi les modes de partage', async ({ page }) => {
    await expect(page.locator('#modeCustom')).toContainText('Personnalisé');
    await expect(page.locator('#modeCustom')).not.toContainText('Custom');
  });
});
