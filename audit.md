# Audit FairSplit — journal

## Synthèse

**Date** : 2026-09-03
**Commit d'ancrage** : `2bca67d` (branche `claude/code-audit-framework-x1naq9`, arbre
propre au démarrage — `git status --porcelain` vide).
**Auditeur** : session de diagnostic. Aucune modification de code, de test, de
dépendance ou de configuration. Seul fichier écrit dans le dépôt : celui-ci.

### Périmètre

Le dépôt retenu pèse ~40 000 lignes (31 629 JS applicatif, 6 643 CSS, 1 090
lignes de règles Firebase, 1 736 HTML/service worker, 1 291 outils). Une lecture
sérieuse de cet ensemble n'entre pas dans une session : le périmètre a été
découpé en quatre lots et **A + B** validés par l'utilisateur.

**Couvert par cette session** :

| Lot | Contenu | Lignes |
|---|---|---|
| **A** | Les 12 modules absents du `CLAUDE.md` : `selection-charges`, `selection-lot`, `versement-mensuel` (module + utils), `versement-partage`, `correction-retroactive`, `explication-solde`, `resume-prive`, `trash`, `phrase-saisie`, `debug`, `sandbox-banner` | 2 061 |
| **B** | `database.rules.json`, `db.js`, `config.js`, `firebase-init.js`, `state.js`, `miroir`, `confidentialite`, `reprise`, `rejeu-annonce`, `attestation`, `cadre`, `sonde-liaison`, `prive`, `backup`, `auth`, `sw.js`, CSP de `FairSplit.html`, workflows CI | 8 604 |

**Non couvert, à traiter en sessions ultérieures** :

- **Lot C — cœur monétaire** (~11 400 l.) : `calculations`, `provisions`,
  `tendances`, `previsionnel`, `rapport-mensuel`, `detail`, `cout-annuel`,
  `veille`, `anticipation`, `versements`, `enveloppes`, `budgets`, et les
  modules `summary`, `period`, `reimbursements`, `reconduction`, `carry-over`,
  `envelopes`, `trends`.
- **Lot D — saisie, UI, PWA** (~18 500 l.) : `quick-add`, les deux modules de
  charges, `custom-lists`, `search`, `import-csv`, `choix-lieu`, `map`,
  `notifications`, `connection-banner`, `diagnostics`, composants, CSS.

**Exclu par nature** : `node_modules` (absent du dépôt), `package-lock.json`
(les versions se lisent dans le manifeste), `tests/` (48 035 lignes — lus
ponctuellement comme *sujet* de constats et comme harnais, jamais audités
ligne à ligne).

**Référentiel lu avant le code** : `CLAUDE.md` (163 Ko), `README.md`,
`SECURITY.md`, `WORKFLOW-DEV.md`, `eslint.config.mjs`, `firebase.json`,
`playwright.config.js`, workflows CI. Le `CLAUDE.md` tient un journal d'audits
antérieurs très fouillé (tableau « État de cohérence ») ; il n'est pas au format
`audit.md` et n'a pas été renuméroté — ses entrées ⚠️ encore ouvertes sont
reprises en fiches ci-dessous quand elles entrent dans le périmètre A+B.

### Ce qui a réellement été lu dans le lot B

Le lot B a été couvert **par ses surfaces exposées**, pas ligne à ligne. À
distinguer dans la reprise :

- **Vérifié par exécution** : `database.rules.json` dans son intégralité
  fonctionnelle — 29 écritures et lectures rejouées contre le moteur réel
  (émulateurs RTDB 4.11.2 + Auth), dont l'espace privé, l'aval, la liste
  blanche, la garde `email_verified`, et toutes les écritures neuves du lot A.
- **Lu sans exécution** : `db.js` (file hors ligne, miroir, accès absolus,
  délais de garde), `sw.js` (installation, stratégie de cache, hôtes exclus),
  la CSP des deux fichiers qui la portent, `config.js` (liste blanche,
  emplacements), les trois workflows CI.
- **Non couvert** : `miroir.js`, `prive.js`, `confidentialite.js`, `backup.js`,
  `auth.js`, `reprise.js`, `sonde-liaison.js`, `attestation.js`,
  `firebase-init.js`, `state.js` — soit ~2 800 lignes du lot B. Leurs
  *garanties serveur* sont vérifiées (les règles ci-dessus), leur *logique
  cliente* ne l'est pas. À reprendre.

### Compteurs

| Gravité | Nombre |
|---|---|
| 🔴 CRITIQUE | 0 |
| 🟠 ÉLEVÉ | 2 |
| 🟡 MOYEN | 4 |
| 🔵 FAIBLE | 4 |
| ⚪ INFO | 2 |

Aucun constat ne porte `BLOQUANT-AUDIT` ni `BLOQUANT-REMÉDIATION`.

### Ce qui a été vérifié et s'est révélé sain

À consigner autant que les défauts — c'est ce qui n'aura pas à être réexaminé :

- **Les règles couvrent toutes les écritures neuves du lot A.** La classe de
  défaut la plus coûteuse de ce dépôt (« la reconduction mensuelle était refusée
  par les règles », 401 mesuré) ne se reproduit pas : les clés déterministes
  `auto-2026-09-vous`, le champ `versementMensuel` avec `auteur: "deux"`, les
  trois écritures du lot de sélection (`envelope: null` compris) et le
  rétablissement depuis la corbeille sont **tous acceptés**. Les cas qui doivent
  échouer échouent : champ inconnu, `auteur` absent, `auteur: "deux"` sur un
  versement écrit, rétablissement d'une charge inexistante.
- **L'espace privé tient ses promesses**, dans les deux sens : la conjointe ne
  lit pas sans aval, n'écrit jamais, ne peut pas s'accorder l'aval elle-même ;
  refermer l'aval referme aussi le passé.
- **Les workflows CI sont exemplaires** : les 6 actions tierces sont épinglées
  par SHA, les permissions sont `contents: read` au niveau du workflow et
  élevées job par job, aucun `pull_request_target`, et **tous les jobs portant
  un secret sont conditionnés à `github.event_name == 'push'`** — donc jamais
  atteignables depuis une pull request.
- **Le service worker n'intercepte aucun service distant** : la comparaison
  d'hôte exige un point avant le suffixe (ni `firebaseio.com.exemple.net` ni
  `notfirebaseio.com` ne passent), les émulateurs locaux sont exclus, les
  requêtes non-GET traversent, et le cache est purgé au changement de version.

### Vérifications exécutées

Toutes dans l'espace de vérification jetable, jamais dans le dépôt.

- `npm ci --ignore-scripts` → code 0, 974 paquets (1 prod, 974 dev).
- `npx vitest run` → **158 fichiers, 2 915 tests passés, 0 échec**, code 0, 49,3 s.
- `npx eslint .` → **0 erreur, 32 avertissements**, code 0.
- `npx eslint public/js --format json | node tools/plafond-innerhtml.mjs` (la
  commande exacte de la CI) → **24 sites d'injection, plafond 24**, code 0.
- `npm audit --json` → **8 vulnérabilités « moderate », 0 high, 0 critical**,
  toutes en dépendances de développement. Voir AUDIT-006.
- Tests d'audit jetables : `AUDIT-versement-partiel.test.js` (2 cas),
  `AUDIT-suite.test.js` (2 cas). Les 4 échouent contre le code actuel et
  documentent AUDIT-001 à AUDIT-004.
- **Émulateurs Firebase** : `firebase emulators:start` échoue dans ce conteneur
  (le proxy sortant intercepte le chargement local des règles). Contourné en
  pilotant le JAR directement — `java -jar firebase-database-emulator-v4.11.2.jar
  --port 9010 --host 127.0.0.1`, règles postées par
  `curl -X PUT --data-binary @database.rules.json` avec `Authorization: Bearer owner`
  → `{"status":"ok"}` — l'émulateur Auth étant démarré à part
  (`firebase emulators:start --only auth`).
- Rejeux de règles : `rejeu-regles.mjs` → **17/17 conformes**,
  `rejeu-prive.mjs` → **10/12 conformes**, les 2 écarts étant AUDIT-010.
  **L'identité passe par un idToken émis par l'émulateur Auth**, jamais par
  `Authorization: Bearer` : celui-ci est traité comme un compte de service et
  accorde la propriété. Ma première version du harnais l'ignorait et rendait
  *tout* refusé, y compris les cas qui devaient passer — corrigé, puis chaque
  script ouvert par un **témoin positif** exigeant qu'une écriture banale soit
  acceptée. Sans ce témoin, un harnais cassé aurait produit un rapport
  entièrement faux dans un sens ou dans l'autre.
- **Non exécuté** : `npx playwright test` — la suite de bout en bout (523 cas)
  n'a pas été rejouée. Raison : le budget de session a été mis sur les rejeux de
  règles, plus discriminants pour un audit de sécurité. La suite unitaire
  couvrant les mêmes modules est verte.

### Espace de vérification

