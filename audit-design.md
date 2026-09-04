# Audit Design — FairSplit v4.0.0

**Date** : 2026-09-04
**Base** : `1375580`, branche `fix/reel-en-serie`, arbre propre au démarrage.
**Méthode** : mesures sur l'**application exécutée** (Chromium piloté, foyer semé,
390 px et 320 px, thèmes clair et sombre), pas une lecture de feuilles de style.
**Complète** : `audit.md` (2026-09-02, 31 constats techniques) qui excluait
explicitement « les 6 395 lignes de CSS » et « le rendu visuel, le parcours
clavier ». C'est cette surface-là, et elle seule, que couvre le présent rapport.

---

## 1. Résumé

Le rapport de mars 2026 notait **5,5/10** et listait neuf problèmes. **Les neuf
sont résolus** et vérifiés ce jour (§5). Le design actuel est bon : thème clair
chaud et cohérent, jetons documentés avec leurs mesures, hiérarchie du bilan
juste, focus clavier complet, aucun débordement à 320 px, aucune commande sans
nom accessible.

Ce qui reste tient en **une seule cause**, et c'est la cause que ce dépôt connaît
le mieux : *un correctif qui n'a jamais quitté le fichier où il est né*. Le
31 août, trois jetons d'encre (`--success-ink`, `--warning-ink`, `--danger-ink`)
ont été créés parce que les couleurs de pastille rendent 3,19 à 3,77:1 comme
texte. Ils servent aujourd'hui sur **4 sites**. Les couleurs de pastille servent
d'encre sur **33**. L'un de ces 33 est le montant de la barre de solde collante.

**Score : 8,5/10.**

> **Chiffres révisés après mesure automatisée.** Ce rapport a d'abord été rédigé
> à partir d'un relevé manuel qui annonçait 32 sites. Le contrôle
> `tests/encre-sur-surface.test.js`, écrit ensuite, en trouve **56 sur 9
> jetons** — il mesure l'encre sur la surface que chaque règle déclare, lavis
> translucides composés et `opacity` comprise, dans les deux thèmes. Les
> chiffres ci-dessous sont ceux du contrôle, pas ceux du relevé manuel. Le
> détail de l'écart est en §3 bis.

---

## 2. Points forts, mesurés

| Propriété | Mesure |
| --- | --- |
| Focus clavier | **20 commandes tabulées, 20 marquées.** Aucune commande muette |
| Noms accessibles | **0 manquement** sur les trois panneaux |
| Reflux WCAG 1.4.10 | **320 px, aucun défilement horizontal**, aucun élément débordant, sur les trois panneaux |
| Structure | un seul `<h1>`, **aucun saut de niveau**, `<main>` présent, `lang="fr"` |
| Indicateur d'onglet | `aria-current` et peinture **solidaires aux trois états** ; couleur *et* liseré, jamais la couleur seule |
| Jetons d'encre | `--success-ink` 4,79–5,48 · `--danger-ink` 5,01–5,74 · `--warning-ink` 4,85–5,56 — **tous conformes sur les trois surfaces** |
| Suites visuelles | `coherence-visuelle`, `lisibilite`, `mobile`, `onglets`, `etats-vides`, `bilan-hierarchie`, `barre-solde-scintillement`, `formulaire-saisie`, `retour-arriere` : **87/87 verts** |

La sonde de contraste employée ici retrouve **à la deuxième décimale** les
3,77:1 que `variables.css` documente lui-même pour `#059669` sur `--card-bg`.
C'est ce qui autorise à lui faire confiance sur le reste.

---

## 3. Problèmes par priorité

### 🔴 Critique

**D-1 — La barre de solde collante rend le solde à 3,77:1.**

- **Fichier** : `public/css/responsive.css:381-382`
- **Mesuré à l'écran** : `412,96 €`, `<strong>` à 15 px / graisse 900,
  `rgb(5,150,105)` sur `rgb(255,255,255)` → **3,77:1** pour un seuil de 4,5.
- **Pourquoi c'est critique et pas important** : cette barre est, par
  construction, *le seul endroit qui porte le solde une fois le bilan sorti de
  l'écran* — c'est écrit dans `CLAUDE.md` à propos de l'hystérésis anti-
  scintillement. Le chiffre auquel toute l'application sert de justification est
  donc, sur la moitié basse de chaque écran, le texte le moins lisible qu'elle
  produise. Il apparaît sur les panneaux **Charges** et **Réglages**, où le
  bilan n'est pas là pour le redire.
