# 🎯 Prochaines Étapes - FairSplit v3.0.0

## ✅ Déjà fait

- ✅ Structure de fichiers créée
- ✅ FairSplit-Test.html créé (avec badge orange TEST)
- ✅ FairSplit-Prod.html créé (version production)
- ✅ manifest.json et manifest-test.json créés
- ✅ index.html et develop/index.html (redirections) créés
- ✅ WORKFLOW-DEV.md créé (guide workflow)
- ✅ .gitignore créé

## 🔥 À FAIRE MAINTENANT : Créer les projets Firebase

### 1️⃣ Créer Firebase TEST

1. Aller sur https://console.firebase.google.com/
2. Cliquer **Ajouter un projet**
3. Nom du projet : **fairsplit-test**
4. Désactiver Google Analytics (optionnel)
5. Cliquer **Créer le projet**

### 2️⃣ Activer Realtime Database (TEST)

1. Dans le projet **fairsplit-test**
2. Menu de gauche → **Realtime Database**
3. Cliquer **Créer une base de données**
4. Localisation : **europe-west1** (Belgique)
5. Règles de sécurité : **Mode test** (temporaire)
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
6. Cliquer **Activer**

### 3️⃣ Récupérer la configuration Firebase TEST

1. Dans le projet **fairsplit-test**
2. Icône **⚙️** (Paramètres) → **Paramètres du projet**
3. Onglet **Général**
4. Section **Vos applications** → **</>** (Web)
5. Enregistrer l'application : **FairSplit TEST**
6. Copier les valeurs :
   - `apiKey`
   - `authDomain`
   - `databaseURL`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

### 4️⃣ Mettre à jour FairSplit-Test.html

1. Ouvrir `FairSplit-Test.html` dans un éditeur
2. Chercher : `VOTRE_API_KEY_TEST`
3. Remplacer toutes les valeurs par la config Firebase TEST

### 5️⃣ Répéter pour Firebase PROD

1. Créer projet **fairsplit-prod**
2. Activer Realtime Database (europe-west1)
3. Règles test temporaires
4. Récupérer config
5. Mettre à jour `FairSplit-Prod.html`

## 📂 Structure finale

```
split-charges-pwa/
├── index.html                          ✅ Créé (redirige vers PROD)
├── FairSplit-Prod.html                 ✅ Créé (à configurer Firebase)
├── FairSplit-Test.html                 ✅ Créé (à configurer Firebase)
├── manifest.json                       ✅ Créé
├── manifest-test.json                  ✅ Créé
├── develop/
│   └── index.html                      ✅ Créé (redirige vers TEST)
├── WORKFLOW-DEV.md                     ✅ Créé
├── PROCHAINES-ETAPES.md               ✅ Ce fichier
├── README.md                           ⏳ À mettre à jour
├── .gitignore                          ✅ Créé
└── [anciens fichiers à supprimer]      ⏳ Cleanup
```

## 🚀 Après configuration Firebase

### 1️⃣ Tester localement

```bash
# Ouvrir FairSplit-Test.html dans le navigateur
# Vérifier console : "Firebase TEST chargé"
# Tester ajout salaires, charges, remboursements
```

### 2️⃣ Créer branche develop

```bash
cd C:\Users\ribigo\Documents\GIT\split-charges-pwa
git checkout -b develop
git add .
git commit -m "feat: FairSplit v3.0.0 - périodes mensuelles + TEST/PROD"
git push -u origin develop
```

### 3️⃣ Déployer sur GitHub Pages

1. GitHub → Settings → Pages
2. Source : **Deploy from branch**
3. Branch : **main** → `/` (root)
4. Sauvegarder

### 4️⃣ Tester sur smartphone

- TEST : https://richiebigot-scoarnec.github.io/split-charges-pwa/develop/
- PROD : https://richiebigot-scoarnec.github.io/split-charges-pwa/

## 💡 Aide-mémoire Firebase Config

### Où trouver les valeurs ?

- **apiKey** : Project Settings > General > Web API Key
- **authDomain** : `{projectId}.firebaseapp.com`
- **databaseURL** : Realtime Database > Data tab (URL en haut)
- **projectId** : Project Settings > General > Project ID
- **storageBucket** : `{projectId}.firebasestorage.app`
- **messagingSenderId** : Project Settings > Cloud Messaging > Sender ID
- **appId** : Project Settings > General > App ID

### Format attendu

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "fairsplit-test.firebaseapp.com",
  databaseURL: "https://fairsplit-test-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fairsplit-test",
  storageBucket: "fairsplit-test.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890abcdef"
};
```

## 📞 Besoin d'aide ?

Si vous êtes bloqué, fournissez-moi :
1. Les configurations Firebase (TEST et PROD)
2. Je mettrai à jour les fichiers HTML pour vous

---

**Version** : 2026-01-27
**Statut** : En attente configurations Firebase
