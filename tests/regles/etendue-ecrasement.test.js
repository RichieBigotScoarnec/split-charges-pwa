/**
 * FairSplit — Jusqu'où va l'écrasement de conteneur ?
 *
 * QA-L37-02 et RT-001 ont établi, par mesure contre l'émulateur, qu'un `set`
 * sur `prive/vous/periods/<mois>/depenses` ne portant qu'un enfant valide
 * PASSE, et efface les autres dépenses sans trace. La corbeille ne rattrape
 * rien : elle ne restitue que ce qui porte `deleted: true`.
 *
 * Le mécanisme n'est pas un défaut de validation, c'est le placement du droit
 * d'écriture. Dans les règles temps réel, `.write` CASCADE vers le bas :
 * accordé à la racine de `prive/vous`, il l'est sur tous les descendants, y
 * compris pris comme conteneurs. Aucune règle plus profonde ne le révoque.
 * Une suppression, elle, n'est pas validée — seule la donnée écrite l'est.
 *
 * `household` a exactement la même structure : `.write` à sa racine, rien en
 * dessous. Ce fichier mesure si le trou est isolé à `prive` ou s'il est
 * général, et surtout CE QUE LA CORRECTION CASSERAIT.
 *
 *   npm run regles
 *
 * ⚠️ Ces cas décrivent le comportement ATTENDU. Un échec peut signifier que la
 * règle est fausse, ou que l'attente l'est. Les deux se tranchent en lisant la
 * règle, jamais en ajustant le test.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

const VOUS = 'bigot.richard@gmail.com';

let env;
const session = () =>
  env.authenticatedContext('vous', { email: VOUS, email_verified: true }).database();

const semer = (chemin, valeur) =>
  env.withSecurityRulesDisabled((ctx) => ctx.database().ref(chemin).set(valeur));

const lire = async (chemin) => {
  let v;
  await env.withSecurityRulesDisabled(async (ctx) => {
    v = (await ctx.database().ref(chemin).once('value')).val();
  });
  return v;
};

const CHARGE = { description: 'Courses', amount: 42, paidBy: 'vous', category: 'Alimentation' };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'fairsplit-etendue',
    database: { rules: readFileSync('database.rules.json', 'utf8') }
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearDatabase());

describe("L'étendue de l'écrasement — le foyer est-il touché lui aussi ?", () => {
  it("un set sur household/<mois>/variableCharges ne doit pas effacer les autres charges", async () => {
    const base = 'household/periods/2026-09/variableCharges';
    await semer(base, { a: CHARGE, b: { ...CHARGE, description: 'Essence' } });

    await assertFails(session().ref(base).set({ c: { ...CHARGE, description: 'Pain' } }));

    // Si l'assertion ci-dessus échoue, ce contrôle dit ce qui a été perdu.
    const apres = await lire(base);
    expect(Object.keys(apres || {}), 'a et b doivent survivre').toEqual(
      expect.arrayContaining(['a', 'b'])
    );
  });

  it("un set sur household/<mois>/fixedCharges ne doit pas effacer les autres non plus", async () => {
    const base = 'household/periods/2026-09/fixedCharges';
    await semer(base, { a: CHARGE, b: { ...CHARGE, description: 'Assurance' } });

    await assertFails(session().ref(base).set({ c: { ...CHARGE, description: 'Loyer' } }));
  });

  it("un set sur le conteneur de période ne doit pas effacer les listes qu'il contient", async () => {
    const base = 'household/periods/2026-09';
    await semer(base, {
      variableCharges: { a: CHARGE },
      fixedCharges: { b: CHARGE }
    });

    await assertFails(session().ref(base).set({ variableCharges: { c: CHARGE } }));
  });
});

describe('LE TÉMOIN — ce que la correction casserait', () => {
  /**
   * Ces cas ne décrivent pas un défaut : ils décrivent un usage LÉGITIME qui
   * écrit des conteneurs entiers. Ils passent aujourd'hui et DOIVENT continuer
   * de passer après toute correction.
   *
   * Si une correction les fait tomber, elle est trop large : elle interdirait
   * la restauration de sauvegarde en même temps que l'écrasement accidentel.
   * C'est la question que ce fichier existe pour trancher — et elle se tranche
   * AVANT d'écrire la correction, pas après.
   */
  it('une restauration de sauvegarde écrit tout un espace, et doit rester possible', async () => {
    await assertSucceeds(
      session().ref('household').set({
        periods: { '2026-09': { variableCharges: { a: CHARGE } } },
        salaries: { vous: 2000, conjointe: 1800 },
        shareMode: 'prorata'
      })
    );
  });

  it("l'écriture d'une charge seule reste possible — c'est le chemin normal", async () => {
    await assertSucceeds(
      session().ref('household/periods/2026-09/variableCharges/x').set(CHARGE)
    );
  });

  it("la suppression logique d'une charge reste possible", async () => {
    const chemin = 'household/periods/2026-09/variableCharges/a';
    await semer(chemin, CHARGE);
    await assertSucceeds(session().ref(chemin).update({ deleted: true }));
  });

  it('vider une liste devenue vide reste possible', async () => {
    const base = 'household/periods/2026-09/variableCharges';
    await semer(base, { a: CHARGE });
    await assertSucceeds(session().ref(`${base}/a`).remove());
  });
});
