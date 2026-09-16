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

// La forme RÉELLE de l'écriture de restauration, prise à sa source. La
// recopier ici en donnerait une seconde rédaction : elle divergerait au
// premier nœud ajouté, et ce fichier éprouverait alors une écriture que
// l'application n'émet plus.
const { ecrituresDeRestauration } = await import('../../public/js/modules/backup.js');

const VOUS = 'bigot.richard@gmail.com';
const COMPTE_TEST = 'testfairsplit@gmail.com';

let env;
const session = () =>
  env.authenticatedContext('vous', { email: VOUS, email_verified: true }).database();

// Le compte de test n'a pas besoin d'adresse vérifiée : c'est la règle du bac
// à sable, pas un raccourci de banc d'essai.
const sessionBac = () =>
  env.authenticatedContext('test', { email: COMPTE_TEST, email_verified: false }).database();

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
    // Charge utile reprise de `tests/e2e/regles-donnees.spec.js` : `shareMode`
    // est un OBJET au niveau du foyer et une chaîne au niveau de la période.
    // La version précédente de ce témoin avait pris la forme du mauvais niveau
    // et échouait pour cette seule raison — pas parce que la restauration
    // serait cassée.
    await assertSucceeds(
      session().ref('household').set({
        restaureLe: Date.now(),
        periods: { '2026-09': { variableCharges: { a: CHARGE } } },
        salaries: { vous: 2000, conjointe: 1800 },
        shareMode: { mode: 'prorata' }
      })
    );
  });

  it('le marqueur de restauration ne rouvre pas le trou pour les écritures suivantes', async () => {
    // `restaureLe` PERSISTE en base. Une règle qui se contenterait de sa
    // présence redeviendrait vraie pour toute écriture ultérieure, et le trou
    // rouvrirait définitivement dès la première restauration. La condition
    // porte donc sur le CHANGEMENT du marqueur.
    await semer('household', {
      restaureLe: 1757000000000,
      periods: { '2026-09': { variableCharges: { a: CHARGE, b: { ...CHARGE, description: 'Essence' } } } }
    });

    await assertFails(
      session().ref('household/periods/2026-09/variableCharges').set({ c: CHARGE })
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RESTAURATION ET LA POCHE DE L'AUTRE — le seul geste de ce lot qui
 * pouvait DÉTRUIRE des données
 *
 * Depuis le 2026-09-16, `household/personnel/{qui}` n'est lisible que par son
 * propriétaire, ou par l'autre sous aval. Un fichier de sauvegarde ne peut
 * donc plus porter la poche de l'autre — on n'a pas le droit de la lire.
 *
 * Or la restauration écrivait la racine d'un `set`, et un `set` supprime ce
 * qu'il ne porte pas. Restaurer aurait effacé la poche de l'autre, sans un
 * mot, le jour précis où l'on restaure parce que quelque chose est déjà cassé.
 *
 * ⚠️ CE QUI PROTÈGE EST LE CLIENT, PAS LA RÈGLE. Le `set` de racine reste
 * AUTORISÉ — le second cas ci-dessous le mesure, et l'efface bel et bien. Le
 * fermer demanderait de descendre le `.write` de restauration, ce qui
 * rouvrirait partiellement l'écrasement de conteneur que `4ac03f8` vient de
 * fermer. L'arbitrage est écrit : la restauration n'emploie plus cette forme,
 * et c'est la mise à jour multi-chemins qui est éprouvée ici.
 */
describe("La restauration n'efface pas la poche personnelle de l'autre", () => {
  const PERSO = { amount: 30, description: 'Coiffeur', paidBy: 'conjointe', perimetre: 'solo' };

  /** Ce qu'un fichier de sauvegarde de `vous` peut contenir — jamais la poche de l'autre */
  const FICHIER = {
    salaries: { vous: 2000, conjointe: 1800 },
    shareMode: { mode: 'prorata' },
    periods: { '2026-09': { variableCharges: { a: CHARGE } } }
  };

  /** L'état de la base avant restauration : les deux poches sont là */
  const semerLesDeuxPoches = () => semer('household', {
    restaureLe: 1757000000000,
    salaries: { vous: 1, conjointe: 1 },
    periods: { '2026-08': { variableCharges: { vieux: CHARGE } } },
    personnel: {
      vous: { periods: { '2026-09': { variableCharges: { m: { ...PERSO, paidBy: 'vous' } } } } },
      conjointe: { periods: { '2026-09': { variableCharges: { s: PERSO } } } }
    }
  });

  it('la mise à jour multi-chemins passe, et laisse les DEUX poches intactes', async () => {
    await semerLesDeuxPoches();

    await assertSucceeds(
      session().ref('household').update(
        ecrituresDeRestauration(FICHIER, 'personnel', Date.now())));

    // Les nœuds du foyer ont bien été remplacés — sinon ce cas mesurerait une
    // écriture qui n'a rien fait.
    expect(await lire('household/salaries')).toEqual({ vous: 2000, conjointe: 1800 });
    expect(await lire('household/periods/2026-08')).toBeNull();

    // Et les deux poches personnelles sont là, celle de l'autre comprise.
    expect(await lire('household/personnel/conjointe/periods/2026-09/variableCharges/s'))
      .toEqual(PERSO);
    expect(await lire('household/personnel/vous/periods/2026-09/variableCharges/m'))
      .toEqual({ ...PERSO, paidBy: 'vous' });
  });

  it("LE TÉMOIN — l'ancien `set` de racine, lui, efface les deux", async () => {
    // Ce cas mesure le DÉFAUT, et il doit rester vert : c'est lui qui dit que
    // le danger était réel et non déduit. Le jour où cette écriture cesse
    // d'effacer, la mise à jour multi-chemins n'achète plus rien et ce cas
    // rougira pour le dire.
    await semerLesDeuxPoches();

    await assertSucceeds(
      session().ref('household').set({ ...FICHIER, restaureLe: Date.now() }));

    expect(await lire('household/personnel')).toBeNull();
  });

  it("la forme de restauration ne porte JAMAIS la poche personnelle", async () => {
    // Le témoin de la fabrique elle-même, et il est nécessaire : les deux cas
    // ci-dessus resteraient verts si `ecrituresDeRestauration` portait
    // `personnel` à une valeur qui se trouve être la bonne. Un fichier peut
    // contenir la poche de son auteur — elle est restaurée par un chemin
    // dédié, jamais par la racine.
    const ecritures = ecrituresDeRestauration(
      { ...FICHIER, personnel: { vous: { periods: {} } } }, 'personnel', 1);

    expect(Object.keys(ecritures)).not.toContain('personnel');
    expect(ecritures.restaureLe).toBe(1);
    // Un nœud absent du fichier part à `null` : c'est ce qui rend cette mise à
    // jour équivalente au `set` sur les nœuds du foyer.
    expect(ecritures.reminders).toBeNull();
    expect(ecritures.salaries).toEqual(FICHIER.salaries);
  });

  it('chacun restaure SA poche, par son chemin propre', async () => {
    await semerLesDeuxPoches();

    // Ce que `restoreBackup` écrit après la mise à jour de racine. Le marqueur
    // est exigé par la règle : sans lui, remplacer le conteneur est refusé.
    await assertSucceeds(session().ref('household/personnel/vous').set({
      periods: { '2026-09': { variableCharges: { neuf: { ...PERSO, paidBy: 'vous' } } } },
      restaureLe: Date.now()
    }));

    // Et il ne peut pas restaurer celle de l'autre, même en la fabriquant.
    await assertFails(session().ref('household/personnel/conjointe').set({
      periods: {}, restaureLe: Date.now()
    }));
  });
});

/**
 * L'effacement d'un nœud entier — le versant que la correction a failli casser
 *
 * Ces trois cas existent en e2e depuis le 2026-08-27, où une garde
 * `newData.exists()` posée sur `sandbox` « par symétrie, non par besoin » avait
 * fermé l'unique opération dont ce nœud a la charge. Le 2026-09-14, le
 * déplacement du `.write` vers la feuille a refait la même chose par un autre
 * chemin : la clause de restauration exigeait `restaureLe`, qu'un effacement
 * ne porte évidemment pas.
 *
 * Ils sont recopiés ici parce que la suite e2e demande un navigateur, donc ne
 * tourne pas partout. Un témoin qu'on ne peut pas jouer au moment où l'on
 * écrit la règle ne protège pas de l'erreur qu'on est en train de commettre.
 */
describe("L'effacement d'un nœud entier", () => {
  it("le bac à sable peut être vidé — c'est sa fonction", async () => {
    await semer('sandbox/periods/2026-08/variableCharges/c1', CHARGE);
    await assertSucceeds(sessionBac().ref('sandbox').remove());
  });

  it("le foyer, lui, ne peut pas être effacé en une requête", async () => {
    await semer('household/periods/2026-08/variableCharges/c1', CHARGE);
    await assertFails(session().ref('household').remove());
  });

  it("rouvrir le vidage du bac à sable n'y rouvre pas l'écrasement de conteneur", async () => {
    // Le témoin négatif du premier cas. `!newData.exists()` n'autorise que
    // l'effacement TOTAL : un `set` qui laisse l'espace debout reste jugé sur
    // le marqueur, donc refusé.
    const base = 'sandbox/periods/2026-08/variableCharges';
    await semer(base, { a: CHARGE, b: { ...CHARGE, description: 'Essence' } });

    await assertFails(sessionBac().ref(base).set({ c: CHARGE }));

    const apres = await lire(base);
    expect(Object.keys(apres || {}), 'a et b doivent survivre').toEqual(['a', 'b']);
  });
});