- **Correctif** : `--success-ink` / `--danger-ink` au lieu de
  `--success-color` / `--danger-color`. Mesuré après : **5,48:1** et **5,74:1**.

```css
.balance-bar.balance-positive strong { color: var(--success-ink); }
.balance-bar.balance-negative strong { color: var(--danger-ink); }
```

> Le pendant `--danger-color` (négatif) mesure 4,83:1 sur `--card-bg` : il passe
> de justesse. Les deux se corrigent ensemble — laisser le rouge sur la couleur
> de pastille figerait deux conventions pour la même ligne.

### 🟠 Important

**D-2 — Le correctif « encre » du 31/08 n'a jamais quitté `modals.css`.**

- **Fichiers** : `components.css`, `summary.css`, `modals.css`,
  `responsive.css`, `auth.css`
- **Compté par le contrôle** : `--success-color` **14 sites**,
  `--danger-color` **12**, `--warning-color` **6**, `--error-color` **1** —
  soit **33**. Le relevé manuel en annonçait 32 : il avait manqué
  `--error-color` (`components.css:893`), un **alias** de `--danger-color` que
  le comptage par nom ne pouvait pas voir. Les trois jetons `*-ink` créés pour
  cet usage servent sur **4 sites**, tous dans `modals.css`.
- **Mesuré** (encre sur `--card-bg` / `--elevated-bg` / `--dark-bg`, thème clair) :

  | Jeton | card | elevated | dark-bg | Verdict |
  | --- | ---: | ---: | ---: | --- |
  | `--success-color` | 3,77 | 3,29 | 3,55 | ❌ partout |
  | `--warning-color` | **3,19** | **2,78** | **3,01** | ❌ partout, le pire |
  | `--danger-color` | 4,83 | 4,22 | 4,56 | ❌ sur `elevated` |
  | `--success-ink` | 5,48 | 4,79 | 5,17 | ✅ |
  | `--warning-ink` | 5,56 | 4,85 | 5,24 | ✅ |
  | `--danger-ink` | 5,74 | 5,01 | 5,41 | ✅ |

