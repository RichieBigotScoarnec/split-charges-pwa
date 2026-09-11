import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * La barre collante porte le solde commun sur « À deux » et « Moi » — jamais
 * sur « Privé »
 *
 * ─────────────────────────────────────────────────────────────────────
 * VU À L'ÉCRAN PAR LE FOYER, 2026-09-11 — et ce n'est pas un détail
 *
 * « Richard doit 145,37 € à Cindy » s'affichait en haut de la portée Privé.
 * La portée ne porte aucune créance, et l'écran y dit en toutes lettres que
 * Cindy n'y voit rien : la barre y rappelait le seul chiffre du couple sur
 * l'écran qui promet de n'en montrer aucun de l'autre.
 *
 * Sur « Moi », elle reste : le rappel du solde commun a du sens quand on
 * regarde son reste à vivre.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LA PROPRIÉTÉ, ET SES TÉMOINS
 *
 * « La barre ne paraît jamais sur Privé » est satisfait par une barre morte
 * partout. Le cas exige donc de la VOIR d'abord sur « Moi », puis de ne plus
 * la voir sur « Privé » — en haut ET après défilement, puisque c'est en
 * faisant défiler qu'elle prend le relais —, puis de la revoir en revenant.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** Richard avance 1 000 €, salaires 3000/1000 : un solde de 250 € existe. */
async function semer(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const mois = document.getElementById('periodSelect').value;
    await dbSet('salaries', { vous: 3000, conjointe: 1000 });
    await dbUpdate(undefined, {
      [`periods/${mois}/salaries`]: { vous: 3000, conjointe: 1000 },
      [`periods/${mois}/variableCharges/v1`]: {
        description: 'Courses', amount: 1000, category: 'Maison', paidBy: 'vous', deleted: false
      }
    });
    await window.changePeriod();
  });
  await page.waitForTimeout(1500);
}

/** La barre est-elle RENDUE, avec un solde dedans ? */
const barreVisible = (page) => page.locator('#balanceBar').evaluate(
  (barre) => barre.checkVisibility() && /\d/.test(barre.textContent)
);

async function choisir(page, portee) {
  await page.locator(`#panneauBilan [data-portee="${portee}"]`).click();
  await expect(page.locator('#panneauBilan .bilan-heros')).toHaveAttribute('data-tete', portee);
}

test('Privé : la barre ne paraît jamais — ni en haut, ni après défilement', async ({ page }) => {
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semer(page);

  // Témoin : sur « Moi », aucune tête ne porte le solde, la barre le porte.
  await choisir(page, 'solo');
  await expect.poll(() => barreVisible(page), { message: 'prémisse : la barre n\'est pas visible sur « Moi »' })
    .toBe(true);

  await choisir(page, 'prive');
  await expect.poll(() => barreVisible(page), { message: 'la barre porte le solde commun sur « Privé », en haut' })
    .toBe(false);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  expect(await barreVisible(page), 'la barre porte le solde commun sur « Privé », après défilement')
    .toBe(false);

  // Et elle revient avec la portée qui la porte.
  await page.evaluate(() => window.scrollTo(0, 0));
  await choisir(page, 'solo');
  await expect.poll(() => barreVisible(page), { message: 'la barre n\'est pas revenue sur « Moi »' })
    .toBe(true);
});

test('À deux : la barre se tait sous la tête, et prend le relais quand elle sort', async ({ page }) => {
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semer(page);

  await choisir(page, 'deux');
  await expect.poll(() => barreVisible(page), { message: 'la barre répète la tête encore à l\'écran' })
    .toBe(false);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => barreVisible(page), { message: 'la barre ne prend pas le relais une fois la tête sortie' })
    .toBe(true);
});