**Chemin** :
`/tmp/claude-0/-home-user-split-charges-pwa/1a09f8bc-41c5-56df-a797-3dc14c94a091/scratchpad/`
— hors de l'arborescence auditée, jamais un sous-répertoire du dépôt.
**Volume** : 392 Mo (copie jetable du dépôt à `2bca67d`, `node_modules`, les
deux fichiers de test d'audit, les deux scripts de rejeu de règles, les journaux
d'émulateur).
**Sort** : **supprimé et vérifié en fin de session** — le répertoire est vide
(`ls -A` sans sortie, 4 Ko résiduels pour le répertoire lui-même), les deux
émulateurs sont arrêtés (ports 9010 et 9099 fermés, code `000`), et le dépôt est
intact : `git status --porcelain` ne rend que `?? audit.md`, sur `2bca67d`.

Les quatre fichiers de vérification n'ont donc pas survécu. Leur **protocole
est reproductible** depuis les fiches AUDIT-001 à AUDIT-004 et AUDIT-010, qui
portent chacune le montage, les entrées et la sortie mesurée. Le point à ne pas
refaire de mémoire est le harnais d'émulateur : voir « Vérifications exécutées »
ci-dessus — jeton d'émulateur Auth obligatoire, `Authorization: Bearer` interdit
comme identité, et témoin positif en tête de chaque script.

### Second périmètre validé — 2026-09-03

Après la livraison des lots 1 et 2, l'utilisateur a ouvert **AUDIT-011 puis
AUDIT-004**, et tranché **Q-1**, ce qui a rendu **AUDIT-003** exécutable. Les
trois sont corrigés ; leur journal est en fin de document, sous « Second lot ».

### Périmètre de remédiation validé — 2026-09-03

L'utilisateur a validé les **lots 1 et 2** du plan, soit **trois constats** :
**AUDIT-010** (sécurité), puis **AUDIT-001** et **AUDIT-002** dans cet ordre.
Les trois portent déjà une fiche au format long ; leurs champs de portée ont été
durcis avant la clôture, tant que le code était encore lu :

- AUDIT-001 — portée close sur le lot A, `[Vérifié]` (3 sites de la chaîne du
  versement mensuel, `reconduction.js` écarté car sa reprise est transactionnelle).
- AUDIT-002 — portée passée de `[Déduit]` à **`[Vérifié]`** : une seule
  occurrence dans tout `public/js`, méthode et écartés détaillés dans la fiche.
- AUDIT-010 — portée `[Vérifié]` sur les cinq racines des règles ;
  l'**exploitabilité** reste `[À tester]`, protocole dans la fiche, et c'est ce
  qui décide de l'urgence.

**La remédiation n'a pas été exécutée dans cette session** : le cadrage d'audit
est en lecture seule sur le code. Elle demande une session au mandat distinct.
Deux choses à savoir en l'ouvrant :

1. **Les moyens de preuve ont été détruits avec l'espace de vérification.** Les
   deux fichiers de test et les deux scripts de rejeu sont à réécrire. Le point
   à ne pas refaire de mémoire est le harnais d'émulateur : identité par idToken
   de l'émulateur Auth, `Authorization: Bearer` interdit comme identité (il
   accorde la propriété et fait passer tous les contrôles), témoin positif en
   tête de chaque script. Ma première version l'ignorait et ne mesurait rien.
2. **Le plafond d'injection est à 24/24, marge nulle** (AUDIT-009). Aucun des
   trois correctifs de ce périmètre n'ajoute d'`innerHTML`, mais toute retouche
   d'affichage qui en ajouterait ferait échouer la CI, et donc la publication.

### Questions ouvertes

**Q-1 — Un versement mensuel doit-il partir quand on consulte un mois à venir ?**
Le sélecteur de période propose un mois d'avance. Ouvrir ce mois écrit
aujourd'hui un versement daté du 1er du mois suivant (AUDIT-003, vérifié). La
reconduction des charges fixes fait la même chose et c'est assumé — mais une
charge fixe reconduite est une *dette prévue*, alors qu'un versement est un
*mouvement d'argent constaté* : il gonfle le contenu d'une cagnotte, que
`etatProvision` et l'écran des enveloppes présentent comme de l'argent qui
existe. Je ne tranche pas : selon la réponse, AUDIT-003 est un défaut à corriger
ou un comportement à documenter.

> **TRANCHÉE le 2026-09-03 : borner au mois courant.** Le foyer a retenu que
> consulter ne doit pas déplacer d'argent. AUDIT-003 est donc corrigé
> (`774c3ee`), et la garde est symétrique.

**Q-2 — Faut-il faire vérifier l'adresse du compte de test ?** *(ouverte par la
remédiation d'AUDIT-010.)* La correction laisse `testfairsplit@gmail.com`
entrer au bac à sable sans adresse vérifiée, parce qu'il s'authentifie par mot
de passe. Cette porte ne tient que par l'existence du compte côté Firebase
Auth. La refermer demande deux gestes dans cet ordre — vérifier l'adresse dans
la console (Authentication → Users), puis retirer l'exemption de la règle — et
l'ordre compte : inversé, il casse la CI. Cela ne se fait pas depuis une
session de code. Tant que ce n'est pas tranché, l'exemption reste, et elle est
désormais explicite plutôt que subie.

### Risques résiduels

- Les 2 915 tests unitaires passent, mais les quatre défauts vérifiés de cette
  session vivent tous dans du code **couvert** par ces tests. La couverture
  décrit les comportements qu'elle énonce, pas ceux qu'elle a omis — le
  `CLAUDE.md` en fait lui-même le constat récurrent (« les fonctions pures
  blindées, le câblage nu »), et les quatre constats ci-dessous le confirment :
  trois portent sur du câblage, aucun sur une fonction pure.
- Les 28 tests de bout en bout exigeant les émulateurs Firebase n'ont pas été
  rejoués : ce sont eux qui éprouvent `database.rules.json`.

---

## Journal de remédiation — 2026-09-03

**Branche** : `claude/remediation-audit-d1p730`, partant de `6fbbff1`.
**Périmètre exécuté** : les lots 1 et 2 validés — AUDIT-010, AUDIT-001,
AUDIT-002, dans cet ordre. Les neuf autres constats restent OUVERTS, aucun
n'a été touché.

### État de départ consigné

Arbre propre (`git status --porcelain` vide), `node_modules` absent du
conteneur puis installé.

| Commande | Résultat | Code |
|---|---|---|
| `npm ci --ignore-scripts` | 974 paquets | 0 |
| `npx vitest run` | 158 fichiers, **2 915** tests passés | 0 |
| `npx eslint .` | 0 erreur, 32 avertissements | 0 |
| `npx eslint . --quiet` (CI) | aucune sortie | 0 |
| `npx eslint public/js --format json \| node tools/plafond-innerhtml.mjs` (CI) | **24 sites, plafond 24** | 0 |

### Moyens de preuve reconstruits

L'audit avait détruit les siens avec son espace de vérification ; ils ont été
réécrits avant toute correction, et les trois défauts **reproduits** sur le
code d'origine.

- **Harnais d'émulateur** (`scratchpad/rejeu-sandbox.mjs`) : émulateur Auth par
  `npx firebase emulators:start --only auth` (port 9099), moteur de règles par
  le JAR piloté directement — `java -jar firebase-database-emulator-v4.11.2.jar
  --port 9010 --host 127.0.0.1` — les règles postées en `PUT
  .settings/rules.json` avec `Authorization: Bearer owner`. L'identité passe
  par un **idToken** de l'émulateur Auth, jamais par `Authorization: Bearer`
  (traité comme compte de service, il accorde la propriété et fait passer tous
  les contrôles). Chaque exécution s'ouvre sur un **témoin positif**.
- **Suite Playwright** : le conteneur porte Chromium 1194 sous une autre
  arborescence que celle qu'attend `@playwright/test` 1.62.1. Contourné par une
  configuration jetable, hors du dépôt, qui ne change que `executablePath`
  (`/opt/pw-browsers/chromium`). `npx playwright install` est inutile ici.
- **Reproduction d'AUDIT-001/002** : versée directement dans le fichier de test
  permanent, sur une **base simulée** dont les contrôles lisent l'état plutôt
  que de compter les appels — un test qui compterait les `dbSet` aurait interdit
  le correctif retenu.

### Vérifications exécutées

| Commande | Résultat | Code |
|---|---|---|
| `npx vitest run` (final) | 158 fichiers, **2 927** tests passés | 0 |
| `npx eslint . --quiet` (final) | aucune sortie | 0 |
| plafond innerHTML (final) | **24 sites, plafond 24** — inchangé | 0 |
| `node scratchpad/rejeu-sandbox.mjs` — avant | **2 écarts** sur 8 | 1 |
| `node scratchpad/rejeu-sandbox.mjs` — après | **8/8 conformes** | 0 |
| `node scratchpad/maj-versements.mjs` | **3/3** — le lot multi-chemins est accepté, un lot dont un enfant est invalide est rejeté ENTIER et ne laisse rien | 0 |
| `npx playwright test regles-donnees` (émulateurs) | **31/31 passés** (27 avant, +4 du lot) | 0 |
| `npx playwright test` (suite complète, émulateurs) | **555 passés, 9 échecs** sur 564 — tous attribués ci-dessous | 1 |

### Les 9 échecs de bout en bout, attribués

Aucun n'est une régression. L'attribution a été faite **par mesure**, en
rejouant chaque spec contre l'arbre de départ dans un worktree séparé, servi
par son propre serveur (port 3334) : une vérification doit être figée sur le
commit qu'elle relit, et ce dépôt a déjà payé pour l'apprendre.

| Échecs | Attribution |
|---|---|
| 6 dans `firebase-integration.spec.js`, 1 dans `auth-ui.spec.js` | **Préexistants** : les 7 mêmes tombent à l'identique sur l'arbre de départ. Ils demandent que l'application elle-même parle à l'émulateur Auth, ce que le proxy sortant de ce conteneur empêche (773 connexions `www.google.com:443` rejetées). Cohérent avec le socle que le `CLAUDE.md` consigne : « un dans `auth-ui.spec.js` ». |
| 2 dans `detail-depenses.spec.js` | **Instabilité de parallélisme, pas une régression.** Rejoués seuls : **8/8 sur les deux arbres**. L'échec est un délai de garde de 5 s sur l'apparition d'une modale, à 4 workers sur un conteneur chargé. Et le fichier monte `setupFirebaseMock` : il ne touche ni les règles, ni `db.js`, ni les versements — aucun des trois correctifs ne peut l'atteindre. |

