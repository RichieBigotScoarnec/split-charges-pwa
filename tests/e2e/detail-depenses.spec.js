import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Ouvrir le détail derrière un chiffre du bilan
 *
 * `tests/utils/detail.test.js` verrouille la sélection et les totaux. Ce qui
 * est vérifié ici, c'est le geste : la ligne s'ouvre, et **la modale retrouve
 * exactement le chiffre sur lequel on a cliqué**.
 *
 * Cette égalité est la seule chose qui compte. Une modale qui afficherait un
 * autre total que la ligne qui l'a ouverte ferait douter du bilan, pas de la
 * modale.
 */

const VUE = { width: 390, height: 844 };

function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Un mois où chacun a avancé, plus une charge partagée */
function semence() {
  const p = moisCourant();
  return {
    'household/salaries': { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/fixedCharges/f1`]: {
      description: 'Loyer', amount: 950, category: 'Maison',
      paidBy: 'vous', date: `${p}-05`, deleted: false
    },
    [`household/periods/${p}/variableCharges/v1`]: {
      description: 'Courses du samedi', amount: 74.25, category: 'Courses',
      paidBy: 'vous', date: `${p}-12`, deleted: false
    },
    [`household/periods/${p}/variableCharges/v2`]: {
      description: 'Restaurant du port', amount: 88.5, category: 'Restaurant',
      paidBy: 'conjointe', date: `${p}-14`, deleted: false
    },
    // Partagée : chacun n'en a avancé qu'une part.
    [`household/periods/${p}/variableCharges/v3`]: {
      description: 'Week-end', amount: 300, category: 'Loisirs',
      paidBy: 'partage', date: `${p}-20`, deleted: false
    }
  };
}

async function ouvrir(page, { db = semence(), vue = VUE } = {}) {
  await page.setViewportSize(vue);
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(db)};`);
  await waitForApp(page);

  // On attend que le bilan PORTE les charges semées, et non une durée. Mesuré :
  // la ligne de catégorie est le premier repère visible que les charges créent,
  // et elle l'est sans rien déplier. Un délai trop court rendait la main sur un
  // bilan encore à zéro — et « les deux détails réunis font le total » compare
  // alors 0 + 0 à 0, c'est-à-dire réussit sans rien mesurer.
  await expect(page.locator('[data-action="ouvrirDetailCategorie"][data-arg="Maison"]'))
    .toBeVisible();

  // Les paiements réels vivent sous « Voir le détail ».
  await page.locator('.summary-details > summary').click();
  await expect(page.locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]'))
    .toBeVisible();
}

/**
 * Ouvre le détail d'un payeur et attend LE RENDU VISÉ
 *
 * La modale n'est jamais retirée du document : refermée, elle garde à l'écran
 * le total de l'ouverture précédente. Un délai fixe qui s'écoule trop vite
 * relit donc cette valeur-là, sans erreur et sans un mot.
 *
 * Le titre reprend MOT POUR MOT le libellé de la ligne cliquée — « Untel a
 * payé » : c'est le seul repère qui distingue le rendu voulu de celui qui reste
 * affiché. Et `rendre()` écrit le contenu AVANT d'ouvrir la modale, donc
 * « visible » implique déjà « à jour » ; le titre le dit en clair.
 */
async function ouvrirLaCategorie(page, categorie) {
  await page.locator(`[data-action="ouvrirDetailCategorie"][data-arg="${categorie}"]`).click();
  await expect(page.locator('#modalDetailDepenses')).toBeVisible();
  await expect(page.locator('#detailDepensesTitre')).toHaveText(categorie);
}

async function ouvrirLePayeur(page, qui) {
  const ligne = page.locator(`[data-action="ouvrirDetailPayeur"][data-arg="${qui}"]`);
  const attendu = (await ligne.locator('span').innerText()).trim();

  await ligne.click();
  await expect(page.locator('#modalDetailDepenses')).toBeVisible();
  await expect(page.locator('#detailDepensesTitre')).toHaveText(attendu);
}

/** Un montant affiché, ramené à un nombre */
function enNombre(texte) {
  return Number(
    String(texte).replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.')
  );
}

test.describe('Le détail d\'un payeur', () => {
  test('la modale retrouve exactement le chiffre de la ligne', async ({ page }) => {
    await ouvrir(page);

    const ligne = page.locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]');
    await expect(ligne).toBeVisible();
    const surLaLigne = enNombre(await ligne.locator('strong').innerText());

    await ouvrirLePayeur(page, 'vous');

    const modale = page.locator('#modalDetailDepenses');
    const dansLaModale = enNombre(await modale.locator('.detail-total-montant').innerText());
    expect(dansLaModale, 'la modale annonce un autre total que la ligne')
      .toBeCloseTo(surLaLigne, 2);
  });

  test('elle montre les dépenses avancées, et pas celles d\'en face', async ({ page }) => {
    await ouvrir(page);

    await ouvrirLePayeur(page, 'vous');

    const modale = page.locator('#modalDetailDepenses');
    await expect(modale).toContainText('Loyer');
    await expect(modale).toContainText('Courses du samedi');
    await expect(modale, 'une dépense avancée par la conjointe apparaît')
      .not.toContainText('Restaurant du port');
  });

  test('une charge partagée dit qu\'elle ne compte que pour une part', async ({ page }) => {
    // Sans cette mention, le lecteur additionne les montants affichés et ne
    // retombe pas sur le total : c'est le total qu'il mettrait en doute.
    await ouvrir(page);

    await ouvrirLePayeur(page, 'vous');

    const partagee = page.locator('.detail-ligne', { hasText: 'Week-end' });
    await expect(partagee).toBeVisible();
    await expect(partagee.locator('.detail-part')).toContainText('300');
  });

  test('les deux détails réunis font le total des charges', async ({ page }) => {
    await ouvrir(page);

    const lire = async (qui) => {
      await ouvrirLePayeur(page, qui);
      const total = enNombre(
        await page.locator('#modalDetailDepenses .detail-total-montant').innerText()
      );
      await page.locator('#detailDepensesFermer').click();
      // Refermée pour de bon avant la suivante : sans quoi le clic sur l'autre
      // ligne porterait sur un voile qui la recouvre encore.
      await expect(page.locator('#modalDetailDepenses')).toBeHidden();
      return total;
    };

    const vous = await lire('vous');
    const conjointe = await lire('conjointe');

    // Comparé au total que LE BILAN AFFICHE, sur la même page et dans le même
    // geste — jamais à une constante écrite à la main. Avec 1 412,75 en dur, le
    // jour où `computeSummary` se remettrait à compter une charge solo ou
    // supprimée, le bilan afficherait 1 447,75 € pendant que les deux détails
    // continueraient de sommer 1 412,75 — et ce contrôle, dont le titre EST
    // cette égalité, serait resté vert.
    const duBilan = enNombre(await page.locator('.summary-total-row strong').innerText());

    expect(vous + conjointe).toBeCloseTo(duBilan, 2);
  });

  test('Échap referme', async ({ page }) => {
    await ouvrir(page);

    await ouvrirLePayeur(page, 'vous');
    await expect(page.locator('#modalDetailDepenses')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#modalDetailDepenses')).toBeHidden();
  });
});

test.describe('Le détail d\'une catégorie', () => {
  test('la ligne du panneau des budgets ouvre ses dépenses', async ({ page }) => {
    await ouvrir(page);

    const ligne = page.locator('[data-action="ouvrirDetailCategorie"][data-arg="Maison"]');
    await expect(ligne).toBeVisible();

    const surLaLigne = enNombre(await ligne.locator('.budget-row-amounts').innerText());

    await ouvrirLaCategorie(page, 'Maison');

    const modale = page.locator('#modalDetailDepenses');
    await expect(modale).toContainText('Loyer');

    const dansLaModale = enNombre(await modale.locator('.detail-total-montant').innerText());
    expect(dansLaModale, 'la modale annonce un autre total que la ligne')
      .toBeCloseTo(surLaLigne, 2);
  });

  test('une catégorie ne montre pas les dépenses d\'une autre', async ({ page }) => {
    await ouvrir(page);

    await ouvrirLaCategorie(page, 'Courses');

    const modale = page.locator('#modalDetailDepenses');
    await expect(modale).toContainText('Courses du samedi');
    await expect(modale).not.toContainText('Loyer');
  });

  test('un libellé hostile est affiché en texte, jamais interprété', async ({ page }) => {
    const p = moisCourant();
    const db = semence();
    db[`household/periods/${p}/variableCharges/v1`].description = '<img src=x onerror=alert(1)>';

    await page.setViewportSize(VUE);
    await setupFirebaseMock(page);
    await page.addInitScript(`window.__db = ${JSON.stringify(db)};`);
    await waitForApp(page);
    await expect(page.locator('[data-action="ouvrirDetailCategorie"][data-arg="Courses"]'))
      .toBeVisible();

    await ouvrirLaCategorie(page, 'Courses');

    await expect(page.locator('#modalDetailDepenses')).toContainText('<img src=x');
    expect(await page.locator('#modalDetailDepenses img').count()).toBe(0);
  });
});

/**
 * La pastille de répartition, et la place qu'elle prend
 *
 * Cette modale n'est visitée par AUCUN contrôle de cohérence visuelle :
 * `coherence-visuelle.spec.js` ne connaît que les trois panneaux, et
 * `theme-enveloppe.spec.js` que la modale des enveloppes. Ajouter une étiquette
 * dans une cellule de grille sans la mesurer, c'est supposer.
 *
 * Ce qui est mesuré tient en trois propriétés, sur la largeur la plus étroite
 * qu'un téléphone donne (320 px) autant que sur celle de référence :
 *
 * 1. Aucune ligne ne défile horizontalement — `.detail-ligne` est une grille
 *    `1fr auto` dont la colonne du titre n'a pas de `min-width: 0` : une
 *    étiquette insécable de plus y pousse la largeur minimale du contenu.
 * 2. Rien ne sort de la modale par la droite.
 * 3. La pastille ne recouvre pas le montant, la seule chose que la ligne
 *    contient de plus important qu'elle.
 *
 * Et un TÉMOIN, sans quoi les trois seraient satisfaites par une modale où la
 * pastille n'existe pas : elle doit être là, et porter la règle.
 */
test.describe('La répartition dérogatoire, dans la modale du détail', () => {
  /**
   * Un mois où une charge déroge, sous un libellé long
   *
   * Le libellé court ne mesure rien : c'est la ligne dont le titre remplit déjà
   * sa colonne qui dit si l'étiquette tient.
   */
  function semenceDerogatoire() {
    const p = moisCourant();
    return {
      'household/salaries': { vous: 3000, conjointe: 1000 },
      [`household/periods/${p}/salaries`]: { vous: 3000, conjointe: 1000 },
      [`household/periods/${p}/variableCharges/v1`]: {
        description: 'Abonnement électricité et gaz du logement',
        amount: 1000, category: 'Maison', paidBy: 'partage',
        date: `${p}-05`, deleted: false,
        splitOverride: { mode: '50-50' }
      },
      [`household/periods/${p}/variableCharges/v2`]: {
        description: 'Courses', amount: 74.25, category: 'Maison',
        paidBy: 'vous', date: `${p}-12`, deleted: false
      }
    };
  }

  for (const largeur of [390, 320]) {
    test(`la pastille dit la règle et ne casse rien à ${largeur} px`, async ({ page }) => {
      await ouvrir(page, {
        db: semenceDerogatoire(),
        vue: { width: largeur, height: 844 }
      });

      await ouvrirLePayeur(page, 'vous');

      const ligne = page.locator('.detail-ligne', { hasText: 'Abonnement électricité' });
      await expect(ligne).toBeVisible();

      // TÉMOIN — sans lui, les trois mesures ci-dessous sont vraies d'une
      // modale qui ne porte aucune pastille, donc vraies pour rien.
      await expect(
        ligne.locator('.charge-split-tag'),
        'la ligne dérogatoire ne porte pas sa règle'
      ).toHaveText('50/50');

      const defauts = await page.evaluate(() => {
        const modale = document.querySelector('#modalDetailDepenses .modal');
        const cadre = modale.getBoundingClientRect();
        const resultats = [];

        for (const ligne of document.querySelectorAll('#modalDetailDepenses .detail-ligne')) {
          const titre = ligne.querySelector('.detail-ligne-titre');
          const montant = ligne.querySelector('.detail-ligne-montant');

          // Une ligne qui défile a du contenu que personne ne verra jamais :
          // rien dans cette modale n'offre de barre horizontale.
          if (ligne.scrollWidth > ligne.clientWidth + 1) {
            resultats.push(
              `« ${titre.textContent.trim().slice(0, 24)} » déborde de sa ligne `
              + `(${ligne.scrollWidth} > ${ligne.clientWidth})`
            );
          }

          for (const el of [titre, montant, ...ligne.querySelectorAll('.charge-split-tag')]) {
            const r = el.getBoundingClientRect();
            if (r.right > cadre.right + 1 || r.left < cadre.left - 1) {
              resultats.push(
                `${el.className || el.tagName} sort de la modale `
                + `[${Math.round(r.left)} → ${Math.round(r.right)}] `
                + `hors de [${Math.round(cadre.left)} → ${Math.round(cadre.right)}]`
              );
            }
          }

          // La pastille par-dessus le montant : on perdrait le chiffre pour
          // gagner son explication.
          const rm = montant.getBoundingClientRect();
          for (const tag of ligne.querySelectorAll('.charge-split-tag')) {
            const rt = tag.getBoundingClientRect();
            const largeur = Math.min(rt.right, rm.right) - Math.max(rt.left, rm.left);
            const hauteur = Math.min(rt.bottom, rm.bottom) - Math.max(rt.top, rm.top);
            if (largeur > 2 && hauteur > 2) {
              resultats.push(`la pastille « ${tag.textContent.trim()} » recouvre le montant`);
            }
          }
        }

        return resultats;
      });

      expect(defauts, defauts.join(' | ')).toEqual([]);
    });
  }
});
