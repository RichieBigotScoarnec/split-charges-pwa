# FairSplit — contexte pour un travail de design

Document de cadrage écrit à partir du code de l'application (branche
`claude/hopeful-cori-80a5sj`). Il décrit ce que l'application fait, ce que
l'interface doit obligatoirement montrer, et les contraintes techniques qui
bornent une refonte visuelle. Il ne propose aucune orientation de design.

FairSplit est une application web installable (PWA) de partage des charges d'un
couple, avec synchronisation temps réel. Deux comptes seulement partagent un
espace de données unique. Tout est en français.

---

## 1. Le parcours principal

L'écran est découpé en trois **panneaux** : `panneauBilan`, `panneauCharges`,
`panneauReglages` (`public/FairSplit.html`). En dessous de 900 px de large, une
barre d'onglets en bas d'écran en montre un seul à la fois (« Bilan »,
« Charges », « Réglages » — `public/js/utils/onglets.js`,
`public/css/onglets.css`). Au-delà de 900 px, les trois panneaux deviennent des
colonnes affichées simultanément et la barre d'onglets disparaît. C'est le même
balisage dans les deux cas.

### Ce qu'on fait une seule fois, au démarrage

**Étape 0 — Connexion.** Écran plein `authOverlay` (Google, ou e-mail et mot de
passe). Il démarre en attente, logo seul, et ne montre ses commandes qu'une fois
qu'on sait qu'elles servent (`public/js/modules/auth.js`). Seuls des comptes
d'une liste blanche entrent.

**Étape 0 bis — Réglages initiaux.** Dans l'onglet Réglages : les deux salaires,
éventuellement les autres revenus, les prénoms des deux personnes, et le mode de
partage. Tant que les salaires manquent et que le mode en a besoin, le bilan
n'affiche pas de chiffres : il affiche un état vide et un bouton « Renseigner les
salaires » qui bascule d'onglet puis met le champ au point
(`public/js/modules/summary.js`, `public/js/modules/period.js`). Les charges
fixes (loyer, abonnements) se saisissent aussi une fois : elles se reconduisent
ensuite d'elles-mêmes chaque mois (`public/js/modules/reconduction.js`).

### Ce qu'on fait chaque mois

**Étape 1 — Ouverture et choix du mois.** Un en-tête compact, puis un sélecteur
de mois avec deux flèches, collé en haut pendant le défilement
(`public/js/utils/entete.js`). À l'ouverture d'un mois neuf, les charges fixes
récurrentes sont recopiées automatiquement, chacune à son quantième, et les
versements mensuels des cagnottes sont exécutés une fois
(`public/js/utils/versement-mensuel.js`).

**Étape 2 — Le bilan, écran d'arrivée par défaut.** Panneau `panneauBilan`,
rendu par `public/js/modules/summary.js` : le total dépensé ensemble en gros, le
solde entre les deux personnes juste en dessous, ce qui reste à passer d'ici la
fin du mois, la projection de fin de mois, les observations de veille, puis un
dépliant « Voir le détail » (répartition théorique, paiements réels). Deux
onglets internes au bilan : « À deux » (le foyer) et « Moi ce mois-ci » (reste à
vivre personnel).

**Étape 3 — La saisie, l'action qui justifie l'application.** Un bouton flottant
permanent en bas à droite (`.fab`) ouvre la modale **Saisie rapide**
(`modalQuickAdd`, `public/js/modules/quick-add.js`) : montant d'abord, puis
description, catégorie proposée par tuiles, payeur, date et heure préremplies. La
géolocalisation ne se déclenche qu'à la première frappe dans le montant, et sert
à proposer une catégorie. L'application est aussi installable avec un raccourci
d'appui long qui ouvre directement cette modale
(`public/js/utils/raccourci.js`). Une saisie plus complète — ou la correction
d'une charge existante — passe par le panneau Charges et ses formulaires
`modalAddVariableCharge`, `modalAddFixedCharge`, `modalAddReimbursement`.

