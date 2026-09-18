# La carte des écrans et de leurs chemins

**Relevé le 2026-09-18, sur `origin/main` à `6fad4ce`.** Ce document répond à une
seule question : *comment atteint-on chaque écran, et qu'est-ce qui l'empêche de
paraître ?* Il sert à une passe de relevé visuel — il dit dans quel ordre ouvrir
les écrans, et ce qu'il faut avoir saisi pour que certains existent.

## Comment il a été fait, et ce que ça garantit

Les chemins viennent de quatre sources, **pas de la mémoire** :

| Source | Ce qu'elle donne |
|---|---|
| `public/js/init.js` | la liste blanche `ACTIONS_AUTORISEES` — 60 noms, le seul vocabulaire que la délégation accepte |
| `public/FairSplit.html` | les boutons livrés et leur libellé réel |
| `public/js/**/*.js` | les gabarits et les `element.dataset.action = …` construits à l'exécution |
| `tests/actions-atteignables.test.js` | la garde qui tient déjà « chaque bouton mène quelque part » |

**Et les conditions d'apparition sont MESURÉES, pas déduites.** Une sonde
Playwright a ouvert l'application sous émulateurs, à 1280 px et à 390 px, avec et
sans semis, et relevé ce qui était réellement visible sur chaque portée. Les
chiffres marqués « mesuré » viennent de là ; ce qui n'a pas pu l'être est dit
comme tel.

> **Un piège de la mesure elle-même, et il vaut d'être écrit.** Le premier semis
> posait un lieu en `{ lat, lon }` et le bouton « 📍 Carte » ne paraissait pas.
> La conclusion facile — « le bouton dépend d'autre chose » — était fausse :
> `estLocalisee` (`map.js:377`) exige `lat` **et `lng`**. Un semis en `lon` produit
> une dépense sans lieu, **en silence**. Refait en `lng`, le bouton paraît.

---

## Le squelette : trois panneaux, un écran à part

L'application n'a que **quatre surfaces de premier niveau**. Tout le reste est
une modale ouverte depuis l'une d'elles.

| Surface | Comment on y va sous 900 px | Comment on y va au-delà de 900 px |
|---|---|---|
| **📊 Bilan** | onglet « 📊 Bilan » | toujours à l'écran |
| **🧾 Charges** | onglet « 🧾 Charges » | toujours à l'écran |
| **⚙️ Réglages** | onglet « ⚙️ Réglages » | porte « ⚙️ Réglages » de l'en-tête |
| retour depuis Réglages | onglet « 📊 Bilan » | « ← Retour au tableau de bord » |

**La différence de largeur n'est pas cosmétique, et c'est la clé de la question 1
ci-dessous.** Mesuré :

| Largeur | Panneaux visibles ensemble | Onglets visibles | Portes visibles |
|---|---|---:|---:|
| **1280 px** | Bilan **et** Charges | 0 | 1 |
| **390 px** | un seul, celui de l'onglet actif | 3 | 0 |

Au-delà de 900 px, « aller au Bilan » et « aller aux Charges » ne veulent donc
plus rien dire : les deux sont là. Un chemin qui nomme un panneau ne se vérifie
qu'en dessous de 900 px.

### Le sélecteur de portée

Trois segments — **« À deux »**, **« Moi ce mois »**, **« Privé »** — en tête des
panneaux Bilan **et** Charges. Mesuré : **2 sélecteurs rendus, 6 segments au
total**, aux deux largeurs. C'est voulu au sens où `PANNEAUX_AVEC_PORTEE`
(`utils/portee.js:95`) les nomme tous les deux ; c'est aussi le doublon que
`CLAUDE.md` signale comme « vu à l'écran ». Les deux restent d'accord : un seul
état, `porteeCourante`.

**La portée gouverne tout le panneau Bilan.** Mesuré, semis identique :

| | À deux | Moi ce mois | Privé |
|---|---|---|---|
| « Régler ce solde » | **oui** | non | non |
| « 📍 Carte » | **oui** | non | non |
| carte de veille (💡) | **oui** | non | non |
| renvoi de portée en pied de liste | oui | oui | **non** |

