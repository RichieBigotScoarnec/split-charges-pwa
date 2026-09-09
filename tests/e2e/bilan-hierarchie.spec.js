import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Ce que le bilan met en tête, sur la page réelle
 *
 * `tests/modules/bilan-hierarchie.test.js` éprouve le rendu en jsdom. Ici on
 * mesure ce que l'écran donne : le total en tête, l'écart en dessous, et les
 * deux surfaces — bilan et barre collante — qui annoncent le même montant sans
 * dire la même phrase.
 *
 * Aucune valeur n'est écrite à la main : les propriétés se lisent sur la page.
 */

test.use({ viewport: { width: 390, height: 844 } });

/**
 * Un mois où l'un des deux avance tout : c'est ce qui crée l'écart
 *
 * Rien ici ne dépend du JOUR où le contrôle tourne — pas de projection, pas de
 * prévisionnel qualifié. Ce dépôt a payé deux fois la leçon inverse : un
 * contrôle qui dépendait de l'heure qu'il était, puis le même piège élargi au
 * mois de décembre.
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

test('la tête du bilan porte le total commun, pas la créance', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerLeMois(page);

  const tete = page.locator('.summary-balance .bilan-tete');
  const montant = page.locator('.summary-balance > strong');

  await expect(tete).toBeVisible();
  await expect(tete).toContainText('Ensemble');

  // 800 + 200 : le total, et non le solde de 250 €.
  expect(nombre(await montant.innerText())).toBeCloseTo(1000, 2);
});

test('l\'écart vient juste en dessous, entier et nommé', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerLeMois(page);

  const ecart = page.locator('.summary-balance .bilan-ecart');
  await expect(ecart).toBeVisible();
  await expect(ecart).toContainText('À rééquilibrer');

  // Salaires 3000/1000 : votre part est de 750 €, vous avez avancé 1 000 €.
  expect(nombre(await page.locator('.bilan-ecart-montant').innerText())).toBeCloseTo(250, 2);
});

test('la barre collante garde le verbe « devoir », et le même montant', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerLeMois(page);

  // La barre existe dès le premier rendu, même repliée tant que le bilan est
  // à l'écran : c'est son CONTENU qu'on mesure, pas sa visibilité.
  const barre = await page.locator('#balanceBar').innerText();

  expect(barre).toMatch(/doit|devez/);
  expect(barre).not.toContain('Ensemble');

  // LA PROPRIÉTÉ : deux phrases, un seul chiffre. Aucune valeur écrite à la
  // main — si les deux surfaces se mettaient à calculer chacune de leur côté,
  // c'est ici que ça se verrait.
  const surLeBilan = nombre(await page.locator('.bilan-ecart-montant').innerText());
  expect(nombre(barre)).toBeCloseTo(surLeBilan, 2);
});

test('le total de tête est celui que le dépliant détaille', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerLeMois(page);

  // Le dépliant est REPLIÉ au rendu : sans ce clic, la ligne se compare à une
  // chaîne vide, c'est-à-dire à rien.
  await page.locator('.summary-details > summary').click();

  const enTete = nombre(await page.locator('.summary-balance > strong').innerText());
  const dansLeDetail = nombre(await page.locator('.summary-total-row strong').innerText());

  expect(dansLeDetail).toBeCloseTo(enTete, 2);
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
   *
   * C'est la propriété qui rend la décomposition croyable : un dépliant dont
   * les lignes ne somment pas au chiffre qu'elles expliquent invite à douter
   * du chiffre — et c'est le chiffre juste qu'on mettrait en doute.
   */
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerLeMois(page);

  /**
   * ── LE SEMIS DOIT SÉPARER LES DEUX ASSIETTES ──
   *
   * Première rédaction : une seule dérogation variable, en plus des deux
   * charges de `semerLeMois`. Le mutant — nourrir la décomposition de
   * `variableCharges` au lieu des charges retenues par le calcul — passait au
   * VERT : sur ce semis les deux ensembles étaient identiques, toutes les
   * charges étant variables, communes et actives.
   *
   * C'est la leçon de la maquette du lot, appliquée à ce contrôle-ci : un jeu
   * d'essai qui ne sépare pas les hypothèses n'en prouve aucune. Trois charges
   * suffisent à les séparer, et chacune est là pour une raison :
   *
   *   - une DÉROGATION, sans quoi la décomposition ne rend qu'une ligne et se
   *     tait ;
   *   - une charge FIXE, que `variableCharges` seul manquerait — la somme
   *     serait trop basse ;
   *   - une dépense SOLO, que `variableCharges` seul ajouterait — trop haute.
   *     C'est `chargesCommunes` qui l'écarte, et rien d'autre.
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
    // `changePeriod()` ne prend AUCUN argument : elle lit le sélecteur. Lui
    // passer une période ne fait rien du tout — c'est un défaut que ce dépôt a
    // déjà corrigé côté recherche, et que douze contrôles de bout en bout
    // reproduisent encore en le croyant efficace. Ici on pose la valeur là où
    // elle se lit, et on crée l'option si le mois manque.
    const select = document.getElementById('periodSelect');
    if (![...select.options].some(o => o.value === cle)) {
      select.add(new Option(cle, cle));
    }
    select.value = cle;
    await window.changePeriod();
    return cle;
  });
  await page.waitForTimeout(2000);

  const tete = await page.locator('.summary-balance .bilan-tete').innerText();

  expect(tete).not.toContain('ce mois');
  // Il porte le nom du mois, en toutes lettres — pas sa clé.
  expect(tete.toLowerCase()).toContain(
    new Date(Number(precedent.slice(0, 4)), Number(precedent.slice(5, 7)) - 1, 1)
      .toLocaleDateString('fr-FR', { month: 'long' })
  );
});
