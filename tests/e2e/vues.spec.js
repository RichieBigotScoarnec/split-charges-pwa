import { test, expect } from '@playwright/test';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Deux fonctionnalités annoncées dans le README ne pouvaient pas être
 * atteintes :
 *
 *   — les tendances sur six mois visaient #trendsCanvas, #trendsStats et
 *     #generateTrendsBtn, dont aucun n'existait dans le HTML ;
 *   — la carte n'avait qu'un seul déclencheur, à l'intérieur d'un panneau
 *     maintenu en display:none. Leaflet était pourtant téléchargé à chaque
 *     ouverture de l'application, soit 158 Ko pour rien.
 */

test.describe('Tendances sur 6 mois', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();
  });

  /** Ajoute une charge variable dans le mois affiché */
  async function charge(page, description, montant) {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill(description);
    await page.locator('#variableChargeAmount').fill(String(montant));
    await page.locator('#variableChargeCategory').selectOption({ index: 1 });
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText(description)).toBeVisible({ timeout: 5000 });
  }

  test('la section existe et se déplie', async ({ page }) => {
    await expect(page.locator('#trendsSection')).toBeVisible();
    await expect(page.locator('#trendsContent')).toBeHidden();

    await page.locator('#trendsToggle').click();

    await expect(page.locator('#trendsContent')).toBeVisible();
    await expect(page.locator('#trendsToggle')).toHaveAttribute('aria-expanded', 'true');
  });

  test('le graphique et les statistiques sont produits au dépliage', async ({ page }) => {
    await charge(page, 'Depense du mois', 300);

    await page.locator('#trendsToggle').click();

    await expect(page.locator('#trendsCanvas')).toBeVisible();
    // Le bloc de statistiques est rempli par le module : vide, la section
    // n'affichait rien — c'était précisément le défaut.
    await expect(page.locator('#trendsStats')).not.toBeEmpty({ timeout: 5000 });
    await expect(page.locator('#trendsStats')).toContainText('Moyenne');
  });

  test('le canevas est réellement dessiné, pas seulement présent', async ({ page }) => {
    await charge(page, 'Depense', 250);
    await page.locator('#trendsToggle').click();
    await expect(page.locator('#trendsStats')).not.toBeEmpty({ timeout: 5000 });

    // Un canevas vierge est entièrement transparent : au moins un pixel opaque
    // prouve qu'un tracé a eu lieu.
    const dessine = await page.evaluate(() => {
      const canvas = document.getElementById('trendsCanvas');
      const pixels = canvas.getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] !== 0) return true;
      }
      return false;
    });

    expect(dessine).toBe(true);
  });

  test('se referme sans perdre son contenu', async ({ page }) => {
    await charge(page, 'Depense', 100);
    await page.locator('#trendsToggle').click();
    await expect(page.locator('#trendsStats')).not.toBeEmpty({ timeout: 5000 });

    await page.locator('#trendsToggle').click();
    await expect(page.locator('#trendsContent')).toBeHidden();

    await page.locator('#trendsToggle').click();
    await expect(page.locator('#trendsStats')).not.toBeEmpty();
  });
});

