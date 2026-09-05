# CLAUDE.md — FairSplit PWA

App web PWA de partage de charges en couple au prorata des salaires. Synchronisation temps réel Firebase, auth Google/Email, espace de données unique partagé par les comptes autorisés.

> **Version** : 4.0.0 | **Mise à jour** : 2026-09-04 | **Branche unique** : main

## Stack

- HTML5 sémantique, CSS3 (variables, responsive mobile-first)
- JavaScript ES6 Modules (import/export, async/await)
- Firebase Realtime Database (compat SDK 10.14.1), Firebase Auth
- Leaflet.js (carte), PWA (Service Worker, manifest)
- Tests : Vitest (unitaires), Playwright (E2E)

## Architecture

```text
FairSplit/
├── public/                     # Tout ce qui est publié — et rien d'autre
│   ├── FairSplit.html          # Point d'entrée HTML — aucun JS inline
│   ├── index.html              # Redirection
│   ├── sw.js  manifest.json  icon-*.png
│   ├── fonts/                  # DM Sans + JetBrains Mono, auto-hébergées :
│   │                           # c'est ce qui rend `font-src 'self'` tenable
│   ├── css/
│   │   ├── variables.css       # Tokens design (couleurs, espacements)
│   │   ├── base.css            # Reset, typographie, header
│   │   ├── components.css      # Boutons, cards, formulaires, charges, FAB, toasts
│   │   ├── modals.css          # Modales + quick-add
│   │   ├── auth.css            # Écran authentification
│   │   ├── summary.css         # Bilan, catégories, tendances
│   │   ├── map.css             # Carte Leaflet
│   │   ├── onglets.css         # Barre d'onglets, panneaux, en-tête compact,
│   │   │                       # rangées d'outils
│   │   └── responsive.css      # Media queries + print
│   └── js/
│       ├── app.js              # Entry point — init Firebase, auth, modules
│       ├── anti-cadre.js       # Script CLASSIQUE, en tête de <head>, avant la
│       │                       # première feuille : la page se vide si elle est
│       │                       # encadrée. Fichier externe, pour se passer
│       │                       # d'`unsafe-inline` — ne pas l'y remettre
│       ├── init.js             # Délégation `data-action` — liste blanche de
│       │                       # 43 actions, tenue au balisage dans les deux sens
│       ├── config.js           # Firebase config, DATA_ROOT, liste blanche
│       ├── firebase-init.js    # Init Firebase, providers, émulateurs
│       ├── db.js               # Abstraction DB (préfixage DATA_ROOT) + les
│       │                       # quatre accès absolus du détail privé
│       ├── state.js            # État global (lecture/écriture, sans abonnés)
│       ├── components/         # modal.js, toast.js
│       ├── modules/            # 30 modules fonctionnels — dont trash (rétablir
│       │                       # ce qui a été supprimé en douceur, sur tout
│       │                       # l'historique), selection-charges (agir sur
│       │                       # plusieurs charges à la fois),
│       │                       # versement-mensuel (la cagnotte qu'on alimente
│       │                       # sans y penser), resume-prive (ce que l'autre
│       │                       # voit d'un espace privé : un total, jamais le
│       │                       # détail)
│       └── utils/              # 65 aides pures — dont onglets (quel panneau
│                               # l'écran montre, sous 900 px), entete (l'en-tête
│                               # se compacte une fois sorti de l'écran),
│                               # provisions (ce qu'il faut mettre de côté chaque
│                               # mois pour tenir une échéance),
│                               # recherche-historique (chercher au-delà du mois
│                               # affiché), import-csv (lire un fichier de
│                               # charges, sans jamais deviner le payeur),
│                               # miroir (ce que l'appareil
│                               # garde hors réseau : dernière valeur lue de
│                               # chaque chemin, file des écritures à rejouer),
│                               # montant (lecture d'une
│                               # saisie), lieu (géocodage), categorie-lieu
│                               # (catégorie déduite du lieu), perimetre (ce qui
│                               # pèse sur le solde et ce qui n'y pèse pas),
│                               # categories-frequentes, auth-errors,
│                               # enveloppes (regroupements transversaux),
│                               # versements (ce qu'on met dans une cagnotte),
│                               # confidentialite (écrire chez soi ne demande
│                               # rien, lire chez l'autre demande son accord ;
│                               # et le seul chiffre
│                               # qui franchit le mur),
│                               # recherche-lieu (chercher un lieu par son nom),
│                               # tri (ordre d'affichage des listes),
│                               # identifiant (fabrique d'identifiants, partagée
│                               # par catégories, destinations et enveloppes),
│                               # recherche-texte (chercher sans les accents),
│                               # repartition (la façon d'écrire une
│                               # répartition dérogatoire — une seule, pour les
│                               # deux listes ET le récap des virements),
│                               # ecouteur (un écouteur posé une seule fois),
│                               # periodes (les mois que le sélecteur propose),
│                               # renommage (renommer sans détacher les charges),
│                               # tendances (ce que six mois de dépenses disent,
│                               # et ce que coûte « un mois ordinaire » — la
│                               # fabrique unique que le bilan, le rapport et le
│                               # panneau lisent tous les trois),
│                               # raccourci (ce que l'URL demande à l'ouverture),
│                               # attente-application (attendre d'avoir de quoi
│                               # écrire), previsionnel (ce qui reste à passer
│                               # ce mois-ci), rapport-mensuel (le mois écoulé
│                               # en une page — ne calcule aucun chiffre neuf,
│                               # il compose ceux du bilan et des tendances),
│                               # totaux-liste (le total d'une liste de charges,
│                               # lu par le rendu ET par la recherche — c'est
│                               # elle qui affichait un chiffre faux),
│                               # echelle (des graduations qu'un humain lit),
│                               # budget-propose (ce que coûte un mois
│                               # ordinaire, proposé plutôt que demandé),
│                               # retour (le geste « retour » referme la
│                               # dernière couche ouverte, il ne quitte pas),
│                               # versement-mensuel (une seule fois par mois, et
│                               # jamais un autre mois que le mois courant),
│                               # versement-partage (ce que chacun met dans un
│                               # versement à deux), selection-lot (ce qu'un lot
│                               # retient encore : un identifiant coché peut ne
│                               # plus désigner personne), correction-retroactive
│                               # (ce qu'une correction change aux mois déjà
│                               # soldés), explication-solde (pourquoi le solde
│                               # dit ce qu'il dit), phrase-saisie (la phrase que
│                               # le formulaire rend), sandbox-banner (le repère
│                               # du bac à sable), debug (journaliser sans
│                               # jamais rien publier),
│                               # calculations, format, validation, salaries
├── tests/                      # Vitest (unitaires) + Playwright (E2E)
├── tools/                      # 8 outils, hors `public/` donc jamais publiés :
│                               # adherences.mjs (les dépendants d'un module,
│                               # imports dynamiques compris),
│                               # plafond-innerhtml.mjs (le plafond des sites
│                               # d'injection, joué par la CI),
│                               # regles-restrictives.mjs,
│                               # charges-mal-rangees.mjs (relève les charges
│                               # rangées dans un autre mois que leur date, sur
│                               # une sauvegarde, sans rien modifier),
│                               # fusionner-couverture.mjs + couverture-lignes.mjs
│                               # (la couverture réelle, E2E comprise),
│                               # enveloppe-sauvegarde.mjs,
│                               # migration-repartition.mjs, generer-icones.mjs
│                               # + logo-fairsplit.svg (la marque)
├── docs/                       # Dépannage, déploiement, aide-mémoire Git
└── database.rules.json         # Règles de sécurité — source de vérité unique
```

