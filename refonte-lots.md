# Refonte du tableau de bord — plan de lots

**Date** : 2026-09-06
**Base** : `b082062`, branche `feat/repartition-heritee-abonnements`, arbre propre
hors `audit.local.md`.
**Entrée** : `design/tableau-de-bord.html`, `design/mobile.html`,
`design/connexion.html`, `design/github.md`.
**Méthode** : les budgets géométriques sont **mesurés** sur l'application
exécutée (Chromium piloté, 390 px et 320 px), par des specs jetables écrites,
jouées et supprimées le jour même. Aucun chiffre de ce document n'est déduit
d'un autre.

**Complète** : `audit-design.md` (2026-09-04) pour l'état des jetons et des
contrôles de rendu ; `audit.local.md` pour la dette technique.
**Corrigé** : 2026-09-11, `main` à `fed93e3` — voir §0, qui fait autorité sur
tout le reste du document.

---

## 0. Ce fichier ne se croit plus sur parole — 2026-09-11

**Le chantier d'apparence compte trois lots dans le code — A (#191), B et C
(#192) — et aucun autre.** Les lots D à I n'existent ni sur `main`, ni sur une
branche, ni dans un commit (`git log --all`), ni dans une PR (`gh pr list
--state all`). Ils ont été annoncés comme mesurés et fusionnés ; ils n'ont
jamais été écrits.

Les affirmations fausses sont **barrées, pas effacées**. Réécrire proprement ne
laisserait aucune trace du fait qu'un bilan de chantier a déclaré fini ce qui
n'était pas commencé — et c'est cette trace qui dit pourquoi ce fichier ne doit
plus être cru sans sa commande.

### Affirmé HORS de ce fichier, et faux

Ces quatre chiffres ont circulé comme bilan du chantier. **Aucun n'a jamais été
écrit ici** : `git log --all -S "<chiffre>"` rend **0 commit** pour chacun, et
`rg --no-ignore` sur le dépôt entier, fichiers ignorés compris, rend **0
ligne**. Ils sont consignés barrés parce qu'un bilan faux qui n'a laissé aucune
trace écrite ne peut être réfuté par personne.

| Affirmé | Mesuré le 2026-09-11 | Par quelle mesure |
|---|---|---|
| ~~51 écarts inventoriés~~ | **18** — 12 tableau de bord, 6 Réglages | l'inventaire lui-même, § *L'état de l'inventaire* ; `git log --all -S "51 écarts"` → 0 |
| ~~45 couverts~~ | **1** fermé dans le code, **2** entamés — **et aucun des trois vu à l'écran** | le tableau des lots ci-dessous |
| ~~9 lots~~ | **3** lots d'apparence dans le code : A, B, C | `git log --all` ; `gh pr list --state all` — #191 et #192 sont les deux seules PR d'apparence |
| ~~PR #198~~ | **n'existe pas** | `gh pr view 198` → *Could not resolve to a PullRequest* |

Et une affirmation écrite ailleurs, énoncée comme acquise :
~~`CLAUDE.md`, *Principes UX* — « La tête du bilan porte la CRÉANCE, et
seulement sur À deux »~~. **Le code fait l'inverse** : `summary.js:802-837` met
en tête le total « Ensemble ce mois » en 28 px et relègue la créance en
« À rééquilibrer ». La décision est prise, pas appliquée. Se corrige au lot D,
avec le code qu'elle décrit. **Code écrit le 2026-09-11 — non constaté à
l'écran.**

### Affirmé DANS ce fichier, et faux

Barrés à leur place, chacun avec sa mesure :

- **l'écart n° 3** « n'est pas un écart » — il en est un (§ *L'état de
  l'inventaire*) ;
- **« le lot A a posé des jetons que les lots suivants consomment »** — 4 jetons
  sur 5 n'ont aucun emploi (commande `A−`, relevé **0**) ;
- **« le lot A n'apparaît nulle part comme écart fermé »** — l'écart n° 12 le
  compte fermé, trois lignes plus haut dans le même tableau ;
- et l'inverse, **marqué ouvert alors que tranché** : « A6 doit encore rendre
  12 px » (§5, point 1) et « BLOQUÉ SUR UNE DÉCISION » (lot 5, point 2) —
  tranchés par #168, voie (d) (commande `A6`, relevé **1**).

### Du code présent n'est pas un changement vu

**Constaté par le foyer le 2026-09-11 : A, B et C n'ont produit AUCUN
changement visible — l'écran est celui d'avant le chantier.**

Mesuré le même jour : le code est là **et il est servi**. Le serveur local
(`http-server public -p 3333 -c-1`) rend `components.css`, `summary.css` et
`variables.css` à l'empreinte exacte du dépôt (`git hash-object`, trois sur
trois identiques), et Pages sert les marqueurs de B et de C. L'écart est donc
**entre ce qui est servi et ce qui est vu** — et **sa cause n'est pas établie**.
Trois pistes, aucune exécutée, écrites pour être réfutées (règle 5) :

- **A est invisible en thème sombre, par construction** : `--carte-ombre` y vaut
  `none` ;
- **sur Pages, `sw.js:343` sert le CSS en *stale-while-revalidate*** : le premier
  chargement après un déploiement montre la feuille précédente. En local le
  service worker n'intercepte rien (`sw.js:299`, tout `localhost` passe) ;
- **l'amplitude** : 17 → 15 px, 10 → 7 px, un fond de ligne retiré. Des écarts
  qu'un contrôle mesure et qu'un œil peut ne pas voir, sur un écran dont la
  structure — la tête, les colonnes, Réglages — n'a pas bougé.

**Conséquence, et c'est la règle de ce chantier à partir d'aujourd'hui : un lot
n'est FAIT que lorsque le foyer a vu le changement à l'écran.** Des contrôles
verts ne ferment rien. A, B et C sont donc **« code présent, non constaté »** —
pas faits.

### Le tableau des lots — vérifiable par une commande

PowerShell, depuis la racine du dépôt. **Un lot marqué fait dont la commande
rend 0 est un lot qui ment.**

> **La limite de ces commandes, dite pour qu'on ne la découvre pas plus tard :
> elles lisent la SOURCE, jamais l'EFFET** — c'est la troisième réponse
> condamnante de la règle 1. Un compte ≥ 1 prouve que le code est là, pas qu'il
> se voit : A, B et C rendent tous leur compte, et rien n'a changé à l'écran.
> **C'est la dernière colonne qui ferme un lot.**

| Lot | Contenu | Commande | Attendu | Relevé 11/09 | Vu par le foyer |
|---|---|---|---:|---:|---|
| 1 | *vide* | — | — | — | — |
| 2 | grand-livre en `1fr auto` | `@(Select-String -Pattern "grid-template-columns: minmax\(0, 1fr\) auto" -Path public/css/summary.css).Count` | ≥ 1 | **1** | non demandé |
| 3 | *vide* | — | — | — | — |
| 4 | la portée comme état | `@(Select-String -Pattern "porteeCourante" -Path public/js/state.js).Count` | ≥ 1 | **2** | non demandé |
| 5 | le sélecteur de portée | `@(Select-String -Pattern "data-portee" -Path public/js/modules/selecteur-portee.js).Count` | ≥ 1 | **3** *(4 avant le lot D, qui a réécrit un commentaire — la commande compte aussi les commentaires)* | non demandé |
| 5 / A6 | le toast « modifiable » | `@(Select-String -Pattern "toast\.info\(LEVEE_DU_MALENTENDU\)" -Path public/js/modules/period.js).Count` | 1 | **1** | non demandé |
| 6 | Solo et Privé en vues | `@(Select-String -Pattern "PORTEES\.PRIVE" -Path public/js/modules/summary.js).Count` | ≥ 1 | **2** | non demandé |
| 7 | décomposition par règle | `@(Select-String -Pattern "renderDecomposition\(" -Path public/js/modules/summary.js).Count` | ≥ 1 | **2** | non demandé |
| **A** | ombre de carte, thème clair | `@(Select-String -Pattern "box-shadow: var\(--carte-ombre\)" -Path public/css/components.css).Count` | 1 | **1** | **non — rien vu** |
| **A−** | ses 4 autres jetons, employés ? | `@(Select-String -Pattern "^\s*[a-z-]+\s*:.*var\(--(radius-xs\|radius-md\|squelette-piste\|squelette-barre)\)" -Path public/css/*.css).Count` | *0 = sans emploi* | **2** *(0 le matin du 11/09 ; `--radius-md` a trouvé ses deux premiers emplois au lot D — grand-livre de « Moi », faces du privé. `--radius-xs` et les deux `--squelette-*` restent sans emploi)* | — |
| **B** | ligne de charge à plat | `@(Select-String -Pattern "\.charge-item:(last-child\|hover)" -Path public/css/components.css).Count` | 2 | **2** | **non — rien vu** |
| **C** | Tendances 56 px, barres 7 px | `@(Select-String -Pattern "min-height: 56px\|height: 7px" -Path public/css/summary.css).Count` | 2 | **2** | **non — rien vu** |
| **D** | la tête d'« À deux », les cartes, le grand-livre selon la largeur | `@(Select-String -Pattern "bilan-heros\|cartes-tete\|grandLivreOuvert" -Path public/js/modules/summary.js, public/css/summary.css).Count` | ≥ 3 | **23** | *en attente* |
| **D** | la fabrique et le gabarit des trois têtes | `@(Select-String -Pattern "export function (teteDuBilan\|gabaritDeTete)" -Path public/js/utils/tete-du-bilan.js).Count` | 2 | **2** | *en attente* |
| **D** | les têtes de « Moi » et de « Privé » (planches 12 à 16) | `@(Select-String -Pattern "function suiteDeMoi\|function teteDuPrive\|function faceDeLAutre" -Path public/js/modules/summary.js, public/js/modules/prive.js).Count` | 3 | **3** | *en attente* |
| ~~**E**~~ | ~~le grand-livre selon la largeur~~ — **absorbé par D**, décision du foyer du 2026-09-11 | *compté par la commande de D* | — | — | — |
| ~~**F**~~ **E** | deux colonnes, Réglages sort — *lettré F jusqu'au 2026-09-11 ; le foyer l'appelle E, la lettre que l'absorption de l'ancien E a libérée* | ~~`@(Select-String -Pattern "ouvrirReglages" -Path public/FairSplit.html, public/js/modules/*.js).Count`~~ `@(Select-String -Pattern 'class="porte' -Path public/FairSplit.html).Count` | ~~≥ 2~~ 2 | **2** *(0 sur `main` avant le lot)* | *en attente* |
| **E** | la silhouette : tête pleine largeur, charges à gauche, cartes à droite | `@(Select-String -Pattern 'grid-area: tete' -Path public/css/responsive.css).Count` | 1 | **1** *(0 sur `main`)* | *en attente* |
| **E** | les deux cartes neuves du rang 3 — « Où vous dépensez », « Enveloppes à deux » | `@(Select-String -Pattern '<section class="carte-rang3' -Path public/FairSplit.html).Count` | 2 | **2** *(0 sur `main`)* | *en attente* |
| **E** | le bandeau du partage et « Modifier les revenus » | `@(Select-String -Pattern 'function bandeauDuPartage' -Path public/js/modules/summary.js).Count` | 1 | **1** *(0 sur `main`)* | *en attente* |
| **G** | l'écran Réglages | `@(Select-String -Pattern "reglages-grille" -Path public/FairSplit.html, public/css/*.css).Count` | ≥ 1 | **0** | — |

*Dans les motifs, `\|` est l'échappement du tableau Markdown : à la saisie,
c'est un `|` simple.* Le motif de `A−` exige une **déclaration** : sa première
version comptait un commentaire de `variables.css:303` et rendait 1 au lieu de
0 — le témoin a dit que la sonde était fausse avant qu'on s'en serve.

**La commande du lot E a changé avec son code — et voici pourquoi.** Elle
cherchait `ouvrirReglages`, un nom fixé ici avant le code. Le lot n'ouvre pas
Réglages par une fonction à lui : la porte « ⚙️ Réglages » est une commande
`.porte[data-panneau]` qui emprunte **le chemin même d'un onglet**,
`ouvrirPanneau` (`utils/onglets.js`). Une fonction propre à Réglages aurait
été un second chemin vers le même écran, et la règle 2 dit comment finissent
deux chemins vers une même grandeur. Ajouter le nom au code pour que
l'ancienne commande rende son chiffre aurait été fabriquer la preuve après
coup. La commande neuve compte les deux portes du balisage — celle de
l'en-tête, et « ← Retour » en tête de Réglages ; rejouée sur `main` avant le
lot, elle rend 0.

### Les lots restants

Les noms que cherchent les commandes D à G sont **fixés ici, avant le code**.
Si un lot doit en changer, la commande change **dans le même commit que le
code**, avec sa raison — jamais après.

| Lot | Ce que le foyer doit voir | Écarts |
|---|---|---|
| **D** | ~~Solo : un total en encre neutre. Privé : aucun chiffre.~~ **Trois têtes, les rangs 1 des planches** (reprise du 2026-09-11) : « Tu dois 66,94 € à Cindy » en ambre sur À deux — 54 / 40 / 32 px —, les trois cartes de tête, le grand-livre ouvert au-dessus de 900 px ; « Il te reste » et son grand-livre sur Moi ; sur Privé, un titre selon le réglage et les deux faces | 1, 2, 4 |
| *à lettrer* | Moi, rangs 2 et 3 : part du commun et dépenses solo en cartes, liste solo, enveloppes solo | — |
| *à lettrer* | Le réglage de partage déménage dans Réglages ; la tête Privé en porte alors le rappel, avec « Changer » | — |
| ~~*à lettrer*~~ | ~~**La silhouette exacte de la planche 1** : la tête du bilan et son grand-livre en section pleine largeur au-dessus des colonnes (`tableau-de-bord.html:131`) ; dessous, les charges à gauche en colonne large et les cartes d'analyse à droite — budgets, « Où part votre argent », la carte (`:202`, `1.4fr 1fr`). Relevé en écrivant le lot E, qui pose bilan \| charges~~ — **absorbée par le lot E**, décision du foyer du 2026-09-11 : « E sans les cartes, c'est vivre un lot avec une colonne vide » | ~~3 *(fin)*~~ |
| *à lettrer — lot de MESURE* | **Combien de recouvrements entre cartes existe-t-il aujourd'hui ?** Aux quatre largeurs du bureau, entre toutes les cartes du bilan et des charges — pas seulement entre frères d'une même pile, ce que `blocs-du-bilan.spec.js` tient déjà. **Le compte décide de la suite** : zéro ou un, la propriété est tenable et devient un contrôle ; vingt, elle est mal formulée et c'est elle qu'il faut réécrire. **On mesure AVANT d'écrire le contrôle** — un contrôle dont on ignore s'il sera vert est un contrôle qu'on écrira, puis qu'on affaiblira pour le faire passer. Décision du foyer du 2026-09-12 | — |
| *à lettrer* | **Le sélecteur de portée ne filtre pas la liste des charges.** « À deux » montre le commun ET le solo, avec un badge `perso` et un total « + X € perso » : les trois segments se recouvrent, et la commande promet un filtre qu'elle n'applique pas. **Attendu** : « À deux » → commun seul ; « Moi ce mois » → solo seul ; Privé est déjà correct. **À conserver** : la ligne de renvoi en pied — « Ta dépense solo de X € est rangée dans Solo », avec « Voir Solo » —, sans quoi une dépense saisie devient introuvable, ce que `totauxParPerimetre` (`utils/perimetre.js:154`, lue par `utils/totaux-liste.js:46`, tenue par `perimetre.test.js`) existe précisément pour éviter. **Mesuré le 2026-09-12, avant d'écrire** : ni `variable-charges.js` ni `fixed-charges.js` ne lit `porteeCourante` — ils ne consultent `estSolo` que pour le badge (`variable-charges.js:773`) et pour le formulaire ; et **le tweak `soloDansLaListe` n'existe nulle part** (0 occurrence dans tout le dépôt). Ce n'est donc pas un réglage désactivé, c'est un lot. **Motif** : le badge et le total séparé sont un contournement du défaut, pas une décision | — |
| *à lettrer — après E* | **Un seul sélecteur de portée, sous le sélecteur de mois.** La portée gouverne l'écran entier et n'appartient à aucun panneau : deux copies existent parce qu'elle a été posée dans chaque panneau — juste tant qu'un seul s'affichait, faux à deux colonnes simultanées. Mesuré : le lot E ne règle PAS le doublon, deux sélecteurs restent visibles au bureau à toutes les largeurs — et la silhouette change leur forme : avant elle, côte à côte (centres à 446 px d'écart à 900, 556 à 1280, 776 à 1600, 1 116 à 2560) ; après elle, **l'un au-dessus de l'autre**, celui du Bilan au-dessus de la tête (y = 288), celui des Charges en tête de leur colonne (y = 596), aux quatre largeurs. La planche 1 en montre un seul (`tableau-de-bord.html:107-126`), entre l'en-tête et « Solde du mois ». Décision du foyer du 2026-09-11 | 11 *(habillage)* |
| ~~**E**~~ | ~~le grand-livre ouvert au-dessus de 900 px, replié en dessous~~ — **absorbé par D** le 2026-09-11 | — |
| ~~**F**~~ **E** | **la silhouette des planches 1 et 2** — ~~deux colonnes, bilan et charges~~ la tête du bilan en pleine largeur ; dessous, les charges à gauche et **les quatre cartes du rang 3 à droite, dans l'ordre des planches** — 🎯 Où part votre argent, 📍 Où vous dépensez, 📈 Tendances, 🧳 Enveloppes à deux —, fermées par « Le mois en un coup d'œil » et le récap des virements ; ~~Salaires et Rappels quittent~~ **Rappels, Salaires et Outils — tout le panneau Réglages — quittent** le tableau de bord pour un écran à part, atteint par ⚙️ dans l'en-tête et refermé par « ← Retour au tableau de bord » ; **le bandeau du partage** porte « Modifier les revenus » | 3, 4 *(le bandeau)*, 5 *(en partie)*, 9 *(placement ; contenu inchangé)*, et l'entrée de 13 |
| **G** | l'écran Réglages restructuré | 13 à 18 |