### Témoins négatifs joués

Pour chacune des trois corrections, rétablir le défaut fait tomber un contrôle
— mesuré, non supposé.

| Mutant | Effet |
|---|---|
| Règles d'avant, contrôle unitaire | 1 échec (`le bac à sable l'exige AUSSI des comptes du foyer`) |
| Règles d'avant, contrôle de bout en bout contre le moteur réel | 1 échec (`une adresse du FOYER non vérifiée n'ouvre pas non plus le bac à sable`) |
| Écriture ligne par ligne (code d'avant, AUDIT-001) | 2 échecs : 1 clé restée en base au lieu de 0, 0 ligne rattrapée au lieu de 2 |
| Annonce sur les lignes planifiées (code d'avant, AUDIT-002) | 2 échecs : « 550,00 € » annoncés pour 150,00 € en base |

### Régressions rencontrées

Aucune. La suite unitaire est passée de 2 915 à 2 927 tests, tous verts, sans
qu'aucun contrôle préexistant ne tombe à une étape quelconque ; et les 9
échecs de bout en bout sont attribués ci-dessus, mesure à l'appui.

Une **adaptation** — et non une régression — a été nécessaire :
`tests/modules/versement-mensuel-applique.test.js` mesurait ses garanties en
comptant les appels à `dbSet`. Ce couplage au mécanisme d'écriture interdisait
le correctif d'AUDIT-001. Les contrôles ont été rebranchés sur l'état d'une
base simulée ; aucune de leurs assertions de fond n'a été affaiblie, et deux
d'entre elles (`une enveloppe refusée n'emporte pas les autres`) sont
désormais plus fortes qu'avant — elles vérifient le contenu des deux pots, là
où elles comptaient des appels.

### Espace de vérification

`scratchpad/` — hors de l'arborescence du dépôt, jamais un sous-répertoire de
celui-ci. Il portait le JAR de l'émulateur, les deux scripts de rejeu, les
deux configurations Playwright jetables, le worktree de l'arbre de départ et
les journaux.

**Sort** : supprimé et vérifié en fin de session — le répertoire est vide, le
worktree est retiré (`git worktree list` ne rend que le dépôt), et les quatre
ports des émulateurs sont fermés (9010, 9099, 4000, 4400 → code `000`). Le
dépôt lui-même n'a jamais reçu de fichier de vérification.

**Ce qui est à ne pas refaire de mémoire** à la prochaine session, les moyens
de preuve n'ayant pas vocation à survivre : le protocole du harnais
d'émulateur et le contournement Chromium sont décrits ci-dessus, sous
« Moyens de preuve reconstruits ».

### Ce qui n'a pas pu être vérifié

- **Sept contrôles de bout en bout restent rouges dans ce conteneur, et le
  resteront** : ils demandent que l'application parle elle-même à l'émulateur
  Auth, ce que le proxy sortant empêche. Ils sont rouges à l'identique sur
  l'arbre de départ — ce lot ne les rend ni meilleurs ni pires, et **leur
  verdict en CI n'est pas connu d'ici**. Ce qui fait autorité pour ce lot, ce
  sont les 31/31 de `regles-donnees.spec.js` contre le moteur réel, la suite
  qui éprouve précisément ce que la correction touche.
- **L'exploitabilité d'AUDIT-010 reste `[À tester]`** : elle dépend de l'état
  des comptes dans la console Firebase Auth du projet réel, hors de portée
  d'ici. Le protocole est dans la fiche. La correction ne dépend pas de cette
  réponse, seul son degré d'urgence en dépendait.
- **Les mois éventuellement déjà à moitié alimentés en production** ne sont pas
  détectés : la correction d'AUDIT-001 rend l'état partiel inatteignable, elle
  ne relève pas ceux qui existeraient déjà. Voir AUDIT-013.

---

## Checklist

- [x] **AUDIT-001** 🟠 Versement mensuel : la part refusée n'est jamais rattrapée — **CORRIGÉ** (`7a42ac0`)
- [x] **AUDIT-002** 🟡 Versement mensuel : le message annonce le total demandé, pas le total écrit — **CORRIGÉ** (`a84e101`)
- [x] **AUDIT-003** 🟡 Versement mensuel : consulter un mois à venir l'alimente d'avance — **CORRIGÉ** (`774c3ee`)
- [x] **AUDIT-004** 🟡 Sélection multiple : « Tout » relâche au lieu de tout cocher — **CORRIGÉ** (`7afeb58`)
- [ ] **AUDIT-005** 🔵 Versement partagé : le mode annoncé peut différer du mode appliqué
- [x] **AUDIT-006** ⚪ 8 vulnérabilités « moderate » en dépendances de développement — **CLOS** (`251ce72`)
- [x] **AUDIT-007** 🔵 12 modules absents du référentiel `CLAUDE.md` — **CORRIGÉ** (`72a6d39`)
- [x] **AUDIT-008** 🔵 `restoreFromTrash` ne valide ni la période ni l'identifiant — **CORRIGÉ** (`440d1ac`)
- [x] **AUDIT-009** ⚪ Plafond d'injection à marge nulle (24/24) — **CLOS** (`72a6d39`)
- [x] **AUDIT-010** 🟠 L'espace `sandbox` n'exige pas `email_verified` — **CORRIGÉ** (`312efdd`)
- [x] **AUDIT-011** 🟡 La file hors ligne ne ferme que l'effacement, pas l'écriture arbitraire — **CORRIGÉ** (`a61c617`)
- [x] **AUDIT-012** 🔵 La CSP publiée autorise `http://localhost:*` et `ws://localhost:*` — **CLOS** (`f06d6bc`)
- [ ] **AUDIT-013** 🟡 Rien ne relève les mois à moitié alimentés déjà en base *(découvert en remédiation)*

---

## Fiches

### AUDIT-001 · 🟠 ÉLEVÉ · [Vérifié] · Correction fonctionnelle / intégrité des données · `public/js/modules/versement-mensuel.js:95-130`

**Problème** — Quand un versement mensuel « à deux » est écrit en deux lignes et
qu'une seule passe, la part refusée n'est **jamais** rattrapée. La cagnotte
reçoit la moitié du versement, définitivement, sans que rien ne le signale.

**Cause racine** — La garde d'idempotence de `planVersementMensuel`
(`utils/versement-mensuel.js:139`) est un `.some()` sur les deux clés
déterministes du mois :

```js
if (clesDuMois(cible).some(cle => deja.has(cle))) return null;
```

La **présence d'une seule** des deux clés suffit à déclarer le mois alimenté. Or
la boucle d'écriture (`modules/versement-mensuel.js:122-130`) est délibérément
non atomique — « un pot refusé ne doit pas emporter les autres » — et peut donc
laisser exactement une des deux clés en place. La garde qui protège du doublon
protège aussi, du même geste, la moitié manquante.

Le commentaire d'en-tête affirme l'inverse : « un pot non alimenté se rattrape
au geste suivant ». C'est vrai d'un échec total, faux d'un échec partiel.

**Impact** — De l'argent qui manque dans une cagnotte, en silence. Le pot est
sous-alimenté du montant d'une part, et l'écart ne se découvre qu'à l'échéance —
c'est-à-dire au moment où la provision devait être complète. `etatProvision`
recalculera une part mensuelle plus élevée pour rattraper, ce qui masque la
cause au lieu de la signaler.

**Occurrences similaires [Vérifié]** — Une seule dans le périmètre A+B. Passe
outillée : recherche des gardes d'idempotence par clé déterministe
(`grep -rn "clesDuMois\|cleVersementAuto"` sur `public/js`) → 3 sites, tous dans
la chaîne du versement mensuel. `reconduction.js` emploie un mécanisme différent
(transaction sur `reconductedFrom`, avec restitution de l'empreinte si la copie
échoue — cf. `CLAUDE.md`, 2026-08-26) et n'est pas concerné. Le lot A n'ayant
qu'un seul mécanisme de reprise mensuelle, la portée est close pour ce lot ;
elle n'a pas été mesurée sur les lots C et D.

**Consommateurs affectés [Vérifié]** — Un seul appelant :
`modules/period.js:299-302`, dans `loadPeriodData`, à chaque ouverture de mois
(`grep -rn "appliquerLesVersementsMensuels" public/js` → 1 site d'appel).

**Vérifié par** —
`scratchpad/verif/tests/modules/AUDIT-versement-partiel.test.js`, cas
« CONSTAT B », exécuté par `npx vitest run` dans l'espace de vérification.
Protocole : la 1ʳᵉ écriture réussit, la 2ᵈᵉ est rejetée (`PERMISSION_DENIED`) ;
la base rend ensuite la clé qui est passée ; un second appel rend **0** ligne
rattrapée là où 1 est attendue.

```
>>> Clé déjà en base : auto-2026-09-vous
>>> Lignes rattrapées à la 2e ouverture : 0
AssertionError: expected +0 to be 1
```

**Correction proposée (architecturale)** — La garde doit porter sur **la clé que
l'on s'apprête à écrire**, et non sur l'ensemble des clés possibles du mois.
Deux formes possibles, à trancher en remédiation :

1. `planVersementMensuel` rend les parts et chaque part est filtrée sur sa
   propre clé — ce qui déplace le partage avant la garde, donc exige que la
   fonction pure connaisse `shareMode`/`salaries`, qu'elle ignore aujourd'hui à
   dessein ;
2. la garde reste où elle est mais devient un `.every()` **sur les clés
   réellement attendues** pour ce réglage — une seule pour `vous`/`conjointe`,
   les deux pour `deux` — le module appelant retirant du plan les parts déjà
   présentes.

La seconde préserve la pureté du module de décision et paraît la moins invasive.

**Risque de régression** — Moyen. Passer de `.some()` à une garde plus fine
rouvre la porte au double versement que cette garde ferme : toute correction
doit être accompagnée du témoin négatif « deux appels concurrents n'écrivent pas
deux fois ». Attention au cas légitime où une seule clé est normale — une part
nulle (un mois où l'un des deux n'a aucun revenu) ne produit **pas** de
versement, par conception (`versementsAEcrire` filtre les montants nuls) ; la
garde ne doit pas réclamer indéfiniment une part qui ne doit pas exister.

**Vérification à effectuer** — Reprendre les deux cas du fichier d'audit ; y
ajouter le cas de la part nulle et le cas concurrent.

---

**Correction appliquée — écart avec la correction proposée.** Les deux formes
proposées par la fiche resserraient la garde pour *rattraper* la part
manquante. Les deux ont été écartées après relecture du code, pour une raison
que la fiche ne pouvait pas voir : **une moitié en base est indiscernable d'un
versement complet écrit sous l'autre réglage.** Le commentaire de `clesDuMois`
énonce la contrainte — « les deux, quel que soit le réglage : un foyer qui
passe de "à deux" à "moi seul" ne doit pas se voir réalimenter un mois déjà
alimenté sous l'autre forme ». Un foyer réglé sur `vous` en septembre (une
ligne, 150 €) qui passe ensuite à `deux` et rouvre septembre aurait, sous une
garde par clé, reçu la part de la conjointe **en plus** : le mois passait de
150 € à 211,36 €. Le rattrapage échangeait un pot sous-alimenté contre un pot
sur-alimenté, sans moyen de distinguer les deux cas.

La correction retenue rend l'état partiel **inatteignable** plutôt que
rattrapable, ce qui traite la même cause sans l'ambiguïté : les deux parts
d'une même enveloppe partent dans un lot multi-chemins unique, que le moteur
rejette entier dès qu'un enfant est invalide. La granularité entre enveloppes
est conservée telle quelle — « un pot refusé ne doit pas emporter les autres »
reste vrai, et un contrôle le tient.

L'hypothèse d'atomicité n'a pas été supposée : elle a été **mesurée** contre le
moteur réel (`scratchpad/maj-versements.mjs`, 3/3) — un lot dont une part porte
un montant négatif est refusé en 401 et ne laisse aucune de ses deux clés.

Le commentaire d'en-tête du module — « un pot non alimenté se rattrape au geste
suivant », que la fiche relevait comme faux d'un échec partiel — redevient vrai
sans avoir à être réécrit : un échec est désormais toujours total pour
l'enveloppe concernée.

**Statut** : CORRIGÉ (`7a42ac0`)
**Protégé par** : `tests/modules/versement-mensuel-applique.test.js`, section
« AUDIT-001 · Un versement "à deux" ne s'écrit jamais à moitié » — 6 contrôles,
dont les 3 témoins que cette fiche réclamait (mois complet intouché, deux
ouvertures simultanées, part nulle légitime). Mutant joué : l'écriture ligne
par ligne fait tomber 2 contrôles.

---

### AUDIT-002 · 🟡 MOYEN · [Vérifié] · Correction fonctionnelle · `public/js/modules/versement-mensuel.js:173-183`

**Problème** — Le message annonce le total **demandé**, pas le total **écrit**.
Après un échec partiel, l'application dit « 150,00 € mis de côté » alors que
88,64 € seulement sont en base.

`annoncer(nourries, lignes, cible)` reçoit deux collections de nature
différente : `nourries` ne contient que les enveloppes réellement écrites, mais
`lignes` contient **toutes** les lignes planifiées, y compris celles refusées.
Le total est calculé sur `lignes` (`ligne.versement.montant`, l. 174) alors que
les noms viennent de `nourries` (l. 175) — le message est donc incohérent avec
lui-même.

**Vérifié par** — même fichier, cas « CONSTAT A » :

```
>>> TOAST AFFICHÉ : 150,00 € mis de côté sur 🏖️ Vacances 2027 pour septembre 2026
>>> RÉELLEMENT ÉCRIT : 1 ligne(s)
```

**Cause racine** — Le module voisin `utils/selection-lot.js` traite exactement
ce cas, et bien : `compteRenduDuLot` dit les deux nombres et ne prétend jamais
qu'un lot partiel est complet. Ce raisonnement n'a pas traversé jusqu'ici.

**Impact** — Le foyer croit un montant mis de côté qui ne l'est pas. Combiné à
AUDIT-001, l'écart n'est jamais rattrapé *et* jamais signalé : deux garanties
manquantes qui se recouvrent.

**Occurrences similaires [Vérifié]** — **Une seule, dans tout `public/js`.**
Passe outillée en deux temps : relevé des 15 fichiers combinant une écriture
`await dbSet|dbUpdate|dbPush`, un `catch` et un compteur de succès, puis lecture
de chacun pour ne garder que ceux dont l'annonce **peut** porter sur autre chose
que ce qui est passé. Résultat :

- `modules/import.js:248-255` — écrit par **lot atomique**
  (`dbUpdate(undefined, ecritures)`) : soit tout passe, soit le `catch` rend 0
  avec « Import non enregistré ». `lignes.length` est donc toujours exact.
- `modules/prive.js`, `envelopes.js`, `members.js`, `category-budgets.js` —
  une seule écriture par `try`, le message venant après un `catch` qui sort.
  L'écriture partielle n'y est pas représentable.
- `modules/selection-charges.js` — écrit une par une comme
  `versement-mensuel.js`, mais compte correctement via `compteRenduDuLot`.

Le contraste est le constat lui-même : `import.js` a choisi l'atomicité et n'a
donc rien à compter ; `selection-charges.js` a choisi le partiel **et** compte
ses succès ; `versement-mensuel.js` a choisi le partiel **sans** compter.
La correction n'a donc qu'un site, et le modèle à suivre est dans le dépôt.

**Consommateurs affectés [Vérifié]** — `annoncer` est privée au module, un seul
site d'appel (l. 132).

**Correction proposée (locale)** — Ne compter que les lignes écrites : accumuler
le montant dans la boucle de succès, ou passer à `annoncer` la liste des lignes
retenues. Reprendre la forme de `compteRenduDuLot` si des refus doivent être
dits.

**Risque de régression** — Faible : fonction privée, sans autre lecteur.

**Vérification à effectuer** — Le cas « CONSTAT A » ; plus un témoin positif
qu'un succès complet annonce toujours le total entier.

---

**Correction appliquée — conforme à la correction proposée.** `annoncer` reçoit
les seuls lots que la base a acceptés, au lieu de tous les lots planifiés. Le
diff du correctif tient en un mot (`lots` → `nourries`), la restructuration
ayant été faite par AUDIT-001 — d'où deux commits distincts sur le même site :
le premier change le mécanisme d'écriture en préservant ce défaut, le second
le referme seul.

Le contrôle central ne compare à aucun nombre écrit à la main : il exige que
le montant annoncé soit **celui que la base porte**, quel que soit le jeu
d'essai.

**Statut** : CORRIGÉ (`a84e101`)
**Protégé par** : `tests/modules/versement-mensuel-applique.test.js`, section
« AUDIT-002 · Le message annonce ce qui est en base » — 3 contrôles, dont le
témoin positif qu'un succès complet annonce toujours le total entier. Mutant
joué : l'annonce sur les lignes planifiées fait tomber 2 contrôles.

---

### AUDIT-003 · 🟡 MOYEN · [Vérifié] · Correction fonctionnelle · `public/js/utils/versement-mensuel.js:129`

**Problème** — Consulter un mois à venir l'alimente d'avance. Le sélecteur de
période propose un mois d'avance ; l'ouvrir en septembre écrit
`versements/{enveloppe}/auto-2026-10-vous` daté du `2026-10-01`.

**Cause racine** — La garde est unilatérale :

```js
if (cible < moisCourant) return null;   // jamais vers le passé
```

Rien ne borne vers l'avenir. Le commentaire du module énonce la garantie comme
« une seule fois par mois, et **jamais vers le passé** » — la garantie tenue est
donc exactement celle qui est écrite ; c'est l'absence de son pendant qui n'a
pas été décidée.

**Impact** — La cagnotte affiche un contenu correspondant à un mois qui n'a pas
commencé. La suite s'appuie dessus : `acquisSurObjectif` et `etatProvision`
présentent ce contenu comme de l'argent qui existe. Le foyer voit son pot plus
rempli qu'il ne l'est.

**Vérifié par** — `AUDIT-suite.test.js`, cas « CONSTAT C » :

```
>>> Mois calendaire : 2026-09 · mois consulté : 2026-10
>>> Versements écrits : 1 [ 'versements/vacances-2027/auto-2026-10-vous' ]
>>> Daté du : 2026-10-01
```

**Occurrences similaires [Vérifié]** — `applyRecurringCharges`
(`modules/reconduction.js`) a le même comportement vers l'avenir, et il est
assumé et documenté dans le `CLAUDE.md`. La différence de nature est l'objet de
**Q-1**.

**Consommateurs affectés [Vérifié]** — `modules/period.js:299-302`, unique
appelant.

**Correction proposée (locale)** — Si Q-1 tranche pour « non » : ajouter
`if (cible > moisCourant) return null;`, ce qui rend la garde symétrique en une
ligne. Si Q-1 tranche pour « oui » : corriger le commentaire d'en-tête, qui
laisse croire à une garantie bilatérale, et documenter le cas dans le
`CLAUDE.md`.

**Risque de régression** — Faible dans les deux sens ; la fonction est pure et
son unique appelant lui passe déjà les deux mois.

**Vérification à effectuer** — Le cas « CONSTAT C », plus le témoin positif que
le mois courant continue d'être alimenté.

---

**Correction appliquée — conforme à la correction proposée, branche « non ».**
Q-1 a été tranchée par le foyer le 2026-09-03 : borner au mois courant. La
garde devient `cible !== moisCourant`, symétrique en une ligne.

Un test verrouillait le comportement d'avant — « un mois À VENIR est alimenté,
lui aussi », justifié par « consulter octobre en septembre et le préparer est
un geste légitime ». Il a été **retourné plutôt que supprimé**, et c'est la
fiche qui autorisait ce geste : elle avait établi que l'absence de borne n'était
pas une décision mais une omission, le commentaire du module n'annonçant qu'une
garantie vers le passé. Les deux commentaires qui promettaient cette garantie
unilatérale sont mis en accord avec le code.

*(À rapprocher d'AUDIT-010, où un test apparemment jumeau a mené à la
conclusion INVERSE : là-bas il consignait une contrainte de conception réelle,
ici il rationalisait une omission. La différence ne se lit pas dans le test,
elle se lit dans ce que le code promettait par ailleurs.)*

**Statut** : CORRIGÉ (`774c3ee`)
**Protégé par** : `tests/utils/versement-mensuel.test.js` — la décision, plus
le témoin positif que le mois courant continue de l'être (sans lui, une garde
refusant tout passerait) ; et `tests/modules/versement-mensuel-applique.test.js`
pour le câblage, à l'ouverture réelle d'un mois. Le mutant qui rétablit la
garde unilatérale fait tomber les deux.

---

### AUDIT-004 · 🟡 MOYEN · [Vérifié] · Correction fonctionnelle · `public/js/modules/selection-charges.js:159-168`

**Problème** — Le bouton « Tout » relâche la sélection au lieu de tout cocher,
dès que la sélection contient des identifiants périmés.

```js
const toutes = chargesAffichees().map(charge => charge.id);
const dejaTout = toutes.length > 0 && ids.length >= toutes.length;
```

`ids` n'est pas purgé avant d'être compté. Six identifiants retenus alors que
trois charges seulement sont affichées donnent `6 >= 3` → « tout est déjà
coché » → la sélection est vidée.

**Cause racine** — `utils/selection-lot.js` fournit `selectionPurgee` pour
exactement ce cas, et son en-tête en explique la nécessité : « un identifiant
retenu peut ne plus désigner personne au moment où le geste part ». La fonction
est appelée par `leLotDuMoment` (avant chaque geste) et par
`resumeDeLaSelection` (pour l'affichage), mais **pas** par `toutSelectionner`.
C'est une garde présente et non appliquée sur un des trois chemins.

**Impact** — Fonctionnel, non monétaire. Le scénario est réel : cocher plusieurs
charges, l'autre téléphone en supprime, la liste se recharge — « Tout » devient
inerte du point de vue de l'utilisateur (il vide au lieu de remplir). Rien ne le
signale.

**Vérifié par** — `AUDIT-suite.test.js`, cas « CONSTAT D » :

```
>>> 3 charges affichées, 6 ids retenus dont 3 périmés
>>> Après « Tout » : []
AssertionError: expected [] to deeply equal [ 'a', 'b', 'c' ]
```

**Occurrences similaires [Vérifié]** — Passe outillée sur les trois lectures de
`etat().ids` du module (`selection-charges.js` l. 103, 143, 160) : `estChoisie`
(l. 103) lit `ids` non purgé mais ne s'applique qu'à des charges affichées, donc
la question ne se pose pas ; `basculerChargeChoisie` (l. 143) passe par
`basculerDansLaSelection`, insensible aux périmés. `toutSelectionner` est le
seul site défectueux.

**Consommateurs affectés [Vérifié]** — Un seul point d'entrée : le bouton
`#selectionTout` (`FairSplit.html:406-407`, `data-action="toutSelectionner"`),
déclaré dans la liste blanche `init.js:61`.

**Correction proposée (locale)** — Compter sur la sélection purgée :
`const retenues = selectionPurgee(ids, chargesAffichees())`, puis comparer
`retenues.length` à `toutes.length`. La fonction est déjà importée dans le
module (l. 38).

**Risque de régression** — Faible. Attention à conserver le comportement
nominal : quand tout est réellement coché, « Tout » doit continuer de relâcher.

**Vérification à effectuer** — Le cas « CONSTAT D », plus les deux témoins
positifs (rien coché → tout se coche ; tout coché → tout se relâche).

---

**Correction appliquée — conforme à la correction proposée.** `selectionPurgee`
dans `toutSelectionner` ; la fonction était déjà importée (l. 38).

**Une leçon sur le jeu d'essai.** Le premier scénario écrit cochait les trois
charges affichées puis en périmait trois autres — et il PASSAIT sur le code
fautif, parce que relâcher y était le geste juste : après purge, les trois
affichées étaient bien toutes cochées. Le défaut ne se manifeste que si la
sélection purgée est PLUS PETITE que ce qui est affiché, tout en restant plus
grande en compte brut : une charge réellement cochée, trois identifiants morts,
trois charges affichées. Un jeu d'essai qui ne peut pas manifester le défaut ne
mesure rien — constat déjà consigné quatre fois dans le `CLAUDE.md`, refait ici.

**Statut** : CORRIGÉ (`7afeb58`)
**Protégé par** : `tests/modules/selection-charges.test.js` — le cas réel, plus
le témoin qui interdit la sur-correction (tout RÉELLEMENT coché doit continuer
de relâcher). Le mutant qui rétablit le comptage brut fait tomber le premier.

---

### AUDIT-010 · 🟠 ÉLEVÉ · [Vérifié] · Sécurité — authentification · `database.rules.json:469-471` (racine `sandbox`)

**Problème** — L'espace `sandbox` accorde la lecture **et** l'écriture sur la
seule adresse du jeton, **sans exiger `email_verified`**. `household` l'exige.

```jsonc
// household
".read":  "auth != null && auth.token.email_verified === true && (auth.token.email === '…' || …)"
// sandbox
".read":  "auth != null && (auth.token.email === '…' || …)"
```

**Cause racine** — La garde `email_verified` a été posée sur `household` parce
que l'API d'inscription par mot de passe reste joignable avec la clé publique du
projet — le dépôt le sait et l'écrit lui-même
(`tests/e2e/regles-donnees.spec.js:46-48` : « c'est l'état d'un compte créé par
l'API d'inscription, celle-là même qui reste joignable avec la clé publique du
projet »). Cette garde n'a pas été reportée sur la seconde racine, écrite comme
une copie assouplie de la première.

**Impact** — Quiconque obtient un jeton portant l'une des trois adresses de la
liste blanche **sans l'avoir vérifiée** lit et écrit l'intégralité de
`sandbox`. Les deux éléments nécessaires sont publics : les adresses figurent
dans `public/js/config.js:230-234`, servi à l'URL du site, et la clé API
Firebase aussi. L'espace ne contient pas les finances réelles du foyer (elles
vivent sous `household`), mais il s'agit d'une écriture arbitraire dans la base
du projet de production, sous une identité que les règles tiennent pour
légitime.

**Exploitabilité réelle : [À tester]** — elle dépend de deux réglages du projet
Firebase que je ne peux pas observer d'ici :

1. si « une seule adresse par compte » est actif (défaut Firebase),
   `accounts:signUp` sur une adresse déjà rattachée à un compte Google renvoie
   `EMAIL_EXISTS` et la porte est fermée pour cette adresse ;
2. **`testfairsplit@gmail.com` est le cas à regarder en premier** : si ce compte
   n'a jamais été créé côté Firebase Auth, il est inscriptible par un tiers, et
   la porte est ouverte.

*Protocole de vérification* (sur le projet réel, sans rien modifier) : dans la
console Firebase → Authentication → Users, vérifier l'existence des trois
comptes et le fournisseur de chacun ; dans Settings → User actions, vérifier
l'état de « Email enumeration protection » et de l'unicité d'adresse. Ne pas
tenter l'inscription contre le projet réel : ce serait une écriture d'état sur
un environnement partagé.

**Occurrences similaires [Vérifié]** — Passe outillée sur les quatre racines de
`database.rules.json` (`household`, `sandbox`, `prive`, `aval`, `totauxPrives`) :
`sandbox` est la **seule** dont les clauses `.read`/`.write` omettent
`email_verified`. Les huit clauses des trois racines privées la portent toutes.

**Consommateurs affectés [Vérifié]** — `sandbox` est atteint par
`?sandbox=1` via `resolveDataRoot` (`public/js/db.js:48`, `config.js`). Tout le
code applicatif y accède par le même `db.js` : aucun chemin n'a de garde propre.

**Vérifié par** — `scratchpad/rejeu-prive.mjs`, exécuté contre les émulateurs
RTDB + Auth. Protocole : un compte portant `bigot.richard@gmail.com` dont la
vérification est **retirée** en administrateur, puis reconnecté pour obtenir un
jeton portant `email_verified: false`.

```
✅ adresse de la liste blanche NON vérifiée → household   attendu REFUSÉ · obtenu REFUSÉ (401)
❌ adresse de la liste blanche NON vérifiée → sandbox (ÉCRITURE)  attendu REFUSÉ · obtenu ACCEPTÉ (200)
❌ adresse de la liste blanche NON vérifiée → sandbox (LECTURE)   attendu REFUSÉ · obtenu ACCEPTÉ (200)
✅ adresse hors liste blanche, non vérifiée → sandbox     attendu REFUSÉ · obtenu REFUSÉ (401)
```

Le dernier cas montre que la liste blanche, elle, tient : c'est bien la seule
garde `email_verified` qui manque.

**Correction proposée (locale)** — Ajouter `auth.token.email_verified === true`
aux deux clauses de `sandbox`, ce qui aligne les deux racines. Deux lignes.

**Risque de régression** — À vérifier avant de corriger : le compte
`testfairsplit@gmail.com` sert aux tests de bout en bout, et
`tests/e2e/regles-donnees.spec.js` distingue explicitement jeton vérifié et non
vérifié. Si un test s'appuie sur un accès `sandbox` non vérifié, il tombera —
ce serait alors le test qu'il faut corriger, pas la règle.

**Vérification à effectuer** — Rejouer les quatre cas ci-dessus après
correction : les deux ❌ doivent passer au ✅ sans que les deux ✅ ne bougent.
Puis la suite `regles-donnees.spec.js` complète (27 cas) contre l'émulateur.

---

**Correction appliquée — écart avec la correction proposée.** La fiche
prescrivait d'ajouter `email_verified` aux deux clauses de `sandbox` « ce qui
aligne les deux racines, deux lignes ». **Cette correction aurait fermé le bac
à sable.** Ce que la fiche pressentait sans le trancher — son champ « risque de
régression » — est explicite dans le dépôt et tenu par deux contrôles :
`tests/e2e/regles-donnees.spec.js`, « le bac à sable reste ouvert à une adresse
non vérifiée », et `tests/compte-bac-a-sable.test.js` l. 112-113, avec leur
justification : le compte cantonné au bac à sable **s'authentifie par mot de
passe et n'a pas d'adresse à prouver**. C'est le seul usage de cet espace, et
17 contrôles de bout en bout s'y déroulent.

La fiche concluait « ce serait alors le test qu'il faut corriger, pas la
règle ». C'est l'inverse : le test consigne une contrainte de conception, et la
lever demanderait de faire vérifier l'adresse du compte de test dans la console
Firebase — une action d'exploitation hors de portée d'une session de code, qui
casserait la CI entre-temps.

La correction retenue porte donc la garde sur les **seules adresses du foyer**,
et l'exemption sur le **seul compte cantonné** (`SANDBOX_ONLY_EMAILS`). Elle
ferme l'exposition que la fiche a mesurée — un jeton non vérifié portant une
adresse du foyer n'entre plus nulle part — sans échanger cette exposition
contre une panne.

**Ce qui reste ouvert** — le compte de test conserve un accès au bac à sable
sans adresse vérifiée. C'est assumé et documenté, mais la porte ne tient que
par l'existence du compte côté Firebase Auth : `accounts:signUp` sur une
adresse déjà rattachée rend `EMAIL_EXISTS`. Le refermer demande de vérifier
l'adresse `testfairsplit@gmail.com` dans la console, puis d'aligner la règle —
voir Q-2.

**Statut** : CORRIGÉ (`312efdd`)
**Protégé par** :
- `tests/e2e/regles-donnees.spec.js` — « une adresse du FOYER non vérifiée
  n'ouvre pas non plus le bac à sable » (lecture **et** écriture), plus le
  témoin renommé qui interdit la sur-correction. 31/31 contre le moteur réel ;
  le mutant (règles d'avant chargées dans l'émulateur) le fait tomber.
- `tests/compte-bac-a-sable.test.js` — les clauses d'accès sont désormais
  **évaluées** contre un jeton fabriqué, et non lues comme du texte : un
  `toContain('email_verified')` survit à tout déplacement de la garde dans
  l'expression. 4 contrôles, dont le témoin négatif que c'est bien l'adresse
  qui ouvre et non la vérification. Le mutant fait tomber 1 contrôle.

---

### AUDIT-013 · 🟡 MOYEN · [Déduit] · Intégrité des données · `public/js/utils/versement-mensuel.js:139`

*Constat découvert pendant la remédiation d'AUDIT-001, non corrigé dans cette
session — il ne bloquait aucune correction en cours.*

**Problème** — La correction d'AUDIT-001 rend l'état « un mois à moitié
alimenté » **inatteignable pour l'avenir**. Elle ne relève pas ceux qui
existeraient **déjà en base**, écrits par le code d'avant. Un tel mois porte
une seule des deux clés `auto-{mois}-*`, la garde d'idempotence le tient pour
complet, et la cagnotte reste sous-alimentée du montant d'une part —
exactement le défaut d'AUDIT-001, figé.

**Pourquoi c'est un constat distinct** — Il ne se corrige pas dans le code de
décision : `planVersementMensuel` ne peut pas distinguer une moitié d'un
versement complet écrit sous l'autre réglage (c'est le raisonnement qui a fait
écarter la correction proposée par la fiche AUDIT-001). Le relevé demande de
comparer, mois par mois, la somme des clés `auto-` au réglage
`versementMensuel` de l'enveloppe à cette date — une lecture d'inventaire, pas
une garde.

