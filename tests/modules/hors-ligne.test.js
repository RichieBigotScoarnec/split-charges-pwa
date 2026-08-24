// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * L'application hors réseau, de bout en bout
 *
 * Signalé à l'usage, capture à l'appui : « je n'arrive pas à aller sur mon
 * application, pas de réseau ; il faudrait une solution en local sinon on ne
 * peut rien faire. »
 *
 * La page se chargeait pourtant — le service worker la garde. Mais chaque
 * lecture attendait dix secondes avant d'abandonner et chaque écriture quinze
 * avant d'échouer : une application complète, ouverte, et parfaitement
 * inutile. Le pire des deux mondes, puisqu'elle avait l'air de fonctionner.
 *
 * Ces contrôles portent sur `db.js`, le point de passage unique de tous les
 * accès à la base — les vingt-deux modules ne l'atteignent que par là.
 */

vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

const noter = vi.fn();
vi.mock('../../public/js/utils/diagnostics.js', () => ({
  noter: (...arguments_) => noter(...arguments_),
  exigerElement: (id) => document.getElementById(id),
  initDiagnostics: vi.fn(),
  rapport: vi.fn(() => '')
}));

const {
  initDatabase, setAuthenticatedUser, getDataRoot,
  signalerLiaison, liaisonRompue,
  dbGet, dbSet, dbUpdate, dbPush,
  saisiesEnAttente, rejouerFileDAttente, oublierHorsLigne, surFileModifiee
} = await import('../../public/js/db.js');

/**
 * Une fausse base Realtime Database
 *
 * Reproduit ce qui compte ici : une lecture qui rend une valeur, des écritures
 * qui la modifient, `push()` qui fabrique une clé sans réseau — et surtout le
 * comportement qui a motivé tout ce travail, une opération qui ne rend jamais
 * la main quand le serveur est hors d'atteinte.
 */
function baseFactice(contenuInitial = {}) {
  const contenu = structuredClone(contenuInitial);
  const journal = [];
  let muette = false;
  let rangDeCle = 0;
  let refusA = null;

  const lire = (chemin) => {
    let courant = contenu;
    for (const segment of chemin.split('/').filter(Boolean)) {
      if (!courant || typeof courant !== 'object') return null;
      courant = courant[segment];
    }
    return courant === undefined ? null : courant;
  };

  const poser = (chemin, valeur) => {
    const segments = chemin.split('/').filter(Boolean);
    const derniere = segments.pop();
    let courant = contenu;
    for (const segment of segments) {
      if (!courant[segment] || typeof courant[segment] !== 'object') courant[segment] = {};
      courant = courant[segment];
    }
    if (valeur === null) delete courant[derniere];
    else courant[derniere] = valeur;
  };

  // Une promesse qui ne se règle jamais : c'est exactement ce que fait
  // Realtime Database quand il ne joint pas son serveur. Il ne rejette pas, il
  // met en file — et l'`await` de l'appelant reste suspendu.
  const jamais = () => new Promise(() => {});

  const ref = (chemin) => ({
    key: chemin.split('/').filter(Boolean).pop() || null,
    once: () => (muette ? jamais() : Promise.resolve({ val: () => lire(chemin) })),
    set: (valeur) => {
      if (muette) return jamais();
      if (refusA && chemin.includes(refusA)) return Promise.reject(new Error('permission refusée'));
      journal.push({ type: 'set', chemin, donnees: valeur });
      poser(chemin, valeur);
      return Promise.resolve();
    },
    update: (lot) => {
      if (muette) return jamais();
      if (refusA && chemin.includes(refusA)) return Promise.reject(new Error('permission refusée'));
      journal.push({ type: 'update', chemin, donnees: lot });
      Object.keys(lot).forEach(cle => poser(`${chemin}/${cle}`, lot[cle]));
      return Promise.resolve();
    },
    push: () => ref(`${chemin}/cle${++rangDeCle}`)
  });

  return {
    ref, journal, contenu,
    couper() { muette = true; },
    retablir() { muette = false; },
    refuser(fragment) { refusA = fragment; },
    accepter() { refusA = null; }
  };
}

