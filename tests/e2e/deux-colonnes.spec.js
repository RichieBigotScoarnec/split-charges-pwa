import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Lot E — deux colonnes au lieu de trois.
 *
 * La maquette (`design/tableau-de-bord.html`, planche 1) montre au bureau DEUX
 * colonnes : le bilan, et les charges. Rappels, salaires et outils n'y sont
 * pas — ils vivent derrière la pastille « ⚙️ Réglages » de l'en-tête, et
 * l'écran qu'elle ouvre commence par « ← Retour au tableau de bord »
 * (planche 3).
 *
 * Mesuré avant le lot, le 2026-09-11, sur l'application réelle :
 *
 *   900 et 1280 px   Réglages empilé SOUS le bilan, dans la colonne de gauche
 *   1600 et 2560 px  Réglages en troisième colonne
 *
 * Les propriétés portent sur ce que l'écran MONTRE — quels panneaux sont
 * rendus, où, et par quel chemin on atteint l'autre —, jamais sur une règle
 * CSS ni sur un nom de classe de colonne : une grille réécrite demain doit les
 * laisser intactes si elle tient la même promesse, et les faire tomber sinon.
 *
 * Et « Réglages n'est pas à l'écran » se prouve par son CONTENU, pas par son
 * conteneur : un rappel, un salaire, un titre d'outil. Un contrôle qui ne
 * regarderait que `#panneauReglages` resterait vert le jour où les salaires
 * déménageraient dans une autre boîte restée affichée.
 */

const PANNEAUX = ['panneauBilan', 'panneauCharges', 'panneauReglages'];

/** Ce que Réglages porte : une section par nature de réglage. */
const CONTENU_DES_REGLAGES = ['#sectionRappels', '#salaireVous', '.outils-titre'];

/** La porte, cherchée là où la maquette la pose : dans l'en-tête. */
const PORTE = '#mainApp > header [data-panneau="panneauReglages"]';

/** Les panneaux que le moteur rend réellement — `checkVisibility`, pas une classe. */
async function panneauxRendus(page) {
  return page.evaluate(
    (ids) => ids.filter((id) => document.getElementById(id)?.checkVisibility()),
    PANNEAUX
  );
}

const BUREAU = [
  { largeur: 900, hauteur: 900 },
  { largeur: 1280, hauteur: 900 },
  { largeur: 1600, hauteur: 900 },
  { largeur: 2560, hauteur: 1440 }
];