**Portée [Déduit] — à mesurer avant tout geste.** Le nombre de mois concernés
est **inconnu** : il dépend du nombre d'échecs partiels réellement survenus en
production depuis la mise en service du versement mensuel, ce qu'aucune trace
conservée ne dit. Il peut être nul. Le mesurer ne demande aucune écriture :
`tools/` porte déjà un précédent exact avec `charges-mal-rangees.mjs`, qui
relève l'existant sur une **sauvegarde**, sans rien modifier.

**Impact** — De l'argent qui manque dans une cagnotte, en silence, sur des mois
passés. `etatProvision` recalcule une part mensuelle plus élevée pour
rattraper, ce qui masque la cause au lieu de la signaler.

**Correction proposée** — Un outil de relevé sur le modèle de
`charges-mal-rangees.mjs` : lire une sauvegarde, lister les couples
(enveloppe, mois) portant une seule clé automatique, et rendre le montant
manquant. Décider ensuite, au vu du relevé, s'il y a lieu d'écrire — un
rattrapage rétroactif est une écriture d'argent et relève du foyer, pas de
l'outil.

**Statut** : OUVERT
**Protégé par** : —

---

### Fiches courtes

**AUDIT-011** · 🟡 MOYEN · `[Vérifié]` · Sécurité · `public/js/db.js:531-544`
`operationRejouable` ferme l'effacement, **pas** l'écriture arbitraire. Elle
rejette trois formes — type autre que `set`/`update`, chemin vide, `set(null)` —
et ne regarde jamais `donnees`. Une entrée forgée dans la file
`localStorage` du type `{type:'set', chemin:'salaries', donnees:{vous:99999,
conjointe:1}}` est donc rejouée telle quelle, sous la session légitime du foyer,
et **les règles l'acceptent** : rejeu mesuré, `household/salaries` écrit en 200
(`rejeu-regles.mjs`, dernier cas). Le prorata de tous les mois s'en trouve
faussé. Le `CLAUDE.md` décrit ce point comme clos en annonçant que la file
« écrivait n'importe quoi, effacement compris » — la correction n'a fermé que le
second terme. Le prérequis reste fort : écrire dans `localStorage` demande du
code sur `richiebigotscoarnec.github.io`, origine que partagent tous les sites
Pages du compte (limite déjà consignée comme ⚠️ INHÉRENT dans le référentiel).
**Correction** : borner les chemins rejouables à une liste de préfixes attendus
(`periods/`, `versements/`, `envelopes`…) plutôt que de n'exclure que la racine —
une liste blanche de destinations, pas une liste noire de formes.

