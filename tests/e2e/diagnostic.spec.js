import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Journal de diagnostic, de bout en bout.
 *
 * Deux pannes de production sur téléphone — salaires non enregistrés, bouton
 * « + Ajouter » inerte — n'ont jamais pu être reproduites : ni sur navigateur
 * de bureau, ni sur appareil émulé, ni contre le bac à sable. Ce qui manquait
 * n'était pas une hypothèse de plus, mais ce que l'appareil avait vécu.
 *
 * Ces tests vérifient que le journal remplit ce rôle : qu'il nomme l'étape qui
 * échoue, qu'il reste invisible tant qu'on ne le demande pas, et qu'il ne
 * transporte rien de personnel.
 */
test.describe('Journal de diagnostic', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
  });

  test("reste totalement invisible pendant un usage normal", async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('#diagPanel')).toHaveCount(0);
  });

  test('nomme les étapes réussies et se consulte par ?diag=1', async ({ page }) => {
    await waitForApp(page);

    const journal = await page.evaluate(() => window.__diag());
    expect(journal).toContain('étape réussie : sélecteur de période');
    expect(journal).toContain('étape réussie : charges variables');
    expect(journal).toContain('agent :');
  });

  test("nomme l'étape en échec, avec son motif", async ({ page }) => {
    // Une étape est mise en échec volontairement, comme le ferait une donnée
    // inexploitable en base.
    await page.addInitScript(() => {
      window.__casserCategories = true;
    });
    await page.route('**/js/modules/custom-lists.js', async (route) => {
      const reponse = await route.fetch();
      const source = await reponse.text();
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/javascript' },
        body: source.replace(
          'export function populateCategorySelect(selectId, options = {}) {',
          'export function populateCategorySelect(selectId, options = {}) {\n'
          + '  if (window.__casserCategories) throw new TypeError("categories.forEach is not a function");'
        )
      });
    });

    await waitForApp(page);
    await page.waitForTimeout(1500);

    const journal = await page.evaluate(() => window.__diag());
    expect(journal, journal.slice(0, 400)).toContain('étape ÉCHOUÉE');
    expect(journal).toContain('categories.forEach is not a function');
  });

  test("le bouton d'ajout reste utilisable malgré l'étape en échec", async ({ page }) => {
    // C'est la panne signalée : un bouton visible sur lequel il ne se passe
    // rien. L'écouteur est désormais posé avant le remplissage, donc il
    // survit.
    await page.addInitScript(() => {
      window.__casserCategories = true;
    });
    await page.route('**/js/modules/custom-lists.js', async (route) => {
      const reponse = await route.fetch();
      const source = await reponse.text();
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/javascript' },
        body: source.replace(
          'export function populateCategorySelect(selectId, options = {}) {',
          'export function populateCategorySelect(selectId, options = {}) {\n'
          + '  if (window.__casserCategories) throw new TypeError("categories.forEach is not a function");'
        )
      });
    });

    await waitForApp(page);
    await page.locator('#addVariableChargeBtn').click();
    await expect(page.locator('#modalAddVariableCharge')).toHaveClass(/active/, { timeout: 5000 });
  });

  test('les salaires restent enregistrables malgré une étape en échec', async ({ page }) => {
    // Même panne, autre symptôme : les écouteurs des champs de revenus étaient
    // posés après le remplissage du sélecteur de mois.
    await page.route('**/js/modules/period.js', async (route) => {
      const reponse = await route.fetch();
      const source = await reponse.text();
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/javascript' },
        body: source.replace(
          'function populatePeriodDropdown() {',
          'function populatePeriodDropdown() {\n'
          + '  throw new TypeError("periods.map is not a function");'
        )
      });
    });

    await waitForApp(page);
    await page.locator('#salaireVous').fill('2500');
    await page.locator('#salaireVous').blur();
    await page.waitForTimeout(1500);

    const enregistre = await page.evaluate(() => {
      const cle = Object.keys(window.__db).find(k => k.endsWith('/salaries') && !k.includes('periods'));
      return window.__db[cle]?.vous ?? null;
    });
    expect(enregistre, 'le salaire n\'a pas été enregistré').toBe(2500);
  });

  test('le panneau s\'affiche avec ?diag=1 et propose de copier', async ({ page }) => {
    await waitForApp(page, { query: '?diag=1' });
    await expect(page.locator('#diagPanel')).toBeVisible({ timeout: 15000 });
    // Le rapport vit dans la valeur du champ, pas dans son contenu textuel.
    await expect(page.locator('#diagText')).toHaveValue(/DIAGNOSTIC FAIRSPLIT/);
    await expect(page.locator('#diagText')).toHaveValue(/étape réussie : bilan/);
    await expect(page.getByRole('button', { name: 'Copier' })).toBeVisible();
  });

  test('le journal ne transporte aucune donnée personnelle', async ({ page }) => {
    await waitForApp(page);

    // Un parcours qui manipule des données nommées et chiffrées.
    await page.locator('#prenomVous').fill('Richard');
    await page.locator('#prenomVous').blur();
    await page.locator('#salaireVous').fill('2600');
    await page.locator('#salaireVous').blur();

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Pharmacie du centre');
    await page.locator('#variableChargeAmount').fill('47.30');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(1500);

    const journal = await page.evaluate(() => window.__diag());
    for (const interdit of ['Richard', 'Pharmacie', '47.30', '2600', 'testfairsplit']) {
      expect(journal, `le journal contient « ${interdit} »`).not.toContain(interdit);
    }
  });
});
