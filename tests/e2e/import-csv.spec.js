import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Importer un CSV de charges
 *
 * Les données n'entraient que charge par charge. L'analyse du fichier est
 * verrouillée par `tests/utils/import-csv.test.js` ; ce qui est vérifié ici,
 * c'est le geste complet — choisir un fichier, voir ce qui sera écrit, et
 * n'écrire que cela.
 *
 * Les trois principes de l'écran, éprouvés un par un :
 *
 *   1. on n'écrase rien — les lignes s'ajoutent ;
 *   2. on montre avant d'écrire, rejets compris ;
 *   3. **on ne devine pas le payeur**.
 */

/** Dépose un fichier CSV dans le champ */
async function deposer(page, contenu, nom = 'charges.csv') {
  await page.locator('#importFichier').setInputFiles({
    name: nom,
    mimeType: 'text/csv',
    buffer: Buffer.from(contenu, 'utf8')
  });
  await page.waitForTimeout(700);
}

/** Les charges variables écrites pour le mois courant */
async function chargesEnBase(page) {
  return page.evaluate(async () => {
    const { dbGet } = await import('/js/db.js');
    const p = document.getElementById('periodSelect').value;
    return {
      variables: Object.values((await dbGet(`periods/${p}/variableCharges`)) || {}),
      fixes: Object.values((await dbGet(`periods/${p}/fixedCharges`)) || {})
    };
  });
}

const CSV = [
  'Description;Catégorie;Montant;Payé par;Date;Type',
  'Courses Leclerc;Courses;84,30;vous;2026-08-12;variable',
  'Loyer;Maison;950;vous;05/08/2026;fixe',
  'Restaurant;Restos;46;conjointe;2026-08-16;'
].join('\n');

test.describe('L\'import CSV', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await page.evaluate(() => window.showImportModal());
    await expect(page.locator('#modalImport')).toBeVisible();
  });

  test('le bouton ouvre l\'écran, et le format est donné', async ({ page }) => {
    // Un format attendu qu'on ne dit nulle part se devine par essais successifs.
    await expect(page.locator('#importTitre')).toContainText('Importer');
    await expect(page.locator('.import-format-exemple')).toContainText('Description');
    await expect(page.locator('.import-format-exemple')).toContainText('Montant');
  });

  test('rien n\'est importable avant d\'avoir choisi un fichier', async ({ page }) => {
    await expect(page.locator('#importValider')).toBeDisabled();
  });

  test('l\'aperçu montre ce qui sera écrit', async ({ page }) => {
    await deposer(page, CSV);

    const apercu = page.locator('#importApercu');
    await expect(apercu).toContainText('3 lignes prêtes');
    await expect(apercu).toContainText('Courses Leclerc');
    await expect(apercu).toContainText('Loyer');
    await expect(apercu).toContainText('Restaurant');
    // 84,30 + 950 + 46
    await expect(apercu).toContainText('1 080,30');
  });

  test('importer écrit les lignes, chacune dans sa liste', async ({ page }) => {
    await deposer(page, CSV);
    await page.locator('#importValider').click();
    await page.waitForTimeout(1200);

    const { variables, fixes } = await chargesEnBase(page);
    expect(variables.map(c => c.description).sort()).toEqual(['Courses Leclerc', 'Restaurant']);
    expect(fixes.map(c => c.description)).toEqual(['Loyer']);
  });

  test('les montants, payeurs et dates sont ceux du fichier', async ({ page }) => {
    await deposer(page, CSV);
    await page.locator('#importValider').click();
    await page.waitForTimeout(1200);

    const { variables, fixes } = await chargesEnBase(page);
    const courses = variables.find(c => c.description === 'Courses Leclerc');
    expect(courses.amount).toBeCloseTo(84.3, 6);
    expect(courses.paidBy).toBe('vous');
    expect(courses.date).toBe('2026-08-12');
    // La forme française est convertie.
    expect(fixes[0].date).toBe('2026-08-05');
    expect(variables.find(c => c.description === 'Restaurant').paidBy).toBe('conjointe');
  });

  test('l\'import ajoute, il n\'écrase pas', async ({ page }) => {
    // Ce qui le distingue de la restauration de sauvegarde.
    await page.evaluate(async () => {
      const { dbUpdate } = await import('/js/db.js');
      const p = document.getElementById('periodSelect').value;
      await dbUpdate(undefined, {
        [`periods/${p}/variableCharges/deja`]: {
          description: 'Déjà là', amount: 12, category: 'Courses',
          paidBy: 'vous', date: `${p}-01`, deleted: false }
      });
    });

    await deposer(page, CSV);
    await page.locator('#importValider').click();
    await page.waitForTimeout(1200);

    const { variables } = await chargesEnBase(page);
    expect(variables.map(c => c.description)).toContain('Déjà là');
    expect(variables).toHaveLength(3);
  });

  test('les lignes rejetées sont montrées avec leur motif', async ({ page }) => {
    // Un import qui avale une ligne sur trois sans le dire est pire qu'un
    // import qui refuse tout.
    await deposer(page, [
      'Description;Montant;Payé par',
      'Courses;84,30;vous',
      'Cassée;abc;vous',
      'Anonyme;46;Jean-Pierre'
    ].join('\n'));

    const apercu = page.locator('#importApercu');
    await expect(apercu).toContainText('1 ligne prête');
    await expect(apercu).toContainText('2 lignes non importées');
    await expect(apercu).toContainText('montant illisible');
    await expect(apercu).toContainText('payeur illisible');
  });

  test('sans colonne de payeur, l\'écran le demande plutôt que de deviner', async ({ page }) => {
    // Le contrôle qui compte le plus : attribuer une dépense au hasard
    // fausserait le solde des deux personnes sans que rien ne le signale.
    await deposer(page, 'Description;Montant\nCourses;84,30\nRestaurant;46');

    await expect(page.locator('#importPayeurChamp')).toBeVisible();
    await expect(page.locator('#importValider')).toBeDisabled();
    await expect(page.locator('#importApercu')).toContainText('aucun payeur');
  });

  test('le payeur choisi débloque l\'import', async ({ page }) => {
    await deposer(page, 'Description;Montant\nCourses;84,30\nRestaurant;46');
    await page.locator('#importPayeur').selectOption('conjointe');
    await page.waitForTimeout(700);

    await expect(page.locator('#importApercu')).toContainText('2 lignes prêtes');
    await page.locator('#importValider').click();
    await page.waitForTimeout(1200);

    const { variables } = await chargesEnBase(page);
    expect(variables.every(c => c.paidBy === 'conjointe')).toBe(true);
  });

  test('un fichier sans colonne reconnue le dit, et n\'importe rien', async ({ page }) => {
    await deposer(page, 'Colonne A;Colonne B\nvaleur;autre');
    await expect(page.locator('#importApercu')).toContainText('Aucune colonne');
    await expect(page.locator('#importValider')).toBeDisabled();
  });

  test('un libellé hostile est affiché en texte, jamais interprété', async ({ page }) => {
    // Le contenu vient d'un fichier que la personne n'a pas nécessairement
    // écrit : c'est exactement le cas où l'échappement compte.
    await deposer(page, 'Description;Montant;Payé par\n<img src=x onerror=alert(1)>;50;vous');

    await expect(page.locator('#importApercu')).toContainText('<img src=x');
    expect(await page.locator('#importApercu img').count()).toBe(0);
  });
});
