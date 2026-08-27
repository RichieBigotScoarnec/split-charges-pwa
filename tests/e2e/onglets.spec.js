import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Trois destinations plutôt qu'un seul long écran
 *
 * La page principale empilait cinq sections et une rangée de dix boutons
 * d'outils. Sur un téléphone, répondre à « qui doit combien à qui » et
 * corriger une charge de la semaine passée demandaient le même geste : faire
 * défiler jusqu'à trouver.
 *
 * Le découpage suit la question qu'on se pose :
 *
 *     📊 Bilan     — où on en est
 *     🧾 Charges   — ce qu'on a dépensé
 *     ⚙️ Réglages  — ce qui ne bouge presque jamais
 *
 * Le point de rupture est celui qui existait déjà, 900 px : c'est là que la
 * mise en page passe en colonnes. **Au-delà, la barre disparaît et les trois
 * panneaux s'affichent ensemble** — masquer les deux tiers d'un grand écran
 * serait une régression, pas un rangement. Les deux régimes sont éprouvés ici.
 */

const TELEPHONE = { width: 390, height: 844 };
const ORDINATEUR = { width: 1280, height: 900 };

/** Les identifiants des panneaux réellement visibles */
async function panneauxVisibles(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.panneau')]
      .filter((p) => p.getBoundingClientRect().height > 0)
      .map((p) => p.id));
}

