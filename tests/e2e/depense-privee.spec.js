import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * L'aval et les dépenses privées, du geste jusqu'à ce que l'autre voit
 *
 * Le mur lui-même est éprouvé ailleurs, contre le vrai moteur de règles — c'est
 * le seul endroit où il puisse l'être, puisque c'est le serveur qui refuse.
 * Ces contrôles-ci portent sur ce que le double en mémoire permet de vérifier :
 * que l'écran **écrit au bon endroit**, sous la bonne clé, et qu'il ne promet
 * rien que les règles démentiraient.
 *
 * Le point le plus important : **l'aval qu'on donne s'écrit sous l'emplacement
 * de l'AUTRE**. C'est ce qui rend la règle serveur applicable — elle exige
 * d'être l'autre pour écrire là. Se tromper de clé ici ferait un écran qui
 * paraît fonctionner et dont chaque écriture serait rejetée en production.
 */

/** Ouvre l'écran des dépenses privées */
async function ouvrirPrive(page) {
  await page.evaluate(() => window.showPrivateExpensesModal());
  await expect(page.locator('#modalPrive')).toBeVisible();
}

/** Accorde l'aval à l'autre personne depuis l'écran */
async function accorderLAval(page) {
  await page.locator('#priveAvalDonne + .toggle-slider').click();
  await page.waitForTimeout(600);
}

/** Ce que porte la base, aux trois racines */
async function enBase(page) {
  return page.evaluate(() => ({
    aval: window.__db['aval/vous'] || window.__db['aval/conjointe'] || null,
    cles: Object.keys(window.__db).filter(c =>
      c.startsWith('aval') || c.startsWith('prive') || c.startsWith('totauxPrives'))
  }));
}

