import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * La dépense perso, du geste jusqu'au solde
 *
 * Les tests unitaires prouvent que `computeSummary` ignore une charge marquée
 * solo. Ils ne prouvent pas qu'on puisse en saisir une, ni que le bilan affiché
 * soit celui qu'ils calculent — c'est le trajet complet qui compte, et c'est
 * lui qu'un défaut d'interface casse sans qu'aucun test pur ne bronche.
 *
 * Trois choses à établir ici :
 *
 * 1. Une dépense perso s'écrit avec `perimetre: 'solo'` en base, depuis les
 *    deux chemins de saisie — le formulaire complet et la saisie rapide.
 * 2. Le solde du couple ne bouge pas d'un centime, alors que la liste, elle,
 *    l'affiche.
 * 3. L'interface interdit d'elle-même l'état que les règles refuseraient :
 *    une dépense perso ne peut pas être « partagée ».
 */

/** Renseigne les deux salaires : sans eux, le prorata ne rend aucun bilan */
async function poserLesSalaires(page) {
  // Les salaires vivent dans Réglages, qui au bureau REMPLACE le tableau de
  // bord (lot E) : on y va, puis on revient où le reste du cas se joue.
  await allerAuPanneau(page, 'panneauReglages');
  await page.locator('#salaireVous').fill('2000');
  await page.locator('#salaireVous').blur();
  await page.locator('#salaireConjointe').fill('3000');
  await page.locator('#salaireConjointe').blur();
  await page.waitForTimeout(500);
  await allerAuPanneau(page, 'panneauBilan');
}

/** Le solde net affiché, en nombre */
async function soldeAffiche(page) {
  const texte = await page.locator('#summarySection').innerText();
  const trouve = texte.match(/(\d[\d\s]*[,.]\d{2})\s*€/);
  return trouve ? parseFloat(trouve[1].replace(/\s/g, '').replace(',', '.')) : null;
}

