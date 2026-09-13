---
nom-canonique: contrat-agents-audit
version: '2.1'
created: '2026-09-11'
projet: Prompt-Engineer
status: valide
type: kb
tags:
  - contrat
  - agents
  - audit
  - claude-code
---

# Contrat commun — bibliothèque d'agents d'audit

> **Version 2.1 — 2026-09-12.**
> Ce document fait autorité sur tous les agents de la bibliothèque. Aucun agent ne
> redéclare une règle écrite ici ; il y renvoie. Une règle dupliquée dans dix-huit
> prompts est une règle qu'on corrigera dans dix-sept.

**Changements v2.0 → v2.1** — quatre manques structurels comblés d'un coup, tous
identifiés en répondant à « je veux un audit qui approche la perfection » :

- **§18 identité des constats** — chaque passe repartait à `001`. Impossible de dire ce
  qui est nouveau, corrigé, ou revenu. Trois passes existaient, aucune n'était comparable.
- **§19 pondération par le risque** — la fréquence de modification et la couverture de
  test sont deux signaux déterministes et gratuits que rien n'exploitait. Ils ne trouvent
  rien ; ils décident **où regarder** quand on ne peut pas tout ouvrir.
- **§20 barrière de couverture** — la couverture était déclarée, pas verrouillée.
- **§21 boucle de retour** — rien de ce que l'humain décide ne revenait dans le système.

⚠️ Ce que ces quatre sections ne font pas : rendre l'audit exhaustif. **Le rappel — la
part des défauts réels effectivement trouvés — n'est pas mesurable sur un dépôt vivant**,
faute d'en connaître le dénominateur. Le témoin est le seul endroit où il se mesure, et
il est synthétique. On peut rendre cette chaîne très bonne et savoir de combien ; pas
parfaite.

**Changements v1.9 → v2.0** — la chaîne cesse d'être uniquement statique (§17). Elle
lisait du code sans jamais observer ce qu'il produit, et se fermait ainsi une classe
entière de défauts : contraste réel après composition, ordre de tabulation effectif,
focus piégé, et surtout **ce qu'une règle d'accès autorise réellement** par opposition à
ce qu'on lit dans le fichier de règles.

Changement de numéro majeur parce que ça déplace une frontière du contrat : une mesure
sur le rendu est une **preuve recevable**, et c'est le seul moyen de lever les conditions
des constats `[Déduit]` qui plafonnaient faute d'observation.

**Changements v1.8 → v1.9** — réponse à un chiffre mesuré : **22 % du dépôt réellement
ouvert** sur une passe complète (97 fichiers sur 428, et seulement 8 % de la suite de
tests). Les agents butent sur leur fenêtre, et rien ne distinguait « j'ai fini » de « je
n'ai plus de place ».

Recherche d'antécédents conduite le 2026-09-12 : personne ne fait d'audit exhaustif en
une passe. La forme retenue par le domaine est un **balayage profond périodique à
couverture mesurée**, plus une revue continue sur les diffs. Trois leviers en sortent ;
le §16 pose le premier, le mieux documenté et le moins cher.

**Changements v1.7 → v1.8** — seconde passe sur le dépôt réel. Elle valide les fichiers
`PERIMETRE-*` (les huit produits, distinguant au fichier près le lu du parcouru) et
**invalide une mesure** : les six références manquées de la passe précédente ont été
trouvées, mais leur motif vivait dans le fichier de l'agent et dans ce changelog. **L'agent
avait la réponse.** D'où le §15, et `journal-passes.md`, qui ne se déploie pas.

Quatre autres corrections : le disque fait foi contre le compte rendu d'un agent (§11),
pas de répertoire créé sans y écrire (§7), le nom du fichier de périmètre est celui de
l'agent (§11), et les sorties de la chaîne s'ignorent dans git (§7).

**Changements v1.6 → v1.7** — première passe sur un **dépôt réel** : 446 fichiers,
117 000 lignes, 31 constats. Ce que la passe valide, et ce qu'elle casse.

✅ **Zéro faux positif sur 242 fichiers de test.** Aucun n'a été signalé comme orphelin.
L'écartement n° 1 du §6 ter tient à l'échelle — c'était le risque qui fait abandonner un
outil. Le Project Analyst a même trouvé un troisième mécanisme de résolution à
l'exécution que les motifs par défaut ne prévoyaient pas.

✅ **Le mode de défaillance visé est trouvé** : huit des dix constats `REPO` sont des
divergences entre ce qu'un document déclare et ce que le dépôt contient.

❌ **Un manque de couverture réel sur une famille de références**, diagnostiqué et
corrigé. Détail : `journal-passes.md`, qui ne se déploie pas.

❌ **Densité quinze fois moindre que sur le témoin.** Le rapport dit lui-même que les 70
utilitaires et les 31 modules ont été *inventoriés, pas lus*, et qu'**aucun agent n'a
déclaré sur disque ce qu'il a réellement ouvert**. Un audit qui échantillonne sans le
dire est indiscernable d'un audit exhaustif.

Sept corrections : périmètre par défaut (§0), support disque du périmètre non couvert
(§11), indépendance des passes (§7), place de la Red Team dans l'index (§7), champs
`effort` et `risque-de-regression` au gabarit (§3), sortie de `/security-review` (§0),
et retrait d'une heuristique chiffrée du Review Board.

**Changements v1.5 → v1.6** — la couche référentielle existe (§14). C'était le dernier
chantier de fond, et l'axe par lequel une pile non encore utilisée devient auditable sans
toucher à un seul agent. Elle s'est corrigée elle-même en naissant : les opérateurs `?.`
et `?[]` de PowerShell sont passés en courant en **7.1**, pas 7.0 — un module utilisant
`?.` et `??` exige donc 7.1, et le constat de compatibilité produit sur le témoin était
approximatif.

**Changements v1.4 → v1.5** — seconde passe complète, sur le témoin réparé, avec
l'orchestrateur. Les quatre règles de la v1.3 ont tenu : aucune écriture concurrente sur
l'index, aucun agent n'a exécuté le code, aucun fichier supprimé, aucune consigne ajoutée
par l'orchestrateur. Sept corrections, issues du compte rendu de l'orchestrateur — dont
**cinq contradictions internes à ce contrat**, qu'aucun agent d'audit n'aurait pu voir :

1. **Variance de l'instrument** (§12). Deux passes sur un même dépôt ne rendent pas les
   mêmes constats.
2. **Responsabilité de `INDEX.md`** (§7). Trois textes s'en attribuaient la charge ou
   l'interdisaient. Tranché : le Review Board.
3. **`false-positives.md` sans auteur** (§6 ter). Prescrit, sans rôle désigné, et les
   agents ont l'interdiction d'écrire hors `findings/`. Résultat : aucun filtrage de
   toute la passe. Tranché : le Project Analyst l'initialise.
