# CLAUDE.md — FairSplit PWA

> **Version** : 2.0 | **Branche active** : develop | **Usage** : Claude Code CLI

---

## Projet

FairSplit — App web PWA de partage de charges en couple au prorata des salaires.
Synchronisation temps réel Firebase, auth Google/Email, multi-utilisateur (Owner/Partner).

## Stack

- HTML5 sémantique, CSS3 (variables, responsive mobile-first)
- JavaScript ES6 Modules (import/export, async/await)
- Firebase Realtime Database (compat SDK 10.7.1), Firebase Auth
- Leaflet.js (carte des dépenses)
- PWA : Service Worker (sw-test.js), manifest
- Tests : Vitest

## Architecture

```
FairSplit/
├── FairSplit.html                # Point d'entrée HTML (+ code legacy à nettoyer)
├── index.html                    # Redirection vers FairSplit.html
├── css/
│   ├── variables.css             # Tokens design (couleurs, espacements)
│   ├── base.css                  # Reset, typographie, header
│   ├── components.css            # Boutons, cards, formulaires, charges, FAB, toasts
│   ├── modals.css                # Modales + quick-add
│   ├── auth.css                  # Écran authentification
│   ├── summary.css               # Bilan, catégories, tendances, rappels, virements
│   ├── map.css                   # Carte Leaflet
│   └── responsive.css            # Media queries + print
├── js/
│   ├── app.js                    # Entry point — init Firebase, auth, modules
│   ├── config.js                 # ENV, Firebase config, constantes (catégories, limites)
│   ├── firebase-init.js          # Init Firebase, providers, connexion
│   ├── db.js                     # Abstraction DB (UID-scoped, Partner support)
│   ├── state.js                  # État global centralisé (Observer pattern)
│   ├── utils.js                  # Legacy utils (escapeHtml, formatCurrency)
│   ├── components/
│   │   ├── modal.js              # showModal/closeModal
│   │   └── toast.js              # Notifications toast
│   ├── modules/
│   │   ├── auth.js               # Hub : auth + init de TOUS les modules après login
│   │   ├── period.js             # Gestion périodes, salaires, navigation
│   │   ├── share-mode.js         # Prorata / 50-50 / Custom
│   │   ├── variable-charges.js   # CRUD charges variables
│   │   ├── fixed-charges.js      # CRUD charges fixes
│   │   ├── reimbursements.js     # CRUD remboursements
│   │   ├── summary.js            # Calcul bilan + rendu
│   │   ├── categories.js         # Analyse par catégorie
│   │   ├── search.js             # Recherche/filtres
│   │   ├── export.js             # Export CSV/PDF
│   │   ├── notifications.js      # Rappels navigateur
│   │   ├── trends.js             # Graphiques tendances (SVG)
│   │   ├── reconduction.js       # Reconduction charges fixes
│   │   ├── quick-add.js          # Saisie rapide + GPS
│   │   └── map.js                # Carte Leaflet
│   └── utils/
│       ├── calculations.js       # Fonctions pures (testables) : bilan, virements
│       ├── date.js               # Formatage dates, périodes
│       ├── format.js             # Formatage monétaire, escapeHtml
│       └── validation.js         # Validation inputs
├── tests/
│   └── calculations.test.js      # Tests unitaires Vitest
└── docs/
    └── claude/prompts/           # Prompts d'audit HTML
```

## Adhérences critiques

| Module | Nb imports | Risque |
|--------|-----------|--------|
| `toast.js` | 13 | Critique — feedback utilisateur partout |
| `state.js` | 14 | Critique — état global |
| `format.js` | 9 | Important — affichage monétaire |
| `summary.js` | 7 | Important — calculs dépendants |
| `firebase-init.js` | 5 | Critique — connexion DB |
| `auth.js` | Hub | Critique — initialise TOUS les modules |
| `db.js` | 8 | Critique — abstraction DB + Partner |

Avant de modifier un fichier très importé :
```bash
grep -rl "from '.*MODULE_NAME" js/
```

## Conventions

### CSS
- Tokens dans `css/variables.css` via `var(--xxx)`, jamais de valeurs hardcodées ailleurs
- Mobile-first, breakpoint principal : 600px
- Classes en kebab-case

### JavaScript
- ES6 modules partout, pas de globals sauf compatibilité legacy temporaire (`window.xxx`)
- State centralisé : `getState('key')` / `setState('key', value)` via `state.js`
- DB via `db.js` : `dbGet`, `dbSet`, `dbPush`, `dbUpdate` (paths auto-scopés par UID)
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
- develop = active, main = prod (non déployée)

## Commandes

- `npx vitest run` — tests
- `npx vitest --watch` — tests mode watch
- Live Server VS Code sur `FairSplit.html` — dev local

## Contraintes

- NE PAS modifier `state.js`, `toast.js`, `firebase-init.js`, `db.js` sans vérifier tous les imports
- NE PAS ajouter de JS dans `FairSplit.html` — tout dans les modules
- NE PAS utiliser `innerHTML` avec données utilisateur non échappées
- NE PAS stocker credentials, tokens ou PII dans le code/logs
- NE JAMAIS supprimer de données Firebase sans soft-delete (`deleted: true`)
- TOUJOURS utiliser `db.js` pour accéder Firebase (paths UID-scoped automatiques)
- TOUJOURS écrire un test pour toute nouvelle fonction pure dans `utils/`
- TOUJOURS tester les dépendants après modif d'un module critique

## Workflow

1. Lire les fichiers concernés avant de modifier
2. Vérifier les adhérences si module critique
3. Proposer un plan (3-5 lignes) avant d'implémenter
4. Implémenter avec escapeHtml pour contenu dynamique
5. Vérifier : `npx vitest run` passe

## Design

### Secteur
Finance personnelle / couple. Émotion : confiance, clarté, simplicité.

### Palette cible (non encore appliquée)
```css
:root {
  --primary-color: #4A7CF7;
  --primary-dark: #3B63C9;
  --secondary-color: #7C5CFC;
  --success-color: #22C55E;
  --danger-color: #EF4444;
  --warning-color: #F59E0B;
  --info-color: #3B82F6;
  --dark-bg: #F1F5F9;
  --card-bg: #FFFFFF;
  --text-primary: #1E293B;
  --text-secondary: #64748B;
  --border-color: #E2E8F0;
  --shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}
```

### Principes UX
- Le BILAN doit être la première section visible après la période
- Solde net en gros texte ("Conjointe vous doit X €") avant le détail
- Cibles tactiles minimum 44×44px
- Contrastes WCAG AA (4.5:1 texte, 3:1 grand texte)
- Whitespace généreux

## Problèmes connus

- ~1500 lignes de code commenté dans `FairSplit.html` (migré vers modules, à supprimer)
- `window.quickAddState` legacy encore présent (à migrer vers `state.js`)
- Font Awesome référencé dans modules JS mais non chargé → utiliser emoji
- `FairSplit.html` contient encore du JS legacy (CATEGORIES, event listeners, GPS)
- Thème dark actuel inadapté au secteur (voir palette cible ci-dessus)

## Liens

- @docs/MIGRATION-BONNES-PRATIQUES.md — plan migration 100% modulaire
- @docs/claude/prompts/prompt_html_troubleshooting_v2.md — prompt audit exhaustif
