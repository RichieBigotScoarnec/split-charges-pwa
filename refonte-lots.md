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
lot 5, avec sa piste mesurée : le badge « Mois archivé » coûte **30 px** en
passant sous la ligne du mois (106 px contre 78 px compactés). Le rendre *en
ligne* dans la ligne du mois rend 30 px, soit 162 px = 22,5 % à 320 — vert avec
18 px de marge. À mesurer, pas à supposer.

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

**Ordre validé : 1 → 7.** Le lot 1 s'est révélé vide après mesure (§ ci-dessous)
et le chantier démarre au lot 2 ; le lot 7 est né de la scission du lot 2 le
2026-09-06.

| Lot | Nature | Départ |
| ---: | --- | --- |
| 1 | *vide — le jeton migre au lot 6* | — |
| 2 | Reflux `1fr auto` du grand-livre **existant** | **premier** |
| 3 | Le sixième point de rupture | indépendant |
| 4 | La portée comme état, sans surface | indépendant |
| 5 | Le sélecteur de portée | après 3 et 4 |
| 6 | Solo et Privé deviennent des vues | après 4 et 5 |
| 7 | La décomposition du grand-livre, par règle | après 2, **dernier** |

Trois contraintes de forme tiennent sur tous :

- **aucun lot ne désactive un contrôle.** Un contrôle que la structure périme
  est *modifié avec son argument écrit*, jamais supprimé ;
- **le régime mobile 390/320 est traité DANS chaque lot**, jamais à la fin ;
- **chaque lot finit vert sur les 95 suites visuelles ET les trois contrôles du
  chantier** — `encre-sur-surface` (14, statique), `encre-rendue` (4 × 2 thèmes),
  `cible-tactile` (3).

> Deux réserves de lecture, valables aux six lots.
> **`share-mode.test.js` fait tomber la suite unitaire une passe sur deux**, sans
> explication : « vert à la sortie » se lit avec `echo EXIT=$?` **avant** le
> résumé, et une seconde passe.
> **`detail-depenses.spec.js` est ouvert**, reproductible 1 fois sur 200, et son
> point de chute est un helper de liste de charges que les lots 2, 5 et 6
> touchent tous. S'il tombe, lire le relevé du helper — il nomme R1, R2 et R3 —
> avant de l'imputer au lot.

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

### Lot 3 — Le sixième point de rupture

**Ce qu'il change** — les adaptations 1, 3 et 5 des planches : héros du solde
40 → 32 px, les deux cartes de statistiques empilées en une colonne, bouton
flottant redevenu cercle de 56 px.

**Le coût que la maquette ne montre pas.** `public/css/` ne porte **aucune
requête média sous 600 px** — les ruptures existantes sont 600, 900, 1600, 2000
et `pointer: coarse`. Les adaptations en exigent une **sixième**, autour de
360 px : viser 320 seul ne se déclencherait pas à 350.

#### ⚠️ Le lot 3 ne s'ouvre pas sur 360. Il s'ouvre sur une mesure.

**360 est un nombre rond, pas un résultat.** Il a été proposé ici avant d'avoir
été mesuré, et c'est exactement la forme d'erreur que la journée du 2026-09-06 a
payée trois fois : un chiffre écrit au même endroit et avec la même assurance
qu'un chiffre mesuré. Ouvrir un lot dont le premier geste est une requête média
« autour de 360 px » serait recommencer.

**Le premier geste du lot est donc un relevé**, pas une déclaration : à quelle
largeur **chacune** des cinq adaptations devient-elle nécessaire ?

| Adaptation | Ce qu'on mesure | Largeur de bascule |
| ---: | --- | --- |
| 1 | à partir de quelle largeur « 66,94 € » en mono 40 px ne tient plus avec ses marges | à mesurer |
| 2 | *(sans rupture — livrée au lot 2)* | — |
| 3 | à partir de quelle largeur une demi-colonne ne loge plus « 2 888,43 € » en mono 21 px | à mesurer |
| 4 | à partir de quelle largeur un segment ne loge plus « 🤝 À deux » | à mesurer *(dépend du lot 5)* |
| 5 | à partir de quelle largeur la pastille « ＋ Dépense » prend la moitié de la ligne | à mesurer |

**La rupture est le MAXIMUM de ces largeurs**, arrondi vers le haut au dizaine
près, et écrite dans `responsive.css` **avec les quatre mesures à côté**. Si
elles se dispersent trop pour qu'un seul point les serve, c'est un résultat
aussi : il faudra le dire plutôt que de choisir le plus commode.

**Le lot comprend les quatre, explicitement** :

1. **le relevé des largeurs de bascule** — le tableau ci-dessus, rempli ;
2. la requête média neuve, à la valeur que le relevé donne, avec les mesures
   écrites en commentaire ;
3. les adaptations 1, 3 et 5 ;
4. **la ligne de `CLAUDE.md` qui énumère les ruptures** — section *Conventions
   › CSS*.

Le point 3 n'est pas du ménage : laissé pour plus tard, le référentiel redevient
faux, et une consigne périmée en tête de fichier pèse plus lourd qu'un journal
exact, parce que c'est elle qu'on applique.

**Ce qu'il fait tomber** — `mobile.spec.js` (« la page ne défile pas
latéralement », « les commandes visibles atteignent la taille de cible »),
`coherence-visuelle` × 320, `cible-tactile` — le cercle du bouton flottant reste
à 56 px, la cible ne rétrécit pas.

**Vert à la sortie** — `coherence-visuelle` aux 4 largeurs, `mobile` (9),
`cible-tactile` (3).

**Indépendance** — indépendant, **sauf l'adaptation n° 4** (le sélecteur perd ses
emojis à 320) qui décrit une surface qui n'existe pas encore. Elle est
explicitement reportée au lot 5. La scinder est ce qui garde ce lot indépendant.

---

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
2. le badge « Mois archivé » passe en ligne (**30 px mesurés à rendre**), et on
   re-mesure `280` renforcé ;
3. l'en-tête à 44 px et la ligne du mois à 48 px en plancher ;
4. le sélecteur.

**Ce qu'il fait tomber, et l'argument de chacun** :

| Contrôle | Ce qui se passe | L'argument |
| --- | --- | --- |
| `onglets:304` | Renforcé au point 1, puis vert | A6 mesure 97 px avec solde, contre 103 aujourd'hui : le lot *rend* du budget |
| `onglets:280` | Renforcé au point 1, rouge au point 3, vert au point 2 | Le sujet du contrôle est « combien d'écran coûte le chrome » ; un sélecteur de portée *est* du chrome et doit être compté |
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

**Indépendance** — dépend du lot 4 (l'état) et du lot 3 (la rupture qui retire
les emojis). N'est pas prérequis du lot 6 pour la mécanique, mais l'est pour le
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

1. **A6 doit encore rendre 12 px** à 320 px sur un mois archivé, pour tenir le
   seuil `280` renforcé. Piste mesurée : le badge « Mois archivé » en ligne,
   30 px. Tâche du lot 5, point 2.
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
