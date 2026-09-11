import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * La tête du bilan — le lot D, sur la page réelle
 *
 * `tests/utils/tete-du-bilan.test.js` tient la fabrique ; ce fichier tient ce
 * que l'écran en fait. Trois propriétés, et chacune porte son témoin :
 *
 *   1. **La tête porte le libellé de la portée courante** — après chaque geste,
 *      une tête et une seule, celle de la portée annoncée par le sélecteur.
 *   2. **Le grand-livre est ouvert au bureau, replié au téléphone** — et le
 *      franchissement de 900 px le réaligne.
 *   3. **À 320 px, la tête tient** — sur le cas le plus hostile que les champs
 *      laissent saisir : un montant à quatre chiffres et un prénom de trente
 *      caractères sans une coupure.
 */

const LIBELLES = { deux: 'Solde du mois', solo: 'Moi ce mois', prive: 'Mon espace privé' };

/**
 * Salaires 3000/1000, et ce que chacun a avancé
 *
 * Par défaut Richard avance 1 000 € : sa part est de 750 €, Cindy lui doit
 * 250 €. En relatif (`moisCourant`), pas de date du jour dans les montants :
 * rien ici ne dépend du calendrier.
 */
async function semer(page, { vousPaie = 1000, conjointePaie = 0, prenomConjointe } = {}) {
  if (prenomConjointe) {
    await allerAuPanneau(page, 'panneauReglages');
    await page.locator('#prenomConjointe').fill(prenomConjointe);
    await page.locator('#prenomConjointe').blur();
    await page.waitForTimeout(600);
    await allerAuPanneau(page, 'panneauBilan');
  }

  await page.evaluate(async ({ vousPaie, conjointePaie }) => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const now = new Date();
    const mois = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ecritures = { [`periods/${mois}/salaries`]: { vous: 3000, conjointe: 1000 } };
    if (vousPaie) {
      ecritures[`periods/${mois}/variableCharges/v1`] = {
        description: 'Courses', amount: vousPaie, category: 'Maison', paidBy: 'vous', deleted: false
      };
    }
    if (conjointePaie) {
      ecritures[`periods/${mois}/variableCharges/v2`] = {
        description: 'Loyer', amount: conjointePaie, category: 'Maison', paidBy: 'conjointe', deleted: false
      };
    }
    await dbSet('salaries', { vous: 3000, conjointe: 1000 });
    await dbUpdate(undefined, ecritures);
    await window.changePeriod(mois);
  }, { vousPaie, conjointePaie });
  await page.waitForTimeout(2000);
}

/** La couleur que le moteur rend pour un jeton, lue sur un témoin posé à part */
const encreDuJeton = (page, jeton) => page.evaluate((j) => {
  const temoin = document.createElement('span');
  temoin.style.color = `var(${j})`;
  document.body.appendChild(temoin);
  const couleur = getComputedStyle(temoin).color;
  temoin.remove();
  return couleur;
}, jeton);

test.describe('La tête suit la portée — 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await semer(page);
  });

  test('après chaque geste, une tête et une seule — celle de la portée annoncée', async ({ page }) => {
    await expect(page.locator('#panneauBilan [data-portee]'), 'prémisse : trois segments de portée').toHaveCount(3);

    // Un aller-retour complet, et deux passages par chaque portée : une tête
    // restée d'un rendu précédent se verrait au second passage.
    for (const portee of ['solo', 'prive', 'deux', 'prive', 'solo', 'deux']) {
      await page.locator(`#panneauBilan [data-portee="${portee}"]`).click();

      const tetes = page.locator('#panneauBilan .bilan-heros');
      await expect(tetes, `après « ${portee} » : une tête, et une seule`).toHaveCount(1);
      await expect(tetes).toHaveAttribute('data-tete', portee);
      await expect(tetes.locator('.bilan-tete')).toHaveText(LIBELLES[portee]);
      // L'annonce du sélecteur et celle de la tête disent la même portée.
      await expect(page.locator(`#panneauBilan [data-portee="${portee}"]`)).toHaveAttribute('aria-checked', 'true');
    }
  });

  test('Privé : aucun chiffre dans la phrase de tête — elle dit la règle', async ({ page }) => {
    // La PHRASE, pas toute la carte : la seconde face porte le total de
    // l'autre, et c'est voulu (planche 13). Ce qui n'a pas de chiffre est la
    // tête proprement dite — un grand chiffre y déferait la protection d'une
    // portée qui vit en mémoire vive.
    await page.locator('#panneauBilan [data-portee="prive"]').click();
    const tete = page.locator('#panneauBilan .bilan-heros');
    await expect(tete).toHaveAttribute('data-tete', 'prive');
    await expect(tete.locator('.bilan-heros-phrase')).toContainText('voit');
    expect(await tete.locator('.bilan-heros-phrase').innerText()).not.toMatch(/\d/);

    // Témoin : la même lecture, sur « À deux », trouve bien un chiffre. Sans
    // lui, une phrase vide satisferait l'absence.
    await page.locator('#panneauBilan [data-portee="deux"]').click();
    await expect(tete).toHaveAttribute('data-tete', 'deux');
    expect(await tete.locator('.bilan-heros-phrase').innerText()).toMatch(/\d/);
  });

  test('Solo : un total en encre neutre — l\'ambre n\'appartient qu\'à la créance', async ({ page }) => {
    const ambre = await encreDuJeton(page, '--warning-ink');
    const montant = page.locator('#panneauBilan .bilan-heros .bilan-heros-montant');

    // Témoin d'abord : sur « À deux », la créance EST en ambre. Sinon « pas en
    // ambre » serait satisfait par une feuille qui ne peint plus rien.
    expect(await montant.evaluate((el) => getComputedStyle(el).color)).toBe(ambre);

    await page.locator('#panneauBilan [data-portee="solo"]').click();
    await expect(page.locator('#panneauBilan .bilan-heros')).toHaveAttribute('data-tete', 'solo');
    expect(await montant.evaluate((el) => getComputedStyle(el).color)).not.toBe(ambre);
  });
});