test.describe('Carte des dépenses', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('Leaflet n\'est pas chargé à l\'ouverture de l\'application', async ({ page }) => {
    // 158 Ko étaient téléchargés sur chaque ouverture pour une carte que
    // personne ne pouvait ouvrir.
    const charge = await page.evaluate(() => typeof window.L !== 'undefined');
    expect(charge).toBe(false);

    const balises = await page.evaluate(
      () => document.querySelectorAll('[src*="leaflet"], [href*="leaflet"]').length
    );
    expect(balises).toBe(0);
  });

  test('le bouton reste masqué sans dépense localisée', async ({ page }) => {
    await expect(page.locator('#mapButton')).toBeHidden();
  });

  test('le bouton apparaît dès qu\'une dépense porte des coordonnées', async ({ page }) => {
    // La géolocalisation ne peut pas être obtenue dans un navigateur sans
    // interaction : on écrit la charge localisée directement en base, comme le
    // ferait la saisie rapide.
    await page.evaluate(() => {
      const periode = document.getElementById('periodSelect').value;
      window.__db[`household/periods/${periode}/variableCharges`] = {
        loc1: {
          description: 'Courses', amount: 42, paidBy: 'vous', deleted: false,
          category: 'Courses', timestamp: 1,
          location: { lat: 48.8566, lng: 2.3522, name: 'Paris' }
        }
      };
    });

    // Recharger la période rejoue les chargeurs
    await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
    await page.locator('[data-action="navigatePeriod"][data-arg="1"]').click();

    await expect(page.locator('#mapButton')).toBeVisible({ timeout: 5000 });
  });

  test('aucune modale de carte en double dans le document', async ({ page }) => {
    // Le HTML portait une modale statique avec son propre #mapContainer, alors
    // que le module en construit une : getElementById aurait rendu l'élément
    // invisible, et la carte se serait dessinée là où personne ne la voit.
    const conteneurs = await page.evaluate(
      () => document.querySelectorAll('#mapContainer').length
    );
    expect(conteneurs).toBeLessThanOrEqual(1);
  });
});

/**
 * Trois listes calculaient leur total et cherchaient où l'écrire : les
 * éléments cibles n'existaient pas. Le chiffre était produit puis jeté.
 */
test.describe('Totaux de liste', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();
  });

  /** Ajoute une charge variable */
  async function charge(page, description, montant) {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill(description);
    await page.locator('#variableChargeAmount').fill(String(montant));
    await page.locator('#variableChargeCategory').selectOption({ index: 1 });
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText(description)).toBeVisible({ timeout: 5000 });
  }

  test('les trois éléments de total existent', async ({ page }) => {
    for (const id of ['variableChargesTotal', 'fixedChargesTotal', 'reimbursementsTotal']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
  });

  test('le total des charges variables suit les ajouts', async ({ page }) => {
    await charge(page, 'Panier hebdo', 80);
    await expect(page.locator('#variableChargesTotal')).toContainText('80,00');

    await charge(page, 'Repas dehors', 45.5);
    await expect(page.locator('#variableChargesTotal')).toContainText('125,50');
  });

  test('une liste vide affiche zéro, pas un tiret figé', async ({ page }) => {
    await expect(page.locator('#fixedChargesTotal')).toContainText('0,00', { timeout: 5000 });
  });
});

/**
 * Le bloc d'état des notifications annonçait « Activez les notifications »
 * quel que soit l'état réel, et n'offrait aucun moyen de le faire. Rien ne le
 * remplissait : le texte était figé dans le HTML.
 */
