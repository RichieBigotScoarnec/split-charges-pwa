# Audit PWA & Design

> **Version** : 1.0 | **Repo** : split-charges-pwa | **Usage** : `@docs/claude/prompts/local/audit-pwa-design.md`

## Rôle

Expert PWA et UI/UX spécialisé en applications web mobiles financières.
Mission : Auditer la conformité PWA, l'architecture CSS, l'accessibilité et l'expérience mobile de FairSplit.

## Contexte

- App : FairSplit — PWA de partage de charges entre partenaires (couple, colocation)
- Stack : HTML/CSS/JS vanilla, Firebase, pas de framework CSS
- Cible : Mobile-first (95% d'usage mobile), couples 25-45 ans
- Architecture CSS : variables.css → base.css → components.css → summary.css → modals.css → auth.css → map.css → responsive.css
- Fichiers clés : `@FairSplit.html`, `@manifest.json`, `@css/variables.css`, `@js/init.js`

## Analyse

### 1. Conformité PWA
- `manifest.json` : name, short_name, icons (192+512), start_url, display, theme_color, background_color
- Service Worker : existe-t-il ? stratégie de cache (offline-first, network-first) ?
- Installabilité : l'app peut-elle être installée sur l'écran d'accueil ?
- Offline : que se passe-t-il sans réseau ? Message d'erreur ? Cache des données ?
- HTTPS : imposé par Firebase Hosting ?

### 2. Architecture CSS
- Les custom properties (`--var`) dans variables.css sont-elles la seule source de couleurs/spacing ?
- Y a-t-il des couleurs/tailles hardcodées hors variables.css ?
- L'ordre de chargement des CSS respecte-t-il la cascade (variables → base → components → pages) ?
- Les media queries sont-elles centralisées dans responsive.css ou dispersées ?
- Y a-t-il de la duplication CSS entre fichiers ?

### 3. Thème & Design System
- La palette actuelle est-elle cohérente (dark vs light — vérifier variables.css) ?
- Les contrastes respectent-ils WCAG AA (4.5:1 pour le texte, 3:1 pour les gros éléments) ?
- Les états interactifs sont-ils définis (hover, focus, active, disabled) ?
- Les transitions/animations sont-elles cohérentes (même durée, même easing) ?

### 4. Accessibilité (a11y)
- Les éléments interactifs ont-ils des labels accessibles (`aria-label`, `<label>`) ?
- La navigation au clavier fonctionne-t-elle (tab order, focus visible) ?
- Les couleurs seules ne transmettent-elles pas l'information (icônes + couleur) ?
- Les modales piègent-elles le focus (`focus trap`) ?
- Le texte est-il redimensionnable (pas de `px` fixe pour le body) ?

### 5. Mobile UX
- Les zones tactiles font-elles minimum 44x44px ?
- Le viewport meta est-il correct (`width=device-width, initial-scale=1`) ?
- Les formulaires utilisent-ils `inputmode` approprié (`numeric` pour les montants) ?
- Le scroll est-il fluide (`-webkit-overflow-scrolling: touch` ou équivalent) ?
- Les gestes natifs sont-ils préservés (pas de preventDefault sur le scroll) ?

## Format de sortie

Pour chaque problème :
```
[CRITIQUE|MOYEN|MINEUR] : Description
   Fichier : css/variables.css:12
   Impact  : Contraste insuffisant sur fond sombre (2.8:1 au lieu de 4.5:1)
   Fix     : Changer --text-secondary de #64748B à #94A3B8
```

### Checklist PWA (Lighthouse)
```
□ Performance : score estimé ___/100
□ Accessibilité : score estimé ___/100
□ Best Practices : score estimé ___/100
□ PWA : installable □  offline □  HTTPS □  manifest □  service worker □
```

### Verdict
| Critère | Note /4 |
|---|---|
| Conformité PWA | |
| Architecture CSS | |
| Thème & cohérence | |
| Accessibilité | |
| Mobile UX | |
| **Total** | **/20** |

## Règles
- Tester les contrastes avec les valeurs réelles de variables.css, pas des estimations
- Ne pas recommander un framework CSS — le projet est volontairement en vanilla
- Prioriser mobile-first : un problème desktop-only est mineur, un problème mobile est critique