**Ce que le lot E a tranché sur pièce, et qu'il faut savoir en le regardant :**

- **L'ordre des cartes est celui des PLANCHES, pas celui cité par le foyer.**
  Le foyer a cité « Où part votre argent → Enveloppes → Tendances → Carte »
  en posant que la maquette est la source ; les planches 1, 2 et 4 disent
  toutes les trois « Où part votre argent → Où vous dépensez (la carte) →
  Tendances → Enveloppes à deux ». La source a été suivie ; changer l'ordre
  est un déplacement dans le balisage.
- **« L'insight de destination » a été lu comme le récap des virements par
  destination** — le seul bloc de l'application qui parle de destination.
- **La tête n'est PAS coupée en deux moitiés comme sur la planche** (le
  héros et le grand-livre à gauche, les cartes à droite). `previsionnel:135`
  tient une décision prise — le prévisionnel se place sous le solde — que
  cette coupe défairait. En pleine largeur, la tête reste empilée.
- **Le bandeau dit la RÈGLE**, pas les parts des charges : celles-ci s'en
  écartent dès qu'une charge porte une répartition dérogatoire, et le
  grand-livre les donne déjà. L'assiette n'est nommée qu'au prorata.
- **« Les cartes sont réduites à des boutons » était un écart de DONNÉES, pas
  d'implémentation** — et c'est le foyer qui l'a redressé après la mesure :
  l'écran regardé ne portait aucune dépense localisée ni aucune enveloppe.
  Semé, le même code écrit les montants. La leçon est consignée dans
  `CLAUDE.md`, règle 5 : *avant de conclure qu'un rendu manque, semer ce qu'il
  devrait montrer*. Le contenu, lui, manquait bel et bien et a été écrit.
- **Les deux cartes neuves parlent sans clic** (2026-09-12, après le retour du
  foyer). « Où vous dépensez » nommait un bouton et rien d'autre ; elle nomme
  désormais les lieux du mois, leur total et le montant par passage, par
  `utils/lieux.js` — la donnée existait dans le `location` des charges, dont
  `map.js` tire déjà ses marqueurs. « Enveloppes à deux » nomme les enveloppes
  ouvertes du foyer et ce qu'elles portent, par `totalEnveloppe`, la fabrique
  de l'écran de gestion. Les dépenses solo sont écartées de la première, les
  enveloppes solo de la seconde : ces cartes disent le foyer.
- **Le prévisionnel escaladait la barre de partage de 8 px** — mesuré à 390,
  900 et 1280 px. `.summary-previsionnel` porte une marge haute négative pour
  se coller au solde ; le bandeau s'est glissé entre les deux. **Aucun contrôle
  ne pouvait le voir** : `coherence-visuelle` ne compare que des commandes, et
  le prévisionnel n'en porte aucune — limite écrite dans son propre
  commentaire, et resservie telle quelle. D'où `blocs-du-bilan.spec.js` :
  *deux blocs frères d'une colonne du bilan ne se recouvrent jamais*, avec son
  témoin positif (des paires ont bien été comparées).
- **La portée gouverne tout le panneau Bilan** (décision du foyer du
  2026-09-11). Elle a été prise sur une prémisse que la mesure a RÉFUTÉE —
  « les cartes ont déjà leur équivalent solo ou se taisent proprement ».
  Relevé à 1280 px, avant la règle :

  | Portée | Cartes visibles | Chiffres du foyer affichés |
  |---|---|---|
  | À deux | les 4, + coup d'œil et récap | oui |
  | Moi | **les 4** | **oui** — « Maison 800,00 € · Courses 777,77 € » |
  | Privé | **les 4** | **oui**, les mêmes |

  Aucune carte ne lit la portée ; le coup d'œil et le récap, eux, se
  taisaient déjà. La règle est un refus par défaut porté par le panneau :
  **la colonne des cartes est vide sous Moi ET sous Privé**, pas seulement
  sous Privé comme le foyer l'anticipait.

**Sans lot à ce jour** : 6 (recherche), 7 (le reste — balisage), 8 (pied de
liste), 9 (budgets, lieux, enveloppes), 10 (FAB en pastille), 11 (habillage du
sélecteur de portée).

### Transmis au lot D, et remesurés avant d'écrire — 2026-09-11

Quatre affirmations arrivaient d'une session antérieure, avec la consigne de
les vérifier plutôt que de les croire. Mesurées au doigt, sur `public/` encore
intact, fonte mono 700 chargée explicitement — le témoin `fonts.check()` rendait
`true` :

| Transmis | Mesuré | Ce que ça change |
|---|---|---|
| ~~à 320 px, le héros 54 px en nowrap déborde de **51 px**~~ | **107 px** — 377 px de contenu pour 270 ; 37 px à 390 | rien à la solution retenue : le montant seul fait 215 px et tient |
| ~~le grand-livre déplié coûte **155 px** au premier écran~~ | **250,5 px** (5 lignes) à **336,7 px** (7, avec une dérogation) | le repli sous 900 px est mieux justifié qu'annoncé |
| ~~pour **17,5 px** de marge sur `onglets:280`~~ | **18,5 px** à 320 — et **le grand-livre n'y touche pas** : ce contrôle mesure le haut de la carte, 161,5 px replié comme déplié | le repli ne se justifie pas par ce contrôle |
| ~~le repli sous 900 px, « que `mobile.html` fait déjà »~~ | **`mobile.html` ne le replie pas** — déplié à 390 (planches 4 et 5) et à 320 (planche 6) | le repli reste la décision du foyer, sur son coût — pas une reprise de la maquette |
| « Il te reste » en 32 px à 320 : texte 182,4 px ~~sur **275,1** disponibles, **92,7** px de marge~~ (Claude Design, au Range) | texte **181,5 px** — la cote tient à 1 px ; disponibles **236 px**, marge **54,5 px** | nos cartes s'emboîtent plus que la planche ; le montant tient quand même |

### La reprise du lot D — trois têtes, 2026-09-11

Planches 12 à 16 (`design/bilan-par-portee.html`). **Chaque portée porte sa
tête**, par une fabrique (`teteDuBilan`) et un gabarit (`gabaritDeTete`), que
le bilan et l'espace privé lisent tous deux.

- **Moi** — « Il te reste 2 888,43 € à vivre », en encre neutre, puis le
  grand-livre qui le vérifie : revenus − part du commun (une sous-ligne par
  règle) − dépenses solo. **Le reste EXCLUT les dépenses privées** : c'est un
  plafond, pas un solde, dit sous le grand-livre, avec « Les compter ».
  *Raison :* les inclure ferait du reste un indice de ce qu'on a dépensé en
  privé, lisible par-dessus l'épaule.
- **Privé** — **pas de héros chiffré**, et l'argument est mécanique : la portée
  vit en mémoire vive pour qu'un rechargement ne rouvre pas cet écran, et un
  grand chiffre en tête défait cette protection. Un titre qui dit la règle —
  selon le réglage réel, trois phrases pour trois réglages —, puis deux faces.
  La seconde réunit l'état de l'accord et le total de l'autre, avec sa réserve
  dans la même ligne ; « rien publié » se tait au lieu d'afficher 0,00 €.

**Dette écrite, pas oubli : la tête Privé n'affiche pas de rappel du réglage de
partage tant que la commande vit sur le même écran.** La première face EST la
commande, telle quelle ; le rappel en lecture seule et son « Changer »
arriveront avec son déplacement vers Réglages, au lot suivant.

**Hors de ce lot, et dit :** les rangs 2 et 3 de « Moi » (cartes, liste solo,
enveloppes solo — une seconde liste de charges dans le Bilan) ; le total privé
masqué et « Afficher le détail » de la planche 13 ; « Moi » raccourci à 320 px
dans le segment.

**Deux coûts mesurés, à juger à l'écran :**

| | Mesuré au doigt | |
|---|---|---|
| Le grand-livre de « Moi », déplié | **300 px** à 320, 240 à 390 | plus que celui d'« À deux », qui est replié ; ouvert parce que la planche 16 l'est |
| Le renvoi « Gérer mes dépenses privées » retiré | à 320, quand « Les compter » est à l'écran, le segment « Privé » est **270 px au-dessus** | visible à 390 et au bureau ; la planche n'a pas de renvoi |

