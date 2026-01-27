# 🚀 Déploiement sur GitHub Pages

> **Guide complet** pour héberger l'application Split-ChargeProrata sur GitHub Pages

**Date** : 2026-01-27
**Durée estimée** : 10 minutes
**Résultat** : Une URL HTTPS accessible depuis tous vos appareils

---

## 📋 Prérequis

- ✅ Compte GitHub (gratuit) : https://github.com/signup
- ✅ Git installé sur votre PC (déjà le cas car vous utilisez GIT)
- ✅ Fichiers de l'application dans ce dossier

---

## 🎯 Étape 1 : Créer le Repository GitHub

### Option A : Via l'interface web GitHub (Plus simple)

1. **Aller sur GitHub** : https://github.com/new
2. **Remplir les informations** :
   - **Repository name** : `split-charges-pwa` (ou autre nom)
   - **Description** : `Application web de répartition de charges au prorata`
   - **Visibilité** :
     - ✅ **Public** (gratuit, visible par tous mais peu importe pour une app sans données sensibles)
     - ⚠️ **Private** (nécessite GitHub Pro pour GitHub Pages)
   - **NE PAS** cocher "Add a README file"
3. **Cliquer** sur "Create repository"

### Option B : Via la ligne de commande (Déjà dans un repo Git)

Si ce dossier est déjà dans un repo Git existant, vous pouvez créer un sous-dossier dédié ou un repository séparé.

---

## 🎯 Étape 2 : Initialiser Git dans ce Dossier (Si pas déjà fait)

Ouvrir un terminal dans ce dossier et exécuter :

```bash
# Se positionner dans le dossier
cd "C:\Users\ribigo\Documents\GIT\Projets-PowerShell\personal\split-charge-prorata"

# Initialiser Git (si pas déjà fait)
git init

# Ajouter tous les fichiers
git add .

# Premier commit
git commit -m "feat: application split charges v2.0.0 avec Firebase"
```

---

## 🎯 Étape 3 : Lier au Repository GitHub

**Important** : Remplacer `VOTRE-USERNAME` par votre nom d'utilisateur GitHub

```bash
# Ajouter le remote GitHub
git remote add origin https://github.com/VOTRE-USERNAME/split-charges-pwa.git

# Vérifier
git remote -v

# Pousser vers GitHub
git branch -M main
git push -u origin main
```

**Note** : Si vous avez une erreur d'authentification, GitHub vous demandera vos credentials ou un Personal Access Token.

---

## 🎯 Étape 4 : Activer GitHub Pages

### Via l'interface web :

1. **Aller sur votre repository** : `https://github.com/VOTRE-USERNAME/split-charges-pwa`
2. **Cliquer sur "Settings"** (⚙️ en haut à droite)
3. **Dans le menu de gauche**, cliquer sur **"Pages"**
4. **Source** :
   - Branch : `main` (ou `master`)
   - Folder : `/ (root)`
5. **Cliquer sur "Save"**
6. **Attendre 1-2 minutes** que GitHub déploie

### Résultat :

Vous verrez un message :
```
✅ Your site is live at https://VOTRE-USERNAME.github.io/split-charges-pwa/
```

---

## 🎯 Étape 5 : Accéder à l'Application

### URL de votre application :

```
https://VOTRE-USERNAME.github.io/split-charges-pwa/Split-ChargeProrata-Firebase.html
```

**Important** : Notez bien cette URL, c'est celle que vous utiliserez sur vos téléphones !

### Créer un raccourci plus court (Optionnel) :

Renommer `Split-ChargeProrata-Firebase.html` en `index.html` :

```bash
git mv Split-ChargeProrata-Firebase.html index.html
git commit -m "refactor: renommer en index.html pour URL plus courte"
git push
```

Maintenant l'URL devient simplement :
```
https://VOTRE-USERNAME.github.io/split-charges-pwa/
```

---

## 📱 Étape 6 : Installer l'App sur vos Téléphones

### Sur Android (Chrome) :

1. **Ouvrir Chrome** sur le téléphone
2. **Aller sur l'URL** : `https://VOTRE-USERNAME.github.io/split-charges-pwa/`
3. **Menu (⋮)** → **"Ajouter à l'écran d'accueil"**
4. **Confirmer** → L'icône apparaît sur l'écran d'accueil
5. **Ouvrir l'app** : Elle s'ouvre en plein écran comme une app native !