test.describe('État des notifications', () => {

  /**
   * Impose une permission donnée avant le chargement.
   *
   * context.grantPermissions n'agit pas sur Notification.permission en mode
   * sans interface : le navigateur y rapporte « denied » malgré l'octroi. On
   * remplace donc l'objet, ce qui teste exactement la logique d'affichage.
   *
   * @param {import('@playwright/test').Page} page - Page de test
   * @param {string} permission - 'granted' | 'denied' | 'default'
   */
  async function imposerPermission(page, permission) {
    await page.addInitScript((valeur) => {
      window.Notification = function () {};
      Object.defineProperty(window.Notification, 'permission', { get: () => valeur });
      window.Notification.requestPermission = () => Promise.resolve(valeur);
    }, permission);
  }

  test('permission à demander : le bloc propose une action', async ({ page }) => {
    await imposerPermission(page, 'default');
    await setupFirebaseMock(page);
    await waitForApp(page);

    // Le bloc vit dans le panneau « Rappels », replié par défaut : on l'ouvre
    // comme le ferait l'utilisateur avant de juger de la visibilité.
    await page.locator('[data-action="toggleRemindersPanel"]').click();

    await expect(page.locator('#notificationsStatus')).toContainText('autorisation');
    await expect(page.locator('#notificationsStatus button')).toBeVisible();
  });

  test('permission accordée : le bloc le dit, sans bouton', async ({ page }) => {
    await imposerPermission(page, 'granted');
    await setupFirebaseMock(page);
    await waitForApp(page);

    await expect(page.locator('#notificationsStatus')).toContainText('activées');
    await expect(page.locator('#notificationsStatus button')).toHaveCount(0);
  });

  test('permission refusée : le bloc renvoie aux réglages, sans bouton sans effet', async ({ page }) => {
    // Le navigateur ne permet plus de redemander : un bouton serait inopérant.
    await imposerPermission(page, 'denied');
    await setupFirebaseMock(page);
    await waitForApp(page);

    await expect(page.locator('#notificationsStatus')).toContainText('réglages du navigateur');
    await expect(page.locator('#notificationsStatus button')).toHaveCount(0);
  });

  test('le bloc porte toujours un texte', async ({ page }) => {
    // Il portait un texte figé dans le HTML, que rien ne remplaçait.
    await setupFirebaseMock(page);
    await waitForApp(page);
    await expect(page.locator('#notificationsStatus')).not.toBeEmpty();
  });
});

/**
 * Les données du foyer forment un enregistrement unique à emplacements fixes,
 * `vous` et `conjointe`, que les deux comptes lisent. L'écran affichait
 * pourtant « Votre salaire » : juste pour l'un, faux pour l'autre.
 */
test.describe('Prénoms des membres', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  /** Renseigne les deux prénoms */
  async function nommer(page, vous, conjointe) {
    await page.locator('#prenomVous').fill(vous);
    await page.locator('#prenomVous').blur();
    await page.locator('#prenomConjointe').fill(conjointe);
    await page.locator('#prenomConjointe').blur();
    await expect(page.locator('#labelSalaireVous')).toContainText(vous, { timeout: 5000 });
  }

  test('sans prénoms, les libellés d\'origine sont conservés', async ({ page }) => {
    // Rétrocompatibilité : les données antérieures n'en ont pas.
    await expect(page.locator('#labelSalaireVous')).toContainText('Votre salaire');
    await expect(page.locator('#labelSalaireConjointe')).toContainText('conjointe');
  });

  test('les prénoms remplacent les libellés des champs', async ({ page }) => {
    await nommer(page, 'Richard', 'Cindy');

    await expect(page.locator('#labelSalaireVous')).toHaveText('Salaire Richard (€)');
    await expect(page.locator('#labelSalaireConjointe')).toHaveText('Salaire Cindy (€)');
  });

  test('les listes de payeur portent les prénoms', async ({ page }) => {
    await nommer(page, 'Richard', 'Cindy');

    const options = page.locator('#variableChargePaidBy option');
    await expect(options.filter({ hasText: 'Richard' })).toHaveCount(1);
    await expect(options.filter({ hasText: 'Cindy' })).toHaveCount(1);
  });

  test('le sens des remboursements porte les prénoms', async ({ page }) => {
    await nommer(page, 'Richard', 'Cindy');

    const options = page.locator('#reimbursementDirection option');
    await expect(options.filter({ hasText: 'Richard → Cindy' })).toHaveCount(1);
    await expect(options.filter({ hasText: 'Cindy → Richard' })).toHaveCount(1);
  });

  test('la phrase du solde nomme les deux personnes', async ({ page }) => {
    // « Conjointe vous doit » désignait un « vous » relatif au compte
    // connecté : la phrase disait le contraire à l'une des deux personnes.
    await nommer(page, 'Richard', 'Cindy');

    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Loyer partage');
    await page.locator('#variableChargeAmount').fill('1000');
    await page.locator('#variableChargeCategory').selectOption({ index: 1 });
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();

    await expect(page.locator('#balanceBar')).toContainText('Cindy doit', { timeout: 5000 });
    await expect(page.locator('#balanceBar')).toContainText('à Richard');
  });

  test('les prénoms sont écrits en base', async ({ page }) => {
    // Le simulateur repart de zéro à chaque chargement : il ne peut pas
    // démontrer la persistance. La suite contre le vrai Firebase le fait ;
    // ici, on vérifie que l'écriture part bien.
    await nommer(page, 'Richard', 'Cindy');

    const enregistres = await page.evaluate(() => window.__db['sandbox/members'] || window.__db['household/members']);
    expect(enregistres).toEqual({ vous: 'Richard', conjointe: 'Cindy' });
  });

  test('vider un prénom rétablit le libellé d\'origine', async ({ page }) => {
    await nommer(page, 'Richard', 'Cindy');

    await page.locator('#prenomVous').fill('');
    await page.locator('#prenomVous').blur();

    // Le libellé d'origine revient, pas « Salaire Vous » : sans prénom choisi,
    // la formulation d'avant reste la plus naturelle.
    await expect(page.locator('#labelSalaireVous')).toHaveText('Votre salaire (€)', { timeout: 5000 });
    await expect(page.locator('#prenomVous')).toHaveValue('');
  });

  test('un prénom hostile est affiché en texte, jamais interprété', async ({ page }) => {
    const hostile = '<img src=x onerror=alert(1)>';
    await page.locator('#prenomVous').fill(hostile);
    await page.locator('#prenomVous').blur();

    await expect(page.locator('#labelSalaireVous')).toContainText(hostile, { timeout: 5000 });
    await expect(page.locator('#labelSalaireVous img')).toHaveCount(0);
  });
});

