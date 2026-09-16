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

L'espace du foyer exige en outre `auth.token.email_verified`. Sans cette
condition, l'adresse seule décidait de l'accès — or le fournisseur e-mail/mot
de passe est actif et `accounts:signUp` reste joignable avec la clé publique du
projet : `SIGNUP_ENABLED` masque un bouton, il ne ferme pas l'endpoint. Un
compte créé par cette API porte `email_verified: false` et n'entre donc pas,
même s'il revendique une adresse de la liste blanche. Les deux comptes du foyer
passent par Google, dont les jetons portent toujours la revendication.

Le bac à sable n'exige pas la vérification : le compte de test s'y authentifie
par mot de passe, et n'a aucune adresse à prouver pour manipuler des données
d'essai. C'est la seule différence entre les deux espaces — le schéma, lui, est
identique.

`auth.js` refuse également une adresse non vérifiée côté interface. Confort là
encore, mais un confort qui compte : sans lui, le compte s'authentifiait,
l'écran s'ouvrait, et chaque lecture échouait ensuite une à une sans que la
cause apparaisse nulle part.

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

Il n'y a **pas** de cloisonnement entre les deux comptes sur la poche
**commune**, et c'est délibéré : ils partagent un budget de foyer, donc le même
jeu de données. Aucune configuration n'est requise — un compte autorisé se
connecte et voit le commun.

#### La poche personnelle, elle, est cloisonnée (2026-09-16)

`household/personnel/{vous|conjointe}` porte les dépenses qui n'appartiennent
qu'à une personne. Son `.read` est celui de `prive/` — repris **verbatim**, une
seule rédaction du mur : son propriétaire toujours, l'autre **seulement** si
`aval/{qui}/actif` vaut `true`. L'aval ouvre la lecture, jamais l'écriture.

**C'est ce qui a obligé le `.read` à descendre d'un cran.** Il vivait à la
racine de `household` et y cascadait sur tout : un `.read` accordé plus haut ne
se révoque nulle part en dessous — c'est ce que le commit `4ac03f8` avait
établi pour `.write`, dans l'autre sens. Un sous-arbre caché sous une racine
lisible était donc impossible. Le droit est désormais posé sur **chacun des
enfants directs** des deux espaces, à l'identique de ce que portait la racine,
et sur `personnel/{qui}` avec sa clause d'aval.

Un seul cran, pas jusqu'aux feuilles : une écriture vise une feuille, une
lecture vise un conteneur — on lit `variableCharges` en entier pour afficher
une liste, et un `.read` aux feuilles rendrait toute liste illisible.

Deux conséquences visibles, et les deux sont voulues :

- **la racine d'un espace ne se lit plus en une requête.** Realtime Database
  refuse un nœud EN ENTIER, jamais partiellement : `dbGet()` sans argument ne
  rendait pas une lecture amputée, il ne rendait rien. La sauvegarde lit donc
  nœud par nœud (`plansDeLecture`, `js/modules/backup.js`) ;
- **`personnel` ne se lit pas non plus d'un coup**, puisque son droit vit sur
  chaque moitié. Chacun ne lit que la sienne.

`tests/regles/mur-prive.test.js` tient l'ensemble **contre l'émulateur** et non
contre le fichier de règles : chacun lit son personnel, l'autre ne le lit pas
sans aval, l'aval actif ouvre la lecture et lui seul, un aval retiré referme,
et chaque enfant direct du foyer reste lisible par les deux.

> **Ce que ce cloisonnement ne fait pas encore.** Les dépenses `perimetre:
> 'solo'` déjà en base vivent toujours dans la poche commune, donc lisibles par
> l'autre. Le lot P1a pose le mur, le schéma et les contrôles ; il ne déplace
> aucune donnée — les 37 points de passage qui lisent une liste de charges
> doivent d'abord savoir lire les deux poches, sans quoi ils cesseraient de
> compter le personnel **en restant verts**.

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
Ni l'un ni l'autre n'est utilisé ici. Conséquence assumée : aucune protection
contre l'affichage du site dans un cadre tiers n'est possible tant que
l'hébergement est GitHub Pages, qui ne permet pas non plus `X-Frame-Options`.

La politique de référent est fixée explicitement à
`strict-origin-when-cross-origin` : le géocodage inversé interroge Nominatim,
et l'adresse complète de la page n'a pas à l'accompagner. L'origine reste
envoyée, donc une restriction de clé API par référent continue de fonctionner.

### 6. App Check — attestation de l'origine des requêtes