**Correction appliquée — écart avec la correction proposée.** La liste porte sur
les FORMES de chemin, et non sur des préfixes : mesuré, une liste de préfixes ne
ferme pas l'exemple que cette fiche donne elle-même. `period.js:460` écrit
`dbUpdate('salaries', …)` quand on corrige un salaire — l'entrée forgée décrite
ici est cette écriture, au caractère près. Aucun contrôle posé dans le client ne
peut les distinguer, et un préfixe `salaries` l'aurait laissée passer tout en
donnant le sentiment d'avoir refermé le point.

Ce que la correction ferme, mesuré avant/après : `set('periods', …)` remplaçait
TOUT l'historique, `set('periods/2026-08', …)` un mois entier,
`set('envelopes', [])` vidait la liste du foyer — les trois acceptés, les trois
refusés désormais. C'est la classe que le `CLAUDE.md` annonçait close en disant
que la file « écrivait n'importe quoi, effacement compris » : seul le second
terme l'était.

Les trois listes du foyer sont exclues à dessein — `fusionnerListe` les écrit
par une `transaction` posée directement sur la référence Firebase, qui ne
traverse pas `db.js`. Vérifié en relevant les 14 sites d'appel de
`dbSet`/`dbUpdate`/`dbPush` : aucun ne les vise.

