import { test, expect } from '@playwright/test';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Renommer une catégorie doit emporter ses charges
 *
 * Les deux boutons annonçaient « Ajouter, renommer ou retirer » ; l'écran ne
 * savait qu'ajouter et retirer. Corriger « Restaurent » imposait de supprimer
 * et recréer, ce qui laissait toutes les charges passées rattachées à un
 * libellé mort.
 *
 * Une charge porte le libellé de sa catégorie, pas son identifiant : renommer
 * la seule liste reviendrait donc exactement à cette suppression-recréation.
 * C'est ce que ce contrôle vérifie de bout en bout — la partie où une erreur
 * coûterait de l'historique.
 */

async function poserDeuxCharges(page, categorie) {
  await page.locator('#salaireVous').fill('2500');
  await page.locator('#salaireConjointe').fill('1800');
  await page.locator('#salaireVous').blur();
  await page.waitForTimeout(200);

  for (const [description, montant] of [['Midi crêperie', '18'], ['Pizza', '24']]) {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill(description);
    await page.locator('#variableChargeAmount').fill(montant);
    await page.locator('#variableChargeCategory').selectOption(categorie);
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(250);
  }
}

/** Les catégories que portent les charges, telles qu'elles sont en base */
function categoriesEnBase(page) {
  return page.evaluate(async () => {
    const { dbGet } = await import('/js/db.js');
    const periods = await dbGet('periods');
    const portees = [];
    for (const periode of Object.values(periods || {})) {
      for (const charge of Object.values(periode.variableCharges || {})) {
        portees.push(charge.category);
      }
    }
    return portees;
  });
}

test.describe('Renommer une catégorie', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('la liste et les charges suivent ensemble', async ({ page }) => {
    await poserDeuxCharges(page, 'Restaurant');
    expect(await categoriesEnBase(page)).toEqual(['Restaurant', 'Restaurant']);

    await page.evaluate(() => window.showManageCategoriesModal());
    await page.locator('.manage-list-item', { hasText: 'Restaurant' }).first()
      .locator('.manage-item-editer').click();

    await expect(page.locator('#manageEditLabel')).toBeVisible();
    await page.locator('#manageEditLabel').fill('Restos');
    await page.locator('.manage-item-valider').click();
    await page.waitForTimeout(600);

    // La liste porte le nouveau nom…
    await expect(page.locator('#manageListItems')).toContainText('Restos');
    await expect(page.locator('#manageListItems')).not.toContainText('Restaurant');

    // …et les charges l'ont suivi, sinon le renommage vaudrait une suppression.
    expect(await categoriesEnBase(page), 'les charges gardent l\'ancien libellé')
      .toEqual(['Restos', 'Restos']);
  });

  test('refuse un nom déjà pris', async ({ page }) => {
    await page.evaluate(() => window.showManageCategoriesModal());
    await page.locator('.manage-list-item', { hasText: 'Restaurant' }).first()
      .locator('.manage-item-editer').click();

    await page.locator('#manageEditLabel').fill('Courses');
    await page.locator('.manage-item-valider').click();
    await page.waitForTimeout(300);

    // Deux entrées d'un même nom seraient indiscernables à l'œil, et les
    // charges de l'une n'apparaîtraient pas sous l'autre.
    await expect(page.locator('#manageEditLabel'), 'l\'édition a été validée')
      .toBeVisible();
  });

  test('annuler ne change rien', async ({ page }) => {
    await page.evaluate(() => window.showManageCategoriesModal());
    await page.locator('.manage-list-item', { hasText: 'Essence' }).first()
      .locator('.manage-item-editer').click();

    await page.locator('#manageEditLabel').fill('Carburant');
    await page.locator('.manage-item-annuler').click();
    await page.waitForTimeout(300);

    await expect(page.locator('#manageListItems')).toContainText('Essence');
    await expect(page.locator('#manageListItems')).not.toContainText('Carburant');
  });
});

test.describe('Modifier une enveloppe', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('le nom, l\'image et le budget se corrigent sans rien détacher', async ({ page }) => {
    await page.evaluate(() => window.showManageEnvelopesModal());
    await page.locator('#envelopeNewLabel').fill('Vacanes été');
    await page.locator('#envelopeNewBudget').fill('1200');
    await page.locator('#envelopeAddBtn').click();
    await page.waitForTimeout(400);

    const idAvant = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      return (await dbGet('envelopes'))[0].id;
    });

    await page.locator('.envelope-editer').first().click();
    await expect(page.locator('#envelopeEditLabel')).toBeVisible();
    await page.locator('#envelopeEditLabel').fill('Vacances été');
    await page.locator('#envelopeEditBudget').fill('1500');
    await page.locator('#envelopeEditValider').click();
    await page.waitForTimeout(500);

    const apres = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      const liste = await dbGet('envelopes');
      return { id: liste[0].id, label: liste[0].label, budget: liste[0].budget };
    });

    expect(apres.label).toBe('Vacances été');
    expect(apres.budget).toBe(1500);
    // L'identifiant ne bouge pas : les charges rattachées le restent.
    expect(apres.id, 'l\'identifiant a changé, les charges sont détachées').toBe(idAvant);
  });
});

test.describe('Voir une enveloppe', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('le total porte sur toute sa durée, pas sur le mois consulté', async ({ page }) => {
    await page.evaluate(() => window.showManageEnvelopesModal());
    await page.locator('#envelopeNewLabel').fill('Vacances été');
    await page.locator('#envelopeNewBudget').fill('1000');
    await page.locator('#envelopeAddBtn').click();
    await page.waitForTimeout(400);

    // Trois dépenses, sur deux mois, fixes et variables mêlées.
    await page.evaluate(async () => {
      const { dbGet, dbUpdate } = await import('/js/db.js');
      const id = (await dbGet('envelopes'))[0].id;
      await dbUpdate(undefined, {
        'periods/2026-07/variableCharges/x1': { description: 'Péage', amount: 42, envelope: id, date: '2026-07-28', category: 'Transport', paidBy: 'vous' },
        'periods/2026-08/variableCharges/x2': { description: 'Restaurant du port', amount: 58, envelope: id, date: '2026-08-03', category: 'Restaurant', paidBy: 'vous' },
        'periods/2026-08/fixedCharges/x3': { description: 'Location gîte', amount: 600, envelope: id, date: '2026-08-01', category: 'Maison', paidBy: 'conjointe' }
      });
    });

    await page.locator('.envelope-ouvrir').first().click();

    // C'est le chiffre qui manquait : l'écran de gestion ne comptait que le
    // mois consulté, et une enveloppe existe pour traverser les mois.
    await expect(page.locator('.enveloppe-total-montant')).toContainText('700');
    await expect(page.locator('.enveloppe-total-detail')).toContainText('3 dépenses sur 2 mois');
    await expect(page.locator('.enveloppe-jauge-legende')).toContainText('restants');

    // Les trois dépenses, du plus récent au plus ancien.
    expect(await page.locator('.enveloppe-depense-titre').allInnerTexts())
      .toEqual(['Restaurant du port', 'Location gîte fixe', 'Péage']);
  });
});