/**
 * Mise en page sur grand écran.
 *
 * Mesuré avant : sur 3440 px, le contenu restait plafonné à 1120 px — 1160 px
 * de marge vide de chaque côté — et la page mesurait 1920 px de haut pour une
 * fenêtre de 1440. L'application imposait de faire défiler tout en laissant
 * les deux tiers de la largeur inutilisés.
 */
test.describe('Mise en page sur grand écran', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test.describe('au-delà de 1600 px', () => {
    test.use({ viewport: { width: 2560, height: 1440 } });

    test('les trois colonnes sont côte à côte', async ({ page }) => {
      const y = await page.evaluate(() => {
        const t = (s) => Math.round(document.querySelector(s).getBoundingClientRect().y);
        return { bilan: t('.col-bilan'), listes: t('.col-listes'), reglages: t('.col-reglages') };
      });

      // Une colonne qui décroche se retrouve à la rangée suivante : c'est ce
      // qui se produisait quand l'ordre du document ne suivait pas l'ordre
      // visuel, et la page s'allongeait de 600 px.
      expect(Math.abs(y.listes - y.bilan)).toBeLessThan(5);
      expect(Math.abs(y.reglages - y.bilan)).toBeLessThan(5);
    });

    test('la largeur utile augmente avec l\'écran', async ({ page }) => {
      const largeur = await page.evaluate(
        () => Math.round(document.querySelector('.container').getBoundingClientRect().width)
      );
      expect(largeur).toBeGreaterThan(1120);
    });
  });

  test.describe('entre 900 et 1600 px', () => {
    test.use({ viewport: { width: 1280, height: 1440 } });

    test('deux colonnes, réglages sous le bilan', async ({ page }) => {
      const p = await page.evaluate(() => {
        const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y) }; };
        return { bilan: r('.col-bilan'), listes: r('.col-listes'), reglages: r('.col-reglages') };
      });

      // Les réglages restent alignés sur le bilan, en dessous.
      expect(p.reglages.x).toBe(p.bilan.x);
      expect(p.reglages.y).toBeGreaterThan(p.bilan.y);
      // Les listes occupent la seconde colonne, à la hauteur du bilan.
      expect(p.listes.x).toBeGreaterThan(p.bilan.x);
      expect(Math.abs(p.listes.y - p.bilan.y)).toBeLessThan(5);
    });
  });
});
