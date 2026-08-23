# CLAUDE.md — FairSplit PWA

App web PWA de partage de charges en couple au prorata des salaires. Synchronisation temps réel Firebase, auth Google/Email, espace de données unique partagé par les comptes autorisés.

> **Version** : 4.0.0 | **Mise à jour** : 2026-08-22 | **Branche unique** : main

## Stack

- HTML5 sémantique, CSS3 (variables, responsive mobile-first)
- JavaScript ES6 Modules (import/export, async/await)
- Firebase Realtime Database (compat SDK 10.14.1), Firebase Auth
- Leaflet.js (carte), PWA (Service Worker, manifest)
- Tests : Vitest (unitaires), Playwright (E2E)

## Architecture

```text
FairSplit/
├── public/                     # Tout ce qui est publié — et rien d'autre
│   ├── FairSplit.html          # Point d'entrée HTML
│   ├── index.html              # Redirection
│   ├── sw.js  manifest.json  icon-*.png
│   ├── css/
│   │   ├── variables.css       # Tokens design (couleurs, espacements)
│   │   ├── base.css            # Reset, typographie, header
│   │   ├── components.css      # Boutons, cards, formulaires, charges, FAB, toasts
│   │   ├── modals.css          # Modales + quick-add
│   │   ├── auth.css            # Écran authentification
│   │   ├── summary.css         # Bilan, catégories, tendances
│   │   ├── map.css             # Carte Leaflet
│   │   └── responsive.css      # Media queries + print
│   └── js/
│       ├── app.js              # Entry point — init Firebase, auth, modules
│       ├── config.js           # Firebase config, DATA_ROOT, liste blanche
│       ├── firebase-init.js    # Init Firebase, providers, émulateurs
│       ├── db.js               # Abstraction DB (préfixage DATA_ROOT)
│       ├── state.js            # État global (lecture/écriture, sans abonnés)
│       ├── components/         # modal.js, toast.js
│       ├── modules/            # 22 modules fonctionnels
│       └── utils/              # 20 aides pures — dont montant (lecture d'une
│                               # saisie), lieu (géocodage), categorie-lieu
│                               # (catégorie déduite du lieu),
│                               # categories-frequentes, auth-errors,
│                               # enveloppes (regroupements transversaux),
│                               # identifiant (fabrique d'identifiants, partagée
│                               # par catégories, destinations et enveloppes),
│                               # calculations, format, validation, salaries
├── tests/                      # Vitest (unitaires) + Playwright (E2E)
├── tools/                      # generate-icons.ps1, enveloppe-sauvegarde.mjs,
│                               # migration-repartition.mjs
│                               # (hors `public/`, donc jamais publié)
├── docs/                       # Dépannage, déploiement, aide-mémoire Git
└── database.rules.json         # Règles de sécurité — source de vérité unique
```

Le déploiement publie `public/` et rien d'autre. Ne jamais placer à la racine
un fichier destiné à être servi, ni dans `public/` un fichier qui ne doit pas
l'être.

## Adhérences critiques

Avant de modifier un module très importé, vérifier les dépendants : `grep -rl "from '.*MODULE_NAME" js/`

| Module | Imports | Risque |
|---|---|---|
| `state.js` | 22 | Critique — état global |
| `toast.js` | 13 | Critique — feedback utilisateur partout |
| `firebase-init.js` | 5 | Critique — connexion DB |
| `auth.js` | Hub | Critique — initialise TOUS les modules |
| `db.js` | 8 | Critique — abstraction DB |
| `format.js` | 9 | Important — affichage monétaire |
| `summary.js` | 7 | Important — calculs dépendants |

## Conventions

### CSS
- Tokens dans `public/css/variables.css` via `var(--xxx)`, jamais de valeurs en dur ailleurs
- Mobile-first, breakpoint principal : 600px
- Classes en kebab-case

### JavaScript
- ES6 modules partout, pas de globals sauf compat legacy (`window.xxx`)
- State centralisé : `getState('key')` / `setState('key', value)` via `state.js`
  (lecture/écriture seules : le registre d'abonnés n'a jamais eu d'abonné et a
  été retiré — chaque module appelle son rendu après avoir écrit)
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
- Un seul projet Firebase (fairsplit-foyer). Pour développer isolé : `npm run emulators` puis `FairSplit.html?emulator=1`

## Commandes

- `npx vitest run` — tests unitaires
- `npx vitest --watch` — tests mode watch
- `npx playwright test` — tests E2E
- `npm run test:all` — tout (vitest + playwright)
- `npm run emulators` — Firebase emulators
- `npm run deploy:hosting` — deploy Firebase Hosting (optionnel ; la prod est GitHub Pages)
- `npm run serve` puis http://localhost:3333 — dev local

