import { test, expect } from '@playwright/test';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Rattacher une enveloppe depuis la saisie rapide
 *
 * Les deux formulaires complets proposaient le rattachement, la saisie rapide
 * non — c'est-à-dire pas au moment où l'on en a le plus besoin : en vacances,
 * en trois gestes.
 *
 * Le segment ne paraît que si le foyer a des enveloppes ouvertes : un cinquième
 * bouton permanent encombrerait la phrase de tous ceux qui ne s'en servent pas,
 * et n'en avoir aucune est l'état de départ.
 */

const phrase = page => page.locator('#quickAddPhrase').innerText();

test.describe('L\'enveloppe dans la saisie rapide', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('absente de la phrase tant qu\'aucune enveloppe n\'existe', async ({ page }) => {
    await page.locator('.fab').click();
    await expect(page.locator('#quickAddPhrase')).toBeVisible();

    expect(await phrase(page)).not.toContain('enveloppe');
  });

  test('paraît dès qu\'il y en a une, et suit la charge en base', async ({ page }) => {
    await page.evaluate(() => window.showManageEnvelopesModal());
    await page.locator('#envelopeNewLabel').fill('Vacances été');
    await page.locator('#envelopeAddBtn').click();
    await page.waitForTimeout(300);
    await page.locator('#envelopeManageClose').click();
    await page.waitForTimeout(400);

    await page.locator('.fab').click();
    expect(await phrase(page)).toContain('Sans enveloppe');

    const id = await page.evaluate(async () =>
      (await (await import('/js/db.js')).dbGet('envelopes'))[0].id);

    await page.locator('#quickAddPhrase button', { hasText: 'Sans enveloppe' }).click();
    await page.locator('#quickAddEnvelope').selectOption(id);
    expect(await phrase(page)).toContain('Vacances été');

    await page.locator('#quickAddAmount').fill('42');
    // Les panneaux sont repliés : ouvrir celui des catégories avant de choisir.
    await page.locator('#quickAddPhrase button', { hasText: 'Choisir une catégorie' }).click();
    await page.locator('.category-btn').first().click();
    await page.locator('#modalQuickAdd .btn-primary').click();
    await page.waitForTimeout(700);

    const portee = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      const periods = await dbGet('periods');
      for (const periode of Object.values(periods || {})) {
        for (const charge of Object.values(periode.variableCharges || {})) return charge.envelope;
      }
      return null;
    });

    expect(portee, 'la charge est partie sans son enveloppe').toBe(id);
  });
});