4. **Exception à l'inviolabilité des fiches** (§7), qui n'était énoncée qu'ailleurs.
5. **Panne muette** (§2), non couverte : l'arrêt bruyant ne prévoit que l'arrêt volontaire.
6. **Constat hors préfixe** (§11), sans canal : trois agents ont buté sur le même vide et
   ont rangé leur trouvaille dans un périmètre non couvert, où rien ne la récupère.
7. **Gabarit de fiche** (§3), absent : quatre mises en forme coexistaient.

Plus le branchement de l'agent de sécurité adopté (§0), qui était le dernier point
ouvert.

**Changements v1.3 → v1.4** — préfixe `RT` ajouté au §4 pour la passe adversariale, qui
ne produit pas des constats mais des **chaînes**. Et une frontière tranchée au §4 entre
`DATA` et `API` sur la validation : les deux fichiers d'agents la revendiquaient, ce qui
a produit deux constats concurrents sur le même fait lors de la passe du 2026-09-11. La
contradiction n'a pas été vue par les agents mais par le Review Board, en remontant de
deux constats qui se contredisaient jusqu'aux deux fichiers qui les avaient produits.
**C'est la fonction du Board qu'aucun autre rôle ne remplit : il diagnostique la
bibliothèque, pas seulement le dépôt.**

**Changements v1.2 → v1.3** — première passe réelle dans Claude Code, le 2026-09-11,
sept agents lancés en parallèle. Quatre règles ajoutées, toutes issues de ce qui a
effectivement cassé, aucune anticipée :

1. **Exécution du code audité interdite** (§10). Un agent a lancé la suite de tests du
   dépôt. Les simulacres ne s'appliquaient pas, le code a émis un **appel réseau
   authentifié sortant** avec les identifiants en clair du dépôt. Un audit statique ne
   lance rien.
2. **Écriture sérialisée portée par les agents** (§7). La règle existait déjà ici et n'a
   pas tenu : rien dans les fichiers d'agents ne l'empêchait. Sept écritures
   concurrentes sur `findings/INDEX.md` ont laissé les constats de trois agents sur sept.
   Les identifiants, eux, ne se sont pas collisionnés — le préfixe par domaine du §4 a
   tenu.
3. **Fichier d'un autre agent inviolable** (§7). Un agent a supprimé le rapport d'un
   autre, un second a écrasé celui d'un troisième.
4. **`reports/` fermé aux agents d'audit** (§7). Deux agents y ont écrit alors qu'il est
   réservé au Review Board.

⚠️ Leçon de forme, plus large que ces quatre points : **une règle écrite dans ce contrat
et non portée par les fichiers d'agents n'existe pas.** Les agents ne le relisent pas à
chaque geste. Toute règle d'écriture doit être répercutée dans les huit.

**Changements v1.1 → v1.2** — ajout du domaine `REPO` (hygiène de dépôt) au §4 et
d'un neuvième rôle. Motif mesuré le 2026-09-11 : tout ce qui a été trouvé sur
`split-charges-pwa` — cinq prompts périmés, sept chemins morts, un rapport rangé dans un
répertoire exécutable, un fichier d'instructions dix fois au-dessus de sa convention —
relève d'une classe que personne n'auditait. Architecture regarde le couplage entre
modules, Code Quality regarde l'intérieur des fichiers ; **personne ne regardait
l'ensemble des fichiers lui-même**. Ajout corrélé au §6 ter des motifs de faux positifs
par défaut, ce domaine en produisant plus que tout autre.

**Changements v1.0 → v1.1** — application de la recherche d'antécédents (§13), qui
n'avait pas été conduite avant la v1.0. Trois ajouts : passe de réfutation à l'émission
(§6 bis), filtrage des faux positifs comme composant versionné (§6 ter), et sourçage de
chaque règle (§13). Un retrait de périmètre : l'agent Security n'est pas écrit mais
adopté (§0). Aucune règle de la v1.0 n'est invalidée — la taxonomie empirique des échecs
multi-agents les recouvre toutes.

## 0. Ce que ce document est, et n'est pas

Il définit **le protocole que les agents partagent** : ce qu'ils produisent, sous quelle
forme, où ils l'écrivent, et à quelles conditions ils s'arrêtent. Il ne définit aucun
rôle et aucun critère d'audit — ceux-là vivent dans les fichiers d'agent et dans la
couche référentielle.

Un agent qui ne respecte pas ce contrat ne produit pas un mauvais rapport : il produit
un rapport **non comparable** aux autres, donc inutilisable par le Review Board.

**Périmètre de ce qui est à écrire** : huit agents, sur neuf rôles d'audit. L'agent Security n'en fait pas
partie — Claude Code embarque une commande `/security-review` native, et le dépôt
`anthropics/claude-code-security-review` publie un `security-review.md` prévu pour être
copié dans `.claude/commands/` puis personnalisé. On l'adopte et on le spécialise. Un
composant maintenu par l'éditeur vaut mieux qu'un équivalent local à maintenir seul.

**Périmètre par défaut** — corrigé le 2026-09-12. Seule **la bibliothèque elle-même**
s'exclut : `.claude/agents/`, `.claude/commands/audit.md`, `.claude/contrat-agents-audit.md`
et `.claude/audit/`. **Tout le reste de `.claude/` est du contenu de projet comme un
autre** et s'audite.

⚠️ Motif : la commande excluait `.claude/` en bloc. Sur la passe du 2026-09-12, ça a mis
hors champ deux artefacts qui étaient précisément ceux qu'on voulait voir retrouver — un
deux artefacts hérités qui étaient précisément ceux qu'on voulait voir retrouver. Une
exclusion posée pour une bonne raison emporte bien plus que sa raison si elle est prise
en bloc.

**Sortie de `/security-review`** : elle s'écrit dans
`.claude/audit/security-review-output.md`. La commande ne suit pas le schéma du §3 et le
Board la transcrit depuis ce fichier. Sans emplacement fixé, la sortie a dû transiter par
un dossier temporaire de session le 2026-09-12, et son chemin par une ligne ajoutée au
message du Board — hors de la formule prescrite.

**Son branchement dans la séquence** — dernier point ouvert du contrat, tranché le
2026-09-12 après deux passes où le préfixe `SEC` n'a produit aucun fichier.
`/security-review` est une commande, pas un sous-agent : elle ne s'invoque pas comme les
autres et n'écrit pas au schéma du §3. Elle se lance **dans la même étape que les agents
d'audit**, et sa sortie est reprise en fiches `SEC-<NNN>` par le Review Board à partir de
ce qu'elle affiche. C'est le seul endroit de la chaîne où le Board transcrit au lieu de
consolider, et il le signale comme tel dans son rapport.