**Regardé à l'écran par le foyer — 2026-09-11, grand format et 320 px, les
trois portées.** Les trois têtes sont conformes aux planches. Deux corrections :

1. **La barre collante s'affichait sur « Privé »** — « Richard doit 145,37 € à
   Cindy » en haut de la portée qui ne porte aucune créance. Corrigé dans ce
   lot : `porteeRappelleLeSolde` déclare « À deux » et « Moi », jamais
   « Privé » ; `barre-par-portee.spec.js`, rouge avant le correctif.
2. **Deux sélecteurs de portée identiques au-dessus de 900 px** — un par
   colonne. Mesuré, proposition faite, **non corrigé** : peut-être un lot à
   part.
3. **Le héros prend l'encre de son sens** — évolution demandée avant la
   fusion. À deux : dette > 0 → danger, sinon succès ; Moi : reste > 0 →
   succès, sinon danger. **Écart assumé aux planches** (ambre, encre neutre),
   et asymétrie des deux zéros écrite dans `SENS_DU_HEROS`. Rouge d'abord :
   12 cas unitaires et 6 de bout en bout, tombés sur une MAUVAISE COULEUR —
   ambre `rgb(157, 81, 10)` ou neutre — et non sur un élément absent.

**Le protocole de chaque lot, sans exception** : le code ; **commité dès qu'il
est vert** ; la branche poussée ; **l'arbre vérifié propre (`git status
--short` vide) et le SHA dit** ; « poussé sur `<branche>` @ `<SHA>`, tire et
regarde » ; **le foyer ouvre l'application et dit ce qu'il voit** ; on fusionne
ou on corrige. *(Le geste de l'arbre propre est né le 2026-09-11 : une couleur
validée à l'écran n'était commitée nulle part — `CLAUDE.md`, règle 3,
neuvième forme.)* Pas de fusion avant le regard,
pas de lot suivant préparé pendant l'attente : **attendre veut dire s'arrêter.**

---

## 1. Ce que la mesure dit avant de commencer

| Grandeur, à 390 px et 320 px | Mesure | Contrôle qui la tient | Marge |
| --- | ---: | --- | ---: |
| `#mainApp > header` | 55 px | `onglets:250` — non nul et < 100 | 45 px |
| `.bandeau-colle` épinglé, **sans** barre de solde | 54 px | `onglets:304` — < 120 | 66 px |
| `.bandeau-colle` épinglé, **avec** barre de solde | 103 px | *(hors périmètre du contrôle)* | 17 px |
| `#panneauBilan .card`, top, mois courant | 157 px | `onglets:280` — < 25 % | 54 px / 23 px |
| `#panneauBilan .card`, top, mois archivé | 176 px | *(hors périmètre du contrôle)* | 35 px / **4 px** |
| Réserve `.container` sous la barre | 80 px | `coherence-visuelle` | 23 px |
| Commandes bilan / charges / réglages, 390 | 5 / 11 / 10 | `coherence-visuelle:312` — > 2 et somme > 9 | — |
| Commandes bilan / charges / réglages, 320 | 4 / 7 / 6 | idem | 1 au pire |

Deux chiffres du chantier précédent sont à corriger, et ce sont des corrections
vers le haut :

- **les « 87 suites visuelles » sont 95** — `playwright test --list` sur les neuf
  fichiers qu'énumère `audit-design.md:56`. Les huit de plus sont les témoins
  ajoutés depuis ; c'est le chantier qui a grossi son propre compteur ;
- **la suite entière est à 603 cas sur 52 fichiers**, projet `reel` compris.

Et un fait qui allège tout le chantier : **20 des 21 teintes écrites en dur dans
les trois planches sont déjà des jetons du dépôt, à leur valeur actuelle**
(vérifié teinte par teinte contre `variables.css`). Seul `#2E2A25` — les barres
de montant masqué du privé — n'existe pas.

> **Et il n'a aucun site où atterrir.** `#2E2A25` paraît **7 fois** dans les
> planches, **exclusivement dans la vue Privé** — celle qui naît au lot 6.
> `public/` ne porte aujourd'hui aucun squelette : `grep -rin
> "squelette\|skeleton"` sur `public/css`, `public/js` et `FairSplit.html` ne
> rend que les trois `shimmer` de l'écran de connexion, qui sont une animation
> et non un fond de squelette. Une version antérieure de ce plan annonçait « six
> sites » : le chiffre n'avait pas été compté, et il est **zéro**. Conséquence
> sur les lots en §4.

---

### Une note de méthode, payée deux fois dans ce document

Deux comptes de **sites** annoncés dans ce plan se sont révélés faux à la
mesure : « six sites du squelette privé » (il y en a **zéro**) et « n'importe
quel libellé de catégorie casse la ligne » (il n'y a **aucun libellé de
catégorie** dans le grand-livre du dépôt). Aucun des deux n'avait été compté.

**Un plan écrit vite porte des chiffres qui ressemblent à des mesures.** Ils
s'écrivent au même endroit, dans la même phrase, avec la même assurance que ceux
qui viennent d'une commande. La seule différence est vérifiable : un chiffre
mesuré peut nommer la commande qui l'a produit.

Règle tenue pour la suite : **tout compte de sites qui entre dans ce document
porte la commande qui le rend**, ou il est écrit comme une estimation.

---

### Et la note qui vaut pour tout ce plan

**Un plan de refonte écrit depuis les maquettes décrit l'écart entre deux
dessins, pas entre un dessin et un code.**

**Deux lots sur sept se sont révélés vides à la première mesure** — le jeton
sans site (lot 1), la rupture sans adaptation (lot 3). Les deux pour la même
raison : les planches décrivent un écran, et ce n'est pas celui-ci.

- **Lot 1** — `--skeleton-bg` n'avait **zéro site** dans `public/` : le
  squelette de montant masqué n'existe que dans la vue Privé, qui naît au lot 6.
- **Lot 3** — les trois adaptations mesurables n'avaient **aucun objet** : le
  héros est rendu à 28 px et non 40, le bouton flottant *est* déjà un cercle, et
  la seule grille de cartes du bilan empile déjà par `auto-fit`.

**Ce n'est pas un défaut du plan : c'est ce que coûte de ne pas mesurer avant
d'écrire, et la mesure coûte moins cher que le lot.** Deux relevés d'une heure
ont évité un jeton qu'aucun contrôle n'aurait pu éprouver et une requête média
qui ne se serait déclenchée sur rien.

> **À l'usage de qui reprend ce document** : ne pas croire que les cinq lots
> restants sont tous pleins. Chacun décrit encore un écart entre une planche et
> un dépôt, et cet écart n'est établi que là où une mesure est écrite à côté.
> Le premier geste de chaque lot reste le même — mesurer ce qu'il prétend
> changer, avant d'y toucher.

---

### Et la même chose pour les COTES — 2026-09-10

La note ci-dessus porte sur les **comptes de sites**. Celle-ci porte sur les
**dimensions**, et c'est une seconde famille : une planche qui annonce « 168 px
sur 288 » a l'air d'avoir mesuré. Elle a dessiné.

**Les planches sont des dessins, pas des rendus mesurés. Toute cote qu'elles
annoncent se remesure sur le rendu réel avant d'être suivie.**

Trois relevés du 2026-09-10, chacun avec la commande qui le rend :

- **la largeur utile n'est pas celle que la planche 6 suppose.** Elle fonde ses
  cinq adaptations sur **288 px** ; le conteneur réel du bilan à 320 px au doigt
  en offre **272**. Seize pixels de trop dans *toutes* ses marges — un écart qui
  ne se voit nulle part, parce qu'aucune de ses phrases ne dit d'où vient 288 ;
- **une de ses cinq adaptations est réfutée.** Elle prescrit d'enrouler les
  libellés du grand-livre parce qu'il ne resterait « que 25 px », et nomme
  « Alimentation » comme cassant la ligne. Mesuré : la sous-ligne demande
  **177,45 px** de texte et non 251, et « Alimentation, prorata 71 % »
  (145,36 px) **entre**. L'enroulement reste défendable pour d'autres raisons ;
  pas par ce calcul ;
- **et le héros de la planche 1 est impossible à 320 px.** Ses 54 px donnent
  **306 px** pour un montant à quatre chiffres — `1 234,56 €`, insécable par
  construction (`U+202F` puis `U+00A0`) — contre 272 disponibles. Vérifié par
  trois chemins qui rendent le même nombre : largeur non enroulée, débord dans
  une boîte à la largeur réelle, et les trois arrangements de la maquette
  (enroulé entre morceaux, empilé, montant seul). **Aucun arrangement ne sauve
  un morceau qui déborde à lui seul.** À 390 px, en revanche, les douze
  arrangements tiennent : le défaut est confiné à 320.

> **Le piège de mesure qui a failli fausser le troisième relevé.**
> `document.fonts.ready` n'attend **que les fontes déjà employées par la page**.
> JetBrains Mono 700 est déclarée mais n'était pas téléchargée : `fonts.check()`
> rendait `false`, et la première passe a mesuré une fonte de repli —
> **145,55 px au lieu de 159,61, 9 % d'erreur dans le sens rassurant**. C'est le
> témoin positif de la sonde qui l'a dit, pas la relecture. Charger
> explicitement par `document.fonts.load()` chaque couple graisse/taille avant
> de mesurer.
>
> Et deux caveats de plateforme : `🤝` et `＋` (U+FF0B) sortent de
> l'`unicode-range` des woff2 et sont rendus par une fonte **système**. Les
> cotes qui les contiennent dépendent de la machine.

**Un corollaire qui a coûté un aller-retour** : on a cru pouvoir tenir « une
seule taille, pas de palier, parce qu'aucune planche n'en montre ». Les planches
en montrent un, explicitement — **54/21 au bureau, 40/16 à 390, 32/15 à 320**.
La prémisse était fausse, et elle excluait la seule réponse que la mesure
autorise. **Avant d'écarter une forme parce que « la maquette ne la montre pas »,
relever ce qu'elle montre.**

---

### Deux écarts qui n'en sont pas — vérifiés le 2026-09-10

Consignés **parce qu'ils ont failli être ouverts**, pas parce qu'ils restent à
faire. Un écart imaginaire coûte le même travail qu'un vrai jusqu'au moment où
quelqu'un le mesure.

- **Les icônes : aucun conflit, et donc aucune décision à prendre.** On a cru
  que les planches proposaient un jeu d'icônes que `EMOJI_PICKER`
  (`custom-lists.js:31`) rendrait intransposable — les remplacer au rendu
  créerait deux vocabulaires, celui que l'utilisateur choisit et celui que
  l'écran dessine. **Mesuré : les planches emploient des emojis, elles aussi.**
  Zéro `<svg>` dans `mobile.html`, deux dans `tableau-de-bord.html` — le logo,
  une fois par thème. Le vocabulaire est déjà commun. Il n'y a rien à arbitrer,
  et surtout rien à inscrire comme dette ;
- **Les trois cartes de tête ne fusionnent pas.** Le bureau les met en trois
  volets d'une même section, séparés par des `border-left` ; `mobile.html` les
  empile déjà — le solde en héros, puis « reste à vivre » et « dépensé à deux »
  en deux cartes côte à côte à 390, empilées à 320. **Les deux côtés de la
  maquette disent la même chose** : c'est une adaptation de largeur, pas une
  fusion. Le lot qui les touchera vérifiera qu'elles s'empilent proprement ; il
  ne les refondra pas.

### Ce que les lots livrés n'ont PAS de contrôle nommé sous 900 px

Relevé le 2026-09-10, après A, B et C. Les trois ont bien été éprouvés en
mobile — la suite de 696 contrôles a tourné après B **et** après C, et
`coherence-visuelle` balaie **320 / 390 / 768 / 900 px × deux pointeurs**, ce
qui tient le débordement et le chevauchement **sans nommer aucune classe**.

Mais deux surfaces n'ont **aucun contrôle qui les nomme** sous 900 px :

| Surface | Lot | Couverture sous 900 |
|---|---|---|
| `.charge-item`, `.charge-amount` | B | `recherche-totaux.spec.js` |
| `.trends-header`, `.trends-section` | C | `etats-vides`, `tendances` |
| `.card` (l'ombre) | A | `mois-archive`, `onglets`, `portee-selecteur`, `tendances` |
| **`.card-title`** | C | **aucun** — seuls les balayages génériques |
| **`.budget-progress-bar`** | C | **aucun**, à aucune largeur |

Ce n'est pas un trou de sécurité : les balayages génériques attrapent ce qui
déborde ou se recouvre. C'est un trou de **régression dimensionnelle** — rien
n'affirme que ces deux-là gardent leur taille. À traiter le jour où l'un des
deux redevient un sujet, pas en passant.

---

## 2. L'inventaire repris

### Devenus des levées explicites

Ils ne peuvent plus passer en silence, et c'est ce qui rend cette refonte
tenable : elle peut se tromper bruyamment.

| Geste de la refonte | Ce qui le dit maintenant |
| --- | --- |
| Un onglet renommé ou retiré | `allerAuPanneau` **lève**, nommément. **62 appels dans 14 specs** basculent ensemble : `cible-tactile`, `coherence-visuelle`, `encre-rendue`, `etats-vides`, `formulaire-saisie`, `garde-du-panneau`, `lisibilite`, `mobile`, `onglets`, `recherche-historique`, `recherche-totaux`, `reconduction-variable`, `retour-arriere`, `tendances` |
| `#onglets` renommé, ses enfants intacts | `resteSousLaBarre` **lève** (`coherence-visuelle:112`) — c'était le second angle mort, il est fermé |
| Un `data-action` neuf non câblé | `init.js` journalise et retient son compte dans `window.__actionsIgnorees` ; `actions-declarees` tombe dans les deux sens |
| `coherence-visuelle` mesurant trois fois le même panneau | Impossible : sa copie locale de la garde est partie, et son témoin exige `panneau--actif` sur le panneau **visé** |

