import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * L'application se souvient de ce que vous rangez où
 *
 * `tests/utils/memoire-libelle.test.js` verrouille la décision. Ce qui est
 * vérifié ici, c'est le geste : la catégorie se pose pendant qu'on écrit, elle
 * dit d'où elle vient, et — la propriété qui compte — **elle n'écrase jamais
 * un choix fait à la main**.
 *
 * Cette dernière est celle qu'une implémentation naïve rate : reposer la
 * proposition à chaque frappe défait le choix de l'utilisateur sans qu'il voie
 * pourquoi, et rend le formulaire hostile.
 */

function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Deux saisies concordantes : l'habitude minimale */
function semence() {
  const p = moisCourant();
  // Le mois précédent, année comprise : en janvier, c'est décembre de l'an
  // d'avant, et un mois qui n'existe pas ne sème rien.
  const total = Number(p.slice(0, 4)) * 12 + (Number(p.slice(5, 7)) - 1) - 1;
  const precedent = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;

  return {
    'household/salaries': { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
    [`household/periods/${precedent}/variableCharges/a1`]: {
      description: 'Intermarché', amount: 62.4, category: 'Courses',
      paidBy: 'vous', date: `${precedent}-08`, deleted: false
    },
    [`household/periods/${precedent}/variableCharges/a2`]: {
      description: 'Intermarché', amount: 71.1, category: 'Courses',
      paidBy: 'vous', date: `${precedent}-19`, deleted: false
    }
  };
}

async function ouvrir(page) {
  // Vue de bureau, à dessein : sous 900 px « + Ajouter » vit dans l'onglet
  // Charges, masqué depuis le Bilan — Playwright attend alors un élément
  // inatteignable jusqu'au délai de garde. La proposition de catégorie ne
  // dépend d'aucune largeur ; ce contrôle n'a pas à en éprouver une.
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(semence())};`);
  await waitForApp(page);
  await page.waitForTimeout(1500);
}

/** Ouvre le formulaire et écrit la description */
async function ecrire(page, texte) {
  await page.locator('#addVariableChargeBtn').click();
  await page.locator('#variableChargeDescription').fill(texte);
  await page.waitForTimeout(250);
}

test.describe('La catégorie proposée', () => {
  test('se pose d\'après les saisies passées, et dit sur quoi elle se fonde', async ({ page }) => {
    await ouvrir(page);
    await ecrire(page, 'Intermarché');

    await expect(page.locator('#variableChargeCategory')).toHaveValue('Courses');

    const indice = page.locator('#variableChargeCategoryHint');
    await expect(indice).toBeVisible();
    await expect(indice, 'la proposition ne dit pas d\'où elle vient').toContainText('2 saisies');
  });

  test('les accents ne sont pas exigés', async ({ page }) => {
    await ouvrir(page);
    await ecrire(page, 'intermarche');

    await expect(page.locator('#variableChargeCategory')).toHaveValue('Courses');
  });

  test('elle se pose déjà pendant qu\'on écrit', async ({ page }) => {
    await ouvrir(page);
    await ecrire(page, 'Interm');

    await expect(page.locator('#variableChargeCategory')).toHaveValue('Courses');
    await expect(page.locator('#variableChargeCategoryHint')).toContainText('commençant ainsi');
  });

  test('une proposition ne survit pas au libellé qui l\'a produite', async ({ page }) => {
    // La garde était inversée : une proposition posée REMPLIT le sélecteur,
    // donc elle ne s'effaçait jamais. « Intermarché » puis « Cinéma » laissait
    // « Courses » en place, avec un indice justifiant un libellé absent.
    await ouvrir(page);
    await ecrire(page, 'Intermarché');
    await expect(page.locator('#variableChargeCategory')).toHaveValue('Courses');

    await page.locator('#variableChargeDescription').fill('Cinéma');
    await page.waitForTimeout(300);

    await expect(page.locator('#variableChargeCategory')).toHaveValue('');
    await expect(page.locator('#variableChargeCategoryHint')).toBeHidden();
  });

  test('LA PROPRIÉTÉ : un choix fait à la main n\'est jamais écrasé', async ({ page }) => {
    await ouvrir(page);
    await ecrire(page, 'Interm');
    await expect(page.locator('#variableChargeCategory')).toHaveValue('Courses');

    // L'utilisateur tranche autrement…
    await page.locator('#variableChargeCategory').selectOption('Restaurant');
    await expect(page.locator('#variableChargeCategoryHint')).toBeHidden();

    // …puis finit d'écrire son libellé.
    await page.locator('#variableChargeDescription').fill('Intermarché');
    await page.waitForTimeout(250);

    await expect(
      page.locator('#variableChargeCategory'),
      'la proposition a défait le choix de l\'utilisateur'
    ).toHaveValue('Restaurant');
  });

  test('un libellé inconnu ne propose rien', async ({ page }) => {
    await ouvrir(page);
    await ecrire(page, 'Zanzibar');

    await expect(page.locator('#variableChargeCategory')).toHaveValue('');
    await expect(page.locator('#variableChargeCategoryHint')).toBeHidden();
  });

  test('rouvrir une charge existante ne change pas sa catégorie', async ({ page }) => {
    // Elle porte déjà celle que le foyer lui a donnée : la remplacer sur une
    // simple correction de libellé défairait un choix explicite.
    await ouvrir(page);

    await ecrire(page, 'Intermarché');
    await page.locator('#variableChargeAmount').fill('30');
    await page.locator('#variableChargeCategory').selectOption('Restaurant');
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(600);

    await page.locator('#variableChargesList .charge-item').first()
      .locator('[data-action="editVariableCharge"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('#variableChargeCategory')).toHaveValue('Restaurant');

    await page.locator('#variableChargeDescription').fill('Intermarché Rennes');
    await page.waitForTimeout(250);
    await expect(page.locator('#variableChargeCategory')).toHaveValue('Restaurant');
  });
});