**Étape 4 — Vérifier, corriger, régler.** Panneau `panneauCharges` : trois
listes (charges variables, charges fixes, remboursements), chacune avec son
total, une recherche qui peut s'étendre à tout l'historique, et un mode de
sélection multiple. On y corrige une ligne, puis on revient au bilan — le
va-et-vient entre ces deux onglets est le geste courant, et chaque onglet garde
sa position de défilement. Le mois se solde depuis le bilan, par le bouton
« Régler ce solde », qui relit tout avant d'écrire et refuse d'écrire si le solde
a bougé entre-temps (`public/js/modules/reimbursements.js`).

Le panneau Réglages porte, en plus des salaires et du mode de partage, les
rappels et une carte « Outils » : gestion des catégories, des destinations de
virement, des enveloppes, sauvegarde, corbeille, import CSV, exports CSV et PDF.

---

## 2. Les règles métier que l'interface doit exposer

Pour chaque point : ce qui est affiché, où, et ce qui casse fonctionnellement si
ça disparaît.

### La répartition des charges

Trois modes, choisis dans les Réglages : **prorata des revenus** (défaut),
**50-50**, et **personnalisé** (deux pourcentages qui doivent faire 100).
`public/js/utils/calculations.js`. Une charge individuelle peut porter sa propre
répartition, qui prime sur le mode du foyer.

L'écran doit permettre de vérifier trois choses. D'abord **quel mode s'applique**
et, en personnalisé, avec quels pourcentages : c'est dans les Réglages, et les
trois boutons de mode portent un état sélectionné explicite. Ensuite **la part
théorique de chacun**, avec son pourcentage, dans le dépliant « Voir le détail »
du bilan. Enfin **ce que chacun a réellement avancé**, deux lignes cliquables du
même dépliant qui ouvrent le détail des dépenses de cette personne
(`public/js/modules/detail-depenses.js`).

Une charge dont la répartition diverge du mode du foyer porte une étiquette dans
la liste (« 50/50 » ou « 70/30 »). Sans elle, deux lignes au même montant
produisent deux effets différents sur le solde sans qu'on puisse le voir.

Le mode et les pourcentages sont **figés par mois** : un mois clos garde la
répartition sous laquelle il a été soldé, même si le foyer change de mode
ensuite. L'interface ne l'annonce pas explicitement aujourd'hui ; c'est un
comportement de calcul, mentionné ici parce qu'il explique qu'un mois passé ne
change pas quand on modifie les réglages.

### Charge, enveloppe, cagnotte : trois objets distincts

Une **charge** est une dépense : un montant, une date, un payeur, une catégorie.
Elle pèse sur le solde. Les charges **fixes** sont reconduites d'un mois sur
l'autre ; les **variables** ne le sont pas. La distinction structure la
reconduction, le coût annuel et le prévisionnel : les deux listes doivent rester
visuellement séparées et nommées, et chacune de leurs zones vides explique ce
qu'elle attend (`public/js/modules/fixed-charges.js`,
`variable-charges.js`).

Une **enveloppe** est une étiquette transversale — des vacances, un chantier —
qui traverse catégories et mois. Elle ne modifie **jamais** le solde, ni le
montant, ni le payeur, ni la répartition d'une charge
(`public/js/utils/enveloppes.js`). Une enveloppe rattachée apparaît comme une
pastille sur la ligne de charge. Si cette distinction se perd visuellement — si
une enveloppe se met à ressembler à une dépense ou à un compte —, l'application
donne l'impression de compter deux fois le même argent.

Deux natures d'enveloppe, et leur jauge se lit dans des sens opposés. Une
enveloppe **mensuelle** est un budget : elle se recharge le 1er, sa jauge
descend d'une allocation vers zéro, et le reliquat est une information. Une
**cagnotte** ne se recharge pas, traverse les mois, sa jauge monte vers un
objectif, et son contenu est de l'argent réel — alimenté par des versements
(`public/js/utils/versements.js`). En dépassement, la jauge se rend pleine et
rouge plutôt que de s'effacer : une barre vide se lit « pas de données », pas
« vous avez dépassé ».

### Les états qui changent le sens d'une ligne