---

## Depuis le Bilan

### 📊 Résumé du Mois — `modules/summary.js`
Toujours là. C'est la carte de tête, le grand-livre et la phrase du solde.
Portée : les trois, mais son contenu change entièrement.

### « Régler ce solde » → modale **« Régler {mois} »**
- **Chemin** : Bilan → « Régler ce solde ».
- **Condition** : le solde final du mois est **différent de zéro**
  (`summary.js:1086`). À zéro, le bouton n'est pas rendu du tout — ce n'est pas
  un bouton grisé, il n'existe pas.
- **Portée** : « À deux » seulement — mesuré.
- **Fichier** : `modules/reimbursements.js`, modale `#modalReglerSolde`.

### « {prénom} a payé » → modale **Détail des dépenses**
- **Chemin** : Bilan → grand-livre → ligne « {prénom} a payé ».
- **Condition** : le grand-livre est déplié. Sous 900 px il est **replié par
  défaut** (décision du foyer, lot D) ; au bureau il est ouvert.
- **Fichier** : `modules/detail-depenses.js` (`#modalDetailDepenses`, construite
  en JS).

### « 📄 Le mois en un coup d'œil » → modale **Rapport mensuel**
- **Chemin** : Bilan → bas de la colonne → « 📄 Le mois en un coup d'œil ».
- **Condition** : `rapport && !rapport.vide` (`summary.js:1211`) — il faut un mois
  qui porte de quoi composer un rapport. **Non mesuré** : la sonde n'a pas semé
  un mois assez complet pour le faire paraître.
- **Fichier** : `modules/rapport.js` (`#modalRapportMensuel`).

### Les cartes de veille (💡) → « Créer la cagnotte » / « Reconduire »
- **Chemin** : Bilan → carte 💡 → le bouton qu'elle porte.
- **Condition, et c'est la plus exigeante du document** : l'observation doit
  être **calculée**. Mesuré avec le semis d'`anticipation.spec.js` — une même
  dépense vue **deux fois à un an d'écart**, échéance **trois mois plus loin** :
  la carte « 💡 "Assurance habitation" revient chaque année… » paraît. Une
  échéance dans le mois courant ne produit rien.