⚠️ Conséquence mesurée sur les deux passes : les défauts de sécurité du dépôt ont été
trouvés quand même — concaténation LDAP, identifiants en clair — mais **par les agents
données, API et QA**, chacun depuis son angle. Un domaine non couvert par son agent dédié
n'est pas un domaine aveugle ; il est couvert de biais, plus tard et moins bien.

---

## 1. Le contexte ne se fige jamais dans un agent

**Aucun agent ne porte en dur** : un chemin de fichier, une liste de fichiers, une
description d'architecture, un nom de framework, une valeur de configuration, une
version de dépendance, un token de design.

Motif mesuré le 2026-09-11 sur `split-charges-pwa` : cinq prompts d'audit datés du
2026-03-22, du code commité le jour même du constat. Sept références `@chemin` sur onze
mortes, deux fichiers cibles inexistants, une architecture « single-file HTML » affirmée
comme un choix volontaire alors que le dépôt porte huit fichiers CSS et une arborescence
de modules, et un contrôle de contraste portant sur deux couleurs (`#b0b0b0` sur
`#1a1a2e`) que le thème n'utilise plus depuis sa migration en clair. **Aucun de ces
écarts n'a jamais produit d'erreur.** Les prompts tournaient et rendaient des rapports
plausibles.

Un contexte périmé énoncé comme une décision assumée est pire qu'un contexte absent :
il ne s'interroge pas.

**Règle** : le contexte est produit à l'exécution par le Project Analyst, dans
`PROJECT_CONTEXT.md`, et lu par tous les autres. C'est le seul fichier de la chaîne qui
décrit le dépôt, et il est réécrit à chaque passe — jamais amendé.

**Corollaire d'extensibilité** : un agent ne connaît pas les technologies. Il détecte la
pile puis charge le fichier référentiel correspondant. Ajouter Python, Next.js ou une
pile qui n'existe pas encore consiste à ajouter **un fichier de référence**, pas un
agent. C'est la couche référentielle qui est l'axe d'extension, pas l'organigramme.

## 2. Échec bruyant sur cible absente

Un agent dont une cible déclarée n'existe pas **s'arrête et le dit**. Il ne produit pas
un rapport sur ce qu'il a trouvé à la place, et il ne rend pas « rien à signaler ».

```
AGENT      <nom>
STATUT     ARRÊT — cible absente
ATTENDU    <ce qui était cherché>
CONSTATÉ   <ce qui a été trouvé>
```

Un rapport sur périmètre amputé est indiscernable d'un rapport sur dépôt sain. C'est le
mode de défaillance le plus coûteux de toute la chaîne.

⚠️ **L'arrêt bruyant ne couvre que l'arrêt volontaire.** Un agent peut aussi se bloquer
sans rien écrire ni rien dire — c'est arrivé au Review Board le 2026-09-12, stoppé par un
chien de garde après dix minutes sans progression. Aucun bloc d'arrêt, aucun fichier.
La parade n'est pas dans l'agent, elle est dans la séquence : **chaque étape porte une
condition de passage vérifiée sur l'état du disque**, jamais sur ce qu'un agent a déclaré.
Un agent muet est alors indiscernable d'un agent bloqué, et les deux sont traités pareil —
on relance à l'identique, sans rien ajouter à son message.

## 3. Le schéma de finding

Tous les agents émettent exactement cette structure. Champs obligatoires marqués `*`.

```
ID*                  <PREFIXE>-<NNN>          voir §4
TITRE*               une ligne, factuelle
AGENT*               nom de l'agent émetteur
COMMIT*              SHA court du commit audité
DATE*                AAAA-MM-JJ
CERTITUDE*           [Constaté] | [Déduit] | [À vérifier]     voir §5
SÉVÉRITÉ*            Critique | Haute | Moyenne | Basse | Info
LOCALISATION*        chemin:ligne, ou « transverse »
CONSTAT*             ce qui est observé
PREUVE*              extrait, sortie de commande, ou commande reproductible
RÉFUTATION*          ce qui a été tenté pour invalider le constat   voir §6 bis
IMPACT*              ce que ça coûte, pas ce que c'est
CAUSE RACINE         renseigné par le Review Board, pas par l'émetteur
RECOMMANDATION*      ce qu'il faut faire
PREUVE DE CLÔTURE*   Code | Test | Visuel                     voir §6
EFFORT               Faible | Moyen | Élevé
RISQUE DE RÉGRESSION Faible | Moyen | Élevé
LIÉS                 IDs, voir §4
```

**Gabarit exact** — à respecter au caractère près. Quatre mises en forme différentes
coexistaient après la passe du 2026-09-12, parce que cette section décrivait les champs
sans en publier la forme. Un schéma décrit n'est pas un schéma imposé.

```markdown
---
id: <PREFIXE>-<NNN>
empreinte: <PREFIXE>-<sha1 court de chemin+nature>   # §18, stable entre passes
agent: <nom>
commit: <sha court>
date: AAAA-MM-JJ
severite: Critique | Haute | Moyenne | Basse | Info
certitude: Constaté | Déduit | À vérifier
preuve-de-cloture: Code | Test | Visuel
effort: Faible | Moyen | Élevé
risque-de-regression: Faible | Moyen | Élevé
statut: ouvert
---

# <PREFIXE>-<NNN> — <titre sur une ligne>

## Localisation
## Constat
## Preuve
## Réfutation
## Impact
## Recommandation
## Cause racine
_(renseigné par le Review Board)_
## Liés
```

Un champ sans contenu s'écrit avec la mention `—`, jamais en supprimant la section :
une section absente et une section vide ne se lisent pas pareil.

**`PREUVE` est obligatoire et ne peut pas être une reformulation du constat.** Un
finding sans preuve reproductible n'est pas un finding de sévérité moindre : c'est un
finding en `[À vérifier]`, quelle que soit la conviction de l'agent.

**`IMPACT` dit le coût, pas la nature.** « Viole WCAG 2.2 » n'est pas un impact ;
« illisible pour un daltonien sur l'écran qui porte le solde » en est un.

## 4. Identifiants : allocation et stabilité

**Préfixe par domaine**, pas par agent — un domaine peut changer d'agent, un finding ne
change pas d'identifiant : `ARCH`, `SEC`, `API`, `PERF`, `DATA`, `UI`, `A11Y`, `QA`,
`PRIV`, `CQ`, `REPO`, `RT`.

`RT` est à part : il ne désigne pas un domaine mais une **composition**. Une fiche `RT`
est une chaîne d'au moins deux maillons établis, produite après le Review Board, et sa
certitude est celle de son maillon le plus faible — jamais une moyenne. Voir
`red-team.md`.

**Frontière `DATA` / `API` sur la validation** — tranchée le 2026-09-12, les deux agents
la revendiquant jusque-là. Le critère est **où la donnée n'est pas vérifiée** : en
franchissant la frontière (charge utile entrante, réponse distante) → `API` ; au repos
(champ persisté sans borne, sans type, sans format) → `DATA`. Un champ vérifié ni à
l'entrée ni au stockage produit deux constats liés, avec deux localisations distinctes.

