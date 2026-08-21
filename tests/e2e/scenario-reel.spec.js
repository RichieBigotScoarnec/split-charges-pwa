import { test, expect } from '@playwright/test';

/**
 * Parcours complet contre le vrai Firebase.
 *
 * La suite `reel.spec.js` ne fait que cinq vérifications ponctuelles :
 * connexion, bannière, initialisation, refus de `household`, une charge qui
 * persiste. Aucun enchaînement de mois, aucune fonctionnalité exercée bout à
 * bout — or c'est précisément dans l'enchaînement que les défauts se sont
 * logés jusqu'ici : sens des remboursements inversé, signe du solde, prorata
 * ignorant les revenus complémentaires.
 *
 * Ce scénario reproduit deux mois d'usage réel et vérifie les montants à
 * chaque étape, calculés indépendamment de l'application.
 *
 * Il écrit dans le bac à sable, jamais dans les données du foyer : le compte
 * de test y est cantonné par les règles de sécurité et par l'application.
 */

const EMAIL = process.env.FAIRSPLIT_TEST_EMAIL || 'testfairsplit@gmail.com';
const MOT_DE_PASSE = process.env.FAIRSPLIT_TEST_PASSWORD;

/** Salaires du foyer fictif */
const SALAIRE_VOUS = 2600;
const SALAIRE_CONJOINTE = 1900;

/**
 * Part théorique revenant à « vous » pour un total de charges donné.
 * Calculée ici, indépendamment de l'application, pour que le test contrôle
 * plutôt qu'il ne constate.
 *
 * @param {number} totalCharges - Somme des charges du mois
 * @param {number} [vous] - Revenu de l'emplacement 1
 * @param {number} [conjointe] - Revenu de l'emplacement 2
 * @returns {number} Part théorique
 */
function partVous(totalCharges, vous = SALAIRE_VOUS, conjointe = SALAIRE_CONJOINTE) {
  return totalCharges * vous / (vous + conjointe);
}

/** Compare deux montants au centime, tolérance d'un centime d'arrondi */
function environ(reel, attendu) {
  return Math.abs(reel - attendu) < 0.02;
}

