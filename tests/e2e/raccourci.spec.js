import { test, expect } from '@playwright/test';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Le raccourci d'appui long
 *
 * Le manifeste déclare `?action=quick-add`. Un appui long sur l'icône propose
 * « ⚡ Saisie rapide » ; la même URL, posée sur l'écran d'accueil, s'ouvre d'un
 * seul appui. Deux gestes économisés à chaque dépense.
 *
 * Ce qui se vérifie ici et nulle part ailleurs : que l'ouverture atteint la
 * modale, et que le paramètre ne reste pas dans la barre d'adresse — sinon un
 * rafraîchissement rouvrirait la saisie sans qu'on l'ait demandé.
 */
test.describe('Raccourci de saisie rapide', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
  });

  test('?action=quick-add ouvre la modale', async ({ page }) => {
    await waitForApp(page, { query: '?action=quick-add' });

    await expect(page.locator('#modalQuickAdd')).toBeVisible();
    await expect(page.locator('#quickAddAmount')).toBeFocused();
  });

  test('le paramètre est retiré de la barre d\'adresse', async ({ page }) => {
    await waitForApp(page, { query: '?action=quick-add' });
    await expect(page.locator('#modalQuickAdd')).toBeVisible();

    expect(page.url()).not.toContain('action=');
    expect(page.url()).toContain('FairSplit.html');
  });

  test('les autres paramètres survivent au nettoyage', async ({ page }) => {
    await waitForApp(page, { query: '?sandbox=1&action=quick-add' });
    await expect(page.locator('#modalQuickAdd')).toBeVisible();

    expect(page.url()).not.toContain('action=');
    expect(page.url()).toContain('sandbox=1');
  });

  test('sans le paramètre, rien ne s\'ouvre', async ({ page }) => {
    await waitForApp(page);

    await expect(page.locator('#modalQuickAdd')).toBeHidden();
  });

  test('une action inconnue est ignorée', async ({ page }) => {
    await waitForApp(page, { query: '?action=inexistante' });

    await expect(page.locator('#modalQuickAdd')).toBeHidden();
    // Rien n'a été honoré : le paramètre reste, il n'appartient pas à l'app.
    expect(page.url()).toContain('action=inexistante');
  });
});
