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

  test('contient le bouton de connexion email', async ({ page }) => {
    const connexion = page.locator('.btn-email-signin:not(.btn-create-account)');
    await expect(connexion).toBeVisible();
    await expect(connexion).toContainText('Connexion Email');
  });

  test('la création de compte est conservée mais masquée', async ({ page }) => {
    // Le fournisseur e-mail étant actif, un bouton exposé publiquement
    // permettrait à quiconque atteint l'URL de créer un compte dans le projet.
    // Le parcours reste dans le code — lever SIGNUP_ENABLED le rétablit.
    const creation = page.locator('#createAccountBtn');
    await expect(creation).toBeAttached();
    await expect(creation).toBeHidden();
  });

  test('appeler createAccount directement ne crée rien', async ({ page }) => {
    // Masquer le bouton ne suffit pas : la fonction reste jointe depuis la
    // console du navigateur. La garde appartient au code, pas au balisage.
    await page.locator('#authEmail').fill('intrus@example.com');
    await page.locator('#authPassword').fill('motdepasse123');
    await page.evaluate(() => window.createAccount && window.createAccount());

    await expect(page.locator('#authError')).toContainText(/pas ouverte/);
  });

  test('masque l\'application principale', async ({ page }) => {
    const mainApp = page.locator('#mainApp');
    await expect(mainApp).toBeHidden();
  });

  test('le titre contient FairSplit', async ({ page }) => {
    await expect(page).toHaveTitle(/FairSplit/);
  });
});

// ============================================================
// Écran d'attente
// ============================================================
import { setupFirebaseMock } from './_harness.js';

test.describe('L\'écran d\'attente évite le clignotement de connexion', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
  });

  test('au chargement, la carte ne montre que le logo et le nom', async ({ page }) => {
    // Le simulateur répond au bout de 100 ms, comme le ferait un vrai SDK à
    // relire une session : c'est cette fenêtre qui montrait le formulaire.
    await page.goto('/FairSplit.html', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#authOverlay')).toHaveClass(/auth-overlay--attente/);
    await expect(page.locator('.auth-title')).toHaveText('FairSplit');
    await expect(page.locator('.btn-google-signin')).toBeHidden();
  });

  test('le formulaire n\'apparaît jamais quand la session est déjà ouverte', async ({ page }) => {
    // Le cas signalé : en tirant vers le bas pour actualiser, l'écran de
    // connexion apparaissait une seconde avant de céder la place à
    // l'application. On surveille tout l'intervalle, pas un instant choisi.
    await page.addInitScript(() => {
      window.__connexionVue = false;
      const guetter = () => {
        const bouton = document.querySelector('.btn-google-signin');
        if (bouton && bouton.offsetParent !== null) window.__connexionVue = true;
        if (!document.getElementById('mainApp')?.hidden) return;
        requestAnimationFrame(guetter);
      };
      document.addEventListener('DOMContentLoaded', guetter);
    });

    await page.goto('/FairSplit.html');
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });

    expect(await page.evaluate(() => window.__connexionVue)).toBe(false);
  });

  test('déconnecté, le formulaire est bien proposé', async ({ page }) => {
    // L'attente ne doit pas devenir une impasse : dès que Firebase annonce
    // qu'il n'y a personne, les commandes reviennent.
    await page.goto('/FairSplit.html');
    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });

    await page.evaluate(() => window.__mockAuthCallback(null));

    await expect(page.locator('.btn-google-signin')).toBeVisible();
    await expect(page.locator('#authEmail')).toBeVisible();
    await expect(page.locator('#mainApp')).toBeHidden();
  });
});
