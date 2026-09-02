import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les tests s'exécutaient en UTC, comme tout conteneur d'intégration par
    // défaut. C'est un fuseau que personne n'habite, et il rendait muets les
    // contrôles qui comptent : en UTC, le jour local et le jour UTC coïncident
    // toujours, donc un test censé prouver que l'application ne confond pas les
    // deux passait quoi qu'il arrive.
    //
    // Mesuré : le sabotage qui remet `toISOString()` à la place des composantes
    // locales n'était détecté qu'en forçant ce fuseau à la main.
    //
    // Paris, donc — le fuseau du foyer, avec ses deux bascules annuelles. Un
    // contrôle de `tests/utils/date-des-charges.test.js` vérifie que ce réglage
    // s'applique réellement, sans quoi sa disparition serait, elle aussi,
    // silencieuse.
    env: { TZ: 'Europe/Paris' },
    // Les motifs sont prefixes de `**/`, et ce n'est pas cosmetique.
    //
    // Une liste `exclude` REMPLACE celle de vitest ; celle-ci etait ancree a la
    // racine, et ne couvrait donc qu'une seule profondeur. Le jour ou une copie
    // imbriquee du depot apparait — un worktree git sous `.claude/worktrees/`,
    // gitignore donc invisible dans `git status` — vitest y decouvrait 57
    // fichiers de plus : des specs e2e lancees sans serveur, et des `.spec.ts`
    // de dependances tierces vendues dans leur propre `node_modules`.
    //
    // Mesure : 300 fichiers attendus, 357 collectes, et 55 echecs qui n'avaient
    // aucun rapport avec le changement en cours. Un banc d'essai qui devient
    // rouge selon ce qui traine a cote ne prouve plus rien.
    exclude: [
      '**/node_modules/**',
      '**/tests/e2e/**',
      // Les copies de travail de Claude Code : un worktree est le depot entier,
      // ses tests appartiennent a la session qui l'a cree, pas a celle-ci.
      '.claude/**'
    ]
  }
});
