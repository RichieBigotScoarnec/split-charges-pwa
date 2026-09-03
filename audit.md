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

## Checklist

- [ ] **AUDIT-001** 🟠 Versement mensuel : la part refusée n'est jamais rattrapée
- [ ] **AUDIT-002** 🟡 Versement mensuel : le message annonce le total demandé, pas le total écrit
- [ ] **AUDIT-003** 🟡 Versement mensuel : consulter un mois à venir l'alimente d'avance *(dépend de Q-1)*
- [ ] **AUDIT-004** 🟡 Sélection multiple : « Tout » relâche au lieu de tout cocher
- [ ] **AUDIT-005** 🔵 Versement partagé : le mode annoncé peut différer du mode appliqué
- [ ] **AUDIT-006** ⚪ 8 vulnérabilités « moderate » en dépendances de développement
- [ ] **AUDIT-007** 🔵 12 modules absents du référentiel `CLAUDE.md`
- [ ] **AUDIT-008** 🔵 `restoreFromTrash` ne valide ni la période ni l'identifiant
- [ ] **AUDIT-009** ⚪ Plafond d'injection à marge nulle (24/24)
- [ ] **AUDIT-010** 🟠 L'espace `sandbox` n'exige pas `email_verified`
- [ ] **AUDIT-011** 🟡 La file hors ligne ne ferme que l'effacement, pas l'écriture arbitraire
- [ ] **AUDIT-012** 🔵 La CSP publiée autorise `http://localhost:*` et `ws://localhost:*`

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

**Statut** : OUVERT
**Protégé par** : —

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

**Occurrences similaires [Déduit]** — Le motif « annoncer un total planifié
plutôt qu'un total écrit » n'a été cherché que dans le lot A, où les autres
boucles d'écriture partielle (`selection-charges.js`) comptent correctement. Non
mesuré sur les lots C et D.

**Consommateurs affectés [Vérifié]** — `annoncer` est privée au module, un seul
site d'appel (l. 132).

**Correction proposée (locale)** — Ne compter que les lignes écrites : accumuler
le montant dans la boucle de succès, ou passer à `annoncer` la liste des lignes
retenues. Reprendre la forme de `compteRenduDuLot` si des refus doivent être
dits.

**Risque de régression** — Faible : fonction privée, sans autre lecteur.

**Vérification à effectuer** — Le cas « CONSTAT A » ; plus un témoin positif
qu'un succès complet annonce toujours le total entier.

**Statut** : OUVERT
**Protégé par** : —

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

**Statut** : OUVERT *(dépend de Q-1)*
**Protégé par** : —

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

**Statut** : OUVERT
**Protégé par** : —

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
