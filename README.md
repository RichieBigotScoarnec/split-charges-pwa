# 💰 Split Charge Prorata - Application Web PWA avec Synchronisation Firebase

> **Calculateur de répartition de charges au prorata des salaires nets avec synchronisation Firebase en temps réel**

**Version** : 2.1.0-firebase-auth
**Date** : 2026-01-27
**Auteur** : Richie Bigot-Scoarnec
**Assistance** : Claude Code

---

## 📱 Caractéristiques

- ✅ **Progressive Web App (PWA)** - Installable sur smartphone comme application native
- ☁️ **Synchronisation temps réel Firebase** - Partage instantané entre 2 appareils
- 💾 **Sauvegarde automatique** - Fallback localStorage hors ligne
- 📊 **Calculs automatiques** - Répartition proportionnelle selon salaires
- ⚡ **Calcul rapide mobile** - Interface simplifiée pour dépenses quotidiennes
- 📈 **Historique des charges** - Suivi des dépenses avec export CSV
- 🎨 **Interface moderne** - Design adaptatif mobile/desktop
- 🔒 **Sécurisé** - Content Security Policy, pas de tracking

---

## 🚀 Installation sur Smartphone

### 📲 Étape 1 : Transférer le fichier

**Sur Android** :
- Par **email** : Envoyez-vous `Split-ChargeProrata-Firebase.html`
- Via **cloud** : Google Drive / OneDrive / Dropbox
- Par **câble USB** : Copier dans dossier Téléchargements

**Sur iPhone/iPad** :
- Par **AirDrop** depuis un Mac
- Via **iCloud Drive**
- Par **email**

### 📂 Étape 2 : Ouvrir le fichier

**Sur Android (Chrome/Edge)** :
1. Ouvrez l'application **Fichiers**
2. Naviguez jusqu'à `Téléchargements`
3. Appuyez sur `Split-ChargeProrata-Firebase.html`
4. Sélectionnez **Chrome** ou **Edge**

**Sur iPhone/iPad (Safari obligatoire)** :
1. Ouvrez l'application **Fichiers**
2. Localisez le fichier téléchargé
3. Appuyez longuement → **Partager** → **Safari**

### 📱 Étape 3 : Installer comme application

**Sur Android** :
- Chrome affichera "Ajouter à l'écran d'accueil"
- Appuyez sur **Ajouter**
- L'icône 💰 **Charges** apparaît sur l'écran d'accueil

**Sur iPhone/iPad** :
- Dans Safari, appuyez sur le bouton **Partager** 📤
- Faites défiler et sélectionnez **Sur l'écran d'accueil**
- Appuyez sur **Ajouter**
- L'icône 💰 **Charges** apparaît sur l'écran d'accueil

### ✅ Étape 4 : Répéter sur le 2e smartphone

Répétez les étapes 1-3 sur le smartphone de votre conjoint(e) pour activer la synchronisation.

---

## 🔥 Synchronisation Firebase (Automatique)

La configuration Firebase est **déjà intégrée** dans le fichier HTML :

- **Projet** : Split-Charges
- **Database** : `https://split-charges-default-rtdb.europe-west1.firebasedatabase.app`
- **Région** : Europe (europe-west1)

**Aucune configuration supplémentaire n'est requise !**

### Comment ça marche ?

1. **Smartphone 1** : Vous modifiez un salaire ou ajoutez une charge
2. **Firebase** : Les données sont instantanément envoyées vers le cloud
3. **Smartphone 2** : Votre conjoint(e) voit la modification en **< 1 seconde**

**Conditions** :
- Les deux smartphones doivent être connectés à Internet (Wi-Fi ou 4G/5G)
- L'application doit être ouverte (peut être en arrière-plan)

---

## 📖 Utilisation

### 🆕 Premier lancement (sur chaque smartphone)

1. **Ouvrir l'application** installée depuis l'écran d'accueil
2. **Saisir les salaires** :
   - Votre salaire net mensuel (ex: 2900 €)
   - Salaire net de votre conjoint(e) (ex: 1400 €)
3. **Enregistrer** : Bouton **💾 Enregistrer les Salaires**
4. **Notification** : "☁️ Salaires synchronisés" confirme la sauvegarde Firebase

**Synchronisation automatique** :
- Les salaires saisis sur le Smartphone 1 apparaissent instantanément sur le Smartphone 2
- Pas besoin de ressaisir sur chaque appareil !