`REPO` couvre l'ensemble des fichiers, pas leur contenu : arborescence, fichiers
orphelins, doublons de version, documentation qui contredit le dépôt, artefacts de
débogage commités, exécutables et rapports mélangés, taille et conventions des fichiers
d'instructions, versionné qui ne devrait pas l'être.

⛔ **Un agent `REPO` ne conclut jamais « supprimer ».** Au mieux `[Déduit]`, avec sa
condition de levée — qui lit ce fichier, et comment le vérifier. Son
`RISQUE DE RÉGRESSION` est `Élevé` par défaut : la suppression est destructive et un faux
positif y coûte plus cher qu'ailleurs.

**Allocation** : l'agent lit `findings/INDEX.md` avant d'écrire et prend le premier
numéro libre de son préfixe. Un agent n'alloue jamais un numéro d'un préfixe qui n'est
pas le sien.

**Stabilité** : un identifiant est attribué une fois et ne se réattribue jamais. Un
finding corrigé passe en `status: résolu` dans l'index, son numéro reste consommé. Un
finding rouvert **reprend son numéro d'origine**.

⛔ Renuméroter à la passe suivante rend faux tous les champs `LIÉS` **en silence** :
les renvois continuent de pointer vers des identifiants qui existent et qui désignent
autre chose. Ce défaut est indétectable par relecture.

⚠️ Deux agents en parallèle peuvent lire le même « premier numéro libre » et l'allouer
tous les deux de bonne foi — le cas s'est produit sur le vault le 2026-09-11 entre deux
sessions du même projet. La séquentialisation se fait au moment de l'écriture (§7), pas
au moment de la lecture.

## 5. Un seul axe d'incertitude

`[Constaté]` / `[Déduit]` / `[À vérifier]`, défini par **ce qui le ferait basculer** :

- **`[Constaté]`** — une commande ou une lecture directe l'établit, et la preuve est
  dans le champ `PREUVE`. Bascule si la commande rend autre chose.
- **`[Déduit]`** — suit d'un constat par un raisonnement énoncé. Bascule si le
  raisonnement est faux. Le champ `PREUVE` porte le constat de départ, pas la déduction.
- **`[À vérifier]`** — plausible, non établi. **Porte obligatoirement sa condition de
  levée** : ce qu'il faudrait exécuter ou observer pour trancher. Un `[À vérifier]` sans
  condition de levée n'est pas un finding, c'est une impression.

Ce champ ne dit rien de la gravité, et `SÉVÉRITÉ` ne dit rien de la certitude. Une faille
critique soupçonnée est `Critique` + `[À vérifier]`. Deux axes non distingués — un pour
le statut, un pour la confiance — se remplissent au hasard : c'est pourquoi il n'y en a
qu'un.

## 6. Preuve de clôture

Chaque finding déclare **ce qui prouvera qu'il est résolu** :

- **`Code`** — la relecture du diff suffit.
- **`Test`** — un test doit exister et échouer contre le code d'origine avant que la
  correction soit écrite. Un test qui n'a jamais été vu rouge ne mesure rien.
- **`Visuel`** — la correction ne se juge que sur rendu. Passe par la boucle design
  (§9).

Sans ce champ, un finding d'ergonomie se « vérifie » en relisant du CSS, ce qui ne prouve
rien. C'est le champ qui décide de la suite du parcours, pas une métadonnée.

## 6 bis. Passe de réfutation, à l'émission

Avant d'écrire un finding, l'agent **cherche activement ce qui le rendrait faux** et
consigne la tentative dans le champ `RÉFUTATION`.

- Réfutation échouée → le finding s'écrit, certitude inchangée.
- Réfutation partielle → bascule en `[Déduit]` ou `[À vérifier]`, avec ce qui reste à
  trancher.
- Réfutation réussie → **aucun finding n'est écrit.**

Ce n'est pas la vérification de fin de chaîne, et ça ne s'y substitue pas : une preuve
demande à l'agent de confirmer, une réfutation lui demande de se contredire. Un agent
qui n'a cherché qu'à confirmer trouve toujours.

⚠️ Point de vigilance mesuré ailleurs : les systèmes multi-agents incluent
majoritairement un agent vérificateur, et ses contrôles sont pourtant régulièrement
insuffisants. Un vérificateur terminal seul est une parade connue faible. C'est la raison
d'être de cette passe **à l'émission**, en amont.

## 6 ter. Filtrage des faux positifs

Chaque dépôt porte un `audit/false-positives.md`, en trois sections :

1. **Motifs exclus d'office** — ce qui ne doit jamais remonter dans ce dépôt.
2. **Questions d'évaluation** — ce qu'il faut se demander pour juger qu'un finding
   représente un problème réel ici.
3. **Particularités de l'environnement** — ce que l'architecture rend sans objet,
   avec la raison.

**Qui l'écrit** : le **Project Analyst**, à la première passe, avec les motifs par défaut
ci-dessous. Il est le seul agent autorisé à écrire hors `findings/`, et il passe en
premier. Ensuite le fichier est amendé **par l'humain**, au fil des faux positifs
rencontrés, chaque exclusion documentant son motif. Aucun agent d'audit ne le modifie.

⚠️ Tranché le 2026-09-12. Jusque-là ce fichier était prescrit sans auteur : cinq agents
sur sept ont signalé son absence, ont refusé de le créer en expliquant que ce n'était pas
leur rôle — et ils avaient raison. **Aucun filtrage de faux positifs n'a été appliqué de
toute la passe.** Une prescription sans destinataire ne produit rien, et ne produit même
pas d'erreur.

Il est versionné comme du code.

**Motifs par défaut, section 1** — mesurés le 2026-09-11 en passant une sonde de fichiers
orphelins sur un dépôt réel, qui a rendu plus de quarante résultats dont une trentaine de
tests parfaitement vivants :

- suites de tests découvertes par motif de nom et non par import (Vitest, Pester,
  Playwright) ;
- fichiers de configuration lus par l'outillage et jamais cités (`.gitattributes`,
  `dependabot.yml`, manifestes de CI) ;
- modules chargés par un nom construit à l'exécution, invisibles à toute recherche
  d'import statique ;
- écriture console dans un point d'entrée destiné à un opérateur, proscrite ailleurs ;
- valeur hors convention dont la dérogation est motivée dans le fichier même.

**Un fichier sans référence entrante n'est pas un fichier mort.**

Sans ce composant, le bruit tue l'usage : une chaîne qui remonte trente findings dont
vingt sans objet cesse d'être lue au troisième passage, et son silence devient
indiscernable de son absence.

⛔ Une exclusion est une **prescription négative**. Elle ne s'écrit jamais sans avoir
cherché la preuve du contraire, et elle porte sa raison — pas seulement son motif.

