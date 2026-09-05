import { describe, it, expect } from 'vitest';
import { adherencesDeSources, classement, SEUIL } from '../tools/adherences.mjs';

/**
 * Le résolveur voit ce qu'un `grep` ne peut pas voir
 *
 * Le tableau des adhérences critiques de `CLAUDE.md` prescrivait
 * `grep -rl "from '.*MODULE" js/` pour compter les dépendants d'un module. Cette
 * commande échouait deux fois : elle visait `js/`, dossier qui n'existe pas dans
 * ce dépôt, et `from '…'` ne voit que les imports STATIQUES.
 *
 * Or ce dépôt charge beaucoup à la demande. Sur `db.js`, 22 des 25 dépendants
 * passent par `import()` dynamique : la garde en montrait 3 sur 25, et le
 * tableau annonçait 8. Un module qu'on croit tenu par huit fichiers et qui l'est
 * par vingt-cinq, c'est une relecture qu'on ne fait pas.
 *
 * LA PROPRIÉTÉ QUI COMPTE EST DONC CELLE-LÀ : le résolveur relève les deux
 * formes. C'est la seule chose que `grep` ne savait pas faire, donc la seule
 * qui justifie d'avoir écrit un outil.
 *
 * L'ENTRÉE EST SYNTHÉTIQUE, JAMAIS L'ÉTAT DU DÉPÔT. Un contrôle qui lirait
 * `public/js` mesurerait ce que le dépôt contient aujourd'hui — il resterait
 * vert le jour où le résolveur cesserait de voir les imports dynamiques, si par
 * hasard plus aucun module n'en portait. C'est la raison pour laquelle la garde
 * `opacity: 0.8` est tombée : elle regardait le rendu du moment, pas la règle.
 */

/** Un dépôt minuscule, écrit pour cette question et pour elle seule */
const DEPOT = {
  // Trois importeurs statiques, deux dynamiques, sur la même cible.
  'js/app.js': `
    import { dbGet } from './db.js';
    import { getState } from './state.js';
  `,
  'js/modules/period.js': `
    import { getState } from '../state.js';
    export async function charger() {
      const { dbGet } = await import('../db.js');
      return dbGet('periods');
    }
  `,
  'js/modules/trash.js': `
    export async function vider() {
      const { dbSet } = await import('../db.js');
      return dbSet('trash', null);
    }
  `,
  'js/modules/summary.js': `
    import { dbGet } from '../db.js';
    import { getState } from '../state.js';
  `,
  // Une cible sans aucun dépendant dynamique, pour que la distinction se voie.
  'js/state.js': `export function getState() {}`,
  'js/db.js': `export async function dbGet() {}`,
};

const grapheDe = (sources) => adherencesDeSources(sources);
const compte = (graphe, cible) => {
  const e = graphe.get(cible);
  if (!e) return { total: 0, statiques: 0, dynamiques: 0 };
  return {
    total: new Set([...e.statiques, ...e.dynamiques]).size,
    statiques: e.statiques.size,
    dynamiques: e.dynamiques.size,
  };
};

describe('Les deux formes d’import', () => {
  it('relève les imports dynamiques, que `from` ne montre pas', () => {
    const db = compte(grapheDe(DEPOT), 'js/db.js');

    expect(db.dynamiques).toBe(2);
    expect(db.statiques).toBe(2);
    expect(db.total).toBe(4);
  });

  it("nomme les fichiers qui n'importent QUE dynamiquement", () => {
    const { statiques, dynamiques } = grapheDe(DEPOT).get('js/db.js');

    // Ces deux-là sont exactement ce qu'un `grep "from '.*db.js'"` manquerait.
    expect([...dynamiques].sort()).toEqual(['js/modules/period.js', 'js/modules/trash.js']);
    expect([...statiques].sort()).toEqual(['js/app.js', 'js/modules/summary.js']);
  });

  it('TÉMOIN NÉGATIF — sans la forme dynamique, le compte tombe de 4 à 2', () => {
    // On rejoue ce que voyait la garde d'avant : les seuls `from '…'`.
    const sansDynamique = Object.fromEntries(
      Object.entries(DEPOT).map(([f, t]) => [f, t.replace(/await import\([^)]*\)/g, 'null')]),
    );

    expect(compte(grapheDe(sansDynamique), 'js/db.js').total).toBe(2);
    // Sans ce témoin, un résolveur qui ignorerait `import()` passerait les deux
    // contrôles ci-dessus dès que le jeu d'essai porterait assez de statiques.
    expect(compte(grapheDe(DEPOT), 'js/db.js').total).toBe(4);
  });

  it('ne compte qu’une fois un fichier qui importe des deux façons', () => {
    const graphe = grapheDe({
      'js/a.js': `
        import { x } from './b.js';
        const tard = () => import('./b.js');
      `,
      'js/b.js': 'export const x = 1;',
    });

    // La question est « combien de fichiers relire », pas « combien de lignes ».
    expect(compte(graphe, 'js/b.js')).toEqual({ total: 1, statiques: 1, dynamiques: 1 });
  });
});

describe('La résolution des chemins', () => {
  it('résout le spécificateur depuis le fichier qui l’écrit, jamais depuis la racine', () => {
    const graphe = grapheDe({
      'js/modules/a.js': `import { x } from '../utils/f.js';`,
      'js/utils/b.js': `import { x } from './f.js';`,
      'js/utils/f.js': 'export const x = 1;',
    });

    // Les deux spécificateurs s'écrivent différemment et désignent le même
    // fichier : c'est tout ce qu'un comptage textuel ne sait pas faire.
    expect(compte(graphe, 'js/utils/f.js').total).toBe(2);
  });

  it('ajoute l’extension omise', () => {
    const graphe = grapheDe({
      'js/a.js': `import { x } from './b';`,
      'js/b.js': 'export const x = 1;',
    });

    expect(graphe.has('js/b.js')).toBe(true);
  });

  it('ignore les paquets, qui ne sont pas des fichiers du dépôt', () => {
    const graphe = grapheDe({
      'js/a.js': `
        import { initializeApp } from 'firebase/app';
        import { x } from './b.js';
      `,
      'js/b.js': 'export const x = 1;',
    });

    expect([...graphe.keys()]).toEqual(['js/b.js']);
  });
});

describe('Le classement', () => {
  it('ordonne par nombre de fichiers dépendants, décroissant', () => {
    const rangs = classement(grapheDe(DEPOT));

    expect(rangs[0].cible).toBe('js/db.js');
    expect(rangs[0].total).toBe(4);
    expect(rangs[1].cible).toBe('js/state.js');
    expect(rangs[1].total).toBe(3);
  });

  it('départage deux cibles à égalité par leur nom, pour que l’ordre soit stable', () => {
    const rangs = classement(
      grapheDe({
        'js/a.js': `import { z } from './zebre.js';\nimport { a } from './abeille.js';`,
        'js/zebre.js': 'export const z = 1;',
        'js/abeille.js': 'export const a = 1;',
      }),
    );

    expect(rangs.map((r) => r.cible)).toEqual(['js/abeille.js', 'js/zebre.js']);
  });

  it('expose un seuil, pour que le tableau et son contrôle lisent le même nombre', () => {
    expect(SEUIL).toBe(13);
  });
});
