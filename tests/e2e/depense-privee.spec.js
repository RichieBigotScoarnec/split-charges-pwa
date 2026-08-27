import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Écrire chez soi ne demande rien ; lire chez l'autre demande son accord
 *
 * Le mur lui-même est éprouvé ailleurs, contre le vrai moteur de règles — c'est
 * le seul endroit où il puisse l'être, puisque c'est le serveur qui refuse.
 * Ces contrôles-ci portent sur ce que le double en mémoire permet de vérifier :
 * que l'écran **écrit au bon endroit**, sous la bonne clé, et qu'il ne promet
 * rien que les règles démentiraient.
 *
 * Le point le plus important : **l'accord qu'on donne s'écrit sous SON PROPRE
 * emplacement**. C'est ce qui rend la règle serveur applicable — elle exige
 * d'être le propriétaire pour ouvrir son espace. L'écrire sous celui de l'autre
 * reviendrait à s'accorder l'accès à ses données, et ferait un écran qui paraît
 * fonctionner dont chaque écriture serait rejetée en production.
 */

/** Ouvre l'écran des dépenses privées */
async function ouvrirPrive(page) {
  await page.evaluate(() => window.showPrivateExpensesModal());
  await expect(page.locator('#modalPrive')).toBeVisible();
}

/** Ouvre — ou referme — le détail de ses propres dépenses à l'autre */
async function basculerLePartage(page) {
  await page.locator('#privePartage + .toggle-slider').click();
  await page.waitForTimeout(600);
}

/** Les clés écrites aux trois racines */
async function clesEcrites(page) {
  return page.evaluate(() => Object.keys(window.__db).filter(c =>
    c.startsWith('aval') || c.startsWith('prive') || c.startsWith('totauxPrives')));
}