## 7. Protocole fichier

Les sous-agents Claude Code **ne communiquent pas entre eux** : chacun démarre avec un
contexte isolé et neuf, ne voit ni l'historique ni les fichiers déjà lus par les autres,
et rend son résultat à l'agent principal. Toute corrélation passe donc par le disque.

```
.claude/audit/
├── PROJECT_CONTEXT.md          écrit par le Project Analyst, réécrit à chaque passe
├── false-positives.md          voir §6 ter
├── findings/
│   ├── INDEX.md                une ligne par finding : ID, titre, sévérité, certitude, statut
│   └── <ID>.md                 un fichier par finding, schéma §3
├── reports/
│   └── AAAA-MM-JJ-<sha>.md     rapport consolidé, daté et rattaché à un commit
└── briefs/
    └── <ID>-brief.md           cadrage UI, voir §9
```

**Qui écrit quoi** : un agent n'écrit que sous `findings/` et que ses propres préfixes.
Seul le Review Board écrit sous `reports/` et renseigne les champs `CAUSE RACINE`. Seul
le Project Analyst écrit `PROJECT_CONTEXT.md`.

**Quand** : les agents d'audit s'exécutent en parallèle, mais **l'écriture dans
`findings/` est séquentielle** — l'orchestrateur collecte les rapports et écrit. C'est la
seule parade à la collision d'identifiants du §4.

**Aucun agent d'audit n'écrit ailleurs que là.** Aucun ne touche au code.

⛔ **Tu ne crées aucun répertoire dans lequel tu n'écris pas.** Un répertoire vide apparu
en cours de passe n'est attribuable à personne et ne se distingue pas d'un agent qui a
échoué au milieu.

ℹ️ **`.claude/audit/` s'ajoute au `.gitignore` du dépôt audité.** Ces sorties citent du
contenu applicatif, sont propres à un commit, et n'ont rien à faire dans l'historique.

⛔ **Un agent d'audit ne lit pas les fiches des autres agents.** Ni pour se situer, ni
pour éviter un doublon, ni pour s'appuyer dessus. Son indépendance est ce qui rend les
recoupements informatifs : deux agents qui convergent sans s'être lus valent une preuve,
deux agents dont l'un a lu l'autre valent un écho.
⚠️ Le 2026-09-12, un agent a cité dix fiches de deux agents **encore en cours**. Rien ne
le lui interdisait : la règle existait dans l'intention, nulle part dans le texte.
Le Project Analyst et le Review Board sont les seuls à lire ce que d'autres ont produit,
et à des moments où personne n'écrit.

⛔ **Trois interdits d'écriture, à répercuter dans chaque fichier d'agent** — mesurés le
2026-09-11, où les trois ont été violés en une seule passe :

- **`findings/INDEX.md` n'est jamais écrit par un agent d'audit.** Il est reconstruit
  depuis les fichiers de constat **par le Review Board**, et par lui seul.
  **Exception pour la Red Team** : elle s'exécute après la consolidation, donc après la
  reconstruction. Elle ajoute ses propres lignes à la fin de `INDEX.md`, en **ajout
  seul**, sous un intertitre `## Chaînes (passe adversariale)`. Elle ne réécrit rien.
  ⚠️ Sans cette exception, ses fiches existent sur le disque et ne figurent ni à l'index
  ni au rapport — constaté le 2026-09-12.
  ⚠️ Tranché le 2026-09-12 : ce paragraphe l'attribuait à l'orchestrateur, le fichier du
  Review Board se l'attribuait, et la commande `/audit` interdit à l'orchestrateur
  d'écrire sous `.claude/audit/`. Trois textes, trois versions. L'index n'a existé que
  parce que le Board l'a fait de lui-même : **si chacun avait suivi son texte à la
  lettre, personne ne l'aurait écrit et rien ne l'aurait signalé.** Sept agents
  parallèles qui le réécrivent en entier laissent les constats de trois.
- **Un agent ne modifie ni ne supprime le fichier produit par un autre agent**, quelle
  qu'en soit la raison — ni doublon, ni rangement, ni correction.
  **Une seule exception, et elle est nommée ici** : le Review Board renseigne
  `CAUSE RACINE`, `LIÉS` et `statut` sur les fiches existantes. Il ne touche à aucun
  autre champ, et ne supprime jamais une fiche.
- **`reports/` est fermé aux agents d'audit.** Seul le Review Board y écrit.

Un agent qui pense devoir faire l'une de ces trois choses le signale dans son périmètre
non couvert et n'en fait rien.

⚠️ Claude Code met en file et exécute jusqu'à dix tâches en parallèle : au-delà, la
parallélisation est apparente, pas réelle. Un lot de sept agents passe en une vague.

## 8. Modèle par rôle

Le modèle est un champ du contrat, déclaré dans le frontmatter de chaque agent, pas une
décision globale.

| Nature de la tâche | Classe |
|---|---|
| Exploration, inventaire, collecte | Haiku |
| Audit de domaine, analyse courante | Sonnet |
| Sécurité, corrélation, Review Board | Opus |

Motif : c'est ce champ qui décide du coût de chaque passe. Le sous-agent `Explore`
intégré à Claude Code tourne déjà en Haiku, en lecture seule — la bibliothèque suit la
même logique.

⚠️ Le champ `model` d'un fichier d'agent vaut `inherit` par défaut : un agent qui ne le
déclare pas prend le modèle de la session principale, et le coût de la passe devient
imprévisible. **Les huit fichiers le déclarent explicitement.**

⚠️ Les classes se vérifient à leur version courante avant tout déploiement ; ce tableau
raisonne par classe et ne cite volontairement aucun numéro de version.

ℹ️ Les agents de projet (`.claude/agents/`) priment sur les agents utilisateur
(`~/.claude/agents/`) : un agent local peut masquer un agent global du même nom sans
que rien ne le signale.

## 9. Classe UI : brief, canvas, retour au code

Pour tout finding en `PREUVE DE CLÔTURE = Visuel`, l'agent UI produit en plus un
**brief** sous `briefs/<ID>-brief.md` : contraintes, ce que l'interface doit
obligatoirement montrer, tokens existants, comportements responsive. **Aucune orientation
esthétique** — celle-ci se décide sur le canvas.

Le brief part vers Claude Design, la maquette revient, elle porte l'ID du finding.

⛔ **Une maquette validée n'est jamais une preuve de résolution.** Le finding reste
ouvert tant que le code n'a pas bougé, et la vérification tourne sur le code livré.
Claude Design est en research preview et sa consommation est comptée à part : rien de la
chaîne ne doit en dépendre de façon bloquante. Un finding reste actionnable sans lui.

## 10. Séparations non négociables

**Audit ≠ exécution.** Un agent d'audit **n'exécute pas le code du dépôt** : ni suite de
tests, ni script, ni point d'entrée, ni commande de construction. Il lit.