test.describe('L\'aval et les dépenses privées', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('le bouton « Privé » ouvre l\'écran', async ({ page }) => {
    // Un bouton visible et inerte se lit comme une panne : `init.js` n'appelle
    // que les actions de sa liste blanche, et le module doit être initialisé.
    await page.locator('[data-action="showPrivateExpensesModal"]').click();
    await expect(page.locator('#modalPrive')).toBeVisible();
    await expect(page.locator('#priveTitre')).toContainText('privées');
  });

  test('sans aval reçu, la saisie est impossible et l\'écran le dit', async ({ page }) => {
    await ouvrirPrive(page);

    // Ni champ ni bouton : proposer une saisie que la base refuserait serait
    // promettre ce qu'on ne peut pas tenir.
    await expect(page.locator('#priveMontant')).toHaveCount(0);
    await expect(page.locator('#priveAjouter')).toHaveCount(0);
    await expect(page.locator('#modalPrive')).toContainText('accordé');
  });

  test('l\'aval qu\'on donne s\'écrit sous l\'emplacement de l\'AUTRE', async ({ page }) => {
    // Le contrôle qui compte le plus de ce fichier. La règle serveur exige
    // d'être l'autre pour écrire `aval/{emplacement}` : écrire sous le sien
    // ferait un écran qui paraît marcher et que la production rejette.
    await ouvrirPrive(page);
    await accorderLAval(page);

    const { cles } = await enBase(page);
    // Le compte d'essai est « vous » : l'aval qu'il donne va donc à « conjointe ».
    expect(cles).toContain('aval/conjointe');
    expect(cles, 'il se serait auto-autorisé').not.toContain('aval/vous');
  });

  test('l\'aval porte son état, sa date et son auteur', async ({ page }) => {
    await ouvrirPrive(page);
    await accorderLAval(page);

    const aval = await page.evaluate(() => window.__db['aval/conjointe']);
    expect(aval.actif).toBe(true);
    expect(aval.accordePar).toBe('vous');
    expect(typeof aval.accordeLe).toBe('number');
  });

  test('retirer l\'aval l\'écrit à faux plutôt que d\'effacer la trace', async ({ page }) => {
    await ouvrirPrive(page);
    await accorderLAval(page);
    await accorderLAval(page);

    const aval = await page.evaluate(() => window.__db['aval/conjointe']);
    expect(aval.actif).toBe(false);
    expect(aval.accordeLe, 'la trace de l\'accord passé disparaîtrait').toBeGreaterThan(0);
  });

  test('l\'écran nomme les deux accords, et pas seulement le sien', async ({ page }) => {
    // Un pacte se lit dans les deux sens : n'afficher que celui qu'on reçoit
    // laisserait croire à une réciprocité qui n'existe peut-être pas.
    await ouvrirPrive(page);

    // `innerText` rend le texte tel qu'il s'affiche, et la feuille de style met
    // les titres en capitales : comparer en minuscules porte sur le contenu
    // plutôt que sur sa présentation.
    const texte = (await page.locator('#modalPrive').innerText()).toLowerCase();
    expect(texte).toContain('votre accord');
    expect(texte).toContain('accord que vous donnez');
  });

  test('l\'écran dit que le total annoncé est déclaratif', async ({ page }) => {
    // La limite honnête du dispositif : aucune règle ne peut vérifier la somme
    // de ce qu'elle n'a pas le droit de lire. Le taire ferait croire à une
    // garantie technique qui n'existe pas.
    //
    // La phrase n'apparaît qu'avec un résumé publié : sans lui, l'écran dit
    // « on n'en sait rien », ce qui est l'autre honnêteté à tenir.
    await page.evaluate(() => {
      const periode = document.getElementById('periodSelect')?.value;
      window.__db[`totauxPrives/conjointe/${periode}`] = { montant: 340, nombre: 5 };
    });
    await ouvrirPrive(page);
    await accorderLAval(page);

    await expect(page.locator('#modalPrive')).toContainText('déclaré');
  });

  test('sans résumé publié, l\'écran se tait plutôt que d\'affirmer', async ({ page }) => {
    // « Rien publié » n'est pas « zéro dépense privée ». Afficher 0 € ferait
    // croire à une information qu'on n'a pas.
    await ouvrirPrive(page);
    await accorderLAval(page);

    await expect(page.locator('#modalPrive')).toContainText('on n\'en sait rien');
  });

  test('avec l\'aval reçu, la saisie apparaît et écrit dans l\'espace privé', async ({ page }) => {
    // Le double en mémoire n'applique pas les règles : on simule ici l'aval
    // reçu, pour éprouver le chemin d'écriture que la production autorisera.
    await page.evaluate(() => {
      window.__db['aval/vous'] = { actif: true, accordeLe: 1756300000000, accordePar: 'conjointe' };
    });
    await ouvrirPrive(page);

    await expect(page.locator('#priveMontant')).toBeVisible();
    await page.locator('#priveMontant').fill('45');
    await page.locator('#priveDescription').fill('Coiffeur');
    await page.locator('#priveAjouter').click();
    await page.waitForTimeout(700);

    const { cles } = await enBase(page);
    const chemins = cles.filter(c => c.startsWith('prive/vous/periods/'));
    expect(chemins.length).toBeGreaterThan(0);

    // Et rien n'a été écrit dans l'espace commun : une dépense privée qui
    // atterrirait dans `household` serait lisible par l'autre.
    const dansLeFoyer = await page.evaluate(() =>
      Object.keys(window.__db).filter(c => c.includes('household') && c.includes('Coiffeur')));
    expect(dansLeFoyer).toEqual([]);
  });

  test('le total publié ne porte que des nombres, jamais un libellé', async ({ page }) => {
    // Le contrat du mur, vérifié sur ce qui sort réellement.
    await page.evaluate(() => {
      window.__db['aval/vous'] = { actif: true, accordeLe: 1756300000000, accordePar: 'conjointe' };
    });
    await ouvrirPrive(page);
    await page.locator('#priveMontant').fill('45');
    await page.locator('#priveDescription').fill('Coiffeur');
    await page.locator('#priveAjouter').click();
    await page.waitForTimeout(700);

    const totaux = await page.evaluate(() => {
      const cle = Object.keys(window.__db).find(c => c.startsWith('totauxPrives/vous/'));
      return cle ? window.__db[cle] : null;
    });

    expect(totaux).not.toBeNull();
    expect(Object.keys(totaux).sort()).toEqual(['montant', 'nombre']);
    expect(totaux.montant).toBe(45);
    expect(JSON.stringify(totaux), 'un libellé a franchi le mur').not.toContain('Coiffeur');
  });

  test('une dépense privée n\'entre pas dans le solde du couple', async ({ page }) => {
    // Elle vit hors de `household` : le bilan ne peut pas la voir. Le vérifier
    // quand même, parce que c'est la propriété que tout le dispositif protège.
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('3000');
    await page.locator('#salaireConjointe').blur();
    await page.waitForTimeout(500);

    const avant = await page.locator('#summarySection').innerText();

    await page.evaluate(() => {
      window.__db['aval/vous'] = { actif: true, accordeLe: 1756300000000, accordePar: 'conjointe' };
    });
    await ouvrirPrive(page);
    await page.locator('#priveMontant').fill('45');
    await page.locator('#priveAjouter').click();
    await page.waitForTimeout(700);
    await page.locator('#priveFermer').click();
    await page.waitForTimeout(500);

    expect(await page.locator('#summarySection').innerText()).toBe(avant);
  });
});
