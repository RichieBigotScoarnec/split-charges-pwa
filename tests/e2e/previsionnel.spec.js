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

  test('se place sous le solde — et le détail vit DANS la carte du solde', async ({ page }) => {
    await chargeDatee(page, { description: 'Internet', amount: 40, joursDEcart: 3 });

    // LOT D, 2026-09-11 — CE CAS A CHANGÉ DE SURFACE, PAS D'ARGUMENT.
    //
    // Il tenait l'ordre solde → prévisionnel → détail, trois enfants du
    // panneau. Les planches rangent le grand-livre DANS la carte du solde,
    // juste sous la phrase qu'il explique : le détail n'est plus un frère, et
    // « avant le détail » ne peut plus s'écrire en ordre de frères.
    //
    // Ce qui compte n'a pas bougé. La phrase « déjà comptés dans le solde
    // ci-dessus » exige que le solde soit AU-DESSUS, et qu'aucun dépliant ne
    // s'intercale entre les deux pour la repousser. Les deux sont tenus : le
    // prévisionnel suit la carte du solde, et le détail ne peut plus
    // s'intercaler puisqu'il vit dedans.
    // L'ordre se lit dans le DOCUMENT, plus entre frères : la carte du solde
    // est rendue une fois pour les trois portées, avant le panneau « À deux »
    // qui porte le prévisionnel.
    const ordre = await page.evaluate(() => {
      const solde = document.querySelector('.bilan-heros[data-tete="deux"]');
      const previsionnel = document.querySelector('.summary-previsionnel');
      return {
        solde: Boolean(solde),
        previsionnel: Boolean(previsionnel),
        previsionnelApresLeSolde: Boolean(solde && previsionnel
          && (solde.compareDocumentPosition(previsionnel) & Node.DOCUMENT_POSITION_FOLLOWING)),
        detailDansLeSolde: Boolean(solde && solde.querySelector('.summary-details')),
        detailHorsDuSolde: [...document.querySelectorAll('.summary-details')]
          .some((detail) => !detail.closest('.bilan-heros'))
      };
    });

    // Sans ces gardes, un bloc absent rendrait `false` partout où l'on attend
    // `false`, et le contrôle dirait vert sur un écran vide.
    expect(ordre.solde, 'la carte du solde manque').toBe(true);
    expect(ordre.previsionnel, 'le prévisionnel manque').toBe(true);

    expect(ordre.previsionnelApresLeSolde, 'le prévisionnel passe au-dessus du solde qu\'il cite').toBe(true);
    expect(ordre.detailDansLeSolde, 'le grand-livre a quitté la carte du solde').toBe(true);
    expect(ordre.detailHorsDuSolde, 'un détail vit hors de la carte du solde : il peut s\'intercaler').toBe(false);
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
