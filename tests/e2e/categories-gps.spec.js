import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Les catégories que le GPS sait reconnaître
 *
 * `utils/categorie-lieu.js` reconnaît 81 types de lieux OpenStreetMap, chacun
 * visant des catégories nommément. Douze visaient « Café », « Bar » ou
 * « Boulangerie » — trois catégories qu'aucun foyer ne possédait : un café
 * était rangé en « Restaurant », une boulangerie en « Courses ». Le repli
 * fonctionnait, la précision se perdait.
 *
 * Elles figurent désormais dans les défauts. Mais un foyer qui a modifié sa
 * liste une seule fois ne les verrait jamais : la liste enregistrée l'emporte
 * sur les défauts, pour toujours. D'où la proposition explicite éprouvée ici.
 */
test.describe('Compléter les catégories pour le GPS', () => {

  /** Ouvre la gestion des catégories */
  async function ouvrirLaGestion(page) {
    await page.evaluate(() => window.showManageCategoriesModal());
    await expect(page.locator('#modalManageLists')).toBeVisible();
  }

  test('rien n\'est proposé quand la liste est complète', async ({ page }) => {
    // Un foyer neuf part des défauts, qui les contiennent toutes.
    await setupFirebaseMock(page);
    await waitForApp(page);

    await ouvrirLaGestion(page);

    await expect(page.locator('.manage-proposition')).toHaveCount(0);
    await expect(page.locator('#manageListItems')).toContainText('Boulangerie');
  });

  test('un foyer installé se voit proposer ce qui lui manque', async ({ page }) => {
    await setupFirebaseMock(page);
    await page.addInitScript(() => {
      // Une liste enregistrée, telle qu'un foyer l'a modifiée avant que ces
      // catégories n'existent.
      window.__db = {
        'household/customCategories': [
          { id: 'courses', icon: '🛒', label: 'Courses' },
          { id: 'maison', icon: '🏠', label: 'Maison' },
          { id: 'restaurant', icon: '🍕', label: 'Restaurant' },
          { id: 'essence', icon: '🚗', label: 'Essence' },
          { id: 'sante', icon: '💊', label: 'Santé' },
          { id: 'loisirs', icon: '🎮', label: 'Loisirs' },
          { id: 'transport', icon: '🚌', label: 'Transport' },
          { id: 'autre', icon: '⚡', label: 'Autre' }
        ]
      };
    });
    await waitForApp(page);

    await ouvrirLaGestion(page);

    const proposition = page.locator('.manage-proposition');
    await expect(proposition).toBeVisible();
    await expect(proposition).toContainText('Café');
    await expect(proposition).toContainText('Bar');
    await expect(proposition).toContainText('Boulangerie');
  });

  test('les ajouter les inscrit dans la liste, et la proposition disparaît', async ({ page }) => {
    await setupFirebaseMock(page);
    await page.addInitScript(() => {
      window.__db = {
        'household/customCategories': [
          { id: 'courses', icon: '🛒', label: 'Courses' },
          { id: 'restaurant', icon: '🍕', label: 'Restaurant' },
          { id: 'autre', icon: '⚡', label: 'Autre' }
        ]
      };
    });
    await waitForApp(page);
    await ouvrirLaGestion(page);

    await page.locator('#manageAjouterGps').click();

    await expect(page.locator('#manageListItems')).toContainText('Boulangerie');
    await expect(page.locator('.manage-proposition')).toHaveCount(0);

    // Écrites en base, donc retrouvées au prochain chargement.
    const enregistrees = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      return (await dbGet('customCategories')).map(c => c.id);
    });
    expect(enregistrees).toContain('boulangerie');
    expect(enregistrees).toContain('cafe');
    expect(enregistrees).toContain('bar');
    // Ce que le foyer avait n'est pas perdu.
    expect(enregistrees).toContain('courses');
  });

  test('la saisie rapide propose alors la bonne catégorie', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);

    const choisie = await page.evaluate(async () => {
      const { categoriePourLieu } = await import('/js/utils/categorie-lieu.js');
      const { getCategories } = await import('/js/modules/custom-lists.js');
      return {
        cafe: categoriePourLieu({ type: 'cafe', nom: 'Colombus' }, getCategories())?.id,
        boulangerie: categoriePourLieu({ type: 'bakery', nom: 'Brioche Dorée' }, getCategories())?.id,
        pub: categoriePourLieu({ type: 'pub', nom: 'Le Zinc' }, getCategories())?.id
      };
    });

    expect(choisie).toEqual({ cafe: 'cafe', boulangerie: 'boulangerie', pub: 'bar' });
  });
});