Les règles vérifient *qui* parle. App Check atteste *d'où* : le jeton prouve
que la requête vient de cette application, et non d'un script quelconque muni
de la clé API — laquelle est publique par construction. C'est ce qui limite le
martèlement de `signInWithPassword` contre les deux comptes du foyer, que les
règles de base de données ne voient même pas passer.

Le câblage vit dans [`js/firebase-init.js`](js/firebase-init.js), activé entre
l'initialisation de l'application et le premier accès. Il est **inerte tant que
`APP_CHECK_SITE_KEY` est vide** dans [`js/config.js`](js/config.js) — la clé de
site reCAPTCHA, publique elle aussi, se récupère dans la console Firebase.

> ⚠️ **Ne pas activer l'application forcée dans la console tant que cette clé
> est vide.** Toute requête serait refusée et l'application n'afficherait plus
> rien. La console distingue « non appliqué » (mesure seule) et « appliqué » :
> renseigner la clé, déployer, vérifier les mesures pendant quelques jours,
> puis appliquer.

Chaque abandon est journalisé — clé absente, SDK non chargé, activation
refusée. Une attestation silencieusement inactive donne l'illusion d'une
protection, et c'est précisément dans cet état qu'on active l'application
forcée en croyant le client prêt.

Le mode émulateur ne l'active pas : les émulateurs n'exigent aucune
attestation, et les tests end-to-end passent par eux.

Deux conséquences ailleurs : la politique de sécurité autorise
`https://www.google.com` en `script-src` et `frame-src` — reCAPTCHA charge son
script et affiche son épreuve depuis cette origine — et le service worker
n'intercepte pas ce domaine, une copie en cache produisant des attestations
refusées.

### 7. Intégrité des ressources externes

Firebase SDK et Leaflet sont chargés depuis un CDN avec attribut `integrity`
(SRI) et `crossorigin`. Un CDN compromis ne peut pas substituer son code.

### 8. Validation des saisies

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

### Le miroir hors ligne, et pourquoi il est ASYMÉTRIQUE (2026-09-16)

`dbGet` mémorise toute lecture réussie dans `localStorage`, et les écritures y
sont mises en file hors réseau. C'est ce que les quatre accès absolus évitent
pour `prive/`, avec sa raison : cette origine est partagée par tous les dépôts
Pages du compte.

La poche personnelle, elle, vit **sous** l'espace de données — c'est ce qui lui
laisse le schéma complet d'une charge —, donc elle passe par les deux. Décision
du foyer :

- **la sienne** reste mémorisée et mise en file. Même classe d'exposition que
  ses charges communes, déjà dans ce `localStorage` — et c'est ce qui garde la
  saisie hors réseau, qui est toujours la sienne ;
- **celle de l'autre**, jamais. Lecture en direct, ou pas de lecture. Sinon elle
  survivrait à la révocation de l'aval : le mur se referme en base, et le détail
  resterait sur l'appareil.

La garde est **structurelle** — `personnelDeLAutre` (`js/db.js`) lit le chemin
et le compare à l'emplacement du compte connecté —, et non un drapeau passé par
l'appelant : un drapeau s'oublie au prochain site d'appel, et il s'oublierait en
silence. Elle porte sur la lecture (ni mémoire, ni repli par le miroir) **et**
sur la file, où elle est refaite au rejeu : entre le dépôt et le retour du
réseau, le dossier a passé du temps dans un stockage que l'application ne
possède pas seule.

`tests/modules/hors-ligne.test.js` tient les deux faces, et le témoin qui les
sépare : sa poche est gardée hors ligne, celle de l'autre ne laisse rien, et le
refus **dit** qu'il s'agit d'un tiers.

### Un fichier de sauvegarde porte les dépenses personnelles EN CLAIR

Le mur est en **base**, pas dans le fichier. « Télécharger une sauvegarde » lit
la poche personnelle de celui qui la demande — il en a le droit — et l'écrit
dans le JSON, avec ses libellés, ses catégories et ses lieux. Transmettre ce
fichier, c'est les transmettre : à qui l'on veut, sans aval, et sans que rien
ne le rappelle.

Il n'y a pas de remède technique à cela, et il ne faut pas laisser croire le
contraire : un fichier qu'on a le droit de produire est un fichier qu'on peut
donner. Ce qui est garanti est plus étroit, et exact : **la sauvegarde ne peut
pas contenir la poche de l'autre**, faute du droit de la lire.