- **Portée** : « À deux » seulement — mesuré.
- **Fichiers** : `modules/summary.js` (rendu), `utils/provisions.js` +
  `utils/recurrence.js` (l'observation).

### « 📍 Carte » → modale **Carte des dépenses**
- **Chemin** : Bilan → carte « 📍 Où vous dépensez » → « 📍 Carte ».
- **Condition** : au moins une dépense non supprimée du mois porte
  `location.lat` **et** `location.lng`, tous deux finis (`map.js:377`). Sans
  cela le bouton porte `hidden` — il est dans le balisage livré,
  `FairSplit.html:367`, mais invisible.
- **Portée** : « À deux » seulement — mesuré.
- **Fichier** : `modules/map.js` (`#mapModal`, construite en JS).

### « 🧳 Enveloppes » → modale **Gérer les enveloppes**
- **Chemin** : Bilan → carte « 🧳 Enveloppes à deux » → « 🧳 Enveloppes ».
- **Condition** : aucune pour la modale ; la **carte**, elle, ne dit quelque
  chose que s'il existe au moins une enveloppe.
- **Fichier** : `modules/envelopes.js` (`#modalManageEnvelopes`).

### Une enveloppe de la liste → modale **Vue d'une enveloppe**
- **Chemin** : Bilan → « 🧳 Enveloppes » → une ligne de la liste.
- ⚠️ **Elle ne passe PAS par `data-action`** : l'ouverture est un
  `addEventListener` posé sur `.envelope-ouvrir` (`envelopes.js:1189`). Elle est
  donc invisible pour la garde d'atteignabilité.
- **Fichier** : `modules/envelopes.js` (`#modalVueEnveloppe`).

### « Définir les budgets » → modale **Budgets par catégorie**
- **Chemin** : Bilan → carte des budgets → « Définir les budgets ».
- **Condition** : la carte des budgets est rendue (`category-budgets.js:174`).
  **Non mesuré** : la sonde n'a pas semé de budget.
- **Fichier** : `modules/category-budgets.js` (`#modalBudgets`, livrée dans le HTML).

### Une catégorie de la carte des budgets → modale **Détail des dépenses**
- **Chemin** : Bilan → carte des budgets → une ligne de catégorie.
- Même modale que « {prénom} a payé », autre entrée (`category-budgets.js:71`).

### « Afficher » du bloc privé → dévoile le montant sur place
- **Chemin** : Bilan → bloc privé → « Afficher ».
- **Condition** : ce bloc dépend de la posture de partage. **Non mesuré** — la
  sonde n'a pas posé d'aval.
- Ce n'est pas un écran : le montant est **absent** tant qu'on n'a pas appuyé,
  pas seulement masqué (`modules/resume-prive.js`).

### « 📈 Tendances sur 6 mois ▼ » → déplie une section
- **Chemin** : Bilan → « 📈 Tendances sur 6 mois ▼ ».
- **Condition** : aucune pour le dépliage ; le contenu exige plusieurs mois.
- **Fichier** : `modules/trends.js`.

---

## Depuis les Charges

### Les trois listes
« ⚡ Charges Variables », « 🔒 Charges Fixes », « 💸 Remboursements ». Chacune
porte un bouton **« + Ajouter »** qui ouvre sa modale.

⚠️ **Les trois « + Ajouter » n'ont AUCUN `data-action`** — vérifié dans le
balisage livré. Ils sont câblés par `addEventListener` dans leur module
(`variable-charges.js:237` pour le premier). Ils fonctionnent ; simplement, la
garde d'atteignabilité ne les voit pas.

| Modale | Titre affiché | Fichier |
|---|---|---|
| `#modalAddVariableCharge` | Ajouter Charge Variable | `modules/variable-charges.js` |
| `#modalAddFixedCharge` | Ajouter Charge Fixe | `modules/fixed-charges.js` |
| `#modalAddReimbursement` | Ajouter Remboursement | `modules/reimbursements.js` |

### Sur une ligne de charge
« Modifier » et « Supprimer » (`editVariableCharge`, `deleteVariableCharge` et
leurs jumeaux fixes / remboursements) — rendus par le gabarit de la ligne.
La suppression passe par la modale **Confirmation** (`#modalConfirm`), dont le
bouton nomme l'action depuis le 2026-09-18.

### « Sélectionner » → barre de lot
- **Chemin** : Charges → « Sélectionner ».
- Ouvre la barre `#selectionBarre` : « Tout », un sélecteur de catégorie, un
  d'enveloppe, et « Supprimer ».
- **Condition** : aucune pour la barre ; « Supprimer » agit sur la sélection.
- **Fichier** : `modules/selection-charges.js`.

### Le renvoi en pied de liste → change de portée
- **Chemin** : Charges → pied d'une liste filtrée → le bouton qui nomme l'autre
  segment.
- **Condition** : la portée filtre la liste **et** il reste quelque chose
  ailleurs. Mesuré : présent sous « À deux » et « Moi ce mois », **absent sous
  « Privé »**.
- **Fichier** : `utils/totaux-liste.js` → `allerALaPortee`.

---

## Depuis les Réglages

Tout y est inconditionnel — c'est le seul panneau sans condition d'apparition.

| Bouton | Ouvre | Fichier |
|---|---|---|
| « 🗑️ Corbeille » | `#modalTrash` — Corbeille, tous les mois | `modules/trash.js` |
| « 💾 Sauvegarde » | `#modalBackup` | `modules/backup.js` |
| « 📥 Importer CSV » | `#modalImport` (construite en JS) | `modules/import.js` |
| « 🏷️ Catégories » | `#modalManageLists` | `modules/custom-lists.js` |
| « 🏦 Destinations » | `#modalManageLists` | `modules/custom-lists.js` |
| « 📊 Export CSV » | téléchargement, pas d'écran | `modules/export.js` |
| « 📄 Imprimer PDF » | impression, pas d'écran | `modules/export.js` |
| « 🚪 Déconnexion » | confirmation si des saisies attendent | `modules/auth.js` |

Plus, sans modale : les trois modes de partage (« 📊 Prorata », « ⚖️ 50-50 »,
« 🎯 Personnalisé »), les prénoms, les salaires, le report de solde, et
« 🔔 Rappels et Notifications ▼ ».

### « Rétablir » dans la Corbeille
Rendu par ligne (`trash.js:256`), une entrée par élément supprimé en douceur.
**Condition** : la corbeille n'est pas vide.

### Le bouton d'autorisation des notifications
- **Chemin** : Réglages → « 🔔 Rappels et Notifications ▼ » → le bouton.
- **Condition** : il ne paraît que si la permission est **à demander**.
  Accordée, le bloc dit ce que les rappels tiennent ; refusée, il renvoie aux
  réglages du navigateur **sans bouton**, délibérément (`notifications.js:130`).

---

## Ce qui ne s'atteint que depuis un autre écran

| Écran | Depuis | Remarque |
|---|---|---|
| **⚡ Saisie Rapide** (`#modalQuickAdd`) | le bouton flottant « ➕ », présent sur toutes les surfaces | le seul accès |
| **Confirmation** (`#modalConfirm`) | 11 appels de `showConfirmModal` | jamais ouverte directement |
| **Détail des dépenses** | grand-livre du Bilan, ou carte des budgets | deux entrées, une modale |
| **Vue d'une enveloppe** | liste de « Gérer les enveloppes » | pas de `data-action` |
| **Régler {mois}** | « Régler ce solde » du Bilan | solde ≠ 0, portée « À deux » |

---

## Question 1 — où vit « 💸 Remboursements », et sous quelles portées

**Elle vit dans le panneau CHARGES.** `FairSplit.html:533`, `<section
aria-labelledby="sectionRemboursements">`, enfant direct de `#panneauCharges`.
Il n'y a aucune ambiguïté dans le balisage.

**Les deux tests e2e ont raison tous les deux, et c'est la largeur qui les
sépare.** Mesuré, application ouverte sous émulateurs :

| Largeur | après « aller au Bilan » | après « aller aux Charges » |
|---|---|---|
| **1280 px** | carte **visible** | carte **visible** |
| **390 px** | carte **invisible** | carte **visible** |

- `tests/e2e/retour-arriere.spec.js:89` va au panneau **Charges** : c'est le
  chemin exact, vrai à toute largeur.
- `tests/e2e/vues.spec.js:372` va au panneau **Bilan** puis clique
  `#addReimbursementBtn`. Ce fichier **ne déclare aucune largeur** pour ce
  `describe` — il tourne donc au défaut de Playwright, **1280 × 720**, au-delà
  de 900 px, là où les deux panneaux sont à l'écran ensemble. Le test passe, et
  il passerait aussi en allant n'importe où.

**Le vrai chemin est donc « 🧾 Charges → 💸 Remboursements ».** Le second test
n'est pas faux, il est **muet sur la question** : il nomme un panneau qui
n'entre pour rien dans ce qu'il mesure. Sous 900 px il échouerait.

**Portées** : la carte est visible sous **les trois**. Le sélecteur de portée
filtre les deux listes de charges ; il ne retire pas la carte des
remboursements. Mesuré aux trois portées, aux deux largeurs.

---

## Question 2 — des écrans atteignables seulement par la console ?

**Non. Aucun, aujourd'hui.** Mesuré plutôt que lu :

| | |
|---|---:|
| noms dans `ACTIONS_AUTORISEES` | 60 |
| noms réellement écrits dans un balisage (HTML + gabarits JS + `dataset.action`) | 60 |
| noms du balisage sans fonction sur `window` | **0** |
| noms autorisés que rien n'écrit | **0** |

**Mais la première mesure disait 5, et elle était fausse.** Un balayage qui ne
cherche que `data-action="…"` manque les cinq actions posées par
`element.dataset.action = '…'` sur un nœud construit :

| Action | Posée par |
|---|---|
| `allerALaPortee` | `utils/totaux-liste.js:388` |
| `ouvrirDetailCategorie` | `modules/category-budgets.js:71` |
| `requestNotificationPermission` | `modules/notifications.js:142` |
| `restoreFromTrash` | `modules/trash.js:256` |
| `showBudgetEditor` | `modules/category-budgets.js:174` |

> ⚠️ **C'est exactement l'angle mort de `tests/actions-atteignables.test.js`** :
> il lit `data-action="([^"]+)"` **dans `public/FairSplit.html` seul**. Les cinq
> actions ci-dessus lui sont invisibles, et les trois « + Ajouter » aussi,
> puisqu'ils n'ont pas d'attribut du tout. La garde tient ce qu'elle annonce —
> « chaque `data-action` du HTML livré correspond à une fonction exposée » — et
> rien de plus. Elle ne prouve pas qu'un écran a une porte dès que cette porte
> est construite en JavaScript. **Ce n'est pas un défaut à corriger en passant :
> c'est une décision à prendre**, et elle est écrite ici plutôt que tranchée.

Les autres noms exposés sur `window` ne sont pas des écrans :

| Nom | Ce que c'est |
|---|---|
| `_signInWithGoogle`, `_signInWithEmail`, `_createAccount` | alias hérités, `auth.js:815-817` — doublons des noms sans tiret bas |
| `__diag` | le rapport de diagnostic (`utils/diagnostics.js:260`) |
| `__actionsIgnorees` | le compte des gestes perdus (`init.js:114`) |
| `matchMedia` | **faux positif du balayage** : `typeof window.matchMedia === 'function'` correspond à `window\.(\w+)\s*=`. La même expression vit dans `actions-atteignables.test.js` — elle y produit le même faux positif, sans conséquence. |

---

## Ce que ce relevé ne peut PAS trancher

Dit plutôt que comblé.

1. **Les écrans qui dépendent d'un aval de partage** — le bloc privé du bilan et
   ce que « Privé » montre. La sonde n'a pas posé d'aval ; le comportement est
   décrit dans `CLAUDE.md` mais n'a pas été mesuré ici.
2. **Le rapport mensuel** et **la carte des budgets** — leurs conditions sont
   lues dans le code (`rapport && !rapport.vide`, une carte de budgets rendue),
   pas mesurées à l'écran.
3. **Les entrées câblées par `addEventListener`** — la vue d'une enveloppe, les
   trois « + Ajouter », les boutons internes aux modales. Aucun inventaire
   automatique ne les couvre : les recenser demanderait de lire chaque module.
   **Ce document en nomme quatre ; il ne prétend pas les avoir tous.**
4. **L'écran Réglages au-delà de 1600 px** — `CLAUDE.md` dit qu'il fut une
   troisième colonne jusqu'au lot E. La sonde n'a mesuré que 1280 et 390.

## L'ordre conseillé pour une passe de relevé visuel

Il suit les conditions, du moins exigeant au plus exigeant.

1. **Sans rien saisir** : Bilan vide, Charges vides, Réglages et ses huit
   modales, la Saisie Rapide. Rien n'a de condition.
2. **Après deux salaires et une dépense partagée** : le Résumé prend corps,
   « Régler ce solde » paraît, la modale de règlement s'ouvre.
3. **Après une dépense localisée** (`lat` **et** `lng`) : « 📍 Carte ».
4. **Après une enveloppe** : la carte « 🧳 Enveloppes à deux », la modale de
   gestion, la vue d'une enveloppe.
5. **Après une même dépense vue deux fois à un an d'écart, échéance trois mois
   plus loin** : la carte de veille et ses deux boutons.
6. **Après une suppression** : la Corbeille et son « Rétablir ».
7. **À chaque étape, les trois portées et les deux largeurs** — c'est là que la
   moitié des écarts se voit, et c'est ce que ce document sert à ne pas oublier.