⚠️ Le mode de défaillance : les simulacres posés dans une suite de tests ne s'appliquent
pas toujours à ce qu'ils prétendent intercepter. Exécuter une suite peut donc faire
partir du trafic réel, authentifié, sans que le test le signale. Personne ne l'avait
prévu avant que ça arrive.

Ce qui reste permis : les outils de lecture et d'inspection qui n'exécutent pas le code
audité — recherche, listage, `git log`, calculs faits par l'agent sur des valeurs qu'il a
lues. La frontière est : **est-ce que du code de ce dépôt s'exécute ?**

Quand un constat ne peut être établi que par exécution, il s'écrit `[À vérifier]` avec
la commande à lancer comme condition de levée. C'est à l'humain de la lancer, en
connaissance de cause.

**Audit ≠ implémentation.** Un agent d'audit ne modifie pas une ligne de code, même
évidente, même à un caractère. L'implémentation intervient après validation humaine de la
roadmap, et seulement sur les findings approuvés.

**Prompt ≠ rapport.** Un répertoire exécutable ne contient que des exécutables. Un
rapport d'audit rangé dans `.claude/commands/` devient invocable et injecte un constat
daté avec l'autorité d'une instruction — constaté sur `split-charges-pwa`, avec un
rapport de mars 2026 encore invocable en septembre.

**Rapport ≠ état courant.** Tout rapport porte sa date et le SHA du commit audité.
Sans les deux, on ne sait pas de quel état il parle, et il vieillit sans le dire.

## 11. Règles héritées par tous les agents

- Ne rien affirmer qu'on n'a pas ouvert. Un fichier non lu n'est pas un fichier sain.
- Ne pas transformer une différence stylistique en finding.
- **Ne pas émettre de prescription négative** — « pas de problème sur X », « laisser en
  l'état » — sans avoir cherché activement la preuve du contraire. Une absence de
  recherche s'y déguise en absence de preuve.
- **Le disque fait foi, pas ton compte rendu.** Ce que tu annonces dans ta réponse doit
  correspondre à ce que tu as écrit — nombre de fiches, commandes exécutées, fichiers
  réécrits. Un écart entre les deux rend tes deux sorties suspectes, et c'est le disque
  qui est lu.
- **Ne jamais produire de chiffre non mesuré.** Ni décompte de composants revus, ni
  projection d'amélioration, ni score sans instrument. Les catalogues d'agents publics
  en sont pleins : c'est de la mise en scène de rigueur, et ça contamine la confiance
  accordée aux chiffres qui, eux, sont mesurés.
- **Un constat hors de ton préfixe se remonte, il ne se jette pas.** Quand tu vois un
  fait réel qui appartient au domaine d'un autre agent, écris-le dans
  `findings/HORS-PERIMETRE.md` — une ligne : le fait, sa localisation, le préfixe
  présumé. Tu n'ouvres pas de fiche, tu ne juges pas, tu n'empiètes pas. Le Review Board
  lit ce fichier et l'arbitre.
  ⚠️ Motif mesuré le 2026-09-12 : trois agents ont chacun trouvé un fait hors de leur
  domaine, ont correctement refusé d'ouvrir une fiche, et l'ont rangé dans leur périmètre
  non couvert — d'où **rien ne le récupère à la passe suivante**. Le seul fichier
  partagé en écriture de toute la chaîne, et il est en ajout seul : on y ajoute une
  ligne, on n'y réécrit jamais.
- **Écrire son périmètre non couvert sur le disque**, dans
  `findings/PERIMETRE-<nom-de-l-agent>.md`, où `<nom-de-l-agent>` est **exactement** la
  valeur du champ `name` de ton propre fichier — pas un nom de rôle, pas une variante. Ce qui n'a pas été regardé se déclare ; c'est
  la seule façon de distinguer « rien » de « pas regardé ».
  ⚠️ Jusqu'au 2026-09-12, cette déclaration ne vivait que dans la réponse de l'agent.
  Le §7 fait passer toute corrélation par le disque, le gabarit ne lui donnait pas de
  section, et le Review Board a dû **reconstruire par déduction** ce que personne n'avait
  couvert, à partir des fiches. Une obligation sans support est une obligation perdue.
  Ce fichier porte deux choses, et la seconde est la plus importante :
  **ce que tu n'as pas regardé**, et **ce que tu as ouvert pour de bon par rapport à ce
  que tu as seulement inventorié**. Sur 446 fichiers, un agent échantillonne ; un
  échantillonnage non déclaré est indiscernable d'un audit exhaustif.

## 12. Validation du contrat lui-même

Ce contrat n'est pas réputé fonctionner parce qu'il est écrit. Il se valide sur un
**dépôt témoin à défauts semés** : *N* défauts plantés et documentés, couvrant chaque
préfixe et chaque valeur de `PREUVE DE CLÔTURE`. Un agent se juge sur son taux de
détection **et** son taux de faux positifs.

⚠️ Un agent qui rend « rien à signaler » sur un dépôt sain et un agent cassé sont
indiscernables tant qu'il n'a pas produit un positif sur un cas connu positif.

Tant que le dépôt témoin n'existe pas, **aucun chiffre produit par cette chaîne n'est une
mesure** — ni un décompte de findings, ni un score.

## 12 bis. La variance, et ce qu'elle interdit de conclure

**Deux passes sur le même dépôt ne rendent pas les mêmes constats.** Mesuré les 11 et 12
septembre 2026 sur le dépôt témoin : quatre défauts trouvés à la première passe ont été
manqués à la seconde — absence d'annonce des mises à jour aux lecteurs d'écran, taille des
cibles tactiles, abonnement temps réel non borné, absence d'état de chargement. Aucun
n'avait été corrigé entre les deux. Dans l'autre sens, la seconde a trouvé des faits que
la première avait laissés passer.

Ce n'est pas un défaut à corriger, c'est une propriété de l'instrument. Elle interdit
deux conclusions :

- **Le silence d'une passe sur un domaine ne dit rien de ce domaine.** « Aucun constat
  d'accessibilité » ne veut pas dire « accessible ».
- **Une comparaison entre deux passes ne mesure pas une évolution du dépôt** tant que
  l'écart reste dans la variance. Un constat disparu peut être un défaut corrigé ou un
  défaut manqué.

Ce qu'elle impose : sur un dépôt qui compte, **deux passes valent mieux qu'une**, et
l'union de leurs constats vaut mieux que l'une des deux. Tout rapport porte la mention
que son silence n'est pas un constat.

ℹ️ Le dépôt `anthropics/claude-code-security-review` embarque un moteur d'évaluation
avec gestion de worktrees et une infrastructure de tests. À examiner avant de fabriquer
le dépôt témoin de zéro.

## 21. La boucle de retour