**Périmètre commun ou solo.** Une charge « perso » n'entre dans aucun calcul de
solde. Elle porte l'étiquette « perso » dans la liste
(`public/js/utils/perimetre.js`). Sans marquage visible, deux lignes identiques
ont des effets opposés sur le solde.

**Charge fixe ponctuelle.** Une charge fixe non récurrente porte l'étiquette
« ponctuelle » : elle n'est pas reconduite le mois suivant et n'est comptée
qu'une fois dans le coût annuel.

**Enveloppe ouverte ou close.** Une enveloppe close reste consultable mais
n'est plus proposée à la saisie ; elle porte la mention « close » dans la liste
de gestion (`public/js/modules/envelopes.js`).

**Mois révolu, en cours, ou à venir.** Le sélecteur propose un mois d'avance, où
la reconduction a déjà pu inscrire les charges fixes. Le titre du bilan est
formulé selon cet état — « Ensemble en juillet 2026 » pour un mois révolu,
« Déjà engagé pour septembre 2026 » pour un mois à venir
(`public/js/utils/date.js`, fonction `etatDuMois`). Plusieurs indicateurs se
taisent sur un mois non révolu, à dessein : qualifier un mois qui n'a pas
commencé produit des phrases fausses.

**Remboursement.** Il porte un sens (qui rembourse qui), une date, et se corrige
en le rouvrant. Il n'y a pas d'état « en attente » : un remboursement saisi est
un remboursement effectué, et il déplace le solde.

### Le solde

Il se lit à deux endroits, et jamais recalculé deux fois. Dans le **bilan**,
sous le total commun : le montant à rééquilibrer et le sens (« X doit à Y »),
suivi d'une explication courte et du bouton « Régler ce solde ». Et dans une
**barre collante** (`#balanceBar`), qui reprend le relais dès que le solde du
bilan sort de l'écran — elle se tait tant que le bilan dit la même chose, avec
une hystérésis pour ne pas scintiller (`public/js/utils/barre-solde.js`).

Le solde agrège : les charges communes du mois (fixes et variables, hors solo),
réparties selon le mode du mois ; les paiements réellement avancés par chacun ;
les remboursements du mois ; et, si le report est activé, le solde des mois
précédents.

Il doit rester atteignable depuis le panneau Charges, où l'on corrige — c'est le
rôle exact de la barre collante. Si la barre disparaît d'une refonte, corriger
une charge et vérifier son effet redevient un aller-retour à l'aveugle. Et le
solde est rendu **sans condition, y compris à zéro** (« Comptes équilibrés ») :
la barre collante s'efface sur la seule géométrie du bloc de solde du bilan, donc
un bilan qui cesserait d'afficher le solde dans un cas le ferait disparaître de
tout l'écran.

### L'espace privé

Distinct du périmètre « perso ». Une dépense privée est écrite dans un espace que
seul son propriétaire lit — la garantie vient du serveur, pas de l'interface
(`public/js/utils/confidentialite.js`, `database.rules.json`). Ce qui franchit
le mur, c'est un **total**, jamais le détail, et l'écran dit en toutes lettres
que ce total est déclaratif. Sur le bilan, les montants privés sont **absents**
tant qu'on n'a pas appuyé sur « Afficher » : ils ne sont pas floutés, ils ne sont
pas chargés (`public/js/modules/resume-prive.js`). Le caviardage a une largeur
fixe, pour qu'un ordre de grandeur ne transparaisse pas.

### Hors ligne

L'application fonctionne sans réseau : la page est servie par le service worker,
les lectures sont servies par un miroir local, et les écritures sont mises en
file et rejouées à la reconnexion (`public/js/utils/miroir.js`,
`public/js/db.js`).

L'interface doit le dire, sans quoi un mois vide parce qu'illisible ressemble
trait pour trait à un mois vide parce que sans dépenses. Un bandeau
(`#offlineBanner`) annonce l'état, **compte les saisies en attente**, nomme la
cause probable quand elle est établie (bouclier de navigateur, jeton expiré,
liaison coupée), et propose un bouton « Réessayer »
(`public/js/utils/connection-banner.js`). Il n'apparaît qu'au bout de quelques
secondes, pour ne pas clignoter à chaque ouverture.

