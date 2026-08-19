# Audit Dette Technique FairSplit

> **Version** : 1.0 | **Repo** : split-charges-pwa | **Usage** : `@docs/claude/prompts/local/audit-dette-technique.md`

## Rôle

Expert JavaScript vanilla spécialisé en architecture modulaire et nettoyage de dette technique.
Mission : Identifier et prioriser les dettes techniques accumulées dans FairSplit pour planifier leur résolution.

## Contexte

- App : FairSplit — PWA vanilla JS (pas de framework, pas de bundler pour le code source)
- Architecture : modules ES6 dans `js/modules/`, utilitaires dans `js/utils/`, composants dans `js/components/`
- State management : `js/state.js` (centralisé)
- Tests : Vitest (unit) + Playwright (e2e)
- Dettes connues documentées dans CLAUDE.md — vérifier ce qui est résolu vs toujours présent

## Catégories de dette à auditer

### 1. Code mort & legacy
- `js/utils.js` à la racine : est-il encore importé quelque part ou totalement remplacé par `js/utils/*.js` ?
- Code commenté dans FairSplit.html : blocs `<!-- COMMENTÉ - MIGRÉ -->` et `/* COMMENTÉ */` encore présents ?
- Fonctions exportées mais jamais importées (dead exports) ?
- Variables déclarées mais non utilisées ?

Commandes de vérification :
```bash
# Imports vers utils.js legacy
grep -rn "from.*['\"].*\/utils['\"]" js/ --include="*.js"
grep -rn "from.*['\"].*\/utils\.js['\"]" js/ --include="*.js"

# Code commenté dans HTML (blocs > 5 lignes)
grep -c "COMMENTÉ\|MIGRÉ\|TODO\|FIXME\|HACK" FairSplit.html

# Exports non importés
grep -rn "export " js/ --include="*.js" | grep -oP "export (function|const|class) \K\w+"
```

### 2. Globals & couplage
- Variables sur `window.*` : lister toutes les occurrences de `window.` dans `js/`
- `window.quickAddState` : toujours présent ou migré vers `state.js` ?
- Accès directs au DOM depuis les modules (au lieu de passer par des callbacks/events) ?
- Dépendances circulaires entre modules ?

```bash
# Variables globales window.*
grep -rn "window\." js/ --include="*.js" | grep -v "window.location\|window.addEventListener\|window.confirm\|window.alert\|window.open\|window.firebase\|window.innerWidth"
```

### 3. Dépendances externes
- Font Awesome : est-il dans le HTML (`<link>` ou `<script>`) ou juste référencé dans le JS (`fa-*`) sans être chargé ?
- Firebase SDK : version utilisée ? Chargée via CDN ou npm ?
- Dépendances npm (`package.json`) : y a-t-il des dépendances inutilisées ou des vulnérabilités (`npm audit`) ?

```bash
# Références Font Awesome sans chargement
grep -rn "fa-\|fas \|far \|fab " js/ --include="*.js"
grep -n "font-awesome\|fontawesome" FairSplit.html index.html
```

### 4. Patterns non-idiomatiques
- `var` au lieu de `const`/`let` ?
- Callbacks au lieu de async/await pour les opérations Firebase ?
- Concaténation de strings au lieu de template literals ?
- `==` au lieu de `===` ?
- `innerHTML` avec des données utilisateur (risque XSS) ?

```bash
grep -rn "\bvar " js/ --include="*.js"
grep -rn "[^!=]==[^=]" js/ --include="*.js" | grep -v "===" | head -20
grep -rn "innerHTML" js/ --include="*.js"
```

### 5. Couverture de tests
- Quels modules dans `js/modules/` ont des tests correspondants dans `tests/modules/` ?
- Quels utilitaires dans `js/utils/` sont testés dans `tests/` ?
- Y a-t-il des modules critiques (auth, db, state) sans tests unitaires ?

## Format de sortie

### Inventaire des dettes

| # | Catégorie | Description | Fichier(s) | Sévérité | Effort |
|---|---|---|---|---|---|
| 1 | Code mort | utils.js legacy importé nulle part | js/utils.js | Faible | 5 min |
| 2 | Globals | window.quickAddState encore utilisé | js/modules/quick-add.js | Moyen | 30 min |
| ... | | | | | |

Sévérité : Critique (casse l'app) / Haute (sécurité/perf) / Moyenne (maintenabilité) / Faible (cosmétique)
Effort : estimation en minutes

### Plan de résolution priorisé

```
Phase 1 — Quick wins (<15 min chacun)
  □ #1 : git rm js/utils.js
  □ #3 : ...

Phase 2 — Refactoring ciblé (15-60 min)
  □ #2 : Migrer window.quickAddState → state.js
  □ ...

Phase 3 — Chantiers lourds (>1h)
  □ ...
```

### Métriques
```
Total dettes identifiées : X
  Critiques : X  |  Hautes : X  |  Moyennes : X  |  Faibles : X
Effort total estimé : Xh
Score santé codebase : X/10
```

## Règles
- Exécuter les commandes grep AVANT de lister les dettes — pas de suppositions
- Vérifier le tableau de cohérence du CLAUDE.md pour ne pas re-signaler ce qui est déjà tracké
- Ne pas recommander de migration vers un framework (React, Vue, etc.) — le vanilla JS est un choix délibéré
- Chaque dette doit avoir un effort estimé réaliste
