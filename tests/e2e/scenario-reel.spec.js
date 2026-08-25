import { readFileSync } from 'node:fs';
import { test, expect } from './_couverture.js';

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
/** Lit le solde affiché, en euros */
async function soldeAffiche(page) {
  const texte = await page.locator('#balanceBar').innerText();
  const m = texte.match(/([\d\s]+,\d{2})\s*€/);
  if (!m) return 0;
  return parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
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
      // La corbeille couvre tous les mois et lit la base à l'ouverture : son
      // contenu est le seul signal que la suppression a bien été enregistrée.
      await page.locator('#trashButton').click();
      await expect(page.locator('#trashList')).toContainText('Depense partagee', { timeout: 20000 });

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

  /**
   * Deux appareils qui règlent le même solde.
   *
   * Le règlement écrit un remboursement du montant du solde. Deux écritures et
   * le solde bascule du même montant dans l'autre sens : de zéro attendu, on
   * passe au double de la dette, en sens inverse.
   *
   * Le délai qui compte n'est pas de l'ordre de la milliseconde : c'est celui
   * de la fenêtre de confirmation, restée ouverte pendant que l'autre personne
   * règle de son côté. C'est cette fenêtre-là que le test reproduit.
   */
  test("régler pendant que l'autre règle n'inverse pas le solde", async ({ browser }) => {
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
    await premiere.page.evaluate(() => firebase.database().ref('sandbox').remove());

    // Un mois avec une dette nette de 400 € : loyer de 800 avancé en entier,
    // salaires égaux.
    const mois = await premiere.page.evaluate(async () => {
      const n = new Date();
      const m = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
      const db = firebase.database();
      await db.ref(`sandbox/periods/${m}/salaries`).set({ vous: 2000, conjointe: 2000 });
      await db.ref(`sandbox/periods/${m}/fixedCharges`).push().set({
        description: 'Loyer', amount: 800, paidBy: 'vous', category: 'Logement',
        destination: 'Compte Commun', deleted: false, timestamp: Date.now()
      });
      return m;
    });

    const seconde = await ouvrirSession();
    await Promise.all([
      premiere.page.reload().then(() => premiere.page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 })),
      seconde.page.reload().then(() => seconde.page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 }))
    ]);

    await expect(premiere.page.locator('#balanceBar')).toContainText('400,00', { timeout: 20000 });
    await expect(seconde.page.locator('#balanceBar')).toContainText('400,00', { timeout: 20000 });

    // La première ouvre la confirmation et la laisse à l'écran.
    await premiere.page.locator('.btn-settle').click();
    await expect(premiere.page.locator('#modalConfirmOk')).toBeVisible({ timeout: 10000 });

    // La seconde règle entièrement pendant ce temps.
    await seconde.page.locator('.btn-settle').click();
    await seconde.page.locator('#modalConfirmOk').click();
    await expect(seconde.page.locator('#balanceBar')).toContainText('quilibr', { timeout: 20000 });

    // La première confirme un solde qui n'existe plus.
    await premiere.page.locator('#modalConfirmOk').click();
    await premiere.page.waitForTimeout(4000);

    const reglements = await premiere.page.evaluate(async (m) => {
      const snap = await firebase.database().ref(`sandbox/periods/${m}/reimbursements`).once('value');
      return Object.values(snap.val() || {}).filter(r => !r.deleted).map(r => r.amount);
    }, mois);

    expect(reglements, `montants enregistrés : ${reglements.join(', ')}`).toEqual([400]);

    await premiere.page.reload();
    await premiere.page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });
    await expect(premiere.page.locator('#balanceBar')).toContainText('quilibr', { timeout: 20000 });

    await premiere.contexte.close();
    await seconde.contexte.close();
  });
});

/**
 * Six mois d'historique, avec une augmentation en cours de route.
 *
 * C'est le croisement le moins éprouvé : instantanés de salaires par période,
 * report cumulé, et reconduction. Une augmentation ne doit pas réécrire les
 * mois passés — chacun garde le salaire qui était le sien.
 *
 * L'historique est écrit directement en base plutôt que saisi à l'écran : six
 * mois de saisie prendraient des minutes, et ce qu'on vérifie ici est la
 * lecture, pas la saisie — couverte par le parcours précédent.
 */