**Ce qui reste ouvert, et pourquoi c'est écrit dans le code** — la surface est
ramenée à ce que l'application écrit elle-même, pas à rien. Le remède au reste
n'est pas client : c'est un nom de domaine propre, qui rendrait l'origine à
cette application seule (déjà consigné ⚠️ INHÉRENT au `CLAUDE.md`). Un test
tient cette limite pour qu'elle ne se perde pas.

**Deux régressions de test, tenues pour des conséquences légitimes** :
`file-non-forgeable.test.js` affirmait qu'un lot multi-chemins sur
`periods/{mois}` passe — forme qu'aucun appel ne produit, et par laquelle on
pouvait marquer `deleted` sur toutes les charges d'un mois ; et
`hors-ligne.test.js` utilisait `customCategories` comme troisième écriture de
file, choix arbitraire remplacé par `categoryBudgets`, qui, lui, y passe.

**Statut** : CORRIGÉ (`a61c617`)
**Protégé par** : `tests/utils/file-non-forgeable.test.js` — les refus, la
limite assumée, et surtout la comparaison de la liste au CODE **dans les deux
sens** : le relevé des 17 chemins réellement écrits doit rester différable (une
forme oubliée ferait perdre une saisie hors ligne), et chaque forme déclarée
doit correspondre à un appel réel. Une constante irrésolue fait échouer le
relevé. Plus `tests/modules/hors-ligne.test.js` pour le CÂBLAGE — la garde doit
être consultée dans la boucle de rejeu, mesuré sur ce qui atteint la base.
Trois mutants, trois chutes : liste trop étroite (2 contrôles), trop large (5),
garde retirée de la boucle (3).