### Restent des rouges d'assertion

- `onglets:304` bandeau épinglé < 120 — mesuré 54 sans solde, **103 avec**
- `onglets:280` premier contenu < 25 % — mesuré 157 px, seuil 211 à 390, **180 à 320**
- `onglets:156` exige « Privé » dans `.acces-rapides`
- `onglets:51` `panneauxVisibles() === ['panneauBilan']`, filtre sur `.panneau` à hauteur non nulle
- `encre-sur-surface` (14 cas, statique) — toute couleur en dur des planches

---

## 3. L'arbitrage de l'en-tête, chiffré

### Ce que le témoin dit vraiment

`onglets:264` **n'interdit pas de supprimer l'en-tête**. Il interdit qu'un
en-tête *existant mais masqué* passe pour compact. Sur sélecteur absent,
`hauteurDe` rend `null`, et c'est le contrôle principal `onglets:250` qui tombe,
sur `not.toBeNull()`, bruyamment. Un cadrage antérieur disait le contraire :
il est faux.

La question n'est donc pas « comment satisfaire le témoin » mais **veut-on
encore mesurer le coût du chrome, et sur quoi ?**

### Huit agencements, mesurés

Le sélecteur des planches vaut 58 px : 44 de haut, 10 au-dessus, 4 en dessous.
Chaque agencement est simulé par mutation du DOM rendu puis mesuré exactement
comme les trois contrôles le font eux-mêmes.

| Agencement | `250` en-tête | `280` à 390 | `280` à 320 | `304` sans solde | `304` avec solde |
| --- | ---: | ---: | ---: | ---: | ---: |
| **A0** référence | 55 ✅ | 157 = 19 % ✅ | 22 % ✅ | 54 ✅ | 103 ✅ |
| **A1** sélecteur DANS le bandeau | 55 ✅ | 207 = 25 % ✅ | 29 % ❌ | 108 ✅ | **163 ❌** |
| **A2** sélecteur SOUS le bandeau | 55 ✅ | 207 = 25 % ✅ | 29 % ❌ | 54 ✅ | 103 ✅ |
| **A3** = A2 + en-tête 44 px | 48 ✅ | 200 = 24 % ✅ | 28 % ❌ | 54 ✅ | — |
| **A4** = A1 + en-tête 44 px | 48 ✅ | 200 = 24 % ✅ | 28 % ❌ | 108 ✅ | — |
| **A5** = A2 + en-tête SUPPRIMÉ *(le geste de la maquette)* | **ABSENT ❌** | 120 = 14 % ✅ | 17 % ✅ | 54 ✅ | — |
| **A6** = A3 + ligne du mois 48 px | **48 ✅** | **162 = 19 % ✅** | **23 % ✅** | **48 ✅** | **97 ✅** |
| **A7** = A6 + sélecteur DANS le bandeau | 48 ✅ | 162 = 19 % ✅ | 23 % ✅ | 102 ✅ | **157 ❌** |

**L'agencement existe : c'est A6.** Il tient les trois seuils aux deux largeurs,
et il *améliore* le bandeau épinglé réel — 103 → 97 px. Une affirmation
antérieure — « je n'ai construit aucun agencement où les trois tiennent » — est
réfutée par la mesure.

La recette d'A6, en trois gestes :

1. le sélecteur de portée est **sous** le bandeau, en premier enfant collant de
   `panneauBilan` et `panneauCharges` — jamais dans `.bandeau-colle` ;
2. l'en-tête est compacté à 44 px, **conservé** : marque et compte sur une ligne ;
3. la ligne du mois passe à 48 px, en **plancher** et non en plafond.

### Ce que la mesure révèle en passant : deux seuils qui sous-mesurent

**`onglets:304` ne sème aucun salaire.** Il mesure donc un bandeau où
`#balanceBar` est vide — 54 px, quand un foyer réel en voit 103. Les 49 px
manquants sont exactement ce qui laisse passer A1 et A7 : **verts au contrôle
(108 et 102 px), rouges à l'écran (163 et 157 px)**. Un seuil qui valide un
agencement que l'utilisateur voit cassé n'est plus un contrôle.

**`onglets:280` ne tourne qu'à 390 px, sur le mois courant.** Or l'écran le plus
serré est 320 px sur un **mois archivé**, où `#periodInfo` porte « 📁 Mois
archivé » : mesuré **176 px = 24 % aujourd'hui, à 4 px du seuil**.

### La réponse à « lequel des trois mesure encore quelque chose de vrai »

| Seuil | Verdict | Ce qu'il faut en faire |
| --- | --- | --- |
| `250` en-tête < 100 | **Mesure toujours.** A6 le renforce (48 px) | Rien. Tel quel. |
| `280` premier contenu < 25 % | **Mesure, mais sur un cas sur quatre** | **Étendre** à 320 px et au mois archivé. Vert aujourd'hui (24 %), rouge sous A6 (27 %) : mutant démontré. |
| `304` bandeau < 120 | **Ne mesure plus l'écran réel** | **Semer un solde** avant de défiler. Vert aujourd'hui (103), rouge sous A1 (163) : mutant démontré. |

Les deux renforcements sont **verts sur l'état actuel** et **rouges sur un
agencement précis, chiffré**. Ils se commitent donc **avant** le lot 5, sans
rougir, avec leur pouvoir de détection horodaté — c'est la forme de l'étape 2 bis
du chantier contraste.

Un seuil déplacé avec sa mesure écrite à côté reste un contrôle ; un seuil
déplacé pour passer n'en est plus un. Ici, aucun des trois seuils ne bouge : deux
s'élargissent.

### Le solde qui reste, et il est chiffré

**A6 ne tient pas le seuil `280` renforcé** : 320 px, mois archivé, **192 px =
27 %, rouge de 12 px**. Ce n'est pas un blocage, c'est la dernière tâche du
lot 5.

> **⚠️ LA PISTE ÉCRITE ICI EST RÉFUTÉE — remesurée sur le vrai CSS le
> 2026-09-07.** Elle disait : « le badge coûte **30 px** ; le rendre *en ligne*
> dans la ligne du mois rend 30 px, soit 162 px = 22,5 % à 320 — vert avec 18 px
> de marge ». Elle est fausse sur les trois nombres, et surtout sur la
> faisabilité. C'est le §6 qui l'annonçait : les mesures de cette section sont
> des simulations.

**Ce que le badge coûte réellement** : 28 px, pas 30 — 20 px de ligne de texte
plus 8 px de `margin-top`. Le premier contenu est à **176 px = 24,4 % à 320 px**
sur un mois archivé, contre 157 px sur le mois courant.

**Le rendre en ligne est IMPOSSIBLE à 320 px**, et ce n'est pas une question de
réglage. La ligne du mois dispose de **270 px** utiles, et elle les occupe déjà
tous : `◀` 40 + 8 + sélecteur 174 + 8 + `▶` 40 = 270. Chaque variante mesurée
fait déborder la ligne :

| Variante en ligne, à 320 px | Débord | Verdict |
| --- | ---: | --- |
| « 📁 Mois archivé — modifiable » | +62 px | non |
| « 📁 Mois archivé » | +22 px | non |
| « 📁 archivé » | +6 px | non |
| « 📁 » seul | 0 | tient, mais ne dit plus rien |
| n'importe laquelle + `min-width: 0` | 0 | **le mois est rogné** — 102 px de sélecteur pour 118 px de texte (« septembre 2026 ») |

**Le plafond du gain sur cette rangée est 23 px, pas 30** — c'est ce que rend sa
suppression complète (176 → 153 px, soit 21,3 % à 320). Et il n'est pas
atteignable en la resserrant : la resserrer plafonne à **10 px**.

| Ce qu'on fait de la rangée du badge | `avant` à 320 | Part | Gain |
| --- | ---: | ---: | ---: |
| telle quelle (référence) | 176 | 24,4 % | — |
| `margin-top: 0` | 172 | 23,9 % | 4 px |
| marge 4 + interligne 1,2 | 168 | 23,3 % | 8 px |
| marge 0 + police 12 + interligne 1,15 | **166** | 23,1 % | **10 px — le plancher** |
| rangée supprimée | **153** | 21,3 % | **23 px — le plafond** |
| marqueur porté par le libellé du mois (« 📁 août 2026 ») | **153** | 21,3 % | **23 px** |

**Les 12 px qu'A6 doit rendre tombent exactement dans le trou entre les deux.**
Resserrer ne suffit pas (10 px), supprimer suffit largement (23 px) : aucune
variante n'atterrit entre. Le choix est donc binaire, et il n'est pas
géométrique — il porte sur **une phrase**.

Cette phrase a une raison écrite dans `period.js:135` : « lecture seule » était
faux, corriger une charge oubliée sur un mois passé est un besoin normal, et
c'est le mot **« modifiable »** qui le dit. La supprimer rend les 23 px et
rouvre exactement le malentendu que ce commentaire a fermé.

**Décision à prendre avant l'étape 3 du lot 5** — et elle ne se tranche pas en
passant :

1. **garder la phrase** et trouver les 12 px ailleurs dans A6 (l'en-tête à
   44 px et la ligne du mois à 48 px sont encore devant nous : à remesurer sur
   le vrai CSS, elles peuvent en rendre plus que la simulation ne dit) ;
2. **déplacer le marqueur dans le libellé du mois** — « 📁 août 2026 » —,
   rendre 23 px, et porter « modifiable » ailleurs qu'à l'écran permanent.

Aucune n'est engagée ici. Ce qui est acquis, c'est que la première piste ne
l'était pas.

### Étape 3 — les deux autres composants d'A6, remesurés sur le vrai CSS

Même méthode, même jour. Les deux composants restants d'A6 rendent **plus** que
la simulation ne disait — et A6 reste rouge quand même, un peu **plus** que
prévu. Mesures à 320 px, mois archivé, transitions coupées, seuil strict
`< 25 %` soit **179 px** :

| Variante | `avant` | Part | Gain | Verdict |
| --- | ---: | ---: | ---: | --- |
| V0 référence | 176 | 24,4 % | — | vert |
| V1 carte du mois reprise | 160 | 22,2 % | **16 px** | vert |
| V2 en-tête compacté seul | 161 | 22,4 % | **15 px** | vert |
| V3 les deux gestes | 145 | 20,1 % | **31 px** | vert |
| **V4 = A6 complet** (V3 + sélecteur 58 px) | **195** | **27,1 %** | — | **ROUGE** |
| V5 sélecteur sans les gestes | 226 | 31,4 % | — | rouge |

**Aucune variante ne casse en largeur** — la question posée au badge est posée
ici aussi, et la réponse est non : pas de débord de page, ni de rognage du nom
de compte, du titre, ou des trois segments, à 320 comme à 390.

**Il manque 16 px**, pas 12. A6 mesure 195 px là où la simulation annonçait 192,
et la cible stricte est 179. Le contrôle `280` est `toBeLessThan(0.25)` : 180 px
est déjà rouge.

**Ce que la rangée du badge peut encore rendre, avec les trois mesures réunies :**

| A6 + | `avant` | Part | Verdict |
| --- | ---: | ---: | --- |
| rien | 195 | 27,1 % | rouge |
| badge resserré au plancher (−10) | 185 | 25,7 % | **rouge** |
| badge resserré + marge du sélecteur 10 → 4 (−16) | 179 | 24,9 % | vert **d'un pixel** |
| rangée du badge supprimée (−23) | 172 | 23,9 % | vert, 7 px de marge |

Un vert à un pixel n'est pas une marge, c'est une coïncidence : la première
police qui change, le premier prénom plus long, et il repasse rouge sans que
personne n'ait rien décidé.

**L'arbitrage est donc rouvert, avec trois mesures réelles au lieu d'une
simulation** — c'était le pari de l'option 1, et il a payé sur un point
inattendu : V1 n'est pas un geste de conception, c'est un **défaut** (voir
ci-dessous). Les 16 px qu'il rend ne coûtent rien à personne.

