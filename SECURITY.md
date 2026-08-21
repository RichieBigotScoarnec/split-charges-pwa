# Sécurité — FairSplit

> **Dernière révision** : 2026-08-20 · Correspond au code de la branche `main`.

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

### 3. Espace unique, refus par défaut

Les données vivent sous `household/`, et les essais sous `sandbox/`
(`?sandbox=1`). Les deux nœuds portent la même liste blanche : le bac à sable
isole les *données*, pas les droits. La racine est explicitement en
`".read": false, ".write": false` : tout nœud non déclaré est inaccessible,
y compris à un compte autorisé.

Chaque espace décrit en outre ce qu'il accepte : types, longueurs et bornes
sur chaque champ, format de période, et refus de tout nœud non déclaré. Sans
ces `.validate`, un compte autorisé — ou un jeton dérobé, ou un onglet
compromis — écrivait n'importe quelle structure, de n'importe quelle taille,
à n'importe quel chemin. Les deux espaces portent le **même** schéma : le bac
à sable éprouve donc réellement ce que le foyer subira
(`tests/compte-bac-a-sable.test.js` verrouille cette égalité, et
`tests/e2e/regles-donnees.spec.js` éprouve les règles contre le moteur réel
de l'émulateur, dans les deux sens — ce que l'application écrit passe, le
reste est refusé).

Ces bornes sont larges à dessein : elles sont une limite d'abus, pas une règle
de saisie. Une sauvegarde issue d'une version antérieure doit pouvoir être
restaurée, et un champ inconnu reste accepté dans une charge tant qu'il s'agit
d'une valeur simple et bornée. Un nœud hérité qui existerait encore en base
doit en revanche être déclaré dans les règles avant qu'une restauration puisse
le réécrire.

Il n'y a **pas** de cloisonnement entre les deux comptes, et c'est délibéré :
ils partagent un budget de foyer, donc le même jeu de données. Aucune
configuration n'est requise — un compte autorisé se connecte et voit tout.

> **Historique.** Une architecture précédente scopait chaque nœud par UID et
> ajoutait une table `partners` redirigeant un « Partner » vers l'espace d'un
> « Owner ». Elle a été retirée : la liste blanche étant figée à deux adresses,
> il n'y avait aucun cloisonnement à assurer, et l'indirection n'apportait
> aucune capacité. Elle coûtait en revanche une sémantique trompeuse —
> `partners/{moi} = X` signifiait « je lis les données de X », alors que
> l'interface laissait croire à une relation mutuelle — qui a produit un accès
> rompu dès la première utilisation réelle.

### 4. Échappement des données affichées

Toute donnée saisie et réinjectée en HTML passe par `escapeHtml()`
([`js/utils/format.js`](js/utils/format.js)). Les champs concernés sont libres :
description de charge, note, libellé de catégorie ou de destination
personnalisée, prénoms des membres.

`escapeHtml()` traite les cinq caractères — `& < > " '` — et non les seuls
`& < >`. L'implémentation d'origine passait par `textContent` puis `innerHTML`,
dont la sérialisation laisse les guillemets intacts : sans conséquence en
contenu d'élément, mais la moitié des appels injectent en contexte d'attribut
(`aria-label="Modifier …"`), où un guillemet refermait l'attribut.

Les prénoms des membres viennent de la base et sont rendus par six chemins
distincts. Ils étaient interpolés sans échappement : `tests/modules/prenoms-echappement.test.js`
verrouille désormais chacun de ces points.

`eslint-plugin-no-unsanitized` signale tout nouvel `innerHTML` dynamique pour
relecture (avertissement — voir [`eslint.config.mjs`](eslint.config.mjs) pour
la justification de la sévérité).

### 5. Content Security Policy

Politique posée en balise `<meta>` dans [`FairSplit.html`](FairSplit.html) :
GitHub Pages ne permet pas de définir d'en-têtes HTTP, donc celle de
[`firebase.json`](firebase.json) n'a jamais été appliquée. Elle n'y sert plus
que si le site est un jour servi par Firebase Hosting.

`default-src 'self'`, plus les seules origines réellement utilisées : gstatic
et unpkg pour les scripts, Google Fonts, les tuiles OpenStreetMap, Firebase en
`connect-src`. Complétée par `object-src 'none'`, `base-uri 'self'` et
`form-action 'self'`. Aucun script inline ni gestionnaire `on*` dans les pages,
ce qui permet de se passer de `'unsafe-inline'` sur `script-src`.

`index.html` porte une politique plus stricte encore — `default-src 'none'` —
son script de redirection ayant été retiré au profit du seul `meta refresh`.

Limite : `frame-ancestors` et `report-uri` sont ignorés en balise `<meta>`.
Ni l'un ni l'autre n'est utilisé ici.

### 6. Intégrité des ressources externes

Firebase SDK et Leaflet sont chargés depuis un CDN avec attribut `integrity`
(SRI) et `crossorigin`. Un CDN compromis ne peut pas substituer son code.

### 7. Validation des saisies

[`js/utils/validation.js`](js/utils/validation.js) : bornes sur les montants
(100 000 € par charge comme par salaire, cf. `LIMITS` dans
[`js/config.js`](js/config.js)), longueurs maximales, format de période. Ces
contrôles préviennent les erreurs de saisie ; ils ne sont **pas** une frontière
de sécurité, étant contournables côté client. La frontière est celle des
`.validate` décrites au point 3, dont les bornes sont plus larges.

---

## Limites connues, assumées

### La clé API Firebase est publique — et ce n'est pas une fuite

`FIREBASE_CONFIG` dans [`js/config.js`](js/config.js) est visible dans le
JavaScript livré. C'est le fonctionnement normal de Firebase côté web : cette
clé identifie le projet, elle n'autorise rien. La protection repose
intégralement sur les règles de base de données.

Corollaire : la confidentialité de l'URL Firebase **n'est pas** une mesure de
sécurité. Toute documentation affirmant le contraire est fausse.

### Un seul environnement

Un seul projet Firebase. Pour essayer sans toucher aux données réelles :
`FairSplit.html?sandbox=1`, qui bascule sur le nœud `sandbox/`.

Isolation plus stricte, si la machine dispose d'un JDK 21+ et du port 9000
libre : `npm run emulators` puis `FairSplit.html?emulator=1`, qui n'écrit rien
dans le cloud.

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
