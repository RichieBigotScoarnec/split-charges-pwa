# 📋 Versions Disponibles

**Date** : 2026-01-27

---

## ✅ VERSION ACTUELLE (Fonctionnelle) : v2.0.0-firebase

**Fichier** : `Split-ChargeProrata-Firebase.html`

**Caractéristiques** :
- ☁️ **Synchronisation Firebase temps réel** activée
- ❌ **PAS d'authentification** (règles Firebase ouvertes requises)
- ✅ **Fonctionne immédiatement** avec ces règles Firebase :

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

**Statut** : ✅ **FONCTIONNEL** (testé et validé)

---

## ⏳ VERSION AVEC SÉCURITÉ (En attente de fix API Key) : v2.1.0-firebase-auth

**Fichier** : Actualisé avec le code d'authentification mais nécessite fix Firebase

**Caractéristiques** :
- ☁️ **Synchronisation Firebase temps réel** activée
- 🔐 **Authentification Firebase Anonyme** (nécessite API Key valide)
- 🛡️ **Règles Firebase sécurisées** :

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

**Statut** : ⏳ **EN ATTENTE** - Erreur `auth/api-key-not-valid` à résoudre

**Solution requise** :
- Vérifier restrictions API Key dans Google Cloud Console
- OU utiliser configuration nouvelle web app "Split-Charges-PWA"

---

## 📝 Notes Importantes

### Utilisation Actuelle

**Pour utiliser l'application MAINTENANT** :

1. ✅ Utiliser `Split-ChargeProrata-Firebase.html` (version v2.0.0)
2. ✅ Vérifier que les règles Firebase sont ouvertes (`".read": true, ".write": true`)
3. ✅ Ouvrir le fichier dans un navigateur
4. ✅ L'application fonctionne avec synchronisation temps réel !

### Sécurité Actuelle

Avec les règles Firebase ouvertes :
- ⚠️ **Risque limité** : Pour usage couple sur 2 smartphones privés
- ⚠️ **Si HTML volé** : Quelqu'un pourrait écrire dans la base
- ✅ **Protection CSP** : Scripts externes bloqués
- ✅ **Protection XSS** : Validation des entrées
- ✅ **Données anonymes** : Aucune information personnelle

### Plan pour Améliorer la Sécurité

**Quand vous aurez du temps** :

1. Résoudre le problème d'API Key Firebase Authentication
2. Réactiver les règles sécurisées (`"auth != null"`)
3. L'authentification anonyme se fera automatiquement
4. Accès Firebase bloqué sans passer par l'application

---

## 🔧 Troubleshooting

### Si Firebase ne se connecte pas

1. Vérifier règles Firebase (doivent être ouvertes pour v2.0.0)
2. Vérifier console navigateur (F12) pour erreurs
3. Vérifier connexion Internet

### Si synchronisation ne fonctionne pas

1. Ouvrir console (F12)
2. Chercher "✅ Firebase: CONNECTÉ au serveur"
3. Si "⚠️ Firebase: DÉCONNECTÉ", vérifier :
   - Configuration Firebase (`firebaseConfig`)
   - Règles Firebase
   - Connexion Internet

---

**Auteur** : Richie Bigot-Scoarnec
**Assistance** : Claude Code
