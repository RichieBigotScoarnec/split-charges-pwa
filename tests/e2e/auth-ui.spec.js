import { test, expect } from '@playwright/test';

test.describe('Page de connexion (pré-auth)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/FairSplit.html');
  });

  test('affiche le formulaire de connexion', async ({ page }) => {
    const overlay = page.locator('#authOverlay');
    await expect(overlay).toBeVisible();

    await expect(page.locator('.auth-title')).toHaveText('FairSplit');
    await expect(page.locator('.auth-subtitle')).toHaveText('Partage équitable des charges');
  });

  test('contient le bouton Google Sign-In', async ({ page }) => {
    const googleBtn = page.locator('.btn-google-signin');
    await expect(googleBtn).toBeVisible();
    await expect(googleBtn).toContainText('Connexion avec Google');
  });

  test('contient les champs email et mot de passe', async ({ page }) => {
    const emailInput = page.locator('#authEmail');
    const passwordInput = page.locator('#authPassword');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('contient les boutons connexion email et création compte', async ({ page }) => {
    const buttons = page.locator('.btn-email-signin');
    await expect(buttons).toHaveCount(2);
    await expect(buttons.first()).toContainText('Connexion Email');
    await expect(buttons.last()).toContainText('Créer un compte');
  });

  test('masque l\'application principale', async ({ page }) => {
    const mainApp = page.locator('#mainApp');
    await expect(mainApp).toBeHidden();
  });

  test('le titre contient FairSplit', async ({ page }) => {
    await expect(page).toHaveTitle(/FairSplit/);
  });
});