La restauration en tire sa forme. Elle n'écrase plus la racine d'un `set` —
celui-là supprimait ce qu'il ne portait pas, donc aurait effacé la poche de
l'autre en silence, le jour précis où l'on restaure parce que quelque chose est
déjà cassé. Elle écrit les nœuds du foyer en une mise à jour multi-chemins, et
**sa seule poche** par un chemin dédié. Chacun restaure la sienne.

La sauvegarde automatique (`.github/workflows/sauvegarde.yml`) est un autre
cas : elle exporte `/household` avec un jeton d'administration, qui ne passe
pas par les règles. Son archive contient donc les **deux** poches — et c'est
précisément pourquoi elle est chiffrée avant d'être déposée (voir *Le dépôt est
privé*).

### Personne ne peut écrire dans la poche de l'autre — ce que ça coûte (2026-09-16)

C'est la propriété centrale du mur, et elle a un prix ailleurs qu'en sécurité.
Trois gestes du foyer ne peuvent pas être menés à bien par une seule personne :

- **La migration des dépenses personnelles.** Le lot P1a a posé la poche sans
  déplacer de donnée ; le lot P1b la remplit. Aucun compte ne peut migrer les
  deux poches : chacun déplace les siennes à l'ouverture
  (`modules/migration-poches.js`). Un mois où l'un des deux n'ouvre pas
  l'application laisse ses dépenses là où elles étaient — dans le commun, donc
  lisibles par l'autre. **C'est un état transitoire assumé, pas une garantie.**
- **Le renommage d'une catégorie ou d'une destination.** Il suit les charges du
  foyer et celles de qui renomme ; les dépenses personnelles de l'autre gardent
  l'ancien libellé. Le renommage n'est pas refusé pour autant — ce serait rendre
  une liste partagée inmodifiable par une donnée qu'on ne voit peut-être même
  pas. Le compte concerné les reprend à sa prochaine ouverture
  (`utils/renommage.js → planRattrapage`), et l'écran dit combien de dépenses
  attendent.
- **La restauration d'une sauvegarde**, déjà décrite ci-dessus.

Et la reprise des libellés a une limite, dite plutôt que cachée : elle
s'appuie sur l'identifiant de l'entrée, qui est la racine de son libellé
d'ORIGINE. Deux renommages successifs pendant qu'une poche dort — A → B → C —
laissent une charge à `B`, que rien ne distingue d'un libellé n'ayant jamais
appartenu à la liste. Elle garde son nom : réécrire au hasard changerait la
catégorie d'une dépense.

### Suppression logique

Les suppressions sont des `deleted: true`, jamais des effacements. Une donnée
supprimée dans l'interface reste présente en base.

### Vulnérabilités npm, et pourquoi elles se corrigent par surcharge

`npm audit` est à zéro. Il ne l'a pas toujours été, et la façon d'y arriver
mérite d'être écrite, parce que le remède évident était le mauvais.

Les alertes signalées — `qs`, `uuid`, `@opentelemetry/core` — ne venaient
d'aucune dépendance déclarée ici. Elles arrivaient toutes par la chaîne de
`firebase-tools`, à trois ou quatre niveaux de profondeur. Le correctif que
proposait `npm audit fix --force` était de **rétrograder `firebase-tools` d'une
version majeure**, de 15 à 14 : troquer trois failles de développement contre
une régression de l'outillage de déploiement, ce qui n'est pas un échange.

Les versions corrigées existaient pourtant en amont. Ce que `firebase-tools`
n'avait pas encore repris, un bloc `overrides` dans `package.json` le force :

```json
"overrides": {
  "qs": "^6.16.0",
  "uuid": ">=11.1.1",
  "@opentelemetry/core": "^2.8.0"
}
```

`uuid` porte un `>=` et non un `^`, et ce n'est pas un détail de style : une
autre branche de l'arbre tenait déjà `uuid@14`, qu'un `^11.1.1` aurait déclaré
invalide — on aurait ainsi rétrogradé une dépendance déjà saine pour en corriger
une autre.

**La portée réelle de ces alertes était de toute façon faible**, et le dire fait
partie de l'évaluation : l'artefact publié ne contient aucune dépendance npm.
`public/` est livré tel quel, et les paquets de `node_modules` ne servent qu'aux
tests, à l'émulateur et au serveur local. Aucun de ces codes n'atteint le
navigateur d'un utilisateur ni un serveur exposé.

Ces surcharges sont **temporaires par nature**. Elles se retirent dès que
`firebase-tools` reprend les versions corrigées en amont ; les garder au-delà
figerait des versions que plus personne ne suit.

---

## Règles de contribution

- Jamais `".read": true` ni `".write": true` sur des données utilisateur, y
  compris temporairement. Pour du développement sans contrainte : l'émulateur.
