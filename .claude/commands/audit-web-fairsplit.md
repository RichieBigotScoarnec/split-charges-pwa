# Audit Web FairSplit — Bonnes Pratiques HTML/CSS/JS + Firebase PWA

Analyse les fichiers du projet FairSplit et produis un **audit complet** avec scoring /10 et corrections.

## Cible

Fichier(s) à auditer : $ARGUMENTS (si vide, auditer `FairSplit-Prod.html` et `FairSplit-Test.html`)

## Contexte Projet

- **Architecture** : Single-file HTML (CSS + JS inline) — choix volontaire pour PWA légère
- **Stack** : HTML5, CSS3, JavaScript Vanilla ES2022+, Firebase Realtime Database v10.7.1 (compat)
- **Déploiement** : GitHub Pages (main = PROD, develop = TEST)
- **Usage** : PWA privée couple (2 smartphones), pas un site public SEO
- **Navigateurs cibles** : Chrome Android + Safari iOS (versions récentes)

## Procédure

1. **Lire** intégralement chaque fichier ciblé avant toute analyse
2. **Auditer** selon les 8 axes ci-dessous
3. **Produire** le rapport avec scoring
4. **Proposer** les corrections classées par priorité (Critical → Warning → Info)

## Grille d'Audit (8 axes — Total /10)

### 1. HTML Sémantique & Validité (/1.5)

Vérifier :
- Doctype, `lang="fr"`, `charset`, `viewport` présents et corrects
- Balises sémantiques (`<header>`, `<main>`, `<section>`, `<footer>`) au lieu de `<div>` génériques
- Hiérarchie des headings logique (h1 unique, pas de saut)
- Attributs `alt` sur toutes les images (icônes incluses)
- Formulaires : `<label>` associés aux inputs via `for`/`id`
- Modals : structure accessible (`role="dialog"`, `aria-modal`, `aria-labelledby`)

### 2. Accessibilité WCAG 2.1 AA (/1.5)