- **Honnêteté du constat** : un seul de ces 32 sites a été **vu en défaut à
  l'écran** (D-1) ; les autres ne sont pas rendus par l'état que j'ai semé
  (jauges de budget en alerte, cartes de tendance, écrans de modale, états
  d'aval). Le tableau ci-dessus prouve qu'ils **tomberont** dès qu'ils seront
  rendus sur l'une de ces trois surfaces, pas qu'ils sont tombés aujourd'hui.
  Les sites les plus exposés sont ceux du thème `--warning-color`, à 2,78:1 :
  `summary.css:829` (`budget-warning h3`), `:885` (`budget-percentage`),
  `:1072`, `:1084`, `components.css:381`, `:1227`.
- **Risque du correctif : nul en thème sombre.** Mesuré : en sombre
  `--success-ink` **est** `--success-color` (#34D399), idem pour les deux
  autres. Le remplacement y est un no-op exact ; il ne change que le clair.
- **Ce qui a laissé passer** : `lisibilite.spec.js` porte bien un contrôle
  `P0 — le texte discret tient le seuil AA`, mais il ne vise que
  `--text-muted`. Aucun contrôle ne balaie **tout** le texte rendu. Le correctif
  durable est ce balayage, pas les 32 substitutions — sans lui, le 33ᵉ site
  s'écrira demain.

**D-3 — En thème sombre, la couleur de marque ne tient pas le seuil, dans les deux sens.**

- **Fichier** : `public/css/variables.css:229` (`--primary-color: #6366F1`)
- **Étendue** : **18 sites** — `--primary-color` sur 14, `--primary-light` sur 4.
  Le relevé manuel n'avait vu ni le second jeton, ni le fait que
  `components.css:458` (`.charge-location`) l'affaiblit encore d'un
  `opacity: 0.8`, ce qui le porte à **2,90:1**.
- **Mesuré, thème sombre** :
  - **blanc sur `--primary-color` : 4,47:1** — c'est la peinture de tous les
    boutons `.btn-primary`, du bouton flottant, du lien d'évitement.
    En clair le même rapport vaut **6,29:1**.
  - **`--primary-color` comme encre : 3,96 / 3,63 / 4,25:1** — c'est l'onglet
    actif (mesuré **3,44:1** sur son lavis `--primary-soft`) et le libellé du
    mode de partage retenu.
- **La trace de la cause** : `components.css:833` documente ce site — « Mesuré à
  3,90:1 avec `--primary-light` […] La teinte pleine passe à 5,49:1 ». 5,49 est
  exactement ma mesure **en thème clair**. La correction du 31 août a été
  vérifiée dans un thème sur deux.
- **Il n'y avait pas deux voies : la première est impossible.** Posées comme
  inégalités sur la luminance de la primaire en thème sombre, les deux
  contraintes s'excluent :

  ```
  PEINTURE  blanc dessus ≥ 4,5              →  L(primaire) ≤ 0,1833
  ENCRE     sur --elevated-bg ≥ 4,5         →  L(primaire) ≥ 0,2413

                    0,2413  >  0,1833   →   FENÊTRE VIDE
  ```

  Aucune valeur ne satisfait les deux : porter du blanc exige une couleur
  foncée, servir d'encre sur un fond sombre exige une couleur claire. Corriger
  `--primary-color` seule n'était pas coûteux en identité visuelle, c'était
  **arithmétiquement impossible**. Séparer les rôles était la seule issue —
  exactement ce que le dépôt avait déjà décidé pour pastille et encre.
- **Correctif appliqué** : `--primary-ink` pour les 18 sites d'encre, et
  `--primary-color` sombre assombrie de 1 % pour la peinture.

  | | Valeur | Mesure |
  | --- | --- | ---: |
  | `--primary-ink` clair | `#4F46E5` | 4,71 au pire |
  | `--primary-ink` sombre | `#818CF8` | 4,69 au pire |
  | `--primary-color` sombre | `#6366F1` → `#6264ED` | blanc dessus 4,47 → **4,60** |

  **Aucune teinte n'a été inventée** : les deux valeurs de `--primary-ink`
  existaient déjà dans le nuancier, attribuées au mauvais rôle en thème sombre.
- **Nuance à ne pas gommer** : l'onglet actif porte **aussi** un liseré de 3 px,
  et le mode retenu une bordure et un lavis. L'information n'est jamais portée
  par la seule couleur : le manquement est de lisibilité, pas de sémantique.

**D-4 — La liste des cibles tactiles est tenue à la main, et trois commandes récentes lui échappent.**

- **Fichier** : `public/css/responsive.css:395-437`
- **Mesuré au doigt** (`hasTouch`, `pointer: coarse`, 390 px) :

  | Commande | Hauteur | Statut |
  | --- | ---: | --- |
  | `.budget-row--ouvrable` | **37–38 px** | absente de la liste |
  | `.summary-row--ouvrable` | ≥ 44 px aujourd'hui | absente de la liste |
  | `.salary-input-group input` | **43 px** | absente de la liste |

- `.budget-row--ouvrable` et `.summary-row--ouvrable` sont les lignes rendues
  cliquables le 28 août pour ouvrir le détail des dépenses ; la règle
  `pointer: coarse` date d'avant et ne les nomme pas. `.salary-input-group input`
  échappe au sélecteur `.form-group input` qui couvre les autres champs — ce
  sont les quatre nombres qui décident du prorata.
- Le seuil de 44 px est celui que `CLAUDE.md` s'impose (WCAG 2.5.5). Les trois
  restent au-dessus du minimum AA de 24 px (WCAG 2.5.8) : c'est un manquement à
  la règle du projet, pas à la conformité.
- **Correctif** : ajouter les trois sélecteurs au bloc existant. Et, pour que le
  quatrième oubli n'ait pas lieu, un contrôle qui **relève** toute commande
  visible sous 44 px plutôt qu'une liste à tenir.

### 🔵 Mineur

**D-5 — Le champ de recherche ne fait que 18 px de haut.**

- **Fichiers** : `components.css:11-19` (`.search-bar`, 40 px), et le champ
  qu'elle contient, mesuré à **310 × 18 px**.
- Cliquer dans le rembourrage de la barre ne pose pas le focus : seul le champ
  le fait. La cible réelle est donc de 18 px sur les 40 que l'œil perçoit.
- **Correctif** : `min-height: 44px` sur le champ dans le bloc `pointer: coarse`,
  ou un `label` couvrant la barre.

---

## 3 bis. Ce que le contrôle a trouvé, et que le relevé manuel ne pouvait pas voir

`tests/encre-sur-surface.test.js` a été écrit **avant** toute correction et
commité **rouge**, pour que sa capacité à détecter soit horodatée plutôt
qu'affirmée. Périmètre réel : **56 sites, 9 jetons**.

| Jeton | Sites | Pire mesure | Groupe |
| --- | ---: | ---: | --- |
| `--success-color` | 14 | 3,29 | D-2 |
| `--danger-color` | 12 | 3,64 | D-2 |
| `--warning-color` | 6 | 2,52 | D-2 |
| `--error-color` | 1 | 4,22 | D-2 |
| `--primary-color` | 14 | 3,11 | D-3 |
| `--primary-light` | 4 | 2,90 | D-3 |
| `--info-color` | 3 | 3,95 | **inédit** |
| `--success-ink` | 1 | 4,28 | **inédit** |
| `--text-secondary` | 1 | 3,30 | **inédit** |

**Les trois inédits sont la justification du contrôle.** Aucun n'est
détectable en cherchant « une couleur de pastille employée comme encre » :

- **`--success-ink` échoue** (`modals.css:1285`, 4,28:1). C'est un jeton
  *d'encre*, créé le 31 août précisément pour être sûr — mais posé sur le lavis
  `--success-soft`, pas sur une surface de base. La cible de la substitution
  n'est donc pas sûre partout où on va la poser (§6, étape 2 bis).
- **`--info-color`** (3 sites) tient sur les surfaces de base (4,51) et tombe
  sur son propre lavis (3,95). La famille d'encres n'a jamais eu de membre
  `info`.
- **`--text-secondary`** (`modals.css:1258`) est un jeton conforme, ruiné par
  un `opacity: 0.75` déclaré deux lignes plus bas.

### Certains et conditionnels

Le contrôle retient **le pire des trois surfaces de base** quand une règle ne
déclare aucun fond — un CSS statique ne peut pas savoir sur laquelle la règle
atterrit. Cela sépare les 56 sites en deux :

- **39 certains** : ils tombent sur les *trois* surfaces —
  `success-color` (14), `primary-color` en sombre (14), `warning-color` (6),
  `primary-light` (4), `text-secondary` (1).
- **17 conditionnels** : ils passent sur `--card-bg` et tombent sur
  `--elevated-bg` — `danger-color` (12), `info-color` (3), `error-color` (1),
  `success-ink` (1).

```
                       card-bg   elevated-bg   dark-bg
--success-color          3,77       3,29        3,55    ← certain
--warning-color          3,19       2,78        3,01    ← certain
--danger-color           4,83       4,22        4,56    ← conditionnel
--success-ink /soft      4,86       4,28        4,60    ← conditionnel
```

**Les 17 conditionnels sont traités comme les autres**, et pas par prudence :
les exclure obligerait à tenir une liste d'exceptions site par site. C'est
exactement la cause racine de D-2 et de D-4 — une règle appliquée là où on l'a
regardée. Une règle uniforme n'a aucune liste à tenir.

> Le commentaire de `modals.css:1285` annonce 4,86:1 quand le contrôle dit
> 4,28. Les deux sont justes : l'auteur a mesuré sur `--card-bg`, le contrôle
> retient `--elevated-bg`. Que le mesureur retrouve 4,86 **exactement** quand on
> lui donne la même surface est son second point d'étalonnage, après les 3,77:1
> de `#059669` que `variables.css` documente.

### Les trois angles morts, et le second contrôle

Le contrôle statique lit des fichiers. Trois choses lui échappent par
construction, et il a fallu un second contrôle pour les couvrir.

| Angle mort | Ce qu'il cachait |
| --- | --- |
| **Encre littérale** | 14 sites écrivent `#fff` / `white` au lieu d'un jeton. Trois sont fautifs, dont `#fff` sur `--success-color` : **1,92:1** en thème sombre, le pire rapport du dépôt |
| **Opacité héritée** | `.envelope-close { opacity: 0.6 }` atténue tout son sous-arbre sans déclarer une seule couleur : **9 textes entre 2,32 et 4,26** |
| **Surface héritée** | `color: #FFFFFF` sans `background` dans la même règle — le fond vient d'un ancêtre, et le statique doit s'abstenir sous peine de rendre 1,05:1 sur un site parfaitement lisible |

Le premier se ferme en statique : le contrôle relève désormais les encres
littérales, et ne les mesure **que** si leur règle déclare un fond.

Les deux autres ne se ferment pas en lisant un fichier. `encre-rendue.spec.js`
balaie le texte **réellement peint** — deux thèmes, trois panneaux, plus la
modale des enveloppes — en remontant la chaîne des ancêtres et en appliquant le
modèle exact de l'opacité : un élément à `opacity: α` compose tout son
sous-arbre, fond comme texte.

**Les deux contrôles sont complémentaires, pas redondants.** Le statique nomme
le `fichier:ligne` et couvre les états qu'aucun jeu d'essai ne rend — c'est lui
seul qui voit `.current-period-badge`, jamais rendu par le foyer d'essai. Le
rendu couvre l'héritage et la cascade. Supprimer l'un rouvre ce que l'autre ne
voit pas.

> **Ce qui a failli rendre le second contrôle inutile.** Sa première version
> ouvrait la modale sur une liste **vide** : les enveloppes sont lues une fois,
> à l'initialisation, et un `dbSet` après coup ne change pas l'état. Les 9 sites
> de l'enveloppe close n'étaient donc pas mesurés, et le fichier paraissait
> complet. C'est le cas « l'enveloppe close est bien rendue » qui l'a dit — il
> reste, pour que l'angle mort ne se rouvre pas en silence.

**Deux règles, et non deux listes d'exceptions.** Le balayage écarte les
commandes inactives — les WCAG les dispensent explicitement — et le contenu
portant `aria-hidden="true"` : déclaré décoratif, jamais deviné. Il écarte
aussi les emoji **couleur**, peints par la police et non par `color` ; le
critère est la présentation (`\p{Emoji_Presentation}`), si bien que « ◀ », « ✕ »
et « • », qui se peignent avec `color`, restent mesurés au seuil de 3:1 des
objets graphiques.

---

## 4. Constats écartés par la mesure

Consignés pour qu'ils ne reviennent pas — c'est la convention du dépôt.

| Soupçon | Verdict |
| --- | --- |
| **19 commandes sans marque de focus** | ❌ **Faux positif de ma propre sonde.** `el.focus()` en JS ne déclenche pas `:focus-visible` sous Chromium. Re-mesuré en **tabulant réellement** : 20 commandes atteintes, **20 marquées**, 0 muette |
| **L'onglet actif garde la peinture du précédent** | ❌ **Artefact de relevé.** Observation directe aux trois états, souris écartée : `aria-current` et peinture se déplacent ensemble, sans traîne |
| Cases à cocher à 16 × 16 px | ❌ Non. La zone cliquable est le `<label class="search-portee">` qui les enveloppe — exception explicitement documentée dans `responsive.css:417` |
| `.period-arrow` à 40 × 40 px | ❌ Non. `pointer: coarse` les porte à 44 × 44 sur un vrai doigt ; les 40 px sont la mesure souris |
| Police / séparateurs de milliers | ❌ Non. L'espace fine insécable (U+202F) est correcte ; aucun point décimal anglais rendu |

---

## 5. Les neuf points de mars 2026 — vérification

| # | Constat de mars | État vérifié ce jour |
| --- | --- | --- |
| 1 | Thème dark gaming | ✅ Thème clair chaud (`#FAF8F5`), marque `#4F46E5`, sombre en option |
| 2 | Bilan en bas de page | ✅ Bilan en tête, et barre collante qui le suit |
| 3 | Pas de solde net immédiat | ✅ Total commun en tête, écart nommé en dessous |
| 4 | Contrastes sous AA | ⚠️ **Résolu sur les jetons de texte, pas sur les encres sémantiques** → D-1, D-2, D-3 |
| 5 | Cibles tactiles | ⚠️ **Résolu par `pointer: coarse`, trois échappées depuis** → D-4 |
| 6 | Pas de `<main>` | ✅ `<main>` présent, un seul, plus `<nav>` et `<header>` |
| 7 | Font Awesome non chargé | ✅ **0 occurrence** de `fa-` dans `public/` |
| 8 | ~1 500 lignes commentées | ✅ **0 occurrence** de `COMMENTÉ` / `MIGRÉ VERS MODULES` |
| 9 | FAB chevauchant | ✅ Aucun recouvrement ; `coherence-visuelle` le mesure aux quatre largeurs |

---

## 6. Plan d'implémentation

| Étape | Action | Fichier(s) | État |
| ---: | --- | --- | --- |
| 1 | **Le contrôle statique, commité ROUGE** — 9 cas nommant 56 sites | `tests/encre-sur-surface.test.js` | ✅ fait |
| 2 bis | **Rendre la cible sûre** : les `*-ink` ne tenaient pas sur les lavis | `variables.css` | ✅ fait |
| 2 | **D-1 + D-2** — 39 substitutions, jusqu'au vert des 4 familles | 5 feuilles | ✅ fait |
| 3 a | **Les deux contrôles, commités ROUGES** — littéraux, opacité et surface héritées | les 2 contrôles | ✅ fait |
| 3 b | **D-3 + périmètre élargi** — 18 sites de marque, 3 encres littérales, 2 opacités, l'enveloppe close | `variables.css` + 6 feuilles | ✅ fait |
| 4 | **D-4** — contrôle qui **énumère** les commandes et vérifie la cible, pas trois sélecteurs de plus | `responsive.css` + test | à faire |
| — | **D-5** — hauteur du champ de recherche | `responsive.css` | reporté |
| — | `.search-bar-icon` et `.manage-item-icon` sans `aria-hidden` | balisage | identifié, non fait |

**D-1 n'est pas une étape.** Le premier plan en faisait un correctif à part ;
c'est faux. La barre de solde est **un des 33 sites** de D-2 — celui qui compte
le plus par sa position, pas par sa nature. La corriger seule aurait été,
littéralement, le geste qui a produit D-2 : appliquer un remède là où le défaut
a été vu.

**Et le contrôle passe avant toute substitution.** Un test écrit après le
correctif et vert du premier coup ne prouve rien — il peut être vert parce
qu'il ne regarde pas au bon endroit. Ce rapport en donne deux illustrations
dans sa propre §4 : deux constats que j'ai cru voir et qui étaient des faux
positifs de mes sondes. Le rouge initial, commité et horodaté, est la seule
preuve que le mesureur détecte.

Le dépôt a payé ce motif huit fois sous le nom de `normalizePair`, une neuvième
pour `toFixed(1)` — « le correctif n'avait jamais quitté ce fichier. Vingt-huit
sites écrivaient 2909.02 € ». D-2 en est la dixième occurrence, et la première
sur une surface purement visuelle.

### Étape 2 bis — pourquoi elle s'intercale

Le contrôle a montré que `--success-ink` échoue **lui-même** sur un lavis
(4,28:1). Une substitution mécanique `--*-color` → `--*-ink` laisserait donc
des sites rouges : 1 pour `--danger-ink` sur `--danger-soft` (4,32), 2 pour
`--warning-ink` sur `--warning-soft` (4,40), plus le site `--success-ink`
existant (4,28), plus 3 sites `--info-color` pour lesquels aucune encre
n'existe.

Sur 293 sites d'encre, **21 posent leur texte sur un lavis translucide** ; 6
d'entre eux portent `--text-primary` et ne posent aucun problème. Le reste se
règle en **assombrissant les quatre jetons d'encre** pour qu'ils tiennent sur
leur propre lavis composé sur la pire surface — et non en créant une variante
« encre pour lavis », qui rétablirait un choix par site, c'est-à-dire une liste.

| Jeton | Actuel | Sur lavis | Proposé | Sur lavis | Sur base |
| --- | --- | ---: | --- | ---: | ---: |
| `--success-ink` | `#047857` | 4,28 ❌ | `#047454` | 4,52 ✅ | 5,06 |
| `--danger-ink` | `#C81E1E` | 4,32 ❌ | `#C21D1D` | 4,53 ✅ | 5,26 |
| `--warning-ink` | `#A2530A` | 4,40 ❌ | `#A0520A` | 4,51 ✅ | 4,97 |
| `--info-ink` | *(n'existe pas)* | 3,95 ❌ | `#225BD8` | 4,51 ✅ | 5,15 |

Assombrissements de 2 à 8 %, teinte préservée, **aucun nouveau site à décider**.
Sans effet en thème sombre, où les encres valent déjà les pastilles.

### Étape 3 b — l'effacement des enveloppes closes

Le seul point de tout ce travail qui touchait une **intention** et non un
défaut. `.envelope-close { opacity: 0.6 }` porte une intention écrite dans le
dépôt : « reste lisible, mais s'efface derrière les enveloppes en cours ».

Trois voies, deux écartées par la mesure :

- **Réduire l'opacité** — impossible. L'étiquette de thème que porte une
  enveloppe est calibrée à 4,60 sur son lavis : *toute* atténuation la fait
  tomber. L'alpha maximal tenable est **1,00**, c'est-à-dire aucun.
- **Atténuer les couleurs sur les descendants** — écarté sur principe : il faut
  énumérer chaque descendant porteur de couleur, et y ajouter le suivant le
  jour où quelqu'un ajoute un champ. Une liste d'exceptions.
- **Reculer la surface** — retenu. Une enveloppe close cesse d'être une puce en
  relief et repose à plat sur la modale. Deux déclarations, aucun descendant
  énuméré.

L'effacement porte donc sur l'**élévation**, jamais sur l'encre — et le
contraste s'améliore partout, `--card-bg` étant la plus contrastée des trois
surfaces (libellé 14,38 → 16,47 ; détail 5,54 → 6,35 ; étiquette 4,63 → 5,27).

Ce qui a permis de trancher n'était pas dans le CSS : `envelopes.js:863` rend
`<span class="envelope-etat">close</span>` à côté du libellé. **L'état est déjà
dit en toutes lettres** — l'atténuation n'a jamais porté l'information, elle ne
faisait que la redoubler. Arbitrer sur le seul CSS aurait laissé croire le
contraire.

### Étape 3 b — la famille `--on-*`, complétée

Trois règles posaient du **blanc** sur une couleur pleine. `--on-warning`
existait depuis longtemps, ses deux sœurs non — et les trois sites sont donc
restés au blanc faute de cible :

| Site | Avant | Après |
| --- | ---: | --- |
| `.current-period-badge` | 3,77 clair · **1,92 sombre** | `--on-success` — 4,63 · 7,61 |
| `.btn-danger` | 4,83 clair · **2,77 sombre** | `--on-danger` — 4,83 · 5,29 |
| `.manage-item-delete:hover` | 4,83 clair · **2,77 sombre** | idem |

Le blanc est **conservé** là où il gagne — sur le rouge du thème clair, à
4,83:1. Ces jetons ne prescrivent pas une teinte, ils prescrivent la lisibilité
sur leur fond.

C'est le même motif qu'une famille d'encres à trois membres sur quatre : une
famille incomplète est le trou par lequel la dérive rentre, parce que le site
sans cible force l'exception.

---

## 7. Ce qui n'a pas été couvert

- **Un seul état semé** : un mois, deux salaires, trois charges, aucun budget
  défini, aucune enveloppe, aucun historique. Les jauges en alerte, les cartes
  de tendance, les modales et le panneau privé n'ont donc **pas** été rendus —
  c'est ce qui borne D-2 à un site confirmé sur 32.
- **Aucun appareil réel** : `pointer: coarse` est émulé. La géolocalisation, le
  clavier virtuel et le rendu des polices sur un vrai téléphone ne sont pas
  mesurés.
- **Aucune capture de référence** : le lissage des polices diverge entre
  conteneur et CI — c'est la raison déjà consignée pour
  `coherence-visuelle.spec.js`, et elle vaut ici.
- **Lecteur d'écran** : les noms accessibles et la structure sont vérifiés, le
  parcours réel sous NVDA ou VoiceOver ne l'est pas.
- **Mouvement** : `prefers-reduced-motion` est présent dans les feuilles, non
  éprouvé à l'exécution.
