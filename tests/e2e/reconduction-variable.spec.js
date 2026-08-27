import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Reconduire une charge variable, sans son montant
 *
 * La reconduction n'écrivait que dans `fixedCharges` : une dépense régulière au
 * montant changeant — l'essence, la cantine, le panier de la semaine — se
 * ressaisissait intégralement chaque mois, ce que la reconduction existe
 * précisément pour éviter.
 *
 * Deux choses sont verrouillées ici, et la seconde est la plus importante :
 *
 *   1. la case fait bien le tour — enregistrement, relecture, édition ;
 *   2. **la ligne reconduite repart à zéro, et le dit**. Recopier le montant
 *      inventerait de l'argent dans un solde partagé, faux pour les deux
 *      jusqu'à ce que quelqu'un s'en aperçoive.
 */

/** Ouvre le formulaire de charge variable */
async function ouvrirLeFormulaire(page) {
  await allerAuPanneau(page, 'panneauCharges');
  await page.locator('#addVariableChargeBtn').click();
  await expect(page.locator('#modalAddVariableCharge')).toBeVisible();
}

/** Remplit et enregistre une charge variable */
async function enregistrer(page, { description, montant, reconduire }) {
  await page.locator('#variableChargeDescription').fill(description);
  await page.locator('#variableChargeAmount').fill(String(montant));
  await page.locator('#variableChargeCategory').selectOption({ index: 1 });
  if (reconduire) await page.locator('#variableChargeRecurring + .toggle-slider').click();
  await page.locator('#saveVariableCharge').click();
  await page.waitForTimeout(900);
}

/** Les charges variables écrites en base pour le mois courant */
async function enBase(page) {
  return page.evaluate(async () => {
    const { dbGet } = await import('/js/db.js');
    const p = document.getElementById('periodSelect').value;
    return Object.values((await dbGet(`periods/${p}/variableCharges`)) || {});
  });
}

test.describe('La reconduction d\'une charge variable', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('la case existe, et elle est décochée', async ({ page }) => {
    // Décochée, et il le faut : cochée par défaut, elle recopierait chaque mois
    // tout ce que le foyer saisit.
    await ouvrirLeFormulaire(page);
    await expect(page.locator('#variableChargeRecurring')).toHaveCount(1);
    expect(await page.locator('#variableChargeRecurring').isChecked()).toBe(false);
  });

  test('sans la case, la charge n\'est pas marquée', async ({ page }) => {
    await ouvrirLeFormulaire(page);
    await enregistrer(page, { description: 'Restaurant', montant: 46, reconduire: false });

    const charges = await enBase(page);
    expect(charges.find(c => c.description === 'Restaurant').recurring).toBe(false);
  });

  test('avec la case, la charge est marquée en base', async ({ page }) => {
    await ouvrirLeFormulaire(page);
    await enregistrer(page, { description: 'Essence', montant: 78, reconduire: true });

    const charges = await enBase(page);
    expect(charges.find(c => c.description === 'Essence').recurring).toBe(true);
  });

  test('rouvrir la charge retrouve la case cochée', async ({ page }) => {
    // Une case qui ne se relit pas ferait perdre le réglage à la première
    // correction de montant.
    await ouvrirLeFormulaire(page);
    await enregistrer(page, { description: 'Essence', montant: 78, reconduire: true });

    await page.locator('[data-action="editVariableCharge"]').first().click();
    await expect(page.locator('#modalAddVariableCharge')).toBeVisible();
    expect(await page.locator('#variableChargeRecurring').isChecked()).toBe(true);
  });

  test('une ligne reconduite sans montant se signale « à compléter »', async ({ page }) => {
    // Sans ce marqueur, « 0,00 € » se lit comme une dépense nulle et non comme
    // une saisie qui attend son chiffre.
    await allerAuPanneau(page, 'panneauCharges');
    await page.evaluate(async () => {
      const { dbUpdate } = await import('/js/db.js');
      const p = document.getElementById('periodSelect').value;
      await dbUpdate(undefined, {
        [`periods/${p}/variableCharges/r1`]: {
          description: 'Essence', amount: 0, category: 'Courses',
          paidBy: 'vous', recurring: true, date: `${p}-01`, deleted: false }
      });
      await window.changePeriod(p);
    });
    await page.waitForTimeout(1000);

    await expect(page.locator('#variableChargesList')).toContainText('à compléter');
  });

  test('une charge reconduite déjà complétée ne porte plus le marqueur', async ({ page }) => {
    await allerAuPanneau(page, 'panneauCharges');
    await page.evaluate(async () => {
      const { dbUpdate } = await import('/js/db.js');
      const p = document.getElementById('periodSelect').value;
      await dbUpdate(undefined, {
        [`periods/${p}/variableCharges/r1`]: {
          description: 'Essence', amount: 78, category: 'Courses',
          paidBy: 'vous', recurring: true, date: `${p}-01`, deleted: false }
      });
      await window.changePeriod(p);
    });
    await page.waitForTimeout(1000);

    await expect(page.locator('#variableChargesList')).not.toContainText('à compléter');
  });

  test('une ligne à zéro ne pèse pas sur le solde', async ({ page }) => {
    // La raison même du choix : une ligne reconduite n'invente aucun montant.
    await allerAuPanneau(page, 'panneauReglages');
    await page.locator('#salaireVous').fill('2500');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('1800');
    await page.locator('#salaireConjointe').blur();
    await page.waitForTimeout(600);

    await allerAuPanneau(page, 'panneauBilan');
    // Le solde lui-même, et non toute la section : ajouter une charge datée
    // fait légitimement paraître le bloc prévisionnel, qui peut désormais dire
    // que tout est passé. Ce qui ne doit pas bouger, c'est le montant dû.
    const avant = await page.locator('.summary-balance').innerText();

    await page.evaluate(async () => {
      const { dbUpdate } = await import('/js/db.js');
      const p = document.getElementById('periodSelect').value;
      await dbUpdate(undefined, {
        [`periods/${p}/variableCharges/r1`]: {
          description: 'Essence', amount: 0, category: 'Courses',
          paidBy: 'vous', recurring: true, date: `${p}-01`, deleted: false }
      });
      await window.changePeriod(p);
    });
    await page.waitForTimeout(1200);

    await allerAuPanneau(page, 'panneauBilan');
    expect(await page.locator('.summary-balance').innerText()).toBe(avant);
  });
});