### ⚡ Calcul Rapide (usage quotidien)

**Interface simplifiée pour dépenses quotidiennes** :

1. **Montant** : Saisir le montant (ex: 75 € pour courses)
2. **Qui a payé ?** : Toggle 👤 **Vous** ou 👤 **Elle**
3. **Résultat immédiat** :
   - Si **Vous avez payé** → "💰 Elle vous doit XX.XX €"
   - Si **Elle a payé** → "💰 Vous lui devez XX.XX €"
4. **Sauvegarder** (optionnel) : Bouton **💾** pour historique
5. **Nouveau calcul** : Bouton **🔄** pour réinitialiser

**Exemple** :
- Votre conjoint(e) fait les courses : **75 €**
- Elle sélectionne **👤 Elle a payé**
- Résultat : **"💰 Vous lui devez 24.42 €"** (32.56% de 75 €)
- ☁️ Synchronisé instantanément sur votre smartphone

### 📊 Charges Multiples (usage avancé)

Pour les charges mensuelles (loyer, EDF, eau...) :

1. Dépliez **Configuration Avancée** (si nécessaire pour modifier salaires)
2. Dépliez **Ajouter plusieurs charges**
3. Ajoutez chaque charge :
   - Montant (ex: 1200 € pour loyer)
   - Description (ex: "Loyer")
   - Type : Mensuel ou Ponctuel
4. Cliquez **🧮 Calculer la répartition**
5. Résultat :
   - Charge totale
   - Votre part + pourcentage
   - Part conjoint(e) + pourcentage

### 📜 Historique des Charges

**Visualiser** :
- Onglet **📜 Historique** affiche toutes les charges enregistrées
- Date, montant, description, répartition

**Exporter CSV** :
- Bouton **📥 Exporter CSV**
- Fichier `historique_charges_YYYY-MM-DD.csv`
- Compatible Excel, Google Sheets, LibreOffice

**Supprimer** :
- Bouton **🗑️ Vider l'Historique**
- Confirmation obligatoire avant suppression
- ⚠️ Supprime l'historique sur **tous les appareils synchronisés**

---

## 🔧 Dépannage

### ❌ Problème : Pas de synchronisation entre smartphones

**Symptômes** :
- Vous ajoutez une charge sur votre smartphone
- Elle n'apparaît pas sur le smartphone de votre conjoint(e)

**Solutions** :

1. **Vérifier la connexion Internet** :
   - Les deux smartphones doivent être en Wi-Fi ou 4G/5G
   - Testez en ouvrant un site web

2. **Vérifier l'état Firebase** :
   - Ouvrez les **Outils de développement** :
     - **Android (Chrome)** : Menu ⋮ → Plus d'outils → Outils de développement → Console
     - **iPhone (Safari)** : Réglages → Safari → Avancé → Activer "Inspecteur Web"
   - Cherchez le message : **"✅ Firebase: CONNECTÉ au serveur"**
   - Si **"⚠️ Firebase: DÉCONNECTÉ"**, passez à l'étape 3

3. **Recharger l'application** :
   - Fermez complètement l'application (balayez depuis le multitâche)
   - Rouvrez-la
   - Attendez 2-3 secondes pour la connexion Firebase
   - Vérifiez à nouveau la console

4. **Tester manuellement** :
   - Sur Smartphone 1 : Modifiez un salaire
   - Sur Smartphone 2 : Rechargez la page (tirer vers le bas)
   - Si synchronisation fonctionne maintenant, OK !

### ❌ Problème : Salaires ne se sauvegardent pas

**Symptômes** :
- Vous saisissez vos salaires
- Message d'erreur ou pas de notification "☁️ synchronisés"

**Solutions** :

1. **Valider les montants** :
   - Salaires doivent être **> 0**
   - Utilisez nombres entiers ou décimaux (ex: 2900 ou 2900.50)
   - Pas de lettres, symboles, ou espaces

