import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Le total dit ce que la liste montre — et rien d'autre
 *
 * La recherche masquait les lignes par `style.display` sans jamais toucher aux
 * totaux, qui sont posés au rendu. Mesuré avant correction, sur
 * « intermarche » : trois lignes visibles valant 294,32 €, sous un total resté
 * à 464,32 €, et l'en-tête « Courses » affichant lui aussi le mois entier.
 *
 * C'est le seul défaut de l'audit qui relève de la JUSTESSE et non du confort :
 * « combien je dépense chez cette enseigne » est la question la plus naturelle
 * qu'on pose à une recherche de dépenses, et l'application y répondait par un
 * nombre faux de 170 €, avec le même aplomb qu'une réponse juste.
 *
 * La propriété tenue ici ne compare à aucune valeur écrite à la main pour
 * l'essentiel : **la somme des lignes visibles doit être le total affiché**.
 * Elle vaut donc quel que soit le jeu d'essai, et elle tombe si l'un des deux
 * chemins — le rendu ou la recherche — cesse de passer par la fabrique unique
 * de `utils/totaux-liste.js`.
 */

/** Ce que le mois porte : 464,32 € de variable, 963,49 € de fixe */
async function semer(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const now = new Date();
    const p = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await dbSet('salaries', { vous: 2600, conjointe: 1900 });
    const c = {};
    [['Intermarché', 94.15, 'Courses'], ['Intermarché', 112.85, 'Courses'],
      ['Intermarché', 87.32, 'Courses'], ['Boulangerie', 7.2, 'Courses'],
      ['Boulangerie', 6.4, 'Courses'], ['Essence', 68.0, 'Transport'],
      ['Restaurant Le Bistrot', 64.5, 'Restaurant'], ['Pharmacie', 23.9, 'Santé']]
      .forEach(([description, amount, category], i) => {
        c[`periods/${p}/variableCharges/v${i}`] = {
          description, amount, category, paidBy: 'vous',
          date: `${p}-0${(i % 9) + 1}`, deleted: false };
      });
    [['Loyer', 950, 'Maison'], ['Netflix', 13.49, 'Loisirs']]
      .forEach(([description, amount, category], i) => {
        c[`periods/${p}/fixedCharges/f${i}`] = {
          description, amount, category, paidBy: 'vous',
          date: `${p}-05`, deleted: false, recurring: true };
      });
    await dbUpdate(undefined, c);
    await window.changePeriod(p);
  });
  await page.waitForTimeout(2500);
}

/** Lit un montant français, séparateur de milliers compris */
function euros(texte) {
  const m = (texte || '').match(/([\d\s  ]+[,.]\d{2})/);
  return m ? parseFloat(m[1].replace(/[\s  ]/g, '').replace(',', '.')) : null;
}

