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
   Sa *valeur*, elle, en sort désormais : elle est aussi déposée en secret
   Actions, pour que la CI puisse exécuter les contrôles qui en dépendent
   (voir « Ce que la CI en fait »). GitHub la chiffre au repos, la masque dans
   les journaux et ne l'expose qu'aux exécutions autorisées — mais l'affirmer
   sans le dire aurait laissé croire à un cantonnement qui n'existe plus.
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

Deux fichiers en dépendent — `tests/e2e/reel.spec.js`, cité ici jusqu'au
2026-09-01, n'a jamais existé :

```bash
npx playwright test tests/e2e/scenario-reel.spec.js tests/e2e/bouclier-navigateur.spec.js
```

Sans `FAIRSPLIT_TEST_PASSWORD`, ces suites sont **ignorées** plutôt qu'en
échec.

## Ce que la CI en fait

Cette page a longtemps dit que la CI « n'a pas — et ne doit pas avoir — le
secret ». La position se défendait : une validation contre un service réel est
lente, dépend du réseau, et ne devrait pas retenir une livraison.

Elle avait un coût qu'on n'avait pas mesuré. Relevé le 2026-09-01 : **558
contrôles passés, 17 sautés**. Ces 17 couvrent le chemin de l'argent, la
concurrence entre deux appareils et l'aller-retour de sauvegarde — ce qu'on
veut précisément voir tomber avant une livraison. Verts par absence, ils ne
prouvaient rien, et **9 d'entre eux étaient cassés depuis des semaines** : le
bac à sable ne pouvait plus être vidé depuis le durcissement des règles du
2026-08-27, et deux contrôles mesuraient des libellés que l'application
n'affiche plus.

Le compromis retenu garde les deux intentions :

| | |
| --- | --- |
| Sur une **pull request** | Le secret n'est pas passé. Les 17 se sautent, comme avant. Aucune PR n'est retenue par le réseau ni par un service tiers. |
| Sur un **push vers `main`** | Le secret est passé, les 17 s'exécutent. Une rupture est vue tout de suite, sur la fusion qui l'a causée. |

Le bornage à `push` n'est pas que de la prudence : ces contrôles **vident le
nœud `sandbox`** avant chaque scénario. Deux exécutions simultanées — deux PR
ouvertes le même jour — se marcheraient dessus. Les fusions sur `main`, elles,
sont sérialisées.

## Faire tourner le mot de passe

Le point 4 ci-dessus repose sur cette rotation ; elle demande maintenant deux
gestes au lieu d'un. L'oublier laisserait la CI s'authentifier avec un mot de
passe révoqué.

1. Changer le mot de passe du compte dans la console Firebase.
2. Mettre à jour `.env.local`.
3. Le déposer en secret Actions :

   ```bash
   grep '^FAIRSPLIT_TEST_PASSWORD=' .env.local | gh secret set -f -
   ```

Le filtre `grep` n'est pas un ornement : `gh secret set -f .env.local`
déposerait **toutes** les clés du fichier. Et la valeur transite par l'entrée
standard, donc jamais par `argv` ni par l'historique du shell — c'est le
point 2 ci-dessus, appliqué à la commande elle-même.

Rien ne compare les deux copies : un secret Actions ne se relit pas. Le
détecteur d'écart est la CI — un mot de passe périmé fait tomber les 17
contrôles sur `main`, bruyamment.

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

### Réexamens

**2026-09-01, `firebase-tools` 15.28.2** — toujours vulnérable. La dernière
version publiée tire encore `@opentelemetry/core@1.30.1` (corrigé en 2.8.0) et
`uuid@9.0.1` (corrigé en 11.1.1). Rien à faire côté amont.

La voie restante serait des `overrides` npm. Elle a été écartée : elle
forcerait deux montées de version **majeures** à l'intérieur de
`@google-cloud/pubsub` et `gaxios`, donc de l'outil qui lance les émulateurs et
détient le compte de service dans `deploy-rules`. Le seul test réel serait une
exécution complète des émulateurs, et le casser en silence coûterait plus que
les deux failles.

Ni l'une ni l'autre n'est d'ailleurs atteignable par l'usage qu'on en fait : la
première exige de traiter des en-têtes `baggage` non fiables, la seconde un
appel à `uuid` avec un argument `buf`. La CLI n'emprunte aucun des deux
chemins.

## Pourquoi `@playwright/test` est épinglé sans `^`

Toutes les autres dépendances de développement acceptent une plage. Playwright
non, et c'est délibéré.

Ses navigateurs sont téléchargés **hors de npm**, dans un cache global, et
chaque version de Playwright attend une révision précise. Une résolution de
plage — un `npm install`, un `npm audit fix`, une mise à jour Dependabot —
suffit à désynchroniser les deux, sans rien changer à `package.json`. Le
symptôme est déroutant :

```
browserType.launch: Executable doesn't exist at …chromium_headless_shell-1234…
```

C'est arrivé : `npm audit fix`, lancé pour de tout autres paquets, a résolu
`^1.62.1` vers une version plus récente et fait échouer six tests
d'intégration sur un binaire absent. Rien à voir avec le code testé.

Deux garde-fous :

1. **La version est épinglée** : elle ne change que par une modification
   explicite de `package.json`, visible dans un diff.
2. **`pretest:e2e`** installe le navigateur correspondant avant chaque
   `npm run test:e2e`. L'appel est idempotent — environ 2 s quand le
   navigateur est déjà là, contre un échec incompréhensible sinon.

La CI n'était pas concernée : elle installe depuis le verrou (`npm ci`) puis
le navigateur. C'est le poste de développement qui manquait de garde.
