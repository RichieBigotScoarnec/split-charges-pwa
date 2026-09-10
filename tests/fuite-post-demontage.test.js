import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Aucun module n'est réclamé APRÈS le démontage de l'environnement
 *
 * Le défaut : un appel à une fonction `async` sans `await` rend la main
 * immédiatement, mais sa chaîne continue. Le test finit, le fichier finit,
 * Vitest démonte l'environnement du worker — **puis** la promesse reprend et
 * réclame un module. Vitest lève alors `EnvironmentTeardownError`, la levée est
 * rattrapée par le `catch` applicatif, et journalisée par `debug.error` →
 * `console.error`. Or `onUserConsoleLog` est le RPC par lequel Vitest remonte
 * la console d'un worker : un `console.error` émis pendant la fermeture de ce
 * RPC donne `Closing rpc while "onUserConsoleLog" was pending`, et un
 * `EXIT=1` sur une passe où tous les tests sont verts.
 *
 * **La fuite est inconditionnelle, la conséquence visible est une course.** Une
 * passe verte ne prouve donc rien — c'est très exactement le contrôle qui ne
 * mesure rien de la règle 1. Ce fichier mesure la FUITE, pas la course : il
 * relance la suite visée dans un sous-processus et lit ce que son
 * environnement a réclamé trop tard.
 *
 * ## Ce que ce contrôle ne nomme PAS, et pourquoi
 *
 * Il ne nomme aucun module feuille. La feuille dépend du cache de modules de la
 * passe, et elle a déjà bougé trois fois pour un seul et même défaut :
 * `utils/miroir.js` au relevé du 2026-09-07, `utils/salaries.js` sur le fichier
 * joué seul le 2026-09-10, `utils/perimetre.js` sur la suite entière le même
 * jour. Un contrôle qui aurait nommé la feuille se serait périmé EN VERT au
 * premier de ces déplacements.
 *
 * La propriété tient sur la racine de la pile — le fichier de test — qui est le
 * seul élément stable de la chaîne, et qui est aussi le sujet du contrôle.
 *
 * ## La forme générale, délibérément non jouée ici
 *
 * Le balayage honnête serait la suite ENTIÈRE dans le sous-processus : il
 * attraperait la prochaine fuite dans n'importe quel fichier. Mesuré le
 * 2026-09-10, il rend le même verdict (21 erreurs, les 21 enracinées dans
 * `share-mode.test.js`, zéro ailleurs) pour un coût de deux minutes à chaque
 * passe. La cible est donc le fichier sous surveillance, et le balayage complet
 * se rejoue à la main :
 *
 * ```bash
 * npx vitest run --reporter=dot > passe.txt 2>&1 ; echo EXIT=$?
 * grep -c EnvironmentTeardownError passe.txt
 * ```
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const VITEST = join(RACINE, 'node_modules', 'vitest', 'vitest.mjs');

/** La suite dont on tient la propriété */
const CIBLE = 'tests/modules/share-mode.test.js';

/**
 * Rejoue une suite dans un sous-processus et relève ce qu'elle a réclamé trop tard
 *
 * @param {string} cible - chemin du fichier de test, relatif à la racine
 * @returns {{code: number|null, sortie: string, resume: string|null,
 *            fuites: Array<{racine: string, feuille: string}>}}
 */
function rejouer(cible) {
  const passe = spawnSync(process.execPath, [VITEST, 'run', cible, '--reporter=dot'], {
    cwd: RACINE,
    encoding: 'utf8',
    // `NO_COLOR` plutôt qu'un dégraissage des séquences ANSI après coup : un
    // motif d'échappement dans ce fichier serait une ERREUR `no-control-regex`,
    // et la CI lance `npx eslint .`, qui couvre `tests/`.
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180_000
  });

  const sortie = `${passe.stdout || ''}${passe.stderr || ''}`;

  // Le témoin POSITIF de ce contrôle : sans lui, un sous-processus qui n'a
  // jamais démarré rendrait une sortie vide, donc zéro fuite, donc du vert.
  const resume = /Test Files\s+(\d+) passed/.exec(sortie)?.[0] ?? null;

  // Chaque levée porte sa « last recorded callstack » : la feuille réclamée en
  // premier, puis ses importateurs, jusqu'au fichier de test en dernier.
  const fuites = [];
  const lignes = sortie.split(/\r?\n/);
  for (let i = 0; i < lignes.length; i++) {
    if (!lignes[i].includes('last recorded callstack')) continue;
    const pile = [];
    for (let j = i + 1; j < lignes.length && lignes[j].startsWith('- '); j++) {
      pile.push(lignes[j].slice(2).trim());
    }
    if (pile.length) fuites.push({ racine: pile[pile.length - 1], feuille: pile[0] });
  }

  return { code: passe.status, sortie, resume, fuites };
}

describe('Fuite post-démontage', () => {
  const passe = rejouer(CIBLE);

  it('la suite visée a réellement tourné — témoin positif', () => {
    // Sans ce cas, « zéro fuite » serait satisfait par un sous-processus mort.
    expect(passe.resume, `aucun résumé de Vitest dans la sortie :\n${passe.sortie.slice(0, 2000)}`)
      .not.toBeNull();
    expect(passe.code, `code de sortie ${passe.code} pour ${CIBLE}`).toBe(0);
  });

  it(`aucun module n'est réclamé après le démontage de ${CIBLE}`, () => {
    const nôtres = passe.fuites.filter(f => f.racine.replaceAll('\\', '/').endsWith(CIBLE));

    const feuilles = [...new Set(nôtres.map(f => f.feuille))].join(', ');
    expect(
      nôtres.length,
      `${nôtres.length} module(s) réclamé(s) après le démontage de ${CIBLE}. `
        + `Feuille(s) réclamée(s) : ${feuilles}. `
        + `Une chaîne asynchrone a survécu à la fin du fichier : chercher un appel `
        + `à une fonction async dont la valeur de retour n'est ni attendue ni `
        + `consommée dans le module visé.`
    ).toBe(0);
  }, 180_000);
});
