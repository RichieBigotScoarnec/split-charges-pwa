import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Le grand-livre du bilan ne fait pas défiler la page en travers.
 *
 * `.summary-details` (`summary.js:873`) décompose le total du mois par personne.
 * Ses lignes sont des `flex` dont le libellé porte `flex-shrink: 0`
 * (`summary.css:35`) : au lieu de s'enrouler, le libellé pousse la ligne, la
 * ligne pousse le conteneur, et le conteneur pousse la page.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI UN FICHIER NEUF, ET PAS UN CAS DE `coherence-visuelle`
 *
 * Son contrôle « aucun texte n'est coupé » ne peut PAS voir ce défaut, et ce
 * n'est pas un seuil à ajuster — ce sont deux propriétés différentes. Il mesure
 * un **rognage DANS une boîte** : `scrollWidth > width` sur les FEUILLES. Ici la
 * boîte **grandit**, et c'est son parent qui déborde.
 *
 * Mesuré à 320 px, dépliant ouvert, prénom de 25 caractères — trois portes
 * fermées d'un coup :
 *
 *   - les lignes qui portent un prénom contiennent un `.summary-percent`
 *     imbriqué : ce ne sont pas des feuilles, elles sont écartées d'office ;
 *   - là où le `<span>` EST une feuille, `flex-shrink: 0` le porte à
 *     `max-content` : il ne déborde pas de lui-même, relevé nul sur les cinq
 *     lignes ;
 *   - `.summary-row` a des enfants, donc `continue`.
 *
 * Et « aucune commande ne dépasse de l'écran » est aveugle aussi, bien que les
 * deux lignes `.summary-row--ouvrable` soient des `<button>` : leur boîte
 * s'arrête à x = 278 sur 320. C'est leur CONTENU qui les déborde, pas elles qui
 * débordent l'écran.
 *
 * La propriété qui l'attrape est celle-ci : la page ne défile pas en travers.
 * `mobile.spec.js` la porte déjà, mais sur des profils d'appareil (Pixel 5,
 * 393 px) et avec les prénoms par défaut — un contrôle juste, qui ne visite pas
 * le cas.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LE MUTANT EST DANS L'APPLICATION, PAS DANS LE TEST
 *
 * `#prenomVous` accepte `maxlength="30"`. Le libellé long n'est donc pas un cas
 * forgé pour l'occasion : c'est ce que l'écran de réglages laisse saisir.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QU'IL NE COUVRE PAS, ET QUI RESTE OUVERT
 *
 * Avec un prénom COURT, `.summary-details` déborde déjà son conteneur de 8 px
 * (`scrollWidth` 226 pour 218) — sans que la page défile pour autant. Ce
 * contrôle est donc **vert sur ce cas-là**, et ne peut rien en dire : voir le
 * gotcha « le grand-livre déborde son conteneur de 8 px » dans `CLAUDE.md`. Il
 * ne se refermera pas sur le vert de ce fichier.
 */

test.use({ viewport: { width: 320, height: 720 } });

/** Exactement 30 caractères — la limite que `#prenomVous` laisse saisir. */
const PRENOM_LONG = 'Bartholomew-Maximilien Leonard';

/** Salaires, deux charges, et un prénom : de quoi rendre le grand-livre. */
async function semer(page, prenom) {
  await allerAuPanneau(page, 'panneauReglages');
  await page.locator('#salaireVous').fill('2500');
  await page.locator('#salaireVous').blur();
  await page.locator('#salaireConjointe').fill('1800');
  await page.locator('#salaireConjointe').blur();
  await page.locator('#prenomVous').fill(prenom);
  await page.locator('#prenomVous').blur();
  await page.waitForTimeout(600);

  const periode = await page.locator('#periodSelect').inputValue();
  await page.evaluate(async ({ periode }) => {
    const { dbUpdate } = await import('/js/db.js');
    await dbUpdate(undefined, {
      [`periods/${periode}/variableCharges/v1`]: {
        description: 'Courses', amount: 420.5, category: 'Courses',
        paidBy: 'vous', date: `${periode}-03`, deleted: false
      },
      [`periods/${periode}/variableCharges/v2`]: {
        description: 'Festival', amount: 45, category: 'Loisirs',
        paidBy: 'conjointe', date: `${periode}-05`, deleted: false
      }
    });
    await window.changePeriod(periode);
  }, { periode });
  await page.waitForTimeout(1500);

  await allerAuPanneau(page, 'panneauBilan');
  await page.waitForTimeout(400);
}

/** Déplie le grand-livre. Fermé, son contenu n'est pas à l'écran. */
async function deplierLeGrandLivre(page) {
  const bascule = page.locator('.summary-details > summary');
  await expect(bascule, 'le dépliant du bilan est introuvable').toHaveCount(1);
  await bascule.click();
  await expect(
    page.locator('.summary-details'),
    'le dépliant ne s\'est pas ouvert'
  ).toHaveAttribute('open', '');
  await page.waitForTimeout(400);
}

test('le grand-livre ne fait pas défiler la page en travers', async ({ page }) => {
  test.setTimeout(120000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semer(page, PRENOM_LONG);
  await deplierLeGrandLivre(page);

  /**
   * LES PRÉMISSES, ET ELLES NE SONT PAS DÉCORATIVES.
   *
   * L'assertion finale s'écrit `<=`. Elle est donc satisfaite par une page qui
   * n'a rendu aucun grand-livre : pas de lignes, rien à déborder, vert. Les
   * trois prémisses bornent le contrôle par le bas — ce qu'il mesure existe,
   * porte le prénom long, et compte assez de lignes pour que le défaut puisse
   * paraître.
   */
  await expect(
    page.locator('.summary-details .summary-row'),
    'prémisse : le grand-livre doit porter des lignes'
  ).not.toHaveCount(0);

  await expect(
    page.locator('.summary-details'),
    'prémisse : le prénom long doit être rendu DANS le grand-livre'
  ).toContainText(PRENOM_LONG);

  expect(
    await page.locator('#prenomVous').inputValue(),
    'prémisse : le prénom saisi n\'a pas été tronqué par maxlength'
  ).toBe(PRENOM_LONG);

  const mesure = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    fenetre: window.innerWidth
  }));

  expect(
    mesure.page,
    `la page défile en travers : ${mesure.page} px de contenu pour ${mesure.fenetre} px d'écran`
  ).toBeLessThanOrEqual(mesure.fenetre);
});
