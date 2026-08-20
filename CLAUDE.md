# CLAUDE.md — FairSplit PWA

App web PWA de partage de charges en couple au prorata des salaires. Synchronisation temps réel Firebase, auth Google/Email, espace de données unique partagé par les comptes autorisés.

> **Version** : 3.2 | **Mise à jour** : 2026-08-19 | **Branche unique** : main

## Stack

- HTML5 sémantique, CSS3 (variables, responsive mobile-first)
- JavaScript ES6 Modules (import/export, async/await)
- Firebase Realtime Database (compat SDK 10.7.1), Firebase Auth
- Leaflet.js (carte), PWA (Service Worker, manifest)
- Tests : Vitest (unitaires), Playwright (E2E)

## Architecture

```
FairSplit/
├── FairSplit.html          # Point d'entrée HTML
├── index.html              # Redirection
├── css/
│   ├── variables.css       # Tokens design (couleurs, espacements)
│   ├── base.css            # Reset, typographie, header
│   ├── components.css      # Boutons, cards, formulaires, charges, FAB, toasts
│   ├── modals.css          # Modales + quick-add
│   ├── auth.css            # Écran authentification
│   ├── summary.css         # Bilan, catégories, tendances
│   ├── map.css             # Carte Leaflet
│   └── responsive.css      # Media queries + print
├── js/
│   ├── app.js              # Entry point — init Firebase, auth, modules
│   ├── config.js           # Firebase config, constantes
│   ├── firebase-init.js    # Init Firebase, providers
│   ├── db.js               # Abstraction DB (préfixage household/)
│   ├── state.js            # État global (Observer pattern)
│   ├── components/         # modal.js, toast.js
│   ├── modules/            # 14 modules fonctionnels (auth, period, charges, summary...)
│   └── utils/              # calculations.js, date.js, format.js, validation.js
└── tests/
    ├── calculations.test.js
    └── e2e/
```

## Adhérences critiques

Avant de modifier un module très importé, vérifier les dépendants : `grep -rl "from '.*MODULE_NAME" js/`

| Module | Imports | Risque |
|---|---|---|
| `state.js` | 14 | Critique — état global |
| `toast.js` | 13 | Critique — feedback utilisateur partout |
| `firebase-init.js` | 5 | Critique — connexion DB |
| `auth.js` | Hub | Critique — initialise TOUS les modules |
| `db.js` | 8 | Critique — abstraction DB |
| `format.js` | 9 | Important — affichage monétaire |
| `summary.js` | 7 | Important — calculs dépendants |

## Conventions

### CSS
- Tokens dans `css/variables.css` via `var(--xxx)`, jamais de valeurs en dur ailleurs
- Mobile-first, breakpoint principal : 600px
- Classes en kebab-case

### JavaScript
- ES6 modules partout, pas de globals sauf compat legacy (`window.xxx`)
- State centralisé : `getState('key')` / `setState('key', value)` via `state.js`
- DB via `db.js` : `dbGet`, `dbSet`, `dbPush`, `dbUpdate` (chemins auto-préfixés par `DATA_ROOT` : `household/`, ou `sandbox/` avec `?sandbox=1`)
- Async/await + try/catch sur tous les appels Firebase
- `escapeHtml()` obligatoire pour tout contenu dynamique injecté en HTML
- Toast pour feedback : `toast.success()`, `toast.error()`

### Nommage
- Fichiers JS : kebab-case (`variable-charges.js`)
- Fonctions : camelCase (`loadVariableCharges`)
- Constantes : UPPER_SNAKE (`MAX_SALARY`)
- Classes CSS : kebab-case (`.charge-item`)

### Git
- Commits français : `feat:`, `fix:`, `refactor:`, `style:`, `docs:`, `chore:`
- main = branche unique et déployée. Travailler sur des branches courtes `fix/…` `feat/…`, puis PR vers main.
- Un seul projet Firebase (fairsplit-test). Pour développer isolé : `npm run emulators` puis `FairSplit.html?emulator=1`

## Commandes

