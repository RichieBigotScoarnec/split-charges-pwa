import { test, expect } from './_couverture.js';

import { ALLOWED_EMAILS } from '../../public/js/config.js';

/**
 * Hors ligne, la reconduction attend le réseau — elle ne gèle rien et ne se
 * fonde jamais sur le miroir
 *
 * Point ouvert 14 de `CLAUDE.md`. Une transaction Firebase, sans réseau, ne
 * rejette pas et n'expire pas : elle reste pendante, et `initializeAppData`
 * l'attendait. Pire qu'un gel, c'était une erreur de données : le plan calculé
 * sur le miroir partait tel quel au retour, avec le montant d'hier, et
 * l'empreinte interdisait ensuite toute correction.
 *
 * Ces contrôles tournent contre les VRAIS SDK et l'émulateur : le double de
 * `_harness.js` n'a pas de transaction qui reste pendante, c'est-à-dire pas le
 * défaut. D'où le projet `emulateurs` : voir `playwright.config.js`.
 *
 * L'horloge est figée, et elle bouge DANS le scénario : c'est le passage au
 * mois suivant qui rend une reconduction due. Seule `Date` est simulée, les
 * minuteurs du SDK restent réels.
 *
 * Deux façons de couper, et elles ne sont pas interchangeables :
 *   - `firebase.database().goOffline()` pour une coupure en cours de session ;
 *   - `routeWebSocket` pour une ouverture coupée, le SDK n'existant pas encore.
 *     Le retour purge alors `firebase:previous_websocket_failure` : sans cela le
 *     SDK retombe sur le long polling, que la CSP refuse sur l'émulateur, et le
 *     réseau ne revient jamais.
 */

const AUTH = 'http://127.0.0.1:9099';
const BASE = 'http://127.0.0.1:9010';
const NS = 'ns=fairsplit-foyer-default-rtdb';
const ADMIN = { headers: { Authorization: 'Bearer owner' } };

const APP_URL = '/FairSplit.html?emulator=1';
const EMAIL = ALLOWED_EMAILS[0];
const MOT_DE_PASSE = 'TestPassword123!';

const OCTOBRE = new Date('2026-10-20T10:00:00');
const NOVEMBRE = new Date('2026-11-15T10:00:00');

/** Rien de ce fichier ne mesure une géométrie : 1280 convient, et il est dit */
test.use({ viewport: { width: 1280, height: 900 } });

/** Le temps d'une ouverture coupée, plus une marge : un rouge dure ce délai */
const PRETE_EN_MS = 25000;

test.describe.configure({ timeout: 180000 });

