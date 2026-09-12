import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * `allerAuPanneau` doit distinguer deux absences que rien ne séparait.
 *
 * Le banc d'essai amène l'écran sur un panneau en touchant son onglet, et sa
 * garde rend `false` quand l'onglet n'est pas visible :
 *
 *     if (!(await onglet.isVisible())) return false;
 *
 * Cette garde est là pour une raison juste — au-delà de 900 px la barre
 * n'existe pas, les trois panneaux ont leurs colonnes, et l'appel doit être un
 * no-op. Mais elle confond ce cas légitime avec un tout autre : une barre
 * ATTENDUE dont l'onglet a disparu.
 *
 * Mesuré contre un vrai Chromium avant d'écrire ce fichier :
 *
 *   - `isVisible()` sur zéro correspondance rend `false`, il ne lève pas ;
 *   - les 58 appels de la suite ignorent tous le booléen rendu.
 *
 * Donc, si la barre d'onglets change de destinations, les balayages de
 * `encre-rendue.spec.js` et `cible-tactile.spec.js` ne deviennent pas rouges :
 * ils tournent TROIS FOIS sur le panneau courant et restent verts en mesurant
 * le tiers des surfaces. Leurs deux témoins ne l'attrapent pas — « plus de 40
 * textes visibles » et « plus de 3 commandes par panneau » sont satisfaits par
 * le même panneau compté trois fois. `coherence-visuelle.spec.js` a le même
 * angle mort, par un autre chemin : `if (!barre) return null` ne pousse rien,
 * et `expect([]).toEqual([])` passe.
 *
 * C'est le cinquième site du motif que ce dépôt a consigné quatre fois : un
 * contrôle qui ne mesure rien est pire qu'un contrôle absent.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QUI SÉPARE LES DEUX CAS
 *
 * Pas la largeur. Un seuil en pixels recopié ici serait un troisième endroit
 * où 900 est écrit, et il mentirait le jour où la mise en page change de point
 * de rupture. La question honnête est : LA SURFACE EST-ELLE DÉJÀ LÀ ?
 *
 *   - une commande le nomme    → on la touche, c'est le chemin nominal ;
 *   - sinon le panneau est visible → il n'y avait rien à faire, absence légitime ;
 *   - sinon un voisin le fait paraître → le chemin existe sans porter son nom ;
 *   - sinon                    → la surface est inatteignable, et il faut le dire.
 *
 * Relevé sur l'application réelle, et c'est ce qui fonde la règle :
 *
 *   1280 px, tableau de bord    aucune commande, charges VISIBLES
 *   1280 px, écran Réglages     aucune commande ne nomme les charges ;
 *                               « Retour » les fait paraître
 *   390 px intact               barre présente, onglet visible, panneau caché
 *   390 px sabordé              barre présente, onglet ABSENT, panneau CACHÉ
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI QUATRE CAS ET NON UN SEUL
 *
 * Le cas décisif est le dernier. Les autres sont ses témoins : sans eux, une
 * garde qui lèverait TOUJOURS les satisferait, et les suites qui appellent la
 * garde à 1280 px deviendraient rouges pour rien. On mesure ici une
 * DISTINCTION, pas une sévérité.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QUE LE LOT E A CHANGÉ ICI — 2026-09-11
 *
 * Le premier témoin exigeait qu'à 1280 px Réglages soit « bien à l'écran »
 * sans onglet. C'était vrai tant qu'il avait une colonne ; le lot E l'a sorti
 * du tableau de bord. La prémisse est devenue fausse, l'ARGUMENT non : il
 * existe au bureau un panneau visible qu'aucune commande ne nomme, et la
 * garde doit se taire devant lui. Ce panneau est désormais celui des charges.
 */

/** L'onglet visé pour le sabordage : celui que la maquette sort de la barre. */
const PANNEAU = 'panneauReglages';

/** Au bureau, un panneau du tableau de bord qu'aucune commande ne nomme. */
const PANNEAU_DU_TABLEAU = 'panneauCharges';

