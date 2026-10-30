import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Une modification qui change le mois de la date déplace la charge
 *
 * Mesuré le 2026-10-29 sur une sauvegarde réelle : une charge commune de 182 €
 * datée du 2026-11-01 vivait sous `periods/2026-10` et pesait sur octobre.
 * L'ajout rangeait par la date, la modification par le mois affiché.
 *
 * Les cas unitaires (`charge-deplacee-par-sa-date.test.js`) tiennent l'écriture
 * et ses deux poches. Celui-ci tient le TRAJET : le formulaire réel, la base
 * relue, la liste d'octobre qui ne montre plus la charge, et le toast qui dit
 * où elle est partie — sans lequel elle semblerait s'être perdue.
 *
 * Horloge figée et mois ABSOLUS : un semis relatif changerait de mois avec le
 * calendrier, et le 1er novembre cesserait d'être « le mois suivant ».
 */

const LE_29_OCTOBRE = new Date('2026-10-29T10:00:00');

function semence() {
  return {
    'household/salaries': { vous: 2500, conjointe: 1800 },
    'household/periods/2026-10/salaries': { vous: 2500, conjointe: 1800 },
    'household/periods/2026-10/variableCharges/c1': {
      description: 'Grosse course', amount: 182, category: 'Courses',
      paidBy: 'vous', date: '2026-10-20', deleted: false
    },
    'household/periods/2026-10/variableCharges/c2': {
      description: 'Boulangerie', amount: 60, category: 'Courses',
      paidBy: 'conjointe', date: '2026-10-05', deleted: false
    }
  };
}

/** Les charges variables d'un mois, telles que la base les rend */
function chargesDuMois(page, mois) {
  return page.evaluate(async (periode) => {
    const { dbGet } = await import('/js/db.js');
    return await dbGet(`periods/${periode}/variableCharges`) || {};
  }, mois);
}

/** Ouvre la charge c1 en édition et y saisit une date */
async function redater(page, date) {
  await allerAuPanneau(page, 'panneauCharges');
  await page.locator('#variableChargesList [data-action="editVariableCharge"][data-arg="c1"]').click();
  await page.locator('#variableChargeDate').fill(date);
  await page.locator('#saveVariableCharge').click();
}

for (const largeur of [320, 390]) {
  test.describe(`La modification range par la date — ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 800 } });

    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(LE_29_OCTOBRE);
      await setupFirebaseMock(page);
      await page.addInitScript(`window.__db = ${JSON.stringify(semence())};`);
      await waitForApp(page);
    });

    test('le témoin : l\'horloge est figée, et octobre est le mois affiché', async ({ page }) => {
      expect(await page.evaluate(() => Date.now())).toBe(LE_29_OCTOBRE.getTime());
      await expect(page.locator('#periodSelect')).toHaveValue('2026-10');
    });

    test('redatée au 1er novembre, la charge QUITTE octobre et le toast nomme novembre', async ({ page }) => {
      await redater(page, '2026-11-01');

      await expect(page.getByText('Charge déplacée en novembre 2026, sa date')).toBeVisible();

      // La base : partie d'octobre, arrivée en novembre, entière, sous le même
      // identifiant — et rien d'autre n'a bougé en octobre.
      await expect.poll(async () => Object.keys(await chargesDuMois(page, '2026-10'))).toEqual(['c2']);
      const novembre = await chargesDuMois(page, '2026-11');
      expect(Object.keys(novembre)).toEqual(['c1']);
      expect(novembre.c1).toMatchObject({
        description: 'Grosse course', amount: 182, date: '2026-11-01', paidBy: 'vous'
      });

      // L'écran : octobre ne la montre plus, et ne la compte plus.
      await expect(page.locator('#variableChargesList')).not.toContainText('Grosse course');
      await expect(page.locator('#variableChargesList')).toContainText('Boulangerie');
    });

    test('TÉMOIN — redatée dans le même mois, elle reste en octobre', async ({ page }) => {
      await redater(page, '2026-10-25');

      await expect(page.getByText('Charge modifiée')).toBeVisible();
      await expect.poll(async () => (await chargesDuMois(page, '2026-10')).c1?.date).toBe('2026-10-25');
      expect(Object.keys(await chargesDuMois(page, '2026-11'))).toEqual([]);
      await expect(page.locator('#variableChargesList')).toContainText('Grosse course');
    });
  });
}
