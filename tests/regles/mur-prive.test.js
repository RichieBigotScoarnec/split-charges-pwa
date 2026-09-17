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
const COMPTE_TEST = 'testfairsplit@gmail.com';

let env;
const session = (email, verifie = true) =>
  env.authenticatedContext(email.replace(/[^a-z]/g, ''), { email, email_verified: verifie })
    .database();

// Le compte de test n'a pas besoin d'adresse vérifiée : c'est la règle du bac
// à sable, pas un raccourci de banc d'essai.
const sessionBacASable = () =>
  env.authenticatedContext('test', { email: COMPTE_TEST, email_verified: false })
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
    await assertFails(session(VOUS, false).ref('prive/vous').once('value'));
    // `household/periods`, et non `household` : depuis que le droit de lecture
    // a descendu d'un cran, la racine échoue pour TOUT LE MONDE — y compris
    // pour le foyer. Exiger son refus ici ne mesurerait plus la liste blanche,
    // seulement le placement du droit, et resterait vert sur une liste vidée.
    await assertFails(session(TIERS).ref('household/periods').once('value'));
    await assertFails(session(VOUS, false).ref('household/periods').once('value'));
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MUR PERSONNEL — la poche réellement utilisée
 *
 * Le mur ci-dessus protège `prive/`, et il est éprouvé. Mais les dépenses
 * personnelles — celles que l'application appelle « solo » et que le foyer
 * saisit tous les jours — vivaient sous `household/`, donc lisibles par
 * l'autre SANS aucun aval. La réalité était l'inverse de la crainte : ce qu'on
 * croyait exposé était protégé, ce qu'on saisit réellement ne l'était pas.
 *
 * `household/personnel/{qui}` reçoit donc le mécanisme d'aval qui existe déjà,
 * et ses trois clauses sont reprises VERBATIM de `prive/{qui}` — une seule
 * rédaction du mur, jamais deux qui divergeront.
 *
 * ## Pourquoi le `.read` est au cran de `{qui}`, et pas sur `personnel`
 *
 * Un `.read` CASCADE et aucune règle plus profonde ne le révoque — c'est ce
 * que `4ac03f8` a établi pour `.write`. Un `.read` posé sur `personnel`
 * ouvrirait donc les DEUX moitiés à quiconque l'obtient. Les deux moitiés
 * n'ont pas le même propriétaire : le droit se pose là où le propriétaire est
 * connu, c'est-à-dire un cran plus bas. Le corollaire est qu'on ne lit jamais
 * `personnel` d'un coup, et un cas ci-dessous le tient.
 *
 * ## Et pourquoi le bac à sable porte la MÊME clause, compte de test exclu
 *
 * Le bac à sable sert à reproduire une panne du foyer. Un `personnel` qui s'y
 * ouvrirait au compte de test ne reproduirait pas le mur, il reproduirait son
 * absence. Le compte de test n'a pas d'emplacement dans le foyer : il n'a rien
 * à lire là.
 */

/** La forme d'une charge personnelle — le schéma du foyer, pas un schéma appauvri */
const CHARGE_PERSO = {
  amount: 42,
  description: 'Séance de sport',
  category: 'Loisirs',
  paidBy: 'vous',
  perimetre: 'solo',
  date: '2026-09-12',
  deleted: false
};

/** Les deux espaces de données. `?sandbox=1` bascule de l'un à l'autre. */
const ESPACES = ['household', 'sandbox'];

/** Le chemin d'une charge personnelle */
const chargePerso = (espace, qui) =>
  `${espace}/personnel/${qui}/periods/2026-09/variableCharges/x`;

