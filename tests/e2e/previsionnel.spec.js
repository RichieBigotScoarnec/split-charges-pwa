import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Ce qui reste à passer ce mois-ci
 *
 * Le bilan répondait à « combien avons-nous dépensé », jamais à « combien
 * reste-t-il à passer » — alors que la donnée est là depuis la reconduction :
 * au premier du mois, les charges fixes récurrentes sont déjà inscrites,
 * chacune à son quantième. Au 3 du mois, le solde annonce donc un total dont
 * les trois quarts ne sont pas encore sortis du compte.
 *
 * Ces contrôles portent sur ce qui s'affiche réellement sous le solde, le
 * calcul étant éprouvé par `tests/utils/previsionnel.test.js`.
 */
test.describe('Le prévisionnel du mois', () => {

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();
  });

  /**
   * Pose une charge fixe datée dans la période affichée
   *
   * Écrite en base plutôt que saisie au formulaire : celui-ci refuserait une
   * date d'un autre mois, et c'est justement une échéance à venir qu'il faut
   * ici.
   *
   * @param {import('@playwright/test').Page} page
   * @param {{description: string, amount: number, joursDEcart: number}} charge
   */
  async function chargeDatee(page, { description, amount, joursDEcart }) {
    await page.evaluate(async ({ description, amount, joursDEcart }) => {
      const { dbUpdate } = await import('/js/db.js');
      const { getState } = await import('/js/state.js');
      const { loadFixedCharges } = await import('/js/modules/fixed-charges.js');
      const { calculateSummary } = await import('/js/modules/summary.js');

      const jour = new Date();
      jour.setDate(jour.getDate() + joursDEcart);
      const date = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`;

      const periode = getState('currentPeriod');
      const cle = description.replace(/\W/g, '');

      await dbUpdate(undefined, {
        [`periods/${periode}/fixedCharges/${cle}`]: {
          description, amount, date, category: 'Logement', paidBy: 'vous', deleted: false
        }
      });

      await loadFixedCharges();
      calculateSummary();
    }, { description, amount, joursDEcart });
  }

  test('dit que tout est passé, au lieu de disparaître', async ({ page }) => {
    // Le panneau se taisait dès que rien n'était devant. Le 25 du mois, il ne
    // montrait donc rien — et un panneau absent est indiscernable d'une
    // fonctionnalité en panne. C'est ainsi qu'il a été signalé comme ne
    // fonctionnant pas. Une ligne coûte moins qu'un doute.
    await chargeDatee(page, { description: 'Loyer', amount: 800, joursDEcart: -2 });

    const bloc = page.locator('.summary-previsionnel');
    await expect(bloc).toBeVisible();
    await expect(bloc).toHaveClass(/previsionnel-solde/);
    await expect(bloc).toContainText('Tout est passé ce mois-ci');
    await expect(bloc).toContainText('800,00');
  });

  test('se tait quand aucune charge ne porte de date', async ({ page }) => {
    // Une charge d'avant le champ « date » ne dit ni qu'elle est passée ni
    // qu'elle est devant. Affirmer que tout est passé serait inventer.
    await page.evaluate(async () => {
      const { dbUpdate } = await import('/js/db.js');
      const { getState } = await import('/js/state.js');
      const { loadFixedCharges } = await import('/js/modules/fixed-charges.js');
      const { calculateSummary } = await import('/js/modules/summary.js');

      await dbUpdate(undefined, {
        [`periods/${getState('currentPeriod')}/fixedCharges/ancienne`]: {
          description: 'Loyer', amount: 800, category: 'Logement',
          paidBy: 'vous', deleted: false, timestamp: Date.now()
        }
      });

      await loadFixedCharges();
      calculateSummary();
    });

    await expect(page.locator('.summary-previsionnel')).toHaveCount(0);
  });

  test('annonce le montant encore à passer', async ({ page }) => {
    await chargeDatee(page, { description: 'Loyer', amount: 800, joursDEcart: -2 });
    await chargeDatee(page, { description: 'Internet', amount: 40, joursDEcart: 3 });

    const bloc = page.locator('.summary-previsionnel');
    await expect(bloc).toBeVisible();
    await expect(bloc.locator('.previsionnel-montant')).toContainText('40,00');
    // Le total du mois, pour raccorder au solde.
    await expect(bloc.locator('.previsionnel-sur')).toContainText('840,00');
  });

  test('nomme les échéances et leur date', async ({ page }) => {
    await chargeDatee(page, { description: 'Internet', amount: 40, joursDEcart: 3 });

    await expect(page.locator('.previsionnel-detail')).toContainText('Internet le');
  });

  test('annonce le reste par une conjonction, pas une virgule', async ({ page }) => {
    // « …le 3 sept., 1 autre » se lit comme une quatrième échéance nommée « 1 ».
    for (const [i, description] of ['EDF', 'Internet', 'Assurance', 'Mutuelle'].entries()) {
      await chargeDatee(page, { description, amount: 20, joursDEcart: i + 2 });
    }

    await expect(page.locator('.previsionnel-detail')).toContainText('et 1 autre —');
  });

  test('dit que ces montants sont déjà dans le solde', async ({ page }) => {
    // Sans cette phrase, le bloc semblerait contredire le solde juste
    // au-dessus, qui les compte déjà. Un chiffre qu'on ne sait pas raccorder
    // au précédent est pire qu'un chiffre absent.
    await chargeDatee(page, { description: 'Internet', amount: 40, joursDEcart: 3 });

    await expect(page.locator('.previsionnel-detail'))
      .toContainText('déjà comptés dans le solde');
  });

  test('se place sous le solde, avant le détail', async ({ page }) => {
    await chargeDatee(page, { description: 'Internet', amount: 40, joursDEcart: 3 });

    // Les blocs vivent desormais dans le panneau « A deux » et non plus a la
    // racine de la carte : celle-ci porte d'abord la bascule entre les deux
    // questions du resume. L'ordre garanti est le meme, sa profondeur a change.
    const ordre = await page.evaluate(() => {
      const panneau = document.querySelector('#resumePanneauDuo');
      return [...panneau.children].map(enfant => enfant.className.split(' ')[0]);
    });

    // Sans cette garde, un bloc absent vaudrait -1 et deux comparaisons sur
    // trois passeraient quand meme : le controle dirait vert sur un ecran vide.
    for (const bloc of ['summary-balance', 'summary-previsionnel', 'summary-details']) {
      expect(ordre, `${bloc} manque du panneau`).toContain(bloc);
    }

    expect(ordre.indexOf('summary-previsionnel')).toBeGreaterThan(ordre.indexOf('summary-balance'));
    expect(ordre.indexOf('summary-previsionnel')).toBeLessThan(ordre.indexOf('summary-details'));
  });

  test('un libellé hostile est affiché en texte, jamais interprété', async ({ page }) => {
    await chargeDatee(page, {
      description: '<img src=x onerror="window.__xss=1">',
      amount: 40,
      joursDEcart: 3
    });

    await expect(page.locator('.previsionnel-detail')).toContainText('<img src=x');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
});
