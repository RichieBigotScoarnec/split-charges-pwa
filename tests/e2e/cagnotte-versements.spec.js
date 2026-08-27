import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Alimenter une cagnotte, du versement jusqu'à la jauge
 *
 * Quatre choses à établir, et la première est la plus importante :
 *
 * 1. **Un versement ne bouge pas le solde du couple.** C'est la règle
 *    fondatrice de l'enveloppe, et l'endroit où elle est le plus tentante à
 *    enfreindre : mettre 400 € dans « Travaux » *ressemble* à une dépense.
 *    Ce n'en est pas une — c'est déplacer son propre argent dans une poche
 *    étiquetée. Compter le versement ferait payer deux fois le même argent :
 *    une fois en entrant dans le pot, une seconde en sortant comme charge.
 * 2. Le pot dit ce qu'il contient — `versé − dépensé` — et non ce qu'il reste
 *    d'un objectif.
 * 3. La jauge **monte** vers l'objectif là où celle d'un budget descend.
 * 4. Une cagnotte sans versement garde la lecture d'avant : c'est le cas de
 *    toutes celles déjà en base.
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

/** Crée une cagnotte et referme l'écran de gestion */
async function creerCagnotte(page, nom, objectif) {
  await page.evaluate(() => window.showManageEnvelopesModal());
  await page.locator('#envelopeNewLabel').fill(nom);
  if (objectif) await page.locator('#envelopeNewBudget').fill(String(objectif));
  await page.locator('#envelopeAddBtn').click();
  await page.waitForTimeout(400);
}

/** Ouvre le détail de la première enveloppe */
async function ouvrirLeDetail(page) {
  await page.evaluate(() => window.showManageEnvelopesModal());
  await page.locator('.envelope-ouvrir').first().click();
  await page.waitForTimeout(600);
}

/** Verse un montant dans le pot ouvert */
async function verser(page, montant, auteur = 'vous') {
  await page.locator('#versementMontant').fill(String(montant));
  await page.locator('#versementAuteur').selectOption(auteur);
  await page.locator('#versementAjouter').click();
  await page.waitForTimeout(700);
}