Le déploiement publie `public/` et rien d'autre. Ne jamais placer à la racine
un fichier destiné à être servi, ni dans `public/` un fichier qui ne doit pas
l'être.

## Adhérences critiques

Avant de modifier un module très importé, compter ses dépendants :
`node tools/adherences.mjs MODULE` — il résout les spécificateurs relatifs et
compte **les deux formes d'import**. Sans argument, il rend le classement complet.

> **Un `grep` ne suffit pas, et c'est mesuré.** La version précédente de cette
> section prescrivait `grep -rl "from '.*MODULE_NAME" js/`. Elle échouait deux
> fois : le dossier `js/` n'existe pas — c'est `public/js/` —, donc la commande
> rendait une erreur plutôt qu'une liste ; et `from '…'` ne voit que les imports
> **statiques**. Sur `db.js`, 22 des 25 dépendants passent par `import()`
> dynamique : la garde en montrait 3 sur 25. Les chiffres du tableau, tenus à la
> main, avaient dérivé dans le sens dangereux — 13 annoncés pour `toast.js` là
> où il y en a 26.

Le tableau retient **tout module à 13 dépendants ou plus**, plus les deux points
de passage que leur seul compte ne décrit pas. Le seuil est explicite pour que
la liste se refasse à l'identique plutôt que de dériver par ajouts successifs.

| Module | Dépendants | dont dynamiques | Risque |
|---|---|---|---|
| `utils/debug.js` | 35 | 0 | Critique — le plus importé du dépôt |
| `state.js` | 31 | 1 | Critique — état global |
| `utils/format.js` | 27 | 0 | Critique — affichage monétaire |
| `components/toast.js` | 26 | 0 | Critique — feedback utilisateur partout |
| `db.js` | 25 | **22** | Critique — abstraction DB |
| `utils/date.js` | 24 | 0 | Important — date et période d'une charge |
| `utils/montant.js` | 18 | 0 | Important — lecture d'une saisie |
| `utils/members.js` | 17 | 0 | Important — qui doit à qui |
| `utils/perimetre.js` | 17 | 0 | Important — ce qui pèse sur le solde |
| `config.js` | 14 | 0 | Critique — `DATA_ROOT`, liste blanche |
| `components/modal.js` | 13 | 2 | Important — piège à focus, confirmations |
| `modules/summary.js` | 13 | 5 | Important — calculs dépendants |
| `firebase-init.js` | 6 | 3 | Critique — connexion DB |
| `modules/auth.js` | 1 | 0 | Critique — **hub** : importe 28 modules et en initialise 26 |

`auth.js` est le cas inverse des autres : presque personne ne l'importe, il
importe presque tout. Le compter par ses dépendants ne dit rien de son risque.

## Conventions

### CSS
- Tokens dans `public/css/variables.css` via `var(--xxx)`, jamais de valeurs en dur ailleurs
- Mobile-first. **Rupture principale : 900 px** — sous 899 px, les trois panneaux
  deviennent trois onglets (`onglets.css:38` et `:225`) ; au-delà, ils sont trois
  colonnes simultanées et la barre d'onglets disparaît (`responsive.css:222`).
  C'est le même balisage des deux côtés.
- Ruptures secondaires : 600 px (densité des listes — `responsive.css:72`,
  `summary.css:611`), 1600 px et 2000 px (largeur maximale), `pointer: coarse`
  (agrandit les cibles tactiles sur un vrai doigt)
- Classes en kebab-case

