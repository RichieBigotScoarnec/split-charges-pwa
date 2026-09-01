import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Une ouverture d'application ne lit chaque chemin qu'une fois
 *
 * Quatre étapes de l'initialisation lisaient le nœud `periods` entier, chacune
 * de son côté — le complément des salaires, la chaîne de report, la
 * reconduction, le sélecteur de mois — et trois autres relisaient des nœuds que
 * `loadPeriodData` venait de charger. Mesuré à douze mois de données :
 *
 *   avant : 22 lectures, 471 861 octets, dont 4 × 113 275 pour `periods` (96 %)
 *   après : 13 lectures, 122 644 octets, dont 1 × 113 275
 *
 * Aucune de ces lectures ne rapportait rien de neuf : elles tombaient dans la
 * même séquence, à quelques centaines de millisecondes d'écart.
 *
 * Ce contrôle est le garde-fou du gain, et son mode d'échec est délibérément
 * anodin : un contributeur qui oublie de passer l'instantané fait tomber CE
 * test, qui nomme le chemin relu. Il ne fait pas apparaître un chiffre faux —
 * c'est toute la différence avec un agrégat stocké, dont l'oubli serait
 * silencieux et monétaire.
 */

/** Compte les `once('value')` par chemin, par-dessus le double de Firebase */
const COMPTEUR = `
  (function () {
    window.__lectures = [];
    var vraiDatabase = window.firebase.database;
    window.firebase.database = function () {
      var db = vraiDatabase.apply(this, arguments);
      var vraiRef = db.ref;
      db.ref = function (chemin) {
        var r = vraiRef.call(db, chemin);
        var vraiOnce = r.once;
        r.once = function (evenement) {
          window.__lectures.push(chemin);
          if (window.__refuserPeriods && chemin === 'household/periods') {
            window.__refuserPeriods = false;
            return Promise.reject(new Error('lecture refusée pour le test'));
          }
          return vraiOnce.call(r, evenement);
        };
        return r;
      };
      return db;
    };
  })();
`;

/**
 * L'HORLOGE EST FIGÉE — l'historique semé ci-dessous est ANCRÉ à août 2026
 *
 * `Date.UTC(2026, 7 - m, 1)` part du mois d'août, celui où ce fichier a été
 * écrit, et descend sur six mois. Deux contrôles exigent ensuite que l'écran
 * porte les charges du mois AFFICHÉ — c'est le garde-fou qui empêche d'avoir
 * échangé une lenteur contre un écran vide.
 *
 * Le 1er septembre 2026, l'application a ouvert sur `2026-09`, mois où rien
 * n'est semé : zéro ligne, et les deux contrôles sont tombés sans qu'une ligne
 * de code change.
 *
 * Le mois est CALCULÉ ici, jamais écrit en toutes lettres : un relevé des clés
 * de mois littérales ne voit pas ce fichier. C'est ce qui l'a fait manquer au
 * premier passage, alors que `tendances.spec.js` et `tendances-metriques.spec.js`
 * tombaient le même jour pour la même raison.
 */
const LE_15_AOUT = new Date('2026-08-15T10:00:00');

/** Un historique de six mois, garni : la relecture doit coûter quelque chose */
function semer() {
  const db = {};
  for (let m = 0; m < 6; m++) {
    const d = new Date(Date.UTC(2026, 7 - m, 1));
    const p = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    db[`household/periods/${p}/salaries`] = { vous: 2600, conjointe: 2100 };
    for (let i = 0; i < 12; i++) {
      db[`household/periods/${p}/variableCharges/c${m}_${i}`] = {
        description: `Dépense ${i}`, amount: 20 + i, category: 'Courses',
        paidBy: i % 2 ? 'vous' : 'conjointe', date: `${p}-0${(i % 9) + 1}`, deleted: false
      };
    }
  }
  db['household/salaries'] = { vous: 2600, conjointe: 2100 };
  db['household/carryOverEnabled'] = true;
  return db;
}

/** Les chemins lus, dépréfixés, avec leur nombre de lectures */
async function lectures(page) {
  return page.evaluate(() => {
    const compte = {};
    for (const chemin of window.__lectures) {
      const c = chemin.replace(/^household\//, '');
      compte[c] = (compte[c] || 0) + 1;
    }
    return compte;
  });
}

async function ouvrir(page, { refuserPeriods = false } = {}) {
  await page.clock.setFixedTime(LE_15_AOUT);
  await setupFirebaseMock(page);
  await page.addInitScript(COMPTEUR);
  await page.addInitScript(`window.__db = ${JSON.stringify(semer())};
    window.__refuserPeriods = ${refuserPeriods};`);
  await waitForApp(page);
  await page.waitForTimeout(1200);
}

test.describe('Le coût d\'une ouverture', () => {
  test('le nœud `periods` n\'est lu qu\'une fois', async ({ page }) => {
    await ouvrir(page);
    expect((await lectures(page)).periods).toBe(1);
  });

  test('aucun chemin n\'est lu deux fois', async ({ page }) => {
    // `loadPeriodData` charge déjà les trois listes du mois ; les étapes
    // « charges variables », « charges fixes » et « remboursements » les
    // rechargeaient derrière lui, et `salaries` était lu trois fois.
    await ouvrir(page);
    const compte = await lectures(page);

    const relus = Object.entries(compte).filter(([, n]) => n > 1);
    expect(relus, `Chemins lus plus d'une fois : ${JSON.stringify(relus)}`).toEqual([]);
  });

  test('les trois listes du mois sont bien chargées, malgré la lecture unique', async ({ page }) => {
    // Supprimer un doublon qui supprimerait aussi l'affichage serait un bien
    // mauvais échange : on vérifie que l'écran porte les charges semées.
    await ouvrir(page);
    const lignes = await page.locator('#variableChargesList .charge-item').count();
    expect(lignes).toBeGreaterThan(0);
  });

  test('le sélecteur propose les six mois de la base', async ({ page }) => {
    await ouvrir(page);
    const options = await page.locator('#periodSelect option').count();
    expect(options).toBeGreaterThanOrEqual(6);
  });
});

test.describe('Le filet de runStep tient toujours', () => {
  test('si la lecture de l\'historique échoue, les listes se chargent d\'elles-mêmes', async ({ page }) => {
    // Le risque de la mutualisation : avoir échangé une lenteur contre un
    // écran vide. `periodeChargee` reste faux quand l'étape amont échoue, et
    // chaque étape avale recharge alors ce qu'il lui faut.
    await ouvrir(page, { refuserPeriods: true });

    const lignes = await page.locator('#variableChargesList .charge-item').count();
    expect(lignes, 'les charges doivent s\'afficher même si l\'étape amont a échoué').toBeGreaterThan(0);
  });

  test('et le sélecteur de mois est peuplé quand même', async ({ page }) => {
    await ouvrir(page, { refuserPeriods: true });
    const options = await page.locator('#periodSelect option').count();
    expect(options).toBeGreaterThanOrEqual(6);
  });
});

test.describe('Le coût d\'un changement de mois', () => {
  test('un seul historique lu par changement', async ({ page }) => {
    // `refreshCarryOver` puis `applyRecurringCharges` le relisaient chacune,
    // dans le même geste, à quelques millisecondes d'écart.
    await ouvrir(page);
    await page.evaluate(() => { window.__lectures.length = 0; });

    await page.selectOption('#periodSelect', { index: 1 });
    await page.waitForTimeout(1200);

    expect((await lectures(page)).periods).toBe(1);
  });
});