/**
 * Le grand-livre et le montant, aux trois largeurs des planches
 *
 * Les tailles sont BORNÉES, jamais égalées : une taille rendue par `clamp()`
 * est fractionnaire, et `toBe(40)` rougirait au demi-pixel — la règle 1, sur
 * la géométrie rendue.
 */
for (const { largeur, hauteur, ouvert, taille } of [
  { largeur: 1280, hauteur: 800, ouvert: true, taille: [50, 56] },
  { largeur: 390, hauteur: 844, ouvert: false, taille: [38, 41] },
  { largeur: 320, hauteur: 720, ouvert: false, taille: [30, 33] }
]) {
  test.describe(`${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: hauteur } });

    test(`le grand-livre est ${ouvert ? 'OUVERT' : 'REPLIÉ'} au rendu, et le montant fait ${taille[0]} à ${taille[1]} px`, async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
      await semer(page);

      const grandLivre = page.locator('.bilan-heros .summary-details');
      await expect(grandLivre, 'prémisse : le grand-livre vit dans la carte du solde').toHaveCount(1);

      if (ouvert) {
        await expect(grandLivre).toHaveAttribute('open', '');
      } else {
        await expect(grandLivre).not.toHaveAttribute('open');
      }

      const px = await page.locator('.bilan-heros-montant').evaluate(
        (el) => parseFloat(getComputedStyle(el).fontSize)
      );
      expect(px).toBeGreaterThanOrEqual(taille[0]);
      expect(px).toBeLessThanOrEqual(taille[1]);
    });
  });
}

test.describe('Franchir 900 px', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('réaligne le grand-livre sur la largeur, dans les deux sens', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await semer(page);

    const grandLivre = page.locator('.bilan-heros .summary-details');
    await expect(grandLivre, 'prémisse : ouvert au bureau').toHaveAttribute('open', '');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(grandLivre).not.toHaveAttribute('open');

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(grandLivre).toHaveAttribute('open', '');
  });
});

test.describe('Le choix de la personne tient au rendu suivant — 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('un grand-livre déplié à la main ne se replie pas quand on ajoute une charge', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await semer(page);

    const grandLivre = page.locator('.bilan-heros .summary-details');
    await expect(grandLivre, 'prémisse : replié au téléphone').not.toHaveAttribute('open');
    await grandLivre.locator('summary').click();
    await expect(grandLivre).toHaveAttribute('open', '');

    // Une écriture : `calculateSummary` réécrit tout le bilan. 1 200 € avancés
    // pour une part de 900 € : le solde passe de 250 à 300 €.
    await semer(page, { vousPaie: 1200 });
    await expect(page.locator('.bilan-heros-montant'), 'prémisse : le bilan a bien été réécrit')
      .toContainText('300');
    await expect(grandLivre).toHaveAttribute('open', '');
  });
});

test.describe('À 320 px au doigt, la tête tient', () => {
  test.use({ viewport: { width: 320, height: 720 }, hasTouch: true });

  test('quatre chiffres, et un prénom de trente caractères sans une coupure', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    // Cindy avance 10 000 € : la part de Richard est de 7 500 €, qu'il doit.
    // « Tu dois 7 500,00 € à Bartholomewmaximilienleonardxy ».
    await semer(page, {
      vousPaie: 0,
      conjointePaie: 10000,
      prenomConjointe: 'Bartholomewmaximilienleonardxy'
    });

    const tete = page.locator('.bilan-heros[data-tete="deux"]');
    await expect(tete.locator('.bilan-heros-phrase'), 'prémisse : le cas hostile est bien celui rendu')
      .toContainText('Bartholomewmaximilienleonardxy');
    await expect(tete.locator('.bilan-heros-phrase')).toContainText('Tu dois');

    const mesure = await tete.evaluate((carte) => {
      const phrase = carte.querySelector('.bilan-heros-phrase');
      const bordDroit = phrase.getBoundingClientRect().right;
      return {
        carteDeborde: carte.scrollWidth - carte.clientWidth,
        pageDeborde: document.documentElement.scrollWidth - window.innerWidth,
        lignesDuMontant: carte.querySelector('.bilan-heros-montant').getClientRects().length,
        morceauxDehors: [...phrase.children]
          .filter((morceau) => morceau.getBoundingClientRect().right > bordDroit + 0.5)
          .map((morceau) => morceau.textContent)
      };
    });

    expect(mesure.carteDeborde, 'la carte du solde déborde sa boîte').toBeLessThanOrEqual(1);
    expect(mesure.pageDeborde, 'la page défile en travers').toBeLessThanOrEqual(0);
    expect(mesure.morceauxDehors, 'un morceau de la phrase sort de sa ligne').toEqual([]);
    // L'insécable : le montant ne se coupe jamais, quelle que soit la place.
    expect(mesure.lignesDuMontant, 'le montant est coupé en deux').toBe(1);
  });
});