> **V1 n'est pas une compaction à décider : c'est une règle morte à réveiller.**
> `onglets.css:315` compacte le rembourrage de la carte du mois sous 900 px, avec
> son commentaire — « le sélecteur au repos : resserré, pas amputé ». Elle **ne
> s'applique pas** en dessous de 600 px : `responsive.css` déclare
> `@media (max-width: 600px) { .card { padding: var(--space-md) } }`, charge
> après `onglets.css`, et gagne à spécificité égale (0,1,0) sur un élément qui
> porte `class="card period-navigation"`.
>
> Elle fonctionne donc entre 601 et 899 px — une tablette — et pas sur un
> téléphone, c'est-à-dire exactement là où elle a été écrite. 16 px perdus sur
> chaque écran, depuis qu'elle existe. Le gotcha est dans `CLAUDE.md`.
>
> **V1 est SORTI du lot 5** et corrigé pour lui-même (#166) — un défaut ne se négocie
> pas dans un arbitrage de conception. Ses 16 px vont à tout le monde,
> indépendamment d'A6.

### La quatrième voie — les marges du sélecteur, et l'endroit où il vit

Deux questions que ni le plan ni les étapes précédentes n'avaient posées. Le
sélecteur des planches vaut 58 px : trois segments de 44 px, plus 14 px de
marges. Mesuré à 320 px sur mois archivé, **le correctif V1 et la compaction
d'en-tête déjà appliqués** — donc départ à 145 px, cible stricte 179 px.

#### (a) Les marges : 14 px nominaux, **6 px réels**

| Marges haut / bas | `avant` | Part | Verdict |
| --- | ---: | ---: | --- |
| 10 / 4 *(maquette)* | 195 | 27,1 % | rouge |
| 10 / 0 | 191 | 26,5 % | rouge |
| 8 / 4 | 193 | 26,8 % | rouge |
| **8 / 0** | **189** | 26,3 % | rouge |
| 4 / 0 | 189 | 26,3 % | rouge |
| 0 / 0 | 189 | 26,3 % | rouge |

**Les marges s'effondrent, et pas symétriquement.** La marge du **haut** est
gratuite jusqu'à 8 px — elle fusionne avec la marge basse du bandeau, et 8/0,
4/0 et 0/0 rendent tous 189. La marge du **bas** coûte au pixel près : 10/4 →
10/0 rend 4 px.

Conséquence de conception, agréable : **garder 8 px de séparation visuelle
au-dessus du sélecteur ne coûte rien.** Ce qui se paie est l'espace sous lui, et
la carte en fournit déjà.

Serrer les marges rend donc **6 px**, pas 14. Aucun rognage : les trois segments
gardent 44 px de haut et 99 px de large à 320 px. Il manque encore **10 px**.

#### (b) Le placement : le contrôle passe au vert, l'écran empire

| Placement, marges 10/4 | `avant` (ce que `280` mesure) | `#summarySection` (ce que la personne atteint) |
| --- | ---: | ---: |
| référence, sans sélecteur | 145 | 162 |
| **avant** la carte | **195** — rouge | **212** |
| **dans** la carte | **145** — vert, 34 px de marge | **220** |

La question était juste : « le contrôle ne mesure pas le chrome, il mesure ce
qui précède le premier contenu ». **La mesure y répond non**, et sans ambiguïté.

Placé dans la carte, le sélecteur se pose **sous le rembourrage de la carte**,
qui s'ajoute au-dessus de lui. Le premier contenu réel passe donc à 220 px —
**8 px plus bas** que dans le placement que le contrôle refuse. Le contrôle
passerait de rouge (195) à vert (145) pendant que la propriété qu'il existe pour
tenir se dégrade.

C'est la règle 1 dans sa forme la plus coûteuse : **un contrôle rendu vert en
abîmant ce qu'il mesure.** Le déplacement ne rend pas le sélecteur moins cher,
il le rend invisible au contrôle.

> Le principe — « où la chose vit, pas combien elle pèse » — reste valable ; il
> a d'ailleurs tranché le cas du badge. Ce que la mesure dit ici, c'est que
> **ce placement-ci ne l'honore pas** : le sélecteur ne devient pas du contenu
> en changeant de parent, il devient seulement plus loin du haut.

#### Les combinaisons, avec les quatre mesures réunies

| Combinaison (V1 + en-tête compacté +…) | `avant` | Part | Marge au seuil |
| --- | ---: | ---: | ---: |
| sélecteur 10/4 | 195 | 27,1 % | **−16 px** |
| sélecteur 8/0 | 189 | 26,3 % | **−10 px** |
| sélecteur 8/0 + badge resserré | 179 | 24,9 % | **0 px** |
| sélecteur 10/4 + badge ôté | 172 | 23,9 % | +7 px |
| **sélecteur 8/0 + badge ôté** | **166** | **23,1 %** | **+13 px** |

**Les quatre leviers mesurés, et ce qu'ils rendent réellement :**

| Levier | Rend | Statut |
| --- | ---: | --- |
| rembourrage de la carte du mois | **16 px** | **sorti du lot** — défaut, corrigé pour lui-même |
| compaction de l'en-tête | **15 px** | geste d'A6, sans casse en largeur |
| marges du sélecteur | **6 px** | gratuit, 8 px de séparation conservés |
| rangée du badge | **10** (resserrée) / **23** (ôtée) | l'arbitrage, toujours ouvert |

Sans toucher au badge, A6 reste rouge de **10 px**. Le resserrer amène
exactement à 179 — vert de zéro pixel, ce qui n'est pas une marge. **L'arbitrage
sur la phrase « 📁 Mois archivé — modifiable » n'est pas levé par la quatrième
voie ; il est seulement moins cher qu'il ne l'était.**

### La cinquième voie — le badge doit-il être PERMANENT ?

La question n'était pas « faut-il garder la phrase » — c'était réglé — mais
**combien de temps faut-il l'afficher**. Elle dit « ce mois est archivé, tu peux
quand même le modifier » : on la lit une fois en arrivant, pas pendant qu'on
travaille.

Quatre variantes, mesurées à 320 px sur mois archivé, correctif #166 et
compaction d'en-tête appliqués, sélecteur à 8/0 — départ **189 px**, cible 179 :

| Variante | `avant` | Part | Verdict | Ce qu'elle rend |
| --- | ---: | ---: | --- | ---: |
| référence — badge permanent | 189 | 26,3 % | rouge | — |
| **(a)** effacé au défilement | **189** | 26,3 % | **rouge** | **0 px** |
| **(b)** effacé après N secondes | 189 à t=0 | 26,3 % | **rouge** | **0 px** |
| **(c)** rangée ôtée, message en toast | **166** | 23,1 % | **vert, 13 px** | **23 px** |
| **(d)** = (c) + marqueur dans le libellé du mois | **166** | 23,1 % | **vert, 13 px** | **23 px** |

**(a) rend zéro, et pour une raison qui vaut d'être écrite : elle existe déjà.**
`onglets.css` déclare `body[data-defile="true"] .period-info { display: none }`.
Vérifié en basculant l'attribut : `block` au repos, `none` au défilement, `block`
en remontant. C'est exactement la variante (a), livrée depuis des mois — et le
contrôle `280` mesure **à défilement zéro**, donc il ne la voit pas et ne la
verra jamais. Ce n'est pas un échec de la variante : c'est que le budget du
premier écran se paie **avant** le premier geste.

**(b) rend zéro aussi, et se disqualifie deux fois.** Mesuré : l'application est
prête après **1 485 ms**, et `280` mesure aussitôt. À t=0 le contrôle lit 189 ;
à t=3,4 s il lirait 166. Pour qu'il voie l'état compact, il faudrait donc un
délai **inférieur à ~1,5 s** — c'est-à-dire un message qui disparaît avant qu'on
ait fini d'arriver. Et la couleur du contrôle dépendrait d'une course entre un
minuteur et un chargement de page : le dépôt a déjà une règle contre les
contrôles qui dépendent de l'horloge. S'y ajoute que du contenu qui s'efface
seul, sans geste, relève de WCAG 2.2.1.

**(c) tient, et le message garde ses mots.** Mesuré sur le vrai système de
toast : `toast.info('📁 Mois archivé — modifiable')` rend le texte **exact**,
dans un conteneur `role="status"` `aria-live="polite"` — donc annoncé —, 231 × 49 px
à 320 px, sur deux lignes, **sans rognage, sans recouvrir la barre d'onglets,
sans débord de page**.

**(d) tient aussi, et rend un marqueur permanent pour zéro pixel.** La rangée
part comme en (c), et le libellé du mois porte le dossier : « 📁 août 2026 ».
Mesuré : **aucun rognage** du sélecteur, aucun débord — le mois le plus large,
« septembre 2026 », fait 118 px de texte pour 174 px disponibles, et l'emoji en
ajoute ~22.

> **Ce que (d) sépare, et que le badge confondait.** « Archivé » est un **état**,
> qu'on doit pouvoir constater à tout moment — il reste, dans le libellé du mois,
> à coût nul. « Modifiable » est une **levée de malentendu**, qu'on lit une fois
> en arrivant — elle part dans le toast. Le badge permanent payait 28 px de
> premier écran pour tenir les deux ensemble, en permanence.
>
> Ce que (d) coûte, et qu'il faut dire : après le toast, plus rien à l'écran ne
> dit qu'un mois passé se modifie. Quelqu'un qui arrive sur août par le sélecteur
> plutôt que par la flèche, ou qui revient une heure plus tard, ne verra que
> « 📁 ». C'est le prix, et il est réel — mais il ne rouvre pas le malentendu que
> `period.js:135` a fermé : il le referme **une fois par visite** au lieu de
> **tout le temps**.

### A5, le geste de la maquette

Les planches 4 et 5 n'ont **aucun `#mainApp > header`** : barre d'état, mois,
sélecteur, contenu. Mesuré, A5 est 2/3 — il fait tomber `onglets:250` sur
`not.toBeNull()`, et c'est le comportement voulu.

Mais A5 n'est pas nécessaire : A6 garde l'en-tête et tient les trois. Le débat
« l'en-tête gagne-t-il ses 42 px de premier écran ? » redevient une question de
conception, à poser un jour pour elle-même — plus une contrainte de budget à
trancher en urgence au milieu du lot 5.

---

## 4. Le plan de lots

**Ordre : 2 → 4 → 5 → 6 → 7, puis 3.** Les lots 1 et 3 se sont révélés VIDES
après mesure — tous deux adaptaient une mise en page qui n'existe pas encore. Le
lot 7 est né de la scission du lot 2 le 2026-09-06.

| Lot | Nature | Départ |
| ---: | --- | --- |
| 1 | *vide — le jeton migre au lot 6* | — |
| 2 | Reflux `1fr auto` du grand-livre **existant** | **premier** |
| 3 | *vide en l'état — relevé fait, se rouvre après le lot 7* | — |
| 4 | La portée comme état, sans surface | indépendant |
| 5 | Le sélecteur de portée | après 4 |
| 6 | Solo et Privé deviennent des vues | après 4 et 5 |
| 7 | La décomposition du grand-livre, par règle | après 2 |

Trois contraintes de forme tiennent sur tous :

- **aucun lot ne désactive un contrôle.** Un contrôle que la structure périme
  est *modifié avec son argument écrit*, jamais supprimé ;
- **le régime mobile 390/320 est traité DANS chaque lot**, jamais à la fin ;
- **chaque lot finit vert sur les 95 suites visuelles ET les trois contrôles du
  chantier** — `encre-sur-surface` (14, statique), `encre-rendue` (4 × 2 thèmes),
  `cible-tactile` (3).

> Trois réserves de lecture, valables aux six lots. Réécrites le 2026-09-07 :
> les deux précédentes disaient ce qu'on croyait, pas ce qui est.
>
> **`share-mode.test.js` a sa cause** — `saveShareMode()` appelé sans `await`
> (`share-mode.js:42` et `:104`), donc un `import()` après démontage de
> l'environnement. La fuite est **inconditionnelle** (6 passes sur 6, y compris
> le fichier joué seul) ; seul le `EXIT=1` est une course. Une passe verte ne
> prouve donc rien : lire `echo EXIT=$?` **avant** le résumé, et lire la sortie
> d'erreur, pas seulement le code.
>
> **`detail-depenses.spec.js` porte DEUX défauts, pas un.** Celui du 2026-09-01
> est un **recouvrement par barre collante à 390 px** — pas un contrôle
> instable, un défaut de mise en page toujours présent, sur la liste que les
> lots 2, 5 et 6 touchent tous. Celui du 2026-09-02 reste ouvert (R2, R3). Les
> artefacts des deux sont dans `docs/artefacts/detail-depenses/` : **les lire
> avant d'imputer une chute au lot.**
>
> **Un clic qui expire sur cette liste n'est pas forcément votre lot.** Les deux
> barres flottantes — `.onglets` en `fixed; bottom: 0; z-index: 60`,
> `.balance-bar` en `sticky; top: 0; z-index: 50` — peuvent recouvrir la cible
> après `scrollIntoView`. Vérifier `elementFromPoint()` au centre de la cible
> avant de chercher ailleurs.

---

### Lot 1 — VIDE, et c'est un résultat

**Ce qu'il devait changer** — `--skeleton-bg` dans les deux thèmes de
`variables.css`, plus ses sites.

**Ce qu'il change réellement — rien.** Le comptage (§1) donne **zéro site dans
`public/`** : le squelette de montant masqué n'existe que dans les planches de la
vue Privé, qui naît au lot 6. Les vingt autres teintes sont déjà les jetons du
dépôt, à leur valeur actuelle.

