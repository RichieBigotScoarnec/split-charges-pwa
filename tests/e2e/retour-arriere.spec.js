import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Le geste « retour » referme, il ne quitte pas
 *
 * Mesuré avant correction : après trois changements d'onglet,
 * `history.length` valait toujours 2, `location.hash` était vide, et un
 * `goBack()` sortait de l'application — page blanche.
 *
 * Sur Android le retour est le geste le plus utilisé du système : bouton,
 * balayage depuis le bord, barre de navigation. Dans une PWA installée, on
 * l'emploie pour refermer une boîte de dialogue. Ici il fermait tout, sans
 * avertissement, potentiellement en pleine saisie.
 */

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Le retour referme ce qui est ouvert', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('il ferme une modale au lieu de quitter', async ({ page }) => {
    await allerAuPanneau(page, 'panneauCharges');
    await page.locator('#addVariableChargeBtn').click();
    await expect(page.locator('#modalAddVariableCharge')).toHaveClass(/active/);

    await page.goBack();
    await page.waitForTimeout(400);

    await expect(page.locator('#modalAddVariableCharge')).not.toHaveClass(/active/);
    // Et l'application est toujours là — c'est tout le sujet.
    await expect(page.locator('#mainApp')).toBeVisible();
  });

  test('il ramène au premier onglet', async ({ page }) => {
    await allerAuPanneau(page, 'panneauReglages');
    await expect(page.locator('#panneauReglages')).toHaveClass(/panneau--actif/);

    await page.goBack();
    await page.waitForTimeout(400);

    await expect(page.locator('#panneauBilan')).toHaveClass(/panneau--actif/);
    await expect(page.locator('#mainApp')).toBeVisible();
  });

  test('les couches se referment une par une, dans l\'ordre', async ({ page }) => {
    await allerAuPanneau(page, 'panneauCharges');
    await page.locator('#addVariableChargeBtn').click();
    await expect(page.locator('#modalAddVariableCharge')).toHaveClass(/active/);

    // Premier retour : la modale.
    await page.goBack();
    await page.waitForTimeout(400);
    await expect(page.locator('#modalAddVariableCharge')).not.toHaveClass(/active/);
    await expect(page.locator('#panneauCharges')).toHaveClass(/panneau--actif/);

    // Second retour : l'onglet.
    await page.goBack();
    await page.waitForTimeout(400);
    await expect(page.locator('#panneauBilan')).toHaveClass(/panneau--actif/);
    await expect(page.locator('#mainApp')).toBeVisible();
  });

  test('dix allers-retours d\'onglet ne coûtent qu\'UN retour', async ({ page }) => {
    // Le piège de la pile qui grossit : une entrée par changement d'onglet
    // exigerait dix retours pour sortir, et le geste deviendrait une punition.
    const avant = await page.evaluate(() => history.length);

    for (let i = 0; i < 5; i++) {
      await allerAuPanneau(page, 'panneauCharges');
      await allerAuPanneau(page, 'panneauReglages');
    }

    const apres = await page.evaluate(() => history.length);
    expect(apres - avant, 'une seule entrée, quel que soit le trajet').toBe(1);

    await page.goBack();
    await page.waitForTimeout(400);
    await expect(page.locator('#panneauBilan')).toHaveClass(/panneau--actif/);
  });

  test('ouvrir puis fermer des modales ne fait pas gonfler l\'historique', async ({ page }) => {
    // C'EST LE PIÈGE PRINCIPAL. Sans consommation de l'entrée à la fermeture
    // ordinaire, le retour deviendrait inerte pendant autant d'appuis qu'il y
    // a eu de modales ouvertes puis refermées.
    await allerAuPanneau(page, 'panneauCharges');
    const avant = await page.evaluate(() => history.length);

    for (const bouton of ['#addVariableChargeBtn', '#addFixedChargeBtn', '#addReimbursementBtn']) {
      await page.locator(bouton).click();
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    const apres = await page.evaluate(() => history.length);

    // `history.length` ne DIMINUE jamais : `back()` déplace le curseur, il ne
    // tronque pas — l'entrée quittée reste devant, réutilisable par le
    // `pushState` suivant. Trois cycles n'en laissent donc qu'une seule, la
    // transitoire, et non trois.
    expect(apres - avant, 'la profondeur ne suit pas le nombre de cycles')
      .toBeLessThanOrEqual(1);

    // Et c'est le seul fait qui compte vraiment : un retour, et on est revenu.
    // Sans consommation de l'entrée à la fermeture, il en aurait fallu quatre.
    await page.goBack();
    await page.waitForTimeout(400);
    await expect(page.locator('#panneauBilan')).toHaveClass(/panneau--actif/);
  });

  test('sans rien d\'ouvert, le retour quitte comme n\'importe quelle page', async ({ page }) => {
    // La contrepartie : on ne piège pas l'utilisateur dans l'application.
    await page.evaluate(() => history.length);
    await page.goBack();
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('FairSplit.html');
  });
});