- `npx vitest run` — tests unitaires
- `npx vitest --watch` — tests mode watch
- `npx playwright test` — tests E2E
- `npm run test:all` — tout (vitest + playwright)
- `npm run emulators` — Firebase emulators
- `npm run deploy:test` — deploy test
- `npm run deploy:prod` — deploy prod
- Live Server VS Code sur `FairSplit.html` — dev local

## Contraintes

- NE PAS modifier `state.js`, `toast.js`, `firebase-init.js`, `db.js` sans vérifier tous les imports
- NE PAS ajouter de JS dans `FairSplit.html` — tout dans les modules
- NE PAS utiliser `innerHTML` avec données utilisateur non échappées (XSS)
- NE PAS stocker credentials, tokens ou PII dans le code/logs
- NE JAMAIS supprimer de données Firebase sans soft-delete (`deleted: true`)
- NE JAMAIS mettre `.read: true` ou `.write: true` sur données utilisateur dans Firebase rules
- TOUJOURS utiliser `db.js` pour accéder Firebase (préfixage `DATA_ROOT` automatique)
- TOUJOURS écrire un test pour toute nouvelle fonction pure dans `utils/`
- TOUJOURS tester les dépendants après modif d'un module critique

## Workflow

1. Lire les fichiers concernés avant de modifier
2. Vérifier les adhérences si module critique (`grep -rl`)
3. Proposer un plan (3-5 lignes) avant d'implémenter
4. Implémenter avec escapeHtml pour contenu dynamique
5. Vérifier : `npx vitest run` passe

## Design

Secteur : finance personnelle / couple. Émotion : confiance, clarté, simplicité.

Principes UX :
- Le BILAN doit être la première section visible après la période
- Solde net en gros texte ("Conjointe vous doit X €") avant le détail
- Cibles tactiles minimum 44×44px
- Contrastes WCAG AA (4.5:1 texte, 3:1 grand texte)
- Mobile-first, whitespace généreux

## État de cohérence

Suivi des écarts entre ce CLAUDE.md et l'état réel du code. Mettre à jour cette section après chaque correction.

| Déclaration CLAUDE.md | Fichier réel | État | Action |
|---|---|---|---|
| Design = clarté, confiance, thème clair | `css/variables.css` | ✅ RÉSOLU 2026-03-22 — thème clair + dark mode auto | — |
| Tout JS dans les modules | `FairSplit.html` | ✅ RÉSOLU — HTML propre (604 lignes, aucun JS inline) | — |
| `utils.js` = legacy à supprimer | `js/utils.js` | ✅ RÉSOLU 2026-03-22 — git rm, aucun import résiduel | — |
| `window.quickAddState` = legacy | `js/modules/quick-add.js` | ✅ RÉSOLU — local const, plus de global `window.quickAddState` | — |
| Font Awesome non chargé | `js/modules/variable-charges.js`, `fixed-charges.js` | ✅ RÉSOLU 2026-03-22 — emojis utilisés + `.btn-icon` stylé | — |
| Prompts toolkit sync | `docs/claude/prompts/core/` | ⏳ PAS ENCORE — sync toolkit non fait | Lancer `Sync-Toolkit.ps1` |
| `escapeHtml()` dans `js/utils/format.js` | `js/utils/format.js` + `js/utils.js` (legacy) | ✅ RÉSOLU 2026-03-22 — utils.js supprimé, une seule copie dans format.js | — |
| Bilan en bas de page | `FairSplit.html` + `summary.js` | ✅ RÉSOLU 2026-03-22 — bilan en position 3, solde net 28px en tête | — |

Quand un écart est corrigé → changer l'état en ✅ RÉSOLU avec la date.

## Prompts disponibles

Locaux (commandes Claude) : `.claude/commands/audit-design-fairsplit.md`, `.claude/commands/audit-web-fairsplit.md`
Universels (après sync toolkit) : `@docs/claude/prompts/core/` (analyze-code, debug, etc.)
Stack JS : `@docs/claude/prompts/stacks/javascript/` (conventions, security)
Références : `@docs/claude/references/` (quality-grid, security-checklist)