test.describe('Six mois avec augmentation', () => {
  test.skip(!MOT_DE_PASSE, 'FAIRSPLIT_TEST_PASSWORD absent — voir docs/compte-de-test.md');
  test.setTimeout(240000);

  /** Historique du foyer : l'augmentation intervient au quatrième mois */
  const HISTORIQUE = [
    { decalage: -5, vous: 2600, conjointe: 1900, fixe: 1000, variable: 200, payeurVariable: 'conjointe' },
    { decalage: -4, vous: 2600, conjointe: 1900, fixe: 1000, variable: 150, payeurVariable: 'vous' },
    { decalage: -3, vous: 2600, conjointe: 1900, fixe: 1000, variable: 0, payeurVariable: null },
    { decalage: -2, vous: 3200, conjointe: 1900, fixe: 1000, variable: 300, payeurVariable: 'conjointe' },
    { decalage: -1, vous: 3200, conjointe: 1900, fixe: 1000, variable: 0, payeurVariable: null }
  ];

  /** Solde propre d'un mois, calculé ici et non lu depuis l'application */
  function soldeDuMois({ vous, conjointe, fixe, variable, payeurVariable }) {
    const total = fixe + variable;
    const payeParVous = fixe + (payeurVariable === 'vous' ? variable : 0);
    return payeParVous - total * vous / (vous + conjointe);
  }

  test('une augmentation ne réécrit pas les mois passés', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));

    await page.goto('/FairSplit.html');
    await page.locator('#authEmail').fill(EMAIL);
    await page.locator('#authPassword').fill(MOT_DE_PASSE);
    await page.locator('[data-action="signInWithEmail"]').click();
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });

    await page.evaluate(() => firebase.database().ref('sandbox').remove());

    // Écriture de l'historique, chaque mois avec son propre instantané
    await page.evaluate(async (historique) => {
      const db = firebase.database();
      for (const m of historique) {
        const n = new Date();
        const d = new Date(n.getFullYear(), n.getMonth() + m.decalage, 1);
        const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        await db.ref(`sandbox/periods/${cle}/salaries`).set({ vous: m.vous, conjointe: m.conjointe });
        await db.ref(`sandbox/periods/${cle}/fixedCharges`).push().set({
          description: 'Loyer appartement', amount: m.fixe, paidBy: 'vous',
          category: 'Logement', deleted: false, recurring: true, timestamp: Date.now()
        });
        if (m.variable > 0) {
          await db.ref(`sandbox/periods/${cle}/variableCharges`).push().set({
            description: 'Depenses du mois', amount: m.variable, paidBy: m.payeurVariable,
            category: 'Courses', deleted: false, timestamp: Date.now()
          });
        }
        // Empreinte posée : la reconduction ne doit pas garnir un mois déjà écrit
        await db.ref(`sandbox/periods/${cle}/reconductedFrom`).set('historique');
      }
    }, HISTORIQUE);

    await page.reload();
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });

    // ---------- Chaque mois affiche le solde de son propre salaire ----------
    for (const mois of HISTORIQUE) {
      const attendu = soldeDuMois(mois);

      await test.step(`mois ${mois.decalage} : salaires ${mois.vous}/${mois.conjointe}`, async () => {
        await allerAuMois(page, mois.decalage);
        const solde = await soldeAffiche(page);
        expect(environ(solde, attendu),
          `mois ${mois.decalage} : attendu ${attendu.toFixed(2)}, lu ${solde}`).toBe(true);
      });
    }

    // ---------- Le report cumule les six mois, chacun à son salaire ----------
    await test.step('le report cumule des mois calculés à des salaires différents', async () => {
      await allerAuMois(page, -1);
      await page.locator('.setting-toggle-row .reminder-toggle-slider').click();
      await expect(page.locator('#carryOverToggle')).toBeChecked();
      await page.waitForTimeout(2500);

      const cumul = HISTORIQUE.reduce((somme, m) => somme + soldeDuMois(m), 0);
      const solde = await soldeAffiche(page);
      expect(environ(solde, cumul), `cumul attendu ${cumul.toFixed(2)}, lu ${solde}`).toBe(true);
    });

    // ---------- Une nouvelle augmentation ne touche pas l'histoire ----------
    await test.step('modifier le salaire courant laisse les mois passés intacts', async () => {
      await allerAuMois(page, 0);
      await page.locator('#salaireVous').fill('4000');
      await page.locator('#salaireVous').blur();
      await page.waitForTimeout(2000);

      // Le mois le plus ancien doit rester calculé à 2600/1900
      const ancien = HISTORIQUE[0];
      await allerAuMois(page, ancien.decalage);
      const solde = await soldeAffiche(page);
      expect(environ(solde, soldeDuMois(ancien)),
        `un salaire modifié aujourd'hui a réécrit le passé : attendu ${soldeDuMois(ancien).toFixed(2)}, lu ${solde}`)
        .toBe(true);
    });

    expect(erreurs, `erreurs JS : ${erreurs.join(' | ')}`).toEqual([]);
  });
});

