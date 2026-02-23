# 🚀 Guide de Migration Multi-Utilisateur avec Partage Couple

> **Version** : 2.0
> **Date** : 2026-01-31
> **Temps estimé** : 15 minutes

---

## 📋 Vue d'ensemble

Ce guide vous accompagne pour :
1. ✅ Migrer vos données vers une structure multi-utilisateur sécurisée
2. ✅ Activer les règles Firebase de sécurité
3. ✅ Lier votre conjoint(e) pour partager vos données
4. ✅ Vérifier que tout fonctionne

---

## 🎯 Résultat attendu

Après cette migration :
- ✅ Vous et votre conjoint(e) aurez vos propres comptes Google
- ✅ Vous verrez **tous les deux les mêmes données** (charges, salaires, périodes)
- ✅ Vos données sont sécurisées (personne d'autre ne peut y accéder)
- ✅ Vous pouvez vous connecter depuis n'importe quel appareil

---

## 📝 Étape 1 : Préparer la migration (2 min)

### 1.1 Identifier qui sera l'Owner

**Important :** Choisissez qui sera le "Owner" (propriétaire des données).

- **Owner** : La personne qui possède les données actuelles
- **Partner** : Le conjoint qui accédera aux données de l'Owner

💡 **Conseil** : Choisissez la personne qui a actuellement le plus de données saisies.

### 1.2 Vérifier la connexion

1. Ouvrez `FairSplit-Test.html`
2. Connectez-vous avec le compte Google du **Owner**
3. Vérifiez que vos données actuelles sont affichées

---

## 🔄 Étape 2 : Exécuter la migration (5 min)

### 2.1 Lancer le script de migration

1. Ouvrez `migrate-to-multiuser.html` dans votre navigateur
2. Vérifiez que vous êtes connecté avec le bon compte (Owner)
3. Cliquez sur **"🔄 Lancer la Migration"**
4. Attendez la fin (environ 30 secondes)

### 2.2 Vérifier le résultat

Vous devriez voir :
```
✅ Salaires migrés
✅ X périodes migrées
✅ ShareMode migré
✅ Reminders migrés
✅ Vérification OK
✅ Anciennes données supprimées
🎉 MIGRATION TERMINÉE AVEC SUCCÈS !
```

⚠️ **Ne fermez pas encore la page**, notez les prochaines étapes affichées.

---

## 🔒 Étape 3 : Appliquer les règles Firebase (3 min)

### 3.1 Ouvrir la console Firebase

1. Allez sur : https://console.firebase.google.com/project/fairsplit-test/database/fairsplit-test-default-rtdb/rules
2. Connectez-vous avec votre compte Google

### 3.2 Copier les nouvelles règles

1. Ouvrez le fichier `REGLES-FIREBASE-A-APPLIQUER.txt`
2. Copiez **TOUT** le contenu entre les accolades (à partir de la ligne `{`)
3. Revenez dans la console Firebase

### 3.3 Remplacer les règles

1. **Sélectionnez tout** le contenu actuel dans l'éditeur
2. **Supprimez-le**
3. **Collez** les nouvelles règles
4. Cliquez sur **"Publier"** (bouton bleu en haut à droite)
5. Attendez le message de confirmation

✅ **Les règles de sécurité sont maintenant activées !**

---

## 👥 Étape 4 : Lier votre conjoint(e) (5 min)

### 4.1 Obtenir l'UID du Owner

1. Ouvrez `configure-partner.html`
2. Connectez-vous avec le compte du **Owner**
3. Copiez l'UID affiché (bouton "📋 Copier")
4. Envoyez cet UID à votre conjoint(e) (par SMS, email, etc.)

**Exemple d'UID** :
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### 4.2 Le Partner se connecte

1. Le **Partner** ouvre `configure-partner.html`
2. Se connecte avec son propre compte Google
3. Copie son propre UID et l'envoie au Owner

### 4.3 Le Owner lie le Partner

1. Le **Owner** retourne sur `configure-partner.html`
2. Colle l'UID du Partner dans le champ
3. Clique sur **"🔗 Lier le partenaire"**
4. Attend le message de succès

✅ **Le lien est maintenant établi !**

---

## ✅ Étape 5 : Vérification finale (2 min)

### 5.1 Test Owner

1. Le Owner ouvre `FairSplit-Test.html`
2. Vérifie que toutes ses données sont présentes
3. Ajoute une charge de test

### 5.2 Test Partner

1. Le Partner ouvre `FairSplit-Test.html`
2. Devrait voir **exactement les mêmes données** que le Owner
3. Devrait voir la charge de test ajoutée par le Owner

### 5.3 Test bidirectionnel

1. Le Partner ajoute une autre charge
2. Le Owner actualise sa page
3. Devrait voir la charge ajoutée par le Partner

✅ **Si vous voyez tous les deux les mêmes données : C'EST PARFAIT ! 🎉**

---

## 🔧 Dépannage

### "Je ne vois pas les données de mon conjoint"

**Causes possibles :**
1. Les règles Firebase ne sont pas appliquées → Refaire Étape 3
2. Le lien Partner n'est pas établi → Vérifier sur `configure-partner.html`
3. Cache du navigateur → Ctrl+F5 pour actualiser

**Solution :**
```
1. Owner : Ouvrir configure-partner.html
2. Vérifier que "✅ Partenaire lié" est affiché
3. Vérifier que l'UID du Partner est correct
4. Si non : Délier puis re-lier
```

### "Erreur : Cannot access database"

**Cause :** Les règles Firebase bloquent l'accès

**Solution :**
```
1. Vérifier que vous êtes connecté
2. Vérifier que les règles Firebase sont bien appliquées
3. Vérifier que le lien Partner est établi
```

### "Les anciennes données ont disparu"

**Rassurez-vous :** Elles sont juste déplacées !

**Vérification :**
```
1. Connectez-vous avec le compte Owner
2. Ouvrez la console Firebase Database
3. Vérifiez que les données existent sous :
   - salaries/<UID_OWNER>
   - periods/<UID_OWNER>
```

---

## 📱 Utilisation quotidienne

### Se connecter

1. Ouvrez `FairSplit-Test.html`
2. Cliquez sur "Se connecter"
3. Choisissez votre compte Google
4. ✅ Vos données s'affichent automatiquement

### Ajouter une charge

- Peu importe qui ajoute la charge (Owner ou Partner)
- L'autre personne la verra immédiatement après actualisation

### Modifier les salaires

- Les deux peuvent modifier
- Les changements sont visibles pour les deux

### Se déconnecter

1. Cliquez sur votre email en haut à droite
2. Cliquez sur "Se déconnecter"

---

## ⚙️ Gestion du lien Partner

### Délier un partenaire

1. Ouvrez `configure-partner.html`
2. Cliquez sur **"❌ Délier le partenaire"**
3. Confirmez

⚠️ **Attention :** Après déliaison, le Partner ne verra plus les données partagées.

### Changer de partenaire

1. Délier l'ancien partenaire
2. Lier le nouveau partenaire (suivre Étape 4)

---

## 🆘 Support

### Problème technique

1. Vérifiez d'abord la section **Dépannage** ci-dessus
2. Consultez les logs de la console navigateur (F12)
3. Notez le message d'erreur exact

### Questions fréquentes

**Q : Peut-on avoir plus de 2 personnes ?**
R : Non, le système est conçu pour un couple uniquement.

**Q : Les données sont-elles sauvegardées ?**
R : Oui, dans Firebase Realtime Database (cloud).

**Q : Peut-on revenir en arrière ?**
R : Non, la migration est irréversible. Mais vos données sont préservées.

---

## 📊 Structure Firebase finale

Après migration, votre base de données ressemble à :

```
database/
├── salaries/
│   └── <UID_OWNER>/
│       ├── vous: 2500
│       └── conjointe: 2200
├── periods/
│   └── <UID_OWNER>/
│       ├── 2026-01/
│       │   ├── fixedCharges: [...]
│       │   ├── variableCharges: [...]
│       │   └── reimbursements: [...]
│       └── 2026-02/
│           └── ...
├── shareMode/
│   └── <UID_OWNER>/
│       ├── mode: "prorata"
│       └── customPercents: {...}
├── reminders/
│   └── <UID_OWNER>/
│       └── ...
└── partners/
    ├── <UID_OWNER>: <UID_PARTNER>
    └── <UID_PARTNER>: <UID_OWNER>
```

---

## ✅ Checklist finale

Après avoir suivi ce guide, vous devriez avoir :

- [ ] Migration exécutée avec succès
- [ ] Règles Firebase appliquées
- [ ] Partner lié
- [ ] Les deux conjoints voient les mêmes données
- [ ] Ajout de charges fonctionne pour les deux
- [ ] `configure-partner.html` affiche "✅ Partenaire lié"

**Si tous les points sont cochés : FÉLICITATIONS ! 🎉**

Votre FairSplit est maintenant sécurisé et partagé avec votre conjoint(e) !

---

**Besoin d'aide ?** Consultez d'abord la section Dépannage ci-dessus.
