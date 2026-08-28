import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Chercher un montant depuis l'écran
 *
 * `tests/utils/recherche-montant.test.js` verrouille la comparaison. Ce qui
 * est vérifié ici, c'est que la chaîne complète répond — parce que c'est à
 * l'écran que le défaut a été rencontré, pas dans une fonction.
 *
 * Le montant était versé parmi les champs de texte sous sa forme brute :
 * une charge de 12,50 € y entrait en « 12.5 ». Ni « 12,50 » — ce que l'écran
 * affiche — ni « 12.50 » ne la trouvaient.
 */

async function poser(page, description, montant, categorie = 'Courses') {
  await page.locator('#addVariableChargeBtn').click();
  await page.locator('#variableChargeDescription').fill(description);
  await page.locator('#variableChargeAmount').fill(montant);
  await page.locator('#variableChargeCategory').selectOption(categorie);
  await page.locator('#variableChargePaidBy').selectOption('vous');

  // L'HEURE EST EFFACÉE, ET C'EST INDISPENSABLE.
  //
  // La recherche couvre l'heure à dessein — « 08:30 » se cherche sans avoir à
  // retrouver le jour qui va avec. Le formulaire préremplit l'heure courante :
  // un contrôle qui cherche « 17 » passe donc toute la journée et tombe entre
  // 17 h et 18 h, quand chaque charge porte « 17:xx » et se trouve
  // légitimement. Ce n'est pas un défaut du code, c'est une prémisse fausse —
  // et elle a mis un passage complet à se manifester.
  await page.locator('#variableChargeHeure').fill('');

  // LA DATE EST EFFACÉE POUR LA MÊME RAISON, ET ELLE DOIT L'ÊTRE EN ENTIER.
  //
  // La première version datait la charge du PREMIER du mois, pour neutraliser
  // le jour. Elle ne neutralisait ni le mois ni l'année : en décembre les trois
  // charges auraient porté « AAAA-12-01 », et le contrôle « 12 ne ramène pas
  // 120 » serait tombé tout le mois — la date portant les deux chiffres
  // cherchés. Le job E2E aurait viré au rouge chaque décembre, et `deploy.yml`
  // aurait sauté la publication.
  //
  // Un an après le contrôle qui dépendait de l'heure qu'il était, le même
  // piège d'un cran plus large. Une date vide est un cas que l'application
  // porte : c'est la seule valeur qui ne puisse contenir aucun chiffre.
  await page.locator('#variableChargeDate').fill('');

  await page.locator('#saveVariableCharge').click();
  await expect(page.locator('#variableChargesList').getByText(description))
    .toBeVisible({ timeout: 5000 });
}

/** Cherche, puis rend ce qui reste visible */
async function chercher(page, requete) {
  await page.locator('#searchInput').fill(requete);
  await page.waitForTimeout(400);   // anti-rebond
}

test.describe('Rechercher par montant', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);

    await poser(page, 'Boulangerie', '12,50');
    await poser(page, 'Grosse dépense', '1171,01', 'Maison');
    await poser(page, 'Cinéma', '120', 'Loisirs');
  });

  test('la virgule et le point trouvent la même somme', async ({ page }) => {
    const liste = page.locator('#variableChargesList');

    await chercher(page, '12,50');
    await expect(liste.getByText('Boulangerie'), '« 12,50 » ne trouve rien').toBeVisible();
    await expect(liste.getByText('Cinéma')).toBeHidden();

    await chercher(page, '12.50');
    await expect(liste.getByText('Boulangerie'), '« 12.50 » ne trouve rien').toBeVisible();
  });

  test('le montant recopié de l\'écran, espace des milliers comprise', async ({ page }) => {
    const liste = page.locator('#variableChargesList');

    await chercher(page, '1 171,01');
    await expect(liste.getByText('Grosse dépense')).toBeVisible();
    await expect(liste.getByText('Boulangerie')).toBeHidden();
  });

  test('sans décimales, la saisie désigne les euros — et pas les centaines', async ({ page }) => {
    const liste = page.locator('#variableChargesList');

    await chercher(page, '12');
    await expect(liste.getByText('Boulangerie'), '« 12 » devrait trouver 12,50').toBeVisible();
    // 120 commence par les mêmes chiffres, et c'est un autre montant.
    await expect(liste.getByText('Cinéma'), '« 12 » ramène 120,00').toBeHidden();
  });

  test('deux chiffres pris au milieu d\'un montant ne le trouvent plus', async ({ page }) => {
    // « 17 » se trouve dans « 1171.01 » : la comparaison par sous-chaîne
    // ramenait cette charge sans aucun rapport avec la recherche.
    const liste = page.locator('#variableChargesList');

    await chercher(page, '17');
    await expect(liste.getByText('Grosse dépense'), '« 17 » ramène encore 1 171,01')
      .toBeHidden();
  });

  test('chercher du texte fonctionne toujours', async ({ page }) => {
    const liste = page.locator('#variableChargesList');

    await chercher(page, 'boulangerie');
    await expect(liste.getByText('Boulangerie')).toBeVisible();
    await expect(liste.getByText('Cinéma')).toBeHidden();
  });
});