let base;

beforeEach(() => {
  window.localStorage.clear();
  base = baseFactice({
    household: {
      salaries: { vous: 2500, conjointe: 1800 },
      periods: {
        '2026-08': {
          variableCharges: {
            a1: { description: 'Café', amount: 3 },
            a2: { description: 'Pain', amount: 2 }
          }
        }
      }
    }
  });
  initDatabase(base);
  setAuthenticatedUser('uid-test', 'bigot.richard@gmail.com');
  signalerLiaison(true);
  surFileModifiee(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Amorce le miroir en lisant une fois en ligne, comme le ferait une ouverture normale */
async function amorcerLeMiroir() {
  await dbGet('salaries');
  await dbGet('periods/2026-08/variableCharges');
}

describe('État de la liaison', () => {
  it('la première annonce de « déconnecté » n\'est pas une panne', async () => {
    // `.info/connected` vaut `false` à la souscription et le reste le temps que
    // la liaison s'établisse, à chaque ouverture. Prendre cet instant pour une
    // coupure ferait servir le miroir au démarrage sur une connexion saine :
    // l'application afficherait des données périmées sans que rien ne le dise.
    const { signalerLiaison: signalerNeuf, liaisonRompue: rompueNeuf } =
      await import('../../public/js/db.js?neuf=1');

    signalerNeuf(false);
    expect(rompueNeuf()).toBe(false);
  });

  it('reconnaît la coupure une fois la liaison établie puis perdue', () => {
    signalerLiaison(true);
    signalerLiaison(false);
    expect(liaisonRompue()).toBe(true);

    signalerLiaison(true);
    expect(liaisonRompue()).toBe(false);
  });

  it('croit l\'appareil qui se sait hors réseau, même sans connexion préalable', async () => {
    // Mode avion à l'ouverture : la liaison ne s'établira jamais, et attendre
    // dix secondes par lecture pour l'apprendre est exactement la panne
    // signalée. `navigator.onLine` ne prouve rien quand il vaut `true` ; il
    // prouve, quand il vaut `false`.
    const { signalerLiaison: signalerNeuf, liaisonRompue: rompueNeuf } =
      await import('../../public/js/db.js?avion=1');

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    signalerNeuf(false);

    expect(rompueNeuf()).toBe(true);
  });

  it('une lecture restée sans réponse renseigne toutes les suivantes', async () => {
    // Sans cela, chaque étape de l'initialisation paierait son délai de garde :
    // une douzaine de lectures, deux minutes d'écran vide.
    await amorcerLeMiroir();
    base.couper();
    vi.useFakeTimers();

    const premiere = dbGet('salaries');
    await vi.advanceTimersByTimeAsync(11000);
    await premiere;

    expect(liaisonRompue()).toBe(true);
    // La suivante ne passe plus par le réseau : minuteurs figés, elle se règle
    // quand même.
    expect(await dbGet('periods/2026-08/variableCharges')).toBeTruthy();
  });

  it('un refus d\'écriture n\'est pas une coupure, et ne va pas en file', async () => {
    // Un refus est une réponse. Mettre l'écriture en file la ferait rejouer
    // indéfiniment, sans que rien ne le dise au formulaire.
    await amorcerLeMiroir();
    base.refuser('salaries');

    await expect(dbSet('salaries', { vous: 2600 })).rejects.toThrow(/permission/);
    expect(liaisonRompue()).toBe(false);
    expect(saisiesEnAttente()).toBe(0);
  });

  it('un refus de lecture n\'ouvre pas le miroir', async () => {
    // Le pendant en lecture, et le plus important des deux : servir le miroir
    // sur un refus montrerait à un compte les données que la base vient
    // précisément de lui refuser. Une liste blanche resserrée entre deux
    // ouvertures resterait alors sans effet sur l'appareil.
    await amorcerLeMiroir();
    initDatabase({
      ref: () => ({ once: () => Promise.reject(new Error('permission refusée')) })
    });

    await expect(dbGet('salaries')).rejects.toThrow(/permission/);
    expect(liaisonRompue()).toBe(false);
  });
});

describe('Lire hors réseau', () => {
  it('journalise chaque lecture servie par l\'appareil', async () => {
    // Sans cette trace, une application entièrement servie par le miroir est
    // indiscernable d'une application qui lit la base : toutes les étapes
    // réussissent, « FairSplit chargé » s'affiche, les chiffres sont justes —
    // et rien ne dit qu'ils datent. Signalé à l'usage, précisément comme ça.
    await amorcerLeMiroir();
    noter.mockClear();
    signalerLiaison(false);

    await dbGet('salaries');

    const trace = noter.mock.calls.find(([, message]) => message === 'lecture servie par le miroir');
    expect(trace, 'la lecture depuis le miroir doit laisser une trace').toBeTruthy();
    expect(trace[2].chemin).toBe('salaries');
    expect(trace[2].memoriseeLe, 'la date du miroir dit si les chiffres datent')
      .toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('sert la dernière valeur connue plutôt qu\'un écran vide', async () => {
    await amorcerLeMiroir();
    signalerLiaison(false);

    expect(await dbGet('salaries')).toEqual({ vous: 2500, conjointe: 1800 });
    expect(Object.keys(await dbGet('periods/2026-08/variableCharges'))).toHaveLength(2);
  });

  it('rend la main tout de suite, sans attendre le délai de garde', async () => {
    // C'est ce délai, répété à chaque étape de l'initialisation, qui rendait
    // l'application inutilisable : dix secondes par lecture, une douzaine de
    // lectures. Les minuteurs sont figés — si la lecture les attendait, elle
    // ne se règlerait jamais et le contrôle expirerait.
    await amorcerLeMiroir();
    signalerLiaison(false);
    vi.useFakeTimers();

    expect(await dbGet('salaries')).toEqual({ vous: 2500, conjointe: 1800 });
  });

  it('lève sur un chemin jamais lu, au lieu d\'annoncer un mois vide', async () => {
    // Rendre `null` afficherait un mois vide parfaitement crédible : c'est la
    // panne silencieuse que tout le reste de ce fichier cherche à empêcher.
    // L'étape échoue, le bandeau rouge la nomme.
    await amorcerLeMiroir();
    signalerLiaison(false);

    await expect(dbGet('periods/2026-09/variableCharges')).rejects.toThrow(/jamais été lu/);
  });

  it('se rabat sur le miroir quand la liaison lâche en cours de lecture', async () => {
    // La coupure n'est pas toujours annoncée avant : elle survient parfois
    // pendant. La lecture expire, et le miroir doit prendre le relais.
    await amorcerLeMiroir();
    base.couper();
    vi.useFakeTimers();

    const lecture = dbGet('salaries');
    await vi.advanceTimersByTimeAsync(11000);

    expect(await lecture).toEqual({ vous: 2500, conjointe: 1800 });
  });
});

describe('Saisir hors réseau', () => {
  it('garde la saisie sur l\'appareil au lieu de la perdre', async () => {
    await amorcerLeMiroir();
    signalerLiaison(false);

    const cle = await dbPush('periods/2026-08/variableCharges', {
      description: 'Bière', amount: 6.5
    });

    expect(cle).toBeTruthy();
    expect(saisiesEnAttente()).toBe(1);
    // Rien n'est parti : la fausse base n'a rien vu.
    expect(base.journal).toHaveLength(0);
  });

  it('la saisie apparaît immédiatement à la relecture', async () => {
    // Sans cela, la charge est bien gardée et reste invisible : on la
    // saisirait une seconde fois.
    await amorcerLeMiroir();
    signalerLiaison(false);

    await dbPush('periods/2026-08/variableCharges', { description: 'Bière', amount: 6.5 });

    const charges = await dbGet('periods/2026-08/variableCharges');
    expect(Object.keys(charges)).toHaveLength(3);
    expect(Object.values(charges).some(charge => charge.description === 'Bière')).toBe(true);
  });

  it('une correction hors réseau se voit, elle aussi', async () => {
    await amorcerLeMiroir();
    signalerLiaison(false);

    await dbUpdate('periods/2026-08/variableCharges/a1', { amount: 4.5 });

    const charges = await dbGet('periods/2026-08/variableCharges');
    expect(charges.a1.amount).toBe(4.5);
  });

  it('un salaire saisi hors réseau se relit', async () => {
    await amorcerLeMiroir();
    signalerLiaison(false);

    await dbSet('salaries', { vous: 2600, conjointe: 1800 });
    expect(await dbGet('salaries')).toEqual({ vous: 2600, conjointe: 1800 });
  });

  it('prévient l\'écran à chaque saisie mise de côté', async () => {
    // Aucun événement de connexion ne survient pendant la coupure : sans ce
    // signal, le bandeau annoncerait « 1 saisie » alors qu'il y en a trois.
    const comptes = [];
    surFileModifiee(nombre => comptes.push(nombre));

    await amorcerLeMiroir();
    signalerLiaison(false);

    await dbSet('salaries', { vous: 2600 });
    await dbSet('shareMode', 'prorata');

    expect(comptes).toEqual([1, 2]);
  });

  it('lève quand l\'appareil ne peut vraiment rien garder', async () => {
    // Un échec muet ferait croire la saisie enregistrée. Le formulaire doit
    // afficher son erreur.
    signalerLiaison(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    await expect(dbSet('salaries', { vous: 2600 })).rejects.toThrow(/ne peut pas garder/);
  });

  it('garde la saisie quand la liaison lâche pendant l\'écriture', async () => {
    // La coupure n'est pas annoncée : elle survient pendant. L'écriture expire
    // au bout de quinze secondes, et la saisie ne doit pas mourir avec elle.
    await amorcerLeMiroir();
    base.couper();
    vi.useFakeTimers();

    const ecriture = dbSet('salaries', { vous: 2600 });
    await vi.advanceTimersByTimeAsync(16000);
    await ecriture;

    expect(saisiesEnAttente()).toBe(1);
  });
});

describe('Le retour du réseau', () => {
  it('envoie les saisies dans leur ordre, puis vide la file', async () => {
    await amorcerLeMiroir();
    signalerLiaison(false);

    await dbPush('periods/2026-08/variableCharges', { description: 'Bière', amount: 6.5 });
    await dbUpdate('periods/2026-08/variableCharges/a1', { amount: 4.5 });
    await dbSet('salaries', { vous: 2600, conjointe: 1800 });

    signalerLiaison(true);
    const bilan = await rejouerFileDAttente();

    expect(bilan.envoyees).toBe(3);
    expect(bilan.restantes).toBe(0);
    expect(saisiesEnAttente()).toBe(0);

    expect(base.contenu.household.salaries).toEqual({ vous: 2600, conjointe: 1800 });
    expect(base.contenu.household.periods['2026-08'].variableCharges.a1.amount).toBe(4.5);
    expect(Object.keys(base.contenu.household.periods['2026-08'].variableCharges)).toHaveLength(3);
  });

  it('respecte l\'ordre : la correction ne part pas avant la saisie', async () => {
    // Rejouer hors d'ordre écraserait une correction par la version qu'elle
    // corrigeait. La file est un ordre, pas un sac.
    await amorcerLeMiroir();
    signalerLiaison(false);

    await dbSet('salaries', { vous: 2600 });
    await dbUpdate('salaries', { vous: 2700 });

    signalerLiaison(true);
    await rejouerFileDAttente();

    expect(base.journal.map(entree => entree.type)).toEqual(['set', 'update']);
    expect(base.contenu.household.salaries.vous).toBe(2700);
  });

  it('s\'arrête à la première qui résiste et garde la suite', async () => {
    await amorcerLeMiroir();
    signalerLiaison(false);

    await dbSet('salaries', { vous: 2600 });
    await dbSet('shareMode', 'prorata');
    await dbSet('customCategories', { c1: { name: 'Bar' } });

    signalerLiaison(true);
    base.refuser('shareMode');
    const bilan = await rejouerFileDAttente();

    expect(bilan.envoyees).toBe(1);
    expect(bilan.restantes).toBe(2);
    expect(bilan.erreur).toBeTruthy();

    // Et la suivante repart quand l'obstacle est levé.
    base.accepter();
    expect((await rejouerFileDAttente()).restantes).toBe(0);
  });

  it('n\'essaie pas avant que la session soit rétablie', async () => {
    // La liaison s'établit plusieurs secondes avant la restauration de la
    // session. Rejouer à cet instant ferait lever `getDataPath` et annoncerait
    // un échec là où il n'y a qu'une attente — à chaque ouverture, tant que la
    // file n'est pas vide.
    await amorcerLeMiroir();
    signalerLiaison(false);
    await dbSet('salaries', { vous: 2600 });

    setAuthenticatedUser(null);
    signalerLiaison(true);
    const bilan = await rejouerFileDAttente();

    expect(bilan.envoyees).toBe(0);
    expect(bilan.erreur, 'ne pas avoir essayé n\'est pas un échec').toBeNull();
    expect(base.journal).toHaveLength(0);

    // Et la saisie n'est pas perdue pour autant : elle part une fois la
    // session rétablie.
    setAuthenticatedUser('uid-test', 'bigot.richard@gmail.com');
    expect((await rejouerFileDAttente()).envoyees).toBe(1);
  });

  it('ne rejoue rien quand il n\'y a rien à rejouer', async () => {
    // Une reconnexion se produit à chaque sortie de veille.
    signalerLiaison(true);
    const bilan = await rejouerFileDAttente();

    expect(bilan.envoyees).toBe(0);
    expect(base.journal).toHaveLength(0);
  });

  it('n\'envoie pas deux fois la même saisie sur deux rejeux concurrents', async () => {
    await amorcerLeMiroir();
    signalerLiaison(false);
    await dbSet('salaries', { vous: 2600 });
    signalerLiaison(true);

    const [premier, second] = await Promise.all([rejouerFileDAttente(), rejouerFileDAttente()]);

    expect(premier.envoyees + second.envoyees).toBe(1);
    expect(base.journal.filter(entree => entree.chemin.endsWith('salaries'))).toHaveLength(1);
  });
});

describe('Ce qui reste sur l\'appareil', () => {
  it('la déconnexion efface le miroir du foyer', async () => {
    // Les montants d'un foyer n'ont rien à faire sur l'appareil d'un compte
    // qui n'y a plus accès.
    await amorcerLeMiroir();
    oublierHorsLigne();

    signalerLiaison(false);
    await expect(dbGet('salaries')).rejects.toThrow(/jamais été lu/);
  });

  it('le bac à sable ne partage rien avec le foyer', async () => {
    // Deux espaces de données, deux dossiers : une charge d'essai ne doit pas
    // pouvoir remonter dans les comptes du foyer.
    await amorcerLeMiroir();
    signalerLiaison(false);
    await dbSet('salaries', { vous: 9999 });
    expect(saisiesEnAttente()).toBe(1);

    setAuthenticatedUser('uid-essai', 'essai@fairsplit.test');
    if (getDataRoot() !== 'sandbox') return; // liste des comptes d'essai vide : rien à prouver

    expect(saisiesEnAttente()).toBe(0);
  });

  it('une lecture en ligne rafraîchit le miroir', async () => {
    await amorcerLeMiroir();

    base.contenu.household.salaries = { vous: 3000, conjointe: 1900 };
    await dbGet('salaries');

    signalerLiaison(false);
    expect(await dbGet('salaries')).toEqual({ vous: 3000, conjointe: 1900 });
  });

  it('une lecture en ligne montre quand même ce qui n\'est pas encore parti', async () => {
    // Le serveur ne l'a pas reçu : l'écran doit montrer ce que l'utilisateur a
    // saisi, pas ce qui est arrivé à destination.
    await amorcerLeMiroir();
    signalerLiaison(false);
    await dbUpdate('periods/2026-08/variableCharges/a1', { amount: 4.5 });

    signalerLiaison(true);
    expect((await dbGet('periods/2026-08/variableCharges')).a1.amount).toBe(4.5);
  });
});