test.describe('Trois mois d\'usage contre le vrai Firebase', () => {
  test.skip(!MOT_DE_PASSE, 'FAIRSPLIT_TEST_PASSWORD absent — voir docs/compte-de-test.md');

  // Un parcours complet enchaîne des dizaines d'écritures réelles.
  test.setTimeout(240000);

  /**
   * Ouvre l'application, s'authentifie, attend l'initialisation complète.
   * @param {import('@playwright/test').Page} page - Page de test
   */
  async function ouvrir(page) {
    await page.goto('/FairSplit.html');
    await page.locator('#authEmail').fill(EMAIL);
    await page.locator('#authPassword').fill(MOT_DE_PASSE);
    await page.locator('[data-action="signInWithEmail"]').click();
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });
  }

  /**
   * Vide le bac à sable pour partir d'un état connu.
   * Sans cela, un scénario précédent fausserait les montants attendus.
   * @param {import('@playwright/test').Page} page - Page de test
   */
  async function viderBacASable(page) {
    const verdict = await page.evaluate(() => new Promise(resolve => {
      firebase.database().ref('sandbox').remove()
        .then(() => resolve('vide'))
        .catch(e => resolve(e.code || e.message));
    }));
    expect(verdict, 'le bac à sable doit pouvoir être vidé').toBe('vide');
  }

  /** Sélectionne un mois dans la liste, par décalage depuis le mois courant */
  async function allerAuMois(page, decalage) {
    const cible = await page.evaluate((d) => {
      const now = new Date();
      const date = new Date(now.getFullYear(), now.getMonth() + d, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }, decalage);

    await page.locator('#periodSelect').selectOption(cible);
    await page.waitForTimeout(1500);
    return cible;
  }

  /** Renseigne les deux salaires du mois affiché */
  async function saisirSalaires(page, vous, conjointe) {
    await page.locator('#salaireVous').fill(String(vous));
    await page.locator('#salaireVous').blur();
    await page.waitForTimeout(800);
    await page.locator('#salaireConjointe').fill(String(conjointe));
    await page.locator('#salaireConjointe').blur();
    await page.waitForTimeout(800);
  }

  /** Ajoute une charge variable */
  async function chargeVariable(page, description, montant, payeur) {
    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill(description);
    await page.locator('#variableChargeAmount').fill(String(montant));
    await page.locator('#variableChargeCategory').selectOption({ index: 1 });
    await page.locator('#variableChargePaidBy').selectOption(payeur);
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText(description))
      .toBeVisible({ timeout: 15000 });
  }

  /** Ajoute une charge fixe, récurrente par défaut */
  async function chargeFixe(page, description, montant, payeur) {
    await page.locator('#addFixedChargeBtn').click();
    await page.locator('#fixedChargeDescription').fill(description);
    await page.locator('#fixedChargeAmount').fill(String(montant));
    await page.locator('#fixedChargeCategory').selectOption({ index: 1 });
    await page.locator('#fixedChargePaidBy').selectOption(payeur);
    await page.locator('#saveFixedCharge').click();
    await expect(page.locator('#fixedChargesList').getByText(description))
      .toBeVisible({ timeout: 15000 });
  }

  /** Lit le solde affiché, en euros */
  async function soldeAffiche(page) {
    const texte = await page.locator('#balanceBar').innerText();
    const m = texte.match(/([\d\s]+,\d{2})\s*€/);
    if (!m) return 0;
    return parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
  }

  test('deux mois : charges, reconduction, report, règlement', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));

    await ouvrir(page);
    await viderBacASable(page);
    await page.reload();
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });

    // ---------- Mois precedent : installation du foyer ----------
    // Le scenario porte sur deux mois et non trois : la reconduction refuse
    // deliberement d'ecrire dans le passe, garde-fou verifie par ailleurs.
    // Enchainer M-2 vers M-1 ne l'aurait donc jamais declenchee.
    await test.step('mois précédent : salaires et deux charges', async () => {
      // Les salaires sont d'abord saisis sur le mois courant : c'est ce qui
      // fixe la valeur de référence du foyer, dont héritent les mois créés
      // ensuite. Les saisir seulement sur un mois révolu ne la met pas à jour
      // — le mois courant se retrouverait sans salaires, donc sans bilan.
      await allerAuMois(page, 0);
      await saisirSalaires(page, SALAIRE_VOUS, SALAIRE_CONJOINTE);

      await allerAuMois(page, -1);
      await saisirSalaires(page, SALAIRE_VOUS, SALAIRE_CONJOINTE);

      await chargeFixe(page, 'Loyer appartement', 1000, 'vous');
      await chargeVariable(page, 'Courses hebdomadaires', 200, 'conjointe');

      // 1200 € de charges, part théorique de « vous » = 693,33.
      // Il a payé 1000 : la conjointe lui doit 306,67.
      const attendu = 1000 - partVous(1200);
      const solde = await soldeAffiche(page);
      expect(environ(solde, attendu), `attendu ${attendu.toFixed(2)}, lu ${solde}`).toBe(true);
      await expect(page.locator('#balanceBar')).toContainText('Conjointe vous doit');
    });

    // ---------- Mois courant : la reconduction reprend le loyer ----------
    await test.step('mois courant : le loyer se reconduit seul', async () => {
      await allerAuMois(page, 0);

      await expect(page.locator('#fixedChargesList').getByText('Loyer appartement'))
        .toBeVisible({ timeout: 20000 });
      // Les courses étaient variables : elles ne suivent pas.
      await expect(page.locator('#variableChargesList').getByText('Courses hebdomadaires'))
        .toHaveCount(0);

      // Le mois ne porte que le loyer : 1000 - 577,78 = 422,22
      const attendu = 1000 - partVous(1000);
      const solde = await soldeAffiche(page);
      expect(environ(solde, attendu), `attendu ${attendu.toFixed(2)}, lu ${solde}`).toBe(true);
    });

    // ---------- Report : les deux mois s'additionnent ----------
    await test.step('le report cumule les deux mois', async () => {
      await page.locator('.setting-toggle-row .reminder-toggle-slider').click();
      await expect(page.locator('#carryOverToggle')).toBeChecked();
      await page.waitForTimeout(2000);

      // Mois précédent non réglé (306,67) + mois courant (422,22) = 728,89
      const attendu = (1000 - partVous(1200)) + (1000 - partVous(1000));
      const solde = await soldeAffiche(page);
      expect(environ(solde, attendu), `attendu ${attendu.toFixed(2)}, lu ${solde}`).toBe(true);
      await expect(page.locator('#summarySection')).toContainText('mois précédents');
    });

    // ---------- Reglement : le solde reporte doit tomber a zero ----------
    await test.step("régler solde l'ardoise entière, report compris", async () => {
      await page.locator('.btn-settle').click();
      await page.locator('#modalConfirmOk').click();

      await expect(page.locator('#balanceBar')).toContainText('Comptes équilibrés', { timeout: 20000 });
      await expect(page.locator('.btn-settle')).toHaveCount(0);
    });

    // ---------- Le reglement doit tenir apres rechargement ----------
    await test.step('le règlement tient après rechargement', async () => {
      await page.reload();
      await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });

      await expect(page.locator('#balanceBar')).toContainText('Comptes équilibrés', { timeout: 20000 });
      // La reconduction ne doit pas se rejouer et dupliquer le loyer.
      await expect(page.locator('#fixedChargesList').getByText('Loyer appartement')).toHaveCount(1);
    });

    expect(erreurs, `erreurs JS : ${erreurs.join(' | ')}`).toEqual([]);
  });

  test('revenus complémentaires, corbeille et prénoms sur données réelles', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));

    await ouvrir(page);
    await viderBacASable(page);
    await page.reload();
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });

    await allerAuMois(page, 0);
    await saisirSalaires(page, SALAIRE_VOUS, SALAIRE_CONJOINTE);

    await test.step('des allocations relèvent la part de celle qui les perçoit', async () => {
      await chargeVariable(page, 'Depense partagee', 900, 'vous');

      const sansAllocations = 900 - partVous(900);
      expect(environ(await soldeAffiche(page), sansAllocations)).toBe(true);

      await page.locator('#extraIncomeToggle').click();
      await page.locator('#revenusConjointe').fill('700');
      await page.locator('#revenusConjointe').blur();
      await page.waitForTimeout(1500);

      // Son assiette passe de 1900 à 2600 : le partage devient égal.
      const avec = 900 - partVous(900, SALAIRE_VOUS, SALAIRE_CONJOINTE + 700);
      const solde = await soldeAffiche(page);
      expect(environ(solde, avec), `attendu ${avec.toFixed(2)}, lu ${solde}`).toBe(true);
    });

    await test.step('une suppression reste récupérable', async () => {
      await page.locator('#variableChargesList .btn-delete').first().click();
      await page.locator('#modalConfirmOk').click();
      await expect(page.locator('#trashButton')).toBeVisible({ timeout: 20000 });

      await page.locator('#trashButton').click();
      await expect(page.locator('#trashList')).toContainText('Depense partagee');

      await page.locator('#trashList .btn-restore').first().click();
      await expect(page.locator('#variableChargesList').getByText('Depense partagee'))
        .toBeVisible({ timeout: 20000 });
    });

    await test.step('les prénoms nomment le solde', async () => {
      await page.locator('#prenomVous').fill('Richard');
      await page.locator('#prenomVous').blur();
      await page.waitForTimeout(1200);
      await page.locator('#prenomConjointe').fill('Cindy');
      await page.locator('#prenomConjointe').blur();
      await page.waitForTimeout(1500);

      await expect(page.locator('#labelSalaireVous')).toHaveText('Salaire Richard (€)');
      await expect(page.locator('#balanceBar')).toContainText('Cindy doit');
      await expect(page.locator('#balanceBar')).toContainText('à Richard');
    });

    await test.step('tout survit à un rechargement', async () => {
      // La persistance réelle : ce que le simulateur, remis à zéro à chaque
      // chargement, ne peut pas démontrer.
      await page.reload();
      await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });

      await expect(page.locator('#labelSalaireVous')).toHaveText('Salaire Richard (€)');
      await expect(page.locator('#variableChargesList').getByText('Depense partagee')).toBeVisible();
      await expect(page.locator('#revenusConjointe')).toHaveValue('700');
    });

    expect(erreurs, `erreurs JS : ${erreurs.join(' | ')}`).toEqual([]);
  });
});

