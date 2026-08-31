import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Ce que le formulaire complet demande vraiment
 *
 * Il comptait quinze champs, la description avant le montant, et son bouton
 * « Ajouter » tombait 374 px sous l'écran d'un iPhone 13 — avant même
 * l'ouverture du clavier. Le chemin qu'on emprunte pour CORRIGER une charge,
 * dater une dépense ou lui rattacher un lieu était donc le chemin coûteux : on
 * lui préférait la saisie rapide, et les charges restaient incomplètes.
 *
 * ## Le piège de `toBeVisible()`
 *
 * Un contenu de `<details>` fermé est masqué par `content-visibility: hidden`,
 * qui **n'annule pas la géométrie** : `getBoundingClientRect()` rend 40 px de
 * haut, et Playwright tient donc l'élément pour visible. Toute cette suite —
 * et celle du lieu — serait passée sur des champs que personne ne voit.
 * `checkVisibility()` dit la vérité. Mesuré : `false` replié, `true` déplié.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** Ce que l'écran montre réellement du formulaire */
async function releve(page) {
  return page.evaluate(() => {
    const modale = document.querySelector('#modalAddVariableCharge .modal');
    const submit = document.getElementById('saveVariableCharge');
    const r = submit.getBoundingClientRect();
    const champs = [...document.querySelectorAll(
      '#modalAddVariableCharge input:not([type="hidden"]), #modalAddVariableCharge select'
    )];
    return {
      replie: document.querySelector('#modalAddVariableCharge .form-repli').open === false,
      // `checkVisibility` et non la hauteur : voir l'en-tête de ce fichier.
      champsRendus: champs.filter(e => e.checkVisibility()).length,
      contenu: modale.scrollHeight,
      boite: modale.clientHeight,
      boutonVisible: r.top >= 0 && r.bottom <= innerHeight,
      // L'ordre du document, qui est l'ordre de lecture et de tabulation.
      ordre: champs.slice(0, 2).map(e => e.id)
    };
  });
}

test.describe('Le formulaire de charge variable', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await allerAuPanneau(page, 'panneauCharges');
    await page.locator('#addVariableChargeBtn').click();
    await page.waitForTimeout(400);
  });

  test('demande le montant avant le libellé', async ({ page }) => {
    // C'est la seule chose qu'on connaisse toujours en saisissant une dépense.
    // Le libellé se retrouve, la catégorie se devine — `memoire-libelle.js` la
    // propose d'après les saisies passées —, le montant non. La saisie rapide
    // avait déjà tranché ainsi ; le formulaire complet faisait l'inverse.
    const { ordre } = await releve(page);
    expect(ordre).toEqual(['variableChargeAmount', 'variableChargeDescription']);
  });

  test('replie ce qui ne concerne qu\'une charge sur dix', async ({ page }) => {
    const avant = await releve(page);
    expect(avant.replie).toBe(true);

    const lieu = page.locator('#variableChargeLieuRecherche');
    expect(await lieu.evaluate(el => el.checkVisibility()),
      'le lieu est replié, donc pas rendu').toBe(false);

    await page.locator('#modalAddVariableCharge .form-repli > summary').click();
    await page.waitForTimeout(300);

    const apres = await releve(page);
    expect(apres.replie).toBe(false);
    expect(await lieu.evaluate(el => el.checkVisibility())).toBe(true);
    // Le repli fait gagner de la hauteur, il ne se contente pas d'encadrer.
    expect(apres.contenu - avant.contenu, 'le dépliant doit vraiment replier')
      .toBeGreaterThan(150);
  });

  test('montre son bouton de validation sans défiler', async ({ page }) => {
    expect((await releve(page)).boutonVisible).toBe(true);
  });

  test('rouvrir une charge SANS lieu la laisse repliée', async ({ page }) => {
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      const { dbUpdate } = await import('/js/db.js');
      const now = new Date();
      const p = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await dbUpdate(undefined, {
        [`periods/${p}/variableCharges/v0`]: {
          description: 'Boulangerie', amount: 6.4, category: 'Courses',
          paidBy: 'vous', date: `${p}-03`, deleted: false }
      });
      await window.changePeriod(p);
    });
    await page.waitForTimeout(1800);
    await allerAuPanneau(page, 'panneauCharges');
    await page.locator('[data-action="editVariableCharge"]').first().click();
    await page.waitForTimeout(400);

    expect((await releve(page)).replie).toBe(true);
  });

  test('rouvrir une charge AVEC un lieu le montre', async ({ page }) => {
    // Replier une donnée que la charge porte serait pire que de la montrer
    // toujours : on la croirait perdue, et on la ressaisirait.
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      const { dbUpdate } = await import('/js/db.js');
      const now = new Date();
      const p = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await dbUpdate(undefined, {
        [`periods/${p}/variableCharges/v0`]: {
          description: 'Le Bistrot', amount: 64.5, category: 'Restaurant',
          paidBy: 'vous', date: `${p}-06`, deleted: false,
          location: { name: 'Le Bistrot', lat: 48.11, lng: -1.68 } }
      });
      await window.changePeriod(p);
    });
    await page.waitForTimeout(1800);
    await allerAuPanneau(page, 'panneauCharges');
    await page.locator('[data-action="editVariableCharge"]').first().click();
    await page.waitForTimeout(400);

    expect((await releve(page)).replie, 'le lieu doit se voir').toBe(false);
  });

  test('une saisie neuve repart repliée après une réouverture', async ({ page }) => {
    // `form.reset()` ne touche pas à l'attribut `open` d'un `<details>` : sans
    // rappel explicite, le dépliant resterait ouvert de saisie en saisie et le
    // repli n'aurait servi qu'une fois.
    await page.locator('#modalAddVariableCharge .form-repli > summary').click();
    await page.waitForTimeout(200);
    expect((await releve(page)).replie).toBe(false);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('#addVariableChargeBtn').click();
    await page.waitForTimeout(400);

    expect((await releve(page)).replie).toBe(true);
  });
});
