import { test, expect } from './_couverture.js';

/**
 * Base de données injoignable — bouclier de navigateur.
 *
 * Les deux pannes signalées en production venaient de là : Brave bloquait
 * l'accès à la base. Ce n'est pas un cas exotique. Un bouclier de contenu, un
 * bloqueur de publicité, un réseau d'entreprise ou un pare-feu produisent tous
 * le même effet, et l'utilisateur n'a aucune raison de faire le lien.
 *
 * Ce que l'application doit garantir dans ces conditions :
 *
 *  1. les commandes restent vivantes — un bouton visible qui ne réagit pas est
 *     bien pire qu'un message d'échec ;
 *  2. l'échec est nommé, pas silencieux ;
 *  3. le journal de diagnostic dit ce qui a échoué et pourquoi.
 *
 * L'authentification reste permise : elle passe par un autre domaine, et c'est
 * bien ce qu'on observait — connexion réussie, données absentes.
 */

const PROD_LOCALE = '/FairSplit.html';
const EMAIL = 'testfairsplit@gmail.com';
const MOT_DE_PASSE = process.env.FAIRSPLIT_TEST_PASSWORD;

/** Domaine de la base temps réel, celui que les boucliers interceptent */
const BASE = '**firebasedatabase.app**';

test.describe('Base injoignable (bouclier de navigateur)', () => {
  test.skip(!MOT_DE_PASSE, 'FAIRSPLIT_TEST_PASSWORD absent — voir docs/compte-de-test.md');
  test.setTimeout(180000);

  /**
   * Ouvre l'application avec la base coupée, l'authentification intacte
   * @param {import('@playwright/test').Page} page - Page de test
   * @returns {Promise<string[]>} Messages d'erreur relevés en console
   */
  async function ouvrirSansBase(page) {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));

    // Le blocage doit couvrir les deux transports. Firebase privilégie le
    // WebSocket et retombe sur du long-polling HTTP : n'intercepter que le
    // second laissait la base parfaitement joignable, et le test ne prouvait
    // rien. `page.route` ne voit pas les WebSockets, d'où `routeWebSocket`.
    await page.routeWebSocket(BASE, ws => ws.close());
    await page.route(BASE, route => route.abort('blockedbyclient'));

    await page.goto(PROD_LOCALE);
    await page.locator('#authEmail').fill(EMAIL);
    await page.locator('#authPassword').fill(MOT_DE_PASSE);
    await page.locator('[data-action="signInWithEmail"]').click();

    // L'initialisation va au bout malgré les étapes en échec : c'est tout
    // l'intérêt de `runStep`. Sans cela, l'écran resterait figé.
    await page.waitForSelector('body[data-app-ready="true"]', { timeout: 120000 });
    return erreurs;
  }

  test("les boutons d'ajout restent utilisables", async ({ page }) => {
    // La panne signalée : « je clique sur + et rien ne se passe ». Les
    // écouteurs sont posés avant toute lecture, donc un blocage réseau ne peut
    // plus les emporter.
    await ouvrirSansBase(page);

    await page.locator('#addVariableChargeBtn').click();
    await expect(page.locator('#modalAddVariableCharge')).toHaveClass(/active/, { timeout: 10000 });
    await page.locator('[data-action="closeModal"][data-arg="modalAddVariableCharge"]').first().click();

    await page.locator('#addFixedChargeBtn').click();
    await expect(page.locator('#modalAddFixedCharge')).toHaveClass(/active/, { timeout: 10000 });
  });

  test('le sélecteur de mois reste renseigné et navigable', async ({ page }) => {
    // Le sélecteur se calcule sans aucune lecture : base coupée ou non, la
    // navigation entre les mois doit tenir.
    await ouvrirSansBase(page);

    const options = await page.locator('#periodSelect option').count();
    expect(options, 'le sélecteur de mois est vide').toBeGreaterThan(0);
  });

  test('un bandeau nomme la coupure et sa cause probable', async ({ page }) => {
    // Le défaut central : Firebase résout ses lectures depuis un cache local
    // vide quand il ne joint pas le serveur. Toutes les étapes se déclarent
    // réussies, l'écran affiche un mois vide parfaitement crédible, et les
    // saisies partent dans une file qui ne se videra jamais. Rien ne le disait.
    await ouvrirSansBase(page);

    const bandeau = page.locator('#offlineBanner');
    await expect(bandeau).toBeVisible({ timeout: 30000 });
    await expect(bandeau).toContainText('injoignable');
    // Personne ne fera spontanément le lien entre « mes salaires ne
    // s'enregistrent pas » et « mon navigateur me protège ».
    await expect(bandeau).toContainText(/bloqueur|Brave|pare-feu/i);
    // Et il doit dire ce que ça coûte, pas seulement ce qui se passe.
    await expect(bandeau).toContainText(/pas enregistr/i);
  });

  // Le retour à la normale n'est pas vérifié ici : `unroute` ne défait pas
  // `routeWebSocket`, et rien ne garantit que Firebase se reconnecte dans un
  // délai borné. Ce comportement est couvert de façon déterministe par
  // tests/utils/connection-banner.test.js.

  test('le journal garde la trace de la coupure', async ({ page }) => {
    await ouvrirSansBase(page);
    await expect(page.locator('#offlineBanner')).toBeVisible({ timeout: 30000 });

    const journal = await page.evaluate(() => window.__diag());
    expect(journal, journal.slice(0, 600)).toContain('base injoignable');
    // Le sélecteur de mois ne lit rien : il reste au vert, ce qui distingue
    // « la base est coupée » de « l'application est cassée ».
    expect(journal).toContain('étape réussie : sélecteur de période');
  });

  test('aucune erreur non rattrapée ne remonte', async ({ page }) => {
    // Une base injoignable est une condition prévisible, pas un incident : elle
    // ne doit produire aucune exception échappée.
    const erreurs = await ouvrirSansBase(page);
    await page.waitForTimeout(3000);

    expect(erreurs, `erreurs non rattrapées : ${erreurs.join(' | ')}`).toEqual([]);
  });

  test("une saisie rapide échouée est signalée, jamais silencieuse", async ({ page }) => {
    // La panne exacte : « j'appuie sur Ajouter et il ne se passe rien ».
    // Realtime Database met les écritures en file d'attente quand il ne joint
    // pas le serveur — la promesse ne se résout jamais, le gestionnaire du
    // bouton reste suspendu sur son `await`, et aucun retour n'atteint l'écran.
    // Un délai de garde transforme ce silence en échec visible.
    await ouvrirSansBase(page);

    await page.locator('[data-action="showQuickAddModal"]').click();
    await page.locator('.category-btn').first().click();
    await page.locator('#quickAddAmount').fill('12');
    await page.locator('.payer-toggle button').first().click();
    await page.locator('#btnQuickAdd').click();

    // Le délai de garde des écritures est de 15 s : la marge couvre la
    // détection sans masquer une régression.
    await expect(page.locator('.toast, #toast')).toContainText(/rreur/i, { timeout: 30000 });
  });
});
