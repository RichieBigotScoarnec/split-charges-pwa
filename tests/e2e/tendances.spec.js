import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Le graphe de tendances, éprouvé sur un écran de téléphone
 *
 * Deux défauts s'y superposaient. La hauteur du canevas était déduite du
 * rapport de ses attributs — 600 × 240 — si bien que sur une carte large de
 * 312 px il ne mesurait que 125 px : les marges du tracé, 40 en haut et 60 en
 * bas, en mangeaient 100, et il restait **25 px** pour six graduations, qui se
 * chevauchaient au point d'être illisibles.
 *
 * Et avec un seul mois enregistré, le panneau dessinait un graphe d'un point
 * et quatre cartes disant la même chose, dont une « tendance » de 0,00 € ornée
 * d'une flèche montante et de la couleur d'une hausse.
 */

const PIXEL = { width: 412, height: 915 };

async function ouvrirAvecSalaires({ page }) {
  await page.setViewportSize(PIXEL);
  await setupFirebaseMock(page);
  await waitForApp(page);

  // 412 px : sous le point de rupture, l'application montre un panneau à la
  // fois. Les salaires sont dans les réglages, le graphe dans le bilan — on
  // fait donc l'aller-retour que la personne ferait.
  await allerAuPanneau(page, 'panneauReglages');
  await page.locator('#salaireVous').fill('2500');
  await page.locator('#salaireConjointe').fill('1800');
  await page.locator('#salaireVous').blur();
  await page.waitForTimeout(200);
  await allerAuPanneau(page, 'panneauBilan');
}

/** Pose des charges sur plusieurs mois, directement en base */
async function poserDesMois(page, mois) {
  await page.evaluate(async (montants) => {
    const { dbUpdate } = await import('/js/db.js');
    const chemins = {};
    for (const [periode, montant] of Object.entries(montants)) {
      chemins[`periods/${periode}/variableCharges/c1`] =
        { description: 'Courses', amount: montant * 0.4, category: 'Courses', paidBy: 'vous' };
      chemins[`periods/${periode}/fixedCharges/f1`] =
        { description: 'Loyer', amount: montant * 0.6, category: 'Maison', paidBy: 'vous' };
    }
    await dbUpdate(undefined, chemins);
    // Écrire en base ne suffit pas : l'application ne relit pas d'elle-même.
    // Après toute écriture elle rejoue `loadPeriodData`, qui recharge le mois
    // et rend le bilan — c'est ce geste qui fait exister l'historique pour
    // l'écran. Sans lui, le panneau des tendances reste masqué, à raison :
    // rien de ce qui a été écrit ne lui a été présenté.
    await window.changePeriod(document.getElementById('periodSelect').value);
  }, mois);
}

test.describe('Le canevas', () => {
  test.beforeEach(ouvrirAvecSalaires);

  test('garde de la place pour ses graduations', async ({ page }) => {
    await poserDesMois(page, { '2026-06': 400, '2026-07': 500, '2026-08': 450 });
    await page.locator('#trendsToggle').click();
    await page.waitForTimeout(800);

    const mesures = await page.evaluate(() => {
      const c = document.getElementById('trendsCanvas');
      return {
        hauteurAffichee: c.clientHeight,
        etirement: +(c.clientWidth * devicePixelRatio / c.width).toFixed(2)
      };
    });

    // 125 px avant correction, dont 100 de marges.
    expect(mesures.hauteurAffichee, 'le graphe est de nouveau écrasé')
      .toBeGreaterThanOrEqual(240);
    // Et il reste net : la mémoire suit la finesse de l'écran.
    expect(mesures.etirement).toBeCloseTo(1, 1);
  });

  test('ne déborde pas de son cadre', async ({ page }) => {
    await poserDesMois(page, { '2026-06': 400, '2026-07': 500, '2026-08': 450 });
    await page.locator('#trendsToggle').click();
    await page.waitForTimeout(800);

    const deborde = await page.evaluate(() => {
      const c = document.getElementById('trendsCanvas');
      const carte = c.closest('.card') || document.body;
      return c.getBoundingClientRect().right > carte.getBoundingClientRect().right + 1;
    });

    expect(deborde).toBe(false);
  });
});

test.describe('Avec un seul mois', () => {
  test.beforeEach(ouvrirAvecSalaires);

  test('le panneau le dit, au lieu de simuler une analyse', async ({ page }) => {
    await poserDesMois(page, { '2026-08': 459.97 });
    await page.locator('#trendsToggle').click();
    await page.waitForTimeout(800);

    // Un graphe à une seule valeur n'apprend rien.
    await expect(page.locator('#trendsCanvas')).toBeHidden();
    await expect(page.locator('#trendsStats')).toContainText('Un seul mois');
    // Le mois est nommé en toutes lettres, pas en clé de stockage.
    await expect(page.locator('#trendsStats')).toContainText('août 2026');
    await expect(page.locator('#trendsStats')).not.toContainText('2026-08');
  });
});

test.describe('Avec plusieurs mois', () => {
  test.beforeEach(ouvrirAvecSalaires);

  test('les mois se lisent, et les montants sont en français', async ({ page }) => {
    await poserDesMois(page, { '2026-06': 400, '2026-07': 500, '2026-08': 450 });
    await page.locator('#trendsToggle').click();
    await page.waitForTimeout(800);

    await expect(page.locator('#trendsCanvas')).toBeVisible();

    const stats = page.locator('#trendsStats');
    // Le mois le plus récent nomme la carte d'écart.
    await expect(stats).toContainText('août 2026');
    await expect(stats, 'une clé de stockage s\'affiche telle quelle').not.toContainText('2026-08');
    // `toFixed(1)` rendait « 12.5% », au milieu d'un écran en « 1 259,97 € ».
    await expect(stats).toContainText(' %');
  });

  test('ouvrir le panneau n\'annonce rien', async ({ page }) => {
    // Deux notifications paraissaient pour un calcul local de deux cents
    // millisecondes, et recouvraient la moitié du graphe qu'elles annonçaient.
    await poserDesMois(page, { '2026-07': 500, '2026-08': 450 });

    await page.locator('#trendsToggle').click();
    await page.waitForTimeout(900);

    const messages = await page.locator('#toast-container .toast').allInnerTexts();
    expect(messages.join(' '), 'le dépliement annonce encore quelque chose')
      .not.toMatch(/tendances/i);
  });
});
