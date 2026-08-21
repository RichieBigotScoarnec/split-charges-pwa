import { test, expect } from '@playwright/test';

import { ALLOWED_EMAILS, SANDBOX_ONLY_EMAILS } from '../../public/js/config.js';

/**
 * Les règles de validation, éprouvées contre l'émulateur
 *
 * `database.rules.json` n'imposait aucune contrainte de forme : un compte
 * autorisé — ou un jeton dérobé, ou un onglet compromis — pouvait écrire
 * n'importe quelle structure, de n'importe quelle taille, à n'importe quel
 * chemin sous l'espace du foyer. Les contrôles de `utils/validation.js` sont
 * côté client : ils préviennent l'erreur de saisie, ils n'arrêtent personne.
 *
 * Ces tests parlent à l'émulateur en REST, avec un vrai jeton : c'est le
 * moteur de règles réel qui répond, pas une simulation. Ils vérifient les deux
 * sens — ce qui doit passer passe, ce qui doit être refusé l'est — parce
 * qu'une règle trop stricte casse l'application aussi sûrement qu'une règle
 * absente la laisse ouverte.
 */

const EMULATOR_AUTH_URL = 'http://127.0.0.1:9099';
const EMULATOR_DB_URL = 'http://127.0.0.1:9010';
const NS = 'ns=fairsplit-foyer-default-rtdb';
const ADMIN = { headers: { Authorization: 'Bearer owner' } };

const EMAIL_FOYER = ALLOWED_EMAILS[0];
const EMAIL_TEST = SANDBOX_ONLY_EMAILS[0];
const EMAIL_INCONNU = 'inconnu@example.com';

/** Charge conforme à ce que produit l'application */
const CHARGE_VALIDE = {
  description: 'Courses Leclerc',
  amount: 84.3,
  category: 'Courses',
  paidBy: 'vous',
  splitOverride: null,
  timestamp: 1755000000000,
  deleted: false
};

const MOT_DE_PASSE = 'MotDePasseTest123!';

/**
 * Crée un compte dans l'émulateur et renvoie son jeton
 *
 * Le jeton produit porte `email_verified: false` : c'est l'état d'un compte
 * créé par l'API d'inscription, celle-là même qui reste joignable avec la clé
 * publique du projet.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} email
 * @returns {Promise<string>} idToken
 */