### JavaScript
- ES6 modules partout, pas de globals sauf compat legacy (`window.xxx`)
- State centralisé : `getState('key')` / `setState('key', value)` via `state.js`
  (lecture/écriture seules : le registre d'abonnés n'a jamais eu d'abonné et a
  été retiré — chaque module appelle son rendu après avoir écrit)
- DB via `db.js` : `dbGet`, `dbSet`, `dbPush`, `dbUpdate` (chemins auto-préfixés par `DATA_ROOT` : `household/`, ou `sandbox/` avec `?sandbox=1`)
- **Et quatre accès absolus** — `dbGetAbsolu`, `dbSetAbsolu`, `dbUpdateAbsolu`,
  `dbPushAbsolu` — réservés au détail privé, qui vit hors de `household/`. Ils ne
  préfixent pas, **et ne passent ni par le miroir ni par la file hors ligne** :
  hors réseau une écriture privée échoue franchement plutôt que d'atterrir dans
  `localStorage`, sur une origine que Pages partage entre tous les dépôts du
  compte. La confidentialité vaut mieux qu'une saisie différée
- Async/await + try/catch sur tous les appels Firebase
- `escapeHtml()` obligatoire pour tout contenu dynamique injecté en HTML
- Toast pour feedback : `toast.success()`, `toast.error()`

### Nommage
- Fichiers JS : kebab-case (`variable-charges.js`)
- Fonctions : camelCase (`loadVariableCharges`)
- Constantes : UPPER_SNAKE (`MAX_SALARY`)
- Classes CSS : kebab-case (`.charge-item`)

### Git
- Commits français, avec portée facultative : `fix(versements) : …`. Types
  employés, par fréquence réelle : `fix:` `feat:` `docs:` `chore:` `test:`
  `refactor:` `perf:` — plus `design:` pour les lots de maquette. Le dépôt est
  partagé entre `type:` et `type :` (espace avant deux-points, typographie
  française) : les deux se lisent, aucune n'est imposée rétroactivement
- main = branche unique et déployée. Travailler sur des branches courtes `fix/…` `feat/…`, puis PR vers main.
- Un seul projet Firebase (fairsplit-foyer). Pour développer isolé : `npm run emulators` puis `FairSplit.html?emulator=1`

## Commandes

