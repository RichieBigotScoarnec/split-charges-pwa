// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  cleDe,
  lireDossier,
  ecrireDossier,
  memoriserLecture,
  lectureMemorisee,
  empiler,
  operationsEnAttente,
  nombreEnAttente,
  retirerOperation,
  oublierTout,
  oublierLesLectures,
  integrerAuMiroir,
  appliquerOperations,
  cheminRelatif
} from '../../public/js/utils/miroir.js';

/**
 * Ce que l'appareil garde quand la base est injoignable
 *
 * Signalé à l'usage, capture à l'appui : « je n'arrive pas à aller sur mon
 * application, pas de réseau ; il faudrait une solution en local sinon on ne
 * peut rien faire. »
 *
 * Deux choses à tenir : la dernière valeur lue de chaque chemin, pour qu'un
 * téléphone hors réseau montre les charges du mois ; et les écritures qui
 * n'ont pas pu partir, dans leur ordre, pour qu'elles partent au retour du
 * réseau. Le cœur est `appliquerOperations` : sans lui, une charge saisie hors
 * réseau serait enregistrée sur l'appareil et resterait invisible à l'écran —
 * on la saisirait donc deux fois.
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Position d\'un chemin par rapport à un autre', () => {
  it('rend le reste du chemin quand il est dessous', () => {
    expect(cheminRelatif('periods/2026-08/variableCharges', 'periods/2026-08/variableCharges/abc'))
      .toBe('abc');
  });

  it('rend la chaîne vide pour le même chemin', () => {
    // À distinguer de `null` : « c'est ce chemin » et « ça n'a rien à voir »
    // ne conduisent pas au même traitement.
    expect(cheminRelatif('salaries', 'salaries')).toBe('');
  });

  it('rend null quand le chemin est ailleurs', () => {
    expect(cheminRelatif('periods/2026-08/variableCharges', 'salaries')).toBeNull();
    expect(cheminRelatif('periods/2026-08/variableCharges', 'periods/2026-07/variableCharges/x'))
      .toBeNull();
  });

  it('ne se laisse pas prendre à un préfixe qui n\'en est pas un', () => {
    // « periods/2026-0 » n'est pas un parent de « periods/2026-08 » : c'est un
    // début de texte. Comparer des chaînes plutôt que des segments écraserait
    // les charges d'un mois avec celles d'un autre.
    expect(cheminRelatif('periods/2026-0', 'periods/2026-08')).toBeNull();
  });

  it('traite la racine comme le parent de tout', () => {
    expect(cheminRelatif('', 'salaries')).toBe('salaries');
    expect(cheminRelatif('', '')).toBe('');
  });

  it('ignore les barres superflues', () => {
    expect(cheminRelatif('periods/', '/periods/2026-08')).toBe('2026-08');
  });
});

describe('Ce que voit une lecture pendant la coupure', () => {
  const charges = {
    a1: { description: 'Café', amount: 3 },
    a2: { description: 'Pain', amount: 2 }
  };

  it('sans écriture en attente, rend la valeur telle quelle', () => {
    expect(appliquerOperations(charges, 'periods/2026-08/variableCharges', [])).toBe(charges);
    expect(appliquerOperations(charges, 'periods/2026-08/variableCharges', null)).toBe(charges);
  });

  it('fait apparaître une charge saisie hors réseau', () => {
    // Le cas signalé : sans cela, la saisie est bien gardée sur l'appareil et
    // reste invisible à l'écran, puisque le miroir date d'avant.
    const vu = appliquerOperations(charges, 'periods/2026-08/variableCharges', [{
      id: 'op1', type: 'set',
      chemin: 'periods/2026-08/variableCharges/a3',
      donnees: { description: 'Bière', amount: 6.5 }
    }]);

    expect(Object.keys(vu)).toHaveLength(3);
    expect(vu.a3.description).toBe('Bière');
    // L'original n'est pas modifié : le miroir enregistré doit rester le
    // reflet de ce que le serveur a dit, pas de ce qu'on y a ajouté depuis.
    expect(Object.keys(charges)).toHaveLength(2);
  });

  it('applique une correction faite hors réseau', () => {
    const vu = appliquerOperations(charges, 'periods/2026-08/variableCharges', [{
      id: 'op1', type: 'update',
      chemin: 'periods/2026-08/variableCharges/a1',
      donnees: { amount: 4, description: 'Café allongé' }
    }]);

    expect(vu.a1.amount).toBe(4);
    expect(vu.a1.description).toBe('Café allongé');
    expect(vu.a2.amount).toBe(2);
  });

  it('fait disparaître ce qu\'un null supprime', () => {
    // C'est ainsi que s'écrit le retrait d'un lieu — et une charge qu'on
    // croyait retirée et qui réapparaît hors réseau serait pire que rien.
    const vu = appliquerOperations(charges, 'periods/2026-08/variableCharges', [{
      id: 'op1', type: 'update',
      chemin: 'periods/2026-08/variableCharges/a1',
      donnees: { location: null }
    }]);

    expect(vu.a1).not.toHaveProperty('location');
  });

  it('lit une clé d\'update qui contient elle-même des barres', () => {
    // Firebase l'accepte, et la corbeille s'en sert.
    const vu = appliquerOperations({ '2026-08': charges }, 'periods', [{
      id: 'op1', type: 'update',
      chemin: 'periods',
      donnees: { '2026-08/a1/deleted': true }
    }]);

    expect(vu['2026-08'].a1.deleted).toBe(true);
  });

  it('ignore une écriture qui porte sur un autre chemin', () => {
    const vu = appliquerOperations(charges, 'periods/2026-08/variableCharges', [
      { id: 'op1', type: 'set', chemin: 'salaries', donnees: { vous: 2500 } },
      { id: 'op2', type: 'set', chemin: 'periods/2026-07/variableCharges/z', donnees: {} }
    ]);

    expect(vu).toEqual(charges);
  });

  it('descend dans une écriture qui englobe le chemin lu', () => {
    // On lit les charges d'un mois pendant qu'une écriture porte sur le mois
    // entier : la valeur à afficher est dedans.
    const vu = appliquerOperations(null, 'periods/2026-08/variableCharges', [{
      id: 'op1', type: 'set',
      chemin: 'periods/2026-08',
      donnees: { variableCharges: charges, fixedCharges: {} }
    }]);

    expect(vu).toEqual(charges);
  });

  it('respecte l\'ordre : la dernière écriture l\'emporte', () => {
    // Une charge saisie puis corrigée hors réseau doit s'afficher corrigée.
    const vu = appliquerOperations(null, 'periods/2026-08/variableCharges', [
      { id: 'op1', type: 'set', chemin: 'periods/2026-08/variableCharges/a3', donnees: { amount: 6 } },
      { id: 'op2', type: 'update', chemin: 'periods/2026-08/variableCharges/a3', donnees: { amount: 7.5 } }
    ]);

    expect(vu.a3.amount).toBe(7.5);
  });

  it('part de rien quand le chemin n\'a jamais été lu', () => {
    const vu = appliquerOperations(null, 'periods/2026-09/variableCharges', [{
      id: 'op1', type: 'set',
      chemin: 'periods/2026-09/variableCharges/n1',
      donnees: { description: 'Bière' }
    }]);

    expect(vu.n1.description).toBe('Bière');
  });

  it('écarte une opération abîmée sans emporter les autres', () => {
    const vu = appliquerOperations(charges, 'periods/2026-08/variableCharges', [
      null,
      { type: 'set' },
      { id: 'x', type: 'inconnu', chemin: 'periods/2026-08/variableCharges/a9', donnees: {} },
      { id: 'op1', type: 'set', chemin: 'periods/2026-08/variableCharges/a3', donnees: { amount: 6 } }
    ]);

    expect(vu.a3.amount).toBe(6);
    expect(vu).not.toHaveProperty('a9');
  });
});

describe('Le miroir des lectures', () => {
  it('rend ce qui a été mémorisé', () => {
    memoriserLecture('household', 'salaries', { vous: 2500, conjointe: 1800 });

    const relu = lectureMemorisee('household', 'salaries');
    expect(relu.valeur).toEqual({ vous: 2500, conjointe: 1800 });
    expect(relu.majLe).toBeGreaterThan(0);
  });

  it('distingue « jamais lu » de « lu et vide »', () => {
    // La distinction décide de tout : sur un chemin jamais mémorisé,
    // l'application doit dire qu'elle ne sait pas, et non afficher un mois vide
    // parfaitement crédible.
    expect(lectureMemorisee('household', 'periods/2026-09/variableCharges')).toBeNull();

    memoriserLecture('household', 'periods/2026-09/variableCharges', null);
    expect(lectureMemorisee('household', 'periods/2026-09/variableCharges')).toEqual({
      valeur: null,
      majLe: expect.any(Number)
    });
  });

  it('ne mêle jamais le foyer et le bac à sable', () => {
    memoriserLecture('household', 'salaries', { vous: 2500 });
    memoriserLecture('sandbox', 'salaries', { vous: 1 });

    expect(lectureMemorisee('household', 'salaries').valeur).toEqual({ vous: 2500 });
    expect(lectureMemorisee('sandbox', 'salaries').valeur).toEqual({ vous: 1 });
    expect(cleDe('household')).not.toBe(cleDe('sandbox'));
  });

  it('ignore un contenu illisible plutôt que de le deviner', () => {
    window.localStorage.setItem(cleDe('household'), 'ceci n\'est pas du JSON');
    expect(lireDossier('household')).toEqual({ version: 1, chemins: {}, file: [] });
  });

  it('ignore un format d\'une autre version', () => {
    // Une file d'attente mal relue rejouerait des écritures fausses sur des
    // comptes : mieux vaut tout oublier que se tromper.
    window.localStorage.setItem(cleDe('household'), JSON.stringify({
      version: 99, chemins: { salaries: { v: { vous: 1 }, t: 1 } }, file: [{ id: 'x' }]
    }));

    expect(lireDossier('household').file).toEqual([]);
    expect(lectureMemorisee('household', 'salaries')).toBeNull();
  });

  it('reste utilisable quand le stockage est hors d\'atteinte', () => {
    // Navigation privée sous Safari : `localStorage` lève. L'application doit
    // rester utilisable en ligne, sans hors-ligne.
    //
    // L'espion vise `Storage.prototype` et non l'objet `localStorage` :
    // celui-ci est un proxy dans jsdom, et y définir une propriété ne remplace
    // rien. Posé sur l'instance, ce contrôle passait sans jamais lever — donc
    // sans rien prouver.
    memoriserLecture('household', 'salaries', { vous: 2500 });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('refusé');
    });

    expect(() => lireDossier('household')).not.toThrow();
    expect(lireDossier('household').file).toEqual([]);
    expect(lectureMemorisee('household', 'salaries')).toBeNull();
  });
});

describe('La file d\'attente des écritures', () => {
  it('garde les écritures dans leur ordre de saisie', () => {
    empiler('household', { type: 'set', chemin: 'a', donnees: 1 }, 'op1');
    empiler('household', { type: 'update', chemin: 'b', donnees: { x: 2 } }, 'op2');

    expect(operationsEnAttente('household').map(operation => operation.id)).toEqual(['op1', 'op2']);
    expect(nombreEnAttente('household')).toBe(2);
  });

  it('refuse ce qui ne se rejoue pas', () => {
    expect(empiler('household', { type: 'push', chemin: 'a', donnees: 1 })).toBeNull();
    expect(empiler('household', { type: 'set', chemin: 42, donnees: 1 })).toBeNull();
    expect(empiler('household', null)).toBeNull();
    expect(nombreEnAttente('household')).toBe(0);
  });

  it('fixe `undefined` en `null`, que Firebase refuse', () => {
    const gardee = empiler('household', { type: 'set', chemin: 'a', donnees: undefined }, 'op1');
    expect(gardee.donnees).toBeNull();
  });

  it('retire une écriture une fois partie', () => {
    empiler('household', { type: 'set', chemin: 'a', donnees: 1 }, 'op1');
    empiler('household', { type: 'set', chemin: 'b', donnees: 2 }, 'op2');

    expect(retirerOperation('household', 'op1')).toBe(true);
    expect(operationsEnAttente('household').map(operation => operation.id)).toEqual(['op2']);
    expect(retirerOperation('household', 'inconnue')).toBe(false);
  });

  it('survit à un rechargement de la page', () => {
    // C'est toute la raison d'être du stockage : la file interne de Firebase,
    // elle, ne vit qu'en mémoire et disparaît au rechargement.
    empiler('household', { type: 'set', chemin: 'a', donnees: 1 }, 'op1');
    expect(nombreEnAttente('household')).toBe(1);

    // Rien à simuler : une autre lecture du même stockage suffit à le prouver.
    expect(operationsEnAttente('household')[0].donnees).toBe(1);
  });

  it('`oublierTout` efface tout d\'un espace, et de lui seul', () => {
    memoriserLecture('household', 'salaries', { vous: 2500 });
    empiler('household', { type: 'set', chemin: 'a', donnees: 1 }, 'op1');
    memoriserLecture('sandbox', 'salaries', { vous: 1 });

    oublierTout('household');

    expect(nombreEnAttente('household')).toBe(0);
    expect(lectureMemorisee('household', 'salaries')).toBeNull();
    expect(lectureMemorisee('sandbox', 'salaries').valeur).toEqual({ vous: 1 });
  });
});

describe('Ce que la déconnexion emporte, et ce qu\'elle laisse', () => {
  it('efface les lectures, garde les saisies qui ne sont encore que là', () => {
    // Les deux moitiés du dossier n'ont pas la même nature. Le miroir est une
    // copie : ce qu'il contient est en base, l'effacer ne perd rien. La file
    // est un original — personne d'autre ne détient ce qu'elle porte.
    //
    // La déconnexion effaçait les deux, et le piège se refermait : la base
    // injoignable, se reconnecter était le seul remède connu, et l'appliquer
    // coûtait précisément la saisie qu'on cherchait à sauver.
    memoriserLecture('household', 'salaries', { vous: 2500 });
    empiler('household', { type: 'set', chemin: 'periods/2026-08/x', donnees: 5 }, 'op1');

    oublierLesLectures('household');

    expect(lectureMemorisee('household', 'salaries'), 'un montant du foyer est resté sur l\'appareil').toBeNull();
    expect(nombreEnAttente('household'), 'la saisie a été emportée avec le miroir').toBe(1);
    expect(operationsEnAttente('household')[0].donnees).toBe(5);
  });

  it('n\'écrit rien du tout quand il n\'y a rien à garder', () => {
    // Sans file, le dossier entier part : laisser une coquille vide dans le
    // stockage d'un appareil qu'on quitte n'a aucun objet.
    memoriserLecture('household', 'salaries', { vous: 2500 });

    oublierLesLectures('household');

    expect(window.localStorage.getItem(cleDe('household'))).toBeNull();
  });

  it('ne touche pas à l\'autre espace de données', () => {
    memoriserLecture('household', 'salaries', { vous: 2500 });
    empiler('household', { type: 'set', chemin: 'a', donnees: 1 }, 'op1');
    memoriserLecture('sandbox', 'salaries', { vous: 1 });

    oublierLesLectures('household');

    expect(lectureMemorisee('sandbox', 'salaries').valeur).toEqual({ vous: 1 });
  });
});

describe('Quand le stockage est plein', () => {
  it('sacrifie le miroir, jamais la file', () => {
    // Le quota atteint n'est pas un cas exotique : c'est ce qui arrive après
    // quelques années de charges. Le miroir se reconstitue à la première
    // connexion ; la file, elle, contient des saisies introuvables ailleurs.
    memoriserLecture('household', 'vieux', { beaucoup: 'de données' }, 1000);
    memoriserLecture('household', 'recent', { encore: 'plus' }, 2000);

    const vrai = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function remplace(cle, valeur) {
      // Tout ce qui porte encore un chemin mémorisé est refusé.
      if (valeur.includes('"chemins":{"')) throw new Error('QuotaExceededError');
      return vrai.call(this, cle, valeur);
    });

    const gardee = empiler('household', { type: 'set', chemin: 'a', donnees: 1 }, 'op1');

    expect(gardee, 'la saisie doit être gardée coûte que coûte').not.toBeNull();
    expect(nombreEnAttente('household')).toBe(1);
    expect(lectureMemorisee('household', 'vieux')).toBeNull();
  });

  it('le dit quand il ne peut vraiment rien garder', () => {
    // Un refus muet ferait croire la saisie enregistrée. L'appelant doit
    // pouvoir lever.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(empiler('household', { type: 'set', chemin: 'a', donnees: 1 }, 'op1')).toBeNull();
    expect(ecrireDossier('household', { chemins: {}, file: [] })).toBe(false);
  });
});

describe('Une écriture qui vient de partir pour de bon', () => {
  /**
   * Question posée à l'usage : « une fois la donnée mise en base, elle doit
   * être enlevée en local, non ? »
   *
   * La file, oui — elle se vide à chaque écriture réussie. Le miroir, lui,
   * doit au contraire *recevoir* la valeur : il garde ce que le serveur a dit
   * avant la saisie, et la file qui la compensait vient d'être vidée. Sans ce
   * report, la charge est en base, correctement, et disparaît pourtant de
   * l'écran dès qu'on repasse hors ligne.
   */

  const operation = {
    id: 'op1', type: 'set',
    chemin: 'periods/2026-08/variableCharges/neuve',
    donnees: { description: 'Restaurant', amount: 5 }
  };

  it('se retrouve dans le miroir du chemin qui la contient', () => {
    memoriserLecture('household', 'periods/2026-08/variableCharges', {
      a1: { description: 'Café', amount: 3 }
    });

    expect(integrerAuMiroir('household', operation)).toBe(true);

    const relu = lectureMemorisee('household', 'periods/2026-08/variableCharges');
    expect(Object.keys(relu.valeur)).toHaveLength(2);
    expect(relu.valeur.neuve.amount).toBe(5);
  });

  it('ne touche pas aux chemins qu\'elle ne concerne pas', () => {
    memoriserLecture('household', 'salaries', { vous: 2500 });
    memoriserLecture('household', 'periods/2026-07/variableCharges', { z: { amount: 1 } });

    integrerAuMiroir('household', operation);

    expect(lectureMemorisee('household', 'salaries').valeur).toEqual({ vous: 2500 });
    expect(Object.keys(lectureMemorisee('household', 'periods/2026-07/variableCharges').valeur))
      .toHaveLength(1);
  });

  it('ne change pas la date de mémorisation', () => {
    // Elle dit quand le serveur a parlé pour la dernière fois, et ce n'est pas
    // ce qui vient de se passer : c'est nous qui avons écrit.
    memoriserLecture('household', 'periods/2026-08/variableCharges', { a1: {} }, 1000);

    integrerAuMiroir('household', operation);

    expect(lectureMemorisee('household', 'periods/2026-08/variableCharges').majLe).toBe(1000);
  });

  it('reporte aussi une correction', () => {
    memoriserLecture('household', 'periods/2026-08/variableCharges', {
      a1: { description: 'Café', amount: 3 }
    });

    integrerAuMiroir('household', {
      id: 'op2', type: 'update',
      chemin: 'periods/2026-08/variableCharges/a1',
      donnees: { amount: 4.5 }
    });

    expect(lectureMemorisee('household', 'periods/2026-08/variableCharges').valeur.a1.amount)
      .toBe(4.5);
  });

  it('ne fait rien, et le dit, quand rien n\'est mémorisé', () => {
    expect(integrerAuMiroir('household', operation)).toBe(false);
  });

  it('n\'écrit pas le stockage pour rien quand aucun chemin n\'est concerné', () => {
    // Réenregistrer tout le dossier à chaque écriture rejouée coûterait un
    // `JSON.stringify` de l'ensemble du miroir par saisie — sur un téléphone,
    // pour ne rien changer.
    memoriserLecture('household', 'salaries', { vous: 2500 });
    memoriserLecture('household', 'customCategories', { c1: { name: 'Bar' } });

    let ecritures = 0;
    const vrai = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function compte(cle, valeur) {
      ecritures += 1;
      return vrai.call(this, cle, valeur);
    });

    expect(integrerAuMiroir('household', operation)).toBe(false);
    expect(ecritures, 'aucune écriture ne doit avoir lieu').toBe(0);
  });
});
