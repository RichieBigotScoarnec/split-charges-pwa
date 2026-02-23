# CLAUDE.md - FairSplit PWA Audit & Troubleshooting

> **Version**: 1.0 | **Usage**: Claude Code CLI | **Context**: Audit récursif HTML/CSS/JS avec gestion des adhérences

---

## 🎯 Rôle

Tu es un **Expert Lead Frontend + UX/UI Designer + Troubleshooter** spécialisé en :
- HTML5 sémantique, CSS3 moderne (variables, responsive, dark mode)
- JavaScript ES6 Modules (import/export)
- Firebase (Firestore, Auth Google/Email)
- PWA (Service Workers, manifest)
- Accessibilité WCAG 2.2
- Debugging avec logique humaine (ne jamais créer d'erreurs en corrigeant)

---

## 📂 Structure du Projet

```
FairSplit/
├── index.html                    # Point d'entrée HTML
├── manifest.json                 # PWA manifest
├── css/
│   ├── variables.css             # Variables CSS (couleurs, espacements)
│   ├── base.css                  # Reset, typographie
│   ├── components.css            # Boutons, formulaires, cards
│   ├── modals.css                # Fenêtres modales
│   ├── responsive.css            # Media queries
│   ├── auth.css                  # Écrans authentification
│   ├── map.css                   # Module cartographie
│   └── summary.css               # Module résumé
├── js/
│   ├── app.js                    # 🔴 ENTRY POINT - Orchestrateur principal
│   ├── config.js                 # Configuration (ENV, VERSION)
│   ├── firebase-init.js          # 🔴 CORE - Init Firebase, providers
│   ├── db.js                     # 🔴 CORE - Abstraction Firestore
│   ├── state.js                  # 🔴 CORE - État global (setState/getState)
│   ├── utils.js                  # Utilitaires legacy (escapeHtml)
│   ├── components/
│   │   ├── modal.js              # Gestion modales (showModal/closeModal)
│   │   └── toast.js              # Notifications toast
│   ├── modules/
│   │   ├── auth.js               # 🔴 HUB - Authentification + init modules
│   │   ├── period.js             # Gestion périodes (mois/année)
│   │   ├── share-mode.js         # Mode de partage (50/50, custom)
│   │   ├── variable-charges.js   # Charges variables
│   │   ├── fixed-charges.js      # Charges fixes
│   │   ├── reimbursements.js     # Remboursements
│   │   ├── summary.js            # 🔴 CALCULATEUR - Calcul soldes
│   │   ├── categories.js         # Catégories de dépenses
│   │   ├── search.js             # Recherche/filtres
│   │   ├── export.js             # Export données
│   │   ├── notifications.js      # Notifications push
│   │   ├── trends.js             # Graphiques tendances
│   │   ├── reconduction.js       # Reconduction charges fixes
│   │   ├── quick-add.js          # Ajout rapide
│   │   └── map.js                # Visualisation carte
│   └── utils/
│       ├── date.js               # Formatage dates
│       ├── format.js             # Formatage monétaire
│       └── validation.js         # Validation inputs
```

---

## 🔗 Graphe des Adhérences (CRITIQUE)

### Dépendances Critiques (ne JAMAIS modifier sans impact analysis)

```
                    ┌─────────────────┐
                    │    app.js       │ Entry Point
                    │   (importe 7)   │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ firebase-init │    │    state.js   │    │   config.js   │
│   (CORE)      │    │    (CORE)     │    │   (CORE)      │
└───────┬───────┘    └───────┬───────┘    └───────────────┘
        │                    │
        │         ┌──────────┴──────────┐
        │         ▼                     ▼
        │   ┌───────────┐        ┌───────────┐
        │   │  auth.js  │◄───────│   db.js   │
        │   │   (HUB)   │        │  (CORE)   │
        │   └─────┬─────┘        └───────────┘
        │         │
        │         │ Initialise TOUS les modules après login
        │         ▼
        │   ┌─────────────────────────────────────────┐
        │   │ period, share-mode, variable-charges,   │
        │   │ fixed-charges, reimbursements, summary, │
        │   │ categories, search, export, etc.        │
        │   └─────────────────────────────────────────┘
        │
        └──────────────────────┐
                               ▼
                    ┌───────────────────┐
                    │  components/      │
                    │  toast.js (13 imports)
                    │  modal.js (4 imports)
                    └───────────────────┘
```

### Modules les Plus Importés (risque élevé si modifiés)

| Module             | Imports | Impact                                    |
| ------------------ | ------- | ----------------------------------------- |
| `toast.js`         | 13      | 🔴 Critique - Feedback utilisateur partout |
| `state.js`         | 14      | 🔴 Critique - État global de l'app         |
| `format.js`        | 9       | 🟠 Important - Affichage monétaire         |
| `summary.js`       | 7       | 🟠 Important - Calculs dépendants          |
| `firebase-init.js` | 5       | 🔴 Critique - Connexion DB                 |

---

## 🛠️ Workflow d'Audit Autonome

### Phase 1 : Scan & Mapping (automatique)

```bash
# 1. Lister tous les fichiers à analyser
find . -type f \( -name "*.html" -o -name "*.css" -o -name "*.js" \) \
  ! -path "./.git/*" ! -path "./node_modules/*" | sort

# 2. Générer le graphe de dépendances JS
grep -rh "^import" js/ --include="*.js" | \
  sed 's/.*from ['"'"'"]//;s/['"'"'"].*//' | sort | uniq -c | sort -rn

# 3. Détecter les exports non utilisés (dead code)
for f in js/**/*.js; do
  exports=$(grep -oE "export (function|const|let|class) \w+" "$f" | awk '{print $3}')
  for exp in $exports; do
    count=$(grep -r "$exp" js/ --include="*.js" | grep -v "^$f:" | wc -l)
    [ "$count" -eq 0 ] && echo "⚠️ DEAD CODE: $exp in $f"
  done
done
```

### Phase 2 : Analyse par Couche

**Ordre d'analyse obligatoire** (respecte les adhérences) :

1. **CORE** (modifier en dernier)
   - `js/config.js`
   - `js/state.js`
   - `js/firebase-init.js`
   - `js/db.js`

2. **UTILS** (peu de dépendants)
   - `js/utils.js`
   - `js/utils/*.js`

3. **COMPONENTS** (dépendances intermédiaires)
   - `js/components/toast.js`
   - `js/components/modal.js`

4. **MODULES** (dépendent de tout le reste)
   - Commencer par les modules "leaf" (peu d'imports)
   - Finir par `auth.js` et `summary.js`

5. **HTML/CSS** (en parallèle)
   - `index.html`
   - `css/*.css`

### Phase 3 : Catégorisation des Problèmes

Pour chaque problème trouvé, classifier :

| Criticité      | Emoji | Définition                             | Action          |
| -------------- | ----- | -------------------------------------- | --------------- |
| **Bloquant**   | 🔴     | Bug visible, crash, données corrompues | Fix immédiat    |
| **Sécurité**   | 🛡️     | XSS, injection, auth bypass            | Fix immédiat    |
| **Important**  | 🟠     | UX dégradée, accessibilité critique    | Fix prioritaire |
| **Mineur**     | 🟡     | Maintenabilité, best practices         | Fix si temps    |
| **Suggestion** | 💡     | Optimisation, amélioration             | Backlog         |

---

## 📋 Checklist d'Audit

### HTML (`index.html`)

- [ ] Sémantique : `<main>`, `<nav>`, `<section>`, `<article>` appropriés
- [ ] Headings : Hiérarchie h1→h6 sans saut
- [ ] Formulaires : `<label for="">`, `aria-describedby` pour erreurs
- [ ] Images : `alt` descriptifs (pas "image")
- [ ] Liens vs Boutons : `<a>` pour navigation, `<button>` pour actions
- [ ] Meta : viewport, description, charset
- [ ] PWA : manifest linkrel, icons, theme-color

### CSS (`css/*.css`)

- [ ] Variables : Utilisées dans `variables.css`, pas de valeurs hardcodées
- [ ] Spécificité : Pas de `!important` abusifs
- [ ] Responsive : Breakpoints cohérents (mobile-first)
- [ ] Contrastes : Ratio ≥ 4.5:1 pour texte normal
- [ ] Focus : `:focus-visible` défini pour navigation clavier
- [ ] Dark mode : `prefers-color-scheme` si applicable
- [ ] Performance : Pas d'animations sur `width`/`height`

### JavaScript (`js/**/*.js`)

- [ ] ES6 Modules : `import`/`export` cohérents, pas de globals
- [ ] Async/Await : Gestion erreurs avec try/catch
- [ ] Firebase : États loading/error/success gérés
- [ ] XSS : `escapeHtml()` pour tout contenu dynamique
- [ ] Memory leaks : `unsubscribe()` pour listeners Firebase
- [ ] DOM : Sélecteurs stables (`data-*`), pas de `.className` fragile
- [ ] Null checks : Optional chaining (`?.`) pour données Firebase

### Accessibilité (WCAG 2.2)

- [ ] Navigation clavier : Tab order logique
- [ ] Focus visible : Outline visible sur tous éléments interactifs
- [ ] Cibles tactiles : Min 44x44px
- [ ] Messages d'erreur : Associés aux champs (`aria-describedby`)
- [ ] Live regions : `aria-live` pour toasts/notifications
- [ ] Skip links : Lien "Aller au contenu" en premier

---

## 📊 Format du Rapport

Le rapport doit être généré en Markdown dans `docs/audit/AUDIT-REPORT.md` :

```markdown
# Rapport d'Audit FairSplit
> Généré le: [DATE]
> Version analysée: [VERSION]

## Résumé Exécutif

| Criticité    | Nombre | Status       |
| ------------ | ------ | ------------ |
| 🔴 Bloquant   | X      | ⬜ À corriger |
| 🛡️ Sécurité   | X      | ⬜ À corriger |
| 🟠 Important  | X      | ⬜ À corriger |
| 🟡 Mineur     | X      | ⬜ Optionnel  |
| 💡 Suggestion | X      | ⬜ Backlog    |

## Problèmes par Criticité

### 🔴 Bloquants

#### [AUDIT-001] Titre du problème
- **Fichier(s)**: `path/to/file.js:42`
- **Impact**: Description de l'impact utilisateur
- **Adhérences**: Modules impactés si correction
- **Correction proposée**:
```js
// AVANT
code problématique

// APRÈS
code corrigé
```

- **Étapes de correction**:
  1. Modifier `fichier.js`
  2. Tester dans `module-dependant.js`
  3. Vérifier regression dans `autre-module.js`

### 🛡️ Sécurité

[...]

### 🟠 Importants

[...]

## Plan de Correction Séquencé

⚠️ **ORDRE OBLIGATOIRE** pour éviter les régressions :

### Étape 1 : Corrections UTILS (sans dépendants)

- [ ] AUDIT-005: Fix validation.js
- [ ] AUDIT-008: Fix format.js

### Étape 2 : Corrections COMPONENTS

- [ ] AUDIT-003: Fix toast.js
  - ⚠️ Tester ensuite: auth.js, variable-charges.js, fixed-charges.js...

### Étape 3 : Corrections MODULES (ordre croissant de dépendants)

- [ ] AUDIT-012: Fix map.js (0 dépendants)
- [ ] AUDIT-007: Fix trends.js (0 dépendants)
- [ ] AUDIT-002: Fix summary.js (7 dépendants)
  - ⚠️ Tester: variable-charges, fixed-charges, reimbursements...

### Étape 4 : Corrections CORE (en dernier)

- [ ] AUDIT-001: Fix state.js
  - ⚠️ Test de régression COMPLET requis

## Annexe : Graphe des Dépendances

[Inclure le graphe ASCII ou Mermaid]
```

---

## ⚠️ Règles Anti-Régression

### JAMAIS faire sans analyse d'impact

1. **Renommer une fonction exportée** → Vérifier tous les imports
2. **Changer la signature d'une fonction** → Adapter tous les appels
3. **Modifier `state.js`** → Impact sur TOUTE l'application
4. **Modifier `toast.js`** → 13 modules utilisent les toasts
5. **Toucher `firebase-init.js`** → Peut casser l'auth et la DB

### TOUJOURS faire avant de corriger

```bash
# Lister les fichiers qui importent le module à modifier
grep -rl "from '.*MODULE_NAME" js/

# Exemple: Qui importe toast.js ?
grep -rl "from '.*toast" js/
# Résultat: 13 fichiers → tester les 13 après modification
```

### Pattern de correction sécurisé

```javascript
// 1. Ajouter la nouvelle version SANS supprimer l'ancienne
export function newFunction() { /* nouvelle implémentation */ }
export function oldFunction() { /* ancienne - deprecated */ }

// 2. Migrer les appelants un par un
// 3. Supprimer l'ancienne UNIQUEMENT quand plus utilisée
```

---

## 🚀 Commande d'Exécution

Pour lancer l'audit complet :

```
Analyse le projet FairSplit en suivant CLAUDE.md :
1. Scanne récursivement tous les fichiers HTML/CSS/JS
2. Mappe les dépendances entre modules
3. Identifie les problèmes par criticité
4. Génère le rapport dans docs/audit/AUDIT-REPORT.md
5. Propose un plan de correction séquencé respectant les adhérences
```

---

## 📚 Références

- [MDN Web Docs](https://developer.mozilla.org/)
- [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/)
- [Firebase Web Docs](https://firebase.google.com/docs/web/setup)
- [ES6 Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

---

**Maintainer**: Richie avec Claude Code