### Sur iOS (Safari) :

1. **Ouvrir Safari** sur l'iPhone
2. **Aller sur l'URL** : `https://VOTRE-USERNAME.github.io/split-charges-pwa/`
3. **Bouton Partage** (⬆️) en bas
4. **"Sur l'écran d'accueil"**
5. **Ajouter** → L'icône apparaît
6. **Ouvrir l'app** depuis l'écran d'accueil

---

## 🔄 Étape 7 : Mettre à Jour l'Application

### Quand vous modifiez le code :

```bash
# 1. Modifier vos fichiers (Split-ChargeProrata-Firebase.html)

# 2. Committer les changements
git add Split-ChargeProrata-Firebase.html
git commit -m "feat: ajout gestion charges fixes/variables"

# 3. Pousser vers GitHub
git push

# 4. Attendre 30 secondes à 2 minutes que GitHub Pages se mette à jour
```

### Sur les téléphones :

1. **Ouvrir l'app**
2. **Tirer vers le bas** pour rafraîchir (ou Ctrl+F5 sur PC)
3. **La nouvelle version se charge automatiquement** !

**Note** : Si la mise à jour ne s'affiche pas, vider le cache :
- Android Chrome : Menu → Paramètres → Effacer les données du site
- iOS Safari : Supprimer l'app et la réinstaller

---

## 🔐 Sécurité

### Données sensibles :

⚠️ **NE JAMAIS METTRE** dans le repository public :
- ❌ Clés API Firebase (elles sont déjà dans le HTML, mais c'est OK pour Firebase Realtime Database public)
- ❌ Mots de passe
- ❌ Informations personnelles

✅ **Ce qui est OK** :
- ✅ Code HTML/CSS/JS de l'application
- ✅ Configuration Firebase (les règles Firebase protègent l'accès)
- ✅ Documentation (README, CHANGELOG, etc.)

### Firebase :

Vos données Firebase sont protégées par :
1. Les **règles Firebase** (`".read": true, ".write": true` pour v2.0.0)
2. L'**authentification anonyme** (quand vous passerez en v2.1.0)

Même si le code est public, personne ne peut accéder à **vos données spécifiques** sans l'URL Firebase exacte.

---

## 🆘 Dépannage

### Erreur "404 Not Found" :

- Vérifier que GitHub Pages est activé (Settings → Pages)
- Attendre 2-3 minutes après activation
- Vérifier l'URL (bien mettre `/Split-ChargeProrata-Firebase.html` à la fin)

### L'app ne se met pas à jour :

```bash
# Forcer le déploiement
git commit --allow-empty -m "chore: force redeploy"
git push
```

Sur le téléphone : Vider le cache du navigateur.

### Erreur d'authentification Git :

GitHub nécessite maintenant un **Personal Access Token** au lieu du mot de passe :

1. Aller sur : https://github.com/settings/tokens
2. **Generate new token (classic)**
3. Cocher **repo** (toutes les sous-options)
4. **Générer** et **copier** le token
5. Utiliser ce token comme mot de passe lors du `git push`

---

## ✅ Checklist Finale

- [ ] Repository GitHub créé
- [ ] Code poussé sur GitHub
- [ ] GitHub Pages activé
- [ ] URL fonctionnelle (testée dans navigateur PC)
- [ ] App installée sur téléphone 1
- [ ] App installée sur téléphone 2
- [ ] Test synchronisation Firebase entre les 2 téléphones
- [ ] Bookmark de l'URL quelque part (au cas où)

---

## 📚 Ressources

- Documentation GitHub Pages : https://pages.github.com/
- Documentation PWA : https://web.dev/progressive-web-apps/
- Documentation Firebase : https://firebase.google.com/docs

---

**Prochaine étape** : Une fois déployé, tester l'application sur vos 2 téléphones et vérifier que :
1. Les charges fixes se sauvegardent et se synchronisent
2. Les charges variables fonctionnent
3. Le récapitulatif global s'affiche correctement
4. L'historique avec filtres fonctionne

Besoin d'aide ? N'hésitez pas ! 🚀