test('la barre absente d\'un grand écran reste une absence légitime', async ({ page }) => {
  // Témoin n° 1 — au-delà de 900 px, le bilan et les charges ont leurs
  // colonnes. La garde doit se taire : c'est la raison pour laquelle elle
  // existe, et aucune correction ne doit la lui retirer.
  await page.setViewportSize({ width: 1280, height: 900 });
  await setupFirebaseMock(page);
  await waitForApp(page);

  await expect(
    page.locator(`.onglet[data-panneau="${PANNEAU_DU_TABLEAU}"]`),
    'prémisse : la barre n\'est pas rendue à cette largeur'
  ).toBeHidden();

  await expect(
    page.locator(`#${PANNEAU_DU_TABLEAU}`),
    'prémisse : le panneau, lui, est bien à l\'écran'
  ).toBeVisible();

  const bouge = await allerAuPanneau(page, PANNEAU_DU_TABLEAU);
  expect(bouge, 'aucune commande n\'a été touchée, et c\'est normal').toBe(false);
});

test('au bureau, un chemin qui ne porte pas le nom du panneau reste un chemin', async ({ page }) => {
  // Témoin n° 3 — né avec le lot E. Réglages s'ouvre par sa porte ; depuis
  // lui, aucune commande ne nomme les charges, et « Retour au tableau de
  // bord » les fait pourtant paraître. Une garde qui ne suivrait que les
  // commandes nommées lèverait ici sur un écran parfaitement atteignable.
  await page.setViewportSize({ width: 1280, height: 900 });
  await setupFirebaseMock(page);
  await waitForApp(page);

  expect(await allerAuPanneau(page, PANNEAU), 'la porte ⚙️ nomme Réglages').toBe(true);
  await expect(page.locator(`#${PANNEAU}`)).toBeVisible();
  await expect(
    page.locator(`#${PANNEAU_DU_TABLEAU}`),
    'prémisse : sur l\'écran Réglages, les charges ne sont pas rendues'
  ).toBeHidden();

  expect(await allerAuPanneau(page, PANNEAU_DU_TABLEAU), 'le retour les a fait paraître').toBe(true);
  await expect(page.locator(`#${PANNEAU_DU_TABLEAU}`)).toBeVisible();
});

test('l\'onglet présent mène bien au panneau', async ({ page }) => {
  // Témoin n° 2 — le chemin nominal sous 900 px. Sans lui, une garde qui
  // refuserait tout passerait le cas décisif.
  await page.setViewportSize({ width: 390, height: 844 });
  await setupFirebaseMock(page);
  await waitForApp(page);

  const bouge = await allerAuPanneau(page, PANNEAU);
  expect(bouge, 'la barre est là, l\'onglet répond').toBe(true);
  await expect(page.locator(`#${PANNEAU}`)).toBeVisible();
});

test('un panneau devenu inatteignable est signalé, jamais tu', async ({ page }) => {
  /**
   * LE CAS DÉCISIF.
   *
   * On reproduit exactement ce que ferait une refonte de la navigation : la
   * barre reste, l'onglet visé n'y est plus. Le panneau existe encore dans le
   * document, mais sans `panneau--actif` il n'est pas rendu — donc plus aucun
   * chemin ne mène à sa surface.
   *
   * Le sabordage porte sur le DOM et non sur le code de l'application : ce
   * fichier mesure la GARDE, pas la barre d'onglets. `onglets.spec.js` tient
   * la barre, et c'est une autre affaire.
   */
  await page.setViewportSize({ width: 390, height: 844 });
  await setupFirebaseMock(page);
  await waitForApp(page);

  await page.evaluate((id) => {
    document.querySelector(`.onglet[data-panneau="${id}"]`)?.remove();
  }, PANNEAU);

  await expect(
    page.locator(`.onglet[data-panneau="${PANNEAU}"]`),
    'prémisse : l\'onglet a bien disparu'
  ).toHaveCount(0);

  await expect(
    page.locator(`#${PANNEAU}`),
    'prémisse : et le panneau n\'est pas rendu pour autant'
  ).toBeHidden();

  // Rendre `false` ici, c'est laisser le balayage tourner sur le panneau
  // courant en croyant visiter les réglages. La garde doit lever.
  await expect(
    allerAuPanneau(page, PANNEAU),
    'un panneau qu\'aucun chemin n\'atteint doit faire tomber le contrôle'
  ).rejects.toThrow(new RegExp(PANNEAU));
});
