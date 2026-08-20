# 🔧 Dépannage Authentification Google

## Problème : Le popup Google s'ouvre et se ferme sans authentifier

### Symptôme
- Clic sur "Connexion avec Google"
- Popup s'ouvre dans la barre du haut
- Popup charge quelque chose
- Popup se ferme automatiquement
- L'utilisateur n'est **pas connecté**

---

## ✅ Solution : Configurer les domaines autorisés Firebase

### Étape 1 : Ouvrir la console Firebase

1. Allez sur : https://console.firebase.google.com/
2. Sélectionnez votre projet **fairsplit-foyer**
3. Dans le menu de gauche, cliquez sur **Authentication**

### Étape 2 : Ajouter localhost aux domaines autorisés

1. Cliquez sur l'onglet **Settings** (⚙️ Paramètres) en haut
2. Faites défiler jusqu'à **Authorized domains** (Domaines autorisés)
3. Cliquez sur **Add domain** (Ajouter un domaine)
4. Ajoutez : `localhost`
5. Cliquez sur **Add** (Ajouter)

### Étape 3 : Vérifier que l'authentification Google est activée

1. Dans **Authentication** → **Sign-in method** (Méthode de connexion)
2. Vérifiez que **Google** est **activé** (status: Enabled)
3. Si ce n'est pas le cas :
   - Cliquez sur **Google**
   - Activez le toggle **Enable**
   - Renseignez l'email de support du projet
   - Cliquez sur **Save**

### Étape 4 : Vérifier la configuration OAuth (si le problème persiste)

1. Allez sur : https://console.cloud.google.com/
2. Sélectionnez votre projet Firebase
3. Menu **APIs & Services** → **Credentials**
4. Cliquez sur le **OAuth 2.0 Client ID** pour "Web client (auto created by Google Service)"
5. Dans **Authorized JavaScript origins**, vérifiez que vous avez :
   - `http://localhost`
   - `http://localhost:5500` (ou le port que Live Server utilise)
   - `http://127.0.0.1:5500`
6. Dans **Authorized redirect URIs**, vérifiez que vous avez :
   - `http://localhost`
   - `https://fairsplit-foyer.firebaseapp.com/__/auth/handler`
7. Si manquant, ajoutez-les et cliquez sur **Save**

---

## 🔍 Diagnostic : Vérifier les erreurs dans la console

### Ouvrir la console du navigateur

1. Dans le navigateur (Chrome/Edge/Firefox), appuyez sur **F12**
2. Allez dans l'onglet **Console**
3. Cliquez sur "Connexion avec Google"
4. Observez les messages

### Messages attendus (succès)

```
[Auth] 🔵 signInWithGoogle() appelé
[Auth] 🔵 Récupération auth...
[Auth] ✅ Auth récupéré: OK
[Auth] 🔵 Création GoogleAuthProvider...
[Auth] ✅ GoogleProvider créé: OK
[Auth] 🔵 Lancement signInWithPopup...
[Auth] ✅ Connexion Google réussie !
[Auth] État changé: votre-email@gmail.com
[DB] Current user ID set: a1b2c3d4...
```

### Messages d'erreur possibles

#### Erreur 1 : `auth/unauthorized-domain`
```
[Auth] ❌ ERREUR Google sign-in:
[Auth] ❌ Code erreur: auth/unauthorized-domain
```
**Cause** : `localhost` n'est pas dans les domaines autorisés Firebase
**Solution** : Suivre **Étape 2** ci-dessus

#### Erreur 2 : `auth/popup-closed-by-user`
```
[Auth] ❌ Code erreur: auth/popup-closed-by-user
```
**Cause** : L'utilisateur a fermé le popup manuellement
**Solution** : Réessayer sans fermer le popup

#### Erreur 3 : `auth/popup-blocked`
```
[Auth] ❌ Code erreur: auth/popup-blocked
```
**Cause** : Le navigateur bloque les popups
**Solution** : Autoriser les popups pour localhost dans les paramètres du navigateur

#### Erreur 4 : `auth/network-request-failed`
```
[Auth] ❌ Code erreur: auth/network-request-failed
```
**Cause** : Problème de connexion réseau
**Solution** : Vérifier la connexion Internet

---

## 🧪 Test après configuration

### Test 1 : Connexion Google

1. Actualisez la page (`Ctrl+F5`)
2. Ouvrez la console (`F12`)
3. Cliquez sur "Connexion avec Google"
4. **Popup devrait s'ouvrir dans une nouvelle fenêtre**
5. Sélectionnez votre compte Google
6. Acceptez les permissions demandées
7. **Popup devrait se fermer automatiquement**
8. **Vous devriez être connecté dans FairSplit**

### Vérification du succès

- ✅ L'overlay de connexion a disparu
- ✅ L'application principale est visible
- ✅ Votre nom/photo s'affiche en haut à droite
- ✅ Console affiche : `✅ Utilisateur connecté : votre-nom`
- ✅ Console affiche : `[DB] Current user ID set: ...`

---

## 🔄 Si le problème persiste

### Vider le cache du navigateur

1. Appuyez sur `Ctrl+Shift+Delete`
2. Sélectionnez :
   - ✅ Cookies et autres données de site
   - ✅ Images et fichiers en cache
3. Période : **Dernière heure**
4. Cliquez sur **Effacer les données**
5. Actualisez la page (`Ctrl+F5`)

### Tester dans une fenêtre de navigation privée

1. `Ctrl+Shift+N` (Chrome/Edge) ou `Ctrl+Shift+P` (Firefox)
2. Ouvrez `http://localhost:5500/FairSplit-Test.html`
3. Tentez la connexion Google

### Vérifier que Live Server fonctionne

1. Vérifiez l'icône Live Server dans la barre d'état VS Code (en bas)
2. Devrait afficher : **Port: 5500** (ou autre port)
3. Si absent, clic droit sur `FairSplit-Test.html` → **Open with Live Server**

---

## 📋 Checklist complète

- [ ] Firebase Authentication → Settings → Authorized domains contient `localhost`
- [ ] Firebase Authentication → Sign-in method → Google est **Enabled**
- [ ] Google Cloud Console → OAuth Client → Origins contient `http://localhost` et `http://localhost:5500`
- [ ] Live Server est actif (icône dans barre d'état VS Code)
- [ ] Page chargée via `http://localhost:5500/FairSplit-Test.html` (pas `file://`)
- [ ] Console du navigateur (`F12`) ne montre pas d'erreur `auth/unauthorized-domain`
- [ ] Popup autorisé dans le navigateur (pas de blocker)
- [ ] Cache du navigateur vidé (`Ctrl+Shift+Delete`)

---

## 🆘 Support supplémentaire

Si le problème persiste après avoir suivi toutes ces étapes :

1. Copiez **tout le contenu** de la console du navigateur (`F12` → Console)
2. Notez :
   - URL exacte dans la barre d'adresse
   - Navigateur utilisé (Chrome/Edge/Firefox + version)
   - Messages d'erreur exacts

---

**Date** : 2026-01-31
**Version** : 1.0
