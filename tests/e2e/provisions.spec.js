import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Ce qu'il faut mettre de côté ce mois-ci
 *
 * Une charge annuelle n'appartient pas au mois où elle tombe : la taxe foncière
 * de 1 200 € payée en octobre appartient aux douze mois qui la précèdent. Les
 * enveloppes savaient déjà accumuler — objectif, échéance, contenu réel du pot —
 * mais **rien ne faisait la division**, et octobre portait tout.
 *
 * L'arithmétique est verrouillée par `tests/utils/provisions.test.js`. Ce qui
 * est vérifié ici, c'est qu'elle atteint l'écran : une division juste qu'on
 * n'affiche nulle part ne provisionne rien.
 */

/** Crée une enveloppe par le formulaire, et rend son identifiant */
async function creerEnveloppe(page, { label, budget, fin, nature = 'cagnotte' }) {
  await page.evaluate(() => window.showManageEnvelopesModal());
  await expect(page.locator('#modalManageEnvelopes')).toBeVisible();

  await page.locator('#envelopeNewLabel').fill(label);
  await page.locator('#envelopeNewNature').selectOption(nature);
  if (budget !== undefined) await page.locator('#envelopeNewBudget').fill(String(budget));
  if (fin) await page.locator('#envelopeNewFin').fill(fin);
  await page.locator('#envelopeAddBtn').click();
  await page.waitForTimeout(900);

  return page.evaluate(async () => {
    const { dbGet } = await import('/js/db.js');
    const liste = await dbGet('envelopes');
    return liste[liste.length - 1].id;
  });
}

/** Ouvre la vue détaillée de la première enveloppe et rend son texte */
async function lireLaVue(page) {
  await page.locator('#manageEnvelopeItems button').first().click();
  await expect(page.locator('#modalVueEnveloppe')).toBeVisible();
  return (await page.locator('#modalVueEnveloppe').innerText());
}

/** Le mois courant, et un mois décalé de N */
async function moisDecale(page, decalage) {
  return page.evaluate((n) => {
    const p = document.getElementById('periodSelect').value;
    const [an, mois] = p.split('-').map(Number);
    const total = (an * 12 + (mois - 1)) + n;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  }, decalage);
}

test.describe('La provision annuelle', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('une cagnotte datée annonce ce qu\'il faut mettre par mois', async ({ page }) => {
    // 1 200 € visés, 300 € déjà dans le pot, échéance dans deux mois : il reste
    // trois mois — celui-ci compris — pour réunir 900 €, soit 300 € par mois.
    const echeance = `${await moisDecale(page, 2)}-15`;
    const id = await creerEnveloppe(page, { label: 'Taxe foncière', budget: 1200, fin: echeance });

    await page.evaluate(async ({ id, p }) => {
      const { dbUpdate } = await import('/js/db.js');
      await dbUpdate(undefined, { [`versements/${id}/v1`]: { montant: 300, auteur: 'vous', date: `${p}-05` } });
    }, { id, p: await page.locator('#periodSelect').inputValue() });

    const vue = await lireLaVue(page);
    expect(vue).toContain('300,00');
    expect(vue).toMatch(/par mois/i);
    expect(vue, 'le reste à réunir n\'est pas nommé').toContain('900,00');
    expect(vue).toMatch(/3 mois/);
  });

  test('sans échéance, aucune provision n\'est annoncée', async ({ page }) => {
    // Sans date, il n'y a rien à diviser. Annoncer un montant « par mois »
    // serait inventer un calendrier que personne n'a donné.
    await creerEnveloppe(page, { label: 'Réserve', budget: 1200 });
    const vue = await lireLaVue(page);
    expect(vue).not.toMatch(/par mois/i);
  });

  test('une mensuelle n\'est jamais une provision : elle se recharge', async ({ page }) => {
    const echeance = `${await moisDecale(page, 2)}-15`;
    await creerEnveloppe(page, { label: 'Courses', budget: 500, fin: echeance, nature: 'mensuelle' });
    const vue = await lireLaVue(page);
    expect(vue).not.toMatch(/par mois/i);
  });

  test('l\'objectif atteint se félicite au lieu de réclamer', async ({ page }) => {
    const echeance = `${await moisDecale(page, 2)}-15`;
    const id = await creerEnveloppe(page, { label: 'Noël', budget: 600, fin: echeance });

    await page.evaluate(async ({ id, p }) => {
      const { dbUpdate } = await import('/js/db.js');
      await dbUpdate(undefined, { [`versements/${id}/v1`]: { montant: 600, auteur: 'vous', date: `${p}-05` } });
    }, { id, p: await page.locator('#periodSelect').inputValue() });

    const vue = await lireLaVue(page);
    expect(vue).toMatch(/objectif atteint/i);
    expect(vue, 'une provision atteinte ne réclame plus rien').not.toMatch(/par mois/i);
  });

  test('une échéance dépassée alerte, et réclame tout ce qui manque', async ({ page }) => {
    // Le cas qu'il ne faut surtout pas confondre avec « il reste un mois ».
    const passe = `${await moisDecale(page, -3)}-15`;
    const id = await creerEnveloppe(page, { label: 'Ordures', budget: 400, fin: passe });

    await page.evaluate(async ({ id, p }) => {
      const { dbUpdate } = await import('/js/db.js');
      await dbUpdate(undefined, { [`versements/${id}/v1`]: { montant: 150, auteur: 'vous', date: `${p}-05` } });
    }, { id, p: await page.locator('#periodSelect').inputValue() });

    const vue = await lireLaVue(page);
    expect(vue).toMatch(/dépassée/i);
    expect(vue, 'les 250 € manquants ne sont pas nommés').toContain('250,00');
    expect(vue).not.toMatch(/par mois/i);
  });

  test('la provision ne touche pas au solde du couple', async ({ page }) => {
    // Mettre de côté n'est pas dépenser : c'est une lecture, pas un mouvement.
    await page.locator('#salaireVous').fill('2500');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('1800');
    await page.locator('#salaireConjointe').blur();
    await page.waitForTimeout(600);

    const avant = await page.locator('#summarySection').innerText();

    const echeance = `${await moisDecale(page, 2)}-15`;
    await creerEnveloppe(page, { label: 'Taxe foncière', budget: 1200, fin: echeance });
    await page.locator('#envelopeManageClose').click();
    await page.waitForTimeout(600);

    expect(await page.locator('#summarySection').innerText()).toBe(avant);
  });
});
