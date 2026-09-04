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
  saisiesEnAttente, rejouerFileDAttente, oublierHorsLigne, surFileModifiee,
  retenterLaLiaison, surLiaisonRetablie,
  dbGetAbsolu, dbSetAbsolu, dbUpdateAbsolu, dbPushAbsolu
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
  let refusDefinitif = false;

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

  const erreurRefus = () => {
    if (!refusDefinitif) return new Error('permission refusee');
    const echec = new Error('PERMISSION_DENIED: Permission denied');
    echec.code = 'PERMISSION_DENIED';
    return echec;
  };

  const ref = (chemin) => ({
    key: chemin.split('/').filter(Boolean).pop() || null,
    once: () => (muette ? jamais() : Promise.resolve({ val: () => lire(chemin) })),
    set: (valeur) => {
      if (muette) return jamais();
      if (refusA && chemin.includes(refusA)) return Promise.reject(erreurRefus());
      journal.push({ type: 'set', chemin, donnees: valeur });
      poser(chemin, valeur);
      return Promise.resolve();
    },
    update: (lot) => {
      if (muette) return jamais();
      if (refusA && chemin.includes(refusA)) return Promise.reject(erreurRefus());
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
    refuser(fragment) { refusA = fragment; refusDefinitif = false; },
    /**
     * Un refus tel que Firebase le formule vraiment
     *
     * `estRefusDefinitif` reconnaît le code et le message de Realtime
     * Database : un refus factice en français passerait pour une panne
     * transitoire, et le test ne prouverait rien.
     */
    refuserDefinitivement(fragment) {
      refusA = fragment;
      refusDefinitif = true;
    },
    accepter() { refusA = null; refusDefinitif = false; }
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
  surLiaisonRetablie(null);
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

describe('Le tout premier contact avec la base', () => {
  /**
   * Signale a l'usage : « l'acces est lent », « un Quick add qui met 20 ans a
   * s'ouvrir ». Mesure : ce n'est ni le journal (0,10 ms par entree) ni le
   * miroir (0,22 ms la lecture, a leur volume de donnees). C'est cette unique
   * attente — la premiere lecture paie l'integralite du delai de garde avant
   * que la coupure ne soit constatee, et les onze suivantes sont instantanees.
   */

  it('la première lecture n\'attend pas dix secondes pour conclure', async () => {
    const { initDatabase: poserNeuf, setAuthenticatedUser: authNeuf, dbGet: lireNeuf } =
      await import('../../public/js/db.js?premier=1');

    poserNeuf(base);
    authNeuf('uid-test', 'bigot.richard@gmail.com');
    base.couper();
    vi.useFakeTimers();

    const lecture = lireNeuf('salaries');
    const verdict = expect(lecture).rejects.toThrow(/sans réponse/);

    // Trois secondes doivent suffire : une liaison saine répond en ~130 ms.
    await vi.advanceTimersByTimeAsync(3200);
    await verdict;
  });

  it('une fois la base jointe, le délai complet reprend', async () => {
    // Une écriture perdue coûte une saisie : on ne l'abandonne pas au bout de
    // trois secondes sous prétexte que le réseau a hoqueté.
    const { initDatabase: poserNeuf, setAuthenticatedUser: authNeuf,
      signalerLiaison: signalerNeuf, dbGet: lireNeuf } =
      await import('../../public/js/db.js?complet=1');

    poserNeuf(base);
    authNeuf('uid-test', 'bigot.richard@gmail.com');
    signalerNeuf(true);
    base.couper();
    vi.useFakeTimers();

    const lecture = lireNeuf('salaries');
    let reglee = false;
    lecture.catch(() => { reglee = true; });

    await vi.advanceTimersByTimeAsync(4000);
    expect(reglee, 'à quatre secondes, une lecture ordinaire attend encore').toBe(false);

    await vi.advanceTimersByTimeAsync(7000);
    await expect(lecture).rejects.toThrow(/sans réponse/);
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

  it('la saisie rejouée ne disparaît pas si l\'on repasse hors ligne', async () => {
    // Le cas soulevé à l'usage. La file se vide à l'écriture — c'est voulu.
    // Mais le miroir, lui, garde ce que le serveur avait dit AVANT la saisie.
    // Sans report, la charge est en base, correctement, et s'évapore de l'écran
    // à la coupure suivante. Dans une application de comptes, c'est la pire des
    // frayeurs, et elle serait parfaitement injustifiée.
    await amorcerLeMiroir();
    signalerLiaison(false);

    const cle = await dbPush('periods/2026-08/variableCharges', {
      description: 'Restaurant', amount: 5
    });

    signalerLiaison(true);
    expect((await rejouerFileDAttente()).envoyees).toBe(1);
    expect(saisiesEnAttente(), 'la file doit bien s\'être vidée').toBe(0);

    // On repart hors ligne sans qu'aucune lecture n'ait rafraîchi le miroir.
    signalerLiaison(false);
    const charges = await dbGet('periods/2026-08/variableCharges');

    expect(Object.keys(charges)).toHaveLength(3);
    expect(charges[cle], 'la charge rejouée doit rester visible').toBeTruthy();
    expect(charges[cle].amount).toBe(5);
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
    // `categoryBudgets` et non `customCategories` : les trois listes du foyer
    // passent par une `transaction` posée hors de `db.js`, donc jamais par la
    // file — AUDIT-011 les en a écartées.
    await dbSet('categoryBudgets', { Courses: 600 });

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

  it('la déconnexion ne prend pas les saisies qui ne sont encore que là', async () => {
    // Le geste exact qui a piégé : base injoignable, une saisie de 5 € faite
    // en mode avion, et « Se reconnecter » — le seul remède connu — qui
    // exigeait de l'abandonner. On demandait de jeter ce qu'on emportait.
    //
    // Le miroir part, la file reste : elle repartira à la connexion suivante,
    // exactement comme après un rechargement.
    await amorcerLeMiroir();
    signalerLiaison(false);
    await dbSet('periods/2026-08/variableCharges/-abc', { amount: 5 });
    expect(saisiesEnAttente()).toBe(1);

    oublierHorsLigne();

    expect(saisiesEnAttente(), 'la saisie est partie avec le miroir').toBe(1);

    // `salaries` avait été lu et mémorisé par `amorcerLeMiroir` ; il ne rend
    // plus rien. La lecture ne lève pas ici — la file n'étant pas vide, le
    // miroir reste consultable — mais elle a perdu sa valeur, ce qui est
    // exactement ce qu'on veut : plus un montant du foyer sur l'appareil.
    expect(await dbGet('salaries'), 'un montant du foyer est resté sur l\'appareil').toBeNull();

    // Et elle repart pour de bon dès que la liaison revient.
    signalerLiaison(true);
    const { envoyees, restantes } = await rejouerFileDAttente();
    expect({ envoyees, restantes }).toEqual({ envoyees: 1, restantes: 0 });
    expect(base.journal.at(-1).donnees).toEqual({ amount: 5 });
  });

  it('efface l\'espace qu\'on lui nomme, pas l\'espace courant', async () => {
    // `auth.signOut()` déclenche le changement d\'état, qui ramène l\'espace
    // courant à `household` avant que la déconnexion n\'ait fini. Sans espace
    // nommé, un compte cantonné au bac à sable effaçait donc le miroir du
    // foyer et laissait le sien sur l\'appareil — l\'inverse exact de ce que
    // la déconnexion promet.
    await amorcerLeMiroir();

    // Le compte de test remplit le miroir du bac à sable.
    setAuthenticatedUser('uid-essai', 'testfairsplit@gmail.com');
    expect(getDataRoot()).toBe('sandbox');
    await dbGet('salaries');

    // La déconnexion a déjà eu lieu : l\'espace courant est retombé au foyer.
    setAuthenticatedUser(null);
    expect(getDataRoot()).toBe('household');

    // C\'est le bac à sable qu\'il faut oublier, et lui seul.
    oublierHorsLigne('sandbox');

    setAuthenticatedUser('uid-essai', 'testfairsplit@gmail.com');
    signalerLiaison(false);
    await expect(dbGet('salaries'), 'le miroir du bac à sable est resté')
      .rejects.toThrow(/jamais été lu/);

    // Et le foyer, qu\'on n\'a pas nommé, garde le sien.
    signalerLiaison(true);
    setAuthenticatedUser('uid-test', 'bigot.richard@gmail.com');
    signalerLiaison(false);
    expect(await dbGet('salaries'), 'le miroir du foyer a été effacé à sa place')
      .not.toBeNull();
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

describe('Sortir du hors ligne sans attendre Firebase', () => {
  /**
   * Signalé à l'usage, après des heures dans cet état : « le dernier
   * changement avec une base en local a produit ce problème dès que l'on se met
   * hors ligne ».
   *
   * Le diagnostic était juste sur un point décisif. Le mode hors ligne ne
   * savait en sortir que si Firebase annonçait de lui-même la reconnexion — il
   * ne retentait jamais rien. Un seul délai de garde dépassé, dix secondes sur
   * un réseau hésitant, et l'application se condamnait au miroir : chiffres
   * justes à l'écran, « FairSplit chargé », et rien d'autre qu'un bandeau pour
   * dire que plus rien ne partait.
   */

  it('retente d\'elle-même, et se rétablit quand la base répond', async () => {
    await amorcerLeMiroir();
    base.couper();
    signalerLiaison(false);
    expect(liaisonRompue()).toBe(true);

    base.retablir();
    expect(await retenterLaLiaison()).toBe(true);
    expect(liaisonRompue(), 'la liaison doit être rendue sans passer par Firebase').toBe(false);
  });

  it('la reprise réussie prévient l\'écran, qui referme et rejoue', async () => {
    await amorcerLeMiroir();
    signalerLiaison(false);
    await dbSet('salaries', { vous: 2600 });

    let prevenu = 0;
    surLiaisonRetablie(() => { prevenu += 1; });

    base.retablir();
    await retenterLaLiaison();

    expect(prevenu, 'sans ce signal, le bandeau resterait affiché').toBe(1);
  });

  it('une reprise qui échoue laisse tout en l\'état', async () => {
    await amorcerLeMiroir();
    base.couper();
    signalerLiaison(false);
    vi.useFakeTimers();

    const essai = retenterLaLiaison();
    await vi.advanceTimersByTimeAsync(6000);

    expect(await essai).toBe(false);
    expect(liaisonRompue()).toBe(true);
  });

  it('n\'attend pas dix secondes pour conclure « toujours rien »', async () => {
    // Un test de reprise aussi lent qu'une lecture ordinaire ne vaut pas mieux
    // que pas de test : on veut savoir, pas lire.
    await amorcerLeMiroir();
    base.couper();
    signalerLiaison(false);
    vi.useFakeTimers();

    const essai = retenterLaLiaison();
    await vi.advanceTimersByTimeAsync(5200);

    expect(await essai).toBe(false);
  });

  it('ne retente rien tant que la session n\'est pas rétablie', async () => {
    await amorcerLeMiroir();
    signalerLiaison(false);
    setAuthenticatedUser(null);

    expect(await retenterLaLiaison()).toBe(false);
  });

  it('la reprise programmée finit par aboutir toute seule', async () => {
    // Le cas réel : personne ne touche à rien, le réseau revient, et
    // l'application doit s'en apercevoir.
    await amorcerLeMiroir();
    base.couper();
    vi.useFakeTimers();
    signalerLiaison(false);

    base.retablir();
    // Le premier délai programmé est de quinze secondes.
    await vi.advanceTimersByTimeAsync(16000);

    expect(liaisonRompue(), 'la reprise programmée doit rendre la liaison').toBe(false);
  });

  it('une lecture restée sans réponse programme elle aussi une reprise', async () => {
    // Le chemin qui a piégé l'utilisateur : la liaison meurt pendant une
    // lecture, Firebase n'annonce jamais « déconnecté », et c'est le délai de
    // garde qui constate la coupure. Sans reprise programmée là aussi, rien ne
    // retente jamais — et l'application reste au miroir indéfiniment.
    await amorcerLeMiroir();
    base.couper();
    vi.useFakeTimers();

    const lecture = dbGet('salaries');
    await vi.advanceTimersByTimeAsync(11000);
    await lecture;
    expect(liaisonRompue()).toBe(true);

    base.retablir();
    await vi.advanceTimersByTimeAsync(16000);

    expect(liaisonRompue(), 'la coupure constatée doit programmer une reprise').toBe(false);
  });

  it('une liaison annoncée par Firebase annule la reprise en attente', async () => {
    await amorcerLeMiroir();
    base.couper();
    vi.useFakeTimers();
    signalerLiaison(false);

    signalerLiaison(true);
    base.retablir();
    await vi.advanceTimersByTimeAsync(400000);

    expect(liaisonRompue()).toBe(false);
  });
});

describe('Une saisie que le serveur refusera toujours ne bloque plus la file', () => {
  it('elle est écartée, annoncée, et la suivante passe', async () => {
    // La boucle s'arrête au premier échec — c'est le bon choix, « la file est
    // un ordre, pas un sac ». Mais rien ne séparait le transitoire du
    // définitif : une écriture que les règles rejetteront toujours restait en
    // tête, et tout ce qui avait été saisi ensuite s'empilait derrière sans
    // jamais partir.
    //
    // Le déclencheur est dans la CI elle-même : `deploy-rules` redéploie les
    // règles à chaque fusion sur main. Une saisie mise en file avant un
    // durcissement de `.validate` est refusée après.
    await amorcerLeMiroir();
    signalerLiaison(false);

    await dbSet('periods/2026-08/variableCharges/refusee', { description: 'Abîmée', amount: 1 });
    await dbSet('periods/2026-08/variableCharges/saine', { description: 'Café', amount: 3 });
    expect(saisiesEnAttente()).toBe(2);

    signalerLiaison(true);
    base.refuserDefinitivement('refusee');

    const bilan = await rejouerFileDAttente();

    // L'opération fautive est partie de la file, la suivante est passée.
    expect(bilan.refusees).toHaveLength(1);
    expect(bilan.refusees[0].chemin).toContain('refusee');
    expect(bilan.envoyees).toBe(1);
    expect(saisiesEnAttente()).toBe(0);
    expect(base.contenu.household.periods['2026-08'].variableCharges.saine)
      .toEqual({ description: 'Café', amount: 3 });
  });

  it('une panne passagère, elle, retient toujours la file', async () => {
    // Le pendant du précédent : distinguer les deux natures d'échec ne doit pas
    // faire jeter une saisie qu'une reconnexion aurait suffi à envoyer.
    await amorcerLeMiroir();
    signalerLiaison(false);

    await dbSet('periods/2026-08/variableCharges/premiere', { description: 'Pain', amount: 2 });
    await dbSet('periods/2026-08/variableCharges/seconde', { description: 'Lait', amount: 1 });

    signalerLiaison(true);
    base.refuser('premiere'); // refus quelconque, non reconnu comme définitif

    const bilan = await rejouerFileDAttente();

    expect(bilan.refusees).toHaveLength(0);
    expect(bilan.envoyees).toBe(0);
    expect(saisiesEnAttente()).toBe(2);
    expect(bilan.erreur).toBeTruthy();
  });

  it('la file repart entièrement quand le refus définitif est levé', async () => {
    // Un refus définitif écarte UNE opération, pas la file.
    await amorcerLeMiroir();
    signalerLiaison(false);

    await dbSet('periods/2026-08/variableCharges/refusee', { description: 'Abîmée', amount: 1 });
    await dbSet('periods/2026-08/variableCharges/a', { description: 'A', amount: 1 });
    await dbSet('periods/2026-08/variableCharges/b', { description: 'B', amount: 2 });

    signalerLiaison(true);
    base.refuserDefinitivement('refusee');

    const bilan = await rejouerFileDAttente();

    expect(bilan.envoyees).toBe(2);
    expect(bilan.refusees).toHaveLength(1);
    expect(saisiesEnAttente()).toBe(0);
  });
});

describe('UNE ENTRÉE FORGÉE DANS LA FILE NE PART PAS', () => {
  /**
   * Le contrôle du REJEU, et non celui du dépôt
   *
   * `tests/utils/file-non-forgeable.test.js` éprouve `operationRejouable` — la
   * fonction pure — sous tous ses angles. Mais rien n'éprouvait son APPEL dans
   * la boucle de rejeu : retirer les six lignes de `db.js` laissait les 2 341
   * contrôles verts, et l'entrée forgée repartait.
   *
   * C'est le seul endroit qui compte. La file vit en clair dans
   * `localStorage`, sur une origine que GitHub Pages partage entre tous les
   * dépôts d'un même compte : une autre page du compte y écrit sans la moindre
   * injection, et une extension de navigateur aussi. `empiler()` ne défend que
   * ce que l'application y met elle-même — pas ce qu'un tiers y dépose ensuite.
   *
   * La charge utile tient en une entrée : `{ type: 'set', chemin: '',
   * donnees: null }`. `getDataPath('')` rend `household`, l'espace entier, et
   * le rejeu part seul à la reconnexion, sous la session légitime du foyer,
   * sans rien redemander.
   */

  /** Dépose une entrée dans la file sans passer par `dbSet` */
  const forger = (operation) => {
    const cle = 'fairsplit:hors-ligne:household';
    const dossier = JSON.parse(window.localStorage.getItem(cle) || '{}');
    dossier.file = [...(dossier.file || []), { instant: Date.now(), ...operation }];
    window.localStorage.setItem(cle, JSON.stringify(dossier));
  };

  it('l\'effacement de la racine est écarté, et n\'atteint jamais la base', async () => {
    await amorcerLeMiroir();
    signalerLiaison(false);
    await dbSet('periods/2026-08/variableCharges/saine', { description: 'Café', amount: 3 });

    forger({ id: 'forgee', type: 'set', chemin: '', donnees: null });
    expect(saisiesEnAttente()).toBe(2);

    signalerLiaison(true);
    const avant = base.journal.length;
    const bilan = await rejouerFileDAttente();

    // Rien de ce qui est parti ne vise la racine.
    const partis = base.journal.slice(avant);
    expect(partis.map(e => e.chemin)).not.toContain('household');
    expect(partis.every(e => e.donnees !== null)).toBe(true);

    // Les charges du mois sont toujours là : l'espace n'a pas été vidé.
    expect(base.contenu.household.periods['2026-08'].variableCharges.a1)
      .toEqual({ description: 'Café', amount: 3 });

    // L'entrée forgée est retirée sans être comptée comme envoyée, et la
    // saisie légitime qui la suivait est bien partie.
    expect(bilan.envoyees).toBe(1);
    expect(saisiesEnAttente()).toBe(0);
  });

  it('AUDIT-011 — le remplacement de TOUT l\'historique est écarté au rejeu', async () => {
    // Le témoin de CÂBLAGE, et non celui de la fonction pure : la liste
    // blanche de `operationRejouable` doit être consultée DANS la boucle de
    // rejeu. `tests/utils/file-non-forgeable.test.js` éprouve la décision ;
    // ici on regarde ce qui atteint la base.
    //
    // La charge utile n'efface rien et ne vise pas la racine — les deux seuls
    // refus d'avant : elle nomme un nœud réel, `periods`, et lui donne une
    // valeur. Elle remplaçait donc tous les mois du foyer d'un coup.
    await amorcerLeMiroir();
    signalerLiaison(false);
    await dbSet('periods/2026-08/variableCharges/saine', { description: 'Café', amount: 3 });

    forger({ id: 'forgee', type: 'set', chemin: 'periods', donnees: { '2099-01': {} } });
    expect(saisiesEnAttente()).toBe(2);

    signalerLiaison(true);
    const avant = base.journal.length;
    const bilan = await rejouerFileDAttente();

    expect(base.journal.slice(avant).map(e => e.chemin)).not.toContain('household/periods');

    // L'historique du foyer est intact, et la saisie légitime est bien partie.
    expect(base.contenu.household.periods['2099-01']).toBeUndefined();
    expect(base.contenu.household.periods['2026-08'].variableCharges.a1)
      .toEqual({ description: 'Café', amount: 3 });
    expect(bilan.envoyees).toBe(1);
    expect(saisiesEnAttente()).toBe(0);
  });

  it('elle ne bloque pas la file non plus', async () => {
    // Écarter n'est pas s'arrêter : une entrée forgée en TÊTE ne doit pas
    // retenir les saisies réelles derrière elle.
    await amorcerLeMiroir();
    signalerLiaison(false);

    forger({ id: 'forgee-1', type: 'remove', chemin: 'periods/2026-08', donnees: null });
    await dbSet('periods/2026-08/variableCharges/x', { description: 'Pain', amount: 2 });
    await dbSet('periods/2026-08/variableCharges/y', { description: 'Lait', amount: 1 });

    signalerLiaison(true);
    const bilan = await rejouerFileDAttente();

    expect(bilan.envoyees).toBe(2);
    expect(bilan.erreur).toBeNull();
    expect(saisiesEnAttente()).toBe(0);
  });

  it('TÉMOIN — une saisie ordinaire déposée de la même façon part, elle', async () => {
    // Sans lui, une boucle qui écarterait TOUT passerait les deux contrôles
    // ci-dessus. Ce qui est refusé, c'est la forme de l'opération, pas le fait
    // qu'elle vienne du stockage.
    await amorcerLeMiroir();
    signalerLiaison(false);

    forger({
      id: 'deposee',
      type: 'set',
      chemin: 'periods/2026-08/variableCharges/z',
      donnees: { description: 'Thé', amount: 4 }
    });

    signalerLiaison(true);
    const bilan = await rejouerFileDAttente();

    expect(bilan.envoyees).toBe(1);
    expect(base.contenu.household.periods['2026-08'].variableCharges.z)
      .toEqual({ description: 'Thé', amount: 4 });
  });
});

describe('LE DÉTAIL PRIVÉ NE PASSE NI PAR LE MIROIR NI PAR LA FILE', () => {
  /**
   * La confidentialité vaut mieux qu'une saisie différée
   *
   * `dbGet` et ses voisines gardent tout : la dernière valeur lue de chaque
   * chemin dans le miroir, les écritures en attente dans la file. Les deux
   * vivent en clair dans `localStorage`, sur une origine que GitHub Pages
   * partage entre TOUS les dépôts du compte — l'audit a montré qu'une autre
   * page y écrit sans la moindre injection.
   *
   * Y déposer le détail d'une dépense privée la mettrait exactement là où elle
   * ne doit pas être. Les quatre accès absolus sautent donc les deux, et hors
   * ligne une écriture privée échoue FRANCHEMENT plutôt que d'attendre.
   *
   * Ce choix n'avait aucun témoin : les quatre fonctions n'étaient appelées par
   * aucun test. Leur passer le miroir et la file — deux lignes — n'aurait fait
   * tomber personne, et la fuite serait passée pour une amélioration
   * (« maintenant ça marche hors ligne »).
   */

  const CHEMIN = 'prive/vous/periods/2026-08/depenses';
  const DEPENSE = { libelle: 'Cadeau', montant: 60 };

  /** Tout ce que l'appareil garde, à plat */
  const stockage = () => JSON.stringify(window.localStorage);

  it('une écriture privée hors ligne échoue, et n\'entre pas dans la file', async () => {
    await amorcerLeMiroir();
    base.couper();
    signalerLiaison(false);
    vi.useFakeTimers();

    const ecriture = dbSetAbsolu(`${CHEMIN}/d1`, DEPENSE);
    const verdict = expect(ecriture).rejects.toThrow(/sans réponse/);
    await vi.advanceTimersByTimeAsync(16000);
    await verdict;

    expect(saisiesEnAttente()).toBe(0);
    expect(stockage()).not.toContain('Cadeau');
  });

  it('et un ajout privé non plus', async () => {
    await amorcerLeMiroir();
    base.couper();
    signalerLiaison(false);
    vi.useFakeTimers();

    const ajout = dbPushAbsolu(CHEMIN, DEPENSE);
    const verdict = expect(ajout).rejects.toThrow(/sans réponse/);
    await vi.advanceTimersByTimeAsync(16000);
    await verdict;

    expect(saisiesEnAttente()).toBe(0);
    expect(stockage()).not.toContain('Cadeau');
  });

  it('ni une suppression douce', async () => {
    await amorcerLeMiroir();
    base.couper();
    signalerLiaison(false);
    vi.useFakeTimers();

    const maj = dbUpdateAbsolu(`${CHEMIN}/d1`, { deleted: true });
    const verdict = expect(maj).rejects.toThrow(/sans réponse/);
    await vi.advanceTimersByTimeAsync(16000);
    await verdict;

    expect(saisiesEnAttente()).toBe(0);
  });

  it('une lecture privée ne laisse aucune trace sur l\'appareil', async () => {
    await amorcerLeMiroir();
    await dbSetAbsolu(`${CHEMIN}/d1`, DEPENSE);

    expect(await dbGetAbsolu(`${CHEMIN}/d1`)).toEqual(DEPENSE);
    // Ni le montant ni le libellé, ni même le chemin.
    expect(stockage()).not.toContain('Cadeau');
    expect(stockage()).not.toContain('prive/');
  });

  it('et elle ne se sert JAMAIS du miroir : coupée, elle échoue', async () => {
    // Le cœur du choix. Une lecture ordinaire sert la dernière valeur connue
    // quand le serveur ne répond pas — c'est ce qui rend l'application utilisable
    // hors réseau. Ici, non : rien n'a été gardé, donc il n'y a rien à servir,
    // et le contrôle l'exige plutôt que de le supposer.
    await amorcerLeMiroir();
    await dbSetAbsolu(`${CHEMIN}/d1`, DEPENSE);
    await dbGetAbsolu(`${CHEMIN}/d1`);

    base.couper();
    signalerLiaison(false);
    vi.useFakeTimers();

    const lecture = dbGetAbsolu(`${CHEMIN}/d1`);
    const verdict = expect(lecture).rejects.toThrow(/sans réponse/);
    await vi.advanceTimersByTimeAsync(11000);
    await verdict;
  });

  it('TÉMOIN — en ligne, les quatre écrivent et relisent bien', async () => {
    // Sans lui, quatre fonctions qui lèveraient toujours passeraient tout ce
    // qui précède.
    const cle = await dbPushAbsolu(CHEMIN, DEPENSE);
    expect(cle).toBeTruthy();

    await dbUpdateAbsolu(`${CHEMIN}/${cle}`, { montant: 80 });
    expect(await dbGetAbsolu(`${CHEMIN}/${cle}`)).toEqual({ ...DEPENSE, montant: 80 });

    await dbSetAbsolu(`${CHEMIN}/${cle}`, null);
    expect(await dbGetAbsolu(`${CHEMIN}/${cle}`)).toBeNull();
  });

  it('et le chemin n\'est JAMAIS préfixé par l\'espace de données', async () => {
    // C'est la raison d'être de ces quatre-là : `.write` cascade dans les
    // règles Firebase, et sous `household` — ouvert aux deux comptes — aucune
    // règle profonde n'aurait pu réserver une lecture à une seule personne.
    await dbSetAbsolu(`${CHEMIN}/d1`, DEPENSE);

    expect(base.contenu.prive.vous.periods['2026-08'].depenses.d1).toEqual(DEPENSE);
    expect(base.contenu.household.prive).toBeUndefined();
  });
});
