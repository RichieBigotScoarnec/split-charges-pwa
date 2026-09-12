import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Lot E — la colonne des cartes, et le chemin vers les revenus.
 *
 * Les planches 1, 2 et 4 posent, sous la tête du bilan, une colonne de
 * cartes dans le MÊME ordre, sur les trois :
 *
 *     🎯 Où part votre argent   (« Budgets par catégorie » une fois un budget fixé)
 *     📍 Où vous dépensez       (la carte)
 *     📈 Tendances sur 6 mois
 *     🧳 Enveloppes à deux
 *
 * Deux blocs que les planches ne connaissaient pas ferment la colonne — « Le
 * mois en un coup d'œil » et le récap des virements par destination. Ils
 * rendent un service qu'elle ne propose pas : ce ne sont pas des écarts.
 *
 * Et Réglages étant sorti du tableau de bord, les salaires sont à un écran de
 * distance. Le bandeau prorata de la planche 1 porte « Modifier les revenus » :
 * un geste depuis l'écran où le chiffre compte. Il doit emprunter le chemin de
 * la porte — sinon le retour du navigateur ne referme pas Réglages.
 *
 * Tout ce qui suit se lit par le TEXTE que l'écran montre et par sa
 * géométrie rendue, jamais par un nom de classe : une réorganisation du
 * balisage qui tiendrait la même promesse doit laisser ces cas verts.
 */

/**
 * Un mois qui fait paraître toutes les cartes : des revenus (le bilan se
 * calcule), une dépense localisée (la carte), une charge fixe avec
 * destination (le récap des virements).
 */
async function semer(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const mois = document.getElementById('periodSelect').value;
    const salaires = { vous: 3000, conjointe: 1000 };
    await dbSet('salaries', salaires);
    await dbUpdate(undefined, {
      [`periods/${mois}/salaries`]: salaires,
      [`periods/${mois}/variableCharges/v1`]: {
        description: 'Courses', amount: 120, category: 'Courses', paidBy: 'vous',
        date: `${mois}-03`, deleted: false, timestamp: 1,
        location: { lat: 48.8566, lng: 2.3522, name: 'Paris' }
      },
      [`periods/${mois}/fixedCharges/f1`]: {
        description: 'Loyer', amount: 800, category: 'Maison', paidBy: 'vous',
        destination: 'Compte Commun', recurring: true, date: `${mois}-05`, deleted: false
      }
    });
    await window.changePeriod();
  });
  await page.waitForTimeout(1500);
}

/**
 * La boîte de l'élément VISIBLE du bilan qui porte ce texte en propre — un
 * nœud texte enfant direct, pour ne pas retenir un ancêtre qui le contient.
 */
async function boiteDuTexte(page, texte) {
  return page.evaluate((t) => {
    const el = [...document.querySelectorAll('#panneauBilan *')].find((e) =>
      e.checkVisibility()
      && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(t)));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { haut: r.top + scrollY, bas: r.bottom + scrollY, gauche: r.left, droite: r.right };
  }, texte);
}

const CARTES = ['Où part votre argent', 'Où vous dépensez', 'Tendances sur 6 mois', 'Enveloppes à deux'];
const BAS_DE_COLONNE = ['Le mois en un coup d\'œil', 'Récap virements'];

/** Les panneaux que le moteur rend réellement */
async function panneauxRendus(page) {
  return page.evaluate(() => ['panneauBilan', 'panneauCharges', 'panneauReglages']
    .filter((id) => document.getElementById(id)?.checkVisibility()));
}

for (const { largeur, hauteur, bureau } of [
  { largeur: 390, hauteur: 844, bureau: false },
  { largeur: 1280, hauteur: 900, bureau: true },
  { largeur: 1600, hauteur: 900, bureau: true }
]) {
  test.describe(`La colonne des cartes — ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: hauteur } });

    test.beforeEach(async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
      await semer(page);
    });

    test('les quatre cartes suivent l\'ordre des planches, et les deux ajouts la ferment', async ({ page }) => {
      const boites = [];
      for (const t of [...CARTES, ...BAS_DE_COLONNE]) {
        const b = await boiteDuTexte(page, t);
        expect(b, `« ${t} » n'est pas à l'écran — le semis ne l'a pas fait paraître, ou la carte manque`).not.toBeNull();
        boites.push({ t, ...b });
      }

      for (let i = 1; i < boites.length; i++) {
        expect(boites[i].haut, `« ${boites[i].t} » doit venir sous « ${boites[i - 1].t} »`)
          .toBeGreaterThan(boites[i - 1].haut);
      }

      if (bureau) {
        // Au bureau, toute la colonne vit à DROITE des charges.
        const charges = await page.evaluate(() =>
          document.getElementById('panneauCharges').getBoundingClientRect().right);
        for (const b of boites) {
          expect(b.gauche, `« ${b.t} » doit être dans la colonne de droite`).toBeGreaterThanOrEqual(charges);
        }
      }
    });
  });
}

test.describe('Une carte qui n\'a rien à dire ne paraît pas', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('sans dépense localisée, « Où vous dépensez » n\'est pas à l\'écran — elle paraît avec la première', async ({ page }) => {
    // Le bouton de la carte est masqué tant qu'aucune dépense n'est
    // localisée ; `vues.spec.js` le tient. Ce qui manquait est la CARTE :
    // réduite à son titre, elle annoncerait une lecture qui n'existe pas.
    await setupFirebaseMock(page);
    await waitForApp(page);
    expect(await boiteDuTexte(page, 'Où vous dépensez'), 'mois vide').toBeNull();

    await semer(page);
    expect(await boiteDuTexte(page, 'Où vous dépensez'), 'avec une dépense localisée — le témoin').not.toBeNull();
  });
});

