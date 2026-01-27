# 🚀 Prochaines Étapes - FairSplit v3.0.0

> **Status** : Configuration Firebase terminée ✅
> **Architecture** : DevOps avec GitHub Actions (Option 3)

---

## ✅ Complété

1. ✅ Structure de fichiers créée
2. ✅ Fichiers HTML TEST et PROD générés
3. ✅ **Configuration Firebase intégrée (PROD et TEST)**
4. ✅ PWA manifests (test et prod)
5. ✅ **GitHub Actions workflow créé** (.github/workflows/deploy.yml)
6. ✅ **Documentation complète** (DEPLOYMENT.md)
7. ✅ **Scripts de migration** (migrate-to-branches.ps1 et .sh)

---

## 🚀 Étape 1 : Migration vers branches séparées

### Option A : Utiliser le script automatique (Recommandé)

**Sur Windows (PowerShell) :**
```powershell
.\migrate-to-branches.ps1
```

**Sur Linux/Mac (Bash) :**
```bash
chmod +x migrate-to-branches.sh
./migrate-to-branches.sh
```

Le script va :
- ✅ Créer la branche `main` avec uniquement les fichiers PROD
- ✅ Créer la branche `develop` avec uniquement les fichiers TEST
- ✅ Nettoyer les fichiers non nécessaires
- ✅ Préparer les commits

### Option B : Migration manuelle

Suivre les instructions détaillées dans **[DEPLOYMENT.md](DEPLOYMENT.md)** (section "Configuration Initiale").

---

## 🌐 Étape 2 : Pousser sur GitHub

```bash
# Pousser main (PROD)
git checkout main
git push -u origin main

# Pousser develop (TEST)
git checkout develop
git push -u origin develop
```

---

## ⚙️ Étape 3 : Configurer GitHub Pages

1. Aller sur GitHub → **Settings** → **Pages**
2. **Source** : Deploy from a branch
3. **Branch** : `gh-pages` / `(root)`
4. **Save**

⚠️ **Important** : Choisir `gh-pages` car GitHub Actions va créer cette branche automatiquement lors du premier déploiement.

---

## 🔒 Étape 4 : Protéger la branche main (Optionnel mais recommandé)

1. GitHub → **Settings** → **Branches**
2. **Branch protection rules** → Add rule
3. **Branch name pattern** : `main`
4. Activer :
   - ✅ Require a pull request before merging
   - ✅ Require approvals (1 minimum)
5. **Save changes**

Cela empêche les push directs en PROD et force le workflow de code review.

---

## ✅ Étape 5 : Vérifier le déploiement

### Après le premier push

1. Aller sur GitHub → **Actions**
2. Vérifier que le workflow **"Deploy FairSplit to GitHub Pages"** s'exécute
3. Attendre que le statut passe à ✅ (environ 30-60 secondes)

### Tester les URLs

Remplacer `USERNAME` et `REPO` par vos valeurs :

- **PROD** : `https://USERNAME.github.io/REPO/`
- **TEST** : `https://USERNAME.github.io/REPO/test/`

**Vérifications** :
- ✅ Badge TEST visible sur l'environnement TEST
- ✅ Thème orange (TEST) vs bleu (PROD)
- ✅ Connexion Firebase fonctionnelle
- ✅ Saisie salaires + charges fonctionne
- ✅ Navigation entre périodes fonctionne

---

## 🔥 Étape 6 : Configurer les règles Firebase

### Règles actuelles (Test Mode - Permissif)

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

⚠️ **Attention** : Ces règles permettent à **n'importe qui** de lire/écrire dans votre base de données.

### Règles recommandées pour PROD (avec authentification)

**TODO** : Ajouter Firebase Authentication puis utiliser ces règles :

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "salaries": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "periods": {
      "$period": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

---

## 🎨 Étape 7 : Génération des Icônes PWA

### Icônes requises

- `icon-192.png` (192×192 px) - PROD
- `icon-512.png` (512×512 px) - PROD
- `icon-192-test.png` (192×192 px) - TEST
- `icon-512-test.png` (512×512 px) - TEST

### Outils recommandés

- [PWA Asset Generator](https://www.pwabuilder.com/imageGenerator)
- [RealFaviconGenerator](https://realfavicongenerator.net/)
- Figma / Canva

### Design suggéré

**PROD** :
- Fond : Dégradé bleu-violet (#667eea → #764ba2)
- Emoji : 💰

**TEST** :
- Fond : Dégradé orange (#ff9800 → #ff5722)
- Emoji : 💰 + badge "TEST"

---

## 🔄 Workflow de Développement

### Créer une nouvelle fonctionnalité

```bash
# 1. Partir de develop
git checkout develop
git pull origin develop

# 2. Créer une branche feature
git checkout -b feature/ma-fonctionnalite

# 3. Faire les modifications sur FairSplit-Test.html
# Éditer, tester localement...

# 4. Commit et push
git add .
git commit -m "feat: ajouter ma fonctionnalité"
git push -u origin feature/ma-fonctionnalite

# 5. Créer une Pull Request sur GitHub
# feature/ma-fonctionnalite → develop
```

### Promouvoir TEST vers PROD

```bash
# 1. Vérifier que TEST fonctionne
# Tester sur https://USERNAME.github.io/REPO/test/

# 2. Créer une Pull Request sur GitHub
# develop → main

# 3. Code Review + Tests

# 4. Merge la PR
# → GitHub Actions déploie automatiquement en PROD
```

---

## ✨ Fonctionnalités Futures (v3.1+)

### Court terme
- [ ] Authentification Firebase (Google, Email)
- [ ] Copie automatique charges fixes du mois précédent
- [ ] Export PDF des résumés mensuels
- [ ] Mode offline avec Service Worker

### Moyen terme
- [ ] Notifications push (rappels)
- [ ] Graphiques évolution charges
- [ ] Multi-devises
- [ ] Partage multi-utilisateurs

### Long terme
- [ ] Application mobile native
- [ ] Intégration bancaire
- [ ] Machine Learning (prédictions)

---

## 🐛 Troubleshooting

### Le workflow GitHub Actions ne se déclenche pas

1. Vérifier que `.github/workflows/deploy.yml` existe sur les deux branches
2. **Settings** → **Actions** → **General** → **Workflow permissions** → "Read and write permissions"
3. Vérifier les logs dans **Actions** tab

### Erreur 404 sur les URLs

1. Attendre 2-3 minutes après le premier déploiement
2. Vérifier que `gh-pages` branch existe
3. Vérifier Settings → Pages → Branch = `gh-pages`
4. Vider le cache navigateur (Ctrl+Shift+R)

### Firebase ne se connecte pas

1. Console navigateur (F12) pour voir les erreurs
2. Vérifier les règles Firebase (`.read` et `.write` doivent être `true`)
3. Vérifier les configurations dans les fichiers HTML

### Les deux environnements affichent le même contenu

1. Vérifier que vous êtes sur la bonne branche : `git branch`
2. Vérifier que les fichiers sont différents entre main et develop
3. Attendre que GitHub Actions redéploie après correction

---

## 📚 Ressources

- **Documentation complète** : [DEPLOYMENT.md](DEPLOYMENT.md)
- **Workflow développement** : [WORKFLOW-DEV.md](WORKFLOW-DEV.md)
- Firebase Docs : https://firebase.google.com/docs/database
- GitHub Actions : https://docs.github.com/en/actions
- PWA Guide : https://web.dev/progressive-web-apps/

---

**Version** : 3.0.0
**Dernière mise à jour** : 2025-01-27
**Architecture** : DevOps with GitHub Actions (Option 3)