Trois gestes sont **refusés** hors ligne, avec leur motif affiché plutôt qu'une
fausse réussite : régler le solde, restaurer une sauvegarde, et déclarer un
abonnement en charge fixe. Les écritures privées échouent franchement au lieu
d'être mises en file, pour ne rien laisser en clair sur l'appareil. Une saisie
définitivement refusée par le serveur est annoncée : sans ce message, elle reste
affichée par le miroir et paraît enregistrée.

---

## 3. Ce qui borne une refonte visuelle

### Largeurs réellement supportées

Le plancher testé est **320 px** : `tests/e2e/coherence-visuelle.spec.js` rejoue
quatre propriétés (aucune commande n'en recouvre une autre, rien ne dépasse
latéralement, aucun texte ne déborde, la fin de chaque panneau reste
atteignable) à 320, 390, 768 et 1280 px, sur les trois onglets. **390 px** est la
largeur de référence de la plupart des autres suites.

Quatre régimes de mise en page, tous tenus par des tests
(`public/css/responsive.css`, `tests/e2e/vues.spec.js`) : en dessous de 900 px,
un panneau à la fois avec la barre d'onglets ; entre 900 et 1600 px, deux
colonnes avec les réglages sous le bilan ; au-delà de 1600 px, trois colonnes
côte à côte ; au-delà de 2000 px, une largeur utile qui suit la fenêtre jusqu'à
un plafond. Les tests mesurent des positions et des largeurs exactes : changer un
seuil ou l'ordre des colonnes fait tomber ces contrôles.

Un point de rupture secondaire à 600 px change la densité des listes.

### Thèmes

Deux thèmes, **tous deux obligatoires** : clair par défaut, sombre appliqué
automatiquement selon la préférence système (`@media (prefers-color-scheme:
dark)` dans `public/css/variables.css`). Il n'existe **aucune bascule manuelle**
et aucun attribut de thème sur la racine : le thème sombre n'est pas optionnel,
c'est l'autre moitié de la même feuille. Toute couleur ajoutée doit être définie
dans les deux blocs.

Une cinquantaine de jetons dans `variables.css`, redéfinis pour partie dans le
bloc sombre : couleurs de texte à trois paliers (principal, secondaire, discret), surfaces (fond, carte, surface
élevée), lavis sémantiques déclinés dans les deux thèmes, et des jetons d'encre
séparés (`--success-ink`, `--warning-ink`, `--danger-ink`) parce qu'une couleur
de pastille appliquée à du texte est illisible. Aucune valeur de couleur en dur
ailleurs que dans ce fichier.

### Contraste

Le seuil appliqué dans le code est **4,5:1** pour le texte courant et **3:1**
pour le grand texte, c'est-à-dire le seuil WCAG AA
(`tests/contraste.test.js`, `tests/e2e/lisibilite.spec.js`). Un seuil de 4,60
n'apparaît nulle part dans le dépôt : **non déterminable depuis le code**. Si un
seuil plus exigeant a été décidé récemment, il n'a pas encore été inscrit dans
les tests.

Deux niveaux de vérification, et les deux doivent passer. `tests/contraste.test.js`
mesure les **jetons** à la source, dans les deux thèmes, sur les trois surfaces.
`tests/e2e/lisibilite.spec.js` mesure le **rendu réel** sur les trois panneaux,
parce qu'un jeton conforme appliqué au mauvais endroit reste illisible. Le palier
« discret » doit rester distinct du palier « secondaire » : un test interdit
d'aligner les deux pour régler un problème de contraste.

### Ce que les suites visuelles interdisent de fait

Les contrôles de bout en bout comptent plus de 550 cas déclarés, dont environ une
centaine touchent à la géométrie ou à la lisibilité — certains rejoués à
plusieurs largeurs. Concrètement, ils rendent
impossibles les mises en page suivantes.