- Jamais d'`innerHTML` avec une donnée utilisateur non passée par `escapeHtml()`.
- Jamais de secret, jeton ou donnée personnelle dans le code ou les journaux.
- Les règles vivent dans `database.rules.json` et nulle part ailleurs. Ne jamais
  les éditer à la main dans la console Firebase : le prochain déploiement
  écraserait la modification sans trace.
- Leur déploiement est automatique à chaque fusion sur `main` (job
  `deploy-rules`), après les tests unitaires et end-to-end. Il **exige le secret
  de dépôt `FIREBASE_SERVICE_ACCOUNT`** — un compte de service Firebase au
  format JSON, rôle « Firebase Realtime Database Admin ». Sans ce secret, le
  job n'échoue pas mais pose un avertissement visible sur l'exécution : la base
  tourne alors sous des règles potentiellement plus anciennes que le dépôt.
  Vérifier ce point avant de conclure qu'une règle est appliquée.
- Toute action GitHub Actions doit être épinglée par SHA de commit.
- Le workflow est en `contents: read` ; seul le job de déploiement demande
  l'écriture. Ne pas remonter ce droit au niveau du workflow : il s'appliquerait
  aussi aux jobs qui exécutent le code des dépendances.
- Un nœud ajouté sous `household/` doit être déclaré dans `database.rules.json`
  **et** dans `NOEUDS_CONNUS` (`js/modules/backup.js`), sans quoi il ne pourra
  ni être écrit ni être restauré. Depuis le 2026-09-16, il lui faut **en outre
  son propre `.read`** : la racine n'en porte plus, et un enfant qui l'oublie
  est invisible à tout le monde. Trois contrôles le tiennent —
  `tests/sauvegarde-noeuds-declares.test.js` compare la liste aux règles et
  vérifie que la sauvegarde lit réellement chaque nœud déclaré, et
  `tests/regles/mur-prive.test.js` demande à l'émulateur si chaque enfant
  direct reste lisible.

---

### Le dépôt est privé depuis le 2026-08-27 — ce que cela ferme, et ce que non

Ce document a d'abord affirmé « dépôt privé à usage familial » alors qu'il était
public, puis a été corrigé. Le dépôt est **effectivement passé en privé le
2026-08-27** (vérifié : `"private": true`, et la recherche `is:public` ne le
rend plus). GitHub Pages continue de publier, le compte étant sur un plan
payant — sur le plan gratuit, ce passage aurait décroché le site.

Ce que le passage en privé **referme** :

- **La sauvegarde quotidienne n'est plus téléchargeable par un tiers.** Les
  artefacts suivent la visibilité du dépôt. L'archive porte l'intégralité de
  `household`, chiffrée en AES-256 avec dérivation S2K au compte maximal
  (paramètres épinglés dans le workflow, plus hérités du runner) ; sa
  confidentialité ne repose donc plus sur la seule entropie de
  `SAUVEGARDE_PASSPHRASE` attaquée hors ligne sur 90 jours de clichés. C'était
  le point le plus cher de cette section, et il est clos.
- **Les tickets ouverts par la CI ne sont plus lisibles publiquement**, non plus
  que les liens d'exécution qu'ils portent.

Ce que le passage en privé **ne referme pas** — et c'est contre-intuitif :

- **Les deux adresses du foyer restent publiées.** Elles sont dans
  `public/js/config.js`, aux côtés de la clé API du projet, et ce fichier est
  **servi par le site**. Or un site Pages issu d'un dépôt privé reste
  publiquement accessible : le contrôle d'accès aux pages est réservé aux
  formules Enterprise. Rendre le dépôt privé cache le code source, pas ce que le
  site publie. Ces adresses restent donc des cibles nommées pour
  `signInWithPassword`, et App Check — que le §6 présente comme le rempart
  contre le martèlement — n'est pas en application forcée à ce jour.
- **L'origine `github.io` est toujours partagée** par tous les dépôts du compte
  servis par Pages, la visibilité n'y change rien. Le miroir hors ligne et la
  session Firebase y vivent : le jour où un second dépôt active Pages, sa page
  les lit, sans aucune injection. Aujourd'hui `split-charges-pwa` est le seul —
  c'est une contrainte à tenir, pas un état acquis. Un nom de domaine propre
  reste le seul remède définitif.

## Signaler un problème

Le dépôt est privé : une issue n'y est lisible que par qui y a accès. La
prudence reste de mise sur ce qu'une issue décrit avant correction — le site,
lui, est public, et une faille exploitable depuis la page l'est par n'importe
qui.