Vérifier :
- Navigation clavier : tous les boutons/inputs focusables, modals piègent le focus
- Contraste couleurs sur fond sombre (`--dark-bg: #1a1a2e`) : textes `--text-secondary` (#b0b0b0) vs fond
- Focus visible sur les éléments interactifs (boutons, inputs, select)
- Boutons : texte descriptif (pas juste un emoji comme texte accessible)
- `aria-label` sur les boutons icône (🗑️, ◀, ▶)
- `prefers-reduced-motion` pour les animations (slideIn, spin, modalSlideIn)
- Toasts/notifications : `role="alert"` ou `aria-live="polite"`
- Formulaires modals : focus auto sur le premier champ à l'ouverture

### 3. SEO & Métadonnées (/0.5) — ALLÉGÉ

App privée PWA, pas de SEO critique. Vérifier uniquement :
- `<title>` descriptif présent
- `<meta name="description">` présent
- Meta PWA corrects (`theme-color`, `apple-mobile-web-app-capable`)

(0.5 points au lieu de 1.0 — les 0.5 restants redistribués sur Sécurité)

### 4. CSS Qualité & Maintenabilité (/1.5)

Vérifier :
- Variables CSS `:root` cohérentes et utilisées partout (pas de hex en dur en dehors de `:root`)
- Media queries : breakpoint mobile cohérent, responsive complet
- Pas de `!important`
- Animations : utilisation de `transform`/`opacity` uniquement
- Sélecteurs raisonnables (pas d'imbrication excessive)
- Unités cohérentes (`rem` pour texte, `px` pour bordures/ombres)
- Pas de styles morts (sélecteurs CSS qui ne matchent rien dans le HTML)

### 5. JavaScript Qualité & Bonnes Pratiques (/1.5)

Vérifier :
- `let`/`const` partout, jamais `var`
- Pas de variables globales inutiles — encapsuler si possible
- Gestion d'erreurs : `try/catch` sur Firebase `.once()`, `.set()`, `.on()`
- Pas d'`innerHTML` avec du contenu utilisateur (charges, notes) → `textContent` ou `createElement`
- Event handlers inline (`onclick=""`) dans le HTML → préférer `addEventListener`
- Pas de `console.log` en production (ou flag conditionnel)
- Fonctions courtes et noms descriptifs
- Validation des inputs : montants > 0, pas de NaN, pas d'injection HTML via noms de charges
- Gestion du `Date.now()` comme ID : risque de collision si 2 ajouts simultanés

### 6. Performance & Optimisation (/1.0)

Vérifier :
- Firebase SDK : chargé depuis CDN avec intégrité ? Version à jour ?
- Listeners Firebase : `.once()` vs `.on()` — pas de listeners orphelins
- DOM : `renderAll()` reconstruit tout à chaque changement ? Optimiser avec mise à jour ciblée
- Images/icônes : formats optimisés si présents
- CSS : quantité raisonnable pour un single-file

### 7. Sécurité (/1.5) — RENFORCÉ

(1.5 points au lieu de 1.0 — inclut les 0.5 redistribués depuis SEO)

Vérifier :
- CSP présente et restrictive (autoriser uniquement Firebase SDK + API)
- Pas d'`eval()`, `new Function()`, `document.write()`
- Échappement HTML de toute donnée utilisateur avant insertion DOM (noms de charges, notes)
- Firebase config : clés API côté client = normal pour Firebase, mais vérifier que les rules DB sont documentées
- Firebase rules : `auth != null` en PROD (pas `.read: true, .write: true`)
- Pas de données sensibles dans localStorage en clair
- `rel="noopener noreferrer"` sur tout lien externe `target="_blank"`
- XSS via `charge.name`, `reimb.note` : sont-ils échappés avant rendu HTML ?

### 8. PWA Compliance (/1.0) — RENFORCÉ

(1.0 point au lieu de 0.5 — PWA est le mode de distribution principal)

Vérifier :
- `manifest.json` valide : `name`, `short_name`, `start_url`, `display: standalone`, icons 192+512
- Cohérence manifest ↔ meta tags HTML (`theme-color`, `apple-touch-icon`)
- Service Worker : enregistré ou explicitement documenté comme prévu
- Fallback offline : localStorage fonctionne si Firebase indisponible
- Icônes : fichiers référencés existent (`icon-192.png`, `icon-512.png`)
- Install prompt : banner ou meta tags corrects pour Android + iOS

## Format du Rapport

```
# 🔍 Audit Web FairSplit — [NomFichier]
Date : [date du jour]
Environnement : [PROD / TEST]

## Score Global : X.X / 10

| Axe | Score | Statut |
|-----|-------|--------|
| HTML Sémantique & Validité | X.X/1.5 | 🟢/🟡/🔴 |
| Accessibilité WCAG 2.1 AA | X.X/1.5 | 🟢/🟡/🔴 |
| SEO & Métadonnées | X.X/0.5 | 🟢/🟡/🔴 |
| CSS Qualité | X.X/1.5 | 🟢/🟡/🔴 |
| JavaScript Qualité | X.X/1.5 | 🟢/🟡/🔴 |
| Performance | X.X/1.0 | 🟢/🟡/🔴 |
| Sécurité | X.X/1.5 | 🟢/🟡/🔴 |
| PWA Compliance | X.X/1.0 | 🟢/🟡/🔴 |

## Findings

### 🔴 Critical (à corriger immédiatement)
- [AXE-001] Description — Ligne:XX — Impact

### 🟡 Warning (à corriger prochainement)
- [AXE-002] Description — Ligne:XX — Impact

### 🟢 Info (améliorations optionnelles)
- [AXE-003] Description — Ligne:XX — Suggestion

## Corrections Proposées

### [AXE-001] Titre du finding
**Avant :**
[code actuel avec numéro de ligne]

**Après :**
[code corrigé]

**Pourquoi :** [explication courte]
```

## Barème de Notation

Pour chaque axe :
- **100%** : Aucun finding Critical ni Warning
- **75%** : Pas de Critical, 1-2 Warnings
- **50%** : 1 Critical ou 3+ Warnings
- **25%** : 2+ Criticals
- **0%** : Axe non respecté du tout

Statuts : 🟢 ≥75% | 🟡 50-74% | 🔴 <50%

## Contraintes

- NE PAS inventer de problèmes inexistants — chaque finding cite la ligne exacte
- NE PAS proposer de refactoring complet — corrections ciblées uniquement
- NE PAS pénaliser le choix single-file HTML (CSS/JS inline est voulu)
- NE PAS suggérer de passer à un framework (React, Vue, etc.)
- NE PAS considérer les Firebase client keys comme une faille (c'est le design Firebase)
- TOUJOURS montrer le code avant/après pour chaque correction Critical et Warning
- TOUJOURS vérifier la compatibilité Chrome Android + Safari iOS