test.beforeEach(async ({ request }) => {
  const comptes = await request.delete(
    `${AUTH}/emulator/v1/projects/fairsplit-foyer/accounts`, { failOnStatusCode: false }
  );
  if (!comptes.ok()) throw new Error(`Nettoyage Auth échoué (${comptes.status()})`);

  const base = await request.delete(`${BASE}/.json?${NS}`, { ...ADMIN, failOnStatusCode: false });
  if (!base.ok()) throw new Error(`Nettoyage Database échoué (${base.status()})`);

  const inscription = await request.post(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    { data: { email: EMAIL, password: MOT_DE_PASSE, returnSecureToken: true } }
  );
  const compte = await inscription.json();
  await request.post(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`,
    { ...ADMIN, data: { localId: compte.localId, emailVerified: true } }
  );
});

/** Écrit en base, en administrateur : c'est « ailleurs », un autre appareil */
async function ecrireEnBase(request, chemin, valeur) {
  const reponse = await request.put(
    `${BASE}/household/${chemin}.json?${NS}`, { ...ADMIN, data: valeur, failOnStatusCode: false }
  );
  if (!reponse.ok()) throw new Error(`Semis refusé sur ${chemin} (${reponse.status()})`);
}

/** Lit la base réelle, jamais l'écran */
async function lireEnBase(request, chemin) {
  const reponse = await request.get(`${BASE}/household/${chemin}.json?${NS}`, ADMIN);
  return reponse.json();
}

/** Une charge fixe récurrente, telle que le formulaire l'écrit */
const chargeFixe = (description, amount, date = '2026-10-05') => ({
  description, amount, category: 'Logement', paidBy: 'vous', recurring: true, date, timestamp: 1
});

/**
 * Le réseau de la page, pilotable
 *
 * `avantEnvoi` voit ce que la page envoie au serveur : c'est ce qui permet de
 * couper à un instant précis sans toucher au SDK.
 */
async function reseauPilotable(page) {
  const reseau = {
    coupe: false,
    avantEnvoi: null,
    fermer: () => {},
    /** Retard imposé à chaque trame, dans les deux sens : un réseau lent */
    retardMs: 0
  };

  /** Une trame part tout de suite, ou après le retard : l'ordre reste le sien */
  const relayer = (envoyer) => {
    if (reseau.retardMs > 0) setTimeout(envoyer, reseau.retardMs);
    else envoyer();
  };

  await page.routeWebSocket(/:9010\//, (socket) => {
    if (reseau.coupe) {
      socket.close();
      return;
    }

    const serveur = socket.connectToServer();
    reseau.fermer = () => { socket.close(); serveur.close(); };
    socket.onMessage((message) => {
      if (reseau.avantEnvoi && reseau.avantEnvoi(String(message))) {
        reseau.coupe = true;
        reseau.fermer();
        return;
      }
      relayer(() => serveur.send(message));
    });
    serveur.onMessage(message => relayer(() => socket.send(message)));
  });

  return reseau;
}

/** Une ouverture coupée se referme : voir l'en-tête pour la purge */
async function retablirLeReseau(page, reseau) {
  reseau.coupe = false;
  reseau.avantEnvoi = null;
  await page.evaluate(() => {
    localStorage.removeItem('firebase:previous_websocket_failure');
    window.firebase.database().goOffline();
    window.firebase.database().goOnline();
  });
}

async function seConnecter(page) {
  await page.goto(APP_URL);
  await page.waitForSelector('#authOverlay', { state: 'visible', timeout: 15000 });
  await page.locator('#authEmail').fill(EMAIL);
  await page.locator('#authPassword').fill(MOT_DE_PASSE);
  await page.locator('.btn-email-signin:not(.btn-create-account)').click();
  await attendrePrete(page);
}

async function attendrePrete(page, timeout = 15000) {
  await page.waitForSelector('body[data-app-ready="true"]', { timeout });
}

/** Choisit un mois au sélecteur, comme le ferait la personne */
async function allerAuMois(page, mois) {
  await page.locator('#periodSelect').selectOption(mois);
}

/**
 * Le geste qui rend une reconduction due SANS réseau
 *
 * Novembre est lu en ligne pendant qu'octobre n'a encore rien à reconduire :
 * ses chemins sont donc au miroir, sans empreinte. Le loyer arrive ensuite en
 * octobre, le mois change, et l'appareil rouvre coupé. C'est le seul parcours
 * qui amène l'application jusqu'à la transaction.
 */
async function preparerNovembreAuMiroir(page, request, { charges = { loyer: chargeFixe('Loyer', 900) } } = {}) {
  await page.clock.setFixedTime(OCTOBRE);
  await ecrireEnBase(request, 'salaries', { vous: 2500, conjointe: 2500 });
  await seConnecter(page);

  await allerAuMois(page, '2026-11');
  await expect(page.locator('#periodSelect')).toHaveValue('2026-11');
  await page.waitForTimeout(800);
  await allerAuMois(page, '2026-10');
  await page.waitForTimeout(400);

  await ecrireEnBase(request, 'periods/2026-10/fixedCharges', charges);
  await page.reload();
  await attendrePrete(page);
  await expect(page.locator('#fixedChargesList')).toContainText('Loyer');
}

test.describe('Une reconduction due, sans réseau', () => {
  test('ouverture coupée, mois au miroir : prête, et la saisie s\'ouvre', async ({ page, request }) => {
    const reseau = await reseauPilotable(page);
    await preparerNovembreAuMiroir(page, request);

    reseau.coupe = true;
    await page.clock.setFixedTime(NOVEMBRE);
    await page.reload();

    await attendrePrete(page, PRETE_EN_MS);
    await expect(page.locator('#periodSelect')).toHaveValue('2026-11');

    await page.locator('#addVariableChargeBtn').click();
    await expect(page.locator('#variableChargeDescription')).toBeVisible();
    await page.keyboard.press('Escape');

    // Le bandeau a son propre délai de huit secondes : c'est lui qui borne ici.
    await expect(page.locator('#offlineBanner')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#offlineBanner')).toContainText(/charges récurrentes.*en attente du réseau/i);

    expect(await lireEnBase(request, 'periods/2026-11/reconductedFrom')).toBeNull();
  });

  test('liaison tombée APRÈS les lectures : prête quand même', async ({ page, request }) => {
    const reseau = await reseauPilotable(page);
    await preparerNovembreAuMiroir(page, request);
    await page.clock.setFixedTime(NOVEMBRE);

    // La coupure tombe sur la COPIE, une fois l'empreinte réservée : les lectures
    // sont passées et `liaisonRompue()` a répondu non. Ni plus tôt ni sur la
    // transaction : une transaction DÉJÀ ENVOYÉE, le SDK la rejette à la
    // déconnexion, mesuré. Ce qui reste pendant pour toujours est l'écriture.
    reseau.avantEnvoi = (message) =>
      /"a":"m".*household\/periods\/2026-11\/fixedCharges/.test(message);

    await page.reload();
    await attendrePrete(page, PRETE_EN_MS);

    await page.locator('#addVariableChargeBtn').click();
    await expect(page.locator('#variableChargeDescription')).toBeVisible();
    await page.keyboard.press('Escape');

    // On a cessé d'attendre, pas cessé de faire : la copie arrive au retour, et
    // l'écran la montre sans qu'on ait rechargé.
    await retablirLeReseau(page, reseau);
    await expect.poll(async () => {
      const copies = await lireEnBase(request, 'periods/2026-11/fixedCharges');
      return Object.values(copies || {}).map(c => c.description);
    }, { timeout: 20000 }).toEqual(['Loyer']);
    await expect(page.locator('#fixedChargesList')).toContainText('Loyer');
  });

  test('mois jamais lu : ni les lignes ni le solde d\'un autre mois', async ({ page, request }) => {
    await page.clock.setFixedTime(OCTOBRE);
    await ecrireEnBase(request, 'salaries', { vous: 2500, conjointe: 2500 });
    await ecrireEnBase(request, 'periods/2026-10/fixedCharges', {
      loyer: chargeFixe('Loyer', 900)
    });
    await ecrireEnBase(request, 'periods/2026-10/variableCharges', {
      courses: {
        description: 'Courses Leclerc', amount: 84.3, category: 'Courses',
        paidBy: 'vous', date: '2026-10-07', timestamp: 2
      }
    });
    await seConnecter(page);
    await expect(page.locator('#fixedChargesList')).toContainText('Loyer');
    await expect(page.locator('#variableChargesList')).toContainText('Courses Leclerc');

    await page.evaluate(() => window.firebase.database().goOffline());
    await allerAuMois(page, '2026-11');

    await expect(page.locator('#fixedChargesList')).not.toContainText('Loyer', { timeout: 8000 });
    await expect(page.locator('#variableChargesList')).not.toContainText('Courses Leclerc');
    await expect(page.locator('#fixedChargesTotal')).not.toContainText('900');
    await expect(page.locator('#variableChargesTotal')).not.toContainText('84');
    // « Dépensé à deux » : 984,30 € est le total d'octobre.
    await expect(page.locator('#panneauBilan')).not.toContainText(/984[,.]30/);

    // Un mois illisible ne se déguise pas en mois vide.
    await expect(page.locator('#fixedChargesList')).toContainText(/pas disponible/i);
    await expect(page.locator('#variableChargesList')).toContainText(/pas disponible/i);

    // Il l'est de nouveau dès le retour du réseau, sans rechargement.
    await page.evaluate(() => window.firebase.database().goOnline());
    await expect(page.locator('#fixedChargesList')).not.toContainText(/pas disponible/i, { timeout: 15000 });
    await expect(page.locator('#fixedChargesList')).toContainText('Loyer');
  });

  test('AU RETOUR, LE PLAN EST REFAIT : le miroir ne décide de rien', async ({ page, request }) => {
    const reseau = await reseauPilotable(page);
    await preparerNovembreAuMiroir(page, request, {
      charges: {
        loyer: chargeFixe('Loyer', 900),
        abonnement: chargeFixe('Abonnement', 30)
      }
    });

    reseau.coupe = true;
    await page.clock.setFixedTime(NOVEMBRE);
    await page.reload();
    await attendrePrete(page, PRETE_EN_MS);

    // Ailleurs, pendant la coupure : le loyer augmente, une assurance arrive,
    // l'abonnement est supprimé. L'appareil coupé n'en sait rien.
    await ecrireEnBase(request, 'periods/2026-10/fixedCharges', {
      loyer: chargeFixe('Loyer', 950),
      assurance: chargeFixe('Assurance', 40),
      abonnement: { ...chargeFixe('Abonnement', 30), deleted: true }
    });

    await retablirLeReseau(page, reseau);

    await expect.poll(async () => {
      const copies = await lireEnBase(request, 'periods/2026-11/fixedCharges');
      return Object.values(copies || {}).map(c => `${c.description} ${c.amount}`).sort();
    }, { timeout: 20000 }).toEqual(['Assurance 40', 'Loyer 950']);

    expect(await lireEnBase(request, 'periods/2026-11/reconductedFrom')).toBe('2026-10');
    await expect(page.locator('#fixedChargesList')).toContainText('Assurance');
    await expect(page.locator('#fixedChargesList')).not.toContainText('Abonnement');
    await expect(page.locator('#offlineBanner')).toBeHidden();
  });

  test('connexion lente prise pour une coupure : reconduit sans recharger, sur le frais', async ({ page, request }) => {
    const reseau = await reseauPilotable(page);
    await preparerNovembreAuMiroir(page, request);

    // Le loyer a changé ailleurs : le miroir dit 900, la base 950. C'est ce qui
    // distingue un plan refait d'un plan du miroir arrivé à bon port.
    await ecrireEnBase(request, 'periods/2026-10/fixedCharges', {
      loyer: chargeFixe('Loyer', 950)
    });

    // Deux secondes dans chaque sens, et non une coupure : quatre d'aller-retour,
    // quand le premier contact en accorde trois. Les lectures expirent, le miroir
    // répond, l'application se croit coupée, et tout finit par arriver. À quatre
    // secondes par sens, une relecture complète dépasse la minute : mesuré.
    reseau.retardMs = 2000;
    await page.clock.setFixedTime(NOVEMBRE);
    await page.reload();
    await attendrePrete(page, PRETE_EN_MS);

    await expect.poll(async () => {
      const copies = await lireEnBase(request, 'periods/2026-11/fixedCharges');
      return Object.values(copies || {}).map(c => `${c.description} ${c.amount}`);
    }, { timeout: 60000 }).toEqual(['Loyer 950']);

    // La base ne suffit pas : mesuré, l'écran annonçait « Aucune charge fixe »
    // au-dessus d'une base qui portait le loyer. Voir `relireAuRetour`.
    await expect(page.locator('#fixedChargesList')).toContainText('Loyer', { timeout: 40000 });
  });

  test('deux appareils et un second geste : une seule copie', async ({ page, request, browser }) => {
    const reseau = await reseauPilotable(page);
    await preparerNovembreAuMiroir(page, request);

    // Le second appareil a le même miroir : c'est le même navigateur, rejoué.
    const etat = await page.context().storageState({ indexedDB: true });
    const autreContexte = await browser.newContext({
      storageState: etat, viewport: { width: 1280, height: 900 }, baseURL: 'http://localhost:3333'
    });
    const autrePage = await autreContexte.newPage();
    const autreReseau = await reseauPilotable(autrePage);

    reseau.coupe = true;
    autreReseau.coupe = true;
    await page.clock.setFixedTime(NOVEMBRE);
    await autrePage.clock.setFixedTime(NOVEMBRE);
    await page.reload();
    await autrePage.goto(APP_URL);
    await attendrePrete(page, PRETE_EN_MS);
    await attendrePrete(autrePage, PRETE_EN_MS);

    // Le second geste : repartir vers octobre puis revenir, toujours coupé.
    await allerAuMois(page, '2026-10');
    await allerAuMois(page, '2026-11');

    await Promise.all([retablirLeReseau(page, reseau), retablirLeReseau(autrePage, autreReseau)]);

    await expect.poll(async () => lireEnBase(request, 'periods/2026-11/reconductedFrom'),
      { timeout: 20000 }).toBe('2026-10');
    await page.waitForTimeout(1500);

    const copies = await lireEnBase(request, 'periods/2026-11/fixedCharges');
    expect(Object.values(copies || {}).map(c => c.description)).toEqual(['Loyer']);

    await autreContexte.close();
  });
});