Rien de ce que l'humain décide ne revient dans le système. Un risque accepté
délibérément, un faux positif écarté, une convention assumée ressortent à chaque passe —
et c'est ainsi qu'un outil meurt : on apprend à ignorer ses rapports.

Deux fichiers portent cette mémoire, et **seul l'humain les écrit** :

- `false-positives.md` (§6 ter) — ce qui ne doit plus remonter, avec sa raison.
- `risques-acceptes.md` — un constat réel, compris, et **assumé**. Il porte l'identifiant
  stable du §18, la date de la décision, et ce qui la ferait réexaminer.

Un agent lit les deux et n'en écrit aucun. Un constat dont l'identifiant figure dans
`risques-acceptes.md` se produit quand même, avec `statut: accepté` — **il n'est pas
supprimé**, sinon la décision disparaît avec lui et personne ne saura pourquoi ce défaut
ne remonte plus.

## 20. La barrière de couverture

La couverture était déclarée (§11) ; elle devient un **verrou**.

Le Review Board calcule, depuis les `PERIMETRE-*` et les indices vérifiés, la part du
périmètre réellement atteinte. Il l'inscrit en tête de rapport, avant tout constat.

⛔ **Un rapport dont la couverture est inférieure au seuil ne conclut pas.** Il rend ce
qu'il a trouvé et déclare explicitement qu'il ne couvre pas le périmètre demandé, avec la
liste des lots restants. Seuil par défaut : **80 % des fichiers du périmètre**, atteints
par ouverture ou par indice vérifié.

⚠️ Un audit qui trouve peu sur un cinquième d'un dépôt et un audit qui trouve peu sur un
dépôt sain **se ressemblent exactement**. Cette barrière est ce qui les distingue, et
c'est la seule chose qui empêche de lire un rapport comme un quitus.

**Comment on monte la couverture** : en découpant. L'orchestrateur enchaîne des vagues sur
des lots dimensionnés pour tenir dans une fenêtre, et l'union des passes couvre le
périmètre. Un agent ne peut pas ouvrir 130 fichiers ; cinq agents sur cinq lots le
peuvent.

## 19. La pondération par le risque

Quand on ne peut pas tout ouvrir, ce qui compte n'est plus combien mais **lesquels**.

Deux signaux déterministes, gratuits, et que rien n'exploitait :

- la **fréquence de modification** d'un fichier, depuis `git log` ;
- sa **couverture de test**, depuis la couverture fusionnée.

Un fichier souvent modifié et peu couvert est l'endroit où les défauts vivent. Un fichier
inchangé depuis deux ans est calme. Le produit des deux donne un classement, déposé en
`.claude/audit/tooling/risque.json`.

⛔ **Ce classement ne produit aucun constat et n'en justifie aucun.** Il dirige
l'attention, rien d'autre. Un fichier en tête de liste n'est pas suspect ; il est
prioritaire à ouvrir.

Chaque agent traite les fichiers de son domaine **dans cet ordre**, et son fichier de
périmètre dit où il s'est arrêté dans le classement — ce qui rend son arrêt lisible :
s'être arrêté au rang 40 sur 130 ne dit pas la même chose selon qu'on a commencé par le
haut ou au hasard.

⚠️ Un classement sans mesure de couverture ne reflète que la fréquence de modification, et
le fichier produit doit le déclarer. **Non couvert** et **non mesuré** ne sont pas la même
chose.

## 18. L'identité des constats

Chaque passe repart à `001`. Un `REPO-003` de mardi et un `REPO-003` de mercredi n'ont
aucun rapport. Impossible de dire ce qui est **nouveau**, ce qui est **corrigé**, ce qui
**revient** — et donc impossible de lire une tendance ou de vérifier une correction.

Tout constat porte donc, en plus de son identifiant de passe, une **empreinte stable** :

```
empreinte: <prefixe>-<sha1 court de (chemin normalisé + nature du défaut)>
```

La nature est la formulation canonique du défaut, pas son titre : *« appel sortant sans
borne de temps »*, pas *« Les trois appels vers Nominatim n'ont aucune borne »*. Deux
passes qui décrivent le même défaut au même endroit doivent rendre la même empreinte,
quels que soient leurs mots.

Le Review Board compare les empreintes de la passe à celles du dernier rapport et classe :
**nouveau**, **persistant**, **disparu**.

⛔ **« Disparu » ne veut pas dire « corrigé ».** La variance du §12 bis fait qu'un constat
peut disparaître parce qu'il a été manqué. Un constat n'est déclaré corrigé que par le
`verification` (§22), jamais par son absence.

## 17. La preuve dynamique

Lire du code ne dit pas ce qu'il produit. Le contraste après superposition, l'ordre de
tabulation effectif, le focus piégé dans une modale, ce qu'une règle d'accès autorise
réellement : rien de tout cela ne se déduit d'une lecture.

**Qui l'exécute** : l'humain ou la CI, **jamais un agent**. Exécuter, c'est faire tourner
le code du dépôt (§10). Les sorties vont dans `.claude/audit/tooling/`.

**Ce que ça change à la certitude** — c'est l'apport principal :

| Établi par | Certitude plafond |
|---|---|
| lecture de code seule | `[Déduit]`, avec la mesure comme condition de levée |
| mesure sur le rendu, au même commit | `[Constaté]` |

Un agent qui laisse un constat en `[Déduit]` faute d'observation **nomme la mesure qui le
trancherait** — c'est ce qui rend la boucle utilisable : la liste des `[Déduit]` d'une
passe est la liste des mesures à lancer avant la suivante.

⛔ **Une sortie dynamique dont le commit ne correspond pas à celui de la passe ne
s'utilise pas.** Elle est plus périssable qu'une sortie statique : elle dépend aussi de
la version du navigateur, de l'émulateur et du jeu de données. Elle porte donc sa date,
son commit et la version de l'outil.

Détail des outils et des commandes : `preuve-dynamique.md`.

## 16. Les indices de l'outillage déterministe

Un analyseur statique voit ce qu'un agent survole — la ligne 1 400 d'un fichier qu'il
n'ouvrira jamais. Un agent voit ce qu'un analyseur ne peut pas voir. Les deux se
combinent nettement mieux que chacun seul, et les constats d'un analyseur injectés
**comme indices à vérifier** récupèrent une part importante de ce qu'une passe manque.

**Qui les lance** : l'humain ou la CI, **jamais un agent** — faire tourner un analyseur
suppose d'installer des dépendances et d'exécuter une chaîne d'outillage, ce que le §10
interdit. Les sorties se déposent dans `.claude/audit/tooling/`.

**Ce qu'un agent en fait** — deux issues, et deux seulement, pour tout indice relevant de
son préfixe :

- **Vérifié** → fiche au schéma du §3, **avec sa propre preuve**. L'indice est cité en
  `LIÉS`, jamais comme preuve. ⛔ Une sortie d'outil n'est pas un constat : elle n'a ni
  impact, ni cause, ni localisation vérifiée dans son contexte.