async function jetonPour(request, email) {
  const reponse = await request.post(
    `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    { data: { email, password: MOT_DE_PASSE, returnSecureToken: true } }
  );
  const corps = await reponse.json();
  if (!corps.idToken) throw new Error(`Création du compte ${email} échouée : ${JSON.stringify(corps)}`);
  return corps.idToken;
}

/**
 * Crée un compte dont l'adresse est vérifiée, et renvoie son jeton
 *
 * L'état d'un compte Google, le seul qui accède à l'espace du foyer. La
 * vérification est posée en administrateur puis le compte est reconnecté : le
 * jeton d'origine porterait encore l'ancienne revendication.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} email
 * @returns {Promise<string>} idToken portant email_verified: true
 */
async function jetonVerifiePour(request, email) {
  const inscription = await request.post(
    `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    { data: { email, password: MOT_DE_PASSE, returnSecureToken: true } }
  );
  const compte = await inscription.json();
  if (!compte.localId) throw new Error(`Création du compte ${email} échouée : ${JSON.stringify(compte)}`);

  await request.post(
    `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`,
    { headers: { Authorization: 'Bearer owner' }, data: { localId: compte.localId, emailVerified: true } }
  );

  const reconnexion = await request.post(
    `${EMULATOR_AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    { data: { email, password: MOT_DE_PASSE, returnSecureToken: true } }
  );
  const corps = await reconnexion.json();
  if (!corps.idToken) throw new Error(`Reconnexion de ${email} échouée : ${JSON.stringify(corps)}`);
  return corps.idToken;
}

/**
 * Écrit une valeur et renvoie le code HTTP
 * @returns {Promise<number>} 200 si accepté, 401 si refusé par les règles
 */
async function ecrire(request, chemin, valeur, jeton) {
  const reponse = await request.put(
    `${EMULATOR_DB_URL}/${chemin}.json?${NS}&auth=${jeton}`,
    { data: valeur, failOnStatusCode: false }
  );
  return reponse.status();
}

test.beforeEach(async ({ request }) => {
  const auth = await request.delete(
    `${EMULATOR_AUTH_URL}/emulator/v1/projects/fairsplit-foyer/accounts`,
    { failOnStatusCode: false }
  );
  if (!auth.ok()) throw new Error(`Nettoyage Auth échoué (${auth.status()})`);

  const base = await request.delete(`${EMULATOR_DB_URL}/.json?${NS}`, { ...ADMIN, failOnStatusCode: false });
  if (!base.ok()) throw new Error(`Nettoyage Database échoué (${base.status()})`);
});

test.describe('Ce que l\'application écrit reste accepté', () => {
  test('une charge complète passe', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);
    const code = await ecrire(request, 'household/periods/2026-08/variableCharges/c1', CHARGE_VALIDE, jeton);
    expect(code).toBe(200);
  });

  test('une charge fixe avec destination et reconduction passe', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);
    const code = await ecrire(request, 'household/periods/2026-08/fixedCharges/f1', {
      ...CHARGE_VALIDE,
      destination: 'Compte Commun',
      recurring: true,
      splitOverride: { mode: 'custom', vous: 60, conjointe: 40 }
    }, jeton);
    expect(code).toBe(200);
  });

  test('une saisie rapide avec position GPS passe', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);
    const code = await ecrire(request, 'household/periods/2026-08/variableCharges/c2', {
      ...CHARGE_VALIDE,
      categoryId: 'courses',
      categoryIcon: '🛒',
      splitMode: 'prorata',
      date: '2026-08-21',
      location: { lat: 48.8, lng: 2.35, name: 'Leclerc', timestamp: 1755000000000 }
    }, jeton);
    expect(code).toBe(200);
  });

  test('salaires, prénoms, mode de partage et budgets passent', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);

    expect(await ecrire(request, 'household/salaries',
      { vous: 3200, conjointe: 2400, extraVous: 150, extraConjointe: 0 }, jeton)).toBe(200);
    expect(await ecrire(request, 'household/members', { vous: 'Richard', conjointe: 'Cindy' }, jeton)).toBe(200);
    expect(await ecrire(request, 'household/shareMode',
      { mode: 'custom', customPercents: { vous: 55, conjointe: 45 } }, jeton)).toBe(200);
    expect(await ecrire(request, 'household/categoryBudgets', { Courses: 400 }, jeton)).toBe(200);
    expect(await ecrire(request, 'household/carryOverEnabled', true, jeton)).toBe(200);
    expect(await ecrire(request, 'household/reminders',
      { finMois: true, budget: false, budgetAmount: 0, reimbursement: false }, jeton)).toBe(200);
  });

  test('les listes personnalisées passent, objets comme chaînes héritées', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);

    expect(await ecrire(request, 'household/customCategories',
      [{ id: 'courses', label: 'Courses', icon: '🛒', color: '#4caf50' }], jeton)).toBe(200);
    expect(await ecrire(request, 'household/customDestinations', ['Compte Commun'], jeton)).toBe(200);
  });

  test('une restauration de sauvegarde réécrit tout l\'espace', async ({ request }) => {
    // Le cas le plus exposé : dbSet(undefined, data) remplace la racine de
    // l'espace en une écriture. Chaque nœud est alors validé d'un coup — une
    // seule contrainte trop stricte rendrait toute restauration impossible.
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);

    const code = await ecrire(request, 'household', {
      salaries: { vous: 3200, conjointe: 2400 },
      members: { vous: 'Richard', conjointe: 'Cindy' },
      shareMode: { mode: 'prorata' },
      carryOverEnabled: false,
      categoryBudgets: { Courses: 400 },
      customCategories: [{ id: 'courses', label: 'Courses', icon: '🛒' }],
      customDestinations: [{ id: 'commun', label: 'Compte Commun', icon: '🤝' }],
      reminders: { finMois: false, budget: false, budgetAmount: 0, reimbursement: false },
      periods: {
        '2026-07': {
          salaries: { vous: 3100, conjointe: 2400 },
          variableCharges: { c1: CHARGE_VALIDE },
          fixedCharges: { f1: { ...CHARGE_VALIDE, destination: 'Compte Commun', recurring: true } },
          reimbursements: {
            r1: { direction: 'vous-to-conjointe', amount: 120, note: '', timestamp: 1755000000000, deleted: false }
          }
        },
        '2026-08': { variableCharges: { c2: CHARGE_VALIDE } }
      }
    }, jeton);

    expect(code).toBe(200);
  });

  test('la suppression logique reste possible', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);
    await ecrire(request, 'household/periods/2026-08/variableCharges/c1', CHARGE_VALIDE, jeton);

    expect(await ecrire(request, 'household/periods/2026-08/variableCharges/c1/deleted', true, jeton)).toBe(200);
  });
});

test.describe('Ce qui n\'a rien à faire en base est refusé', () => {
  test('un montant démesuré est refusé', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);
    const code = await ecrire(request, 'household/periods/2026-08/variableCharges/c1',
      { ...CHARGE_VALIDE, amount: 999999999 }, jeton);
    expect(code).not.toBe(200);
  });

  test('un montant en texte est refusé', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);
    const code = await ecrire(request, 'household/periods/2026-08/variableCharges/c1',
      { ...CHARGE_VALIDE, amount: '=1+1' }, jeton);
    expect(code).not.toBe(200);
  });

  test('une description sans fin est refusée', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);
    const code = await ecrire(request, 'household/periods/2026-08/variableCharges/c1',
      { ...CHARGE_VALIDE, description: 'x'.repeat(50000) }, jeton);
    expect(code).not.toBe(200);
  });

  test('un sous-arbre planté dans une charge est refusé', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);
    const code = await ecrire(request, 'household/periods/2026-08/variableCharges/c1',
      { ...CHARGE_VALIDE, charge_utile: { a: { b: { c: 'contenu arbitraire' } } } }, jeton);
    expect(code).not.toBe(200);
  });

  test('un nœud inconnu à la racine de l\'espace est refusé', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);
    const code = await ecrire(request, 'household/nimporte_quoi', { beaucoup: 'de données' }, jeton);
    expect(code).not.toBe(200);
  });

  test('une période au format libre est refusée', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);
    const code = await ecrire(request, 'household/periods/pas-une-periode/variableCharges/c1',
      CHARGE_VALIDE, jeton);
    expect(code).not.toBe(200);
  });

  test('un prénom démesuré est refusé', async ({ request }) => {
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);
    const code = await ecrire(request, 'household/members', { vous: 'x'.repeat(500), conjointe: 'Cindy' }, jeton);
    expect(code).not.toBe(200);
  });
});

test.describe('La liste blanche fait toujours autorité', () => {
  test('un compte hors liste n\'écrit ni ne lit', async ({ request }) => {
    const jeton = await jetonPour(request, EMAIL_INCONNU);

    expect(await ecrire(request, 'household/periods/2026-08/variableCharges/c1', CHARGE_VALIDE, jeton)).not.toBe(200);

    const lecture = await request.get(`${EMULATOR_DB_URL}/household.json?${NS}&auth=${jeton}`,
      { failOnStatusCode: false });
    expect(lecture.status()).not.toBe(200);
  });

  test('le compte de test reste hors du foyer, mais entre au bac à sable', async ({ request }) => {
    const jeton = await jetonPour(request, EMAIL_TEST);

    expect(await ecrire(request, 'household/periods/2026-08/variableCharges/c1', CHARGE_VALIDE, jeton)).not.toBe(200);
    expect(await ecrire(request, 'sandbox/periods/2026-08/variableCharges/c1', CHARGE_VALIDE, jeton)).toBe(200);
  });

  test('une adresse non vérifiée n\'ouvre pas l\'espace du foyer', async ({ request }) => {
    // Le fournisseur e-mail/mot de passe est actif, et l'API d'inscription
    // reste joignable avec la clé publique du projet : le drapeau applicatif
    // SIGNUP_ENABLED masque le bouton, il ne ferme pas l'endpoint. Sans cette
    // condition, quiconque parvenait à créer un compte portant une adresse de
    // la liste blanche lisait et écrivait tout le foyer, sans jamais prouver
    // qu'il possédait la boîte aux lettres.
    const jeton = await jetonPour(request, EMAIL_FOYER);

    expect(await ecrire(request, 'household/periods/2026-08/variableCharges/c1', CHARGE_VALIDE, jeton))
      .not.toBe(200);

    const lecture = await request.get(`${EMULATOR_DB_URL}/household.json?${NS}&auth=${jeton}`,
      { failOnStatusCode: false });
    expect(lecture.status()).not.toBe(200);
  });

  test('la même adresse, une fois vérifiée, ouvre le foyer', async ({ request }) => {
    // L'état d'un compte Google, celui des deux comptes du foyer.
    const jeton = await jetonVerifiePour(request, EMAIL_FOYER);

    expect(await ecrire(request, 'household/periods/2026-08/variableCharges/c1', CHARGE_VALIDE, jeton))
      .toBe(200);
  });

  test('le bac à sable reste ouvert à une adresse non vérifiée', async ({ request }) => {
    // Le compte de test s'authentifie par mot de passe et son adresse n'est
    // pas vérifiée. Lui imposer la même condition qu'au foyer fermerait le bac
    // à sable, dont c'est le seul usage.
    const jeton = await jetonPour(request, EMAIL_TEST);

    expect(await ecrire(request, 'sandbox/periods/2026-08/variableCharges/c1', CHARGE_VALIDE, jeton))
      .toBe(200);
  });

  test('le bac à sable applique le même schéma que le foyer', async ({ request }) => {
    const jeton = await jetonPour(request, EMAIL_TEST);
    const code = await ecrire(request, 'sandbox/periods/2026-08/variableCharges/c1',
      { ...CHARGE_VALIDE, description: 'x'.repeat(50000) }, jeton);
    expect(code).not.toBe(200);
  });
});