- `npx vitest run` — tests unitaires
- `npm run couverture` — couverture réelle, unitaires **et** bout en bout réunis
  (les deux suites, puis fusion ; `coverage-fusionnee/lignes.json` liste, par
  fichier, les lignes que personne n'exécute)
- `npx vitest --watch` — tests mode watch
- `npx playwright test` — tests E2E
- `npm run test:all` — tout (vitest + playwright)
- `npm run emulators` — Firebase emulators
- `npm run deploy:hosting` — deploy Firebase Hosting (optionnel ; la prod est GitHub Pages)
- `npm run serve` puis http://localhost:3333 — dev local
- `node tools/adherences.mjs MODULE` — les dépendants d'un module, imports
  dynamiques compris (cf. *Adhérences critiques*)

### Avant de pousser : les deux contrôles de lint de la CI

La CI en lance **deux**, et il faut rejouer **les deux, verbatim** :

```bash
npx eslint .                                                   # 0 erreur exigée
npx eslint public/js --format json | node tools/plafond-innerhtml.mjs
```

- **`npx eslint .`** — la CI l'exécute avec `--quiet`, qui n'affiche que les
  erreurs. Le jouer **sans** `--quiet` montre aussi les avertissements ; c'est
  la forme utile en local. Il couvre **tout le dépôt**, `tests/` compris.
- **`node tools/plafond-innerhtml.mjs`** — le plafond des sites d'injection,
  aujourd'hui **24 sur 24, marge nulle** et c'est voulu : tout `innerHTML`
  supplémentaire fait échouer la CI tant qu'il n'a pas été relu. Le plafond ne
  compte que `no-unsanitized/*`, jamais les autres règles.

> **Deux fois consignées, deux fois payées.** Vérifier avec `npx eslint public/js`
> — le dossier dont ce fichier parle — laisse passer tout ce qui vit dans
> `tests/` : c'est ainsi que la CI est passée au rouge le 2026-08-31, sur des
> séparateurs de milliers écrits en clair dans deux specs neuves. Un
> sous-ensemble choisi par le correcteur ne mesure que ce qu'il a prévu de
> casser. La règle vaut pour les suites de tests comme pour les commandes de la
> CI, et la seule façon de la tenir est de les rejouer toutes.

## Contraintes

- NE PAS modifier `state.js`, `toast.js`, `firebase-init.js`, `db.js` sans vérifier tous les imports
- NE PAS ajouter de JS dans `public/FairSplit.html` — tout dans les modules
- NE PAS utiliser `innerHTML` avec données utilisateur non échappées (XSS)
- NE PAS stocker credentials, tokens ou PII dans le code/logs
- NE JAMAIS supprimer de données Firebase sans soft-delete (`deleted: true`)
- NE JAMAIS mettre `.read: true` ou `.write: true` sur données utilisateur dans Firebase rules
- TOUJOURS utiliser `db.js` pour accéder Firebase (préfixage `DATA_ROOT` automatique)
- TOUJOURS écrire un test pour toute nouvelle fonction pure dans `utils/`
- TOUJOURS tester les dépendants après modif d'un module critique

## Workflow

1. Lire les fichiers concernés avant de modifier
2. Vérifier les adhérences si module critique : `node tools/adherences.mjs MODULE`
3. Proposer un plan (3-5 lignes) avant d'implémenter
4. Implémenter avec escapeHtml pour contenu dynamique
5. Vérifier : `npx vitest run` passe — **la suite entière, jamais un sous-ensemble
   choisi pour l'occasion**
6. Vérifier : les **deux** commandes de lint de la CI (cf. *Commandes*)

## Design

Secteur : finance personnelle / couple. Émotion : confiance, clarté, simplicité.

Principes UX :
- Le BILAN doit être la première section visible après la période
- **La tête du bilan porte le fait SYMÉTRIQUE** — « Ensemble ce mois : 1 717,39 € » —
  et l'écart vient entier juste en dessous, sans condition, zéro compris. Le mois
  est nommé selon son état (`etatDuMois`) : « Ensemble en juillet 2026 » pour un
  mois révolu, « Déjà engagé pour septembre 2026 » pour un mois à venir.
  « Doit » garde sa place là où c'est le mot juste : au moment de régler, et sur
  la barre collante. Le raisonnement est dans `summary.js:765`
- Cibles tactiles minimum 44×44px
- Contrastes WCAG AA (4.5:1 texte, 3:1 grand texte), **mesurés sur le RENDU** et
  pas seulement sur les jetons : `tests/contraste.test.js` tient les jetons,
  `tests/e2e/lisibilite.spec.js` tient les couples encre/fond réellement peints
- Mobile-first, whitespace généreux

> **Ce que cette section disait avant, et pourquoi c'est retiré.** Elle
> prescrivait « Solde net en gros texte ("Conjointe vous doit X €") avant le
> détail ». Le journal du 2026-08-31 a retiré ce cadrage — une application de
> couple qui ouvre sur une créance transforme une organisation commune en
> comptabilité entre deux parties, et c'est celui des deux qui doit qui le lit
> chaque jour. Le principe est resté écrit ici quatre jours de plus que dans le
> code : une consigne périmée en tête de fichier pèse plus lourd qu'un journal
> exact, parce que c'est elle qu'on applique.

## Les cinq règles

Cinq motifs ont été payés entre 3 et 9 fois chacun. Le journal en racontait
23 000 caractères de récits — et **le récit n'a jamais empêché la récidive** :
chaque entrée numérotait sa propre occurrence, donc le motif était identifié dès
la deuxième et on a recommencé quand même. Le compte est ce qui donne son poids
à la règle ; les récits sont ce qui la noie. Ils sont dans `journal-archive.md`.

Chaque règle porte **ce qui la reconnaît** — un récit se lit, un test de
reconnaissance se pose avant d'écrire.

**« Détail en archive » veut dire `journal-archive.md`, et chaque compte s'y
refait** — un compte sans son détail accessible serait une affirmation
invérifiable, ce que la règle 5 interdit :

```bash
grep -c "ne mesure rien" journal-archive.md                              # 10 → règle 1
grep -oE "[A-Za-zéè]+ occurrences? du défaut" journal-archive.md | wc -l  # 8 → règle 2
grep -cE "port taken|reporter=basic|tail -45" journal-archive.md          #  3 → règle 3
grep -cE "copie ne se dégrade|mot pour mot" journal-archive.md            #  4 → règle 4
grep -cE "RÉFUT|réfutée|hypothèse .{0,25}FAUSSE" journal-archive.md       #  6 → règle 5
```

Ces commandes comptent des **mentions** ; les titres annoncent des **sites**. Trois
écarts en découlent, dits plutôt que maquillés — affiner un `grep` pour qu'il rende
le chiffre annoncé serait fabriquer la preuve après coup, ce que la règle 5
interdit :

- **règle 1** — 10 mentions pour **9** sites : la dixième est l'énoncé de la règle
  elle-même, ajouté au journal le 2026-09-05 ;
- **règle 3** — 3 formes dans l'archive pour **4** recensées, la quatrième étant
  née le 2026-09-05 dans le texte de la règle (voir ci-dessous) ;
- **règle 5** — 6 mentions pour **5** réfutations distinctes : un titre de section
  et un rappel de la première.

> **La cinquième gouverne les quatre autres.** Elles sont un même geste : exiger
> qu'une chose puisse être fausse, puis vérifier qu'elle ne l'est pas. Les quatre
> premières l'appliquent au **code**, la cinquième au **raisonnement** — on lit
> une famille, pas cinq consignes indépendantes. Le même principe, à quatre
> endroits :
>
> - **le rouge avant le correctif** : un correctif dont le contrôle n'a jamais
>   été rouge n'explique rien, il **coïncide** ;
> - **le mutant** (règle 1) : un contrôle qui ne peut pas tomber ne prouve rien,
>   il **accompagne** ;
> - **le témoin positif** (règles 1 et 2) : une propriété que le vide satisfait
>   ne mesure rien, elle **s'auto-confirme** — et un jeu d'essai plat ne peut
>   séparer aucune divergence ;
> - **le tuyau** (règle 3) : ce qui aurait pu vous contredire doit **survivre à
>   la commande qui l'observe**.
>
> C'est la cinquième qu'il faut tenir le jour où aucune des quatre ne s'applique.

### 1. Un contrôle qui ne mesure rien est pire qu'un contrôle absent

**9 sites recensés, 18 récits — détail en archive.** Le plus cher de ce dépôt.

Un contrôle absent se voit. Un contrôle vert qui ne mesure rien **éteint la
vigilance** sur la surface qu'il prétend tenir : on cesse de la regarder en
croyant l'avoir couverte.

**Ce qui la reconnaît** — poser à tout contrôle vert : *qu'est-ce qui le rendrait
rouge ?* Trois réponses le condamnent :

- « rien » — l'assertion est satisfaite par une valeur **neutre** qu'un échec
  produit aussi : `toEqual([])`, `toBe(false)`, `''`, `null`, un compte de zéro.
  Le relevé vide d'une navigation qui n'a pas eu lieu se lit exactement comme le
  relevé vide d'une page saine ;
- « il n'a jamais tourné sur cette surface » — la navigation a échoué en silence,
  le sélecteur ne correspond plus, le jeu d'essai ne porte pas le cas ;
- « il lit la source, pas l'effet » — une garde qui vérifie qu'un fichier
  *contient* un nom survit à la suppression du bloc qui s'en sert, et ne survit
  pas à son renommage.

**Ce qu'elle exige** — tout contrôle neuf porte son **témoin** : un mutant qui le
fait tomber, ou, quand l'assertion peut être satisfaite trivialement, un témoin
**positif** exigeant que les données mesurées soient non dégénérées. Un contrôle
dont le titre est une égalité doit tomber si l'égalité cesse.

**Corollaire, payé deux fois.** Un bouchon qui rend une valeur neutre ne mesure
pas le câblage, il le **masque** : `'' + ''` se lit comme `''`, et une étiquette
rendue deux fois y devient invisible. Quand ce qu'on tient est un rendu, le
double doit produire du balisage qu'on puisse compter.

### 2. Deux fabriques d'une même grandeur finissent toujours par diverger

**8 avérées, 2 évitées parce que le motif était nommé — détail en archive.** Dite
« le défaut `normalizePair` », du nom de la première. Les deux évitées sont la
meilleure preuve que la règle sert : elle a déjà payé, pas seulement coûté.

Le symptôme n'est jamais un plantage : c'est **le même nombre, affiché
différemment à deux endroits de l'application**, le même jour, pour le même mois.
950 € sur le bilan et 1 000 € dans la modale à un bouton de distance. Et c'est le
chiffre juste qu'on met en doute.

**Ce qui la reconnaît** — ce n'est pas de la duplication de code, et chercher du
code dupliqué ne la trouve pas. C'est **une grandeur** — un total, une médiane,
une part, une fenêtre de mois, un libellé de règle — calculée à deux endroits. Le
second calcul paraît toujours plus simple sur le moment : « ce serait plus simple
de le réadditionner ici ».

**Ce qu'elle exige** — une seule fabrique, exportée, lue par toutes les surfaces ;
et un test qui exige l'égalité des deux lectures. **Le jeu d'essai de ce test
doit pouvoir les séparer** : sur une série plate, une médiane sur cinq mois et
une médiane sur six rendent le même nombre, et c'est très exactement pour cela
que la divergence a vécu si longtemps sans qu'un contrôle bronche.

**Et la règle vaut hors du monétaire** — la septième occurrence portait sur des
messages d'erreur : deux fonctions rédigeaient chacune les leurs, et celle qui
courait le plus ne disait pas qu'une saisie était refusée.

### 3. On croit avoir mesuré, on n'a rien mesuré

**4 formes recensées — détail en archive.** Un jar d'émulateur qui garde son
port, un `--reporter=basic` qui n'existe pas, un `| tail -45` qui coupe le
rapport — et un `--reporter=line` prescrit par cette règle même, qui n'existe pas
davantage sous Vitest. **Aucune n'est la même commande, et deux n'impliquent
aucun tuyau** : nommer la règle par son déguisement le plus récent, c'est se
préparer à ne pas reconnaître la suivante. La quatrième est arrivée le jour où
la règle a été écrite, dans le texte de la règle.

**Ce qui la reconnaît** — le symptôme n'est **jamais un test rouge**. C'est une
suite qui ne tourne pas, ou qui tourne et dont on ne lit pas le verdict. Le
chiffre qu'on s'apprête à consigner est alors *supposé*. Un résumé qui ressemble
à un résultat suffit à le cacher — y compris le résumé d'une exécution
**précédente** restée dans le tampon.

**Ce qu'elle exige, dans cet ordre :**

1. Lancer **sans tuyau**, avec un rapporteur qui tient dans la sortie — et qui
   **existe** : `--reporter=line` pour Playwright, `--reporter=dot` pour Vitest.
   Les deux outils n'ont pas les mêmes noms, et un nom inventé ne dégrade pas
   vers le défaut : **la suite ne tourne pas du tout**. Mesuré le 2026-09-05 en
   écrivant cette règle même — `vitest run --reporter=line` rend
   `Failed to load custom Reporter from line`, `EXIT=1`, zéro test exécuté.
2. Lire le **code de sortie** — `; echo EXIT=$?` — **avant** le résumé, qui n'en
   est pas un synonyme.
3. Relever les **artefacts** d'une défaillance **avant** toute relance.
4. Filtrer ensuite, sur la sortie déjà conservée, si besoin.

```bash
npx playwright test 2>&1 | tail -45 ; echo $?     # 0 — c'est celui de `tail`
```

`$?` rend le code du DERNIER maillon. Filtrer une sortie, c'est remplacer le
verdict du programme par celui du filtre — et `tail`, `grep`, `head`, `sed`
réussissent presque toujours. Mesuré : `0` annoncé sur **32 tests en échec**. Si
un tuyau est indispensable dans la même commande, lire `${PIPESTATUS[0]}`.

**Le texte perdu passe avant le verdict faux** : un code de sortie se rejoue, un
message d'erreur non. Le `| tail -45` du 2026-09-05 a emporté la seule
défaillance qui comptait, et la passe suivante a écrasé `test-results/`. Le
contrôle est resté ouvert faute de savoir pourquoi il était tombé.

### 4. Une copie ne se dégrade pas d'un coup

**4 sites recensés — détail en archive.**

Deux rédactions identiques d'un même bloc ne posent aucun problème le jour où on
les écrit. Elles divergent **au correctif suivant, que personne ne reporte sur la
seconde** — et la seconde garde alors le défaut que la première vient de perdre,
sans que rien ne le signale.

**Ce qui la reconnaît** — le même texte deux fois : un gabarit de rendu écrit
dans les deux modules de liste, une garde de navigation recopiée dans une suite,
un bloc de style dupliqué pour deux noms de classe. La copie est presque toujours
*exacte* au moment où on la fait ; c'est ce qui la rend invisible.

**Ce qu'elle exige** — une fabrique unique quand c'est possible. Quand la
duplication est délibérée, **le contrôle qui la tient doit être joué sur les deux
exemplaires** : un témoin qui n'en tient qu'un ne verra pas l'autre partir.

### 5. Une explication doit pouvoir être fausse

**5 hypothèses réfutées par la mesure — détail en archive.** Jamais énoncée comme
règle jusqu'ici : elle n'existait que par ses exemples.

Une explication qui paraît solide et qu'on n'a pas exécutée n'est pas un
diagnostic, c'est une intention. Les cinq réfutations étaient toutes plausibles à
la lecture, et toutes fausses : `null < 100` passerait *(non — Playwright et
Vitest rejettent `null` bruyamment)* ; un délai trop court relisait le rendu
précédent *(non — le gestionnaire est synchrone, mesuré à ×40, ×150 et ×400)* ;
un contrôle de non-changement se satisfait trivialement *(non — mesuré en lui
présentant un changement)*.

**Ce qui la reconnaît** — on s'apprête à **écrire du code, un correctif ou un
contrôle sur une explication qu'on n'a pas exécutée**. Le signal le plus fiable
est le résultat invraisemblable : une sonde qui répond `false` pour 🔁 *et* pour
🏠 se dénonce elle-même. C'est le témoin qui a dit que la mesure était fausse,
jamais le raisonnement qui l'avait écrite.

**Et le cas dangereux ne ressemble pas à un doute.** Sur les cinq réfutations,
deux venaient d'une inquiétude qu'on voulait lever — on les a testées parce
qu'on doutait. La plus coûteuse était **la thèse de l'auteur** : correctif déjà
écrit, message de commit déjà rédigé autour d'elle, fichier vert, histoire
cohérente. Rien n'obligeait à la tester. **Une explication à laquelle on tient
déjà ne déclenche aucune alerte** — c'est celle-là qu'il faut soumettre à la
mesure, précisément parce qu'on n'en a pas envie.

**Ce qu'elle exige** — vouloir **prouver** l'explication plutôt que la raconter :
c'est le **mutant appliqué à une explication au lieu d'un contrôle**. L'exécuter
avant de bâtir dessus, lire toute sonde neuve **sur ses cas connus** d'abord, et
ne pas se contenter qu'une histoire soit cohérente. Le seul moyen de savoir si
une assertion de non-changement vaut quelque chose est de lui présenter un
changement.

**Et son revers, qui coûte autant** — refermer un constat sur une hypothèse
fausse est **pire** que le laisser ouvert : on cesse de le surveiller en croyant
l'avoir compris. Un contrôle tombé une fois et non reproduit reste ouvert.

## Les gotchas vivants

Pièges **encore actifs**, vérifiés contre le code le 2026-09-05 — pas déduits de
leur formulation. Ils vivaient noyés dans 184 000 caractères de journal, alors
que ce sont exactement les choses à savoir **avant** de toucher au code.
Dédupliqués : `$autre: false` était raconté cinq fois, `fusionnerListe` six.

### Base de données et règles

- **Tout nœud neuf est refusé après un toast de succès.** Les règles ferment
  chaque objet par `$autre: false` — 52 occurrences dans `database.rules.json`.
  Écrire un champ ou un nœud non déclaré part, paraît réussir côté client, et est
  rejeté par le serveur. Déclarer la règle **en même temps** que le champ.
- **`fusionnerListe` réécrit le tableau ENTIER par transaction.** Un seul champ
  inconnu sur **une** enveloppe fait donc refuser **toutes** celles du foyer.
  `enveloppeNeuve` (`envelopes.js:117`) est la seule fabrique de la forme écrite,
  appelée en 194 et 1062 : tout étalement d'enveloppe doit la traverser.
- **`.validate` n'est jamais évaluée sur une suppression.** Une contrainte de
  forme ne protège donc rien contre un effacement ; c'est `.write` qui doit
  porter `newData.exists()`, et les conteneurs `hasChildren()`.
- **`categoryBudgets` est indexé par libellé — la clé EST le nom**
  (`category-budgets.js:23`). Un libellé contenant `.` `$` `#` `[` `]` `/` rend
  **tous** les budgets insauvegardables. Le validateur partagé par l'ajout et le
  renommage existe : y passer.
- **`getDataPath('')` rend `household`.** C'était la charge utile d'une entrée
  forgée capable d'effacer tout l'espace. Toute écriture différée passe par
  `operationRejouable()`, au dépôt comme au rejeu.
- **Les quatre accès absolus ne passent ni par le miroir ni par la file**
  (`db.js:798–833`). C'est délibéré : hors réseau une écriture privée échoue
  franchement plutôt que d'atterrir dans `localStorage`, sur une origine que
  Pages partage entre tous les dépôts du compte. Ne pas « réparer » ça.
- **`dbGet` ne lève pas hors ligne : il sert le miroir.** Et `dbPush` met en file
  en rendant la main. Aucune dégradation ne peut donc se fonder sur une
  exception, et aucune promesse (« le solde reviendra à zéro ») ne peut se faire
  sans vérifier d'abord la liaison.
- **Le total privé qui franchit le mur est déclaratif** — aucune règle ne peut
  vérifier la somme de ce qu'elle n'a pas le droit de lire. L'écran le dit en
  toutes lettres ; ne pas laisser croire à une garantie technique.

### État et rendu

- **`getState` étale tout objet : `{ ...value }`** (`state.js:80`). Étaler une
  `Map` donne un objet **vide**, sans qu'aucune erreur ne le dise. L'état de
  cette application ne porte que des données simples — c'est une contrainte, pas
  un goût.
- **`showModal` ne pose le focus que sur `input, select, textarea`**
  (`modal.js:142`). Une modale **sans champ de saisie** laisse donc le focus sur
  le déclencheur, derrière le voile, et le piège à focus ne reçoit jamais rien ;
  le conteneur reçoit `tabindex="-1"` pour cela.
- **`changePeriod()` ne prend aucun argument** — elle lit le sélecteur. Lui
  passer une période ne fait rien du tout.
- **`formatCurrency` produit une espace fine insécable** (U+202F). Tout test qui
  lit un montant doit l'échapper (` `, ` `, ` `) : l'écrire en
  clair a fait rougir la CI deux fois.

### Le banc d'essai

- **`toBeVisible()` ne voit pas `content-visibility: hidden`.** Un contenu de
  `<details>` fermé garde sa géométrie et passe donc pour visible.
  `checkVisibility()` dit la vérité — 6 specs l'utilisent, **une trentaine sont
  encore sur `toBeVisible`**.
- **Le double Firebase de `_harness.js` diverge de Realtime Database.** Deux
  divergences corrigées, aucune garde automatique : `set(null)` doit effacer, et
  `push().set()` doit écrire un chemin plat sous peine d'avaler les semences. En
  ajouter une troisième est facile, et un contrôle qui ne mesure rien en résulte.
- **Toute spec datée doit figer l'horloge** — `page.clock.setFixedTime`, et des
  clés de mois absolues. Quatre fois ce dépôt a livré un contrôle qui dépendait
  du calendrier : l'heure qu'il était, le mois de décembre, le dernier jour du
  mois, le passage au mois suivant. Le job E2E conditionne la publication.
- **`allerAuPanneau` rend un booléen que ses 80 appels ignorent.** C'est décidé
  (voir *Décisions*) : `true` = on a navigué, `false` = la surface était déjà là,
  et une surface **inatteignable lève**. Ne pas rétablir un `return false`
  silencieux — c'est ce qui faisait mesurer trois fois le même panneau.
- **`detail-depenses.spec.js` est tombé une fois, et reste OUVERT.** Non
  reproduit en deux passes complètes et sept répétitions ; l'hypothèse de la
  lecture périmée est réfutée. Ne pas le refermer sur une explication non
  exécutée.

### Livraison et commandes

- **`sw.js` tient sa liste de précache à la main** (111 entrées). **Tout module
  neuf doit y être ajouté**, sinon le rendu échoue hors ligne. Un test compare la
  liste au disque ; c'est lui qui a rattrapé `utils/repartition.js`.
- **Plafond des sites d'injection : 24 sur 24, marge nulle**
  (`tools/plafond-innerhtml.mjs:64`). C'est voulu — tout `innerHTML`
  supplémentaire fait échouer la CI tant qu'il n'a pas été relu.
- **`no-control-regex` est une ERREUR**, pas un avertissement : elle vient de
  `js.configs.recommended` (`eslint.config.mjs:26`), sans clause `files`. Et la
  CI lance `npx eslint .`, qui couvre `tests/`.
- **`--reporter=basic` n'existe pas en Vitest 4** (`^4.1.0`). La suite ne tourne
  pas du tout, et un `tail` sert alors le résumé d'une exécution précédente.
- **Le jar d'émulateur survit à son arrêt.** `firebase emulators:exec` annonce
  « Stopping Database Emulator » sans toujours l'obtenir : `java` garde le port,
  et la passe suivante échoue sur `port taken`. Ports dans `firebase.json` —
  database 9010, auth 9099 :

  ```bash
  netstat -ano | grep -E ":(9010|9099) "          # le PID qui tient le port
  powershell.exe -NoProfile -Command "Get-Process -Id <PID> | Select Id,ProcessName,StartTime"
  powershell.exe -NoProfile -Command "Stop-Process -Id <PID> -Force"
  ```

  Vérifier `StartTime` avant de tuer : c'est ce qui distingue un jar résiduel
  d'un autre `java` qui travaille.
- **`git checkout -- <fichier>` pour défaire un mutant efface le correctif en
  cours**, puisqu'il restaure HEAD et que le travail n'est pas commité. Copie de
  sûreté **avant** de muter, restauration par `cp`. Le piège est discret : le
  rouge qui suit ressemble à un mutant mal défait, pas à un correctif effacé.

### Ce qui reste ouvert, et ne se referme pas dans le code

- **App Check rend toujours « 400 »** — `activate()` ne prouve rien.
  Instrumenté, non résolu. Ne pas passer en « Appliqué » avant de voir des
  requêtes validées en console.
- **Le site Pages reste public** même si le dépôt est privé : les deux adresses
  du foyer et la clé API sont lisibles à l'URL, et l'origine `github.io` reste
  partagée. Le seul remède définitif est un nom de domaine propre.
- **`stream-json` n'a aucun correctif atteignable** : `firebase-tools@15.29.0`
  exige `stream-json@^1.7.3`, dont la ligne s'arrête à 1.9.1, et le correctif
  n'existe qu'en 3.5.0. Dépendance de développement, seuil CI à
  `--audit-level=high` : rien n'est bloqué. Dependabot le proposera quand l'amont
  élargira sa plage — rien à surveiller à la main.

## Décisions de conception

Arbitrages déjà pris, qui se reposeraient à l'identique. **Une décision qu'on
reprend faute de savoir qu'elle a été prise coûte plus cher qu'un gotcha.**

- **Le nœud d'agrégats mensuels est écarté** (2026-08-27). Il exposerait un
  chiffre d'argent dérivé à 25 chemins d'écriture, au rejeu hors ligne, à une
  restauration qui écrase la racine et à un workflow de migration — et les règles
  n'en vérifieraient que la forme, leur langage n'ayant ni itération ni somme.
- **Le prédicat de la pastille de répartition est « la charge porte un
  `splitOverride` »**, jamais « elle s'écarte du mode du mois » (2026-09-05, quatre
  surfaces). L'autre prédicat donnerait deux réponses pour la même ligne selon
  l'onglet ouvert. Vaut aussi sur un détail de **catégorie**, où le montant
  affiché est plein.
