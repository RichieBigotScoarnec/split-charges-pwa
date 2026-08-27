import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * La dépense perso, du geste jusqu'au solde
 *
 * Les tests unitaires prouvent que `computeSummary` ignore une charge marquée
 * solo. Ils ne prouvent pas qu'on puisse en saisir une, ni que le bilan affiché
 * soit celui qu'ils calculent — c'est le trajet complet qui compte, et c'est
 * lui qu'un défaut d'interface casse sans qu'aucun test pur ne bronche.
 *
 * Trois choses à établir ici :
 *
 * 1. Une dépense perso s'écrit avec `perimetre: 'solo'` en base, depuis les
 *    deux chemins de saisie — le formulaire complet et la saisie rapide.
 * 2. Le solde du couple ne bouge pas d'un centime, alors que la liste, elle,
 *    l'affiche.
 * 3. L'interface interdit d'elle-même l'état que les règles refuseraient :
 *    une dépense perso ne peut pas être « partagée ».
 */

/** Renseigne les deux salaires : sans eux, le prorata ne rend aucun bilan */
async function poserLesSalaires(page) {
  await page.locator('#salaireVous').fill('2000');
  await page.locator('#salaireVous').blur();
  await page.locator('#salaireConjointe').fill('3000');
  await page.locator('#salaireConjointe').blur();
  await page.waitForTimeout(500);
}

/** Le solde net affiché, en nombre */
async function soldeAffiche(page) {
  const texte = await page.locator('#summarySection').innerText();
  const trouve = texte.match(/(\d[\d\s]*[,.]\d{2})\s*€/);
  return trouve ? parseFloat(trouve[1].replace(/\s/g, '').replace(',', '.')) : null;
}

test.describe('La dépense perso', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await poserLesSalaires(page);
  });

  test('le formulaire complet l\'écrit avec son périmètre', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Coiffeur');
    await page.locator('#variableChargeAmount').fill('45');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(500);

    const charges = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      const periode = window.__periodeCourante || document.getElementById('periodSelect')?.value;
      return Object.values(await dbGet(`periods/${periode}/variableCharges`) || {});
    });

    expect(charges).toHaveLength(1);
    expect(charges[0].perimetre).toBe('solo');
    expect(charges[0].paidBy).toBe('vous');
  });

  test('cocher « perso » ferme « Partagé » et la répartition spéciale', async ({ page }) => {
    // L'interface refuse d'elle-même l'état que les règles Firebase
    // refuseraient : une dépense perso appartient à qui l'a payée. Sans ce
    // couplage, la saisie partirait, serait rejetée côté serveur, et — hors
    // ligne — irait grossir la file d'attente pour échouer plus tard, loin du
    // geste qui l'a produite.
    await page.locator('#addVariableChargeBtn').click();

    const partage = page.locator('#variableChargePaidBy option[value="partage"]');
    await expect(partage).toBeEnabled();

    await page.locator('#variableChargePerso + .toggle-slider').click();
    await expect(partage).toBeDisabled();
    await expect(page.locator('#variableChargeSplitToggle')).toBeDisabled();

    // Et la porte se rouvre quand on décoche.
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await expect(partage).toBeEnabled();
    await expect(page.locator('#variableChargeSplitToggle')).toBeEnabled();
  });

  test('« Partagé » redevient choisissable à l\'ouverture suivante', async ({ page }) => {
    // `form.reset()` décoche la case, mais ne rouvre pas ce que la bascule
    // avait fermé : sans rappel explicite, une seule saisie perso rendrait
    // toutes les suivantes impossibles à partager, jusqu'au rechargement.
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#modalAddVariableCharge')).toBeHidden();

    await page.locator('#addVariableChargeBtn').click();
    await expect(page.locator('#variableChargePerso')).not.toBeChecked();
    await expect(page.locator('#variableChargePaidBy option[value="partage"]')).toBeEnabled();
  });

  test('le solde ne bouge pas, mais la liste montre la dépense', async ({ page }) => {
    // Une charge commune d'abord, pour que le solde ait une valeur à ne pas
    // changer. Un solde resté à zéro passerait le test sans rien prouver.
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Courses');
    await page.locator('#variableChargeAmount').fill('300');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(500);

    const soldeAvant = await soldeAffiche(page);
    expect(soldeAvant).not.toBeNull();
    expect(soldeAvant).toBeGreaterThan(0);

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Coiffeur');
    await page.locator('#variableChargeAmount').fill('45');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(600);

    expect(await soldeAffiche(page)).toBe(soldeAvant);

    // Elle existe pourtant bien à l'écran, et se distingue.
    await expect(page.locator('#variableChargesList')).toContainText('Coiffeur');
    await expect(page.locator('.charge-perimetre-tag')).toHaveText('perso');
  });

  test('le pied de liste annonce les deux totaux plutôt qu\'un seul', async ({ page }) => {
    // Un total unique contredirait le bilan affiché juste au-dessus : 345 €
    // sous une liste que le bilan chiffre à 300 €.
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Courses');
    await page.locator('#variableChargeAmount').fill('300');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(400);

    // Sans dépense perso, la phrase est celle d'avant.
    await expect(page.locator('#variableChargesTotal')).not.toContainText('perso');

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Coiffeur');
    await page.locator('#variableChargeAmount').fill('45');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(600);

    const total = await page.locator('#variableChargesTotal').innerText();
    expect(total).toContain('perso');
    expect(total.replace(/\s/g, '')).toContain('300,00');
    expect(total.replace(/\s/g, '')).toContain('45,00');
  });

  test('rouvrir une dépense perso la retrouve cochée', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Coiffeur');
    await page.locator('#variableChargeAmount').fill('45');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(600);

    await page.locator('#variableChargesList [data-action="editVariableCharge"]').first().click();
    await page.waitForTimeout(300);

    await expect(page.locator('#variableChargePerso')).toBeChecked();
    // Et le couplage a suivi : « Partagé » reste fermé.
    await expect(page.locator('#variableChargePaidBy option[value="partage"]')).toBeDisabled();
  });

  test('la saisie rapide l\'écrit aussi, par le segment « Répartition »', async ({ page }) => {
    // « Perso » y est la troisième réponse à « comment ça se partage ? » — pas
    // du tout — plutôt qu'un cinquième segment dans la phrase.
    await page.locator('.fab').click();
    await page.locator('#quickAddAmount').fill('22');
    await page.locator('.quick-add-segment[data-panneau="quickAddPanneauCategorie"]').click();
    await page.locator('.category-btn').first().click();
    await page.waitForTimeout(200);

    await page.locator('#quickAddPhrase button', { hasText: /prorata|50-50|Perso/i }).first().click();
    await page.locator('#quickSplitPerso').click();
    await page.waitForTimeout(200);

    await expect(page.locator('#quickAddPhrase')).toContainText('Perso');

    await page.locator('#btnQuickAdd').click();
    await page.waitForTimeout(700);

    const charges = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      const periode = document.getElementById('periodSelect')?.value;
      return Object.values(await dbGet(`periods/${periode}/variableCharges`) || {});
    });

    expect(charges).toHaveLength(1);
    expect(charges[0].perimetre).toBe('solo');
    // Le payeur a basculé de lui-même sur une personne : « partage » aurait
    // été refusé par les règles.
    expect(['vous', 'conjointe']).toContain(charges[0].paidBy);
  });
});
