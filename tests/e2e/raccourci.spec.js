import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Le raccourci d'appui long
 *
 * Le manifeste déclare `?action=quick-add`. Un appui long sur l'icône propose
 * « ⚡ Saisie rapide » ; la même URL, posée sur l'écran d'accueil, s'ouvre d'un
 * seul appui. Deux gestes économisés à chaque dépense.
 *
 * Ce qui se vérifie ici et nulle part ailleurs : que l'ouverture atteint la
 * modale, et que le paramètre ne reste pas dans la barre d'adresse — sinon un
 * rafraîchissement rouvrirait la saisie sans qu'on l'ait demandé.
 */
test.describe('Raccourci de saisie rapide', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
  });


  test('?action=quick-add ouvre la modale', async ({ page }) => {
    await waitForApp(page, { query: '?action=quick-add' });

    await expect(page.locator('#modalQuickAdd')).toBeVisible();
    await expect(page.locator('#quickAddAmount')).toBeFocused();
  });

  test('le paramètre est retiré de la barre d\'adresse', async ({ page }) => {
    await waitForApp(page, { query: '?action=quick-add' });
    await expect(page.locator('#modalQuickAdd')).toBeVisible();

    expect(page.url()).not.toContain('action=');
    expect(page.url()).toContain('FairSplit.html');
  });

  test('les autres paramètres survivent au nettoyage', async ({ page }) => {
    await waitForApp(page, { query: '?sandbox=1&action=quick-add' });
    await expect(page.locator('#modalQuickAdd')).toBeVisible();

    expect(page.url()).not.toContain('action=');
    expect(page.url()).toContain('sandbox=1');
  });

  test('sans le paramètre, rien ne s\'ouvre', async ({ page }) => {
    await waitForApp(page);

    await expect(page.locator('#modalQuickAdd')).toBeHidden();
  });

  test('une action inconnue est ignorée', async ({ page }) => {
    await waitForApp(page, { query: '?action=inexistante' });

    await expect(page.locator('#modalQuickAdd')).toBeHidden();
    // Rien n'a été honoré : le paramètre reste, il n'appartient pas à l'app.
    expect(page.url()).toContain('action=inexistante');
  });
});

/**
 * Saisir pendant la connexion, plutôt qu'après
 *
 * Le raccourci n'économisait que des gestes : la modale s'ouvrait au bout de
 * la séquence d'initialisation — jeton, attestation, listes du foyer, salaires,
 * charges du mois. Le temps gagné sur les gestes était repris par l'attente.
 *
 * Elle s'ouvre désormais dès que le balisage existe. Ce qui se vérifie ici :
 * qu'on peut taper avant que Firebase ait répondu, que l'écriture attend
 * pourtant d'avoir de quoi écrire, et que la modale se retire d'elle-même
 * devant un écran de connexion.
 */
