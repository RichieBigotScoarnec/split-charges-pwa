# 🚀 Guide de Déploiement FairSplit v3.0.0

> **Architecture DevOps** : Déploiement automatique avec GitHub Actions

---

## 📋 Architecture des Branches

```
Repository: split-charges-pwa
│
├── main (branch)           → 🔵 PRODUCTION
│   ├── index.html         → Redirige vers FairSplit-Prod.html
│   ├── FairSplit-Prod.html
│   ├── manifest.json
│   └── .github/workflows/deploy.yml
│
├── develop (branch)        → 🟠 TEST
│   ├── index.html         → Redirige vers FairSplit-Test.html
│   ├── FairSplit-Test.html
│   ├── manifest-test.json (renommé en manifest.json)
│   └── .github/workflows/deploy.yml (identique)
│
└── gh-pages (branch)       → 🌐 Branche de déploiement (auto-générée)
    ├── index.html         → PROD files
    ├── FairSplit-Prod.html
    ├── manifest.json
    └── test/
        ├── index.html     → TEST files
        ├── FairSplit-Test.html
        └── manifest.json
```

---

## 🔧 Configuration Initiale

### Étape 1 : Préparer la branche main (PROD)

```bash
# S'assurer d'être sur main
git checkout -b main

# Supprimer les fichiers TEST
rm FairSplit-Test.html
rm manifest-test.json
rm -rf develop/

# Mettre à jour index.html pour pointer vers PROD uniquement
# (index.html actuel est déjà correct)

# Commit des fichiers PROD
git add .
git commit -m "chore: préparer branche main (PROD uniquement)"
```

### Étape 2 : Créer la branche develop (TEST)

```bash
# Créer branche develop
git checkout -b develop

# Supprimer les fichiers PROD
rm FairSplit-Prod.html

# Renommer manifest-test.json en manifest.json
mv manifest-test.json manifest.json

# Mettre à jour index.html pour pointer vers TEST
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="0; url=FairSplit-Test.html" />
  <title>FairSplit TEST - Redirection...</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #ff9800, #ff5722);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
    }
    .badge {
      background: rgba(255, 255, 255, 0.2);
      padding: 20px 40px;
      border-radius: 12px;
      backdrop-filter: blur(10px);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="badge">
    <h1>🔧 ENVIRONNEMENT DE TEST</h1>
    <p>Redirection en cours...</p>
  </div>
  <script>
    window.location.href = 'FairSplit-Test.html';
  </script>
</body>
</html>
EOF

# Renommer FairSplit-Test.html devient le fichier principal
# (il reste nommé FairSplit-Test.html pour la cohérence)

# Commit des fichiers TEST
git add .
git commit -m "chore: préparer branche develop (TEST uniquement)"
```

### Étape 3 : Pousser les branches sur GitHub

```bash
# Pousser main
git checkout main
git push -u origin main

# Pousser develop
git checkout develop
git push -u origin develop
```

### Étape 4 : Activer GitHub Pages

1. Aller sur GitHub : `Settings` → `Pages`
2. **Source** : Deploy from a branch
3. **Branch** : `gh-pages` / `(root)`
4. **Save**

> ⚠️ **Important** : Choisir `gh-pages` et non `main`, car GitHub Actions va créer cette branche automatiquement

---

## 🔄 Workflow de Développement

### Développer une nouvelle fonctionnalité

```bash
# 1. Créer une branche feature depuis develop
git checkout develop
git pull origin develop
git checkout -b feature/nouvelle-fonctionnalite

# 2. Faire les modifications sur FairSplit-Test.html
# Éditer FairSplit-Test.html...

# 3. Commit et push
git add FairSplit-Test.html
git commit -m "feat: ajouter nouvelle fonctionnalité"
git push -u origin feature/nouvelle-fonctionnalite

# 4. Créer une Pull Request sur GitHub
# feature/nouvelle-fonctionnalite → develop

# 5. Après merge, develop déploie automatiquement sur TEST
# URL: https://username.github.io/split-charges-pwa/test/
```

### Promouvoir TEST vers PROD

```bash
# 1. Vérifier que TEST fonctionne correctement
# Tester sur https://username.github.io/split-charges-pwa/test/

# 2. Créer une Pull Request sur GitHub
# develop → main

# 3. Code Review + Approbation

# 4. Merge la PR
# GitHub Actions déploie automatiquement en PROD
# URL: https://username.github.io/split-charges-pwa/
```

---

## 🛡️ Protection des Branches (Recommandé)

### Protéger la branche main

1. Aller sur GitHub : `Settings` → `Branches`
2. **Branch protection rules** → Add rule
3. **Branch name pattern** : `main`
4. Activer :
   - ✅ Require a pull request before merging
   - ✅ Require approvals (1 minimum)
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require status checks to pass before merging
5. **Save changes**

### Protéger la branche develop (Optionnel)

Même configuration que main, mais peut être plus souple (0 approbations requises).

---

## 🔍 Vérification du Déploiement

### Après chaque push

1. Aller sur GitHub → **Actions**
2. Vérifier que le workflow **Deploy FairSplit to GitHub Pages** s'exécute
3. Voir les logs pour confirmer le déploiement
4. Attendre ~30 secondes pour la propagation

### URLs de vérification

- **PROD** : `https://username.github.io/split-charges-pwa/`
- **TEST** : `https://username.github.io/split-charges-pwa/test/`

---

## 🔥 Configuration Firebase (Rappel)

### PROD (branche main)
- Database URL : `https://fairsplit-prod-default-rtdb.europe-west1.firebasedatabase.app`
- Project ID : `fairsplit-prod`

### TEST (branche develop)
- Database URL : `https://fairsplit-test-default-rtdb.europe-west1.firebasedatabase.app`
- Project ID : `fairsplit-test`

---

## 🐛 Rollback en cas de problème

### Rollback PROD

```bash
# Option 1 : Revert le dernier commit
git checkout main
git revert HEAD
git push origin main
# GitHub Actions redéploie automatiquement

# Option 2 : Reset à un commit précédent (DANGER)
git checkout main
git reset --hard <commit-hash>
git push --force origin main
```

### Rollback TEST

Même procédure sur la branche `develop`.

---

## 📊 Monitoring

### Vérifier les déploiements

```bash
# Voir l'historique des déploiements
git log --oneline --graph --all

# Voir les runs GitHub Actions
# GitHub → Actions → Deploy FairSplit to GitHub Pages
```

### Logs Firebase

- Console Firebase → Realtime Database → Usage
- Surveiller les lectures/écritures

---

## 🚨 Troubleshooting

### Le workflow ne se déclenche pas

- Vérifier que le fichier `.github/workflows/deploy.yml` existe sur la branche
- Vérifier les permissions : `Settings` → `Actions` → `General` → `Workflow permissions` → Read and write permissions

### Erreur 404 sur les URLs

- Attendre 1-2 minutes après le premier déploiement
- Vérifier que GitHub Pages est activé sur la branche `gh-pages`
- Vider le cache navigateur (Ctrl+Shift+R)

### Firebase ne se connecte pas

- Vérifier les règles Firebase (doivent autoriser lectures/écritures)
- Vérifier la configuration Firebase dans les fichiers HTML
- Console navigateur (F12) pour voir les erreurs

---

## 📚 Ressources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [Firebase Realtime Database Rules](https://firebase.google.com/docs/database/security)
- [PWA Best Practices](https://web.dev/progressive-web-apps/)

---

**Maintenu par** : Richie Bigot-Scoarnec
**Version** : 3.0.0
**Dernière mise à jour** : 2025-01-27
