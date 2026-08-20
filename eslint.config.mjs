import js from '@eslint/js';
import globals from 'globals';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

export default [
  {
    ignores: [
      'node_modules/**',
      'test-results/**',
      'package-lock.json',
      // Pages autonomes héritées : script inline, hors architecture modulaire
      'configure-partner.html',
      'migrate-to-multiuser.html'
    ]
  },

  js.configs.recommended,

  // ===== Application (modules ES, navigateur) =====
  {
    files: ['public/js/**/*.js'],
    plugins: { 'no-unsanitized': noUnsanitized },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // SDK Firebase (mode compat) et Leaflet, chargés via CDN
        firebase: 'readonly',
        L: 'readonly'
      }
    },
    rules: {
      // En avertissement, pas en erreur : les 17 occurrences actuelles ont été
      // vérifiées une à une et sont sûres (valeurs échappées par escapeHtml,
      // numériques, ou littéraux). La règle ne sait pas suivre l'assainissement
      // à travers un template literal à interpolations multiples, et l'option
      // `escape` n'y change rien. Les passer en erreur imposerait 17
      // eslint-disable — or un disable devient invisible et finit par masquer
      // un vrai défaut. En avertissement, tout nouvel innerHTML reste signalé
      // pour relecture humaine.
      'no-unsanitized/property': 'warn',
      'no-unsanitized/method': 'warn',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },

  // ===== Service worker =====
  {
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...globals.browser }
    },
    rules: {
      'no-console': 'off'
    }
  },

  // ===== Tests (Vitest / Playwright) =====
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, firebase: 'readonly' }
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },

  // ===== Fichiers de configuration =====
  {
    files: ['*.config.js', '*.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node }
    }
  }
];
