import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * L'enveloppe à allocation, du choix de nature jusqu'à la jauge
 *
 * Les tests purs prouvent que l'arithmétique est juste. Ils ne prouvent pas
 * qu'on puisse choisir une nature, ni que la jauge affichée soit celle qu'ils
 * calculent — c'est le trajet complet qui compte.
 *
 * Trois choses à établir :
 *
 * 1. La nature se choisit et s'écrit en base, et le formulaire s'accorde à elle
 *    — le même champ « budget » veut dire « par mois » ou « en tout ».
 * 2. Une mensuelle ne compte que son mois, une cagnotte compte tout. C'est la
 *    divergence qui donne son sens à chacune.
 * 3. Une enveloppe se reclasse : créée sans rang, elle doit pouvoir en recevoir
 *    un, sans perdre ce que le formulaire ne montre pas.
 */

/** Ouvre l'écran de gestion des enveloppes */
async function ouvrirGestion(page) {
  await page.evaluate(() => window.showManageEnvelopesModal());
  await expect(page.locator('#envelopeNewLabel')).toBeVisible();
}

/** Crée une enveloppe et referme l'écran */
async function creer(page, { nom, nature, budget, rang, report }) {
  await page.locator('#envelopeNewLabel').fill(nom);
  if (nature) await page.locator('#envelopeNewNature').selectOption(nature);
  if (report) await page.locator('#envelopeNewReport').selectOption('oui');
  if (budget) await page.locator('#envelopeNewBudget').fill(String(budget));
  if (rang) await page.locator('#envelopeNewRang').selectOption(rang);
  await page.locator('#envelopeAddBtn').click();
  await page.waitForTimeout(400);
}

/** Les enveloppes telles qu'elles sont écrites en base */
async function enBase(page) {
  return page.evaluate(async () => (await (await import('/js/db.js')).dbGet('envelopes')) || []);
}

