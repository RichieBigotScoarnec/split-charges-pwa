import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Ce que le bilan met en tête, sur la page réelle
 *
 * `tests/modules/bilan-hierarchie.test.js` éprouve le rendu en jsdom. Ici on
 * mesure ce que l'écran donne : la créance en tête et en ambre, le total au
 * rang 3 en encre neutre, et les deux surfaces — tête et barre collante — qui
 * annoncent le même montant.
 *
 * ─────────────────────────────────────────────────────────────────────
 * RÉÉCRIT SUR LA NOUVELLE HIÉRARCHIE — lot D, 2026-09-11
 *
 * Ses deux premiers cas exigeaient « Ensemble » dans `.bilan-tete` et une ligne
 * « À rééquilibrer » : la décision du 2026-08-31, révoquée le 2026-09-10. Ils
 * ne sont pas supprimés, ils portent sur la nouvelle surface. Le total que le
 * dépliant détaille, la décomposition et le mois nommé selon son état restent
 * tenus ; seul l'endroit où on les lit a bougé.
 *
 * Aucune valeur n'est écrite à la main quand elle peut se lire sur la page.
 */

test.use({ viewport: { width: 390, height: 844 } });

/**
 * Un mois où l'un des deux avance tout : c'est ce qui crée l'écart
 *
 * Rien ici ne dépend du JOUR où le contrôle tourne — pas de projection, pas de
 * prévisionnel qualifié. Ce dépôt a payé deux fois la leçon inverse.
 */
async function semerLeMois(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const now = new Date();
    const mois = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    await dbSet('salaries', { vous: 3000, conjointe: 1000 });
    await dbUpdate(undefined, {
      [`periods/${mois}/salaries`]: { vous: 3000, conjointe: 1000 },
      [`periods/${mois}/variableCharges/v1`]: {
        description: 'Une sortie', amount: 800, category: 'Loisirs',
        paidBy: 'vous', deleted: false
      },
      [`periods/${mois}/variableCharges/v2`]: {
        description: 'Un plein', amount: 200, category: 'Transport',
        paidBy: 'vous', deleted: false
      }
    });
    await window.changePeriod(mois);
  });
  await page.waitForTimeout(2000);
}

const nombre = (texte) => {
  // Les séparateurs sont ÉCHAPPÉS, jamais tapés en clair : `formatCurrency`
  // sépare les milliers par une espace fine insécable (U+202F) et pose une
  // insécable (U+00A0) devant l'euro. Une classe à espaces littéraux ne les
  // contient pas, et « 1 550,00 » s'y lit « 550,00 » — mesuré, une fois.
  const trouve = String(texte).match(/-?[\d\u00A0\u202F\u2009 ]+,\d{2}/);
  return trouve
    ? Number(trouve[0].replace(/[\u00A0\u202F\u2009 ]/g, '').replace(',', '.'))
    : null;
};

/** La couleur que le moteur rend pour un jeton, lue sur un témoin posé à part */
const encreDuJeton = (page, jeton) => page.evaluate((j) => {
  const temoin = document.createElement('span');
  temoin.style.color = `var(${j})`;
  document.body.appendChild(temoin);
  const couleur = getComputedStyle(temoin).color;
  temoin.remove();
  return couleur;
}, jeton);

const encreDe = (locator) => locator.evaluate((el) => getComputedStyle(el).color);

test('la tête du bilan porte la créance, en ambre', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerLeMois(page);

  const tete = page.locator('.bilan-heros[data-tete="deux"]');
  await expect(tete.locator('.bilan-tete')).toHaveText('Solde du mois');
  await expect(tete.locator('.bilan-heros-phrase')).toContainText('doit');

  // Salaires 3000/1000 : votre part est de 750 €, vous avez avancé 1 000 €.
  const montant = tete.locator('.bilan-heros-montant');
  expect(nombre(await montant.innerText())).toBeCloseTo(250, 2);

  // L'ambre se lit sur le RENDU, contre la couleur que le moteur donne au
  // jeton — pas contre une chaîne écrite ici, qui figerait la valeur du jour.
  const ambre = await encreDuJeton(page, '--warning-ink');
  expect(await encreDe(montant)).toBe(ambre);
});

test('le fait symétrique reste au rang 3, en encre neutre — la créance est le seul chiffre coloré', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerLeMois(page);

  const commun = page.locator('.carte-tete--commun .carte-tete-montant');
  // 800 + 200 : le total, et non le solde de 250 €.
  expect(nombre(await commun.innerText())).toBeCloseTo(1000, 2);

  const ambre = await encreDuJeton(page, '--warning-ink');
  for (const autre of ['.carte-tete--commun .carte-tete-montant', '.carte-tete--reste .carte-tete-montant']) {
    expect(await encreDe(page.locator(autre)), `${autre} est coloré comme la créance`).not.toBe(ambre);
  }
});

test('la barre collante garde le verbe « devoir », et le même montant que la tête', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerLeMois(page);

  // La barre existe dès le premier rendu, même repliée tant que la tête est à
  // l'écran : c'est son CONTENU qu'on mesure, pas sa visibilité.
  const barre = await page.locator('#balanceBar').innerText();
  expect(barre).toMatch(/doit|devez/);

  // LA PROPRIÉTÉ : deux surfaces, un seul chiffre. Aucune valeur écrite à la
  // main — si les deux se mettaient à calculer chacune de leur côté, c'est ici
  // que ça se verrait.
  const surLaTete = nombre(await page.locator('.bilan-heros-montant').innerText());
  expect(nombre(barre)).toBeCloseTo(surLaTete, 2);
});