- **La ligne du récap des virements garde la forme `Loyer [50/50] … 500,00 €`**
  (2026-09-05) : le montant plein reste hors de la ligne. Mesuré — `[50/50] sur
  1 000,00 €` fait boucler toute ligne dérogatoire à 320 px. La pastille répond à
  « pourquoi ce chiffre n'est pas celui que j'attendais », jamais à « ce chiffre
  est-il exact » : sur `[70/30]`, retrouver le montant plein demande une division
  par 0,3.
- **Les 225 `waitForTimeout` de la suite ne sont pas convertis** (2026-09-05).
  109 d'installation, 57 redondants avec un `expect()` qui réessaie, 8 devant une
  géométrie dont l'échec est bruyant, 51 devant une lecture brute — dont trois
  fichiers réellement suspects, mesurés, aucun ne mentant. Réécrire 225 sites sur
  une théorie démentie deux fois serait beaucoup de mouvement pour un risque
  qu'on n'arrive pas à faire apparaître. La conversion reste défendable là où
  elle se présente pour ce qu'elle est : lisibilité et vitesse.
- **`allerAuPanneau` garde son booléen** (2026-09-04), bien que ses 80 appels
  l'ignorent : les trois issues garantissent déjà la propriété qui compte. Le
  faire exiger `true` serait une liste tenue à la main déguisée.
