import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Ce que les charges fixes coûtent à l'année
 *
 * Un loyer se lit par mois : c'est ainsi qu'il se paie. Un abonnement, non —
 * 9,99 € ne se remarquent jamais, 119,88 € se discutent. L'application
 * n'affichait que le mois.
 *
 * `tests/utils/cout-annuel.test.js` verrouille les calculs. Ici, on vérifie
 * que la ligne atteint l'écran, et qu'elle se tait quand elle n'a rien à dire.
 */

function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Le même mois, un an plus tôt */
function anDernier(p) {
  return `${Number(p.slice(0, 4)) - 1}-${p.slice(5, 7)}`;
}

function socle() {
  const p = moisCourant();
  return {
    'household/salaries': { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/fixedCharges/f1`]: {
      description: 'Loyer', amount: 950, category: 'Maison',
      paidBy: 'vous', date: `${p}-05`, deleted: false
    },
    [`household/periods/${p}/fixedCharges/f2`]: {
      description: 'Internet', amount: 39.99, category: 'Maison',
      paidBy: 'conjointe', date: `${p}-03`, deleted: false
    }
  };
}

async function ouvrir(page, db) {
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(db)};`);
  await waitForApp(page);
  await page.waitForTimeout(1500);
}

test.describe('Le coût annuel des charges fixes', () => {
  test('la ligne annonce l\'année sous le total mensuel', async ({ page }) => {
    await ouvrir(page, socle());

    const ligne = page.locator('#fixedChargesAnnuel');
    await expect(ligne).toBeVisible();
    // 989,99 × 12 = 11 879,88
    await expect(ligne).toContainText('11');
    await expect(ligne).toContainText('879');
    await expect(ligne).toContainText('sur une année');
  });

  test('elle nomme ce qui a augmenté depuis l\'an dernier', async ({ page }) => {
    const p = moisCourant();
    const avant = anDernier(p);
    const db = socle();

    db[`household/periods/${avant}/fixedCharges/g1`] = {
      description: 'Loyer', amount: 920, category: 'Maison',
      paidBy: 'vous', date: `${avant}-05`, deleted: false
    };
    db[`household/periods/${avant}/fixedCharges/g2`] = {
      description: 'Internet', amount: 29.99, category: 'Maison',
      paidBy: 'conjointe', date: `${avant}-03`, deleted: false
    };

    await ouvrir(page, db);

    const ligne = page.locator('#fixedChargesAnnuel');
    await expect(ligne).toContainText('augmenté depuis l\'an dernier');
    // 30 + 10 = 40 € par mois
    await expect(ligne).toContainText('40');
    await expect(ligne).toContainText('Loyer');
    await expect(ligne).toContainText('Internet');
  });

  test('sans le mois d\'il y a un an, elle ne parle que de l\'année', async ({ page }) => {
    // On ne compare pas à ce qu'on n'a pas.
    await ouvrir(page, socle());

    const ligne = page.locator('#fixedChargesAnnuel');
    await expect(ligne).toContainText('sur une année');
    await expect(ligne).not.toContainText('augmenté');
  });

  test('sans charge fixe, la ligne se tait', async ({ page }) => {
    const p = moisCourant();
    await ouvrir(page, {
      'household/salaries': { vous: 2500, conjointe: 1800 },
      [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 }
    });

    await expect(page.locator('#fixedChargesAnnuel')).toBeHidden();
  });

  test('une charge ponctuelle n\'est pas payée douze fois', async ({ page }) => {
    // `recurring: false` est la bascule « Récurrente » décochée, et la liste
    // étiquette ces lignes « ponctuelle » : les multiplier par douze deux
    // lignes plus bas contredirait l'étiquette affichée juste au-dessus.
    const p = moisCourant();
    const db = socle();
    db[`household/periods/${p}/fixedCharges/f3`] = {
      description: 'Taxe foncière', amount: 1200, category: 'Maison',
      paidBy: 'vous', date: `${p}-15`, deleted: false, recurring: false
    };

    await ouvrir(page, db);

    const ligne = page.locator('#fixedChargesAnnuel');
    // 989,99 × 12 + 1 200 = 13 079,88. Le défaut donnait 2 189,99 × 12 = 26 279,88.
    await expect(ligne).toContainText('13');
    await expect(ligne).toContainText('079');
    await expect(ligne).toContainText('ponctuelle comptée une seule fois');
    await expect(ligne).not.toContainText('26');
  });

  test('supprimer une charge retire la hausse qui la nommait', async ({ page }) => {
    // `haussesChargesFixes` est calculé au chargement du mois. Réafficher la
    // liste ne repasse pas par là : le pied de liste continuait de nommer une
    // charge que la liste ne montrait plus, avec son écart dans le total.
    const p = moisCourant();
    const avant = anDernier(p);
    const db = socle();

    db[`household/periods/${avant}/fixedCharges/g1`] = {
      description: 'Loyer', amount: 920, category: 'Maison',
      paidBy: 'vous', date: `${avant}-05`, deleted: false
    };
    db[`household/periods/${avant}/fixedCharges/g2`] = {
      description: 'Internet', amount: 29.99, category: 'Maison',
      paidBy: 'conjointe', date: `${avant}-03`, deleted: false
    };

    await ouvrir(page, db);

    const ligne = page.locator('#fixedChargesAnnuel');
    await expect(ligne).toContainText('Loyer');
    await expect(ligne).toContainText('Internet');

    // On supprime le loyer, sans recharger la page.
    await page.locator('[data-action="deleteFixedCharge"][data-arg="f1"]').click();
    await page.locator('#modalConfirmOk').click();
    await page.waitForTimeout(900);

    await expect(ligne).not.toContainText('Loyer');
    // L'écart ne compte plus que les 10 € d'Internet.
    await expect(ligne).toContainText('Internet');
    await expect(ligne).not.toContainText('40');
  });
});
