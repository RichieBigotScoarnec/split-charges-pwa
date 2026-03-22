# Audit Firebase Realtime Database Rules

> **Version** : 1.0 | **Repo** : split-charges-pwa | **Usage** : `@docs/claude/prompts/local/audit-firebase-rules.md`

## Rôle

Expert Firebase Security spécialisé en Realtime Database Rules.
Mission : Auditer le fichier `database.rules.json` pour identifier les failles de sécurité, les règles trop permissives, les validations manquantes et les incohérences avec la structure de données réelle.

## Contexte

- App : FairSplit — PWA de partage de charges entre partenaires
- Backend : Firebase Realtime Database (pas Firestore)
- Auth : Firebase Authentication (email/password + anonymous)
- Structure attendue : `users/{uid}/charges/`, `users/{uid}/settings/`, `users/{uid}/partner/`
- Fichier à auditer : `@database.rules.json`
- Fichier de config Firebase : `@firebase.json`
- Module auth côté client : `@js/modules/auth.js`
- Module db côté client : `@js/db.js`

## Analyse (ordre strict)

### 1. Authentification & Accès
- Toutes les règles exigent-elles `auth !== null` ?
- L'accès est-il limité au propriétaire (`auth.uid === $uid`) ?
- Existe-t-il des chemins lisibles/écrivables sans authentification ?
- Les données du partenaire sont-elles en lecture seule pour le partenaire invité ?

### 2. Validation des données
- Chaque nœud écrivable a-t-il une règle `.validate` ?
- Les types sont-ils vérifiés (`newData.isString()`, `newData.isNumber()`, `newData.isBoolean()`) ?
- Les montants sont-ils validés (positifs, bornes raisonnables) ?
- Les dates sont-elles au bon format ?
- Les enums sont-elles contraintes (ex: catégories, modes de partage) ?

### 3. Structure & Cohérence
- La structure des rules correspond-elle à la structure réelle utilisée par `db.js` ?
- Y a-t-il des chemins utilisés côté client mais absents des rules ?
- Y a-t-il des rules orphelines (chemins qui n'existent plus) ?
- Les index (`.indexOn`) sont-ils définis pour les requêtes fréquentes ?

### 4. Sécurité avancée
- Protection contre l'écriture massive (pas de `.write: true` à la racine) ?
- Limitation de la profondeur des données (pas de nesting illimité) ?
- Protection contre la suppression accidentelle du compte (`users/{uid}` non supprimable d'un coup ?) ?
- Les règles empêchent-elles un utilisateur de modifier les données d'un autre ?

### 5. Performance
- Les index Firebase sont-ils définis pour les orderByChild/orderByKey utilisés dans db.js ?
- Y a-t-il des règles qui nécessitent des lectures croisées (`root.child(...)`) coûteuses ?

## Format de sortie

Pour chaque problème trouvé :
```
⚠️ [CRITIQUE|MOYEN|MINEUR] : Description du problème
   Chemin  : /users/$uid/charges
   Règle   : ".write": "auth !== null"
   Risque  : Un utilisateur authentifié peut écrire dans les charges de n'importe qui
   Fix     : ".write": "auth.uid === $uid"
```

### Verdict
| Critère | Note /4 |
|---|---|
| Authentification | |
| Validation données | |
| Cohérence structure | |
| Sécurité avancée | |
| **Total** | **/16** |

## Règles
- Lire `database.rules.json` ET `js/db.js` avant d'auditer — les rules sans le client ne suffisent pas
- Ne pas supposer de chemins Firebase non visibles dans le code
- Si une règle est correcte, ne pas inventer de faille pour remplir le rapport
