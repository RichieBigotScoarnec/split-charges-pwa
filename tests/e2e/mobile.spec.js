import { test, expect, devices } from '@playwright/test';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Vérification sur mobile émulé.
 *
 * Les tests de mise en page existants imposent une largeur de 390 px, ce qui
 * ne simule que l'encombrement. L'émulation d'appareil de Playwright ajoute ce
 * qui manquait : événements tactiles réels, densité de pixels, agent
 * utilisateur mobile.
 *
 * Ce qu'elle ne reproduit pas, et qui demande un vrai téléphone : le clavier
 * virtuel qui recouvre la moitié basse de l'écran, l'installation en écran
 * d'accueil, le comportement hors ligne réel, et la précision du doigt.
 */

/** Seuil de la cible tactile recommandé par les WCAG (2.5.5, niveau AAA) */
const CIBLE_MINIMALE = 44;

/**
 * Un profil d'appareil impose aussi un type de navigateur, ce que Playwright
 * refuse dans un groupe de tests. On ne garde que ce qui nous intéresse :
 * dimensions, densité, agent utilisateur et tactile.
 *
 * @param {Object} appareil - Profil issu de `devices`
 * @returns {Object} Profil sans `defaultBrowserType`
 */
function profilMobile(appareil) {
  const { defaultBrowserType: _ignore, ...reste } = appareil;
  return reste;
}

const APPAREILS = [
  { nom: 'iPhone 13', profil: profilMobile(devices['iPhone 13']) },
  { nom: 'Pixel 5', profil: profilMobile(devices['Pixel 5']) }
];

for (const { nom, profil } of APPAREILS) {
  test.describe(`Sur ${nom}`, () => {
    test.use({ ...profil });

    test.beforeEach(async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
    });

    test('la page ne défile pas latéralement', async ({ page }) => {
      const debordement = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(debordement).toBeLessThanOrEqual(0);
    });

    test('les commandes visibles atteignent la taille de cible recommandée', async ({ page }) => {
      // Une cible sous 44 px se rate au doigt. Le seuil vient des WCAG 2.5.5.
      const trop_petites = await page.evaluate((seuil) => {
        const resultats = [];
        for (const el of document.querySelectorAll('button, a[href], select, input[type="checkbox"]')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (getComputedStyle(el).visibility === 'hidden') continue;
          // Une case masquée derrière un curseur est actionnée par ce dernier.
          if (el.type === 'checkbox' && getComputedStyle(el).opacity === '0') continue;
          if (r.width < seuil || r.height < seuil) {
            resultats.push(`${el.id || el.className || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
          }
        }
        return resultats;
      }, CIBLE_MINIMALE);

      expect(trop_petites, `cibles trop petites : ${trop_petites.join(' | ')}`).toEqual([]);
    });

    test('la saisie tactile d\'une charge aboutit', async ({ page }) => {
      // `tap` produit de vrais événements tactiles, là où `click` simule la
      // souris : un gestionnaire mal câblé passerait inaperçu autrement.
      await page.locator('#salaireVous').tap();
      await page.locator('#salaireVous').fill('2000');
      await page.locator('#salaireConjointe').tap();
      await page.locator('#salaireConjointe').fill('2000');
      await page.locator('#salaireConjointe').blur();

      await page.locator('#addVariableChargeBtn').tap();
      await page.locator('#variableChargeDescription').fill('Courses du samedi');
      await page.locator('#variableChargeAmount').fill('45');
      await page.locator('#variableChargeCategory').selectOption({ index: 1 });
      await page.locator('#variableChargePaidBy').selectOption('vous');
      await page.locator('#saveVariableCharge').tap();

      await expect(page.locator('#variableChargesList').getByText('Courses du samedi'))
        .toBeVisible({ timeout: 5000 });
    });

    test('un champ reste visible quand on le met au point', async ({ page }) => {
      // Sur mobile, le clavier virtuel recouvre le bas de l'écran. Un champ
      // situé dans cette zone doit au moins être remonté par le navigateur ;
      // ce test vérifie qu'il n'est pas déjà hors cadre avant même le clavier.
      const champ = page.locator('#salaireConjointe');
      await champ.scrollIntoViewIfNeeded();
      await champ.tap();

      const boite = await champ.boundingBox();
      const hauteur = page.viewportSize().height;

      expect(boite.y).toBeGreaterThanOrEqual(0);
      expect(boite.y + boite.height).toBeLessThanOrEqual(hauteur);
    });

    test('la barre de solde reste visible au défilement', async ({ page }) => {
      await page.locator('#salaireVous').fill('2000');
      await page.locator('#salaireVous').blur();
      await page.locator('#salaireConjointe').fill('2000');
      await page.locator('#salaireConjointe').blur();

      await page.locator('#addVariableChargeBtn').tap();
      await page.locator('#variableChargeDescription').fill('Une charge');
      await page.locator('#variableChargeAmount').fill('100');
      await page.locator('#variableChargeCategory').selectOption({ index: 1 });
      await page.locator('#variableChargePaidBy').selectOption('vous');
      await page.locator('#saveVariableCharge').tap();
      await expect(page.locator('#balanceBar')).toBeVisible({ timeout: 5000 });

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);

      // La barre est en position collante : elle doit rester à l'écran.
      const boite = await page.locator('#balanceBar').boundingBox();
      expect(boite).not.toBeNull();
      expect(boite.y).toBeLessThan(page.viewportSize().height);
    });
  });
}

test.describe('Installation en application', () => {
  test.use({ ...profilMobile(devices['Pixel 5']) });

  test('le manifeste déclare ce qu\'exige une installation', async ({ page, request }) => {
    await page.goto('/FairSplit.html');

    const reponse = await request.get('/manifest.json');
    expect(reponse.ok()).toBeTruthy();

    const manifeste = await reponse.json();
    expect(manifeste.name).toBeTruthy();
    expect(manifeste.short_name).toBeTruthy();
    expect(manifeste.start_url).toBeTruthy();
    expect(manifeste.display).toBe('standalone');

    // Une icône « any » ne suffit pas : le lanceur Android rogne l'icône selon
    // sa propre forme. Sans variante « maskable », le motif est amputé.
    const tailles = (manifeste.icons || []).map(i => i.sizes);
    expect(tailles).toContain('192x192');
    expect(tailles).toContain('512x512');
    expect((manifeste.icons || []).some(i => (i.purpose || '').includes('maskable'))).toBe(true);
  });

  test('les icônes déclarées existent réellement', async ({ request }) => {
    // Un manifeste valide pointant vers des fichiers absents produit une
    // installation sans icône, sans erreur visible.
    const manifeste = await (await request.get('/manifest.json')).json();

    for (const icone of manifeste.icons || []) {
      const reponse = await request.get(`/${icone.src.replace(/^\.?\//, '')}`);
      expect(reponse.ok(), `icône manquante : ${icone.src}`).toBeTruthy();
    }
  });

  test('le service worker s\'enregistre', async ({ page }) => {
    await page.goto('/FairSplit.html');

    const enregistre = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'non pris en charge';
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? 'enregistré' : 'absent';
    });

    expect(enregistre).toBe('enregistré');
  });
});
