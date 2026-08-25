import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Ce que le panneau répond
 *
 * Il affichait moyenne, minimum, maximum et tendance : quatre chiffres qui
 * répondaient à « quel est le plus gros mois ? » plutôt qu'à « est-ce qu'on
 * s'en sort ? ». Et deux d'entre eux étaient fragiles — la tendance comparait
 * le premier mois au dernier en ignorant tout ce qu'il y a entre, la moyenne
 * se laissait tirer par un mois exceptionnel.
 *
 * Les revenus et les charges détaillées étaient déjà lus par le module, puis
 * jetés : ces mesures ne coûtent aucune lecture supplémentaire.
 */

/** Quatre mois, dont un marqué par une dépense de santé */
const MOIS = {
  '2026-05': { fixe: 620, Courses: 210, Essence: 70, Restaurant: 45 },
  '2026-06': { fixe: 620, Courses: 260, Essence: 85, Restaurant: 90 },
  '2026-07': { fixe: 620, Courses: 215, Essence: 78, Restaurant: 60 },
  '2026-08': { fixe: 620, Courses: 380, Essence: 92, Restaurant: 55, 'Santé': 240 }
};

async function poser(page, mois) {
  await page.evaluate(async (detailParMois) => {
    const { dbUpdate } = await import('/js/db.js');
    const chemins = {};
    for (const [periode, detail] of Object.entries(detailParMois)) {
      chemins[`periods/${periode}/salaries`] = { vous: 2500, conjointe: 1800 };
      chemins[`periods/${periode}/fixedCharges/loyer`] =
        { description: 'Loyer', amount: detail.fixe, category: 'Maison', paidBy: 'vous' };
      let i = 0;
      for (const [categorie, montant] of Object.entries(detail)) {
        if (categorie === 'fixe') continue;
        chemins[`periods/${periode}/variableCharges/v${i++}`] =
          { description: categorie, amount: montant, category: categorie, paidBy: 'vous' };
      }
    }
    await dbUpdate(undefined, chemins);
  }, mois);
}

test.describe('Les quatre mesures', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await page.locator('#salaireVous').fill('2500');
    await page.locator('#salaireConjointe').fill('1800');
    await page.locator('#salaireVous').blur();
    await poser(page, MOIS);
    await page.locator('#trendsToggle').click();
    await page.waitForTimeout(900);
  });

  test('le mois ordinaire est une médiane, pas une moyenne', async ({ page }) => {
    const stats = page.locator('#trendsStats');

    await expect(stats).toContainText('Mois ordinaire');
    // Médiane de 945 · 973 · 1 055 · 1 387 = 1 014. La moyenne dirait 1 090,
    // tirée par le mois exceptionnel.
    await expect(stats).toContainText('1 014,00');
    await expect(stats).toContainText('médiane');
  });

  test('l\'écart se mesure au mois habituel, pas au premier mois', async ({ page }) => {
    // Référence : médiane des trois mois précédents, soit 973. Le dernier
    // vaut 1 387, donc +414. L'ancienne mesure aurait dit 1 387 − 945 = +442,
    // en n'ayant regardé que deux points sur quatre.
    await expect(page.locator('#trendsStats')).toContainText('414,00');
    await expect(page.locator('#trendsStats')).toContainText('ordinaire');
  });

  test('le taux d\'effort rapporte les charges aux revenus', async ({ page }) => {
    // C'est la mesure qui donne un sens au montant : 1 387 € ne dit rien,
    // 32 % des revenus dit tout.
    const stats = page.locator('#trendsStats');

    await expect(stats).toContainText('Taux d\'effort');
    await expect(stats).toContainText('32 %');
    await expect(stats, 'la part du fixe manque').toContainText('de fixe');
  });

  test('le reste à vivre est donné en euros', async ({ page }) => {
    const stats = page.locator('#trendsStats');

    await expect(stats).toContainText('Reste à vivre');
    // 4 300 € de revenus − 1 387 € de charges.
    await expect(stats).toContainText('2 913,00');
    await expect(stats).toContainText('4 300,00');
  });

  test('la piste désigne la catégorie qui a le plus bougé', async ({ page }) => {
    // « Santé : +240 € » désigne quoi regarder ; « +42 % » ne désigne rien.
    const piste = page.locator('.trends-piste');

    await expect(piste).toBeVisible();
    await expect(piste).toContainText('Santé');
    await expect(piste).toContainText('240,00');
    await expect(piste).toContainText('juillet 2026');
  });

  test('minimum et maximum ont cédé la place', async ({ page }) => {
    // Deux cartes pour une information que le graphe montre déjà. Quatre
    // cartes tiennent sur un écran de téléphone ; huit ne se lisent plus.
    const stats = page.locator('#trendsStats');

    await expect(stats).not.toContainText('Minimum');
    await expect(stats).not.toContainText('Maximum');
    expect(await page.locator('#trendsStats .stat-card').count()).toBe(4);
  });
});

test.describe('Quand les salaires manquent', () => {
  test('les deux cartes qui en dépendent le disent', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    // Aucun salaire renseigné : les charges seules ne permettent ni taux
    // d'effort ni reste à vivre. Mieux vaut une carte muette qu'un chiffre
    // calculé sur zéro.
    await page.evaluate(async () => {
      const { dbUpdate } = await import('/js/db.js');
      await dbUpdate(undefined, {
        'periods/2026-07/variableCharges/a': { description: 'Courses', amount: 200, category: 'Courses', paidBy: 'vous' },
        'periods/2026-08/variableCharges/b': { description: 'Courses', amount: 260, category: 'Courses', paidBy: 'vous' }
      });
    });

    await page.locator('#trendsToggle').click();
    await page.waitForTimeout(900);

    const stats = page.locator('#trendsStats');
    await expect(stats).toContainText('Taux d\'effort');
    await expect(stats).toContainText('non renseignés');
  });
});