**AUDIT-012** · 🔵 FAIBLE · `[Lu]` · Sécurité · `public/FairSplit.html:70`, `firebase.json:20`
La politique **publiée** autorise `http://localhost:* http://127.0.0.1:*
ws://localhost:* ws://127.0.0.1:*` dans `connect-src`. Ces origines ont été
retirées le 2026-08-27 puis rendues le même jour, quand la remise en tête de la
balise a fait tomber les tests d'intégration. Impact pratiquement nul : une page
servie en HTTPS ne peut pas ouvrir de connexion `http://` ni `ws://` (contenu
mixte, bloqué par le navigateur avant la CSP). C'est un affaiblissement
déclaratif, pas exploitable en l'état. **Correction** : servir deux politiques —
celle du dépôt pour le développement, celle de la publication sans les origines
locales — ou accepter et documenter, l'essentiel étant que le choix soit
explicite plutôt que le résultat d'un aller-retour.

**AUDIT-005** · 🔵 FAIBLE · `[Lu]` · `public/js/utils/versement-partage.js:70-86`
Le mode annoncé peut différer du mode appliqué. `applique` ne corrige que le
repli du prorata sans revenus (`assiette.total <= 0`). Si `shareMode` vaut
`custom` avec des pourcentages illisibles, `pourcentages()` replie en 50/50
(`calculations.js`, correctif du 2026-08-27) mais `applique` reste `custom` :
`phraseDuPartage` annonce « selon vos pourcentages » pour un partage à parts
égales. Non vérifié par exécution — le cas suppose des données abîmées.
**Correction** : faire rendre le mode effectivement appliqué par
`calculateChargeShares`, plutôt que le redéduire ici (c'est la deuxième
rédaction de la même règle de repli, motif que le `CLAUDE.md` désigne comme
« le défaut de `normalizePair` »).

**AUDIT-006** · ⚪ INFO · `[Vérifié]` · `package.json` (dépendances de développement)
`npm audit` rend **8 vulnérabilités « moderate », 0 high, 0 critical**, code 0.
Toutes proviennent de `firebase-tools` et de sa chaîne (`@google-cloud/pubsub`,
`@opentelemetry/core`, `gaxios`, `uuid`, `express`, `body-parser`, `qs`). Aucune
n'atteint le code publié : `public/` ne dépend d'aucun paquet npm (1 seule
dépendance de production). Les intitulés sont ceux rendus par l'outil
(déni de service via `qs`, allocation mémoire non bornée dans la propagation
Baggage d'OpenTelemetry, borne de tampon manquante dans `uuid` v3/v5/v6) ;
**aucun identifiant CVE n'est cité, l'outil n'en ayant pas rendu dans cette
sortie**. **Correction** : rien d'urgent ; `npm audit fix` est proposé par
l'outil, à jouer avec la suite complète.

**AUDIT-007** · 🔵 FAIBLE · `[Vérifié]` · `CLAUDE.md`
Douze modules ne figurent nulle part dans le référentiel : `trash`,
`resume-prive`, `selection-charges`, `versement-mensuel` (module **et** utils),
`sandbox-banner`, `selection-lot`, `versement-partage`, `correction-retroactive`,
`phrase-saisie`, `debug`, `explication-solde`. Relevé par comparaison de
`find public/js -name '*.js'` au contenu du fichier. Le `CLAUDE.md` est la norme
contre laquelle ce dépôt se juge, et son inventaire `utils/` a déjà divergé une
fois (entrée « `utils/` listé à cinq fichiers », résolue le 2026-08-22). Les
quatre défauts vérifiés de cette session vivent tous dans ces modules non
consignés. **Correction** : compléter l'inventaire et le tableau d'état.

**AUDIT-008** · 🔵 FAIBLE · `[Lu]` · `public/js/modules/trash.js:215-232`
`restoreFromTrash` valide `collection` (recherche dans `COLLECTIONS`) mais ni
`periode` ni `id` avant de composer `periods/${periode}/${collection}/${id}`. Le
module définit pourtant `PERIOD_KEY` et s'en sert dans `collectAll` (l. 79). La
valeur vient de `data-arg`, donc du DOM ; l'exploitation exige une injection
HTML préalable, et Firebase refuse les clés contenant `.` ou `/`, ce qui ferme
la traversée de chemin. Défense en profondeur, non exploitable en l'état.
**Correction** : appliquer `PERIOD_KEY.test(periode)` et rejeter un `id` vide ou
contenant un caractère interdit par Firebase.
*(Point voisin, même fiche : `collectAll` l. 84 déréférence `periods[periode][cle]`
sans garde ; une clé de mois de valeur `null` — impossible en base, concevable
dans le miroir `localStorage` — lèverait. Le `try/catch` de `renderTrash`
l'attrape et affiche « Historique illisible », donc l'impact est contenu.)*

**AUDIT-009** · ⚪ INFO · `[Vérifié]` · `.github/workflows/deploy.yml:101`
Le plafond de sites d'injection est atteint exactement : **24 mesurés, plafond
24, marge 0**. C'est le fonctionnement voulu (`tools/plafond-innerhtml.mjs`
documente le raisonnement), mais tout `innerHTML` supplémentaire fera échouer la
CI, et donc la publication. À savoir avant d'ouvrir la session de remédiation :
plusieurs corrections d'affichage pourraient buter dessus. Noté aussi que le
`CLAUDE.md` annonce « 26 avertissements, le plafond exact de la CI » — chiffre
périmé de deux façons : `npx eslint .` en rend 32, et la CI ne compte plus les
avertissements globaux depuis le passage au plafond `no-unsanitized` seul.

---

## Plan de correction proposé

Ordonné par nature du risque, pas par numéro. Aucun constat ne porte
`BLOQUANT-REMÉDIATION` : les quatre lots sont indépendants et peuvent être pris
dans cet ordre ou séparément. **Ce plan est proposé, pas exécuté** — la
remédiation est une session distincte.

### Lot 1 — Sécurité (1 constat)

**AUDIT-010** — aligner `sandbox` sur `household` en exigeant `email_verified`.

D'abord la vérification de terrain décrite dans la fiche (état des trois comptes
dans la console Firebase Auth), qui dit si l'exposition est réelle ou théorique.
La correction est de deux lignes dans les deux cas ; c'est le degré d'urgence
qui en dépend, pas le geste.

*Vérifications* : les 4 cas `email_verified` de `rejeu-prive.mjs` — les deux ❌
passent au ✅, les deux ✅ ne bougent pas ; puis `regles-donnees.spec.js` en
entier (27 cas) contre l'émulateur, pour attraper un test qui s'appuierait sur
l'accès non vérifié.

### Lot 2 — Intégrité des données (2 constats)

**AUDIT-001** puis **AUDIT-002**, dans cet ordre : ils touchent le même chemin
et le second est le symptôme visible du premier. Corriger 002 seul rendrait
l'écart *visible* mais toujours *non rattrapé* ; corriger 001 seul le rattraperait
sans que le message cesse de mentir dans les autres cas d'échec partiel.

*Vérifications* : les 2 cas de `AUDIT-versement-partiel.test.js`, plus les deux
témoins que la fiche AUDIT-001 réclame — la part nulle légitime, et deux appels
concurrents qui ne doivent pas doubler le versement. Ce second témoin est le
plus important : c'est la garantie que la garde actuelle assure et qu'on
resserre.

### Lot 3 — Correction fonctionnelle (3 constats)

**AUDIT-003** — à ouvrir seulement une fois **Q-1** tranchée : selon la réponse,
c'est une ligne de garde ou une ligne de commentaire, et livrer l'un pour
l'autre serait une régression de comportement.

**AUDIT-004** — appliquer `selectionPurgee` dans `toutSelectionner`. Une ligne,
la fonction est déjà importée.

**AUDIT-005** — faire rendre le mode effectivement appliqué par
`calculateChargeShares` plutôt que le redéduire dans `versement-partage.js`. Ce
n'est pas un correctif d'affichage : c'est la suppression d'une seconde
rédaction d'une règle de repli, exactement le motif que le référentiel désigne
comme « le défaut de `normalizePair` » et qu'il a payé huit fois. À traiter avec
le lot C (cœur monétaire), où vit la fabrique.

### Lot 4 — Défense en profondeur et tenue (4 constats)

**AUDIT-011** — remplacer la liste noire de formes par une liste blanche de
préfixes de destination dans `operationRejouable`. Demande de recenser d'abord
tous les chemins légitimement différables ;
`tests/regles-couvrent-les-ecritures.test.js` produit déjà ce relevé et peut
servir de source.

**AUDIT-008** — valider `periode` et `id` dans `restoreFromTrash`.

**AUDIT-012** — trancher explicitement le sort des origines locales dans la
politique publiée.

**AUDIT-006** — `npm audit fix`, à jouer avec la suite complète.

### Lot 5 — Référentiel (2 constats)

**AUDIT-007** — inscrire les douze modules manquants au `CLAUDE.md`. À faire
**après** les lots 1 à 3, pour que les entrées consignent aussi les défauts
trouvés et leur correction : c'est la forme que ce dépôt donne à son journal.

**AUDIT-009** — décider du plafond d'injection avant d'ouvrir la remédiation :
il est à 24/24, marge nulle. Toute correction d'affichage qui ajoute un
`innerHTML` fera échouer la CI, et donc la publication.