// ============================================================
// Verifications ponctuelles, reprises de reel.spec.js
// ============================================================
/*
   Les deux suites ecrivaient dans le meme bac a sable et Playwright les
   executait en parallele : chacune effacait l'etat de l'autre. Reunies dans un
   fichier, elles s'executent en serie dans le meme processus.
*/
test.describe('Contre le vrai Firebase', () => {
  test.skip(!MOT_DE_PASSE, 'FAIRSPLIT_TEST_PASSWORD absent — voir docs/compte-de-test.md');

  // Une connexion réelle et l'initialisation complète prennent plus de temps
  // qu'un simulateur en mémoire.
  test.setTimeout(60000);

  /**
   * Ouvre l'application et s'authentifie réellement.
   * @param {import('@playwright/test').Page} page - Page de test
   */
  async function seConnecter(page) {
    await page.goto('/FairSplit.html');
    await page.locator('#authEmail').fill(EMAIL);
    await page.locator('#authPassword').fill(MOT_DE_PASSE);
    await page.locator('[data-action="signInWithEmail"]').click();

    await page.waitForSelector('#mainApp', { state: 'visible', timeout: 30000 });
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 30000 });
  }

  test('le compte se connecte et l\'application s\'initialise entièrement', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));

    await seConnecter(page);

    // Le sélecteur de mois est le premier signe que l'initialisation a abouti.
    await expect(page.locator('#periodSelect option')).toHaveCount(12);
    expect(erreurs).toEqual([]);
  });

  test('l\'écran signale le bac à sable', async ({ page }) => {
    // Sans ce repère, rien ne distinguerait un essai des vraies données.
    await seConnecter(page);

    await expect(page.locator('#sandboxBanner')).toBeVisible();
    await expect(page).toHaveTitle(/Bac à sable/);
  });

  test('toutes les étapes d\'initialisation aboutissent', async ({ page }) => {
    // Un échec partiel produit une notification nommant l'étape fautive : elle
    // ne doit pas apparaître.
    await seConnecter(page);

    await expect(page.locator('.toast.error')).toHaveCount(0);
  });

  test('les règles de sécurité refusent household à ce compte', async ({ page }) => {
    // La garantie qui compte. Le cantonnement applicatif évite d'y toucher ;
    // ce test vérifie que même une tentative directe est refusée par le
    // serveur.
    await seConnecter(page);

    const verdict = await page.evaluate(() => new Promise(resolve => {
      const minuteur = setTimeout(() => resolve('SANS RÉPONSE'), 15000);
      firebase.database().ref('household').once('value')
        .then(() => { clearTimeout(minuteur); resolve('LECTURE AUTORISÉE'); })
        .catch(e => { clearTimeout(minuteur); resolve(e.code || e.message); });
    }));

    expect(verdict).toMatch(/PERMISSION_DENIED/i);
  });

  test('une écriture dans le bac à sable persiste après rechargement', async ({ page }) => {
    await seConnecter(page);

    const repere = `essai-${await page.evaluate(() => performance.now().toFixed(0))}`;

    await page.locator('#addVariableChargeBtn').click();
    await page.locator('#variableChargeDescription').fill(repere);
    await page.locator('#variableChargeAmount').fill('12.34');
    await page.locator('#variableChargeCategory').selectOption({ index: 1 });
    await page.locator('#variableChargePaidBy').selectOption('vous');
    await page.locator('#saveVariableCharge').click();
    await expect(page.locator('#variableChargesList').getByText(repere)).toBeVisible({ timeout: 15000 });

    await page.reload();
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 30000 });

    // La persistance réelle : ce que le simulateur, remis à zéro à chaque
    // chargement, ne peut pas démontrer.
    await expect(page.locator('#variableChargesList').getByText(repere)).toBeVisible({ timeout: 15000 });

    // Nettoyage : la charge d'essai ne doit pas s'accumuler dans le bac à sable.
    await page.locator('#variableChargesList').getByText(repere)
      .locator('xpath=ancestor::*[contains(@class,"charge-item")][1]')
      .locator('.btn-delete').click();
    await page.locator('#modalConfirmOk').click();
    await expect(page.locator('#variableChargesList').getByText(repere)).toHaveCount(0, { timeout: 15000 });
  });
});

