import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Ouvrir le détail derrière un chiffre du bilan
 *
 * `tests/utils/detail.test.js` verrouille la sélection et les totaux. Ce qui
 * est vérifié ici, c'est le geste : la ligne s'ouvre, et **la modale retrouve
 * exactement le chiffre sur lequel on a cliqué**.
 *
 * Cette égalité est la seule chose qui compte. Une modale qui afficherait un
 * autre total que la ligne qui l'a ouverte ferait douter du bilan, pas de la
 * modale.
 */

const VUE = { width: 390, height: 844 };

function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Un mois où chacun a avancé, plus une charge partagée */
function semence() {
  const p = moisCourant();
  return {
    'household/salaries': { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/fixedCharges/f1`]: {
      description: 'Loyer', amount: 950, category: 'Maison',
      paidBy: 'vous', date: `${p}-05`, deleted: false
    },
    [`household/periods/${p}/variableCharges/v1`]: {
      description: 'Courses du samedi', amount: 74.25, category: 'Courses',
      paidBy: 'vous', date: `${p}-12`, deleted: false
    },
    [`household/periods/${p}/variableCharges/v2`]: {
      description: 'Restaurant du port', amount: 88.5, category: 'Restaurant',
      paidBy: 'conjointe', date: `${p}-14`, deleted: false
    },
    // Partagée : chacun n'en a avancé qu'une part.
    [`household/periods/${p}/variableCharges/v3`]: {
      description: 'Week-end', amount: 300, category: 'Loisirs',
      paidBy: 'partage', date: `${p}-20`, deleted: false
    }
  };
}

async function ouvrir(page) {
  await page.setViewportSize(VUE);
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(semence())};`);
  await waitForApp(page);
  await page.waitForTimeout(1500);
  // Les paiements réels vivent sous « Voir le détail ».
  await page.locator('.summary-details > summary').click();
  await page.waitForTimeout(250);
}

/** Un montant affiché, ramené à un nombre */
function enNombre(texte) {
  return Number(
    String(texte).replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.')
  );
}

test.describe('Le détail d\'un payeur', () => {
  test('la modale retrouve exactement le chiffre de la ligne', async ({ page }) => {
    await ouvrir(page);

    const ligne = page.locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]');
    await expect(ligne).toBeVisible();
    const surLaLigne = enNombre(await ligne.locator('strong').innerText());

    await ligne.click();
    await page.waitForTimeout(400);

    const modale = page.locator('#modalDetailDepenses');
    await expect(modale).toBeVisible();

    const dansLaModale = enNombre(await modale.locator('.detail-total-montant').innerText());
    expect(dansLaModale, 'la modale annonce un autre total que la ligne')
      .toBeCloseTo(surLaLigne, 2);
  });

  test('elle montre les dépenses avancées, et pas celles d\'en face', async ({ page }) => {
    await ouvrir(page);

    await page.locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]').click();
    await page.waitForTimeout(400);

    const modale = page.locator('#modalDetailDepenses');
    await expect(modale).toContainText('Loyer');
    await expect(modale).toContainText('Courses du samedi');
    await expect(modale, 'une dépense avancée par la conjointe apparaît')
      .not.toContainText('Restaurant du port');
  });

  test('une charge partagée dit qu\'elle ne compte que pour une part', async ({ page }) => {
    // Sans cette mention, le lecteur additionne les montants affichés et ne
    // retombe pas sur le total : c'est le total qu'il mettrait en doute.
    await ouvrir(page);

    await page.locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]').click();
    await page.waitForTimeout(400);

    const partagee = page.locator('.detail-ligne', { hasText: 'Week-end' });
    await expect(partagee).toBeVisible();
    await expect(partagee.locator('.detail-part')).toContainText('300');
  });

  test('les deux détails réunis font le total des charges', async ({ page }) => {
    await ouvrir(page);

    const lire = async (qui) => {
      await page.locator(`[data-action="ouvrirDetailPayeur"][data-arg="${qui}"]`).click();
      await page.waitForTimeout(350);
      const total = enNombre(
        await page.locator('#modalDetailDepenses .detail-total-montant').innerText()
      );
      await page.locator('#detailDepensesFermer').click();
      await page.waitForTimeout(300);
      return total;
    };

    const vous = await lire('vous');
    const conjointe = await lire('conjointe');

    // Comparé au total que LE BILAN AFFICHE, sur la même page et dans le même
    // geste — jamais à une constante écrite à la main. Avec 1 412,75 en dur, le
    // jour où `computeSummary` se remettrait à compter une charge solo ou
    // supprimée, le bilan afficherait 1 447,75 € pendant que les deux détails
    // continueraient de sommer 1 412,75 — et ce contrôle, dont le titre EST
    // cette égalité, serait resté vert.
    const duBilan = enNombre(await page.locator('.summary-total-row strong').innerText());

    expect(vous + conjointe).toBeCloseTo(duBilan, 2);
  });

  test('Échap referme', async ({ page }) => {
    await ouvrir(page);

    await page.locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#modalDetailDepenses')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await expect(page.locator('#modalDetailDepenses')).toBeHidden();
  });
});

test.describe('Le détail d\'une catégorie', () => {
  test('la ligne du panneau des budgets ouvre ses dépenses', async ({ page }) => {
    await ouvrir(page);

    const ligne = page.locator('[data-action="ouvrirDetailCategorie"][data-arg="Maison"]');
    await expect(ligne).toBeVisible();

    const surLaLigne = enNombre(await ligne.locator('.budget-row-amounts').innerText());

    await ligne.click();
    await page.waitForTimeout(400);

    const modale = page.locator('#modalDetailDepenses');
    await expect(modale).toBeVisible();
    await expect(modale).toContainText('Loyer');

    const dansLaModale = enNombre(await modale.locator('.detail-total-montant').innerText());
    expect(dansLaModale, 'la modale annonce un autre total que la ligne')
      .toBeCloseTo(surLaLigne, 2);
  });

  test('une catégorie ne montre pas les dépenses d\'une autre', async ({ page }) => {
    await ouvrir(page);

    await page.locator('[data-action="ouvrirDetailCategorie"][data-arg="Courses"]').click();
    await page.waitForTimeout(400);

    const modale = page.locator('#modalDetailDepenses');
    await expect(modale).toContainText('Courses du samedi');
    await expect(modale).not.toContainText('Loyer');
  });

  test('un libellé hostile est affiché en texte, jamais interprété', async ({ page }) => {
    const p = moisCourant();
    const db = semence();
    db[`household/periods/${p}/variableCharges/v1`].description = '<img src=x onerror=alert(1)>';

    await page.setViewportSize(VUE);
    await setupFirebaseMock(page);
    await page.addInitScript(`window.__db = ${JSON.stringify(db)};`);
    await waitForApp(page);
    await page.waitForTimeout(1500);
    await page.locator('.summary-details > summary').click();
    await page.waitForTimeout(250);

    await page.locator('[data-action="ouvrirDetailCategorie"][data-arg="Courses"]').click();
    await page.waitForTimeout(400);

    await expect(page.locator('#modalDetailDepenses')).toContainText('<img src=x');
    expect(await page.locator('#modalDetailDepenses img').count()).toBe(0);
  });
});
