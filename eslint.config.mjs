import js from '@eslint/js';
import globals from 'globals';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

export default [
  {
    ignores: [
      'node_modules/**',
      'test-results/**',
      'package-lock.json',
      // Les copies de travail de Claude Code. Un worktree git est le dépôt
      // ENTIER, avec ses propres `node_modules` — et il est gitignoré, donc
      // invisible dans `git status`.
      //
      // Mesuré : `npx eslint .` y trouvait 1929 erreurs, et zéro dans le dépôt.
      // Même piège que celui corrigé côté vitest, dans un second outil : la CI
      // n'en voit rien puisqu'elle part d'un checkout neuf, mais en local le
      // lint devient illisible sans que la cause apparaisse nulle part.
      '.claude/**',
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
      // En avertissement, pas en erreur : les occurrences actuelles ont été
      // vérifiées une à une et sont sûres (valeurs échappées par escapeHtml,
      // numériques, ou littéraux).
      //
      // Cette affirmation a déjà été fausse. Six rendus interpolaient un prénom
      // de membre — `formatPaidBy()`, `directionLabel()`, `describeBalance()` —
      // sans échappement, et l'avertissement les signalait sans que personne ne
      // les relise. Une revue n'a de valeur qu'à la date où elle a lieu :
      // relire réellement chaque avertissement, ou la règle ne sert à rien.
      //
      // La règle ne sait pas suivre l'assainissement
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

  // ===== Outillage (Node, hors application publiée) =====
  // `tools/` n'est pas déployé — le déploiement ne publie que `public/`. Ces
  // scripts tournent dans Node, en CI : ils disposent de `process` et de
  // `console`, que la configuration navigateur ne connaît pas.
  {
    files: ['tools/**/*.mjs', 'tools/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error'
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