test.describe('Saisie rapide avant l\'authentification', () => {

  /**
   * Retient la réponse de Firebase jusqu'à ce que le test la libère
   *
   * C'est la fenêtre que le raccourci exploite : la modale s'y ouvre, le
   * montant s'y tape. Un délai fixe ne convenait pas — sur une machine
   * chargée, l'ouverture de la page peut le dépasser, la fenêtre se referme
   * avant que le contrôle l'ait vue, et il tombe sans qu'aucun défaut existe.
   * C'est exactement ce qui est arrivé après la fusion : le déploiement, qui
   * dépend de cette suite, ne s'est jamais fait.
   *
   * Ici la fenêtre n'a pas de durée : elle dure jusqu'à `libererFirebase`.
   *
   * @param {import('@playwright/test').Page} page
   * @param {{personne?: boolean}} [options] - `personne: true` répond qu'il
   *   n'y a aucun compte connecté
   */
  async function firebaseRetenu(page, { personne = false } = {}) {
    await page.addInitScript((personne) => {
      window.__authRetenue = true;
      window.__authSansPersonne = personne;
    }, personne);
  }

  /** Laisse enfin Firebase répondre */
  async function libererFirebase(page) {
    await page.evaluate(() => window.__libererAuth());
  }

  /** Ouvre la page sans attendre `data-app-ready` */
  async function ouvrirSansAttendre(page, query = '?action=quick-add') {
    await page.goto(`/FairSplit.html${query}`);
  }

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
  });

  test('la modale paraît avant que Firebase ait répondu', async ({ page }) => {
    await firebaseRetenu(page);
    await ouvrirSansAttendre(page);

    await expect(page.locator('#modalQuickAdd')).toBeVisible();
    // L'application n'est pas prête : c'est tout l'intérêt.
    await expect(page.locator('body')).not.toHaveAttribute('data-app-ready', 'true');
    await expect(page.locator('#quickAddAttente')).toBeVisible();
  });

  test('elle passe devant l\'écran de connexion', async ({ page }) => {
    await firebaseRetenu(page);
    await ouvrirSansAttendre(page);
    await expect(page.locator('#modalQuickAdd')).toBeVisible();

    // L'écran d'attente est à 10000, une modale à 9999 : ouverte tôt, elle
    // s'ouvrait derrière lui. Le montant tapé partait dans un champ invisible.
    const dessus = await page.evaluate(() => {
      const champ = document.getElementById('quickAddAmount');
      const boite = champ.getBoundingClientRect();
      const dessus = document.elementFromPoint(
        boite.left + boite.width / 2,
        boite.top + boite.height / 2
      );
      return dessus === champ || champ.contains(dessus);
    });
    expect(dessus).toBe(true);
  });

  test('le montant se tape pendant l\'attente et survit à la connexion', async ({ page }) => {
    await firebaseRetenu(page);
    await ouvrirSansAttendre(page);
    await expect(page.locator('#quickAddAmount')).toBeVisible();

    await page.locator('#quickAddAmount').fill('12,50');
    await page.locator('#quickAddDescription').fill('Cafe');

    await libererFirebase(page);
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 15000 });

    // Ce que la personne a tapé n'est pas un défaut à rattraper.
    await expect(page.locator('#quickAddAmount')).toHaveValue('12,50');
    await expect(page.locator('#quickAddDescription')).toHaveValue('Cafe');
    // L'annonce d'attente n'a plus lieu d'être.
    await expect(page.locator('#quickAddAttente')).toBeHidden();
  });

  test('une saisie commencée avant la connexion s\'enregistre après', async ({ page }) => {
    await firebaseRetenu(page);
    await ouvrirSansAttendre(page);
    await expect(page.locator('#quickAddAmount')).toBeVisible();

    await page.locator('#quickAddAmount').fill('12,50');
    await page.locator('#quickAddDescription').fill('Cafe du matin');

    // La catégorie se choisit sur la grille par défaut, avant que les listes
    // du foyer soient lues.
    await page.locator('.quick-add-segment[data-panneau="quickAddPanneauCategorie"]').click();
    await page.locator('.category-btn').first().click();

    // Appui sur « Ajouter » alors que rien n'est encore prêt : l'écriture
    // attend, elle ne se perd pas. Firebase ne répond qu'ensuite.
    await page.locator('#btnQuickAdd').click();
    await libererFirebase(page);

    await expect(page.locator('#variableChargesList').getByText('Cafe du matin'))
      .toBeVisible({ timeout: 15000 });
  });

  test('elle se referme devant un écran de connexion', async ({ page }) => {
    await firebaseRetenu(page, { personne: true });
    await ouvrirSansAttendre(page);

    await expect(page.locator('#modalQuickAdd')).toBeVisible();

    // Firebase répond qu'il n'y a personne : la saisie n'a plus lieu d'être,
    // et laisser la modale ouverte recouvrirait le formulaire de connexion.
    await libererFirebase(page);

    await expect(page.locator('#modalQuickAdd')).toBeHidden();
    await expect(page.locator('#authOverlay')).toBeVisible();
  });

  test('le payeur proposé devient celui du compte, une fois connu', async ({ page }) => {
    await firebaseRetenu(page);
    await ouvrirSansAttendre(page);
    await expect(page.locator('#modalQuickAdd')).toBeVisible();

    await libererFirebase(page);
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 15000 });

    // Le compte du banc d'essai est le premier de la liste blanche, rattaché à
    // « vous ». Ce qui compte ici : qu'un payeur soit marqué, et un seul —
    // avant, la grille anticipée en laissait zéro.
    await expect(page.locator('#quickAddPayer button.selected')).toHaveCount(1);
  });
});
