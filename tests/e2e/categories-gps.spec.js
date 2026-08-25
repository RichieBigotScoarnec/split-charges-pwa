import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Les catégories que le GPS sait reconnaître
 *
 * `utils/categorie-lieu.js` reconnaît 93 types de lieux OpenStreetMap, chacun
 * visant des catégories nommément. Douze visaient « Café », « Bar » ou
 * « Boulangerie » — trois catégories qu'aucun foyer ne possédait : un café
 * était rangé en « Restaurant », une boulangerie en « Courses ». Le repli
 * fonctionnait, la précision se perdait.
 *
 * Elles figurent désormais dans les défauts. Mais un foyer qui a modifié sa
 * liste une seule fois ne les verrait jamais : la liste enregistrée l'emporte
 * sur les défauts, pour toujours. D'où la proposition explicite éprouvée ici.
 */
test.describe('Compléter les catégories pour le GPS', () => {

  /** Ouvre la gestion des catégories */
  async function ouvrirLaGestion(page) {
    await page.evaluate(() => window.showManageCategoriesModal());
    await expect(page.locator('#modalManageLists')).toBeVisible();
  }

  test('rien n\'est proposé quand la liste est complète', async ({ page }) => {
    // Un foyer neuf part des défauts, qui les contiennent toutes.
    await setupFirebaseMock(page);
    await waitForApp(page);

    await ouvrirLaGestion(page);

    await expect(page.locator('.manage-proposition')).toHaveCount(0);
    await expect(page.locator('#manageListItems')).toContainText('Boulangerie');
  });

  test('un foyer installé se voit proposer ce qui lui manque', async ({ page }) => {
    await setupFirebaseMock(page);
    await page.addInitScript(() => {
      // Une liste enregistrée, telle qu'un foyer l'a modifiée avant que ces
      // catégories n'existent.
      window.__db = {
        'household/customCategories': [
          { id: 'courses', icon: '🛒', label: 'Courses' },
          { id: 'maison', icon: '🏠', label: 'Maison' },
          { id: 'restaurant', icon: '🍕', label: 'Restaurant' },
          { id: 'essence', icon: '🚗', label: 'Essence' },
          { id: 'sante', icon: '💊', label: 'Santé' },
          { id: 'loisirs', icon: '🎮', label: 'Loisirs' },
          { id: 'transport', icon: '🚌', label: 'Transport' },
          { id: 'autre', icon: '⚡', label: 'Autre' }
        ]
      };
    });
    await waitForApp(page);

    await ouvrirLaGestion(page);

    const proposition = page.locator('.manage-proposition');
    await expect(proposition).toBeVisible();
    await expect(proposition).toContainText('Café');
    await expect(proposition).toContainText('Bar');
    await expect(proposition).toContainText('Boulangerie');
  });

  test('les ajouter les inscrit dans la liste, et la proposition disparaît', async ({ page }) => {
    await setupFirebaseMock(page);
    await page.addInitScript(() => {
      window.__db = {
        'household/customCategories': [
          { id: 'courses', icon: '🛒', label: 'Courses' },
          { id: 'restaurant', icon: '🍕', label: 'Restaurant' },
          { id: 'autre', icon: '⚡', label: 'Autre' }
        ]
      };
    });
    await waitForApp(page);
    await ouvrirLaGestion(page);

    await page.locator('#manageAjouterGps').click();

    await expect(page.locator('#manageListItems')).toContainText('Boulangerie');
    await expect(page.locator('.manage-proposition')).toHaveCount(0);

    // Écrites en base, donc retrouvées au prochain chargement.
    const enregistrees = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      return (await dbGet('customCategories')).map(c => c.id);
    });
    expect(enregistrees).toContain('boulangerie');
    expect(enregistrees).toContain('cafe');
    expect(enregistrees).toContain('bar');
    // Ce que le foyer avait n'est pas perdu.
    expect(enregistrees).toContain('courses');
  });

  test('la saisie rapide propose alors la bonne catégorie', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);

    const choisie = await page.evaluate(async () => {
      const { categoriePourLieu } = await import('/js/utils/categorie-lieu.js');
      const { getCategories } = await import('/js/modules/custom-lists.js');
      return {
        cafe: categoriePourLieu({ type: 'cafe', nom: 'Colombus' }, getCategories())?.id,
        boulangerie: categoriePourLieu({ type: 'bakery', nom: 'Brioche Dorée' }, getCategories())?.id,
        pub: categoriePourLieu({ type: 'pub', nom: 'Le Zinc' }, getCategories())?.id
      };
    });

    expect(choisie).toEqual({ cafe: 'cafe', boulangerie: 'boulangerie', pub: 'bar' });
  });
});

