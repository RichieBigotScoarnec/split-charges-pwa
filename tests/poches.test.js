// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Les deux poches, lues comme une seule
 *
 * Depuis le lot P1a, une charge peut vivre dans le commun ou dans une poche
 * personnelle. `poches.js` existe pour que rien en aval ne le sache :
 *
 *   `getState('variableCharges')` et `getState('fixedCharges')` contiennent le
 *   commun ET le personnel qu'on a le droit de lire — comme avant P1a.
 *
 * Ces cas tiennent les trois propriétés dont tout le reste dépend : une poche
 * vide ne change RIEN, une poche refusée n'emporte pas le commun, et les deux
 * chemins d'appel des chargeurs rendent la même liste.
 */

const dbGet = vi.fn();

vi.mock('../public/js/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // Accesseur PARESSEUX : le facteur d'un double `async` est invoqué avant les
  // `const` du fichier, et une référence directe y tombe en zone morte
  // temporelle — Vitest sert alors le module ORIGINAL, en silence.
  dbGet: (...args) => dbGet(...args)
}));
vi.mock('../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

const {
  lirePeriodes, lireLesPoches, fusionnerLesPoches
} = await import('../public/js/poches.js');
const { setState, resetState } = await import('../public/js/state.js');

/** Ce que le commun porte : un mois, deux collections */
const COMMUN = () => ({
  '2026-09': {
    salaries: { vous: 3000, conjointe: 2000 },
    variableCharges: { c1: { amount: 40, description: 'Courses', paidBy: 'vous' } },
    fixedCharges: { f1: { amount: 900, description: 'Loyer', paidBy: 'vous' } }
  }
});

/** Ce qu'une poche personnelle porte : les mêmes collections, rien d'autre */
const POCHE = (id, description) => ({
  '2026-09': {
    variableCharges: { [id]: { amount: 12, description, paidBy: 'vous', perimetre: 'solo' } }
  }
});

/**
 * Sert la base par chemin, comme Realtime Database le ferait
 *
 * `refus` liste les préfixes que la base refuse — c'est ainsi qu'un mur se
 * manifeste côté client : par une levée, jamais par un nœud vide.
 *
 * @param {Object} arbre - Chemin complet vers son nœud
 * @param {Array<string>} [refus]
 */
function servir(arbre, refus = []) {
  dbGet.mockImplementation(async (chemin) => {
    if (refus.some((prefixe) => chemin.startsWith(prefixe))) {
      throw new Error(`PERMISSION_DENIED at /${chemin}`);
    }
    return arbre[chemin] ?? null;
  });
}

beforeEach(() => {
  resetState();
  dbGet.mockReset();
  setState('emplacementCourant', 'vous');
});

describe('Une poche vide ne change RIEN', () => {
  it('rend le commun tel quel quand aucune poche n\'existe', async () => {
    // C'est l'état du foyer au sortir de P1a : `personnel/` est déclaré et
    // vide. Ce cas est ce qui rend le lot vérifiable à l'écran — rien ne doit
    // bouger tant qu'aucune donnée n'a été déplacée.
    const commun = COMMUN();
    servir({ periods: commun });

    expect(await lirePeriodes()).toEqual(commun);
  });

  it('rend le MÊME OBJET, sans le recopier', async () => {
    // Pas de la coquetterie : c'est ce qui garantit qu'une poche vide ne peut
    // pas altérer la forme du nœud en passant par la fusion. Une recopie
    // profonde perdrait par exemple un `undefined`, et rien ne le dirait.
    const commun = COMMUN();
    servir({ periods: commun });

    expect(await lirePeriodes()).toBe(commun);
  });

  it('lit bien les trois chemins, et eux seuls', async () => {
    // LE TÉMOIN des deux cas ci-dessus : sans lui, ils seraient satisfaits par
    // une fabrique qui ne lit jamais aucune poche.
    servir({ periods: COMMUN() });
    await lirePeriodes();

    expect(dbGet.mock.calls.map((appel) => appel[0])).toEqual([
      'periods',
      'personnel/vous/periods',
      'personnel/conjointe/periods'
    ]);
  });
});

describe('Le personnel rejoint le commun, à sa place', () => {
  it('réunit les deux poches dans les collections du bon mois', async () => {
    servir({
      periods: COMMUN(),
      'personnel/vous/periods': POCHE('p1', 'Sport'),
      'personnel/conjointe/periods': POCHE('p2', 'Coiffeur')
    });

    const fusionne = await lirePeriodes();

    expect(Object.keys(fusionne['2026-09'].variableCharges).sort())
      .toEqual(['c1', 'p1', 'p2']);
    // Le reste du mois est intact : la fusion ne touche QUE les collections de
    // charges, jamais les salaires ni les termes du mois.
    expect(fusionne['2026-09'].salaries).toEqual({ vous: 3000, conjointe: 2000 });
    expect(Object.keys(fusionne['2026-09'].fixedCharges)).toEqual(['f1']);
  });

  it('fusionne à tous les niveaux de lecture', async () => {
    // La même fabrique sert l'historique entier, un mois, et une collection.
    // Trois rédactions divergeraient — et le symptôme serait le même total
    // affiché différemment selon l'écran qui l'a demandé.
    servir({
      'periods/2026-09/variableCharges': COMMUN()['2026-09'].variableCharges,
      'personnel/vous/periods/2026-09/variableCharges':
        POCHE('p1', 'Sport')['2026-09'].variableCharges,
      'periods/2026-09': COMMUN()['2026-09'],
      'personnel/vous/periods/2026-09': POCHE('p1', 'Sport')['2026-09']
    });

    expect(Object.keys(await lirePeriodes('2026-09/variableCharges')).sort())
      .toEqual(['c1', 'p1']);
    expect(Object.keys((await lirePeriodes('2026-09')).variableCharges).sort())
      .toEqual(['c1', 'p1']);
  });

  it('refuse de descendre jusqu\'à une charge', async () => {
    // Deux poches ne peuvent pas porter la MÊME charge : à ce niveau, fusionner
    // n'a aucun sens, et le faire mélangerait les champs de deux charges
    // distinctes en un hybride que rien ne signalerait.
    await expect(lirePeriodes('2026-09/variableCharges/c1')).rejects
      .toThrow(/une charge vit dans une poche et une seule/);
  });
});

describe('Un refus n\'emporte jamais le commun', () => {
  it('rend les charges communes quand les DEUX poches sont refusées', async () => {
    // Le cas NOMINAL, et c'est ce qui le rend important : sans aval, la poche
    // de l'autre est refusée à chaque chargement. Le lot P1a a payé une fois
    // le défaut inverse — une seule levée emportait la sauvegarde entière.
    servir({ periods: COMMUN() }, ['personnel/']);

    const fusionne = await lirePeriodes();

    expect(Object.keys(fusionne['2026-09'].variableCharges)).toEqual(['c1']);
  });

  it('rend le commun ET sa propre poche quand seule celle de l\'autre est refusée', async () => {
    servir({
      periods: COMMUN(),
      'personnel/vous/periods': POCHE('p1', 'Sport')
    }, ['personnel/conjointe/']);

    const fusionne = await lirePeriodes();

    expect(Object.keys(fusionne['2026-09'].variableCharges).sort()).toEqual(['c1', 'p1']);
  });

  it('LE TÉMOIN — un refus sur le COMMUN, lui, remonte', async () => {
    // Sans lui, « un refus n'emporte pas le commun » serait satisfait par une
    // fabrique qui avale TOUTE erreur — et une base injoignable rendrait alors
    // un mois vide parfaitement crédible, au lieu d'une panne visible.
    servir({}, ['periods']);

    await expect(lirePeriodes()).rejects.toThrow(/PERMISSION_DENIED/);
  });
});

describe('La fusion, éprouvée seule', () => {
  it('ne descend jamais dans une charge', () => {
    // Deux charges de même identifiant ne doivent pas produire un hybride de
    // leurs champs. La poche gagne, entière, et le conflit est journalisé.
    const commun = { '2026-09': { variableCharges: { x: { amount: 10, description: 'A' } } } };
    const poche = { '2026-09': { variableCharges: { x: { amount: 99 } } } };

    const fusionne = fusionnerLesPoches(commun, [poche], 2);

    expect(fusionne['2026-09'].variableCharges.x).toEqual({ amount: 99 });
  });

  it('ignore ce qui n\'est pas une collection de charges', () => {
    // Une poche personnelle ne porte QUE des charges. Un nœud inattendu — une
    // donnée héritée, une écriture forgée — ne doit pas se retrouver dans le
    // mois du foyer, où il passerait pour un terme du mois.
    const poche = {
      '2026-09': {
        variableCharges: { p1: { amount: 12 } },
        salaries: { vous: 1 },
        shareMode: '50-50'
      }
    };

    const fusionne = fusionnerLesPoches({ '2026-09': { salaries: { vous: 3000 } } }, [poche], 2);

    expect(fusionne['2026-09'].salaries).toEqual({ vous: 3000 });
    expect(fusionne['2026-09'].shareMode).toBeUndefined();
    expect(fusionne['2026-09'].variableCharges).toEqual({ p1: { amount: 12 } });
  });

  it('ne modifie pas le nœud commun qu\'on lui donne', () => {
    const commun = COMMUN();
    fusionnerLesPoches(commun, [POCHE('p1', 'Sport')], 2);

    expect(Object.keys(commun['2026-09'].variableCharges)).toEqual(['c1']);
  });
});

describe('Les trois nœuds rendus ensemble, et pourquoi', () => {
  /**
   * `lireLesPoches` rend le commun BRUT en plus de la fusion. Un seul appelant
   * en a besoin — la migration des poches, qui ne peut pas déduire du nœud
   * fusionné où une charge vit physiquement : c'est exactement ce que la fusion
   * efface. Les rendre ensemble évite une seconde lecture de l'historique
   * entier, que `lecture-unique.spec.js` tient à une par ouverture.
   */
  it('rend le commun brut ET la fusion, en UNE passe de lectures', async () => {
    servir({
      periods: COMMUN(),
      'personnel/vous/periods': POCHE('p1', 'Sport')
    });

    const { commun, fusionne } = await lireLesPoches();

    expect(Object.keys(commun['2026-09'].variableCharges)).toEqual(['c1']);
    expect(Object.keys(fusionne['2026-09'].variableCharges).sort()).toEqual(['c1', 'p1']);
    expect(dbGet.mock.calls).toHaveLength(3);
  });

  it('LE TÉMOIN — les deux nœuds SE SÉPARENT sur ce jeu d\'essai', async () => {
    // Sans lui, le cas ci-dessus serait satisfait par une fabrique qui rend le
    // même objet deux fois : sur une poche vide, le commun et la fusion sont
    // identiques — c'est même une propriété tenue plus haut.
    servir({
      periods: COMMUN(),
      'personnel/vous/periods': POCHE('p1', 'Sport')
    });

    const { commun, fusionne } = await lireLesPoches();

    expect(fusionne).not.toBe(commun);
  });

  it('`lirePeriodes` n\'en est que la fusion — une seule fabrique', async () => {
    // Deux rédactions de la lecture divergeraient au premier correctif, et le
    // symptôme serait le même mois lu différemment selon l'appelant.
    servir({
      periods: COMMUN(),
      'personnel/vous/periods': POCHE('p1', 'Sport')
    });

    const parLaFusion = await lirePeriodes();
    dbGet.mockClear();
    const { fusionne } = await lireLesPoches();

    expect(Object.keys(parLaFusion['2026-09'].variableCharges).sort())
      .toEqual(Object.keys(fusionne['2026-09'].variableCharges).sort());
  });
});
