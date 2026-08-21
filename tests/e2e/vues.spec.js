import { test, expect } from '@playwright/test';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Deux fonctionnalités annoncées dans le README ne pouvaient pas être
 * atteintes :
 *
 *   — les tendances sur six mois visaient #trendsCanvas, #trendsStats et
 *     #generateTrendsBtn, dont aucun n'existait dans le HTML ;
 *   — la carte n'avait qu'un seul déclencheur, à l'intérieur d'un panneau
 *     maintenu en display:none. Leaflet était pourtant téléchargé à chaque
 *     ouverture de l'application, soit 158 Ko pour rien.
 */

test.describe('Tendances sur 6 mois', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();
  });

  /** Ajoute une charge variable dans le mois affiché */
  async function charge(page, description, montant) {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill(description);
    await page.locator('#variableChargeAmount').fill(String(montant));
    await page.locator('#variableChargeCategory').selectOption({ index: 1 });
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText(description)).toBeVisible({ timeout: 5000 });
  }

  test('la section existe et se déplie', async ({ page }) => {
    await expect(page.locator('#trendsSection')).toBeVisible();
    await expect(page.locator('#trendsContent')).toBeHidden();

    await page.locator('#trendsToggle').click();

    await expect(page.locator('#trendsContent')).toBeVisible();
    await expect(page.locator('#trendsToggle')).toHaveAttribute('aria-expanded', 'true');
  });

  test('le graphique et les statistiques sont produits au dépliage', async ({ page }) => {
    await charge(page, 'Depense du mois', 300);

    await page.locator('#trendsToggle').click();

    await expect(page.locator('#trendsCanvas')).toBeVisible();
    // Le bloc de statistiques est rempli par le module : vide, la section
    // n'affichait rien — c'était précisément le défaut.
    await expect(page.locator('#trendsStats')).not.toBeEmpty({ timeout: 5000 });
    await expect(page.locator('#trendsStats')).toContainText('Moyenne');
  });

  test('le canevas est réellement dessiné, pas seulement présent', async ({ page }) => {
    await charge(page, 'Depense', 250);
    await page.locator('#trendsToggle').click();
    await expect(page.locator('#trendsStats')).not.toBeEmpty({ timeout: 5000 });

    // Un canevas vierge est entièrement transparent : au moins un pixel opaque
    // prouve qu'un tracé a eu lieu.
    const dessine = await page.evaluate(() => {
      const canvas = document.getElementById('trendsCanvas');
      const pixels = canvas.getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] !== 0) return true;
      }
      return false;
    });

    expect(dessine).toBe(true);
  });

  test('se referme sans perdre son contenu', async ({ page }) => {
    await charge(page, 'Depense', 100);
    await page.locator('#trendsToggle').click();
    await expect(page.locator('#trendsStats')).not.toBeEmpty({ timeout: 5000 });

    await page.locator('#trendsToggle').click();
    await expect(page.locator('#trendsContent')).toBeHidden();

    await page.locator('#trendsToggle').click();
    await expect(page.locator('#trendsStats')).not.toBeEmpty();
  });
});

test.describe('Carte des dépenses', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('Leaflet n\'est pas chargé à l\'ouverture de l\'application', async ({ page }) => {
    // 158 Ko étaient téléchargés sur chaque ouverture pour une carte que
    // personne ne pouvait ouvrir.
    const charge = await page.evaluate(() => typeof window.L !== 'undefined');
    expect(charge).toBe(false);

    const balises = await page.evaluate(
      () => document.querySelectorAll('[src*="leaflet"], [href*="leaflet"]').length
    );
    expect(balises).toBe(0);
  });

  test('le bouton reste masqué sans dépense localisée', async ({ page }) => {
    await expect(page.locator('#mapButton')).toBeHidden();
  });

  test('le bouton apparaît dès qu\'une dépense porte des coordonnées', async ({ page }) => {
    // La géolocalisation ne peut pas être obtenue dans un navigateur sans
    // interaction : on écrit la charge localisée directement en base, comme le
    // ferait la saisie rapide.
    await page.evaluate(() => {
      const periode = document.getElementById('periodSelect').value;
      window.__db[`household/periods/${periode}/variableCharges`] = {
        loc1: {
          description: 'Courses', amount: 42, paidBy: 'vous', deleted: false,
          category: 'Courses', timestamp: 1,
          location: { lat: 48.8566, lng: 2.3522, name: 'Paris' }
        }
      };
    });

    // Recharger la période rejoue les chargeurs
    await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
    await page.locator('[data-action="navigatePeriod"][data-arg="1"]').click();

    await expect(page.locator('#mapButton')).toBeVisible({ timeout: 5000 });
  });

  test('aucune modale de carte en double dans le document', async ({ page }) => {
    // Le HTML portait une modale statique avec son propre #mapContainer, alors
    // que le module en construit une : getElementById aurait rendu l'élément
    // invisible, et la carte se serait dessinée là où personne ne la voit.
    const conteneurs = await page.evaluate(
      () => document.querySelectorAll('#mapContainer').length
    );
    expect(conteneurs).toBeLessThanOrEqual(1);
  });
});
