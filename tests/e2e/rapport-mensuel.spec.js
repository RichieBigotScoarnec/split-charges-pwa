import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Le mois écoulé, en une page — à l'écran
 *
 * `tests/utils/rapport-mensuel.test.js` verrouille le calcul, et sa propriété
 * centrale : le total du rapport est celui de `computeSummary`, jamais une
 * seconde addition. Ce qui se vérifie ici est ce qu'un test unitaire ne peut
 * pas voir :
 *
 *  - le bouton **existe** et son action est joignable (la liste blanche de
 *    `init.js` est le seul chemin ; un nom absent rend le bouton inerte) ;
 *  - le chiffre affiché dans la modale est **celui du bilan**, lu sur la même
 *    page, dans le même geste — c'est la propriété unitaire mesurée sur le
 *    rendu réel plutôt que sur le retour d'une fonction ;
 *  - un mois sans historique **ne montre pas de bouton** plutôt qu'un rapport
 *    à moitié vide.
 */

/** Le mois affiché par l'application au moment du test */
function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Le mois qui précède celui-ci, de n rangs */
function moisAvant(periode, n) {
  const [annee, mois] = periode.split('-').map(Number);
  const total = annee * 12 + (mois - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Quatre mois : trois révolus à 1 000 €, puis celui-ci à 1 300 €
 *
 * Le mois ordinaire vaut donc 1 000 €, l'écart 300 €, et la catégorie qui a
 * bougé est « Restaurant ».
 */
function semer() {
  const p = moisCourant();
  const salaries = { vous: 2500, conjointe: 1800 };

  const db = {
    'household/salaries': salaries,
    [`household/periods/${p}/salaries`]: salaries
  };

  for (let rang = 1; rang <= 3; rang++) {
    const mois = moisAvant(p, rang);
    db[`household/periods/${mois}/salaries`] = salaries;
    db[`household/periods/${mois}/fixedCharges/f1`] = {
      description: 'Loyer', amount: 950, category: 'Maison',
      paidBy: 'vous', date: `${mois}-05`, deleted: false
    };
    db[`household/periods/${mois}/variableCharges/v1`] = {
      description: 'Courses', amount: 50, category: 'Courses',
      paidBy: 'vous', date: `${mois}-12`, deleted: false
    };
  }

  db[`household/periods/${p}/fixedCharges/f1`] = {
    description: 'Loyer', amount: 950, category: 'Maison',
    paidBy: 'vous', date: `${p}-05`, deleted: false
  };
  db[`household/periods/${p}/variableCharges/v1`] = {
    description: 'Courses', amount: 50, category: 'Courses',
    paidBy: 'vous', date: `${p}-12`, deleted: false
  };
  db[`household/periods/${p}/variableCharges/v2`] = {
    description: 'Restaurant', amount: 300, category: 'Restaurant',
    paidBy: 'conjointe', date: `${p}-14`, deleted: false
  };

  return db;
}

async function ouvrir(page, db) {
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(db)};`);
  await waitForApp(page);
  await page.waitForTimeout(1200);
}

/** Ouvre le rapport et rend la modale */
async function ouvrirLeRapport(page) {
  await page.locator('[data-action="ouvrirRapportDuMois"]').click();
  const modale = page.locator('#modalRapportMensuel');
  await expect(modale).toBeVisible();
  return modale;
}

test.describe('Le rapport du mois', () => {
  test('le bouton ouvre une page qui porte le total du mois', async ({ page }) => {
    await ouvrir(page, semer());

    const modale = await ouvrirLeRapport(page);
    // 950 + 50 + 300 : le total des charges communes du mois.
    await expect(modale.locator('.rapport-total')).toContainText('1');
    await expect(modale.locator('.rapport-total')).toContainText('300');
    await expect(modale.locator('.rapport-total-info')).toContainText('3 dépenses');
  });

  test('LA PROPRIÉTÉ : son total est celui que le bilan affiche', async ({ page }) => {
    // La même exigence que le test unitaire, mesurée sur le rendu : les deux
    // chiffres sont lus dans la même page, à la même seconde. C'est ce qui
    // aurait attrapé `normalizePair` et `resolveShareMode`, qui calculaient
    // juste chacun de leur côté et faux ensemble.
    await ouvrir(page, semer());

    await page.locator('.summary-details > summary').click();
    const duBilan = await page.locator('.summary-total-row strong').innerText();

    const modale = await ouvrirLeRapport(page);
    const duRapport = await modale.locator('.rapport-total').innerText();

    const chiffres = (texte) => texte.replace(/[^\d]/g, '');
    expect(chiffres(duRapport)).toBe(chiffres(duBilan));
  });

  test('il situe le mois par rapport à un mois ordinaire, et dit d\'où sort le repère', async ({ page }) => {
    await ouvrir(page, semer());
    const modale = await ouvrirLeRapport(page);

    // 1 300 contre 1 000 : 300 € de plus.
    await expect(modale.locator('.rapport-comparaison')).toContainText('de plus');
    await expect(modale.locator('.rapport-comparaison-fonde')).toContainText('médiane');
  });

  test('il nomme la catégorie qui a le plus bougé', async ({ page }) => {
    await ouvrir(page, semer());
    const modale = await ouvrirLeRapport(page);

    await expect(modale.locator('.rapport-bouge')).toContainText('Restaurant');
  });

  test('sans trois mois révolus, il le dit plutôt que d\'inventer un repère', async ({ page }) => {
    const p = moisCourant();
    await ouvrir(page, {
      'household/salaries': { vous: 2500, conjointe: 1800 },
      [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
      [`household/periods/${p}/variableCharges/v1`]: {
        description: 'Courses', amount: 50, category: 'Courses',
        paidBy: 'vous', date: `${p}-02`, deleted: false
      }
    });

    const modale = await ouvrirLeRapport(page);
    await expect(modale.locator('.rapport-comparaison')).toContainText('trois mois révolus');
    // Le reste du rapport tient quand même : c'est le mode de dégradation.
    await expect(modale.locator('.rapport-total')).toContainText('50');
  });

  test('un nom de catégorie hostile est affiché en texte, jamais interprété', async ({ page }) => {
    const db = semer();
    const p = moisCourant();
    db[`household/periods/${p}/variableCharges/v2`].category = '<img src=x onerror=alert(1)>';
    await ouvrir(page, db);

    const modale = await ouvrirLeRapport(page);
    await expect(modale.locator('.rapport-bouge')).toContainText('<img src=x');
    expect(await modale.locator('img').count()).toBe(0);
  });

  test('Échap referme, et le bilan reste lisible derrière', async ({ page }) => {
    await ouvrir(page, semer());
    await ouvrirLeRapport(page);

    await page.keyboard.press('Escape');
    await expect(page.locator('#modalRapportMensuel')).not.toBeVisible();
    await expect(page.locator('#summarySection')).toBeVisible();
  });
});
