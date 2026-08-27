import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Chercher au-delà du mois affiché
 *
 * La recherche filtrait les lignes déjà rendues : structurellement incapable de
 * trouver quoi que ce soit ailleurs, puisque les autres mois ne sont pas dans
 * la page. « Quand a-t-on acheté la machine à laver ? » restait sans réponse
 * alors que la donnée est là.
 *
 * La mise à plat de l'historique est verrouillée par
 * `tests/utils/recherche-historique.test.js`. Ce qui est vérifié ici, c'est le
 * geste complet : cocher, trouver, et pouvoir s'y rendre.
 */

/** Le mois courant, et un mois décalé de N */
async function moisDecale(page, decalage) {
  return page.evaluate((n) => {
    const p = document.getElementById('periodSelect').value;
    const [an, mois] = p.split('-').map(Number);
    const total = (an * 12 + (mois - 1)) + n;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  }, decalage);
}

/** Sème le mois courant et deux mois passés */
async function semerLHistorique(page) {
  const courant = await page.locator('#periodSelect').inputValue();
  const passe = await moisDecale(page, -2);
  const vieux = await moisDecale(page, -9);

  await page.evaluate(async ({ courant, passe, vieux }) => {
    const { dbUpdate } = await import('/js/db.js');
    await dbUpdate(undefined, {
      [`periods/${courant}/variableCharges/a`]: {
        description: 'Courses Leclerc', amount: 84.3, category: 'Courses',
        paidBy: 'vous', date: `${courant}-12`, deleted: false },
      [`periods/${passe}/variableCharges/b`]: {
        description: 'Machine à laver', amount: 499, category: 'Maison',
        paidBy: 'conjointe', date: `${passe}-08`, deleted: false },
      [`periods/${passe}/variableCharges/c`]: {
        description: 'Livraison machine', amount: 45, category: 'Maison',
        paidBy: 'vous', date: `${passe}-09`, deleted: false },
      [`periods/${vieux}/variableCharges/d`]: {
        description: 'Machine à café', amount: 129, category: 'Maison',
        paidBy: 'vous', date: `${vieux}-03`, deleted: false },
      [`periods/${vieux}/variableCharges/e`]: {
        description: 'Vieille machine, jetée', amount: 20, category: 'Maison',
        paidBy: 'vous', date: `${vieux}-04`, deleted: true }
    });
    await window.changePeriod(courant);
  }, { courant, passe, vieux });

  await page.waitForTimeout(1200);
  return { courant, passe, vieux };
}

/** Tape une requête et laisse passer la temporisation */
async function chercher(page, texte) {
  await page.locator('#searchInput').fill(texte);
  await page.waitForTimeout(900);
}

test.describe('La recherche sur tout l\'historique', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await allerAuPanneau(page, 'panneauCharges');
    await semerLHistorique(page);
  });

  test('la case est proposée, et décochée', async ({ page }) => {
    // Le mois courant reste le cas ordinaire : une lecture de tout
    // l'historique ne doit pas se déclencher sans qu'on l'ait demandée.
    await expect(page.locator('#searchTousMois')).toBeVisible();
    expect(await page.locator('#searchTousMois').isChecked()).toBe(false);
  });

  test('sans la case, un mois passé reste introuvable', async ({ page }) => {
    // Le comportement d'avant, conservé tel quel.
    await chercher(page, 'machine');
    await expect(page.locator('#searchHistorique')).toBeHidden();
    await expect(page.locator('#searchResultsInfo')).toContainText('Aucun résultat');
  });

  test('avec la case, on trouve dans les mois passés', async ({ page }) => {
    await page.locator('#searchTousMois').check();
    await chercher(page, 'machine');

    const panneau = page.locator('#searchHistorique');
    await expect(panneau).toBeVisible();
    await expect(panneau).toContainText('Machine à laver');
    await expect(panneau).toContainText('Livraison machine');
    await expect(panneau).toContainText('Machine à café');
  });

  test('les résultats sont groupés par mois, et le mois est nommé', async ({ page }) => {
    // Un résultat isolé ne dit pas grand-chose ; la question posée est presque
    // toujours « c'était quand ? ».
    await page.locator('#searchTousMois').check();
    await chercher(page, 'machine');

    await expect(page.locator('.search-mois')).toHaveCount(2);
    const premier = await page.locator('.search-mois-nom').first().innerText();
    expect(premier, 'le mois n\'est pas nommé en toutes lettres').toMatch(/\d{4}/);
  });

  test('l\'annonce situe la réponse : « dans N mois »', async ({ page }) => {
    await page.locator('#searchTousMois').check();
    await chercher(page, 'machine');
    await expect(page.locator('#searchResultsInfo')).toContainText('3 résultats dans 2 mois');
  });

  test('ce qui est à la corbeille ne remonte pas', async ({ page }) => {
    // La corbeille montre les suppressions, pas la recherche.
    await page.locator('#searchTousMois').check();
    await chercher(page, 'machine');
    await expect(page.locator('#searchHistorique')).not.toContainText('jetée');
  });

  test('l\'en-tête d\'un mois y emmène', async ({ page }) => {
    // Trouver « Machine à laver, juin 2026 » sans pouvoir s'y rendre laisserait
    // le travail à moitié fait.
    const { passe } = await semerLHistorique(page);
    await page.locator('#searchTousMois').check();
    await chercher(page, 'laver');

    await page.locator('.search-mois-entete').first().click();
    await page.waitForTimeout(1200);
    expect(await page.locator('#periodSelect').inputValue()).toBe(passe);
  });

  test('décocher rend la recherche au mois affiché', async ({ page }) => {
    await page.locator('#searchTousMois').check();
    await chercher(page, 'machine');
    await expect(page.locator('#searchHistorique')).toBeVisible();

    await page.locator('#searchTousMois').uncheck();
    await page.waitForTimeout(900);
    await expect(page.locator('#searchHistorique')).toBeHidden();
  });

  test('effacer la recherche referme le panneau', async ({ page }) => {
    await page.locator('#searchTousMois').check();
    await chercher(page, 'machine');
    await page.locator('#searchClearBtn').click();
    await page.waitForTimeout(500);

    await expect(page.locator('#searchHistorique')).toBeHidden();
    expect(await page.locator('#searchInput').inputValue()).toBe('');
  });

  test('en portée historique, les listes du mois restent entières', async ({ page }) => {
    // Elles ne sont plus le support de la réponse : les masquer donnerait un
    // écran vide à côté d'un panneau plein.
    await page.locator('#searchTousMois').check();
    await chercher(page, 'machine');

    // « Courses Leclerc » ne correspond pas à la requête, et doit rester visible.
    await expect(page.locator('#variableChargesList')).toContainText('Courses Leclerc');
  });
});