**Pourquoi on ne pose pas le jeton quand même.** `encre-sur-surface` mesure des
**sites** : un jeton déclaré et jamais employé rend zéro site, donc un contrôle
qui ne peut pas tomber. Ce serait la règle 1 appliquée au jeton plutôt qu'au
test — un vert qui éteint la vigilance sur une surface qu'il ne couvre pas. Et
`audit-design.md` a déjà tranché le cas voisin : une famille de jetons
incomplète est le trou par lequel la dérive rentre, mais le remède est de la
compléter **quand un site l'exige**, pas avant.

**Décision** — `--skeleton-bg` **migre au lot 6**, où naît son premier
consommateur, et où le protocole du chantier contraste s'applique à un site réel :
cible 4,60 sur la pire surface, solveur sur l'hexadécimal réellement émis,
confrontation Chromium avant de figer.

**Conséquence sur l'ordre** — le chantier démarre au **lot 2**. Les lots 2, 3 et
4 restent indépendants entre eux et peuvent partir dans n'importe quel ordre ;
le lot 2 est le moins risqué des trois.

> **Ce que ce lot vide vaut quand même.** Il a produit le comptage teinte par
> teinte qui dit que les planches sont déjà alignées sur `variables.css` — c'est
> ce qui retire la traduction des couleurs du chemin critique de tous les autres
> lots. Un lot qui se révèle vide après mesure est un lot qui a mesuré.

---

### Lot 2 — Le grand-livre existant en `1fr auto`

**Ce qu'il change** — adaptation n° 2 des planches, **sans point de rupture
neuf** et **sur le grand-livre tel qu'il existe** : ses lignes passent en grille
où le libellé s'enroule et le montant reste ancré à droite. Aucune troncature :
dans un grand-livre auditable, le libellé porte la preuve autant que le chiffre.

**Ce qu'il ne change pas** — la décomposition. Elle reste par personne. La
décomposition par règle que dessinent les planches est le **lot 7**.

#### Le grand-livre du dépôt n'est PAS celui des planches

Mesuré dans le code, et ça change la nature du lot. L'application décompose le
total **par personne**, dans `summary.js:873` (`<details class="summary-details">`) :

```text
Total des charges        465,50 €
Répartition à payer
  Rich 58%               270,64 €
  Conjointe 42%          194,86 €
Paiements réels
  Rich a payé            420,50 €     ← <button data-action="ouvrirDetailPayeur">
  Conjointe a payé        45,00 €     ← idem
```

Les planches décomposent autrement — « Courses, au prorata de 71 % », « Festival,
réparti en 50/50 ». **Il n'y a aujourd'hui aucun libellé de catégorie dans ce
dépliant.** C'est ce qui a fait scinder le lot : le reflux d'une mise en page
existante et une décomposition qui n'existe pas sont deux natures, et le témoin
rouge du reflux ne dit rien de la seconde. Voir le **lot 7**.

Conséquence directe sur le témoin rouge : **« Alimentation suffit à casser la
ligne » ne s'applique pas**, faute de libellé de catégorie à allonger. Le mutant
atteignable est le **prénom** — `#prenomVous`, `maxlength="30"`.

#### Ce que les contrôles voient du grand-livre aujourd'hui : rien

Mesuré à 320 px, dépliant ouvert, prénom de 25 caractères. Le conteneur
`.summary-details` passe de **226 à 344 px de `scrollWidth` pour une boîte de
218 px**, et `documentElement.scrollWidth > innerWidth` devient **vrai** — la
page défile latéralement.

| Contrôle | Relevé | Pourquoi |
| --- | ---: | --- |
| `coherence-visuelle:249` « aucun texte n'est coupé » | **0** | Il ne mesure que les **feuilles** (`children.length > 0 → continue`). Les deux lignes qui portent un prénom contiennent un `.summary-percent` imbriqué : non-feuilles, écartées. Là où le `<span>` *est* une feuille, `flex-shrink: 0` le fait croître à `max-content` au lieu de le rogner — `scrollWidth > width` est **faux sur les cinq lignes**. C'est le PARENT qui déborde, et il a des enfants |
| `coherence-visuelle:223` « aucune commande ne dépasse de l'écran » | **0** | Les deux lignes sont des `<button>`, donc dans son périmètre — mais leur boîte s'arrête à x = 278 sur 320. Leur *contenu* les déborde ; elles ne débordent pas l'écran |
| `mobile.spec.js` « la page ne défile pas latéralement » | *jamais joué ici* | Il mesure la bonne propriété, mais sur des profils d'appareil (Pixel 5, 393 px) et avec les prénoms par défaut |

**Et le grand-livre déborde déjà son conteneur de 8 px aujourd'hui, à 320 px,
avec un prénom court** (`scrollWidth` 226 contre 218) — sans qu'aucun contrôle ne
le dise.

Réponse à la question posée : **il faut l'y amener.** Le contrôle existant ne
peut pas être étendu à ce défaut, parce qu'il mesure un rognage *dans* une boîte
et que le symptôme est une boîte qui *grandit*. Deux propriétés différentes.

#### Le témoin rouge, avant le correctif

`320 px` + `#prenomVous` rempli à 30 caractères + dépliant ouvert, et l'assertion
sur `documentElement.scrollWidth <= window.innerWidth`. Il est **rouge sur le
code actuel** — mesuré : `true` pour « la page déborde ». C'est le rouge horodaté
qui donne au correctif quelque chose à prouver.

Un second contrôle est tentant — « aucun élément ne déborde son conteneur »,
`scrollWidth > clientWidth + 2` sur tout le panneau. Il serait **rouge dès
aujourd'hui de 8 px**, donc il relève d'un constat à ouvrir, pas d'un témoin de
ce lot. À consigner sans l'embarquer : un lot qui part avec deux rouges dont un
préexistant ne sait plus lequel il a corrigé.

#### ⚠️ Le témoin ne peut PAS voir les 8 px, et il ne faut pas le croire

Les deux défauts ne sont pas le même, et la mesure les sépare :

| | `.summary-details` `scrollWidth` / boîte | Page défile latéralement |
| --- | ---: | --- |
| Prénom court | 226 / 218 — **déborde de 8 px** | **non** |
| Prénom de 25 caractères | 344 / 218 | **oui** |

Le témoin s'écrit `documentElement.scrollWidth <= innerWidth` : il est donc
**déjà vert aujourd'hui avec un prénom court**. Un correctif qui rend le cas
long vert peut laisser les 8 px intacts sans qu'aucune assertion ne bronche.

**Ce que le lot doit faire, et c'est une obligation de compte rendu** : mesurer
`.summary-details` `scrollWidth` contre `clientWidth` à la sortie, **en
observation, pas en assertion**, et le dire. Si les 8 px survivent, le lot le
déclare et le gotcha de `CLAUDE.md` reste ouvert. **Il ne se referme que sur une
mesure qui le vise, jamais sur un témoin voisin passé au vert** — refermer un
constat sur autre chose que lui est la forme exacte que la règle 5 interdit.

**Vert à la sortie** — les 4 largeurs de `coherence-visuelle`, le témoin neuf,
`bilan-hierarchie` (5, dont `:109` « le total de tête est celui que le dépliant
détaille », qui lit ce dépliant), `mobile` (9), les unitaires de
`calculations.js`.

**Mobile 390/320** — le témoin naît à 320 px ; `coherence-visuelle` couvre les
quatre largeurs. Rien n'attend la fin.

**Indépendance** — ne touche aucun chrome, ne dépend de rien. Premier lot du
chantier, le lot 1 s'étant révélé vide.

---

### Lot 3 — VIDE en l'état, et le relevé le dit

**Relevé fait le 2026-09-06**, sur l'application en marche, contexte tactile
(`hasTouch`, `isMobile`), largeurs 390 · 360 · 340 · 320 · 300 · 280.

Le lot devait poser une sixième requête média sous 600 px pour porter les
adaptations 1, 3 et 5 des planches. **Aucune des trois n'a d'objet aujourd'hui**,
et la raison est la même pour les trois : *elles adaptent la mise en page de la
MAQUETTE, pas celle de l'application.*

| Adaptation | Ce que l'application fait réellement | Bascule | Verdict |
| ---: | --- | --- | --- |
| 1 — héros 40 → 32 px | il est rendu à **28 px**, pas 40 (`summary.css:270`) | déborde sa boîte à **300 px** (scroll 159 / boîte 146) | **sans objet ≥ 320** |
| 2 — grand-livre en `1fr auto` | — | — | **livrée au lot 2** |
| 3 — cartes de statistiques empilées | la grille 2-up « Reste à vivre / Dépensé à deux » de la maquette **n'existe pas** ; la seule grille de cartes du bilan est `.trends-stats-grid`, déjà en `repeat(auto-fit, minmax(min(140px, 100%), 1fr))` — elle empile **sans aucune rupture** | aucune | **sans objet** |
| 4 — sélecteur sans emoji | la surface n'existe pas encore | non mesurable | **dépend du lot 5** |
| 5 — bouton flottant en cercle | il **est déjà** un cercle, mesuré **52 × 52** | aucune | **sans objet** |

**Et la page ne défile en travers à aucune largeur jusqu'à 280 px inclus.** Les
premiers débordements apparaissent à 300 px (`strong` du héros,
`.period-selector`) puis 280 px (`#userName`, `.card`, `#resumePanneauDuo`) —
**sous le plus petit téléphone réel**, qui est 320.

> **Conclusion : aucune requête média neuve n'est justifiable aujourd'hui.**
> Poser une rupture à 360 « pour préparer » reviendrait à écrire une règle qui
> ne se déclenche sur rien — le pendant, côté CSS, du jeton à zéro site du
> lot 1. Une règle qui ne peut pas s'appliquer ne peut pas non plus être
> éprouvée.

#### Ce que le relevé change à l'ordre

Le lot 3 **se rouvre après le lot 7**, quand la mise en page qu'il adapte
existe : le héros à 40 px, les deux cartes de statistiques, le sélecteur de
portée et sa pastille. Le relevé sera **refait à ce moment-là**, sur la même
grille de largeurs, et la rupture sera le maximum des bascules trouvées — ou
aucune, si elles restent sous 320.

Ce qu'il faudra vérifier alors, et qui ne se voit pas d'ici : si les bascules se
dispersent trop pour qu'un seul point les serve, **c'est un résultat**, à dire
plutôt qu'à arrondir vers le plus commode.

**Ce qui reste du lot, et qui ne dépend de rien** : la ligne de `CLAUDE.md` qui
énumère les ruptures est **exacte aujourd'hui** (600, 900, 1600, 2000,
`pointer: coarse`). Elle n'est à corriger que le jour où une sixième naît. Rien
à faire maintenant.

> **Deux lots vides sur sept, et ce n'est pas un raté de planification.** Le
> lot 1 et le lot 3 décrivaient tous deux des adaptations d'une maquette dont la
> mise en page n'est pas encore construite. Les mesurer avant de les écrire a
> coûté deux relevés d'une heure et évité un jeton sans site plus une requête
> média sans déclenchement. **Un lot qui se révèle vide après mesure est un lot
> qui a mesuré.**

### Lot 4 — La portée comme état, sans surface

**Ce qu'il change** — `utils/portee.js`, pur : les trois valeurs, laquelle est
courante, ce que chaque panneau en fait, et le fait que `panneauReglages` n'en a
pas. Une clé dans `state.js`. **Zéro DOM.**

**Ce qu'il fait tomber** — rien. Une fonction pure neuve dans `utils/` exige son
test : c'est la règle du dépôt.

**Vert à la sortie** — `npx vitest run` entière, `adherences-declarees`, et
**`sw.js` : 111 → 112 entrées de précache**, avec le test qui compare la liste au
disque.

**Indépendance** — prérequis des lots 5 et 6, ne dépend de rien.

Il existe pour que la fabrique de la portée soit **unique avant qu'il y ait deux
surfaces à la lire**. C'est la règle 2 appliquée avant la divergence plutôt
qu'après : deux fabriques d'une même grandeur finissent toujours par diverger, et
le second calcul paraît toujours plus simple sur le moment.

---

### Lot 5 — Le sélecteur de portée, sur Bilan et Charges

C'est ici qu'on paie la géométrie, et l'arbitrage de la §3 est son entrée en
matière.

**Ce qu'il change** — trois segments collants sous le mois, présents dans
`panneauBilan` et `panneauCharges`, **absents de `panneauReglages`**, selon
l'agencement **A6**. Les trois identifiants de panneau, leurs `data-panneau` et
la classe `.onglet` ne bougent pas ; `allerAuPanneau` ne change ni de nom ni de
destinations. Plus l'adaptation n° 4, reportée du lot 3.

**L'ordre interne du lot, et il n'est pas libre** :

1. **les deux renforcements de contrôle, commités verts** — `304` sème un solde,
   `280` s'étend à 320 px et au mois archivé. Avec leurs mutants chiffrés en
   commentaire : A1 semé = 163 px, A6 archivé 320 = 27 % ;
