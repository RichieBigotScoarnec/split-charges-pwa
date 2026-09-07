import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Ce que l'écran dit d'un mois qui n'est pas celui d'aujourd'hui
 *
 * ## Deux informations, et le badge les confondait
 *
 * « Archivé » est un **état** : on doit pouvoir le constater à tout moment,
 * parce qu'une charge saisie dans le mauvais mois se voit à ça.
 *
 * « Modifiable » est une **levée de malentendu** : rien n'empêche de corriger
 * un mois passé, et c'est voulu — l'instantané de salaires par période rend la
 * correction sûre (cf. `period.js`). On la lit **une fois en arrivant**, pas
 * pendant qu'on travaille.
 *
 * Le badge permanent tenait les deux ensemble, en permanence, pour **28 px de
 * premier écran** — mesuré : 20 px de ligne de texte plus 8 px de marge. Sur un
 * écran de 320 px, c'est la ressource la plus rare de l'application.
 *
 * L'état reste donc, dans le libellé du mois, **pour zéro pixel** ; la levée de
 * malentendu part dans un toast, à l'arrivée.
 *
 * ## Et le badge se trompait sur les mois à venir
 *
 * `updatePeriodInfo` comparait le mois affiché au mois réel et annonçait
 * « archivé » dès qu'ils différaient — donc aussi sur **octobre 2026**, un mois
 * qui n'a pas commencé. Mesuré le 2026-09-07.
 *
 * `utils/date.js` exporte pourtant `etatDuMois`, qui rend trois états et que le
 * bilan comme le rapport lisent déjà. C'est le défaut `normalizePair` : une
 * grandeur calculée à deux endroits, et c'est la seconde rédaction qui se
 * trompe. Ces contrôles tiennent les trois états.
 */

const TELEPHONE = { width: 390, height: 844 };

/** Le mois du calendrier, tel que l'application le calcule */
function moisReel() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Le libellé de l'option actuellement choisie */
const moisAffiche = (page) => page.evaluate(() => {
  const s = document.querySelector('#periodSelect');
  return s.options[s.selectedIndex].text;
});

async function ouvrir(page) {
  await setupFirebaseMock(page);
  await waitForApp(page);
}

/** Le mois précédent, par la flèche — le geste réel */
async function reculerDUnMois(page) {
  await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
  await page.waitForTimeout(800);
}

/** Le mois suivant */
async function avancerDUnMois(page) {
  await page.locator('[data-action="navigatePeriod"][data-arg="1"]').click();
  await page.waitForTimeout(800);
}

test.describe('L\'état du mois, dans le libellé', () => {
  test.use({ viewport: TELEPHONE });

  test.beforeEach(async ({ page }) => {
    await ouvrir(page);
  });

  test('le mois en cours ne porte aucun marqueur', async ({ page }) => {
    // La prémisse : sans elle, ce cas passerait sur n'importe quel mois.
    expect(await page.locator('#periodSelect').inputValue()).toBe(moisReel());
    expect(await moisAffiche(page)).not.toContain('📁');
  });

  test('un mois révolu porte le dossier', async ({ page }) => {
    await reculerDUnMois(page);
    expect(await moisAffiche(page)).toContain('📁');
  });

  test('un mois À VENIR n\'est appelé archivé NULLE PART sur l\'écran', async ({ page }) => {
    // ── Le cas qui tient le défaut, et il porte sur TOUT le bandeau ──
    //
    // Mesuré le 2026-09-07 : « octobre 2026 » affichait « 📁 Mois archivé —
    // modifiable ». Un mois qui n'a pas commencé n'est pas archivé, et le dire
    // est faux dans le sens qui coûte : cela invite à corriger un passé qui
    // n'existe pas.
    //
    // La première rédaction de ce cas ne regardait que le libellé du mois. Elle
    // passait au vert AVANT le correctif — le badge vivait ailleurs, dans
    // `#periodInfo` — donc elle ne mesurait rien du défaut qu'elle prétendait
    // tenir. Elle interroge la surface où le marqueur vit AUJOURD'HUI ; celle-ci
    // interroge l'écran, et survit au déplacement.
    await avancerDUnMois(page);

    expect(
      await page.locator('#periodSelect').inputValue(),
      'prémisse : le sélecteur doit avoir avancé, sinon ce cas remesure le mois courant'
    ).not.toBe(moisReel());

    const bandeau = (await page.locator('.period-navigation').innerText()).trim();
    expect(bandeau, `le bandeau annonce « ${bandeau} » sur un mois à venir`)
      .not.toMatch(/archiv/i);
  });

  test('un mois à venir ne porte pas le dossier non plus', async ({ page }) => {
    // Le pendant du précédent sur la surface du marqueur : une fois le dossier
    // posé dans le libellé, rien ne garantit qu'il distingue passé et futur.
    await avancerDUnMois(page);
    const libelle = await moisAffiche(page);
    expect(libelle, `le mois à venir est annoncé « ${libelle} »`).not.toContain('📁');
  });

  test('le marqueur suit le mois, aller et retour', async ({ page }) => {
    // Un marqueur qui se pose et ne se retire pas serait pire que pas de
    // marqueur : il dirait « archivé » sur le mois en cours.
    await reculerDUnMois(page);
    expect(await moisAffiche(page)).toContain('📁');

    await avancerDUnMois(page);
    expect(await page.locator('#periodSelect').inputValue()).toBe(moisReel());
    expect(await moisAffiche(page)).not.toContain('📁');
  });
});