- **Écarté** → une ligne dans `findings/INDICES-ECARTES.md`, en ajout seul : l'indice, la
  règle qui l'a produit, pourquoi il ne tient pas ici.

⚠️ **Un indice non traité est pire qu'un indice absent** : il donne l'illusion d'une
couverture.

**Effet sur la couverture** : les indices sont le seul canal par lequel un fichier **non
ouvert** produit quand même un constat. Les fichiers `PERIMETRE-*` distinguent donc trois
catégories : **ouvert**, **atteint par un indice vérifié**, **non couvert**.

Détail des outils et des commandes : `outillage-deterministe.md`.

## 15. Où vivent les motifs mesurés

Chaque règle de ce contrat porte le motif qui l'a produite — sans quoi elle sera retirée
un jour par quelqu'un qui ignore ce qu'elle protège.

⚠️ **Mais un motif qui nomme un défaut d'un dépôt auditable est la réponse à un test en
cours.** Les deux exigences se contredisent, et la seconde l'emporte.

| Le motif nomme… | Où il vit |
|---|---|
| une défaillance de la bibliothèque | dans le fichier concerné, déployé |
| un **défaut d'un dépôt auditable** | dans `journal-passes.md`, qui **ne se déploie jamais** |

Un fichier déployé garde la **règle** et le **mode** de défaillance ; jamais l'instance,
jamais sa localisation, jamais son décompte.

Dans le doute, le motif va au journal : perdre un peu de mémoire coûte moins cher que
perdre la capacité de mesurer.

## 14. La couche référentielle

Les agents ne connaissent aucune technologie. Ils détectent la pile dans
`PROJECT_CONTEXT.md`, puis chargent `.claude/audit/references/<pile>.md` s'il existe.

**C'est ici que se fait l'extension à une pile nouvelle**, et nulle part ailleurs.
Ajouter Python ou Next.js consiste à ajouter un fichier de référence — aucun agent ne
change. Un agent qui porterait ses propres versions dans son texte reproduirait le défaut
du §1 à un cran au-dessus : un contexte figé, mais partagé par tous les dépôts.

Un fait de référence porte trois champs, faute de quoi il n'entre pas : **sa source**,
**sa date de vérification**, **sa condition de péremption**.

**Personne ne les écrit automatiquement.** Un agent qui rédigerait sa propre référence y
inscrirait ce qu'il croit savoir, et la couche perdrait sa seule raison d'être. Ces
fichiers sont écrits et révisés à la main, après vérification à la source.

**Quand la référence manque, ou qu'elle a plus de douze mois** : le constat s'écrit
`[À vérifier]`, avec la vérification à faire comme condition de levée, et l'absence est
signalée dans le périmètre non couvert. Un fait de plus de douze mois n'est pas réputé
faux — **plus personne ne sait s'il est vrai**, ce qui suffit à le sortir du `[Constaté]`.

⚠️ Un fait présent mais non revérifié s'étiquette au lieu d'être exclu. Le fichier
`accessibilite-wcag.md` porte ses seuils avec la mention explicite qu'ils n'ont pas été
confirmés à la source : un agent qui s'en sert écrit `[Déduit]`, pas `[Constaté]`. C'est
la couche qui s'applique sa propre discipline.

## 22. La vérification d'une correction

Un constat se ferme aujourd'hui sur rien. On corrige, et personne ne dit si c'est fermé.

L'agent `verification` prend un constat au statut `corrigé-à-vérifier` et répond à une
seule question : **le défaut est-il réellement parti ?**

Il ne relit pas la recommandation, il éprouve le constat d'origine — par le moyen que
déclare son champ `PREUVE DE CLÔTURE` :

| Preuve de clôture | Ce qui ferme |
|---|---|
| `Code` | la preuve d'origine, rejouée, ne tient plus |
| `Test` | un test existe, et **il échouait contre le code d'origine** |
| `Visuel` | une mesure sur le rendu (§17), au commit courant |

⛔ **Un test qui n'a jamais été vu rouge ne ferme rien.** C'est la seule exigence de cette
section qui ne se contourne pas : un test écrit après la correction et qui passe du
premier coup ne démontre pas que le défaut est parti.

Trois verdicts : **fermé**, **partiel** — le défaut a changé de forme —, **toujours
ouvert**. Jamais « probablement corrigé ».

## 13. Antécédents

Recherche conduite le 2026-09-11, en deux passes (documentation Anthropic, puis pratique
communautaire et littérature). Ce contrat n'est pas une innovation locale.

| Règle | Antécédent |
|---|---|
| §6 bis réfutation | Le système de revue de PR multi-agents de Claude Code dispatche des agents spécialisés par classe de problème, puis fait passer un pas de vérification qui cherche à réfuter chaque finding avant publication |
| §6 ter faux positifs | Filtrage configurable par projet du dépôt `anthropics/claude-code-security-review`, en trois sections, amendé au fil des faux positifs et versionné |
| §0 Security adopté | `/security-review` est une commande native de Claude Code ; son `security-review.md` est prévu pour être copié en `.claude/commands/` et personnalisé |
| §1, §3, §5 | Catégorie « problèmes de spécification » de la taxonomie empirique des échecs multi-agents — 41,8 % des cas |
| §4, §7 | Catégorie « désalignement inter-agents » — 36,9 % |
| §6, §12 | Catégorie « défaut de vérification des tâches » — 21,3 % |
| §11 chiffres non mesurés | Pathologie observée dans les catalogues publics de sous-agents : télémétrie de progression et projections d'amélioration inventées |
| §12 cas témoin | Contrôle positif en diagnostic ; test par mutation en génie logiciel (DeMillo, Lipton, Sayward, 1980) |

Le résultat qui porte le plus : sur 1 600 traces annotées couvrant sept frameworks
multi-agents, la conclusion est que l'amélioration du modèle de base ne suffira pas à
couvrir la taxonomie, et que les échecs viennent majoritairement de la conception du
système. **Le nombre de rôles n'est pas la variable. Le protocole l'est.**

---

## Points laissés ouverts

1. **Format de `PROJECT_CONTEXT.md`** — à écrire avec le Project Analyst, premier agent
   à produire.
2. **Composition du dépôt témoin** — quels défauts, dans quelle pile.
3. **Score global** — non retenu. Une note par domaine sans instrument défini n'est pas
   reproductible. Réexaminable une fois le dépôt témoin en place, où elle pourra
   s'adosser à du dénombrable.
4. **Red Team** — positionné en passe adversariale sur findings consolidés, pas en
   auditeur de première passe. À spécifier après le Review Board.
5. **Articulation avec `/security-review`** — l'agent adopté écrit-il dans `findings/`
   au schéma §3, ou faut-il un adaptateur de sortie ? À trancher en l'exécutant.