2. ~~**BLOQUÉ SUR UNE DÉCISION, pas sur une mesure**~~ **✅ tranché par #168,
   voie (d) — commande `A6` du §0 (2026-09-11).** Historique : le badge ne *peut pas*
   passer en ligne à 320 px : la ligne du mois y est pleine à 270/270, et toute
   variante textuelle la fait déborder de 6 à 62 px. Remesuré sur le vrai CSS le
   2026-09-07 (§3, *Le solde qui reste*). Le plafond du gain sur cette rangée est
   **23 px** et s'obtient en la supprimant ; la resserrer plafonne à **10 px**,
   sous les 12 px requis. Trancher entre « garder la phrase et trouver les 12 px
   dans le point 3 » et « déplacer le marqueur dans le libellé du mois » **avant**
   d'attaquer le point 3 ;
3. l'en-tête à 44 px et la ligne du mois à 48 px en plancher ;
4. le sélecteur.

**Ce qu'il fait tomber, et l'argument de chacun** :

| Contrôle | Ce qui se passe | L'argument |
| --- | --- | --- |
| `onglets:304` | Renforcé au point 1, puis vert | A6 mesure 97 px avec solde, contre 103 aujourd'hui : le lot *rend* du budget |
| `onglets:280` | Renforcé au point 1, rouge au point 3 — et le point 2 ne le ramène au vert que si l'arbitrage rend 12 px | Le sujet du contrôle est « combien d'écran coûte le chrome » ; un sélecteur de portée *est* du chrome et doit être compté |
| `onglets:250` | Vert, resserré à 48 px | L'en-tête est conservé : A5 n'est pas nécessaire |
| `onglets:51` | Vert | Le sélecteur n'est pas un `.panneau` |
| `coherence-visuelle` × 4 | Le témoin passe de 5 à 8 commandes sur le bilan | Le sélecteur en `sticky` est déjà écarté du contrôle de recouvrement par `flottant()` — à vérifier, pas à supposer |
| `cible-tactile` | 3 commandes de plus, 44 px chacune | À 320 : 3 segments dans 304 px utiles ≈ 99 px. La largeur tient, c'est l'emoji qui ne tient pas |
| `encre-rendue` | Attendu vert | Segment actif : blanc sur `--primary-color`, **4,60 sombre / 6,29 clair**, déjà mesurés. Segment au repos : `--text-secondary` sur `--card-bg`, couple conforme documenté. Pré-dégagé n'autorise pas à ne pas mesurer |
| `actions-declarees` | Vert si l'on suit `onglets.js` | Un attribut propre, hors liste blanche, délégué par son module — le raisonnement est déjà écrit dans `onglets.js`, le recopier serait la règle 4 |
| `retour-arriere` | Vert, à condition d'écrire la décision | **Changer de portée n'empile pas de couche** : la barre d'onglets en empile une parce qu'elle est une destination, la portée est un filtre. Sans cette phrase, « dix allers-retours ne coûtent qu'UN retour » se retrouve avec un frère que personne n'a écrit |

**Vert à la sortie** — les 95, les trois contrôles du chantier,
`actions-declarees`, `actions-atteignables`.

**Mobile 390/320** — `coherence-visuelle` tourne déjà aux deux ; `cible-tactile`
n'existe qu'à 390 : le lot lui ajoute une passe à 320, ou dit pourquoi non.

**Indépendance** — dépend du lot 4 (l'état). Ne dépend plus du lot 3, devenu vide :
l'adaptation n° 4 (le sélecteur sans emoji) se mesurera avec le reste, une fois la
surface construite. N'est pas prérequis du lot 6 pour la mécanique, mais l'est pour le
sens : une portée sans sélecteur n'est atteignable par personne.

---

### Lot 6 — Solo et Privé deviennent des vues

**Ce qu'il change** — le contenu derrière les portées 2 et 3.

**Solo** relit `chargesSolo`, `proprietaireDuSolo` et `totauxParPerimetre` :
la fabrique existe dans `utils/perimetre.js`, on n'en écrit pas une seconde.

**Privé** déplace ce que `#modalPrive` rend aujourd'hui, **et porte le jeton
`--skeleton-bg` migré du lot 1** — les barres de montant masqué sont son premier
et seul consommateur. Protocole du chantier contraste : cible 4,60 sur la pire
surface, solveur sur l'hexadécimal réellement émis, confrontation Chromium avant
de figer.

> **Le seuil du squelette : 3:1 ou 4,5:1 ?** À trancher explicitement, pas par
> omission. L'argument posé le 2026-09-06 : 3:1 vaudrait pour un squelette
> purement décoratif — une barre qui dit « ça charge ». Mais celui-ci masque un
> **montant que l'utilisateur a choisi de cacher** : il porte l'information « il
> y a un chiffre ici, et il est masqué ». Ce n'est plus tout à fait un objet
> graphique.
> **La méthode retenue** : mesurer les deux, et regarder si l'écart déplace une
> valeur retenue. **S'il n'en déplace aucune, la question est théorique et on
> prend 4,5 par sûreté.** C'est seulement si les deux seuils donnent des teintes
> différentes que l'arbitrage doit être argumenté.

**Ce qu'il fait tomber** :

- **`onglets:156`** exige « Privé » dans `.acces-rapides`. Privé cesse d'être un
  bouton d'accès. La modification garde la propriété que le contrôle défend — la
  rangée ne repasse pas à dix boutons — et remplace l'assertion par « Privé est
  atteignable comme portée, et n'est plus dupliqué ici ».
- **`depense-privee.spec.js`, 15 cas** : **14 pilotent
  `window.showPrivateExpensesModal()` directement**, un seul passe par
  `[data-action]`. C'est la plus grosse migration du chantier, et elle est
  concentrée dans un fichier.
- **`AUDIT-004`** — le bac à sable n'isole pas le privé. Le lot ne l'aggrave pas,
  il le **rend visible** : ce qui était derrière un bouton devient un tiers de la
  navigation. C'est le moment le moins cher pour poser le refus explicite hors
  `household`.
- **Le mur** : le total qui le franchit reste **déclaratif**. Aucune règle ne peut
  vérifier la somme de ce qu'elle n'a pas le droit de lire, et l'écran doit
  continuer à le dire en toutes lettres.

**Vert à la sortie** — les 95, les trois contrôles, `depense-privee` (15),
`regles-confidentialite`, `regles-perimetre`, `depense-perso`, et **la garde du
précache** : tout module neuf de ce lot entre dans la liste de `sw.js`, tenue à
la main sur 111 entrées. C'est elle qui a rattrapé `utils/repartition.js`.

> **La garde du précache concerne les lots 4 et 6, pas les autres.** Le lot 1
> est vide, les lots 2, 3 et 5 ne créent aucun fichier — ils modifient des
> feuilles et du balisage existants. Le lot 4 ajoute `utils/portee.js`
> (111 → 112) ; ce lot-ci ajoute ce que les deux vues demandent.

**Indépendance** — dépend des lots 4 et 5. Dernier des lots structurels parce
qu'il est le seul à toucher une frontière de confidentialité.

---

### Lot 7 — La décomposition du grand-livre, par règle de répartition

> ## ✅ FAIT le 2026-09-09 — et le prérequis a été tranché par la mesure
>
> **Par règle.** Le jeu d'essai séparateur vit dans
> `tests/utils/decomposition.test.js` : huit charges, cinq catégories, quatre
> règles, avec les deux croisements que la maquette n'avait pas — une catégorie
> à plusieurs règles (Loisirs : 50/50 et 70/30), une règle sur plusieurs
> catégories (le prorata).
>
> **Ce qu'il a dit va plus loin que l'avis posé le 2026-09-06.** L'avis disait
> « une catégorie n'explique pas pourquoi » ; la mesure dit qu'une ligne
> « Loisirs » **ne peut porter AUCUNE règle** — aucun pourcentage ne s'y
> attache. Ce n'est donc pas un arbitrage entre deux formes : c'en est une qui
> répond à la question du dépliant et une qui en est **structurellement
> incapable**. Pour rendre la seconde capable, il faudrait la scinder par
> règle, c'est-à-dire produire la première avec plus de lignes.
>
> Le troisième argument s'est renforcé lui aussi : « une seconde liste de
> charges, à un onglet de distance » est en réalité **dans le même panneau** —
> « Budgets par catégorie » rend déjà `catégorie → montant`, quelques centaines
> de pixels sous le dépliant. Deux ventilations par catégorie sur un écran, avec
> des nombres différents.
>
> Et un quatrième, mesuré : à 320 px au doigt, les libellés par règle tiennent
> sur une ligne (30 px) là où ceux par catégorie s'enroulent (49 px) — **120 px
> contre 207** pour la même information.


Scindé du lot 2 le 2026-09-06. Le seul lot du chantier qui **ajoute de
l'information à l'écran** plutôt que de déplacer celle qui y est.

**Ce qu'il change** — le dépliant du bilan cesse de répondre « qui paie quoi »
seulement, et répond à « **pourquoi ma part vaut 152,45 €** ». Les planches en
donnent la forme : une ligne par règle appliquée, la dérogation nommée.

#### Le prérequis, à trancher AVANT d'ouvrir le lot

La maquette n'a rien tranché : elle a montré **une** lecture. Ses trois charges —
deux « Courses » au prorata, un « Festival » en 50/50 — donnent
`184,04 × 70,61 % = 129,95` et `45 × 50 % = 22,50`, somme `152,45` ✓. Les deux
lectures produisent **exactement les mêmes lignes** sur ce jeu :

- **par règle** — 1 ligne pour tout ce qui suit le prorata, plus une par
  dérogation distincte. **Bornée par construction** ;
- **par catégorie** — une ligne par catégorie. Non bornée.

C'est la règle 2 appliquée à une maquette au lieu d'un test : *le jeu d'essai ne
peut pas séparer les deux hypothèses*, donc la maquette ne prouve ni l'une ni
l'autre. Et il ne suffit pas de choisir : la question « que fait-on à 30
charges ? » **n'existe que dans la lecture par catégorie** — elle présuppose sa
propre réponse.

**Le jeu d'essai qui sépare** : plusieurs catégories au prorata **ET** plusieurs
dérogations distinctes. Sans les deux, on remesure une série plate.

#### L'avis posé le 2026-09-06, à vérifier et non à appliquer

**Par règle, pas par catégorie.** Trois raisons :

1. le dépliant répond à « pourquoi ma part vaut 152,45 € ». Une catégorie
   n'explique rien — « Courses 129,95 » ne dit pas *pourquoi* ; « au prorata de
   71 % » le dit ;
2. bornée par construction — une ligne par règle appliquée, au plus trois
   (`prorata`, `50-50`, `custom`), plus les dérogations distinctes ;
3. une décomposition par catégorie serait **une seconde liste de charges**, dans
   un écran qui en a déjà une à un onglet de distance. Deux surfaces pour la même
   information : la règle 4 en germe.

Cet avis est écrit ici pour être **réfuté par la mesure s'il a tort**, pas pour
dispenser de la faire. Le lot commence par le jeu d'essai séparateur, et dit si
la mesure contredit les trois raisons.

#### Ce qu'il doit respecter

- **Une seule fabrique** : la part se lit dans `calculateChargeShares`, jamais
  recalculée pour l'affichage (règle 2, et c'est la grandeur la plus exposée du
  dépôt).
- **Le prédicat est déjà décidé** : « la charge porte un `splitOverride` »,
  jamais « elle s'écarte du mode du mois » (2026-09-05, quatre surfaces).
  L'autre prédicat donnerait deux réponses pour la même ligne selon l'onglet.
- **La forme de la ligne est déjà décidée** : `Loyer [50/50] … 500,00 €`, le
  montant plein hors de la ligne (2026-09-05). Mesuré — `[50/50] sur 1 000,00 €`
  fait boucler toute ligne dérogatoire à 320 px.

**Ce qu'il fait tomber** — `bilan-hierarchie:109` « le total de tête est celui
que le dépliant détaille » : le dépliant change de contenu, l'égalité qu'il garde
doit continuer à tenir. C'est le contrôle qui protège ce lot, pas celui qu'il
casse.

**Vert à la sortie** — les 95, les trois contrôles du chantier,
`bilan-hierarchie` (5), les unitaires de `calculations.js`, et le témoin du
lot 2 — les libellés de ce lot sont plus longs que ceux qu'il refluait.

**Mobile 390/320** — c'est ici que la grille `1fr auto` du lot 2 est réellement
éprouvée : « Courses, au prorata de 71 % » est le libellé long que le lot 2
n'avait pas.

**Indépendance** — dépend du lot 2 (la grille). En dernier parce que toute la
refonte structurelle doit être verte avant qu'on ajoute de l'information à
l'écran.

---

## 5. Ce qui reste ouvert à l'ouverture du chantier

0. **Le débordement de 8 px du grand-livre est sorti d'ici** — il vit désormais
   dans `CLAUDE.md`, *Gotchas vivants › État et rendu*. Un constat laissé dans la
   section « ce qui reste ouvert » d'un plan de chantier disparaît le jour où le
   chantier est clos. Il reste hors du lot 2 : un lot qui part avec deux rouges
   dont un préexistant ne sait plus lequel il a corrigé.