test.describe('L\'enveloppe à allocation', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await ouvrirGestion(page);
  });

  test('la nature par défaut est la cagnotte — ce que faisait l\'enveloppe avant', async ({ page }) => {
    // Le contrat qui protège toutes celles déjà en base : ne rien choisir doit
    // donner exactement le comportement d'hier.
    await creer(page, { nom: 'Travaux', budget: 1200 });

    const [enveloppe] = await enBase(page);
    expect(enveloppe.nature).toBe('cagnotte');
    expect(enveloppe.report).toBe(false);
    expect(enveloppe.perimetre).toBe('commun');
  });

  test('choisir « mensuelle » l\'écrit, avec son report', async ({ page }) => {
    await creer(page, { nom: 'Courses', nature: 'mensuelle', budget: 600, report: true, rang: 'mensuel' });

    const [enveloppe] = await enBase(page);
    expect(enveloppe.nature).toBe('mensuelle');
    expect(enveloppe.report).toBe(true);
    expect(enveloppe.rang).toBe('mensuel');
    expect(enveloppe.budget).toBe(600);
  });

  test('le libellé du budget suit la nature, et le report n\'apparaît qu\'avec elle', async ({ page }) => {
    // Le même champ ne veut pas dire la même chose des deux côtés : « 600 »
    // signifie « chaque mois » sur une mensuelle et « en tout » sur une
    // cagnotte. Laisser le libellé fixe rendrait l'un des deux faux.
    const etiquette = page.locator('#envelopeNewBudgetLabel');
    const champReport = page.locator('#envelopeNewReportChamp');

    await expect(etiquette).toContainText('Objectif');
    await expect(champReport).toBeHidden();

    await page.locator('#envelopeNewNature').selectOption('mensuelle');
    await expect(etiquette).toContainText('par mois');
    await expect(champReport).toBeVisible();

    await page.locator('#envelopeNewNature').selectOption('cagnotte');
    await expect(etiquette).toContainText('Objectif');
    await expect(champReport).toBeHidden();
  });

  test('une enveloppe perso désigne son propriétaire', async ({ page }) => {
    // Périmètre et propriétaire sortent du même select : deux champs séparés
    // permettraient « solo » sans propriétaire, que les règles refusent.
    await page.locator('#envelopeNewLabel').fill('Sport');
    await page.locator('#envelopeNewPerimetre').selectOption('vous');
    await page.locator('#envelopeAddBtn').click();
    await page.waitForTimeout(400);

    const [enveloppe] = await enBase(page);
    expect(enveloppe.perimetre).toBe('solo');
    expect(enveloppe.proprietaire).toBe('vous');
  });

  test('la liste range par rang, et nomme le groupe', async ({ page }) => {
    await creer(page, { nom: 'Taxe Foncière', rang: 'provision' });
    await ouvrirGestion(page);
    await creer(page, { nom: 'Courses', nature: 'mensuelle', rang: 'mensuel' });
    await ouvrirGestion(page);
    await creer(page, { nom: 'Sans rang' });

    // `innerText` rend le texte tel qu'il s'affiche, et la feuille de style le
    // met en capitales : comparer en minuscules porte sur le contenu plutôt que
    // sur sa présentation, qui peut changer sans que le rangement change.
    const titres = (await page.locator('.envelope-rang-titre').allInnerTexts())
      .map(t => t.toLowerCase());
    const joints = titres.join(' | ');

    expect(joints).toContain('provisions');
    expect(joints).toContain('mensuel');
    expect(joints).toContain('à classer');

    // L'ordre n'est pas alphabétique : c'est celui dans lequel l'argent quitte
    // le compte. Les provisions partent avant le budget du mois.
    const rangProvision = titres.findIndex(t => t.includes('provisions'));
    const rangMensuel = titres.findIndex(t => t.includes('mensuel'));
    const rangAClasser = titres.findIndex(t => t.includes('à classer'));
    expect(rangProvision).toBeLessThan(rangMensuel);
    expect(rangMensuel).toBeLessThan(rangAClasser);
  });

  test('la ligne dit la nature d\'une mensuelle, et rien sur une cagnotte', async ({ page }) => {
    await creer(page, { nom: 'Courses', nature: 'mensuelle', budget: 600 });
    await ouvrirGestion(page);
    await creer(page, { nom: 'Travaux', budget: 1200 });

    const liste = page.locator('.manage-lists-content');
    await expect(liste.locator('.envelope-nature')).toHaveCount(1);
    await expect(liste.locator('.envelope-nature')).toHaveText('mensuelle');
  });

  test('une enveloppe se reclasse sans perdre ce que le formulaire ne montre pas', async ({ page }) => {
    // Le risque exact : l'édition reconstruit l'objet. Si elle ne repartait pas
    // de l'existant, changer le rang effacerait le périmètre en silence — une
    // enveloppe perso redevenue commune sans que rien ne le dise.
    await page.locator('#envelopeNewLabel').fill('Tatouage');
    await page.locator('#envelopeNewPerimetre').selectOption('vous');
    await page.locator('#envelopeAddBtn').click();
    await page.waitForTimeout(400);

    await page.locator('.envelope-editer').first().click();
    await expect(page.locator('#envelopeEditRang')).toBeVisible();
    await page.locator('#envelopeEditRang').selectOption('epargne');
    await page.locator('#envelopeEditNature').selectOption('mensuelle');
    await page.locator('#envelopeEditValider').click();
    await page.waitForTimeout(500);

    const [enveloppe] = await enBase(page);
    expect(enveloppe.rang).toBe('epargne');
    expect(enveloppe.nature).toBe('mensuelle');
    // Ce que le formulaire ne montrait pas a survécu.
    expect(enveloppe.perimetre).toBe('solo');
    expect(enveloppe.proprietaire).toBe('vous');
    expect(enveloppe.label).toBe('Tatouage');
  });

  test('la jauge dit ce qu\'il reste, pas ce qui a été dépensé', async ({ page }) => {
    await creer(page, { nom: 'Courses', nature: 'mensuelle', budget: 600 });
    await page.locator('#envelopeManageClose').click();
    await page.waitForTimeout(300);

    // Une dépense rattachée, par le formulaire complet.
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Supermarché');
    await page.locator('#variableChargeAmount').fill('240');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    // L'enveloppe est repliée avec le lieu : elle ne concerne qu'une charge sur
    // dix, et les deux occupaient le tiers du formulaire. Le test fait donc ce
    // que fait la personne — il déplie.
    await page.locator('#modalAddVariableCharge .form-repli > summary').click();
    await page.locator('#variableChargeEnvelope').selectOption({ index: 1 });
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(500);

    await ouvrirGestion(page);
    await page.locator('.envelope-ouvrir').first().click();
    await page.waitForTimeout(600);

    const legende = await page.locator('.enveloppe-jauge-legende').innerText();
    // 600 alloués, 240 dépensés → 360 restants. C'est « restants » qui doit
    // s'afficher, et la barre porte la même grandeur.
    expect(legende.replace(/\s/g, '')).toContain('360,00');
    expect(legende).toContain('restants');

    const largeur = await page.locator('.enveloppe-jauge-barre')
      .evaluate(el => el.style.width);
    expect(largeur, 'la barre montre ce qui reste, soit 60 %').toBe('60%');
  });
});