- **`barre-solde-scintillement.spec.js` garde sa copie de la garde**
  (2026-09-04) : son `click()` sans garde **expire**, et une expiration est
  bruyante. Seul le silence est un trou.
- **`visibility: hidden` reste hors de la garde de `hauteurDe`** (2026-09-05) :
  un en-tête invisible mais toujours mis en page occupe bien sa place, et « tient
  sur une ligne » garde alors son sens. C'est la géométrie **nulle** qui est en
  cause, pas l'invisibilité.
- **Les dépenses par lieu n'ont aucune proposition** (2026-08-28), à dessein :
  des courses ne se provisionnent pas, elles se budgètent. Lui donner un bouton
  coûterait une des trois places à une échéance qui, elle, demande une décision.
- **L'application ne déplace pas d'argent, et ne le pourra pas** — pas de lien
  bancaire, pas de serveur. « Mettre de côté » ouvre une cagnotte que le foyer
  alimente par des versements ; le message le dit en toutes lettres.
- **⚠️ NON TRANCHÉ — `charge-nature-tag` : neutre ou ambre ?** « fixe » est une
  nature, comme « ponctuelle », qui est peinte en ambre (`.charge-ponctuel`). Le
  neutre a été justifié pour la répartition, jamais pour la nature. La question
  est écrite dans `summary.css:998` plutôt que résolue par omission.

