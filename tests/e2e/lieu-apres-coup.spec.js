import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Le champ « Lieu », dans un vrai navigateur
 *
 * Signalé à l'usage, capture à l'appui : « j'ai entré le lieu, je clique sur le
 * logo, mais rien ne se passe. »
 *
 * Les tests unitaires du module passaient tous — ils posaient le balisage
 * eux-mêmes, dans un jsdom sans feuille de style. Ils ne pouvaient donc rien
 * dire ni de la page réellement livrée, ni du CSS qui s'y applique. Cette
 * suite-ci charge l'application entière et refait le geste.
 */

test.describe('Rattacher un lieu à une dépense', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);

    // Toute recherche de lieu est interceptée : ces tests portent sur le
    // parcours, pas sur la disponibilité d'un service tiers.
    await page.route('**/nominatim.openstreetmap.org/search**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        lat: '48.1113', lon: '-1.6800', name: 'Caffe Mamma', type: 'cafe',
        address: { amenity: 'Caffe Mamma', postcode: '35000', city: 'Rennes' }
      }])
    }));

    // Le bouton 📍 interroge le géocodage inversé : même raison.
    await page.route('**/nominatim.openstreetmap.org/reverse**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lat: '42.5450', lon: '3.0244', name: 'Plage nord', type: 'beach',
        address: { leisure: 'Plage nord', postcode: '66700', city: 'Argelès-sur-Mer' }
      })
    }));
  });

  /**
   * Ouvre le formulaire d'ajout de charge variable, et déplie le lieu
   *
   * Le lieu et l'enveloppe sont repliés derrière un `<details>` : ils ne
   * concernent qu'une charge sur dix et occupaient le tiers du formulaire. Le
   * test fait donc ce que fait la personne — il déplie.
   *
   * `toBeVisible()` ne suffit PAS à le prouver, et c'est le piège qui a failli
   * rendre toute cette suite vacuse : un contenu de `<details>` fermé est
   * masqué par `content-visibility: hidden`, qui n'annule pas la géométrie.
   * Playwright le tient donc pour visible, et ces contrôles seraient passés
   * sur un champ que personne ne voit. `checkVisibility()`, lui, dit la
   * vérité — mesuré : `false` replié, `true` déplié.
   */
  async function ouvrirFormulaire(page) {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#modalAddVariableCharge .form-repli > summary').click();
    await expect(page.locator('#variableChargeLieuRecherche')).toBeVisible();
    expect(
      await page.locator('#variableChargeLieuRecherche').evaluate(el => el.checkVisibility()),
      'le champ doit être réellement rendu, pas seulement dimensionné'
    ).toBe(true);
  }

  test('le champ de recherche est présent dans la page livrée', async ({ page }) => {
    await ouvrirFormulaire(page);
    await expect(page.locator('#variableChargeLieuChercher')).toBeVisible();
    await expect(page.locator('#variableChargeLieuIci')).toBeVisible();
  });

  test('les écouteurs sont réellement branchés', async ({ page }) => {
    // Le cas signalé : les champs étaient là, et rien ne répondait. L'existence
    // d'un élément ne prouve pas qu'un gestionnaire y soit attaché — ce
    // marqueur, lui, n'est posé que si `initChoixLieu` est allé au bout.
    await ouvrirFormulaire(page);
    await expect(page.locator('#variableChargeLieuRecherche')).toHaveAttribute('data-lieu-pret', 'oui');
  });

  test('le bouton chercher répond même à une saisie trop courte', async ({ page }) => {
    // Un bouton qui ne répond pas est indiscernable d'un bouton mort.
    await ouvrirFormulaire(page);
    await page.locator('#variableChargeLieuRecherche').fill('Le');
    await page.locator('#variableChargeLieuChercher').click();

    await expect(page.locator('#variableChargeLieuResultats')).toContainText('trois lettres');
  });

  test('le bouton chercher trouve ce qui a été tapé', async ({ page }) => {
    // Ce que l'utilisateur attendait de 📍.
    await ouvrirFormulaire(page);
    await page.locator('#variableChargeLieuRecherche').fill('Caffe mamma');
    await page.locator('#variableChargeLieuChercher').click();

    await expect(page.locator('.lieu-resultat')).toHaveText(/Caffe Mamma/, { timeout: 5000 });
  });

  test('la liste des propositions est masquée tant qu\'on n\'a rien cherché', async ({ page }) => {
    // `hidden` pose `display: none` par la feuille du navigateur. N'importe
    // quelle règle d'auteur portant `display` la bat — et la boîte reste alors
    // visible en permanence, vide.
    await ouvrirFormulaire(page);

    // `toBeHidden` passerait aussi pour une boîte affichée mais vide, donc de
    // hauteur nulle : on mesure le `display` calculé, seul témoin du fait que
    // l'attribut `hidden` n'a pas été défait par une règle d'auteur.
    const display = await page.locator('#variableChargeLieuResultats')
      .evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('none');

    await expect(page.locator('#variableChargeLieuRetenu')).toBeHidden();
  });

  test('taper un nom fait apparaître des propositions', async ({ page }) => {
    await ouvrirFormulaire(page);
    await page.locator('#variableChargeLieuRecherche').fill('Caffe mamma');

    await expect(page.locator('.lieu-resultat')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.lieu-resultat')).toHaveText(/Caffe Mamma/);
  });

  test('choisir une proposition retient le lieu et le montre', async ({ page }) => {
    await ouvrirFormulaire(page);
    await page.locator('#variableChargeLieuRecherche').fill('Caffe mamma');
    await page.locator('.lieu-resultat').first().click();

    await expect(page.locator('#variableChargeLieuRetenu')).toBeVisible();
    await expect(page.locator('#variableChargeLieuNom')).toHaveText(/Caffe Mamma/);
    await expect(page.locator('#variableChargeLieuResultats')).toBeHidden();
  });

  test('le lieu part avec la charge et revient à la réouverture', async ({ page }) => {
    await ouvrirFormulaire(page);
    await page.locator('#variableChargeDescription').fill('Une bière');
    await page.locator('#variableChargeAmount').fill('37');
    await page.locator('#variableChargeCategory').selectOption({ index: 1 });
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#variableChargeLieuRecherche').fill('Caffe mamma');
    await page.locator('.lieu-resultat').first().click();
    await page.locator('#saveVariableCharge').click();

    const ligne = page.locator('#variableChargesList').getByText('Une bière');
    await expect(ligne).toBeVisible({ timeout: 5000 });

    // Le lieu s'affiche sur la ligne de charge.
    await expect(page.locator('#variableChargesList .charge-location')).toContainText('Caffe Mamma');

    // Et il revient quand on rouvre la charge.
    await page.locator('#variableChargesList [data-action="editVariableCharge"]').first().click();
    await expect(page.locator('#variableChargeLieuNom')).toHaveText(/Caffe Mamma/);
  });

  test('une fois un lieu retenu, la recherche se cadre autour de lui', async ({ page, context }) => {
    // Signalé à l'usage : « je lui mets le Caffe Mamma qui se situe à
    // Argelès-sur-Mer mais il me met des villes lointaines comme à New York ».
    // Ce test suit la requête réellement partie du navigateur : c'est le seul
    // endroit où l'on peut affirmer que Nominatim a été cadré.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 42.5450, longitude: 3.0244 });

    const requetes = [];
    page.on('request', requete => {
      if (requete.url().includes('nominatim.openstreetmap.org/search')) requetes.push(requete.url());
    });

    await ouvrirFormulaire(page);

    // On reprend la position actuelle : elle devient le centre des recherches.
    await page.locator('#variableChargeLieuIci').click();
    await expect(page.locator('#variableChargeLieuNom')).toHaveText(/Argelès/, { timeout: 15000 });

    await page.locator('#variableChargeLieuRecherche').fill('Caffe mamma');
    await page.locator('#variableChargeLieuChercher').click();
    await expect(page.locator('.lieu-resultat')).toBeVisible({ timeout: 5000 });

    expect(requetes.length).toBeGreaterThan(0);
    const parametres = new URL(requetes[0]).searchParams;
    expect(parametres.get('bounded')).toBe('1');

    const [ouest, sud, est, nord] = parametres.get('viewbox').split(',').map(Number);
    expect(ouest).toBeLessThan(3.0244);
    expect(est).toBeGreaterThan(3.0244);
    expect(sud).toBeLessThan(42.5450);
    expect(nord).toBeGreaterThan(42.5450);

    // Et la distance se lit sous la proposition.
    await expect(page.locator('.lieu-resultat-distance').first()).toBeVisible();
  });

  test('le bouton de position dit ce qu\'il fait quand elle est refusée', async ({ page, context }) => {
    // Le cas de la capture : on clique, et il faut qu'il se passe quelque
    // chose de visible — succès ou échec, mais jamais rien.
    await context.clearPermissions();
    await ouvrirFormulaire(page);
    await page.locator('#variableChargeLieuIci').click();

    await expect(page.locator('#variableChargeLieuResultats')).toBeVisible({ timeout: 15000 });
  });
});