test.describe('La levée de malentendu, à l\'arrivée', () => {
  test.use({ viewport: TELEPHONE });

  test.beforeEach(async ({ page }) => {
    await ouvrir(page);
  });

  /** Ce que la région vivante porte à l'instant */
  const messages = (page) => page.evaluate(() => {
    const c = document.querySelector('#toast-container');
    return c ? [...c.querySelectorAll('.toast')].map((t) => t.innerText.trim()) : [];
  });

  test('arriver sur un mois révolu annonce qu\'il reste modifiable', async ({ page }) => {
    expect(await messages(page), 'prémisse : aucun message avant le geste').toEqual([]);

    await reculerDUnMois(page);

    const lus = await messages(page);
    expect(lus.join(' | '), 'aucun message à l\'arrivée sur un mois révolu')
      .toContain('modifiable');
  });

  test('le message est annoncé aux lecteurs d\'écran', async ({ page }) => {
    await reculerDUnMois(page);
    const region = page.locator('#toast-container');
    await expect(region).toHaveAttribute('role', 'status');
    await expect(region).toHaveAttribute('aria-live', 'polite');
  });

  test('revenir au mois en cours n\'annonce rien', async ({ page }) => {
    await reculerDUnMois(page);
    await page.waitForTimeout(200);

    // On vide ce qui a été dit, pour ne mesurer que le geste suivant.
    await page.evaluate(() => {
      const c = document.querySelector('#toast-container');
      if (c) c.replaceChildren();
    });

    await avancerDUnMois(page);
    expect(await messages(page), 'le mois en cours n\'a aucun malentendu à lever')
      .toEqual([]);
  });

  test('un mois à venir n\'annonce rien non plus', async ({ page }) => {
    await avancerDUnMois(page);
    expect(await messages(page)).toEqual([]);
  });

  test('parcourir plusieurs mois révolus ne répète pas le message', async ({ page }) => {
    // Il se lit une fois par excursion dans le passé, pas une fois par mois
    // traversé : trois messages empilés pour trois flèches seraient du bruit,
    // et le dépôt a déjà payé la leçon des messages qui s'empilent.
    await reculerDUnMois(page);
    const apresLePremier = (await messages(page)).length;
    expect(apresLePremier, 'prémisse : le premier recul doit annoncer').toBeGreaterThan(0);

    await reculerDUnMois(page);
    await reculerDUnMois(page);

    expect(await messages(page), 'le message se répète à chaque mois traversé')
      .toHaveLength(apresLePremier);
  });
});

test.describe('Ce que la rangée du badge coûtait', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test('le premier contenu remonte de la hauteur du badge', async ({ page }) => {
    // Mesuré avant : 176 px à 320 px sur un mois révolu, contre 157 sur le mois
    // en cours — 19 px d'écart pour une ligne de texte et sa marge, sur
    // l'écran le plus serré. C'est ce que la rangée coûtait à chaque visite
    // d'un mois passé.
    //
    // Ce que ce cas verrouille n'est pas un pixel précis mais une ÉGALITÉ :
    // consulter un mois passé ne coûte plus rien de plus que le mois en cours.
    await ouvrir(page);

    const hautDeLaCarte = () => page.evaluate(() => {
      const c = document.querySelector('#panneauBilan .card');
      return c ? Math.round(c.getBoundingClientRect().top) : null;
    });

    const enCours = await hautDeLaCarte(page);
    expect(enCours, 'prémisse : aucune carte dans le bilan').not.toBeNull();

    await reculerDUnMois(page);
    const revolu = await hautDeLaCarte(page);

    expect(revolu, `mois en cours ${enCours} px, mois révolu ${revolu} px`)
      .toBe(enCours);
  });
});
