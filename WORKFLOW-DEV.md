# 🔄 Workflow Développement FairSplit

> **Guide complet** pour travailler avec les environnements TEST et PROD

---

## 🏗️ Architecture Dual-Environment

### 🔧 Environnement TEST
- **Branche Git** : `develop`
- **Firebase** : `fairsplit-test`
- **URL** : https://richiebigot-scoarnec.github.io/split-charges-pwa/develop/
- **Fichier** : `FairSplit-Test.html`
- **Badge** : Orange "🔧 ENVIRONNEMENT DE TEST"
- **Usage** : Développement et validation des nouvelles fonctionnalités

### ✅ Environnement PROD
- **Branche Git** : `main`
- **Firebase** : `fairsplit-prod`
- **URL** : https://richiebigot-scoarnec.github.io/split-charges-pwa/
- **Fichier** : `FairSplit-Prod.html`
- **Badge** : Aucun (interface production standard)
- **Usage** : Application en production pour usage quotidien

---

## 🚀 Workflow Standard

### 1️⃣ Développement sur TEST

```bash
# Se positionner sur la branche develop
git checkout develop

# Modifier FairSplit-Test.html
# Tester les changements localement

# Committer les changements
git add FairSplit-Test.html
git commit -m "feat: description de la fonctionnalité"
git push origin develop
```

**Résultat** : Déploiement automatique sur https://.../develop/ sous 2 minutes

### 2️⃣ Validation sur TEST

1. Ouvrir l'application TEST sur smartphone
2. Vider le cache / recharger (pull-to-refresh)
3. Tester toutes les nouvelles fonctionnalités
4. Vérifier que Firebase TEST contient les bonnes données

### 3️⃣ Promotion vers PROD

Une fois validé sur TEST :

```bash
# Se positionner sur main
git checkout main

# Fusionner develop dans main
git merge develop

# Pousser vers GitHub
git push origin main
```

**Résultat** : Déploiement automatique sur https://.../ (PROD) sous 2 minutes

### 4️⃣ Synchronisation sur smartphones

- **Attendre 2 minutes** pour propagation GitHub Pages
- **Ouvrir l'app PROD** sur les smartphones
- **Tirer vers le bas** pour rafraîchir
- Les modifications sont appliquées immédiatement

---

## 🔥 Configurations Firebase

### TEST (`fairsplit-test`)

```javascript
const firebaseConfigTest = {
  apiKey: "VOTRE_API_KEY_TEST",
  authDomain: "fairsplit-test.firebaseapp.com",
  databaseURL: "https://fairsplit-test-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fairsplit-test",
  storageBucket: "fairsplit-test.firebasestorage.app",
  messagingSenderId: "VOTRE_MESSAGING_SENDER_ID_TEST",
  appId: "VOTRE_APP_ID_TEST"
};
```

### PROD (`fairsplit-prod`)

```javascript
const firebaseConfigProd = {
  apiKey: "VOTRE_API_KEY_PROD",
  authDomain: "fairsplit-prod.firebaseapp.com",
  databaseURL: "https://fairsplit-prod-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fairsplit-prod",
  storageBucket: "fairsplit-prod.firebasestorage.app",
  messagingSenderId: "VOTRE_MESSAGING_SENDER_ID_PROD",
  appId: "VOTRE_APP_ID_PROD"
};
```

---

## 📝 Conventions Git

### Types de commits

| Préfixe | Usage | Exemple |
|---------|-------|---------|
| `feat:` | Nouvelle fonctionnalité | `feat: ajout système remboursements` |
| `fix:` | Correction de bug | `fix: calcul prorata incorrect` |
| `refactor:` | Refactoring code | `refactor: optimisation Firebase listeners` |
| `style:` | Changement CSS/UI | `style: amélioration couleurs boutons` |
| `docs:` | Documentation | `docs: mise à jour README` |
| `chore:` | Maintenance | `chore: force redeploy` |

### Commande rapide

```bash
# One-liner pour commit + push
git add . && git commit -m "feat: description" && git push
```

---

## ⚠️ Règles de Sécurité

### 🔧 TEST - Ouvert (développement)

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

### ✅ PROD - Sécurisé (après ajout authentification)

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

---

## 🆘 Dépannage

### Modifications non visibles après push

1. Vérifier GitHub Actions : https://github.com/richiebigot-scoarnec/split-charges-pwa/actions
2. Attendre 2-3 minutes (propagation)
3. Vider cache smartphone : Settings > Apps > FairSplit > Storage > Clear Cache
4. Recharger l'application

### Conflit Git lors du merge

```bash
# Annuler le merge en cours
git merge --abort

# Revenir à l'état précédent
git reset --hard HEAD

# Identifier les différences
git diff main develop
```

---

## 📱 Installation PWA

1. Ouvrir l'URL dans Chrome/Safari mobile
2. Menu > "Ajouter à l'écran d'accueil"
3. Icône créée avec badge orange (TEST) ou bleu (PROD)

---

**Dernière mise à jour** : 2026-01-27