1. ~~**A6 doit encore rendre 12 px** à 320 px sur un mois archivé, pour tenir le
   seuil `280` renforcé.~~ **✅ TRANCHÉ — resté marqué ouvert à tort
   (2026-09-11).** #168 a retenu la voie (d) : le marqueur dans le libellé du
   mois, « modifiable » dans un toast — commande `A6` du §0, relevé **1**. La
   suite du point est l'historique de la décision. **La piste « badge en ligne, 30 px » est RÉFUTÉE** —
   remesurée sur le vrai CSS le 2026-09-07 : la ligne du mois est pleine
   (270/270 à 320 px), le gain réel plafonne à 23 px et s'obtient en supprimant
   la rangée, la resserrer n'en rend que 10. Le détail chiffré est en §3, *Le
   solde qui reste*. Ce qui reste ouvert n'est plus une mesure mais **un
   arbitrage sur la phrase « 📁 Mois archivé — modifiable »**.
2. **`cible-tactile` ne tourne qu'à 390 px.** Le lot 5 lui doit une passe à 320
   ou une raison écrite.
3. **La sixième rupture n'est pas encore choisie** — traité : le lot 3 s'ouvre
   désormais sur le relevé des cinq largeurs de bascule, et la rupture est leur
   maximum. Voir le lot 3, premier point.
4. **`onglets:314`** — « l'indication de période s'efface au défilement, et
   revient » — dépend de la place de `#periodInfo`, que le point 2 du lot 5
   déplace. Les deux se relisent ensemble.
5. **Aucun appareil réel.** `pointer: coarse` est émulé ; le clavier virtuel et
   le rendu des polices sur un vrai téléphone ne sont pas mesurés. C'est la même
   réserve que celle d'`audit-design.md`, et elle vaut ici.

---

## 6. Ce que ce document ne prétend pas

Les mesures de la §3 sont des **simulations** : le DOM rendu est muté à
l'exécution, pas le CSS du dépôt. Une hauteur forcée par `height: 44px !important`
n'est pas la même chose qu'un en-tête réellement compacté — les marges internes,
le repli du nom de compte à 320 px et le comportement de `entete.js` au
défilement peuvent en écarter le résultat de quelques pixels.

Ce qu'elles établissent est donc **l'existence** d'un agencement à 3/3, ses
ordres de grandeur, et le fait qu'A1 et A7 sont éliminés par un écart de
37 à 43 px — trop large pour être un artefact de simulation. Elles n'établissent
pas les pixels finaux, et le lot 5 devra les remesurer sur le vrai CSS.

> **Cette réserve a servi dès la première vérification, et il faut le dire.**
> Le 2026-09-07, la piste du point 2 du lot 5 — « le badge en ligne rend 30 px »
> — a été remesurée sur le vrai CSS : elle est fausse sur le montant (23 px de
> plafond, pas 30) et **impossible à réaliser** à la largeur qui compte, la
> ligne du mois étant pleine à 270/270 à 320 px.
>
> La simulation ne pouvait pas le voir : elle mutait des **hauteurs**, et le
> défaut est une **largeur**. Le premier instrument écrit pour la remesurer
> reproduisait d'ailleurs le même angle mort — il rendait « 153 px » pour toutes
> les variantes, y compris celles qui débordent de 62 px, parce qu'une ligne qui
> déborde ne coûte aucune hauteur. C'est la règle 1 : la sonde mesurait une
> propriété que le défaut ne touche pas.
>
> **Toute mesure de mise en page mobile doit relever la largeur ET la hauteur**,
> et l'écrire : `scrollWidth > clientWidth` sur la rangée, et
> `documentElement.scrollWidth > innerWidth` sur la page.

---

## L'état de l'inventaire au 2026-09-10 — compté, pas estimé

L'inventaire d'apparence portait **18 écarts** : 12 sur le tableau de bord,
6 sur Réglages. Voici chacun, nommé, avec son état réel. Le tableau remplace les
pourcentages qui circulaient — **un pourcentage estimé n'est pas une mesure**.

### Tableau de bord

| # | Écart | État |
|---|---|---|
| 1 | Le héros « Tu dois … à X » au rang 1 | ⬜ **ouvert, et impossible tel quel sous 360 px** — 54 px demandent 306 px pour 272 disponibles, montant insécable. Réalisable à taille réduite ; la valeur n'est pas tranchée. **→ lot D, 2026-09-11 : paliers 54 / 40 / 32 px, la phrase s'enroule entre ses trois morceaux, le montant reste insécable — code présent, non constaté** |
| 2 | Le grand-livre visible, non replié | ⬜ ouvert. Réalisable, mais **entre en conflit** avec `previsionnel.spec.js:148` s'il est placé dans la carte du héros. **→ lot D : placé dans la carte du héros, ouvert au-dessus de 900 px ; `previsionnel:148` réécrit avec son argument, pas supprimé — code présent, non constaté** |
| 3 | « Deux colonnes au lieu de trois » | ~~📌 **N'EST PAS UN ÉCART** — l'application rend déjà deux colonnes de 900 à 1599 px (`responsive.css:226`). Le trois-colonnes n'existe qu'au-delà de 1600, que la maquette ne dessine pas. Ce qui reste est le rapport et le héros pleine largeur, c'est-à-dire l'écart 4~~ **❌ FAUX (2026-09-11) — c'est un écart.** Le compte de colonnes est juste de 900 à 1599 px ; leur contenu ne l'est pas : `.col-reglages` — Salaires, Rappels — s'empile **sous le bilan**, dans la colonne de gauche (`responsive.css:241-244`), et devient une troisième colonne au-delà de 1600 (`:270`). La planche ne pose que bilan et charges (`tableau-de-bord.html:202`, `1.4fr 1fr`), Réglages étant un écran à part. ~~⬜ **ouvert → lot F**~~ **→ lot E, 2026-09-11 : deux colonnes à toute largeur au-delà de 900 px, la troisième retirée ; Réglages est un écran à part qui remplace le tableau de bord — code présent, non constaté.** **Et ce que la planche montre en plus, relu bloc par bloc en écrivant le lot — le lot E ne le fait pas :** la tête du bilan — « Solde du mois », « Tu dois 66,94 € à Cindy » et le grand-livre — est une section **pleine largeur au-dessus** de la grille (`:131`) ; la grille `1.4fr 1fr` (`:202`) met ensuite **les charges à gauche, en large**, et **les cartes d'analyse à droite** — budgets par catégorie, « Où part votre argent », la carte. Le lot E pose bilan \| charges, que l'application rendait déjà entre 900 et 1599 px ; la silhouette exacte demande un déplacement de plus, laissé « à lettrer » |
| 4 | Les trois cartes de tête + bandeau prorata | ⬜ ouvert, réalisable — les trois chiffres existent (`resteAVivre`, `tauxEffort`, `totalCharges`). **→ lot D : les trois cartes ; le bandeau prorata n'est PAS fait — code présent, non constaté** **→ lot E : le bandeau du partage est posé sous les cartes de tête — la règle, les parts, l'assiette au prorata, et « Modifier les revenus », par le chemin de la porte. Code présent, non constaté** |
| 5 | En-tête à trois cellules, mois centré, ⚙️ Réglages | 🚫 **impossible sans le lot Réglages-écran** : aucune commande Réglages n'existe au-dessus de 899 px, `.onglets` est `display: none` par défaut (`onglets.css:34`). ~~**→ lot F**~~ **→ lot E, 🟡 en partie** : la porte « ⚙️ Réglages » est dans l'en-tête, qui tient désormais sur une ligne — la marque à gauche, la porte et le compte à droite. **Le mois n'y est PAS centré** : il reste dans son bandeau collé, sous l'en-tête. Code présent, non constaté |
| 6 | Barre de recherche avec « Tous les mois » intégré | ⬜ ouvert — non mesuré |
| 7 | Lignes de charge `1fr auto 44px` + bandeaux de catégorie | 🟡 **partiel** — le lot B a posé les lignes à plat, les filets, le survol et le montant 15/600. Restent le montant en enfant direct de la grille, le bouton `⋯` unique et les bandeaux : **balisage**. — **Code présent, non constaté à l'écran (2026-09-11)** |
| 8 | Pied de liste à deux totaux | ⬜ ouvert — balisage |
| 9 | Cartes de droite | 🟡 **partiel** — le lot C a réduit Tendances à une carte de 56 px, les barres à 7 px, les titres à 15 px. Restent budgets, lieux, enveloppes. — **Code présent, non constaté à l'écran (2026-09-11)** **→ lot E : les quatre cartes sont dans la colonne de droite, dans l'ordre des planches, et la première dit son état (« Où part votre argent » / « Budgets par catégorie »). Leur CONTENU n'a pas changé : « Où vous dépensez » ne porte encore que le bouton de la carte, « Enveloppes à deux » que celui qui les ouvre** |
| 10 | FAB en pastille avec libellé | ⬜ ouvert — non mesuré |
| 11 | Sélecteur de portée | ⬜ ouvert — CSS |
| 12 | Ombre du thème clair | ~~✅ **fermé**~~ (lot A, `--carte-ombre`) — **code présent, non constaté à l'écran (2026-09-11)**. Invisible en thème sombre par construction ; et `#trendsSection`, qui n'est pas une `.card`, n'en porte pas |

### Réglages

| # | Écart | État |
|---|---|---|
| 13 | Réglages devient un écran | ⬜ ouvert — le plus structurel ; conditionne 5 et 14 |
| 14 | Grille `1.15fr 1fr` | ⬜ ouvert — dépend de 13 |
| 15 | Revenus en 2×2 + bandeau prorata | ⬜ ouvert |
| 16 | Règle de partage en trois boutons-cartes | ⬜ ouvert |
| 17 | Interrupteurs 46 × 26 px | ⬜ ouvert |
| 18 | Outils en trois sous-titres | ⬜ ouvert |

### Le compte

| | au 2026-09-10 | corrigé le 2026-09-11 |
|---|---:|---|
| Écarts inventoriés au départ | **18** | **18** |
| ✅ fermés | ~~**1**~~ | **1** dans le code (#12), **0** constaté à l'écran |
| 🟡 entamés | ~~**2**~~ | **2** dans le code (#7, #9), **0** constaté à l'écran |
| 📌 requalifiés en non-écart après mesure | ~~**1**~~ | **0** — le #3 était un écart |
| 🚫 impossibles sans un autre lot | **1** | **1** — le #5, planifié au lot F |
| ⬜ ouverts et réalisables | ~~**13**~~ | **14** |

~~Le lot A n'apparaît nulle part comme écart fermé, et c'est exact : il a posé des
**jetons** que les lots suivants consomment. Du terrassement, pas de la façade.~~

**❌ Faux deux fois (2026-09-11).** Le #12 ci-dessus compte le lot A comme
fermé ; et **4 de ses 5 jetons n'ont aucun emploi** — `--radius-xs`,
`--radius-md`, `--squelette-piste`, `--squelette-barre` : commande `A−` du §0,
relevé **0**. C'est exactement ce que le lot 1 interdisait — un jeton sans site
ne peut faire tomber aucun contrôle. Du terrassement sans façade posée dessus.

### Ce que la mesure a ajouté, hors des 18

Aucun de ces points n'était dans l'inventaire. Tous sont sortis d'un relevé.

| Constat | Nature |
|---|---|
| « Auto · 03:17 » sur la sauvegarde | 🚫 **donnée inexistante** — `backup.js:92` n'horodate que le nom de fichier. Fonction à écrire, hors chantier d'apparence |
| « 19 catégories » sur le bouton Catégories | 🚫 **donnée inexistante** — aucun compte exposé |
| Écran « Premier mois » (état `premierJour`) | ⬜ **écran entier à construire** — aucune contrepartie dans le code |
| Écran au-delà de 1600 px | 🚫 **jamais dessiné** — la maquette s'arrête à `max-width: 1400px`. Tout ce qu'on y ferait serait une invention |
| `renderPrevisionnel`, `renderProjection`, `renderObservations` | 📌 **arbitrage de produit, non tranché** — trois blocs que le bilan rend, **zéro occurrence** dans les six planches. Et l'ordre exigé par `previsionnel.spec.js:148` devient insatisfiable si le grand-livre entre dans la carte du héros |
| Le vocabulaire d'icônes | 📌 **non-écart, vérifié** — les planches emploient des emojis comme l'application |

### Ce qui ne sera pas transposable, quel que soit le lot

| Famille | Raison |
|---|---|
| `style-hover` — 66 sites | Attribut inexistant. **Réductible à 3 règles** : survol neutre (53, déjà couvert par `--hover-bg`), bouton primaire (10), carte survolée (3) |
| `<sc-if>`, `{{ … }}`, `DCLogic` | DSL du canevas. Ce sont **huit états à comparer**, pas du balisage |
| Cadre du téléphone de `mobile.html` | Décor de la planche — `border-radius: 20px` et sa bordure. Le transposer mettrait un biseau autour de l'application |
| Styles inline | Autorisés par la CSP (`style-src 'unsafe-inline'`), **interdits par la convention** du dépôt |
| Plafond d'injection 24/24 | Interdit un second gabarit de rendu ; il faut composer dans celui qui existe |
| Barres flottantes, mode sélection, `pointer: coarse` | Surfaces que **l'écran a et que les planches n'ont pas** |