## Contraintes

- NE PAS modifier `state.js`, `toast.js`, `firebase-init.js`, `db.js` sans vérifier tous les imports
- NE PAS ajouter de JS dans `public/FairSplit.html` — tout dans les modules
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
| Design = clarté, confiance, thème clair | `public/css/variables.css` | ✅ RÉSOLU 2026-03-22 — thème clair + dark mode auto | — |
| Tout JS dans les modules | `public/FairSplit.html` | ✅ RÉSOLU — HTML propre (604 lignes, aucun JS inline) | — |
| `utils.js` = legacy à supprimer | `js/utils.js` (supprimé) | ✅ RÉSOLU 2026-03-22 — git rm, aucun import résiduel | — |
| `window.quickAddState` = legacy | `public/js/modules/quick-add.js` | ✅ RÉSOLU — local const, plus de global `window.quickAddState` | — |
| Font Awesome non chargé | `public/js/modules/variable-charges.js`, `fixed-charges.js` | ✅ RÉSOLU 2026-03-22 — emojis utilisés + `.btn-icon` stylé | — |
| `escapeHtml()` dupliqué | `public/js/utils/format.js` | ✅ RÉSOLU 2026-03-22 — utils.js supprimé, une seule copie dans format.js | — |
| Bilan en bas de page | `public/FairSplit.html` + `summary.js` | ✅ RÉSOLU 2026-03-22 — bilan en position 3, solde net 28px en tête | — |

| `state.js` = Observer pattern | `public/js/state.js` | ✅ RÉSOLU 2026-08-22 — registre d'abonnés retiré, personne ne s'y abonnait | — |
| Liste de précache tenue à la main | `public/sw.js` | ✅ RÉSOLU 2026-08-22 — test comparant la liste au disque | — |
| Classes CSS orphelines des deux côtés | `public/css/`, modules de rendu | ✅ RÉSOLU 2026-08-22 — feuilles alignées sur le balisage, règles mortes retirées | — |
| `utils/` listé à cinq fichiers | `public/js/utils/` (15 fichiers) | ✅ RÉSOLU 2026-08-22 — inventaire remis à jour | — |
| Montants lus par `parseFloat` | `public/js/utils/montant.js` | ✅ RÉSOLU 2026-08-22 — virgule acceptée, une seule lecture partagée | — |
| Sauvegarde entièrement manuelle | `.github/workflows/sauvegarde.yml` | ✅ RÉSOLU 2026-08-22 — export chiffré quotidien, restaurable depuis l'application | Exige le secret `SAUVEGARDE_PASSPHRASE` |
| Répartition de la saisie rapide écrite dans `splitMode`, que personne ne lit | `public/js/modules/quick-add.js` | ✅ RÉSOLU 2026-08-23 — `splitOverride`, le champ qu'interroge le calcul | — |
| Charges antérieures restées au prorata malgré un « 50-50 » choisi | `.github/workflows/migration-repartition.yml` | ✅ RÉSOLU 2026-08-23 — migration à la demande, simulation par défaut, sauvegarde puis contrôle après écriture | Lancer depuis l'onglet Actions |
| Gestion des destinations exposée sur `window` sans aucun bouton | `public/FairSplit.html` | ✅ RÉSOLU 2026-08-23 — bouton « 🏦 Destinations », les deux sens fermés par `tests/actions-atteignables.test.js` | — |
| Sélecteur d'emoji sans bière, café ni croissant — les catégories que le GPS vise | `public/js/modules/custom-lists.js` | ✅ RÉSOLU 2026-08-23 — 57 propositions rangées par familles, contrôlées par test | — |
| Aucun moyen de regrouper les dépenses d'un séjour ou d'un chantier | `public/js/modules/envelopes.js` | ✅ RÉSOLU 2026-08-23 — enveloppes transversales, sur charges fixes comme variables, sans effet sur le solde | Vue dédiée et enveloppe active à venir |

Quand un écart est corrigé → changer l'état en ✅ RÉSOLU avec la date.

## Prompts disponibles

Commandes Claude Code (chargées automatiquement) :
`.claude/commands/audit-design-fairsplit.md`, `.claude/commands/audit-web-fairsplit.md`

Prompts d'audit locaux : `docs/claude/prompts/local/` — dette technique,
règles Firebase, design PWA.

> Les entrées `docs/claude/prompts/core/`, `stacks/javascript/`,
> `docs/claude/references/` et le script `Sync-Toolkit.ps1` figuraient ici
> sans jamais avoir existé dans ce dépôt. Une documentation qui annonce un
> mécanisme absent finit par le faire croire actif : ne rétablir ces lignes
> que le jour où les fichiers existent.
