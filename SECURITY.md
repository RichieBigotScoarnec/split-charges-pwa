# Sécurité — FairSplit

> **Dernière révision** : 2026-08-19 · Correspond au code de la branche `main`.

Ce document décrit ce qui est **effectivement implémenté**. Toute affirmation
ici doit être vérifiable dans le code ; à défaut, elle doit être retirée.

---

## Modèle de menace

Application de gestion de charges pour un couple, deux comptes autorisés,
hébergée en statique sur GitHub Pages avec Firebase Realtime Database.

Les données sont des montants de charges domestiques et deux salaires nets.
Pas de moyen de paiement, pas de données de santé, pas de tiers.

Ce qui compte, dans l'ordre :

1. Empêcher un accès externe aux données financières du foyer.
2. Empêcher qu'un des deux comptes soit usurpé.
3. Éviter qu'une donnée saisie puisse exécuter du code chez l'autre.

Hors périmètre : déni de service, analyse de trafic, compromission d'un
terminal, sécurité physique.

---

## Couches effectivement en place

### 1. Authentification obligatoire

Firebase Authentication, deux fournisseurs : Google et email/mot de passe.
Aucune donnée n'est lisible sans jeton valide — vérifié côté serveur, pas
seulement dans l'interface.

### 2. Liste blanche d'adresses, appliquée côté serveur

Les règles de [`database.rules.json`](database.rules.json) exigent que
`auth.token.email` figure parmi les adresses autorisées. Un compte Google
valide mais non listé est authentifié puis immédiatement rejeté.

La vérification est doublée côté client dans [`js/config.js`](js/config.js)
(`ALLOWED_EMAILS`) et [`js/modules/auth.js`](js/modules/auth.js), qui déconnecte
un compte non autorisé. **Cette seconde vérification est un confort d'interface,
pas une protection** : seules les règles serveur font autorité.

> Ajouter un utilisateur impose donc de modifier `ALLOWED_EMAILS` **et**
> `database.rules.json`, puis de redéployer les règles (`npm run deploy:rules`).

### 3. Cloisonnement par UID

Chaque nœud est indexé par l'UID du propriétaire : `periods/{uid}`,
`salaries/{uid}`, etc. Un utilisateur ne peut atteindre que sa propre branche.

### 4. Partage par consentement mutuel

Le partage entre les deux comptes passe par `partners/{uid}`. L'accès aux
données de A par B exige que **les deux pointeurs se répondent** :
`partners/B === A` **et** `partners/A === B`.

Chacun n'écrit que son propre pointeur — la règle d'écriture est restreinte à
`auth.uid === $uid`. Se déclarer partenaire de quelqu'un ne donne donc aucun
accès tant que l'intéressé n'a pas fait de même de son côté.

Configuration : [`configure-partner.html`](configure-partner.html), à exécuter
une fois par chaque personne avec l'UID de l'autre.

### 5. Échappement des données affichées

Toute donnée saisie et réinjectée en HTML passe par `escapeHtml()`
([`js/utils/format.js`](js/utils/format.js)). Les champs concernés sont libres :
description de charge, note, libellé de catégorie ou de destination
personnalisée.

`eslint-plugin-no-unsanitized` signale tout nouvel `innerHTML` dynamique pour
relecture (avertissement — voir [`eslint.config.mjs`](eslint.config.mjs) pour
la justification de la sévérité).

### 6. Intégrité des ressources externes

Firebase SDK et Leaflet sont chargés depuis un CDN avec attribut `integrity`
(SRI) et `crossorigin`. Un CDN compromis ne peut pas substituer son code.

### 7. Validation des saisies

[`js/utils/validation.js`](js/utils/validation.js) : bornes sur les montants
(50 000 € par charge, 100 000 € par salaire), longueurs maximales, format de
période. Ces contrôles préviennent les erreurs de saisie ; ils ne sont **pas**
une frontière de sécurité, étant contournables côté client.

---

## Limites connues, assumées

### Pas de Content Security Policy active

Une CSP est définie dans [`firebase.json`](firebase.json), sous forme d'en-tête
HTTP. **Elle ne s'applique pas** : le déploiement se fait sur GitHub Pages, qui
ne permet pas de définir d'en-têtes de réponse. Elle ne prendrait effet que sur
Firebase Hosting.

Une balise `<meta http-equiv="Content-Security-Policy">` fonctionnerait sur
GitHub Pages et reste une amélioration possible.

### La clé API Firebase est publique — et ce n'est pas une fuite

`FIREBASE_CONFIG` dans [`js/config.js`](js/config.js) est visible dans le
JavaScript livré. C'est le fonctionnement normal de Firebase côté web : cette
clé identifie le projet, elle n'autorise rien. La protection repose
intégralement sur les règles de base de données.

Corollaire : la confidentialité de l'URL Firebase **n'est pas** une mesure de
sécurité. Toute documentation affirmant le contraire est fausse.

### Un seul environnement

Un seul projet Firebase. Pour développer sans toucher aux données réelles,
utiliser l'émulateur :

```bash
npm run emulators
```

puis ouvrir `FairSplit.html?emulator=1`.

### Suppression logique

Les suppressions sont des `deleted: true`, jamais des effacements. Une donnée
supprimée dans l'interface reste présente en base.

### Vulnérabilités npm résiduelles

`npm audit` signale 5 vulnérabilités modérées, toutes dans la chaîne de
dépendances de `firebase-tools`, qui est une dépendance de développement et
n'est jamais livrée au navigateur. `npm audit fix --force` n'est pas appliqué :
il rétrograderait `firebase-tools` d'une version majeure.

---

## Règles de contribution

- Jamais `".read": true` ni `".write": true` sur des données utilisateur, y
  compris temporairement. Pour du développement sans contrainte : l'émulateur.
- Jamais d'`innerHTML` avec une donnée utilisateur non passée par `escapeHtml()`.
- Jamais de secret, jeton ou donnée personnelle dans le code ou les journaux.
- Les règles vivent dans `database.rules.json` et nulle part ailleurs. Ne jamais
  les éditer à la main dans la console Firebase : le prochain déploiement
  écraserait la modification sans trace.
- Toute action GitHub Actions doit être épinglée par SHA de commit.

---

## Signaler un problème

Dépôt privé à usage familial : ouvrir une issue sur le dépôt.