test.describe('La dépense perso', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await poserLesSalaires(page);
  });

  test('le formulaire complet l\'écrit avec son périmètre', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Coiffeur');
    await page.locator('#variableChargeAmount').fill('45');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(500);

    // ⚠️ LE CHEMIN A CHANGÉ AU LOT P1b, et c'est tout l'objet du lot.
    //
    // Ce cas lisait `periods/{mois}/variableCharges` — la poche COMMUNE — et il
    // était vert : une dépense perso portait bien son périmètre, donc restait
    // hors du solde, mais elle vivait dans le commun, **lisible par l'autre
    // sans aucun aval**. Le contrat tenu ici était celui du défaut.
    //
    // Il porte désormais sur les deux moitiés de la propriété : elle est DANS
    // la poche, et elle n'est PLUS dans le commun. La seconde compte autant —
    // une écriture qui aurait laissé son origine en place ferait compter la
    // dépense deux fois.
    const { poche, commun } = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      const periode = window.__periodeCourante || document.getElementById('periodSelect')?.value;
      return {
        poche: Object.values(
          await dbGet(`personnel/vous/periods/${periode}/variableCharges`) || {}),
        commun: Object.values(await dbGet(`periods/${periode}/variableCharges`) || {})
      };
    });

    expect(poche).toHaveLength(1);
    expect(poche[0].perimetre).toBe('solo');
    expect(poche[0].paidBy).toBe('vous');
    expect(commun).toHaveLength(0);
  });

  test('cocher « perso » ferme « Partagé » et la répartition spéciale', async ({ page }) => {
    // L'interface refuse d'elle-même l'état que les règles Firebase
    // refuseraient : une dépense perso appartient à qui l'a payée. Sans ce
    // couplage, la saisie partirait, serait rejetée côté serveur, et — hors
    // ligne — irait grossir la file d'attente pour échouer plus tard, loin du
    // geste qui l'a produite.
    await page.locator('#addVariableChargeBtn').click();

    const partage = page.locator('#variableChargePaidBy option[value="partage"]');
    await expect(partage).toBeEnabled();

    await page.locator('#variableChargePerso + .toggle-slider').click();
    await expect(partage).toBeDisabled();
    await expect(page.locator('#variableChargeSplitToggle')).toBeDisabled();

    // Et la porte se rouvre quand on décoche.
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await expect(partage).toBeEnabled();
    await expect(page.locator('#variableChargeSplitToggle')).toBeEnabled();
  });

  test('« Partagé » redevient choisissable à l\'ouverture suivante', async ({ page }) => {
    // `form.reset()` décoche la case, mais ne rouvre pas ce que la bascule
    // avait fermé : sans rappel explicite, une seule saisie perso rendrait
    // toutes les suivantes impossibles à partager, jusqu'au rechargement.
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#modalAddVariableCharge')).toBeHidden();

    await page.locator('#addVariableChargeBtn').click();
    await expect(page.locator('#variableChargePerso')).not.toBeChecked();
    await expect(page.locator('#variableChargePaidBy option[value="partage"]')).toBeEnabled();
  });

  test('le solde ne bouge pas, et « À deux » ne la montre PLUS — mais dit où elle est', async ({ page }) => {
    // ⚠️ CE CAS TENAIT LA PROPRIÉTÉ D'AVANT LE LOT P2, et il était juste :
    // « À deux » montrait le commun ET le personnel, avec un badge « perso »
    // pour les distinguer. C'est très exactement ce que P2 retire — la
    // commande promettait un filtre qu'elle n'appliquait pas.
    //
    // Il n'est donc pas supprimé, il change de propriété, et la nouvelle est
    // PLUS forte que l'ancienne : le solde ne bouge pas, la dépense quitte la
    // liste du foyer, **et l'écran dit où elle est allée**. Ce dernier tiers
    // est le seul qui referme le défaut que filtrer crée : une dépense saisie
    // qui devient introuvable.
    //
    // Une charge commune d'abord, pour que le solde ait une valeur à ne pas
    // changer. Un solde resté à zéro passerait le test sans rien prouver.
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Courses');
    await page.locator('#variableChargeAmount').fill('300');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(500);

    const soldeAvant = await soldeAffiche(page);
    expect(soldeAvant).not.toBeNull();
    expect(soldeAvant).toBeGreaterThan(0);

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Coiffeur');
    await page.locator('#variableChargeAmount').fill('45');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(600);

    expect(await soldeAffiche(page)).toBe(soldeAvant);

    // La liste du foyer garde le commun et perd le personnel. Les deux
    // moitiés comptent : sans la première, un filtre qui aurait tout retiré
    // passerait.
    await expect(page.locator('#variableChargesList')).toContainText('Courses');
    await expect(page.locator('#variableChargesList')).not.toContainText('Coiffeur');
    // ── LE BADGE NE PARAÎT QUE SUR UNE LISTE QUI MÉLANGE LES DEUX NATURES ──
    //
    // Ce cas exigeait « aucun badge sous À deux », et c'était vrai mais trop
    // étroit : la propriété ne parle pas de cette portée, elle parle de ce que
    // la liste montre. Une liste d'une SEULE nature ne porte aucun badge — ici
    // le commun seul, et sous « Moi ce mois » le personnel seul, où les trois
    // lignes le portaient TOUTES sans rien distinguer.
    //
    // Son témoin est de l'autre côté : `portee-filtre-la-liste.spec.js` sème
    // une liste MIXTE sous « Privé » et exige que le badge y soit. Sans lui,
    // ce zéro serait satisfait par un badge supprimé partout.
    const badges = page.locator('#variableChargesList .charge-perimetre-tag');
    await expect(badges, 'liste toute commune : rien à distinguer').toHaveCount(0);

    // Et sous « Moi ce mois », liste toute personnelle : pas davantage.
    await page.locator('#panneauCharges [data-portee="solo"]').click();
    await page.waitForTimeout(600);
    await expect(page.locator('#variableChargesList')).toContainText('Coiffeur');
    await expect(badges, 'liste toute personnelle : rien à distinguer non plus')
      .toHaveCount(0);
    await page.locator('#panneauCharges [data-portee="deux"]').click();
    await page.waitForTimeout(600);

    // Le renvoi la CHIFFRE et la NOMME. Sans lui, le filtre ci-dessus serait
    // une perte sèche.
    const renvoi = page.locator('#variableChargesRenvoi');
    await expect(renvoi).toBeVisible();
    await expect(renvoi).toContainText('1 dépense perso');
    expect((await renvoi.innerText()).replace(/\s/g, '')).toContain('45,00');

    // ET ELLE EST RETROUVABLE PAR CE GESTE — c'est la propriété entière.
    // « Moi ce mois » n'est pas filtré par ce lot, délibérément : la dépense y
    // est, et le renvoi y mène.
    await renvoi.locator('button[data-action="allerALaPortee"]').click();
    await expect(page.locator('#variableChargesList')).toContainText('Coiffeur');
  });

  test('le pied dit le commun SEUL, et c\'est l\'en-tête de catégorie qui nomme le perso', async ({ page }) => {
    // ⚠️ MÊME DÉPLACEMENT QUE LE CAS PRÉCÉDENT. Ce cas exigeait que le pied
    // annonce les DEUX totaux, et sa raison était bonne : « un total unique
    // contredirait le bilan affiché juste au-dessus ». Le lot P2 la satisfait
    // autrement, et mieux — le pied ne compte plus que ce que la liste montre,
    // donc il DIT le chiffre du bilan au lieu d'en annoncer un second à côté.
    //
    // Ce qui ne pouvait pas disparaître, c'est que le personnel soit NOMMÉ
    // quelque part : mesuré à la main sur septembre 2026, « Courses »
    // annonçait 381,75 € dont 10,00 de personnel, sans le dire. C'est
    // l'en-tête de catégorie qui le porte désormais.
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Courses');
    await page.locator('#variableChargeAmount').fill('300');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(400);

    // Sans dépense perso, ni le pied ni l'en-tête ne disent rien : tous les
    // mois déjà en base gardent leur apparence.
    await expect(page.locator('#variableChargesTotal')).not.toContainText('perso');
    await expect(page.locator('#variableChargesList .category-total')).not.toContainText('perso');

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Coiffeur');
    await page.locator('#variableChargeAmount').fill('45');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(600);

    // LE PIED : le commun seul, et rien de plus. Il compte ce que la liste
    // montre — c'est ce qui le met d'accord avec le bilan.
    const pied = (await page.locator('#variableChargesTotal').innerText()).replace(/\s/g, '');
    expect(pied).toContain('300,00');
    expect(pied).not.toContain('45,00');
    expect(pied).not.toContain('perso');

    // L'EN-TÊTE : il baisse ET il le dit. Les deux moitiés sont la propriété —
    // un en-tête qui baisserait en silence prétendrait encore être un chiffre
    // du foyer.
    const entete = (await page.locator('#variableChargesList .category-total').innerText())
      .replace(/\s/g, '');
    expect(entete).toContain('300,00');
    expect(entete).toContain('45,00');
    expect(entete).toContain('perso');
  });

  test('rouvrir une dépense perso la retrouve cochée', async ({ page }) => {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill('Coiffeur');
    await page.locator('#variableChargeAmount').fill('45');
    await page.locator('#variableChargeCategory').selectOption('Courses');
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#variableChargePerso + .toggle-slider').click();
    await page.locator('#saveVariableCharge').click();
    await page.waitForTimeout(600);

    // ⚠️ IL FAUT ALLER LA CHERCHER OÙ ELLE EST, depuis le lot P2 : le mois ne
    // porte QUE cette dépense, et « À deux » ne la montre plus. Sa propriété —
    // le formulaire rouvre sur l'état enregistré — n'a pas changé d'un iota ;
    // c'est le chemin pour l'atteindre qui en a un de plus, et c'est très
    // exactement ce que le renvoi en pied existe pour dire.
    await page.locator('#panneauCharges [data-portee="solo"]').click();
    await page.waitForTimeout(600);

    await page.locator('#variableChargesList [data-action="editVariableCharge"]').first().click();
    await page.waitForTimeout(300);

    await expect(page.locator('#variableChargePerso')).toBeChecked();
    // Et le couplage a suivi : « Partagé » reste fermé.
    await expect(page.locator('#variableChargePaidBy option[value="partage"]')).toBeDisabled();
  });

  test('la saisie rapide l\'écrit aussi, par le segment « Répartition »', async ({ page }) => {
    // « Perso » y est la troisième réponse à « comment ça se partage ? » — pas
    // du tout — plutôt qu'un cinquième segment dans la phrase.
    await page.locator('.fab').click();
    await page.locator('#quickAddAmount').fill('22');
    await page.locator('.quick-add-segment[data-panneau="quickAddPanneauCategorie"]').click();
    await page.locator('.category-btn').first().click();
    await page.waitForTimeout(200);

    await page.locator('#quickAddPhrase button', { hasText: /prorata|50-50|Perso/i }).first().click();
    await page.locator('#quickSplitPerso').click();
    await page.waitForTimeout(200);

    await expect(page.locator('#quickAddPhrase')).toContainText('Perso');

    await page.locator('#btnQuickAdd').click();
    await page.waitForTimeout(700);

    // Même changement de chemin qu'au cas du formulaire complet, et c'est ICI
    // que le défaut vivait vraiment : `quick-add.js` composait
    // `periods/{mois}/variableCharges` pour TOUTE dépense, « Perso » comprise.
    // C'est le geste le plus fréquent de l'application, et le seul écran depuis
    // lequel une dépense personnelle se saisit en trois touches.
    const { poche, commun } = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      const periode = document.getElementById('periodSelect')?.value;
      return {
        poche: Object.values(
          await dbGet(`personnel/vous/periods/${periode}/variableCharges`) || {}),
        commun: Object.values(await dbGet(`periods/${periode}/variableCharges`) || {})
      };
    });

    expect(poche).toHaveLength(1);
    expect(commun).toHaveLength(0);
    const charges = poche;
    expect(charges[0].perimetre).toBe('solo');
    // Le payeur a basculé de lui-même sur une personne : « partage » aurait
    // été refusé par les règles.
    expect(['vous', 'conjointe']).toContain(charges[0].paidBy);
  });
});