2. **Vérifier Firebase Console** :
   - Accédez à [Firebase Console](https://console.firebase.google.com/)
   - Projet **Split-Charges** → **Realtime Database**
   - Vérifiez que `salaireVous` et `salaireConjointe` apparaissent avec vos valeurs

3. **Mode Hors Ligne détecté** :
   - Si vous voyez **"💾 sauvegardés localement"** au lieu de **"☁️ synchronisés"**
   - Cela signifie que Firebase est indisponible
   - Les données restent sur votre appareil uniquement
   - Reconnectez à Internet et rechargez

### ❌ Problème : Erreur "Content Security Policy"

**Symptômes** :
- Erreurs CSP dans la console développeur
- Firebase ne se connecte pas

**Solutions** :

1. **Utiliser HTTPS ou file://** :
   - Ouvrir le fichier localement (`file://`) fonctionne
   - HTTP non sécurisé peut causer des blocages
   - Si hébergé, utilisez HTTPS obligatoirement

2. **Vider le cache** :
   - Fermez tous les onglets de l'application
   - Videz le cache du navigateur :
     - **Android (Chrome)** : Paramètres → Confidentialité → Effacer données navigation
     - **iPhone (Safari)** : Réglages → Safari → Effacer historique et données
   - Rouvrez le fichier

### ❌ Problème : PWA ne s'installe pas sur iPhone

**Symptômes** :
- Pas d'option "Sur l'écran d'accueil" dans Safari

**Solutions** :

1. **Utiliser Safari obligatoirement** :
   - Les PWA ne s'installent pas avec Chrome/Edge sur iOS
   - Ouvrez **obligatoirement** dans Safari

2. **Vérifier manifest.json** :
   - Le fichier `manifest.json` doit être dans le même dossier que le HTML
   - Si manquant, créez-le (voir section Architecture ci-dessous)

3. **Forcer le rechargement** :
   - Safari → Bouton Actualiser (icône circulaire)
   - Essayez à nouveau Partager → Sur l'écran d'accueil

---

## 🛡️ Sécurité et Confidentialité

### 💾 Données stockées

**Localement** (sur votre smartphone) :
- Salaires (localStorage)
- Historique des charges (localStorage)
- Fonctionne hors ligne

**Firebase Cloud** :
- Salaires (synchronisés)
- Historique (synchronisé)
- **Aucune donnée personnelle identifiable** (pas de nom, email, téléphone, GPS...)

### 🔒 Content Security Policy (CSP)

L'application utilise une politique de sécurité stricte :

✅ **Autorisé** :
- Scripts Firebase SDK uniquement (`gstatic.com/firebasejs`)
- Connexions Firebase API uniquement (`*.firebaseio.com`, `*.firebasedatabase.app`, `*.googleapis.com`)
- WebSocket Firebase uniquement (`wss://*.firebaseio.com`, `wss://*.firebasedatabase.app`)

❌ **Bloqué** :
- Scripts externes non autorisés
- Tracking tiers (Google Analytics désactivé)
- Formulaires vers sites externes
- Ressources non Firebase

### 🔐 Règles Firebase et Authentification

**Configuration actuelle** : Authentification anonyme requise

**Règles** :
```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

✅ **Sécurité implémentée** :
- **Authentification anonyme automatique** au lancement de l'app
- Chaque appareil obtient un UID unique Firebase
- **Bloque les accès directs** à Firebase sans passer par l'app
- Même si quelqu'un vole le HTML, il doit **exécuter l'app** pour accéder aux données

**Comment ça fonctionne ?**
1. L'application s'ouvre → Authentification anonyme automatique
2. Firebase génère un UID unique (ex: `a7b2c3d4...`)
3. Avec cet UID, l'app peut lire/écrire dans la base
4. Sans authentification via l'app, aucun accès possible

**Avantages** :
- ✅ **Transparent** : Aucune action requise de l'utilisateur (pas de login/password)
- ✅ **Sécurisé** : Bloque les accès via curl/Postman/scripts malveillants
- ✅ **Simple** : Fonctionne automatiquement
- ✅ **Hors ligne** : Fallback localStorage si Firebase indisponible

---

## 📊 Architecture Technique

### 🏗️ Technologies

- **Frontend** : HTML5 + CSS3 + JavaScript Vanilla (ES2022+)
- **PWA** : Service Worker + Manifest.json
- **Backend** : Firebase Realtime Database v10.7.1 (compat mode)
- **Storage** :
  - **Primaire** : Firebase Realtime Database
  - **Fallback** : localStorage
- **Sécurité** : Content Security Policy

### 📁 Structure des données Firebase

```json
{
  "salaireVous": 2900,
  "salaireConjointe": 1400,
  "chargesHistory": [
    {
      "date": "2026-01-27T10:30:00.000Z",
      "montant": 75,
      "description": "Courses Carrefour",
      "partVous": 50.58,
      "partConjointe": 24.42,
      "pourcentageVous": 67.44,
      "pourcentageConjointe": 32.56
    }
  ]
}
```

### 🔄 Fonctionnement de la synchronisation

#### Sauvegarde (Write)
```javascript
// 1. Utilisateur modifie un salaire
saveToFirebase('salaireVous', 2900)

// 2. Sauvegarde Firebase
→ Firebase.ref('salaireVous').set(2900)

// 3. Sauvegarde locale (backup)
→ localStorage.setItem('salaireVous', 2900)

// 4. Notification utilisateur
→ "☁️ Salaires synchronisés"
```

#### Écoute temps réel (Read)
```javascript
// Firebase écoute les modifications
Firebase.ref('salaireVous').on('value', snapshot => {
  // Mise à jour automatique de l'interface
  const newValue = snapshot.val(); // Ex: 3000
  document.getElementById('salaireVous').value = newValue;

  // Mise à jour localStorage
  localStorage.setItem('salaireVous', newValue);

  console.log('🔄 Salaire Vous synchronisé:', newValue);
});
```

#### Fallback hors ligne
```javascript
// Si Firebase indisponible
if (!isFirebaseAvailable) {
  // Utilisation localStorage uniquement
  localStorage.setItem('salaireVous', 2900);
  notification("💾 sauvegardés localement");
}

// Reconnexion automatique
Firebase.connectedRef.on('value', snapshot => {
  if (snapshot.val() === true) {
    // Internet de retour → synchronisation auto
    syncLocalStorageToFirebase();
  }
});
```

### 📦 Fichiers du projet

```
split-charge-prorata/
├── Split-ChargeProrata-Firebase.html  (v2.0.0-firebase) ← Version avec Firebase
├── Split-ChargeProrata.html           (v1.1.0) ← Version sans Firebase (ancienne)
├── manifest.json                      (PWA manifest)
├── README.md                          (Cette documentation)
├── FIREBASE_SETUP.md                  (Configuration Firebase)
└── icon-512.png                       (Icône PWA - optionnel)
```

**Fichier manifest.json** (requis pour PWA) :
```json
{
  "name": "Split Charge Prorata",
  "short_name": "Charges",
  "description": "Calculateur répartition charges au prorata",
  "start_url": "./Split-ChargeProrata-Firebase.html",
  "display": "standalone",
  "background_color": "#667eea",
  "theme_color": "#667eea",
  "icons": [
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

---

## 📝 Changelog

### v2.1.0-firebase-auth (2026-01-27) - Authentification Anonyme

**🔐 Sécurité renforcée** :

- ✅ **Authentification Firebase Anonymous** :
  - Authentification automatique au lancement (transparente)
  - Chaque appareil obtient un UID unique
  - Bloque accès direct à Firebase sans passer par l'app
  - Règles Firebase : `"auth != null"` (lecture/écriture protégées)

- 🛡️ **Protection contre accès non autorisés** :
  - Même si le HTML est volé, nécessite exécution de l'app
  - Bloque scripts curl/Postman/malveillants
  - Firebase SDK Auth v10.7.1 ajouté
  - Gestion `onAuthStateChanged` pour suivi état authentification

**🔧 Modifications techniques** :

- Ajout `firebase-auth-compat.js` dans les scripts
- Fonction `signInAnonymously()` avec gestion d'erreur
- Variable `isAuthenticated` pour contrôler accès Firebase
- Listeners temps réel activés uniquement si authentifié
- Logs console détaillés : "🔐 Authentification anonyme...", "✅ Authentification réussie"

**📚 Documentation** :

- Section README mise à jour avec explication authentification
- Clarification règles Firebase `auth != null`
- Avantages sécurité documentés

### v2.0.0-firebase (2026-01-27) - Synchronisation Firebase

**✨ Nouveautés majeures** :

- ☁️ **Intégration Firebase Realtime Database** :
  - Synchronisation temps réel entre 2 smartphones
  - Latence < 1 seconde entre appareils
  - Connexion automatique à Firebase au lancement
  - Listeners temps réel sur salaires et historique

- 🔄 **Synchronisation bidirectionnelle** :
  - Modification sur Smartphone 1 → Mise à jour instantanée Smartphone 2
  - Modification sur Smartphone 2 → Mise à jour instantanée Smartphone 1
  - Évite les boucles infinies de synchronisation

- 💾 **Stratégie de stockage dual** :
  - **Primaire** : Firebase Realtime Database (cloud)
  - **Fallback** : localStorage (local)
  - Fonctionne hors ligne avec localStorage
  - Reconnexion automatique quand Internet revient

- 📡 **Monitoring de connexion** :
  - Indicateur temps réel de l'état Firebase
  - Console logs : "✅ Firebase: CONNECTÉ" ou "⚠️ Firebase: DÉCONNECTÉ"
  - Notifications : "☁️ synchronisés" ou "💾 sauvegardés localement"

- 🔒 **Sécurité renforcée** :
  - Content Security Policy optimisé pour Firebase
  - Autorise uniquement domaines Firebase nécessaires
  - Bloque tous scripts/ressources non autorisés
  - Protection XSS maintenue

- 🛠️ **Améliorations techniques** :
  - Conversion async/await pour toutes opérations de stockage
  - Timeout detection (5 secondes) pour détecter blocages
  - Logging détaillé pour debugging
  - Gestion robuste des erreurs Firebase
  - Force mode online avec `goOnline()`

**🔧 Corrections** :

- Gestion erreurs Firebase avec messages explicites
- Évite boucles infinies lors synchronisation
- Dédoublonnage des listeners temps réel
- Fallback localStorage robuste si Firebase indisponible

**📚 Documentation** :

- README complet avec guide installation smartphones
- Section dépannage exhaustive
- Architecture technique détaillée
- FIREBASE_SETUP.md avec configuration

### v1.1.0 (2026-01-26) - Calcul Rapide Mobile + PWA

**📱 Nouvelle fonctionnalité majeure** :

- Section "⚡ Calcul Rapide" mobile-first
- Interface tactile ultra-simplifiée
- Toggle "Qui a payé ?" (Vous / Elle)
- Résultat immédiat en gros caractères
- Bouton optionnel sauvegarde historique

**🚀 PWA (Progressive Web App)** :

- Fichier `manifest.json` pour installation mobile
- Meta tags Apple pour iOS
- Installable sur écran d'accueil
- Lance en plein écran sans barre d'adresse

**🎨 UX/UI** :

- Sections avancées pliables/dépliables
- Design gradient moderne
- Interface tactile optimisée

### v1.0.0 (2026-01-26) - Hardening Sécurité

**🔐 Sécurité** :

- Protection XSS complète (`escapeHtml()`)
- Réécriture `addCharge()` avec `createElement()`
- localStorage sécurisé avec try/catch
- Validation limites (100k€ salaires, 50k€ charges)

**📚 Documentation** :

- JSDoc complète
- Commentaires formules mathématiques
- Section sécurité détaillée README

**♿ Accessibilité** :

- Attributs ARIA complets
- Navigation clavier supportée
- Lecteurs d'écran compatibles

---

## 🎯 Feuille de Route Future

**Améliorations possibles** :

- [ ] Authentification Firebase (sécurité renforcée)
- [ ] Notifications push quand l'autre ajoute une charge
- [ ] Mode sombre
- [ ] Catégories de charges personnalisables
- [ ] Graphiques dépenses mensuelles
- [ ] Export PDF rapports mensuels
- [ ] Multi-devises (€, $, £, CHF...)
- [ ] Widget iOS/Android

---

## 🤝 Support et Contact

### Besoin d'aide ?

1. **Consultez la section Dépannage** ci-dessus
2. **Vérifiez la console développeur** pour messages d'erreur
3. **Testez sur navigateur desktop** avant smartphone

### Signaler un bug

Si vous rencontrez un problème :

1. **Message d'erreur** : Capture d'écran de la console
2. **Étapes de reproduction** : Comment reproduire le bug
3. **Appareil** : Modèle (ex: iPhone 14, Samsung Galaxy S23)
4. **Navigateur** : Nom et version (ex: Safari 17.2, Chrome 120)

---

## 📄 Licence

**Usage personnel uniquement**

© 2026 Richie Bigot-Scoarnec

---

**🎉 Profitez de votre calculateur de charges synchronisé en temps réel !**