describe.each(ESPACES)('Le mur personnel — %s, lecture', (espace) => {
  it('chacun lit son personnel', async () => {
    await assertSucceeds(session(VOUS).ref(`${espace}/personnel/vous`).once('value'));
    await assertSucceeds(
      session(CONJOINTE).ref(`${espace}/personnel/conjointe`).once('value'));
  });

  it("l'autre ne lit pas le personnel tant qu'aucun aval n'est actif", async () => {
    await assertFails(session(CONJOINTE).ref(`${espace}/personnel/vous`).once('value'));
    await assertFails(session(VOUS).ref(`${espace}/personnel/conjointe`).once('value'));
  });

  it("l'aval actif ouvre la lecture, et lui seul", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('aval/vous/actif').set(true);
    });
    await assertSucceeds(session(CONJOINTE).ref(`${espace}/personnel/vous`).once('value'));
    // L'aval de l'un n'ouvre pas le personnel de l'autre.
    await assertFails(session(VOUS).ref(`${espace}/personnel/conjointe`).once('value'));
  });

  it('un aval retiré referme la lecture', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('aval/vous/actif').set(false);
    });
    await assertFails(session(CONJOINTE).ref(`${espace}/personnel/vous`).once('value'));
  });

  it('les deux personnels ne se lisent pas d\'un coup', async () => {
    // La propriété qui explique le placement du `.read`. Un aval actif n'y
    // change rien : il ouvre une moitié, jamais le conteneur des deux.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('aval/vous/actif').set(true);
    });
    await assertFails(session(VOUS).ref(`${espace}/personnel`).once('value'));
    await assertFails(session(CONJOINTE).ref(`${espace}/personnel`).once('value'));
  });

  it('un tiers ne lit rien, et une adresse non vérifiée non plus', async () => {
    await assertFails(session(TIERS).ref(`${espace}/personnel/vous`).once('value'));
    await assertFails(session(VOUS, false).ref(`${espace}/personnel/vous`).once('value'));
  });

  it('le compte de test ne lit jamais le personnel DU FOYER', async () => {
    // Il est cantonné au bac à sable, et le foyer lui est fermé partout.
    await assertFails(
      sessionBacASable().ref('household/personnel/vous').once('value'));
    await assertFails(
      sessionBacASable().ref('household/personnel/conjointe').once('value'));
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE COMPTE DE TEST OCCUPE `vous` DANS LE BAC À SABLE, ET LES RÈGLES DOIVENT
 * LE SAVOIR
 *
 * `config.js` (`EMPLACEMENTS_PAR_COMPTE`) lui assigne `vous` par DÉCISION
 * écrite, pas par repli : il y a une ligne pour lui, à côté des deux du foyer.
 * Le bac à sable admet donc le compte de test sur `personnel/vous`.
 *
 * ## Le défaut que cela ferme, et qu'aucun contrôle ne pouvait voir
 *
 * Sans cette ouverture, la première lecture de `sandbox/personnel/vous` par le
 * compte de test est REFUSÉE — et `dbGet` lève sur un refus, délibérément : « un
 * refus est une réponse », le miroir ne le rattrape pas. `buildBackup` lisant
 * ses treize nœuds en parallèle, une seule levée emportait la sauvegarde
 * ENTIÈRE : « Sauvegarde impossible », pour le seul compte qui n'a que le bac
 * à sable.
 *
 * Aucun contrôle ne pouvait l'attraper : les deux specs de bout en bout qui
 * exercent la sauvegarde passent par le double Firebase de `_harness.js`, qui
 * n'applique aucune règle. Trouvé en relisant le diff, pas par un rouge.
 *
 * ## Ce que le bac à sable reproduit encore
 *
 * Le mur ENTRE LES DEUX MEMBRES, qui est ce qu'il doit reproduire : les cas
 * ci-dessus tournent sur les deux espaces et exigent, dans le bac à sable
 * comme dans le foyer, que l'un ne lise pas le personnel de l'autre sans aval.
 * Ce qui s'ouvre ici est un troisième compte, sur des données d'essai.
 */
describe('Le mur personnel — le compte de test dans le bac à sable', () => {
  it('lit et écrit SON personnel de bac à sable', async () => {
    await assertSucceeds(
      sessionBacASable().ref('sandbox/personnel/vous').once('value'));
    await assertSucceeds(
      sessionBacASable().ref(chargePerso('sandbox', 'vous')).set(CHARGE_PERSO));
  });

  it('LE TÉMOIN — et rien du foyer, ni personnel ni commun', async () => {
    // Sans lui, l'ouverture ci-dessus pourrait avoir été écrite trop large.
    await assertFails(
      sessionBacASable().ref('household/personnel/vous').once('value'));
    await assertFails(
      sessionBacASable().ref(chargePerso('household', 'vous')).set(CHARGE_PERSO));
    await assertFails(
      sessionBacASable().ref('household/periods').once('value'));
  });
});

describe.each(ESPACES)('Le mur personnel — %s, écriture', (espace) => {
  it("l'aval ouvre la lecture, jamais l'écriture", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('aval/vous/actif').set(true);
    });
    await assertFails(
      session(CONJOINTE).ref(chargePerso(espace, 'vous')).set(CHARGE_PERSO));
  });

  it('chacun écrit dans son personnel', async () => {
    await assertSucceeds(session(VOUS).ref(chargePerso(espace, 'vous')).set(CHARGE_PERSO));
    await assertSucceeds(
      session(CONJOINTE)
        .ref(chargePerso(espace, 'conjointe'))
        .set({ ...CHARGE_PERSO, paidBy: 'conjointe' }));
  });

  it('le schéma de charge est celui du foyer, pas un schéma appauvri', async () => {
    // Le détail privé vit sur `{montant, description, date}`. Le personnel
    // garde catégorie, lieu, enveloppe et répartition dérogatoire — c'est
    // précisément ce que cette option achète, et une charge qui les porte doit
    // passer.
    await assertSucceeds(session(VOUS).ref(chargePerso(espace, 'vous')).set({
      ...CHARGE_PERSO,
      categoryId: 'loisirs',
      categoryIcon: '🏃',
      destination: 'Salle de sport',
      envelope: 'sport',
      recurring: false,
      splitMode: 'prorata',
      splitOverride: { mode: '50-50' },
      heure: '18:30',
      location: { lat: 48.5, lng: -4.1 },
      timestamp: 1757000000000
    }));
  });

  it('refuse une charge sans montant', async () => {
    await assertFails(
      session(VOUS).ref(chargePerso(espace, 'vous')).set({ description: 'sans montant' }));
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * LA MARQUE DE RECONDUCTION DE LA POCHE (lot P1b)
   *
   * `periods/$periode/reconductedFrom` marque le mois COMMUN comme reconduit.
   * Elle ne peut pas servir au personnel : celui des deux qui ouvre
   * l'application le premier la réserve, et la poche de l'autre ne serait
   * alors JAMAIS reconduite — son abonnement disparaîtrait du mois, en
   * silence, tous les mois.
   */
  const marque = (qui) => `${espace}/personnel/${qui}/periods/2026-09/reconductedFrom`;

  it('chacun réserve la marque de SA poche', async () => {
    await assertSucceeds(session(VOUS).ref(marque('vous')).set('2026-08'));
    await assertSucceeds(session(CONJOINTE).ref(marque('conjointe')).set('2026-08'));
  });

  it("et personne ne réserve celle de l'autre — même sous aval", async () => {
    // L'aval ouvre la LECTURE, jamais l'écriture. Une marque posée chez l'autre
    // arrêterait sa reconduction sans qu'il l'ait demandé.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('aval/vous/actif').set(true);
    });
    await assertFails(session(CONJOINTE).ref(marque('vous')).set('2026-08'));
    await assertFails(session(VOUS).ref(marque('conjointe')).set('2026-08'));
  });

  it('la marque doit être un mois, pas une chaîne libre', async () => {
    // Même borne que celle du mois commun : c'est un mois source, et il sert à
    // décider si la reconduction a déjà eu lieu.
    for (const valeur of ['hier', '2026-8', '26-08', '', 42, true]) {
      await assertFails(session(VOUS).ref(marque('vous')).set(valeur));
    }
  });

  it("un tiers n'en réserve aucune", async () => {
    await assertFails(session(TIERS).ref(marque('vous')).set('2026-08'));
  });

  it("un set sur le conteneur de charges ne doit pas effacer les autres", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database()
        .ref(`${espace}/personnel/vous/periods/2026-09/variableCharges`)
        .set({ a: CHARGE_PERSO, b: { ...CHARGE_PERSO, description: 'Essence' } });
    });
    await assertFails(
      session(VOUS)
        .ref(`${espace}/personnel/vous/periods/2026-09/variableCharges`)
        .set({ c: CHARGE_PERSO }));
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE `.read` A DESCENDU D'UN CRAN — ce que cela casse, et ce que cela ne casse pas
 *
 * Le `.read` de la racine de `household` a été retiré et reposé sur chacun de
 * ses enfants directs. Deux conséquences, et les deux se mesurent ici plutôt
 * que de se déduire :
 *
 *   - la racine ne se lit plus d'un coup. C'est voulu — c'est la seule façon
 *     de cacher un sous-arbre — et c'est ce qui oblige la sauvegarde à lire
 *     nœud par nœud ;
 *   - chaque enfant doit rester lisible. Un enfant oublié en descendant le
 *     droit rendrait une partie de l'application aveugle, et rien d'autre ne
 *     le dirait.
 *
 * La liste des enfants est lue dans les règles — c'est l'ENTRÉE du contrôle —
 * mais ce qui est mesuré est ce que l'ÉMULATEUR autorise. Son témoin positif
 * est ci-dessous : une liste vide satisferait « tous lisibles » sans rien dire.
 */