test.describe('Les dépenses privées', () => {
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

  test('la saisie est disponible d\'emblée, sans accord de personne', async ({ page }) => {
    // Le contrôle qui dit le sujet. Une version antérieure retirait le
    // formulaire tant que la conjointe n'avait rien accordé : elle demandait la
    // permission d'avoir un jardin secret.
    await ouvrirPrive(page);

    await expect(page.locator('#priveMontant')).toBeVisible();
    await expect(page.locator('#priveAjouter')).toBeVisible();
  });

  test('une dépense privée s\'enregistre dans son propre espace', async ({ page }) => {
    await ouvrirPrive(page);
    await page.locator('#priveMontant').fill('45');
    await page.locator('#priveDescription').fill('Coiffeur');
    await page.locator('#priveAjouter').click();
    await page.waitForTimeout(700);

    const chemins = (await clesEcrites(page)).filter(c => c.startsWith('prive/vous/periods/'));
    expect(chemins.length).toBeGreaterThan(0);

    // Et rien n'a été écrit dans l'espace commun : une dépense privée qui
    // atterrirait dans `household` serait lisible par l'autre.
    const dansLeFoyer = await page.evaluate(() =>
      Object.keys(window.__db).filter(c => c.includes('household') && c.includes('Coiffeur')));
    expect(dansLeFoyer).toEqual([]);
  });

  test('l\'accord qu\'on donne s\'écrit sous SON PROPRE emplacement', async ({ page }) => {
    // Le contrôle qui compte le plus de ce fichier. La règle serveur exige
    // d'être le propriétaire pour écrire `aval/{emplacement}` : l'écrire sous
    // celui de l'autre reviendrait à s'accorder l'accès à ses données, et la
    // production le rejetterait après un écran qui paraît marcher.
    await ouvrirPrive(page);
    await basculerLePartage(page);

    const cles = await clesEcrites(page);
    // Le compte d'essai est « vous » : c'est donc son propre espace qu'il ouvre.
    expect(cles).toContain('aval/vous');
    expect(cles, 'il se serait accordé l\'accès aux données de l\'autre').not.toContain('aval/conjointe');
  });

  test('l\'accord porte son état, sa date et son auteur', async ({ page }) => {
    await ouvrirPrive(page);
    await basculerLePartage(page);

    const aval = await page.evaluate(() => window.__db['aval/vous']);
    expect(aval.actif).toBe(true);
    // L'auteur est toujours le propriétaire : la règle serveur le vérifie, et
    // une trace d'audit qui désignerait quelqu'un d'autre serait fausse.
    expect(aval.accordePar).toBe('vous');
    expect(typeof aval.accordeLe).toBe('number');
  });

  test('refermer l\'accord l\'écrit à faux plutôt que d\'effacer la trace', async ({ page }) => {
    await ouvrirPrive(page);
    await basculerLePartage(page);
    await basculerLePartage(page);

    const aval = await page.evaluate(() => window.__db['aval/vous']);
    expect(aval.actif).toBe(false);
    expect(aval.accordeLe, 'la trace de l\'accord passé disparaîtrait').toBeGreaterThan(0);
  });

  test('refermer l\'accord n\'efface aucune dépense', async ({ page }) => {
    // Un accès qu'on referme ne détruit rien : il cesse d'être lisible par
    // l'autre, c'est tout.
    await ouvrirPrive(page);
    await page.locator('#priveMontant').fill('45');
    await page.locator('#priveAjouter').click();
    await page.waitForTimeout(700);

    await basculerLePartage(page);
    await basculerLePartage(page);

    await expect(page.locator('#modalPrive')).toContainText('45,00');
  });

  test('l\'écran nomme les deux accords, et pas seulement le sien', async ({ page }) => {
    // Un accord se lit dans les deux sens, et aucun des deux n'oblige l'autre :
    // ouvrir son espace ne donne aucun droit sur celui d'en face.
    await ouvrirPrive(page);

    // `innerText` rend le texte tel qu'il s'affiche, et la feuille de style met
    // les titres en capitales : comparer en minuscules porte sur le contenu
    // plutôt que sur sa présentation.
    const texte = (await page.locator('#modalPrive').innerText()).toLowerCase();
    expect(texte).toContain('ce que vous ouvrez');
    expect(texte).toContain('vous ouvre');
  });

  test('le total publié ne porte que des nombres, jamais un libellé', async ({ page }) => {
    // Le contrat du mur, vérifié sur ce qui sort réellement : sans accord,
    // c'est tout ce que l'autre voit.
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
});

test.describe('Ce qu\'on voit de l\'autre', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('sans son accord : son total, et la réserve qui va avec', async ({ page }) => {
    await page.evaluate(() => {
      const periode = document.getElementById('periodSelect')?.value;
      window.__db[`totauxPrives/conjointe/${periode}`] = { montant: 340, nombre: 5 };
    });
    await ouvrirPrive(page);

    await expect(page.locator('#modalPrive')).toContainText('340,00');
    // La limite honnête du dispositif : aucune règle ne peut vérifier la somme
    // de ce qu'elle n'a pas le droit de lire. Le taire ferait croire à une
    // garantie technique qui n'existe pas.
    await expect(page.locator('#modalPrive')).toContainText('déclaré');
    // Et surtout : aucun libellé.
    await expect(page.locator('#modalPrive')).not.toContainText('Manucure');
  });

  test('sans rien publié, l\'écran se tait plutôt que d\'affirmer', async ({ page }) => {
    // « Rien publié » n'est pas « zéro dépense privée ». Afficher 0 € ferait
    // croire à une information qu'on n'a pas.
    await ouvrirPrive(page);
    await expect(page.locator('#modalPrive')).toContainText('on n\'en sait rien');
  });

  test('avec son accord : le détail, et plus la réserve du chiffre déclaré', async ({ page }) => {
    // Le double en mémoire n'applique pas les règles : on simule ici l'accord
    // donné par l'autre, pour éprouver le chemin de lecture que la production
    // autorisera.
    await page.evaluate(() => {
      const periode = document.getElementById('periodSelect')?.value;
      window.__db['aval/conjointe'] = { actif: true, accordeLe: 1756300000000, accordePar: 'conjointe' };
      window.__db[`prive/conjointe/periods/${periode}/depenses`] = {
        k1: { montant: 60, description: 'Manucure', date: `${periode}-12`, deleted: false },
        k2: { montant: 25, description: 'Livre', date: `${periode}-18`, deleted: false }
      };
    });
    await ouvrirPrive(page);

    const modale = page.locator('#modalPrive');
    await expect(modale).toContainText('Manucure');
    await expect(modale).toContainText('Livre');
    await expect(modale).toContainText('85,00');
    // Le total déclaré n'a plus lieu d'être : on lit la source.
    await expect(modale).not.toContainText('déclaré');
  });

  test('le détail de l\'autre ne propose aucune croix de suppression', async ({ page }) => {
    // Voir ne donne pas le droit de retirer, et la règle serveur le refuserait :
    // proposer une croix qui échoue serait promettre ce qu'on ne peut pas tenir.
    await page.evaluate(() => {
      const periode = document.getElementById('periodSelect')?.value;
      window.__db['aval/conjointe'] = { actif: true, accordeLe: 1756300000000, accordePar: 'conjointe' };
      window.__db[`prive/conjointe/periods/${periode}/depenses`] = {
        k1: { montant: 60, description: 'Manucure', date: `${periode}-12`, deleted: false }
      };
    });
    await ouvrirPrive(page);

    const croixDansSonBloc = await page.locator('.prive-autre .prive-retirer').count();
    expect(croixDansSonBloc, 'une croix sans effet est promise à échouer').toBe(0);
  });

  test('ouvrir son propre détail n\'ouvre pas celui de l\'autre', async ({ page }) => {
    // Les deux accords sont indépendants. Les lier ferait un chantage discret :
    // « montre-moi les tiennes et je te montre les miennes ».
    await page.evaluate(() => {
      const periode = document.getElementById('periodSelect')?.value;
      window.__db[`prive/conjointe/periods/${periode}/depenses`] = {
        k1: { montant: 60, description: 'Manucure', date: `${periode}-12`, deleted: false }
      };
    });
    await ouvrirPrive(page);
    await basculerLePartage(page);

    await expect(page.locator('#modalPrive')).not.toContainText('Manucure');
  });
});

test.describe('Le solde du couple', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('une dépense privée n\'y entre pas', async ({ page }) => {
    // Elle vit hors de `household` : le bilan ne peut pas la voir. Le vérifier
    // quand même, parce que c'est la propriété que tout le dispositif protège.
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('3000');
    await page.locator('#salaireConjointe').blur();
    await page.waitForTimeout(500);

    const avant = await page.locator('#summarySection').innerText();

    await ouvrirPrive(page);
    await page.locator('#priveMontant').fill('45');
    await page.locator('#priveAjouter').click();
    await page.waitForTimeout(700);
    await page.locator('#priveFermer').click();
    await page.waitForTimeout(500);

    expect(await page.locator('#summarySection').innerText()).toBe(avant);
  });
});
