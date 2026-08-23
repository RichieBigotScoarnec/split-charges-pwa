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
    exclude: [
      'node_modules/**',
      'tests/e2e/**'
    ]
  }
});
