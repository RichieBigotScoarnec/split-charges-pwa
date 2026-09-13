/**
 * Configuration dédiée aux tests de règles Firebase.
 *
 * `tests/regles/` est exclu de `vitest.config.mjs` : sans émulateur, chaque cas
 * échoue pour une raison qui n'a rien à voir avec le code. Mais la liste
 * `exclude` l'emporte sur le filtre passé en ligne de commande — les tests
 * devenaient donc injoignables *partout*, y compris par le script qui les
 * enveloppe dans `emulators:exec`.
 *
 * D'où cette configuration, qui n'exclut qu'un seul répertoire : node_modules.
 * Lancée par `npm run regles`.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/regles/**/*.test.js'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000
  }
});