/**
 * Aller-retour complet d'une sauvegarde, contre le vrai Firebase.
 *
 * Les tests existants vérifient qu'un mauvais fichier est refusé et que la
 * copie de sécurité part avant l'écrasement. Aucun ne vérifiait que les
 * données reviennent — c'est pourtant la seule chose que la fonctionnalité
 * promet, et son échec ne se découvrirait qu'au pire moment.
 */
test.describe('Sauvegarde et restauration, aller-retour réel', () => {
  test.skip(!MOT_DE_PASSE, 'FAIRSPLIT_TEST_PASSWORD absent — voir docs/compte-de-test.md');
  test.setTimeout(240000);

  test('une sauvegarde restaurée rend exactement les données', async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));

    await page.goto('/FairSplit.html');
    await page.locator('#authEmail').fill(EMAIL);
    await page.locator('#authPassword').fill(MOT_DE_PASSE);
    await page.locator('[data-action="signInWithEmail"]').click();
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });

    await page.evaluate(() => firebase.database().ref('sandbox').remove());
    await page.reload();
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });

    let sauvegarde;

    await test.step('constituer un état, puis le sauvegarder', async () => {
      await page.locator('#salaireVous').fill('2600');
      await page.locator('#salaireVous').blur();
      await page.locator('#salaireConjointe').fill('1900');
      await page.locator('#salaireConjointe').blur();
      await page.waitForTimeout(1500);

      await page.locator('#addVariableChargeBtn').click();
      await page.locator('#variableChargeDescription').fill('Depense a retrouver');
      await page.locator('#variableChargeAmount').fill('137.50');
      await page.locator('#variableChargeCategory').selectOption({ index: 1 });
      await page.locator('#variableChargePaidBy').selectOption('vous');
      await page.locator('#saveVariableCharge').click();
      await expect(page.locator('#variableChargesList').getByText('Depense a retrouver'))
        .toBeVisible({ timeout: 15000 });

      await page.locator('[data-action="showBackup"]').click();
      const [fichier] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('[data-action="downloadBackup"]').click()
      ]);
      sauvegarde = readFileSync(await fichier.path(), 'utf8');

      // Le fichier doit réellement porter la donnée, pas seulement exister.
      expect(sauvegarde).toContain('Depense a retrouver');
      await page.locator('[data-action="closeModal"][data-arg="modalBackup"]').click();
    });

    await test.step('tout effacer', async () => {
      await page.evaluate(() => firebase.database().ref('sandbox').remove());
      await page.reload();
      await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });

      await expect(page.locator('#variableChargesList').getByText('Depense a retrouver'))
        .toHaveCount(0);
      await expect(page.locator('#salaireVous')).toHaveValue('0');
    });

    await test.step('restaurer rend les données', async () => {
      await page.locator('[data-action="showBackup"]').click();
      await page.locator('#backupFileInput').setInputFiles({
        name: 'sauvegarde.json',
        mimeType: 'application/json',
        buffer: Buffer.from(sauvegarde)
      });

      // La copie de sécurité part avant l'écrasement.
      const [copie] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('#modalConfirmOk').click()
      ]);
      expect(copie.suggestedFilename()).toMatch(/^avant-restauration-/);

      // L'application se recharge d'elle-même après restauration.
      await page.waitForSelector('body[data-app-ready="true"]', { timeout: 60000 });

      await expect(page.locator('#variableChargesList').getByText('Depense a retrouver'))
        .toBeVisible({ timeout: 20000 });
      await expect(page.locator('#salaireVous')).toHaveValue('2600');
      await expect(page.locator('#salaireConjointe')).toHaveValue('1900');
      await expect(page.locator('#variableChargesTotal')).toContainText('137,50');
    });

    expect(erreurs, `erreurs JS : ${erreurs.join(' | ')}`).toEqual([]);
  });
});