## Journal

**371 constats, archivés le 2026-09-05 dans `journal-archive.md`** — 186 Ko, non
chargés. Le fichier n'est ni mort ni oublié : **le journal avait atteint une
taille où plus personne ne le lisait, alors qu'il contenait des gotchas
vivants.** Ceux-ci sont remontés en tête, avec les cinq règles de méthode ; ce
qui reste là-bas est exact et sans usage courant.

Mesuré ce jour-là : 207 877 caractères, dont 88,9 % de journal — et quatre
motifs racontés jusqu'à neuf fois chacun, chaque récit numérotant sa propre
récidive. Le récit n'avait donc empêché aucune répétition. `CLAUDE.md` est
retombé à ~40 Ko.

L'ouvrir pour retrouver *pourquoi* une garde existe, ou pour refaire un des
comptes que portent les cinq règles ; ce qu'il faut savoir pour agir aujourd'hui
est au-dessus.

Quand un écart est corrigé → l'inscrire dans `journal-archive.md` avec sa date,
et **ne remonter ici que ce qui reste vivant** : un piège encore actif, une règle
transposable, ou une décision qui se reposerait.

## Prompts disponibles

Commandes Claude Code (chargées automatiquement) :
`.claude/commands/audit-design-fairsplit.md`, `.claude/commands/audit-web-fairsplit.md`

Prompts d'audit locaux : `docs/claude/prompts/local/` — dette technique,
règles Firebase, design PWA.

> Les entrées `docs/claude/prompts/core/`, `stacks/javascript/`,
> `docs/claude/references/` et le script `Sync-Toolkit.ps1` figuraient ici
> sans jamais avoir existé dans ce dépôt. Une documentation qui annonce un
> mécanisme absent finit par le faire croire actif : ne rétablir ces lignes
> que le jour où les fichiers existent.