test.describe('Sur téléphone — un panneau à la fois', () => {
  test.use({ viewport: TELEPHONE });

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('la barre propose trois destinations', async ({ page }) => {
    await expect(page.locator('#onglets')).toBeVisible();
    await expect(page.locator('.onglet')).toHaveCount(3);
    await expect(page.locator('#onglets')).toContainText('Bilan');
    await expect(page.locator('#onglets')).toContainText('Charges');
    await expect(page.locator('#onglets')).toContainText('Réglages');
  });

  test('l\'application s\'ouvre sur le bilan', async ({ page }) => {
    // L'application répond à une question : elle doit la poser d'entrée.
    expect(await panneauxVisibles(page)).toEqual(['panneauBilan']);
  });

  for (const [nom, id] of [['Bilan', 'panneauBilan'], ['Charges', 'panneauCharges'], ['Réglages', 'panneauReglages']]) {
    test(`toucher « ${nom} » n'affiche que son panneau`, async ({ page }) => {
      await allerAuPanneau(page, id);
      expect(await panneauxVisibles(page)).toEqual([id]);
    });
  }

  test('l\'onglet courant est annoncé, et lui seul', async ({ page }) => {
    // La couleur seule ne suffirait pas — WCAG 1.4.1 — et un lecteur d'écran
    // n'en voit rien. `aria-current` porte l'information, et le liseré la
    // rend visible sans dépendre de la teinte.
    await allerAuPanneau(page, 'panneauCharges');
    await expect(page.locator('.onglet[aria-current="true"]')).toHaveCount(1);
    await expect(page.locator('.onglet[aria-current="true"]')).toContainText('Charges');
  });

  test('changer d\'onglet remonte en haut du nouveau panneau', async ({ page }) => {
    // Sans cela, on quitterait le bas du bilan pour le bas des charges, en
    // paraissant n'avoir rien fait.
    await allerAuPanneau(page, 'panneauReglages');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await allerAuPanneau(page, 'panneauCharges');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('la barre ne recouvre pas la fin du panneau', async ({ page }) => {
    // Le défaut classique d'une barre fixe : la dernière carte passe dessous
    // et devient illisible. `.container` réserve sa hauteur.
    await allerAuPanneau(page, 'panneauReglages');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const { basDuContenu, hautDeLaBarre } = await page.evaluate(() => {
      const panneau = document.getElementById('panneauReglages');
      const barre = document.getElementById('onglets');
      return {
        basDuContenu: panneau.getBoundingClientRect().bottom,
        hautDeLaBarre: barre.getBoundingClientRect().top
      };
    });

    expect(basDuContenu,
      'la dernière carte passe sous la barre d\'onglets').toBeLessThanOrEqual(hautDeLaBarre + 1);
  });

  test('le bouton flottant ne se pose pas sur la barre', async ({ page }) => {
    const chevauchement = await page.evaluate(() => {
      const fab = document.querySelector('.fab');
      const barre = document.getElementById('onglets');
      if (!fab || !barre) return null;
      return fab.getBoundingClientRect().bottom - barre.getBoundingClientRect().top;
    });

    expect(chevauchement, 'aucun bouton flottant trouvé').not.toBeNull();
    expect(chevauchement, 'le bouton flottant recouvre les onglets').toBeLessThanOrEqual(0);
  });

  test('le solde reste lisible depuis les trois onglets', async ({ page }) => {
    // La barre de solde vit hors des panneaux, au-dessus d'eux : c'est ce qui
    // permet de changer d'onglet sans perdre de vue la réponse.
    await allerAuPanneau(page, 'panneauReglages');
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();
    await page.waitForTimeout(400);

    for (const id of ['panneauBilan', 'panneauCharges', 'panneauReglages']) {
      await allerAuPanneau(page, id);
      const dansUnPanneau = await page.evaluate(() =>
        Boolean(document.getElementById('balanceBar').closest('.panneau')));
      expect(dansUnPanneau, 'la barre de solde a été enfermée dans un panneau').toBe(false);
    }
  });

  test('la saisie rapide reste joignable depuis n\'importe quel onglet', async ({ page }) => {
    // Le geste le plus fréquent de l'application ne doit dépendre d'aucun
    // onglet : le bouton flottant et sa modale vivent hors des panneaux.
    for (const id of ['panneauBilan', 'panneauCharges', 'panneauReglages']) {
      await allerAuPanneau(page, id);
      await page.locator('.fab').click();
      await expect(page.locator('#modalQuickAdd')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#modalQuickAdd')).toBeHidden();
    }
  });
});

test.describe('Ce que chaque onglet porte', () => {
  test.use({ viewport: TELEPHONE });

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('le bilan ne garde que les lectures du mois', async ({ page }) => {
    // Dix boutons se disputaient cette rangée. N'y restent que les enveloppes
    // et le privé — la carte s'ajoute quand une dépense est localisée.
    const boutons = await page.locator('.acces-rapides .btn:visible').allInnerTexts();
    expect(boutons.length).toBeLessThanOrEqual(3);
    expect(boutons.join(' ')).toContain('Enveloppes');
    expect(boutons.join(' ')).toContain('Privé');
  });

  test('les huit autres outils sont dans les réglages, groupés', async ({ page }) => {
    await allerAuPanneau(page, 'panneauReglages');
    const reglages = page.locator('#panneauReglages');

    for (const outil of ['Catégories', 'Destinations', 'Sauvegarde', 'Corbeille', 'Export CSV', 'Imprimer PDF']) {
      await expect(reglages, `« ${outil} » introuvable dans les réglages`).toContainText(outil);
    }

    // Groupés, et non alignés à égalité : un intitulé au-dessus de deux
    // boutons se lit d'un coup d'œil, huit boutons en file se lisent un par un.
    const titres = (await reglages.locator('.outils-titre').allInnerTexts()).map((t) => t.toLowerCase());
    expect(titres).toEqual(['vos listes', 'vos données', 'sortir les données']);
  });

  test('les rappels ont quitté l\'écran d\'accueil', async ({ page }) => {
    // Trois bascules qu'on arme une fois n'ont rien à faire sur l'écran qu'on
    // ouvre dix fois par semaine.
    await expect(page.locator('#panneauBilan')).not.toContainText('Rappels');
    await allerAuPanneau(page, 'panneauReglages');
    await expect(page.locator('#panneauReglages')).toContainText('Rappels');
  });

  test('« Renseigner les salaires » traverse la frontière entre deux onglets', async ({ page }) => {
    // Le seul bouton de l'application qui vise un champ d'un autre panneau.
    // Sans changement d'onglet, `scrollIntoView` n'a nulle part où aller et
    // `focus()` échoue en silence : le bouton serait resté visible et inerte,
    // exactement là où l'application réclame une action. Défaut trouvé sur
    // une capture d'écran, pas dans le code.
    const bouton = page.locator('[data-action="focusSalaires"], [data-action="focusSalaries"]');
    await expect(bouton).toBeVisible();
    await bouton.click();

    await expect(page.locator('#panneauReglages')).toBeVisible();
    await expect(page.locator('#salaireVous')).toBeVisible();
    await expect(page.locator('#salaireVous')).toBeFocused({ timeout: 3000 });
  });

  test('les trois listes de charges tiennent dans un seul onglet', async ({ page }) => {
    await allerAuPanneau(page, 'panneauCharges');
    const charges = page.locator('#panneauCharges');
    await expect(charges).toContainText('Charges Variables');
    await expect(charges).toContainText('Charges Fixes');
    await expect(charges).toContainText('Remboursements');
  });
});

test.describe('Sur grand écran — la barre s\'efface', () => {
  test.use({ viewport: ORDINATEUR });

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('aucune barre d\'onglets', async ({ page }) => {
    await expect(page.locator('#onglets')).toBeHidden();
  });

  test('les trois panneaux sont affichés ensemble', async ({ page }) => {
    // La régression qu'on veut empêcher : appliquer le découpage mobile à un
    // écran de 1280 px reviendrait à cacher les deux tiers du contenu alors
    // qu'il y a la place de tout montrer.
    expect((await panneauxVisibles(page)).sort())
      .toEqual(['panneauBilan', 'panneauCharges', 'panneauReglages']);
  });

  test('les salaires restent joignables sans toucher un onglet', async ({ page }) => {
    await expect(page.locator('#salaireVous')).toBeVisible();
    await page.locator('#salaireVous').fill('2500');
    expect(await page.locator('#salaireVous').inputValue()).toBe('2500');
  });
});

test.describe('À l\'impression, tout se montre', () => {
  test.use({ viewport: TELEPHONE });

  test('les trois panneaux paraissent, la barre non', async ({ page }) => {
    // `export.js` construit sa propre page dans une nouvelle fenêtre : l'export
    // PDF ne dépend pas de ceci. Mais un Ctrl+P sur la page vivante ne doit pas
    // rendre le seul onglet ouvert — une feuille de comptes amputée des deux
    // tiers sans le dire est pire qu'une impression refusée.
    await setupFirebaseMock(page);
    await waitForApp(page);
    await page.emulateMedia({ media: 'print' });

    expect((await panneauxVisibles(page)).sort())
      .toEqual(['panneauBilan', 'panneauCharges', 'panneauReglages']);
    await expect(page.locator('#onglets')).toBeHidden();
  });
});