describe.each(ESPACES)('Le droit de lecture descendu d\'un cran — %s', (espace) => {
  /** Les enfants directs, avec un nom concret pour le joker */
  const enfants = () => {
    const regles = JSON.parse(readFileSync('database.rules.json', 'utf8')).rules[espace];
    return Object.keys(regles)
      .filter((cle) => !cle.startsWith('.'))
      // `personnel` est le seul enfant qui ne porte pas le droit du foyer :
      // c'est l'objet de ce lot, et les cas ci-dessus le tiennent.
      .filter((cle) => cle !== 'personnel')
      // Le joker ne se lit pas par son nom de règle. Un nom quelconque mesure
      // ce qu'il gouverne : un nœud non déclaré reste lisible, comme avant.
      .map((cle) => (cle.startsWith('$') ? 'un-noeud-non-declare' : cle));
  };

  it('la racine ne se lit plus d\'un coup', async () => {
    await assertFails(session(VOUS).ref(espace).once('value'));
    await assertFails(session(CONJOINTE).ref(espace).once('value'));
  });

  it('chaque enfant direct reste lisible par les deux', async () => {
    for (const enfant of enfants()) {
      await assertSucceeds(session(VOUS).ref(`${espace}/${enfant}`).once('value'));
      await assertSucceeds(session(CONJOINTE).ref(`${espace}/${enfant}`).once('value'));
    }
  });

  it('LE TÉMOIN — le relevé des enfants n\'est pas vide', () => {
    // Sans lui, « tous lisibles » serait satisfait par zéro enfant : le cas
    // ci-dessus passerait au vert sur des règles qui n'accordent plus rien.
    expect(enfants().length).toBeGreaterThan(10);
  });

  it('un tiers ne lit aucun enfant, et une adresse non vérifiée non plus', async () => {
    // Ce que la racine tenait avant de perdre son droit. Le cas d'origine
    // lisait `household` en entier : depuis que cette lecture échoue pour
    // TOUT LE MONDE, il serait passé au vert sur une liste blanche vidée.
    for (const enfant of enfants()) {
      await assertFails(session(TIERS).ref(`${espace}/${enfant}`).once('value'));
      await assertFails(session(VOUS, false).ref(`${espace}/${enfant}`).once('value'));
    }
  });
});