/**
 * Ce que la grille de la saisie rapide en montre
 *
 * Dix-neuf catégories tiennent la table OpenStreetMap de près, et ruineraient
 * la saisie rapide si elles s'affichaient toutes : dix-neuf tuiles à parcourir
 * pour en toucher une, quand trois d'entre elles couvrent l'essentiel des
 * dépenses. La grille s'en tient donc à six, classées par usage réel, et une
 * dernière tuile déplie le reste.
 */
test.describe('La grille de la saisie rapide', () => {

  /** Ouvre la saisie rapide sur son panneau de catégories */
  async function ouvrirLesCategories(page) {
    await page.evaluate(() => window.showQuickAddModal());
    await expect(page.locator('#modalQuickAdd')).toBeVisible();
    await page.locator('.quick-add-segment[data-panneau="quickAddPanneauCategorie"]').click();
  }

  /** Tuiles de catégorie affichées, la réserve exclue */
  const tuiles = page => page.locator('#categoryGrid .category-btn[data-category-id]');

  test('n\'en montre que six, et annonce ce qu\'elle garde', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await ouvrirLesCategories(page);

    await expect(tuiles(page)).toHaveCount(6);
    await expect(page.locator('#categoryPlus')).toContainText('13 autres');
  });

  test('la réserve se déplie, et montre la liste entière', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await ouvrirLesCategories(page);

    await page.locator('#categoryPlus').click();

    await expect(tuiles(page)).toHaveCount(19);
    await expect(page.locator('#categoryPlus')).toHaveCount(0);
  });

  test('une catégorie de la réserve se choisit et s\'enregistre', async ({ page }) => {
    // Le dépliement n'est pas qu'un affichage : c'est le seul chemin vers les
    // treize catégories qu'il tient.
    await setupFirebaseMock(page);
    await waitForApp(page);
    await ouvrirLesCategories(page);

    await page.locator('#categoryPlus').click();
    await page.locator('.category-btn[data-category-id="coiffeur"]').click();

    await expect(page.locator('.category-btn.selected'))
      .toHaveAttribute('data-category-id', 'coiffeur');

    await page.locator('#quickAddAmount').fill('24,00');
    await page.locator('#quickAddDescription').fill('Coupe');
    await page.locator('#btnQuickAdd').click();

    await expect(page.locator('#variableChargesList').getByText('Coupe')).toBeVisible();
    const enregistree = await page.evaluate(async () => {
      const { getState } = await import('/js/state.js');
      return (getState('variableCharges') || []).find(c => c.description === 'Coupe');
    });
    expect(enregistree.categoryId).toBe('coiffeur');
    expect(enregistree.category).toBe('Coiffeur');
  });

  test('la grille se replie à la réouverture', async ({ page }) => {
    // Le cas courant est une dépense courante : rouvrir sur dix-neuf tuiles
    // reprendrait le temps que les six font gagner.
    await setupFirebaseMock(page);
    await waitForApp(page);
    await ouvrirLesCategories(page);
    await page.locator('#categoryPlus').click();
    await expect(tuiles(page)).toHaveCount(19);

    await page.locator('#modalQuickAdd [data-action="closeQuickAddModal"]').click();
    await expect(page.locator('#modalQuickAdd')).toBeHidden();
    await ouvrirLesCategories(page);

    await expect(tuiles(page)).toHaveCount(6);
  });

  test('la tuile de réserve ne s\'enregistre pas comme une catégorie', async ({ page }) => {
    // Elle occupe la même case que les six autres : rien ne doit permettre de
    // la choisir en croyant classer sa dépense.
    await setupFirebaseMock(page);
    await waitForApp(page);
    await ouvrirLesCategories(page);

    await expect(page.locator('#categoryPlus')).not.toHaveAttribute('data-category-id', /.*/);
  });

  test('remonte en tête ce que le foyer emploie le plus', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);

    // « Coiffeur » ferme la liste et ne serait jamais visible sans cela.
    await page.evaluate(async () => {
      const { dbUpdate } = await import('/js/db.js');
      const { getState } = await import('/js/state.js');
      const { loadVariableCharges } = await import('/js/modules/variable-charges.js');

      const periode = getState('currentPeriod');
      await dbUpdate(undefined, {
        [`periods/${periode}/variableCharges/c1`]: {
          description: 'Coupe', amount: 20, category: 'Coiffeur',
          categoryId: 'coiffeur', paidBy: 'vous', deleted: false
        },
        [`periods/${periode}/variableCharges/c2`]: {
          description: 'Couleur', amount: 45, category: 'Coiffeur',
          categoryId: 'coiffeur', paidBy: 'vous', deleted: false
        }
      });
      await loadVariableCharges();
    });

    await ouvrirLesCategories(page);

    await expect(tuiles(page).first()).toHaveAttribute('data-category-id', 'coiffeur');
  });
});
