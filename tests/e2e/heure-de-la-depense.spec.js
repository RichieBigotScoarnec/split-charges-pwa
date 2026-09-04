import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * L'heure de la dépense
 *
 * La date répondait à « quel jour », jamais à « à quel moment ». Deux courses
 * du même samedi se lisaient à l'identique, et rien ne disait laquelle était
 * celle du marché du matin.
 *
 * L'heure vit dans son propre champ, en HH:MM local. Elle n'est jamais déduite
 * de `timestamp` — l'instant d'écriture en base : une course de samedi matin
 * saisie le lundi soir en tirerait « 21:14 », une heure parfaitement crédible
 * et fausse.
 *
 * Le calcul est éprouvé par `tests/utils/date.test.js` et `tri.test.js` ; ces
 * contrôles portent sur le parcours réel, du champ jusqu'à la ligne.
 */
/**
 * Un instant figé, et pourquoi celui-là
 *
 * Ces contrôles portent sur l'heure : ils ne peuvent pas dépendre de l'heure
 * qu'il est. Le champ est prérempli par `heureDuJour()` à l'ouverture de la
 * modale (instant T1) et relu par le contrôle juste après (instant T2) — une
 * minute qui bascule entre les deux suffit à faire tomber le contrôle sur un
 * code parfaitement sain. C'est arrivé en CI le 2026-09-04 : 563 passés,
 * celui-ci seul en échec, et la publication sautée avec.
 *
 * Midi UTC, le 12 : quel que soit le fuseau du runner, l'instant reste le même
 * JOUR et le même MOIS — ce qui ferme du même geste les trois autres pièges de
 * cette famille que ce dépôt a déjà payés : minuit, le dernier jour du mois, et
 * le passage d'une année.
 */
const LE_12_AOUT = new Date('2026-08-12T12:00:00.000Z');

test.describe('L\'heure, de la saisie rapide à la liste', () => {

  test.beforeEach(async ({ page }) => {
    // Avant le chargement : l'application lit l'horloge dès son initialisation.
    await page.clock.setFixedTime(LE_12_AOUT);
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  /** Ouvre la saisie rapide sur son panneau de date */
  async function ouvrirLaDate(page) {
    await page.evaluate(() => window.showQuickAddModal());
    await expect(page.locator('#modalQuickAdd')).toBeVisible();
    await page.locator('.quick-add-segment[data-panneau="quickAddPanneauDate"]').click();
  }

  /**
   * Saisit une dépense entière, à l'heure demandée
   *
   * La catégorie est choisie : sans elle, la soumission est refusée et rouvre
   * son panneau — ce qui laisserait ces contrôles échouer loin de leur cause.
   *
   * @param {import('@playwright/test').Page} page
   * @param {{description: string, heure: string, montant?: string}} depense
   */
  async function saisir(page, { description, heure, montant = '12,50' }) {
    await ouvrirLaDate(page);
    await page.locator('#quickAddHeure').fill(heure);

    await page.locator('.quick-add-segment[data-panneau="quickAddPanneauCategorie"]').click();
    await page.locator('.category-btn[data-category-id]').first().click();

    await page.locator('#quickAddAmount').fill(montant);
    await page.locator('#quickAddDescription').fill(description);
    await page.locator('#btnQuickAdd').click();
    await expect(page.locator('#modalQuickAdd')).toBeHidden();
  }

  test('l\'horloge de la page est bien celle qu\'on a figée', async ({ page }) => {
    // Le témoin de CÂBLAGE du correctif, sans lequel il pourrait être inerte.
    //
    // `setFixedTime` posé trop tard, ou sur une page déjà chargée, ne prend
    // pas — et le contrôle suivant repasserait alors au vert par chance, en
    // gardant la course qu'il est censé fermer. Un correctif qu'on ne peut pas
    // distinguer de son absence n'en est pas un.
    expect(await page.evaluate(() => Date.now())).toBe(LE_12_AOUT.getTime());
  });

  test('le champ s\'ouvre prérempli à l\'heure de l\'appareil', async ({ page }) => {
    await ouvrirLaDate(page);

    const attendue = await page.evaluate(() => {
      const m = new Date();
      return `${String(m.getHours()).padStart(2, '0')}:${String(m.getMinutes()).padStart(2, '0')}`;
    });

    await expect(page.locator('#quickAddHeure')).toHaveValue(attendue);
  });

  test('la phrase annonce l\'heure qui sera enregistrée', async ({ page }) => {
    // Sans cela elle s'inscrirait sans que personne ne l'ait vue passer.
    await ouvrirLaDate(page);
    await page.locator('#quickAddHeure').fill('08:30');

    await expect(page.locator('#quickAddPhrase')).toContainText("Aujourd'hui à 08:30");
  });

  test('l\'heure saisie se retrouve sur la ligne de la dépense', async ({ page }) => {
    await saisir(page, { description: 'Marché', heure: '08:30' });

    const ligne = page.locator('.charge-item', { hasText: 'Marché' });
    await expect(ligne.locator('.charge-date')).toContainText('à 08:30');
  });

  test('un champ vidé n\'inscrit aucune heure', async ({ page }) => {
    // Une dépense qu'on ne sait pas situer dans la journée vaut mieux sans
    // heure qu'avec une heure inventée.
    await saisir(page, { description: 'Sans heure', heure: '' });

    const ligne = page.locator('.charge-item', { hasText: 'Sans heure' });
    await expect(ligne.locator('.charge-date')).toBeVisible();
    await expect(ligne.locator('.charge-date')).not.toContainText('à');
  });

  test('deux dépenses du même jour se rangent par leur heure', async ({ page }) => {
    // C'est le défaut d'origine : elles sortaient dans l'ordre de saisie, le
    // marché du matin après le plein du soir si on l'avait régularisé ensuite.
    await saisir(page, { description: 'Plein', heure: '19:05' });
    await saisir(page, { description: 'Marché', heure: '08:30' });

    const libelles = page.locator('#variableChargesList .charge-description');
    await expect(libelles.first()).toContainText('Plein');
    await expect(libelles.nth(1)).toContainText('Marché');
  });

  test('l\'heure se corrige au formulaire complet', async ({ page }) => {
    await saisir(page, { description: 'Marché', heure: '08:30' });

    const ligne = page.locator('.charge-item', { hasText: 'Marché' });
    await ligne.locator('[data-action="editVariableCharge"]').click();

    // Le formulaire rouvre sur l'heure enregistrée, non sur celle du moment.
    await expect(page.locator('#variableChargeHeure')).toHaveValue('08:30');

    await page.locator('#variableChargeHeure').fill('09:15');
    await page.locator('#saveVariableCharge').click();

    await expect(ligne.locator('.charge-date')).toContainText('à 09:15');
  });

  test('l\'heure se cherche', async ({ page }) => {
    await saisir(page, { description: 'Marché', heure: '08:30' });

    await page.locator('#searchInput').fill('08:30');

    // La recherche filtre la liste et annonce le compte : « 08:30 » suffit à
    // retrouver la dépense sans avoir à retrouver le jour qui va avec.
    await expect(page.locator('#searchResultsInfo')).toContainText('1 résultat');
    await expect(page.locator('.charge-item', { hasText: 'Marché' })).toBeVisible();
  });
});