test.describe('Alimenter une cagnotte', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await poserLesSalaires(page);
  });

  test('un versement ne bouge pas le solde du couple', async ({ page }) => {
    // Une charge commune d'abord, pour que le solde ait une valeur à ne pas
    // changer : un solde resté à zéro passerait le test sans rien prouver.
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

    await creerCagnotte(page, 'Travaux', 1200);
    await ouvrirLeDetail(page);
    await verser(page, 400);
    await page.locator('#vueEnveloppeFermer').click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    expect(await soldeAffiche(page), '400 € versés ont déplacé le solde').toBe(soldeAvant);
  });

  test('le versement s\'écrit avec son auteur, hors des charges', async ({ page }) => {
    await creerCagnotte(page, 'Travaux', 1200);
    await ouvrirLeDetail(page);
    await verser(page, 400, 'conjointe');

    const { versements, charges } = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      const periode = document.getElementById('periodSelect')?.value;
      return {
        versements: await dbGet('versements') || {},
        charges: await dbGet(`periods/${periode}/variableCharges`) || {}
      };
    });

    const pot = Object.values(versements)[0];
    const verse = Object.values(pot)[0];
    expect(verse.montant).toBe(400);
    expect(verse.auteur).toBe('conjointe');

    // Et surtout : rien n'a été écrit du côté des charges. Un versement rangé
    // là entrerait dans le bilan sans qu'aucun écran ne le distingue.
    expect(Object.keys(charges)).toHaveLength(0);
  });

  test('le pot dit ce qu\'il contient, pas ce qui reste d\'un objectif', async ({ page }) => {
    await creerCagnotte(page, 'Travaux', 1200);
    await ouvrirLeDetail(page);
    await verser(page, 700);

    const montant = await page.locator('.enveloppe-total-montant').innerText();
    const detail = await page.locator('.enveloppe-total-detail').innerText();

    expect(montant.replace(/\s/g, '')).toContain('700,00');
    expect(detail).toContain('dans le pot');
  });

  test('la jauge monte vers l\'objectif', async ({ page }) => {
    // L'inverse exact d'un budget, et c'est voulu : un budget se vide, une
    // cagnotte se remplit.
    await creerCagnotte(page, 'Travaux', 1000);
    await ouvrirLeDetail(page);
    await verser(page, 700);

    const largeur = await page.locator('.enveloppe-jauge-barre').evaluate(el => el.style.width);
    expect(largeur, '700 versés sur 1000 visés').toBe('70%');

    const legende = await page.locator('.enveloppe-jauge-legende').innerText();
    expect(legende.replace(/\s/g, '')).toContain('300,00');
    expect(legende).toContain('avant l\'objectif');
  });

  test('un second versement rapproche de l\'objectif', async ({ page }) => {
    await creerCagnotte(page, 'Travaux', 1000);
    await ouvrirLeDetail(page);
    await verser(page, 400, 'vous');
    await verser(page, 300, 'conjointe');

    await expect(page.locator('.enveloppe-versement')).toHaveCount(2);
    const montant = await page.locator('.enveloppe-total-montant').innerText();
    expect(montant.replace(/\s/g, '')).toContain('700,00');
  });

  test('retirer un versement le sort du pot sans l\'effacer', async ({ page }) => {
    await creerCagnotte(page, 'Travaux', 1000);
    await ouvrirLeDetail(page);
    await verser(page, 400);
    await verser(page, 300);

    await page.locator('.versement-retirer').first().click();
    await page.waitForTimeout(700);

    // Le pot ne compte plus que l'autre.
    const montant = await page.locator('.enveloppe-total-montant').innerText();
    expect(montant.replace(/\s/g, '')).toMatch(/(400|300),00/);
    await expect(page.locator('.enveloppe-versement')).toHaveCount(1);

    // Mais l'entrée est toujours en base, marquée : la suppression est douce
    // partout ailleurs dans l'application, elle l'est ici aussi.
    const total = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      const pots = await dbGet('versements') || {};
      return Object.values(Object.values(pots)[0] || {}).length;
    });
    expect(total, 'l\'entrée a été effacée au lieu d\'être marquée').toBe(2);
  });

  test('une cagnotte sans versement garde la lecture d\'avant', async ({ page }) => {
    // Le contrat de rétrocompatibilité : toutes celles déjà en base sont dans
    // ce cas, et doivent continuer à se lire comme un objectif dont on
    // retranche les dépenses.
    await creerCagnotte(page, 'Vacances', 1200);
    await ouvrirLeDetail(page);

    await expect(page.locator('.enveloppe-total-detail')).not.toContainText('dans le pot');
    const legende = await page.locator('.enveloppe-jauge-legende').innerText();
    expect(legende).toContain('restants');
  });

  test('un montant ou un auteur impossible est refusé avant l\'écriture', async ({ page }) => {
    await creerCagnotte(page, 'Travaux', 1000);
    await ouvrirLeDetail(page);

    await page.locator('#versementMontant').fill('0');
    await page.locator('#versementAjouter').click();
    await page.waitForTimeout(400);

    // Rien n'est parti en base : le refus s'explique ici plutôt que d'aller
    // grossir la file hors ligne pour échouer plus tard.
    const potsVides = await page.evaluate(async () =>
      Object.keys((await (await import('/js/db.js')).dbGet('versements')) || {}).length);
    expect(potsVides).toBe(0);
    await expect(page.locator('.enveloppe-versement')).toHaveCount(0);
  });

  test('une enveloppe mensuelle n\'a pas de pot à alimenter', async ({ page }) => {
    // On ne verse pas dans un budget : on le fixe. Le bloc n'a rien à y faire.
    await page.evaluate(() => window.showManageEnvelopesModal());
    await page.locator('#envelopeNewLabel').fill('Courses');
    await page.locator('#envelopeNewNature').selectOption('mensuelle');
    await page.locator('#envelopeNewBudget').fill('600');
    await page.locator('#envelopeAddBtn').click();
    await page.waitForTimeout(400);

    await ouvrirLeDetail(page);
    await expect(page.locator('.enveloppe-versements')).toHaveCount(0);
  });
});
