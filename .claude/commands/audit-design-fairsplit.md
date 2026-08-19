# Audit Design — FairSplit v4.0.0 (branche develop)

**Date** : Mars 2026  
**Fichiers audités** : css/*.css + FairSplit.html + js/modules/*  
**Secteur** : Finance personnelle / gestion de couple  
**Audience** : Couple non-technique, usage quotidien mobile

---

## Résumé

FairSplit a une architecture JS modulaire solide et des fonctionnalités riches (auth, GPS, catégories, tendances, reconduction). Le design visuel reste inadapté au secteur : thème dark gaming/crypto au lieu de la clarté attendue pour une app finance couple. L'interface manque de hiérarchie visuelle — le bilan (info la plus importante) est noyé en bas de page. **Score : 5.5/10.**

---

## Points forts

- **Tokens centralisés** dans `css/variables.css` : changer le thème = modifier un fichier
- **Architecture CSS modulaire** : 8 fichiers séparés, maintenable
- **Architecture JS modulaire** : state centralisé, abstraction DB, modules par fonctionnalité
- **Empty states** : messages quand aucune donnée disponible
- **PWA complète** : manifest, service worker, icônes
- **Accessibilité partielle** : aria-label, aria-expanded, prefers-reduced-motion
- **Auth complet** : Google OAuth + Email/Password, multi-utilisateur + Partner

---

## Problèmes par priorité

### Critique

**1. Thème dark gaming ≠ finance couple**
- **Fichier** : `css/variables.css`
- `#ff5722` (orange feu) + `#1a1a2e` (bleu sombre) = esthétique crypto/gaming
- Finance personnelle couple = clarté, confiance, chaleur
- **Solution** : Migrer `variables.css` vers thème clair (bleu confiance + fond blanc/gris). Effort minimal car tout est en variables CSS. Garder dark mode en option via `prefers-color-scheme`.

**2. Le bilan est invisible (tout en bas)**
- **Fichier** : `FairSplit.html`
- Ordre actuel : Header → Période → Recherche → Salaires → Charges var → Charges fixes → Remboursements → **Résumé** (en dernier)
- Sur mobile, il faut scroller toutes les charges pour trouver "qui doit combien"
- **Solution** : Remonter le résumé/bilan en position 3, juste après la navigation de période. Rendre les salaires pliables (fermés par défaut si renseignés).

**3. Pas de solde net immédiat**
- Le résumé (`summary.js`) affiche un tableau détaillé mais pas de réponse simple à "qui doit combien à qui ?"
- **Solution** : Ajouter un bloc solde net proéminent (gros texte : "Conjointe vous doit 47,30 €" ou "✓ Comptes équilibrés"). Détail en dessous, pliable.

### Important

**4. Contrastes sous seuil WCAG AA**
- `--text-secondary: #c5c5c5` sur `--dark-bg: #1a1a2e` ≈ 4.2:1, sous le seuil AA (4.5:1)
- Labels de formulaires (14px, couleur secondaire) = difficilement lisibles
- **Solution** : Le thème clair résout naturellement. Si dark mode conservé, monter `--text-secondary` à `#D1D5DB` minimum.

**5. Cibles tactiles trop petites**
- `.btn-edit`, `.btn-delete` : ~36×30px (< 44×44px WCAG)
- **Solution** : `min-width: 44px; min-height: 44px; padding: 10px;`

**6. Pas de `<main>` dans le HTML**
- Le conteneur est un `<div class="container" id="mainApp">`
- **Solution** : Remplacer par `<main class="container" id="mainApp">`

**7. Icônes Font Awesome référencées mais non chargées**
- `variable-charges.js` et `fixed-charges.js` utilisent `<i class="fas fa-edit">`
- Font Awesome n'est pas dans le HTML → boutons vides
- **Solution** : Unifier sur emoji (déjà utilisés ailleurs) ou ajouter le CDN Font Awesome

### Mineur

**8. ~1500 lignes de code commenté dans FairSplit.html**
- Blocs `/* COMMENTÉ - MIGRÉ VERS MODULES */` partout
- **Solution** : Supprimer. L'historique Git conserve tout.

**9. FAB peut chevaucher le contenu sur mobile**
- `bottom: 80px` sans padding-bottom sur le conteneur
- **Solution** : `padding-bottom: 100px` sur `.container`

---

## Plan d'implémentation (ordre recommandé)

| Étape | Action | Fichier(s) | Impact |
|-------|--------|-----------|--------|
| 1 | Thème clair | `variables.css`, `base.css` | Visuel maximal, effort minimal |
| 2 | Réorganiser sections | `FairSplit.html` | UX fondamentale |
| 3 | Bloc solde net | `summary.js` | Répond à LA question du couple |
| 4 | Contrastes + cibles tactiles | `variables.css`, `components.css` | Accessibilité |
| 5 | Nettoyage HTML | `FairSplit.html` | Maintenabilité |
| 6 | Dark mode optionnel | `variables.css` + media query | Préférences utilisateur |