test('le total de « Dépensé à deux » est celui que le dépliant détaille', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerLeMois(page);

  // Le dépliant est REPLIÉ au rendu sous 900 px : sans ce clic, la ligne se
  // compare à une chaîne vide, c'est-à-dire à rien.
  await expect(page.locator('.summary-details'), 'prémisse : à 390 px, le grand-livre est replié')
    .not.toHaveAttribute('open');
  await page.locator('.summary-details > summary').click();

  const auRang3 = nombre(await page.locator('.carte-tete--commun .carte-tete-montant').innerText());
  const dansLeDetail = nombre(await page.locator('.summary-total-row strong').innerText());

  expect(dansLeDetail).toBeCloseTo(auRang3, 2);
});

test('la décomposition somme à la part qu\'elle explique', async ({ page }) => {
  /**
   * ── LA GARDE DE CÂBLAGE, ET ELLE NE DOUBLE PAS L'UNITAIRE ──
   *
   * `tests/utils/decomposition.test.js` tient l'arithmétique : sur son jeu
   * séparateur, la somme des lignes vaut la part totale. Il ne peut PAS voir
   * une erreur de branchement — une décomposition nourrie d'une autre assiette
   * que celle qui a produit la part affichée sommerait juste, et à un autre
   * chiffre que celui d'à côté.
   */
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerLeMois(page);

  /**
   * ── LE SEMIS DOIT SÉPARER LES DEUX ASSIETTES ──
   *
   *   - une DÉROGATION, sans quoi la décomposition ne rend qu'une ligne et se
   *     tait ;
   *   - une charge FIXE, que `variableCharges` seul manquerait ;
   *   - une dépense SOLO, que `variableCharges` seul ajouterait.
   */
  await page.evaluate(async () => {
    const { dbUpdate } = await import('/js/db.js');
    const now = new Date();
    const mois = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await dbUpdate(undefined, {
      [`periods/${mois}/variableCharges/d1`]: {
        description: 'Festival', amount: 300, category: 'Loisirs',
        paidBy: 'conjointe', deleted: false, splitOverride: { mode: '50-50' }
      },
      [`periods/${mois}/fixedCharges/f1`]: {
        description: 'Loyer', amount: 500, category: 'Maison',
        paidBy: 'vous', deleted: false
      },
      [`periods/${mois}/variableCharges/s1`]: {
        description: 'Salle de sport', amount: 40, category: 'Perso',
        paidBy: 'vous', deleted: false, perimetre: 'solo'
      }
    });
    await window.changePeriod(mois);
  });
  await page.waitForTimeout(2000);

  await page.locator('.summary-details > summary').click();

  const lignes = await page.locator('.summary-row--decompose strong').allInnerTexts();
  expect(lignes.length,
    'prémisse : la décomposition ne rend pas plusieurs lignes, elle ne mesure rien ici')
    .toBeGreaterThan(1);

  const somme = lignes.reduce((s, t) => s + nombre(t), 0);
  const maPart = nombre(await page.locator('.summary-section-label:text-is("Répartition à payer") + .summary-row strong').innerText());

  expect(somme,
    `les ${lignes.length} lignes somment à ${somme} pour une part affichée de ${maPart}`)
    .toBeCloseTo(maPart, 2);
});

test('un mois révolu est nommé, jamais appelé « ce mois »', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerLeMois(page);

  // Le mois précédent : révolu quel que soit le jour où ce contrôle tourne.
  const precedent = await page.evaluate(async () => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const { dbUpdate } = await import('/js/db.js');
    await dbUpdate(undefined, {
      [`periods/${cle}/salaries`]: { vous: 3000, conjointe: 1000 },
      [`periods/${cle}/variableCharges/v9`]: {
        description: 'Un mois clos', amount: 400, category: 'Maison',
        paidBy: 'vous', deleted: false
      }
    });
    // `changePeriod()` ne prend AUCUN argument : elle lit le sélecteur. Ici on
    // pose la valeur là où elle se lit, et on crée l'option si le mois manque.
    const select = document.getElementById('periodSelect');
    if (![...select.options].some(o => o.value === cle)) {
      select.add(new Option(cle, cle));
    }
    select.value = cle;
    await window.changePeriod();
    return cle;
  });
  await page.waitForTimeout(2000);

  // Le total a quitté la tête au lot D : c'est son libellé, au rang 3, qui
  // porte le mois — et c'est là que « ce mois » serait faux.
  const libelle = await page.locator('.carte-tete--commun .bilan-tete').innerText();

  expect(libelle.toLowerCase()).not.toContain('ce mois');
  // Il porte le nom du mois, en toutes lettres — pas sa clé.
  expect(libelle.toLowerCase()).toContain(
    new Date(Number(precedent.slice(0, 4)), Number(precedent.slice(5, 7)) - 1, 1)
      .toLocaleDateString('fr-FR', { month: 'long' })
  );
});
