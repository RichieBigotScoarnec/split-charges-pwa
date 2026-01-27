# ⚡ Commandes Git Rapides

> **Aide-mémoire** pour mettre à jour l'application après modifications

---

## 🔄 Workflow Standard

### 1️⃣ Après avoir modifié le code HTML

```bash
# Voir les fichiers modifiés
git status

# Ajouter les fichiers modifiés
git add Split-ChargeProrata-Firebase.html

# Ou ajouter TOUS les fichiers modifiés
git add .
```

### 2️⃣ Créer un commit

```bash
# Commit avec message descriptif
git commit -m "feat: ajout gestion charges fixes/variables"

# Ou pour une correction de bug
git commit -m "fix: correction calcul prorata"

# Ou pour de la documentation
git commit -m "docs: mise à jour README"
```

### 3️⃣ Pousser vers GitHub

```bash
# Pousser les modifications
git push

# Ou si c'est le premier push
git push -u origin main
```

### 4️⃣ Sur les téléphones

- **Attendre 30 secondes à 2 minutes** que GitHub Pages se mette à jour
- **Ouvrir l'app** et **tirer vers le bas** pour rafraîchir

---

## 📝 Types de Commits Conventionnels

| Préfixe | Utilisation | Exemple |
|---------|-------------|---------|
| `feat:` | Nouvelle fonctionnalité | `feat: ajout filtres historique` |
| `fix:` | Correction de bug | `fix: calcul prorata incorrect` |
| `docs:` | Documentation | `docs: ajout guide déploiement` |
| `style:` | Changement CSS/UI | `style: amélioration couleurs boutons` |
| `refactor:` | Refactoring code | `refactor: simplification fonction calcul` |
| `perf:` | Optimisation performance | `perf: cache Firebase amélioré` |
| `test:` | Ajout de tests | `test: validation calculs` |
| `chore:` | Maintenance | `chore: mise à jour dépendances` |

---

## 🚀 Commandes Avancées

### Voir l'historique des commits

```bash
# Historique détaillé
git log

# Historique compact (une ligne par commit)
git log --oneline

# Historique avec branches visuelles
git log --graph --oneline --all
```

### Annuler des modifications non commitées

```bash
# Annuler les modifications d'un fichier
git checkout -- Split-ChargeProrata-Firebase.html

# Annuler TOUTES les modifications non commitées (ATTENTION)
git reset --hard
```

### Modifier le dernier commit

```bash
# Ajouter des fichiers oubliés au dernier commit
git add fichier-oublie.html
git commit --amend --no-edit

# Modifier le message du dernier commit
git commit --amend -m "Nouveau message"
```

### Annuler un commit déjà poussé

```bash
# Créer un nouveau commit qui annule le précédent
git revert HEAD

# Ou annuler un commit spécifique (remplacer abc123 par le hash)
git revert abc123
```

### Forcer le redéploiement GitHub Pages

```bash
# Si GitHub Pages ne se met pas à jour
git commit --allow-empty -m "chore: force redeploy"
git push
```

---

## 🆘 Dépannage

### "Everything up-to-date"

Vous n'avez rien à pousser (aucun commit depuis le dernier push).

### "Your branch is ahead of 'origin/main' by X commits"

Vous avez des commits locaux non poussés :

```bash
git push
```

### "Your branch is behind 'origin/main'"

Quelqu'un d'autre a poussé des modifications :

```bash
# Récupérer et fusionner
git pull

# Ou récupérer puis fusionner manuellement
git fetch
git merge origin/main
```

### Conflit de fusion

Si deux personnes modifient le même fichier :

```bash
# Git vous montrera les conflits dans les fichiers
# Ouvrir les fichiers et résoudre manuellement les conflits
# (chercher les marqueurs <<<<<<< ======= >>>>>>>)

# Après résolution :
git add fichiers-resolus.html
git commit -m "fix: résolution conflits"
git push
```

### "fatal: not a git repository"

Vous n'êtes pas dans le bon dossier :

```bash
cd "C:\Users\ribigo\Documents\GIT\Projets-PowerShell\personal\split-charge-prorata"
```

---

## 📱 Workflow Quotidien Typique

### Matin : Modifier l'application

```bash
# 1. Ouvrir le fichier HTML dans l'éditeur
# 2. Faire les modifications
# 3. Sauvegarder le fichier
```

### Après-midi : Déployer

```bash
# Se positionner dans le dossier
cd "C:\Users\ribigo\Documents\GIT\Projets-PowerShell\personal\split-charge-prorata"

# Ajouter et committer
git add .
git commit -m "feat: amélioration interface charges fixes"

# Pousser
git push

# Attendre 1-2 minutes puis tester sur le téléphone
```

### Soir : Vérifier sur les téléphones

- Ouvrir l'app
- Tirer vers le bas pour rafraîchir
- Vérifier que les modifications sont visibles

---

## 💡 Bonnes Pratiques

### ✅ À faire :

- Committer souvent (petits commits)
- Messages de commit clairs et descriptifs
- Tester localement avant de pousser
- Utiliser des branches pour des fonctionnalités importantes

### ❌ À éviter :

- Commits géants avec plein de modifications
- Messages vagues ("fix", "update", "changes")
- Pousser du code non testé
- Modifier l'historique publié (`git push --force`)

---

## 🔗 Liens Utiles

- **Repository GitHub** : https://github.com/VOTRE-USERNAME/split-charges-pwa
- **GitHub Pages URL** : https://VOTRE-USERNAME.github.io/split-charges-pwa/
- **Documentation Git** : https://git-scm.com/doc

---

## 📞 Aide Rapide

**Commande la plus utilisée** :

```bash
git add . && git commit -m "feat: description" && git push
```

Cette commande fait tout en une ligne : ajoute, commite, et pousse !

---

**Dernière mise à jour** : 2026-01-27
