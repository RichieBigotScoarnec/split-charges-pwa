/**
 * FairSplit — Le déplacement d'une charge vers le mois de sa date, devant le
 * moteur de règles
 *
 * Depuis le 2026-10-29, une modification qui change le mois de la date déplace
 * la charge : une écriture multi-chemins, destination posée, origine à `null`.
 * La lecture de `database.rules.json` dit que rien n'est à modifier — le
 * `.write` de `$id` n'exige pas `newData.exists()`, et `.validate` n'est pas
 * évaluée sur une suppression. Ce fichier le demande au MOTEUR, qui seul
 * distingue ce que les règles disent de ce qu'elles font.
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

// L'écriture RÉELLE, prise à sa fabrique : la recopier ici éprouverait une
// forme que l'application cesserait d'émettre au premier correctif.
const { ecrituresDuDeplacement } = await import('../../public/js/poches.js');

const VOUS = 'bigot.richard@gmail.com';
const CONJOINTE = 'cindypepe.cp95@gmail.com';

let env;
const session = (email) =>
  env.authenticatedContext(email.replace(/[^a-z]/g, ''), { email, email_verified: true })
    .database();

const semer = (chemin, valeur) =>
  env.withSecurityRulesDisabled((ctx) => ctx.database().ref(chemin).set(valeur));

const lire = async (chemin) => {
  let v;
  await env.withSecurityRulesDisabled(async (ctx) => {
    v = (await ctx.database().ref(chemin).once('value')).val();
  });
  return v;
};

const COMMUNE = {
  description: 'Grosse course', amount: 182, paidBy: 'vous', category: 'Courses', date: '2026-10-20'
};
const PERSO = { ...COMMUNE, perimetre: 'solo' };

/** Le déplacement d'octobre à novembre, tel que la fabrique l'écrit */
const versNovembre = (charge, collection = 'variableCharges') => ecrituresDuDeplacement({
  avant: { id: 'c1', ...charge },
  apres: { ...charge, date: '2026-11-01' },
  periode: '2026-10', periodeCible: '2026-11', collection, id: 'c1'
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'fairsplit-deplacement',
    database: { rules: readFileSync('database.rules.json', 'utf8') }
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearDatabase());

describe('Une charge change de mois — ce que le moteur autorise', () => {
  it.each(['variableCharges', 'fixedCharges'])(
    'commune (%s) : les deux comptes du foyer la déplacent', async (collection) => {
      for (const email of [VOUS, CONJOINTE]) {
        await env.clearDatabase();
        await semer(`household/periods/2026-10/${collection}/c1`, COMMUNE);
        await semer('household/periods/2026-10/salaries', { vous: 2500, conjointe: 1800 });

        await assertSucceeds(session(email).ref('household').update(versNovembre(COMMUNE, collection)));

        expect(await lire(`household/periods/2026-10/${collection}/c1`)).toBeNull();
        expect(await lire(`household/periods/2026-11/${collection}/c1`))
          .toMatchObject({ amount: 182, date: '2026-11-01' });
      }
    });

  it('la DERNIÈRE charge d\'un mois : le conteneur se vide, et ce n\'est pas un refus', async () => {
    // Octobre ne porte que c1. Le vider supprime `variableCharges` puis le mois
    // entier ; `hasChildren()` ne s'évalue pas sur une suppression.
    await semer('household/periods/2026-10/variableCharges/c1', COMMUNE);

    await assertSucceeds(session(VOUS).ref('household').update(versNovembre(COMMUNE)));

    expect(await lire('household/periods/2026-10')).toBeNull();
  });

  it('personnelle : son propriétaire la déplace dans SA poche', async () => {
    await semer('household/personnel/vous/periods/2026-10/variableCharges/c1', PERSO);

    const ecritures = versNovembre(PERSO);
    expect(Object.keys(ecritures).every(c => c.startsWith('personnel/vous/'))).toBe(true);

    await assertSucceeds(session(VOUS).ref('household').update(ecritures));
    expect(await lire('household/personnel/vous/periods/2026-11/variableCharges/c1'))
      .toMatchObject({ perimetre: 'solo', date: '2026-11-01' });
  });

  it('LE TÉMOIN — l\'autre ne déplace PAS une charge de ma poche', async () => {
    // Sans lui, les cas ci-dessus pourraient passer parce que tout passe.
    await semer('household/personnel/vous/periods/2026-10/variableCharges/c1', PERSO);

    await assertFails(session(CONJOINTE).ref('household').update(versNovembre(PERSO)));
    expect(await lire('household/personnel/vous/periods/2026-10/variableCharges/c1'))
      .toMatchObject({ amount: 182 });
  });
});