/** Ce que l'écran affiche, à l'instant t */
async function releve(page) {
  return page.evaluate(() => {
    const lire = (t) => {
      const m = (t || '').match(/([\d\s  ]+[,.]\d{2})/);
      return m ? parseFloat(m[1].replace(/[\s  ]/g, '').replace(',', '.')) : 0;
    };
    const visibles = [...document.querySelectorAll('#variableChargesList .charge-item')]
      .filter(el => getComputedStyle(el).display !== 'none');
    return {
      lignes: visibles.length,
      sommeLignes: Math.round(visibles.reduce(
        (t, el) => t + lire((el.querySelector('.charge-amount') || {}).textContent), 0) * 100) / 100,
      totalVariables: document.getElementById('variableChargesTotal').textContent.trim(),
      totalFixes: document.getElementById('fixedChargesTotal').textContent.trim(),
      enTetes: [...document.querySelectorAll('#variableChargesList .charge-category')]
        .filter(b => getComputedStyle(b).display !== 'none')
        .map(b => [b.dataset.categorie, (b.querySelector('.category-total') || {}).textContent]),
      annuelCache: document.getElementById('fixedChargesAnnuel').hidden
    };
  });
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Les totaux suivent la recherche', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await semer(page);
    await allerAuPanneau(page, 'panneauCharges');
    await page.waitForTimeout(400);
  });

  test('la somme des lignes visibles EST le total affiché', async ({ page }) => {
    const avant = await releve(page);
    expect(euros(avant.totalVariables)).toBeCloseTo(avant.sommeLignes, 2);

    await page.locator('#searchInput').fill('intermarche');
    await page.waitForTimeout(900);

    const pendant = await releve(page);
    expect(pendant.lignes, 'trois Intermarché').toBe(3);
    // La propriété, sans valeur écrite à la main.
    expect(euros(pendant.totalVariables)).toBeCloseTo(pendant.sommeLignes, 2);
    // Et le chiffre mesuré, comme témoin du cas fondateur.
    expect(pendant.sommeLignes).toBeCloseTo(294.32, 2);
    expect(euros(avant.totalVariables), 'le défaut valait 170 € d\'écart')
      .toBeCloseTo(464.32, 2);
  });

  test('le sous-total de catégorie suit aussi', async ({ page }) => {
    await page.locator('#searchInput').fill('intermarche');
    await page.waitForTimeout(900);
    const pendant = await releve(page);
    expect(pendant.enTetes).toHaveLength(1);
    expect(pendant.enTetes[0][0]).toBe('Courses');
    expect(euros(pendant.enTetes[0][1])).toBeCloseTo(294.32, 2);
  });

  test('une liste sans résultat tombe à zéro, pas à son total du mois', async ({ page }) => {
    // C'était le pire cas : « intermarche » ne touche AUCUNE charge fixe, et le
    // total des charges fixes continuait d'annoncer 963,49 € sous une liste vide.
    await page.locator('#searchInput').fill('intermarche');
    await page.waitForTimeout(900);
    expect(euros((await releve(page)).totalFixes)).toBeCloseTo(0, 2);
  });

  test('une recherche qui ne touche que le fixe laisse le variable à zéro', async ({ page }) => {
    await page.locator('#searchInput').fill('loyer');
    await page.waitForTimeout(900);
    const r = await releve(page);
    expect(euros(r.totalFixes)).toBeCloseTo(950, 2);
    expect(euros(r.totalVariables)).toBeCloseTo(0, 2);
  });

  test('le coût annuel se retire : il parle de tout le mois, pas du résultat', async ({ page }) => {
    expect((await releve(page)).annuelCache).toBe(false);
    await page.locator('#searchInput').fill('intermarche');
    await page.waitForTimeout(900);
    expect((await releve(page)).annuelCache).toBe(true);
  });

  test('sortir de la recherche rend exactement le mois d\'avant', async ({ page }) => {
    const avant = await releve(page);
    await page.locator('#searchInput').fill('intermarche');
    await page.waitForTimeout(900);
    await page.locator('#searchClearBtn').click();
    await page.waitForTimeout(900);

    const apres = await releve(page);
    expect(apres.lignes).toBe(avant.lignes);
    expect(apres.totalVariables).toBe(avant.totalVariables);
    expect(apres.totalFixes).toBe(avant.totalFixes);
    expect(apres.enTetes).toEqual(avant.enTetes);
    expect(apres.annuelCache).toBe(false);
  });
});

test.describe('L\'action principale d\'une modale reste atteignable', () => {
  /**
   * Mesuré sur iPhone 13, avant même l'ouverture du clavier : le bouton
   * « Ajouter » du formulaire de charge variable tombait à y=1038 sur 664 px
   * utiles — 374 px sous la ligne de flottaison, derrière 502 px de défilement
   * qu'aucun indice n'annonçait.
   */
  test('les trois formulaires montrent leur bouton sans défiler', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await allerAuPanneau(page, 'panneauCharges');

    for (const [bouton, modale, nom] of [
      ['#addVariableChargeBtn', '#modalAddVariableCharge', 'charge variable'],
      ['#addFixedChargeBtn', '#modalAddFixedCharge', 'charge fixe'],
      ['#addReimbursementBtn', '#modalAddReimbursement', 'remboursement']
    ]) {
      await page.locator(bouton).click();
      await page.waitForTimeout(500);
      const r = await page.evaluate(({ modale }) => {
        const m = document.querySelector(modale);
        const submit = [...m.querySelectorAll('button')]
          .find(b => /ajouter|enregistrer|valider|modifier/i.test(b.textContent));
        const s = submit.getBoundingClientRect();
        return { haut: Math.round(s.top), bas: Math.round(s.bottom), ecran: innerHeight };
      }, { modale });

      expect(r.haut, `${nom} : bouton à y=${r.haut} sur ${r.ecran} px`).toBeGreaterThanOrEqual(0);
      expect(r.bas, `${nom} : bas du bouton à ${r.bas} sur ${r.ecran} px`)
        .toBeLessThanOrEqual(r.ecran);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });
});
