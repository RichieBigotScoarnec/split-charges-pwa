# Compte de test

Un compte dédié permet d'exercer l'application contre le vrai Firebase, là où
le simulateur des tests end-to-end a déjà montré deux infidélités : les
lectures de nœud parent rendaient `null`, et les écritures multi-chemins depuis
la racine étaient ignorées. Ces deux écarts masquaient des fonctionnalités
entières.

## Ce que le compte peut, et ne peut pas

`testfairsplit@gmail.com` est cantonné au bac à sable par **deux barrières
indépendantes** :

| Barrière | Où | Ce qu'elle garantit |
| --- | --- | --- |
| Règles de sécurité | `database.rules.json` | Fait autorité. `household` lui est refusé côté serveur, quoi que fasse le client. |
| Cantonnement applicatif | `SANDBOX_ONLY_EMAILS` dans `config.js` | La racine des données se résout depuis l'adresse du compte, **pas depuis `?sandbox=1`**. |

La seconde ne remplace pas la première. Elle évite des requêtes vouées au refus,
rend l'intention lisible dans le code, et surtout empêche que l'isolement ne
dépende de la mémoire de celui qui ouvre l'application.

Une bannière signale le bac à sable à l'écran dès la connexion.

## Mot de passe

Le mot de passe vit dans `.env.local`, à la racine du dépôt — fichier **ignoré
par git**.

```dotenv
FAIRSPLIT_TEST_EMAIL=testfairsplit@gmail.com
FAIRSPLIT_TEST_PASSWORD=<le mot de passe>
```

### Pourquoi il n'est pas chiffré

Le chiffrer n'apporterait rien. Pour que les tests puissent déchiffrer, la clé
devrait être aussi accessible que le secret lui-même : on déplacerait le
problème sans le résoudre, en gagnant une impression de sécurité.

Ce qui protège réellement tient en quatre points :

1. **Le fichier ne quitte pas la machine.** `.gitignore` couvre `.env.local`.
2. **Rien ne l'affiche.** Les tests le lisent depuis l'environnement du
   processus. Il ne doit jamais être affiché dans un terminal, ni recopié dans
   un message ou un rapport — c'est par là qu'un secret fuit en pratique, pas
   par le disque.
3. **Les traces Playwright sont désactivées.** Une trace enregistre les
   arguments de `fill`, donc le mot de passe en clair dans un artefact conservé
   sur disque et téléversable.
4. **Le compte est jetable.** Cantonné au bac à sable, désactivable, et son
   mot de passe tourne. C'est la seule protection qui reste valable après une
   fuite.

## Lancer les tests contre le vrai Firebase

```bash
npx playwright test tests/e2e/reel.spec.js
```

Sans `FAIRSPLIT_TEST_PASSWORD`, la suite est **ignorée** plutôt qu'en échec :
la validation contre le vrai Firebase est facultative, et ne doit jamais
bloquer la CI, qui n'a pas — et ne doit pas avoir — le secret.

## Lancer les émulateurs Firebase en local

Les sept tests de `tests/e2e/firebase-integration.spec.js` exigent les
émulateurs. Sans eux ils sont ignorés — et ne tournent donc qu'en CI, ce qui
crée un angle mort : un test d'inscription y est resté cassé après la fermeture
de la création de compte, sans que la vérification locale puisse le voir.

Deux prérequis, tous deux rencontrés sur ce poste :

**Un JDK 21 ou plus récent.** L'émulateur Realtime Database est écrit en Java.
Si `java -version` répond 1.8 ou « command not found » :

```bash
export JAVA_HOME="/c/Program Files/Java/jdk-26.0.2.1"
export PATH="$JAVA_HOME/bin:$PATH"
```

Le rendre permanent — variables d'environnement système — évite de le répéter
à chaque session.

**Un port 9010 libre.** La base émulée écoutait sur 9000, occupé par Zscaler
(`ZSATunnel`) sur certains postes. Le numéro ne porte aucun sens : il a été
déplacé dans `firebase.json`, `js/config.js` et le fichier de tests.

```bash
npm run emulators           # démarre auth (9099) et database (9010)
npm run emulators:test      # démarre, exécute les tests d'intégration, arrête
```

## Alertes Dependabot sur `firebase-tools`

Cinq vulnérabilités modérées sont signalées, toutes issues de `firebase-tools`
par transitivité — `@opentelemetry/core`, `uuid`, `@google-cloud/pubsub`,
`gaxios`.

**Aucune n'atteint l'utilisateur.** Le `package.json` ne déclare *aucune*
dépendance de production : l'application est en modules ES natifs et charge
Firebase depuis un CDN. Ces paquets ne sont jamais servis au navigateur ; ils
ne vivent que sur une machine de développement, le temps d'un émulateur ou
d'un déploiement.

`npm audit fix` ne les résout pas. La seule résolution proposée est
`npm audit fix --force`, qui **rétrograderait `firebase-tools` en 14.x** —
une version majeure antérieure, pour une vulnérabilité sans exposition. Le
remède serait pire.

La position retenue : ne rien rétrograder, et réexaminer quand `firebase-tools`
publiera une version corrigeant ses dépendances transitives. Le point mérite
d'être revu à chaque montée de version, pas ignoré.