for (const { largeur, hauteur } of BUREAU) {
  test.describe(`Au bureau — ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: hauteur } });

    test.beforeEach(async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
    });

    test('la tête du bilan couvre les deux colonnes ; dessous, les charges à gauche et les cartes à droite', async ({ page }) => {
      expect(await panneauxRendus(page), 'panneaux rendus à l\'ouverture')
        .toEqual(['panneauBilan', 'panneauCharges']);

      // La silhouette des planches 1 et 2 : la tête en pleine largeur, puis
      // deux colonnes — les charges, larges, à gauche ; les cartes du bilan à
      // droite. Le témoin de la colonne de droite est la carte des
      // enveloppes : sur un mois vide, c'est la seule que le bilan rende.
      //
      // Ce témoin a d'abord été la carte des TENDANCES, sur la foi qu'elle
      // paraît toujours. Elle ne paraît pas sans données : sa boîte valait
      // (0, 0, 0, 0), et « la tête s'étend au-dessus des cartes » se
      // comparait à une gauche de ZÉRO — satisfaite par le vide, dès le rouge.
      // D'où le témoin positif ci-dessous.
      const g = await page.evaluate(() => {
        const r = (el) => { const b = el.getBoundingClientRect(); return { haut: b.top, bas: b.bottom, gauche: b.left, droite: b.right, largeur: b.width }; };
        return {
          tete: r(document.getElementById('summarySection')),
          charges: r(document.getElementById('panneauCharges')),
          cartes: r(document.querySelector('[data-action="showManageEnvelopesModal"]').closest('section'))
        };
      });

      expect(g.cartes.largeur, 'prémisse : le témoin de la colonne des cartes est rendu').toBeGreaterThan(0);
      expect(g.tete.largeur, 'prémisse : la tête est rendue').toBeGreaterThan(0);

      expect(g.tete.gauche, 'la tête commence au-dessus des charges').toBeLessThan(g.charges.droite);
      expect(g.tete.droite, 'la tête s\'étend au-dessus des cartes').toBeGreaterThan(g.cartes.gauche);
      expect(g.charges.haut, 'les charges viennent sous la tête').toBeGreaterThanOrEqual(g.tete.bas);
      expect(g.cartes.haut, 'les cartes viennent sous la tête').toBeGreaterThanOrEqual(g.tete.bas);

      // Côte à côte : une colonne qui décroche passe à la rangée suivante et
      // allonge la page de toute sa hauteur.
      expect(g.charges.droite, 'les charges sont à gauche des cartes').toBeLessThanOrEqual(g.cartes.gauche);
      expect(g.cartes.haut, 'les cartes partagent la rangée des charges').toBeLessThan(g.charges.bas);
      expect(g.charges.largeur, 'les charges sont la colonne large').toBeGreaterThan(g.cartes.largeur);

      for (const s of CONTENU_DES_REGLAGES) {
        await expect(page.locator(s).first(), `${s} ne doit pas être sur le tableau de bord`)
          .toBeHidden();
      }
    });

    test('« ⚙️ Réglages », dans l\'en-tête, ouvre les réglages ; « Retour » ramène au tableau de bord', async ({ page }) => {
      const porte = page.locator(PORTE);
      await expect(porte, 'la porte des réglages est dans l\'en-tête').toBeVisible();
      await expect(porte).toHaveText(/Réglages/);

      await porte.click();
      await expect.poll(() => panneauxRendus(page), 'après ⚙️, l\'écran Réglages et lui seul')
        .toEqual(['panneauReglages']);
      for (const s of CONTENU_DES_REGLAGES) {
        await expect(page.locator(s).first(), `${s} doit être sur l'écran Réglages`).toBeVisible();
      }

      const retour = page.getByRole('button', { name: /retour au tableau de bord/i });
      await expect(retour).toBeVisible();
      await retour.click();
      await expect.poll(() => panneauxRendus(page), 'après « Retour », le tableau de bord entier')
        .toEqual(['panneauBilan', 'panneauCharges']);
    });

    test('le geste retour du navigateur referme les réglages', async ({ page }) => {
      // Au bureau, l'écran Réglages remplace le tableau de bord : c'est une
      // couche, et le retour la referme au lieu de quitter l'application.
      await page.locator(PORTE).click();
      await expect.poll(() => panneauxRendus(page)).toEqual(['panneauReglages']);

      await page.evaluate(() => history.back());
      await expect.poll(() => panneauxRendus(page), 'le retour revient au tableau de bord')
        .toEqual(['panneauBilan', 'panneauCharges']);
    });
  });
}

test.describe('Sous 900 px, la navigation ne change pas', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** Toute commande VISIBLE qui désigne un panneau — l'en-tête compris. */
  async function commandesVisibles(page) {
    return page.evaluate(() => [...document.querySelectorAll('[data-panneau]')]
      .filter((c) => c.checkVisibility())
      .map((c) => `${c.closest('#onglets') ? 'onglet' : 'autre'}:${c.dataset.panneau}`));
  }

  const TROIS_ONGLETS = ['onglet:panneauBilan', 'onglet:panneauCharges', 'onglet:panneauReglages'];

  test('la barre du bas garde ses trois destinations, et rien ne les double', async ({ page }) => {
    // La maquette mobile garde « Bilan / Charges / Réglages » en bas : la porte
    // de l'en-tête et le « Retour » sont des commandes de BUREAU. Paraissant
    // ici, elles feraient deux chemins vers le même écran, sur la largeur où la
    // place se compte au pixel.
    await setupFirebaseMock(page);
    await waitForApp(page);

    await expect(page.locator('#onglets')).toBeVisible();
    expect(await commandesVisibles(page), 'depuis le bilan').toEqual(TROIS_ONGLETS);

    await page.locator('.onglet[data-panneau="panneauReglages"]').click();
    await expect(page.locator('#panneauReglages')).toBeVisible();
    expect(await commandesVisibles(page), 'depuis l\'onglet Réglages').toEqual(TROIS_ONGLETS);
  });
});
