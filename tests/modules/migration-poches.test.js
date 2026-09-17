// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Les dépenses personnelles rejoignent leur poche
 *
 * Le lot P1a a posé le mur sans déplacer de donnée : les dépenses
 * `perimetre: 'solo'` vivaient encore sous `periods/`, donc lisibles par
 * l'autre personne SANS AUCUN AVAL. La réalité était l'inverse de la crainte —
 * ce qu'on croyait exposé était protégé, ce qu'on saisissait réellement ne
 * l'était pas.
 *
 * Ces cas tiennent les trois propriétés dont la migration dépend, et une
 * quatrième qui n'est pas une propriété du code mais une conséquence du mur :
 * personne ne peut migrer les deux poches, donc chaque compte migre la sienne.
 */

const dbGet = vi.fn();
const dbUpdate = vi.fn(() => Promise.resolve());
const liaisonRompue = vi.fn(() => false);
const saisiesEnAttente = vi.fn(() => 0);

vi.mock('../../public/js/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // Accesseurs PARESSEUX : le facteur d'un double `async` est invoqué avant les
  // `const` du fichier, et une référence directe y tombe en zone morte
  // temporelle — Vitest sert alors le module ORIGINAL, en silence.
  dbGet: (...args) => dbGet(...args),
  dbUpdate: (...args) => dbUpdate(...args),
  liaisonRompue: (...args) => liaisonRompue(...args),
  saisiesEnAttente: (...args) => saisiesEnAttente(...args)
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

const { planMigration, migrerMaPoche } = await import('../../public/js/modules/migration-poches.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** Le commun tel qu'il est au sortir de P1a : trois dépenses solo dedans */
const COMMUN = () => ({
  '2026-09': {
    salaries: { vous: 3000, conjointe: 2000 },
    variableCharges: {
      courses: { description: 'Courses', amount: 40, paidBy: 'vous' },
      sport: { description: 'Sport', amount: 30, paidBy: 'vous', perimetre: 'solo' },
      coiffeur: {
        description: 'Coiffeur', amount: 45, paidBy: 'conjointe', perimetre: 'solo'
      }
    },
    fixedCharges: {
      loyer: { description: 'Loyer', amount: 900, paidBy: 'vous' },
      abo: { description: 'Abonnement', amount: 12, paidBy: 'vous', perimetre: 'solo' }
    }
  },
  // Écriture accidentelle : le nœud `periods` en a hébergé.
  undefined: { variableCharges: { x: { amount: 1, paidBy: 'vous', perimetre: 'solo' } } }
});

beforeEach(() => {
  resetState();
  dbGet.mockReset();
  dbUpdate.mockClear();
  liaisonRompue.mockReturnValue(false);
  saisiesEnAttente.mockReturnValue(0);
  setState('emplacementCourant', 'vous');
});

describe('Le plan, éprouvé seul', () => {
  it('sort MES dépenses personnelles du commun, et elles seules', () => {
    const { ecritures, nombre, restantes } = planMigration({ commun: COMMUN(), moi: 'vous' });

    expect(nombre).toBe(2);
    expect(restantes).toBe(1);
    expect(ecritures['personnel/vous/periods/2026-09/variableCharges/sport'])
      .toMatchObject({ description: 'Sport', amount: 30 });
    expect(ecritures['personnel/vous/periods/2026-09/fixedCharges/abo'])
      .toMatchObject({ description: 'Abonnement', amount: 12 });
  });

  it('ATOMIQUE : la destination et l\'origine partent ensemble', () => {
    // En deux écritures, un échec entre les deux laisserait la charge comptée
    // deux fois — dans les deux poches — ou perdue.
    const { ecritures } = planMigration({ commun: COMMUN(), moi: 'vous' });

    expect(ecritures['periods/2026-09/variableCharges/sport']).toBeNull();
    expect(ecritures['periods/2026-09/fixedCharges/abo']).toBeNull();
  });

  it('ne touche PAS la poche de l\'autre : on n\'a pas le droit d\'y écrire', () => {
    const { ecritures } = planMigration({ commun: COMMUN(), moi: 'vous' });

    expect(Object.keys(ecritures).some(chemin => chemin.includes('conjointe'))).toBe(false);
    expect(ecritures).not.toHaveProperty('periods/2026-09/variableCharges/coiffeur');
  });

  it('laisse les charges communes exactement où elles sont', () => {
    const { ecritures } = planMigration({ commun: COMMUN(), moi: 'vous' });

    expect(Object.keys(ecritures).some(chemin => chemin.includes('courses'))).toBe(false);
    expect(Object.keys(ecritures).some(chemin => chemin.includes('loyer'))).toBe(false);
  });

  it('ignore les clés de période qui n\'en sont pas', () => {
    const { ecritures } = planMigration({ commun: COMMUN(), moi: 'vous' });

    expect(Object.keys(ecritures).some(chemin => chemin.includes('undefined'))).toBe(false);
  });

  it('le compte change de côté pour l\'autre compte', () => {
    // Le cas symétrique, sur le MÊME jeu d'essai : c'est lui qui prouve que le
    // filtre lit `moi` et non un nom en dur.
    const { nombre, restantes, ecritures } = planMigration({
      commun: COMMUN(), moi: 'conjointe'
    });

    expect(nombre).toBe(1);
    expect(restantes).toBe(2);
    expect(ecritures['personnel/conjointe/periods/2026-09/variableCharges/coiffeur'])
      .toMatchObject({ description: 'Coiffeur' });
  });

  it('IDEMPOTENTE : un commun déjà migré ne donne plus rien', () => {
    // La lecture porte sur le nœud COMMUN, jamais sur le nœud fusionné : une
    // charge déplacée n'y est plus. Sans cela, chaque ouverture réécrirait la
    // poche avec la valeur du commun — et y ramènerait une charge que la
    // dernière édition avait changée.
    const commun = COMMUN();
    delete commun['2026-09'].variableCharges.sport;
    delete commun['2026-09'].fixedCharges.abo;

    expect(planMigration({ commun, moi: 'vous' }).nombre).toBe(0);
  });

  it('une charge solo sans propriétaire établi ne bouge pas', () => {
    // `perimetre.js` tient qu'une charge solo dont le payeur n'est pas une
    // personne du foyer n'a pas de propriétaire. La fabrique lui rend alors le
    // chemin commun, le déplacement est vide, et aucun traitement spécial n'est
    // écrit — le cas ne se distingue pas d'une charge commune.
    const { nombre, restantes } = planMigration({
      commun: {
        '2026-09': {
          variableCharges: { flou: { amount: 5, paidBy: 'personne', perimetre: 'solo' } }
        }
      },
      moi: 'vous'
    });

    expect(nombre).toBe(0);
    expect(restantes).toBe(0);
  });

  it.each([
    ['un commun absent', { commun: null }],
    ['un commun qui n\'est pas un objet', { commun: 'periods' }],
    ['un emplacement inconnu', { moi: '' }]
  ])('ne rend aucune écriture sur %s', (_, remplacement) => {
    expect(planMigration({ commun: COMMUN(), moi: 'vous', ...remplacement }).nombre).toBe(0);
  });
});

describe('Ce que la migration fait réellement en base', () => {
  /**
   * Elle rend `{ nombre, instantane }` : elle est la première étape de
   * l'ouverture à lire `periods`, et `lecture-unique.spec.js` tient qu'une
   * ouverture ne lit chaque chemin qu'une fois — `periods` pèse 96 % des octets
   * lus à douze mois de données. Le nœud FUSIONNÉ étant invariant sous cette
   * migration (une charge change de chemin, jamais d'existence), l'instantané
   * pris avant les écritures décrit l'état d'après.
   */
  const migrer = async () => (await migrerMaPoche()).nombre;

  it('lit le COMMUN et écrit tout en une seule mise à jour', async () => {
    dbGet.mockResolvedValue(COMMUN());

    expect(await migrer()).toBe(2);

    expect(dbGet).toHaveBeenCalledWith('periods');
    expect(dbUpdate).toHaveBeenCalledTimes(1);

    const [chemin, ecritures] = dbUpdate.mock.calls[0];
    // `undefined` en premier argument : un lot multi-chemins, appliqué à la
    // racine de l'espace de données — tout ou rien.
    expect(chemin).toBeUndefined();
    expect(Object.keys(ecritures)).toHaveLength(4);
  });

  it('n\'écrit rien quand il n\'y a rien à déplacer', async () => {
    const commun = COMMUN();
    delete commun['2026-09'].variableCharges.sport;
    delete commun['2026-09'].fixedCharges.abo;
    dbGet.mockResolvedValue(commun);

    expect(await migrer()).toBe(0);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it('RENONCE hors ligne, sans même lire', async () => {
    // `dbGet` ne lève pas hors ligne : il sert le miroir. Une migration décidée
    // sur une valeur mémorisée déplacerait des charges d'après un instantané
    // périmé — et `dbUpdate` mettrait en file, donc appliquerait plus tard une
    // décision prise sur de vieilles données.
    liaisonRompue.mockReturnValue(true);
    dbGet.mockResolvedValue(COMMUN());

    expect(await migrer()).toBe(0);
    expect(dbGet).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it('RENONCE quand des écritures attendent encore de partir', async () => {
    // Même raison : l'appareil et la base ne sont pas d'accord.
    saisiesEnAttente.mockReturnValue(3);
    dbGet.mockResolvedValue(COMMUN());

    expect(await migrer()).toBe(0);
    expect(dbGet).not.toHaveBeenCalled();
  });

  it('LE TÉMOIN — les deux refus ne viennent pas d\'un jeu d\'essai vide', async () => {
    // Sans lui, les deux cas ci-dessus seraient satisfaits par un commun sans
    // aucune dépense personnelle : `dbUpdate` ne serait pas appelé de toute
    // façon, et le renoncement ne serait mesuré nulle part.
    dbGet.mockResolvedValue(COMMUN());

    expect(await migrer()).toBe(2);
    expect(dbUpdate).toHaveBeenCalledTimes(1);
  });

  it('rend l\'instantané de l\'historique, pour que personne ne le relise', async () => {
    // `lecture-unique.spec.js` tient qu'une ouverture ne lit chaque chemin
    // qu'une fois : à douze mois de données, `periods` pèse 96 % des octets
    // lus. Sans ce retour, la migration et l'étape des salaires le lisaient
    // chacune — et les deux poches avec.
    dbGet.mockResolvedValue(COMMUN());

    const { instantane } = await migrerMaPoche();

    expect(Object.keys(instantane)).toContain('2026-09');
    expect(Object.keys(instantane['2026-09'].variableCharges).sort())
      .toEqual(['coiffeur', 'courses', 'sport']);
  });

  it('LE TÉMOIN — l\'instantané est FUSIONNÉ, pas le seul commun', async () => {
    // Sans lui, « rend l'instantané » serait satisfait par le nœud commun
    // brut : sur le jeu d'essai ci-dessus il porte les mêmes charges, les 3
    // n'étant pas encore déplacées. C'est la poche de l'autre qui sépare les
    // deux lectures.
    dbGet.mockImplementation(async (chemin) => {
      if (chemin === 'periods') return { '2026-09': { variableCharges: {} } };
      if (chemin === 'personnel/conjointe/periods') {
        return { '2026-09': { variableCharges: { sien: { amount: 9 } } } };
      }
      return null;
    });

    const { instantane } = await migrerMaPoche();

    expect(Object.keys(instantane['2026-09'].variableCharges)).toEqual(['sien']);
  });

  it('ne lit `periods` QU\'UNE FOIS, et chaque poche une fois', async () => {
    dbGet.mockResolvedValue(COMMUN());

    await migrerMaPoche();

    const comptes = {};
    for (const [chemin] of dbGet.mock.calls) comptes[chemin] = (comptes[chemin] || 0) + 1;
    expect(comptes).toEqual({
      periods: 1,
      'personnel/vous/periods': 1,
      'personnel/conjointe/periods': 1
    });
  });

  it.each([[undefined], [''], ['quelquun']])(
    'ne migre rien quand l\'emplacement vaut %o — SANS REPLI',
    async (emplacement) => {
      // `normaliserEmplacement` rendrait `vous` pour chacune de ces valeurs :
      // le bon repli partout ailleurs, où il ne coûte qu'un libellé. Ici il
      // déciderait dans QUELLE poche atterrit une dépense, donc enverrait
      // celles de l'un chez l'autre. Ne pas savoir de qui elles sont est une
      // raison de ne rien déplacer.
      resetState();
      setState('emplacementCourant', emplacement);
      dbGet.mockResolvedValue(COMMUN());

      expect(await migrer()).toBe(0);
      expect(dbUpdate).not.toHaveBeenCalled();
    }
  );
});