test.describe('Reconduction concurrente', () => {
  test.skip(!MOT_DE_PASSE, 'FAIRSPLIT_TEST_PASSWORD absent — voir docs/compte-de-test.md');
  test.setTimeout(180000);

  test('deux ouvertures simultanées ne dupliquent pas les charges', async ({ browser }) => {
    // Lire « pas encore reconduit » puis écrire n'est pas atomique : deux
    // appels concurrents passaient tous deux la vérification et copiaient
    // chacun les charges. Deux téléphones ouvrant l'application le même matin
    // suffisaient à doubler chaque charge fixe du mois.
    const ouvrirSession = async () => {
      const contexte = await browser.newContext();
      const page = await contexte.newPage();
      await page.goto('/FairSplit.html');
      await page.locator('#authEmail').fill(EMAIL);
      await page.locator('#authPassword').fill(MOT_DE_PASSE);
      await page.locator('[data-action="signInWithEmail"]').click();
      await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });
      return { contexte, page };
    };

    const premiere = await ouvrirSession();

    // Un mois précédent garni, un mois courant vierge
    await premiere.page.evaluate(() => firebase.database().ref('sandbox').remove());
    const precedent = await premiere.page.evaluate(() => {
      const n = new Date(); const x = new Date(n.getFullYear(), n.getMonth() - 1, 1);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
    });
    await premiere.page.evaluate(async (m) => {
      const db = firebase.database();
      await db.ref(`sandbox/periods/${m}/salaries`).set({ vous: 2600, conjointe: 1900 });
      await db.ref(`sandbox/periods/${m}/fixedCharges`).push().set({
        description: 'Abonnement internet', amount: 40, paidBy: 'vous',
        category: 'Logement', deleted: false, recurring: true, timestamp: Date.now()
      });
    }, precedent);

    // Deux sessions ouvrent le mois courant en même temps
    const seconde = await ouvrirSession();
    await Promise.all([
      premiere.page.reload().then(() => premiere.page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 })),
      seconde.page.reload().then(() => seconde.page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 }))
    ]);
    await premiere.page.waitForTimeout(5000);

    const descriptions = await premiere.page.evaluate(async () => {
      const n = new Date();
      const m = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
      const snap = await firebase.database().ref(`sandbox/periods/${m}/fixedCharges`).once('value');
      return Object.values(snap.val() || {}).map(c => c.description);
    });

    expect(descriptions, `charges du mois : ${descriptions.join(', ')}`)
      .toEqual(['Abonnement internet']);

    await premiere.contexte.close();
    await seconde.contexte.close();
  });
});