Toute cible tactile visible doit atteindre 44 × 44 px, et davantage sur pointeur
grossier (`tests/e2e/mobile.spec.js`). Deux commandes ne peuvent pas se
recouvrir dans le flux — les barres fixes en sont explicitement exclues. La page
ne doit jamais défiler latéralement, à aucune des quatre largeurs. La fin de
chaque panneau doit rester atteignable : la barre d'onglets et le bouton flottant
sont fixes, la réserve d'espace au bas de chaque panneau ne peut pas être
supprimée. Un champ mis au point doit rester visible malgré le clavier virtuel.
La barre de solde doit apparaître au défilement là où elle sert, et ne pas
osciller. Le formulaire d'une modale doit tenir sans que son bouton de validation
tombe hors d'écran : la barre d'action des modales est collée au bas de la
modale, et un test le vérifie.

Les états vides sont testés eux aussi : les outils d'analyse ne doivent pas être
proposés quand il n'y a rien à analyser, les outils de création doivent l'être,
et chaque liste vide doit expliquer ce qu'elle attend, explication qui disparaît
à la première donnée.

Enfin, le geste « retour » du système referme la dernière couche ouverte —
modale, onglet — au lieu de quitter l'application (`public/js/utils/retour.js`).
Toute couche nouvelle doit s'inscrire dans cette pile.

### Ce qui n'est pas refondable sans toucher au JS

C'est le point le plus structurant : **le HTML statique ne contient presque aucun
écran complet**. `public/FairSplit.html` porte l'ossature — en-tête, sélecteur de
mois, conteneur de barre de solde, les trois panneaux et leurs cartes vides, la
barre d'onglets, et huit modales (charge variable, charge fixe, remboursement,
saisie rapide, confirmation, corbeille, sauvegarde, budgets). Tout le reste est
produit par des gabarits de chaînes en JavaScript.

Sont rendus intégralement en JS, donc non modifiables depuis le CSS ou le HTML
seuls : le bilan entier (`modules/summary.js`), les lignes des trois listes de
charges (`variable-charges.js`, `fixed-charges.js`, `reimbursements.js`), les
budgets par catégorie, les tendances (dessinées dans un canevas), les enveloppes
et leur écran de gestion (`envelopes.js`), les modales détail des dépenses,
rapport du mois, espace privé, import CSV, gestion des catégories et
destinations.

Quatre contraintes techniques s'y ajoutent.

Aucun script inline n'est autorisé par la politique de sécurité de la page — les
styles inline, eux, le sont. Les polices sont auto-hébergées et `font-src` est
limité à l'application : **aucune police externe ne peut être ajoutée** sans
modifier la politique dans deux fichiers.

Tout élément interactif passe par une **liste blanche d'actions** dans
`public/js/init.js` : un bouton porte un attribut `data-action` dont le nom doit
figurer dans cette liste, sinon il est inerte, silencieusement. Un test compare la
liste au balisage dans les deux sens : ajouter un bouton sans déclarer son action
fait échouer la CI, et laisser une action déclarée sans bouton aussi.

Le nombre de sites d'injection HTML est **plafonné, et le plafond est atteint
sans marge** (`tests/plafond-innerhtml.test.js`) : ajouter un gabarit
`innerHTML` supplémentaire fait échouer la CI tant que le plafond n'est pas
relevé avec justification. Tout contenu dynamique doit passer par la fonction
d'échappement.

Le service worker précache une liste explicite de fichiers CSS et JS
(`public/sw.js`), comparée au disque par un test : **ajouter, renommer ou
supprimer une feuille de style oblige à mettre cette liste à jour**.

Enfin, trois modules lisent la structure du DOM et cassent si elle change :
`onglets.js` attend des éléments portant la classe `panneau` et des boutons
portant `data-panneau` ; `entete.js` observe l'en-tête lui-même pour compacter la
page au défilement ; `barre-solde.js` observe le bloc de solde du bilan pour
décider d'afficher la barre collante. Le sélecteur de mois et la barre de solde
vivent par ailleurs dans un unique conteneur collant, et l'empilement des deux en
dépend. Les sections portent des titres liés par
`aria-labelledby`, les bandeaux et les messages portent des rôles de région
vivante, et les groupes de boutons de la saisie rapide portent un état pressé —
tout cela est vérifié par `tests/balisage-accessible.test.js` et
`tests/actions-atteignables.test.js`.