### Ce que ce plan ne couvre pas

Les lots C et D (~29 900 lignes) n'ont pas été audités. Le cœur monétaire
(lot C) est celui où ce dépôt a historiquement trouvé ses défauts les plus
coûteux — un chiffre faux en silence — et il reste entier.


---

## Journal de remédiation — second lot, 2026-09-03

**Périmètre** : AUDIT-011 (sécurité), AUDIT-004, puis AUDIT-003 une fois Q-1
tranchée. Ordre suivi : sécurité d'abord, puis fonctionnel.

| Constat | Commit | Mesure avant correction |
|---|---|---|
| **AUDIT-011** | `a61c617` | `set('periods')`, `set('periods/2026-08')`, `set('envelopes')` : **acceptés** |
| **AUDIT-004** | `7afeb58` | 1 charge cochée sur 3 affichées, 3 ids morts → « Tout » **vidait** |
| **AUDIT-003** | `774c3ee` | ouvrir 2026-10 en 2026-09 écrivait un versement daté du 1er octobre |

### Vérifications exécutées

| Commande | Résultat | Code |
|---|---|---|
| `npx vitest run` (départ de ce lot) | 158 fichiers, **2 927** tests | 0 |
| `npx vitest run` (final) | 158 fichiers, **2 942** tests, 0 échec | 0 |
| `npx eslint . --quiet` (CI) | aucune sortie | 0 |
| `npx eslint .` | 0 erreur, **32** avertissements | 0 |
| plafond innerHTML (CI) | **24/24**, inchangé | 0 |

**Non exécuté** : la suite Playwright. Aucun des trois correctifs ne touche les
règles ni le balisage, et les trois classes concernées — file hors ligne,
sélection multiple, versement mensuel — sont couvertes en unitaire, y compris
leur câblage. Le lot précédent a par ailleurs établi que 7 contrôles de bout en
bout sont durablement rouges dans ce conteneur, ce qui rend son verdict peu
informatif ici.

### Sept mutants posés, sept chutes

| Mutant | Effet |
|---|---|
| Liste blanche trop étroite (`versements` retiré) | 2 contrôles |
| Liste blanche trop large (`return true`) | 5 contrôles |
| Garde retirée de la boucle de REJEU | 3 contrôles |
| Comptage brut rétabli dans `toutSelectionner` | 1 contrôle |
| Garde de mois unilatérale rétablie | 2 contrôles |

### Régressions rencontrées

Aucune régression de production. **Deux tests ont dû changer de camp**, et
c'est le fond du lot plutôt qu'un dégât collatéral :

- `file-non-forgeable.test.js` affirmait qu'un lot multi-chemins sur
  `periods/{mois}` passe. Aucun appel ne produit cette forme — vérifié sur les
  14 sites d'écriture — et elle permettait de marquer `deleted` sur toutes les
  charges d'un mois en une entrée forgée. Le contrôle affirme désormais
  l'inverse, avec sa raison.
- `versement-mensuel.test.js` affirmait qu'un mois à venir est alimenté, au nom
  d'un « geste légitime ». Q-1 a tranché l'inverse. Retourné, pas supprimé.

**Ce qui distingue ces deux cas d'AUDIT-010**, où un test apparemment jumeau a
mené à la conclusion opposée : là-bas le test consignait une contrainte de
conception réelle (le compte de test n'a pas d'adresse à prouver), ici il
rationalisait une omission. La différence ne se lit pas dans le test lui-même,
elle se lit dans ce que le code promet par ailleurs — et dans ce qui casse si
on le suit.

### Ce qui n'a pas été vérifié

- **La limite d'AUDIT-011 est structurelle et reste ouverte** : une entrée
  forgée visant `salaries` est indiscernable de l'écriture légitime de
  `period.js:460`. Écrit dans le code et tenu par un test, plutôt que laissé
  croire fermé.
- Les mois éventuellement **déjà** alimentés d'avance par le défaut d'AUDIT-003
  ne sont pas relevés — même nature qu'AUDIT-013, et même remède possible.


---

## Journal de remédiation — troisième lot, 2026-09-03

**Périmètre** : le reste du lot 4 (AUDIT-008, AUDIT-012, AUDIT-006) puis le
lot 5 (AUDIT-007, AUDIT-009). Ordre suivi : défense en profondeur, puis
dépendances, puis référentiel — ce dernier en fin de chantier, comme le plan
le prévoyait, pour que ses entrées consignent aussi les correctifs livrés.

| Constat | Commit | Mesure avant correction |
|---|---|---|
| **AUDIT-008** | `440d1ac` | 6 périodes malformées et 6 identifiants interdits composaient un chemin ; un mois nul affichait « Historique illisible » |
| **AUDIT-012** | `f06d6bc` | `https://localhost:*` ajouté aux DEUX politiques ne faisait tomber aucun des 33 contrôles |
| **AUDIT-006** | `251ce72` | `npm audit fix --dry-run` : aucun changement proposé |
| **AUDIT-007** | `72a6d39` | 12 modules absents, mesurés par comparaison du disque au fichier |
| **AUDIT-009** | `72a6d39` | `npx eslint .` rend 32, le référentiel annonce 26 |

### Écarts avec les corrections proposées

- **AUDIT-006 — la correction proposée est inapplicable.** La fiche proposait
  `npm audit fix`. Mesuré : il ne corrige rien, et `--force` redescend
  `firebase-tools` de plusieurs majeures — ce que la CI interdisait déjà
  nommément. `stream-json` 1.9.1 est installé, le correctif est en 3.5.0, et
  `firebase-tools` 15.29.0 (la dernière) épingle `^1.7.3` : deux majeures
  d'écart, donc aucun correctif non cassant.

  Ce qui a été corrigé à la place : le **commentaire** de la CI, qui inscrivait
  l'inventaire du jour. Il a menti trois fois en trois jours — la fiche relevait
  8 avis, le commentaire 5, la mesure d'aujourd'hui 2, sur des paquets
  différents à chaque fois. Remplacé par la méthode, qui ne se périme pas.

  *Atteignabilité mesurée sur l'arbre installé* : `stream-json` n'est chargé que
  par `database:import` et `auth:import`. Les workflows n'appellent que
  `database:get`, `database:update`, `deploy --only database` et
  `emulators:exec`. Le code signalé n'est jamais chargé.

- **AUDIT-012 — la décision était déjà prise, sa RAISON n'était pas gardée.**
  La fiche laissait deux issues, dont « accepter et documenter ». C'est déjà
  fait, et déjà attaché à la garde d'hôte de `USE_EMULATOR`. Mais tout
  l'argument « impact nul » repose sur le contenu mixte, qui ne vaut que pour
  `http://` et `ws://` — et rien n'empêchait `https://localhost:*`, qui n'est
  pas du contenu mixte. C'est cette hypothèse qui est devenue mesurée.

- **AUDIT-009 — traité avec AUDIT-007, même cause racine** : le référentiel qui
  affirme un chiffre au lieu d'une règle. Les deux entrées datées ne sont pas
  réécrites — elles étaient vraies à leur date ; c'est la phrase « le plafond
  exact de la CI » qui a cessé de l'être, et elle est consignée comme telle.
  Le plafond reste à 24/24 : aucun des huit correctifs de la session n'a ajouté
  d'`innerHTML`.

### Vérifications exécutées

| Commande | Résultat | Code |
|---|---|---|
| `npx vitest run` (départ de ce lot) | 159 fichiers, **2 942** tests | 0 |
| `npx vitest run` (final) | 159 fichiers, **2 953** tests, 0 échec | 0 |
| `npx eslint . --quiet` (CI) | aucune sortie | 0 |
| plafond innerHTML (CI) | **24/24**, inchangé | 0 |
| `npm audit --audit-level=high` (CI) | 2 avis modérés, aucun haut | 0 |
| `npm audit fix --dry-run` | aucun changement proposé | 1 |
| YAML de `deploy.yml` après édition | 7 jobs analysés | 0 |

### Cinq mutants posés, cinq chutes

| Mutant | Effet |
|---|---|
| Gardes d'avant dans `restoreFromTrash` | 3 contrôles |
| Garde du mois nul retirée de `collectAll` | 1 contrôle |
| `https://localhost:*` ajouté aux deux politiques | 1 contrôle |
| Origines locales retirées de `firebase.json` seul | 1 contrôle |

### Revue des frontières

Les quatre autres actions qui composent un chemin depuis `data-arg` —
`editFixedCharge`, `deleteFixedCharge`, `editReimbursement`,
`deleteReimbursement` — ont été relues : **elles sont saines par
construction**. Chacune cherche l'identifiant dans la collection déjà chargée
(`charges.find(c => c.id === chargeId)`) et abandonne s'il est introuvable ;
l'identifiant qui atteint le chemin est donc toujours un identifiant que
l'application a elle-même lu en base. C'est une garde plus forte que celle qui
manquait à la corbeille. Aucun nouveau constat.

Le motif `CLE_FIREBASE` a été éprouvé sur dix entrées : il accepte les clés
poussées par Firebase, les deux-points, les accents, les emoji et les espaces ;
il refuse `/`, `.`, la chaîne vide et les caractères de contrôle.

### Ce qui n'a pas été vérifié

- **La suite Playwright**, pour la même raison qu'au lot précédent : aucun de
  ces correctifs ne touche les règles, et les 7 contrôles durablement rouges
  dans ce conteneur rendent son verdict peu informatif. `trash.js` n'a pas de
  contrôle de bout en bout ; son nouveau test unitaire monte le module réel.
- **L'effet du commentaire de `deploy.yml` en CI** : le YAML est valide et le
  seuil inchangé, mais aucun workflow n'a été déclenché depuis cette session.