test.describe('Le titre de la première carte dit son état', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('« Où part votre argent » sans budget, « Budgets par catégorie » une fois un budget fixé', async ({ page }) => {
    // Planche 1 : la même carte, deux états (`budgetsAbsents`, `budgetsDefinis`).
    await setupFirebaseMock(page);
    await waitForApp(page);
    await semer(page);

    expect(await boiteDuTexte(page, 'Où part votre argent'), 'sans budget').not.toBeNull();
    expect(await boiteDuTexte(page, 'Budgets par catégorie'), 'sans budget, l\'autre titre').toBeNull();

    await page.locator('[data-action="showBudgetEditor"]').click();
    await page.locator('#budgetEditorList input[data-category="Courses"]').fill('400');
    await page.locator('[data-action="saveCategoryBudgets"]').click();
    await expect(page.locator('#modalBudgets')).not.toHaveClass(/active/, { timeout: 5000 });

    await expect.poll(() => boiteDuTexte(page, 'Budgets par catégorie'), 'avec un budget').not.toBeNull();
    expect(await boiteDuTexte(page, 'Où part votre argent'), 'avec un budget, l\'autre titre').toBeNull();
  });
});

for (const { largeur, hauteur, bureau } of [
  { largeur: 390, hauteur: 844, bureau: false },
  { largeur: 1280, hauteur: 900, bureau: true }
]) {
  test.describe(`Le chemin vers les revenus — ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: hauteur } });

    test.beforeEach(async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
    });

    test('le bandeau prorata dit d\'après quels revenus, et « Modifier les revenus » y mène', async ({ page }) => {
      await semer(page);

      const lien = page.locator('#summarySection').getByRole('button', { name: 'Modifier les revenus' });
      await expect(lien, 'le lien vit dans le bilan, là où le chiffre compte').toBeVisible();

      // Le bandeau est l'élément qui porte le lien. Il dit la RÈGLE et son
      // assiette — ce que le grand-livre, qui affiche déjà « 75% », ne dit pas.
      const bandeau = await lien.evaluate((b) => b.parentElement.innerText.replace(/\s+/g, ' '));
      expect(bandeau).toMatch(/Prorata/);
      expect(bandeau).toMatch(/75\s?%/);
      expect(bandeau).toMatch(/25\s?%/);
      expect(bandeau).toMatch(/d.après 3\s?000,00\s?€ et 1\s?000,00\s?€ de revenus mensuels/);

      await lien.click();
      await expect(page.locator('#salaireVous')).toBeVisible();
      await expect(page.locator('#salaireVous')).toBeFocused({ timeout: 3000 });

      if (bureau) {
        await expect.poll(() => panneauxRendus(page)).toEqual(['panneauReglages']);
        // Le retour est programmé APRÈS la fin de l'évaluation : s'il quitte
        // la page, il détruirait sinon le contexte en cours d'évaluation, et
        // l'échec parlerait de contexte au lieu de dire ce qui s'est passé.
        await page.evaluate(() => { setTimeout(() => history.back(), 0); });
        await page.waitForTimeout(300);
        expect(page.url(), 'le retour du navigateur a QUITTÉ l\'application au lieu de refermer Réglages')
          .toContain('FairSplit.html');
        await expect.poll(() => panneauxRendus(page), 'le retour referme Réglages')
          .toEqual(['panneauBilan', 'panneauCharges']);
      }
    });

    test('« Renseigner les salaires » emprunte le même chemin', async ({ page }) => {
      // Sans revenus, le bilan offre ce bouton. Il basculait par
      // `activerOnglet`, en contournant le chemin de la porte : au bureau, le
      // retour du navigateur ne refermait pas Réglages.
      await page.locator('#summarySection').getByRole('button', { name: 'Renseigner les salaires' }).click();
      await expect(page.locator('#salaireVous')).toBeFocused({ timeout: 3000 });

      if (bureau) {
        // Le retour est programmé APRÈS la fin de l'évaluation : s'il quitte
        // la page, il détruirait sinon le contexte en cours d'évaluation, et
        // l'échec parlerait de contexte au lieu de dire ce qui s'est passé.
        await page.evaluate(() => { setTimeout(() => history.back(), 0); });
        await page.waitForTimeout(300);
        expect(page.url(), 'le retour du navigateur a QUITTÉ l\'application au lieu de refermer Réglages')
          .toContain('FairSplit.html');
        await expect.poll(() => panneauxRendus(page), 'le retour referme Réglages')
          .toEqual(['panneauBilan', 'panneauCharges']);
      } else {
        // Le retour est programmé APRÈS la fin de l'évaluation : s'il quitte
        // la page, il détruirait sinon le contexte en cours d'évaluation, et
        // l'échec parlerait de contexte au lieu de dire ce qui s'est passé.
        await page.evaluate(() => { setTimeout(() => history.back(), 0); });
        await page.waitForTimeout(300);
        expect(page.url(), 'le retour du navigateur a QUITTÉ l\'application au lieu de refermer Réglages')
          .toContain('FairSplit.html');
        await expect(page.locator('#panneauBilan'), 'le retour ramène au bilan').toBeVisible();
      }
    });
  });
}
