/**
 * FairSplit — Le mur privé, éprouvé contre le moteur de règles
 *
 * Sortie consommée par la chaîne d'audit (§17). Ces cas ne lisent pas
 * `database.rules.json` : ils demandent à l'émulateur ce qu'il **autorise**.
 * C'est la seule chose qui distingue ce que les règles disent de ce qu'elles
 * font, et c'est ce que le constat QA-001 signale comme jamais fait.
 *
 *   npx firebase emulators:exec --only database "npx vitest run tests/regles/"
 *
 * ⚠️ Ces cas sont dérivés de la lecture des règles au commit courant. Ils
 * décrivent le comportement ATTENDU : un échec peut signifier que la règle est
 * fausse, ou que l'attente l'est. Les deux se tranchent en lisant la règle, pas
 * en ajustant le test.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

const VOUS = 'bigot.richard@gmail.com';
const CONJOINTE = 'cindypepe.cp95@gmail.com';
const TIERS = 'inconnu@example.com';

let env;
const session = (email, verifie = true) =>
  env.authenticatedContext(email.replace(/[^a-z]/g, ''), { email, email_verified: verifie })
    .database();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'fairsplit-regles',
    database: { rules: readFileSync('database.rules.json', 'utf8') }
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearDatabase());

describe('Le mur privé — lecture', () => {
  it('chacun lit son propre espace', async () => {
    await assertSucceeds(session(VOUS).ref('prive/vous').once('value'));
    await assertSucceeds(session(CONJOINTE).ref('prive/conjointe').once('value'));
  });

  it("l'autre ne lit pas l'espace privé tant qu'aucun aval n'est actif", async () => {
    await assertFails(session(CONJOINTE).ref('prive/vous').once('value'));
    await assertFails(session(VOUS).ref('prive/conjointe').once('value'));
  });

  it("l'aval actif ouvre la lecture, et lui seul", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('aval/vous/actif').set(true);
    });
    await assertSucceeds(session(CONJOINTE).ref('prive/vous').once('value'));
    // l'aval de l'un n'ouvre pas l'espace de l'autre
    await assertFails(session(VOUS).ref('prive/conjointe').once('value'));
  });

  it("un aval retiré referme la lecture", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('aval/vous/actif').set(false);
    });
    await assertFails(session(CONJOINTE).ref('prive/vous').once('value'));
  });

  it('un tiers ne lit rien, et une adresse non vérifiée non plus', async () => {
    await assertFails(session(TIERS).ref('prive/vous').once('value'));
    await assertFails(session(TIERS).ref('household').once('value'));
    await assertFails(session(VOUS, false).ref('prive/vous').once('value'));
    await assertFails(session(VOUS, false).ref('household').once('value'));
  });
});

describe("Le mur privé — écriture", () => {
  it("l'aval ouvre la lecture, jamais l'écriture", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('aval/vous/actif').set(true);
    });
    await assertFails(
      session(CONJOINTE).ref('prive/vous/periods/2026-09/depenses/x').set({ montant: 10 })
    );
  });

  it('chacun écrit dans son espace', async () => {
    await assertSucceeds(
      session(VOUS).ref('prive/vous/periods/2026-09/depenses/x').set({ montant: 10 })
    );
  });
});

describe('Les bornes de validation', () => {
  const ecrire = (valeur) =>
    session(VOUS).ref('prive/vous/periods/2026-09/depenses/y').set(valeur);

  it('refuse un montant négatif, hors plafond, ou non numérique', async () => {
    await assertFails(ecrire({ montant: -1 }));
    await assertFails(ecrire({ montant: 100001 }));
    await assertFails(ecrire({ montant: '10' }));
  });

  it('refuse une dépense sans montant', async () => {
    await assertFails(ecrire({ description: 'sans montant' }));
  });

  it('refuse un champ non déclaré', async () => {
    await assertFails(ecrire({ montant: 10, champInconnu: 'x' }));
  });

  it('refuse une date mal formée, accepte la chaîne vide', async () => {
    await assertFails(ecrire({ montant: 10, date: '12/09/2026' }));
    await assertSucceeds(ecrire({ montant: 10, date: '' }));
  });

  it('refuse une description au-delà de 200 caractères', async () => {
    await assertFails(ecrire({ montant: 10, description: 'x'.repeat(201) }));
  });
});

describe("Le remplacement de conteneur — maillon 5 de la chaîne RT-001", () => {
  it("un set sur le conteneur de dépenses ne doit pas effacer les autres", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('prive/vous/periods/2026-09/depenses').set({
        a: { montant: 10 },
        b: { montant: 20 }
      });
    });

    // Un `set` sur le conteneur entier, ne portant qu'un enfant valide.
    // S'il réussit, `a` et `b` disparaissent sans trace : c'est le maillon
    // que RT-001 déduit de la lecture des règles et que ce cas mesure.
    await assertFails(
      session(VOUS).ref('prive/vous/periods/2026-09/depenses').set({ c: { montant: 30 } })
    );
  });

  it("un set sur la racine d'un espace privé ne doit pas passer", async () => {
    await assertFails(session(VOUS).ref('prive/vous').set({ periods: {} }));
  });
});
