# CLAUDE.md — FairSplit PWA

App web PWA de partage de charges en couple au prorata des salaires. Synchronisation temps réel Firebase, auth Google/Email, espace de données unique partagé par les comptes autorisés.

> **Version** : 4.0.0 | **Mise à jour** : 2026-09-07 | **Branche unique** : main

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
│       ├── init.js             # Délégation `data-action` — liste blanche
│       │                       # tenue au balisage dans les deux sens. Elle ne
│       │                       # porte plus de compte écrit : « 43 actions »
│       │                       # datait du 2026-08-27, il y en avait 60 le
│       │                       # 2026-09-08, et le chiffre était recopié dans
│       │                       # trois autres fichiers
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
| `utils/debug.js` | 36 | 0 | Critique — le plus importé du dépôt |
| `state.js` | 32 | 1 | Critique — état global |
| `utils/format.js` | 27 | 0 | Critique — affichage monétaire |
| `components/toast.js` | 26 | 0 | Critique — feedback utilisateur partout |
| `db.js` | 25 | **22** | Critique — abstraction DB |
| `utils/date.js` | 25 | 0 | Important — date et période d'une charge |
| `utils/montant.js` | 18 | 0 | Important — lecture d'une saisie |
| `utils/members.js` | 17 | 0 | Important — qui doit à qui |
| `utils/perimetre.js` | 17 | 0 | Important — ce qui pèse sur le solde |
| `config.js` | 14 | 0 | Critique — `DATA_ROOT`, liste blanche |
| `components/modal.js` | 13 | 2 | Important — piège à focus, confirmations |
| `modules/summary.js` | 14 | 6 | Important — calculs dépendants |
| `firebase-init.js` | 6 | 3 | Critique — connexion DB |
| `modules/auth.js` | 1 | 0 | Critique — **hub** : importe 28 modules et en initialise 26 |

> **Relevé le 2026-09-08 par `node tools/adherences.mjs`, et quatre lignes
> avaient dérivé** — debug 35 → 36, state 31 → 32, date 24 → 25,
> summary 13/5 → 14/6. Un seul de ces écarts vient du lot du jour ; les trois
> autres s'étaient accumulés sur les lots précédents sans que personne ne
> recompte. C'est le défaut que ce tableau documente déjà pour lui-même :
> **le rejouer coûte une seconde, le croire coûte une décision.**

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

**9 sites dans l'archive, plus un dixième refermé le 2026-09-06 — 18 récits,
détail en archive.** Le plus cher de ce dépôt.

Le dixième est le premier trouvé dans le **code applicatif au moment où il
nuisait** : `init.js` ignorait tout `data-action` dont la fonction n'est pas
encore posée. Un geste perdu y laissait exactement la même trace qu'un clic
jamais émis — aucune. Il journalise désormais, et retient son compte dans
`window.__actionsIgnorees`.

**Et c'est le premier des dix où le silence était DÉLIBÉRÉ**, non pas oublié :
le `else` portait le commentaire « ignorer silencieusement », avec sa raison —
« module pas encore initialisé ». Cette justification était juste, et c'est
précisément ce qui l'a rendue coûteuse : elle a fait passer pour un cas prévu
ce qui était aussi le seul chemin par lequel un geste réel disparaissait sans
trace. Il a fallu deux chutes de CI muettes pour le voir.

> **Un silence choisi est plus dur à voir qu'un silence oublié, parce qu'il a
> une justification écrite à côté.** Un `catch {}` vide interpelle ; un
> `catch {}` commenté rassure. Quand une branche explique pourquoi elle ne dit
> rien, la question à poser n'est pas « la raison est-elle bonne ? » — elle
> l'est presque toujours — mais **« que perd-on quand elle se déclenche pour
> une autre raison que celle-là ? »**

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
  pas à son renommage ;
- **« il interroge la SURFACE où la chose vit, pas la propriété »** — et
  celui-là se périme **au premier déplacement, EN VERT**.

> **La quatrième réponse, et elle est la plus discrète : un contrôle qui nomme
> une surface se périme quand la chose déménage — sans rougir.**
>
> Trois fois en deux jours, sur trois surfaces différentes :
>
> - le contrôle du grand-livre mesurait `documentElement.scrollWidth` — la
>   page ; le débordement a changé de forme et est passé dans les boîtes ;
> - `service-worker-installation` mesurait le socle — 8 fichiers ; un module
>   neuf hors du précache le laissait vert ;
> - le 2026-09-07, un cas neuf cherchait « 📁 » dans le **libellé du mois**,
>   pour tenir qu'un mois à venir n'est pas annoncé archivé. Le badge vivait
>   dans `#periodInfo`. Le cas **passait au vert avant le correctif** : il
>   interrogeait la surface où le marqueur allait vivre, pas la propriété qu'il
>   prétendait tenir. Réécrit sur le bandeau entier — `.period-navigation` ne
>   contient nulle part `/archiv/i` sur un mois à venir — il est devenu rouge,
>   et il survivra au prochain déplacement.
>
> **Et sa variante, qui trompe autrement : une surface TROP LARGE pour
> distinguer.** Le 2026-09-07, un cas neuf exigeait que l'écran du bac à sable
> refuse le privé « en l'expliquant ». Il cherchait « bac à sable » ET « privé »
> n'importe où dans le texte de la page — et il était **vert avant tout
> correctif** : le bandeau `#sandboxBanner` porte « Bac à sable — données
> d'essai… », le bouton d'accès rapide porte « Privé ». Deux éléments sans
> rapport, réunis par une recherche à l'échelle de la page.
>
> Ce n'est pas « il interroge la mauvaise surface » — celle-là contenait bien la
> propriété. C'est **elle en contient trop pour que la présence des mots prouve
> quoi que ce soit**. Le remède est le même : la plus petite surface qui
> contienne encore la propriété — ici, le texte PROPRE d'un seul élément, ce qui
> exclut le bandeau sans avoir à le nommer, son texte ne contenant pas « privé ».
>
> **Le geste : nommer la propriété, puis chercher la plus PETITE surface qui la
> contienne encore après un déménagement.** « Le libellé ne dit pas archivé »
> se périme ; « l'écran ne dit nulle part archivé » tient. Et il n'y a pas de
> contradiction avec la deuxième réponse ci-dessus : là on demande si le
> contrôle a tourné, ici on demande **sur quoi il a porté**.

> **UN CONTRÔLE PEUT DEVENIR VIDE PARCE QU'UN VOISIN S'EST AMÉLIORÉ — et les
> deux changements sont bons, pris séparément.** C'est la variante la plus
> difficile à voir de toutes celles qui précèdent : il n'y a ni déplacement, ni
> renommage, ni suppression. Personne n'a rien cassé.
>
> Mesuré le 2026-09-08 sur le refus du privé en bac à sable. Le contrôle
> exigeait qu'**un seul élément** porte à la fois « privé » et une raison —
> « bac à sable », « pas accessible »… — et son commentaire expliquait pourquoi
> cette forme excluait le bandeau : *« son texte ne contient pas privé »*. C'était
> vrai le jour de l'écriture.
>
> Deux lots plus tard, le bandeau a été amélioré. Il dit maintenant : « Bac à
> sable — données d'essai, isolées de celles du foyer. **L'espace privé n'y est
> pas accessible.** » Un seul élément, les deux motifs. Le contrôle était
> satisfait par le bandeau, et ne savait plus rien de l'écran privé — révélé par
> mutation : garde retirée, l'écran annonçait « Espace privé illisible, revenez
> dans un instant », et le cas restait **vert**.
>
> **Ce qui la rend invisible : la justification écrite reste lisible et
> continue de paraître juste.** On relit « cette exigence exclut le bandeau », on
> acquiesce, on passe. La phrase décrit un état du monde qui a changé sans elle.
>
> **Le geste : quand un contrôle cherche dans TOUTE la page, se demander
> périodiquement qui d'autre a appris à dire la même chose.** Le remède est de
> réduire la surface à ce que le contrôle prétend mesurer — ici le panneau
> rendu, `.panneau--actif`, ce qui exclut le bandeau **par construction** au lieu
> de l'exclure par une propriété de son texte. Une exclusion structurelle ne se
> périme pas quand un voisin change de vocabulaire.

> **Le jumeau exact, dans l'autre sens : une PRÉMISSE qui exige un exemplaire
> se périme quand l'exemplaire disparaît — et celle-là ROUGIT, sur un dépôt
> sain.** Un contrôle qui nomme une surface se périme en vert ; une prémisse
> qui nomme un exemplaire se périme en rouge, ce qui n'est pas meilleur : elle
> accuse une suppression saine, et le réflexe est de défaire le nettoyage.
>
> **Trois fois dans le MÊME fichier**, `tests/encre-sur-surface.test.js`, qui
> instrumente les feuilles de style :
>
> - « un site à `opacity: 0.8` doit exister » — tombée le jour où
>   `.charge-location` a été corrigé. Réécrite sur une entrée **synthétique** ;
> - « au moins 10 encres littérales » — 14 le jour de l'écriture, 9 le
>   2026-09-08, quand la bascule du résumé a emporté ses deux `color: #FFFFFF` ;
> - « un site littéral à fond hérité doit exister » — c'était très exactement
>   l'un de ces deux-là, désigné par son numéro de ligne.
>
> Les deux dernières sont tombées **ensemble**, sur une fusion qui ne cassait
> rien. Le fichier portait déjà la leçon, écrite trois cas plus haut : *« une
> garde mesure la CAPACITÉ du contrôle, jamais l'état du code qu'il inspecte »*.
> Elle était juste, et elle n'avait pas été appliquée à ses voisines.
>
> **Le geste : une prémisse se nourrit d'une entrée FABRIQUÉE, pas d'un
> exemplaire trouvé.** Ce qu'on veut prouver est que l'instrument sait mesurer ;
> le dépôt n'a pas à conserver un cas de test dans son code de production pour
> que l'instrument reste vérifiable. Ce qui reste légitimement adossé au réel
> est la **non-vacuité** du relevé — « plus de zéro », jamais « au moins dix ».

> **Une leçon consignée dans un fichier ne se propage pas à ses voisines du
> MÊME fichier.** C'est ce qui rend la note précédente coûteuse deux fois.
>
> `encre-sur-surface.test.js` portait la leçon **écrite en toutes lettres, trois
> cas au-dessus** de celles qui sont tombées : *« une garde mesure la CAPACITÉ
> du contrôle, jamais l'état du code qu'il inspecte »*. Elle avait été payée sur
> la garde d'`opacity`, elle était exacte, et elle a été appliquée **à la seule
> garde qui avait rougi ce jour-là**. Les deux voisines, écrites dans la même
> forme et vulnérables au même geste, sont restées telles quelles jusqu'à
> tomber à leur tour — ensemble, sur une fusion qui ne cassait rien.
>
> Ce n'est pas un oubli de rédaction : un correctif se dimensionne naturellement
> sur le symptôme qui l'a déclenché, et un fichier de 500 lignes se relit
> rarement en entier pour vérifier qui d'autre partage le défaut qu'on vient de
> nommer. **La proximité textuelle donne l'illusion que la leçon couvre le
> voisinage.** Elle ne couvre que la ligne qu'on a modifiée.
>
> **Le geste : quand une garde tombe parce que sa prémisse nommait un
> exemplaire, relire TOUTES les prémisses du fichier — pas seulement celle qui
> a rougi.** C'est la règle 4 appliquée non pas à du code recopié mais à une
> FORME recopiée : trois gardes écrites sur le même patron se dégradent au même
> geste, et la première qui tombe est le seul avertissement qu'on recevra pour
> les trois.

> **Une géométrie RENDUE est fractionnaire. Comparer une longueur calculée à une
> valeur exacte fabrique un contrôle qui rougit au hasard — sur des PR qui n'y
> sont pour rien.**
>
> Et c'est le pire des rouges : il n'accuse personne, il se reproduit ailleurs,
> et il finit **désactivé**. Un contrôle désactivé coûte plus cher qu'un contrôle
> absent — l'absent se voit, le désactivé laisse croire à une couverture.
>
> **Trois occurrences en deux jours**, toutes sur des contrôles justes dont
> seule la COMPARAISON était trop exacte :
>
> - `mois-archive` — `Math.round` des deux côtés, sur une valeur qui vaut
>   **121,5** : l'arrondi bascule au hasard entre 121 et 122, 2 échecs sur 8 ;
> - le témoin de la carte du mois — il attendait `--space-md` et le navigateur
>   rendait **24 px**, `.card` écrasant la règle du composant. Attrapé en local
>   avant de livrer ;
> - la carte du mois en CI — `toBe` sur la chaîne `'8px'`, et le moteur rendait
>   **7,87571px**, une transition en vol. Verte cent fois en local.
>
> **Ce qu'il faut écrire à la place** — dans cet ordre de préférence :
>
> 1. **borner** plutôt qu'égaler : `> --space-sm`, `< 0.25`, `<= innerWidth`.
>    C'est la forme qui dit la propriété, et elle ne connaît pas le demi-pixel ;
> 2. comparer des **nombres avec une tolérance sous le pixel**
>    (`toBeCloseTo(x, 0)`), jamais des chaînes de longueur ;
> 3. **attendre que la valeur se pose** quand la propriété est en transition.
>
> Recensé le 2026-09-07 sur toute la suite : 277 `toBe`/`toEqual` en E2E, dont
> **20 touchant un identifiant de géométrie et 4 réellement en cause**. Deux
> étaient des faux positifs — `el.style.width` rend la chaîne `'70%'` écrite par
> l'application, pas une longueur rendue. Les deux vrais (`vues:485` et `:500`)
> sont bornés depuis. **Aucun contrôle unitaire n'est concerné** : jsdom ne fait
> pas de mise en page.

> **UN FAUX VERT A RAREMENT UNE SEULE CAUSE — et s'arrêter à la première en
> laisse une en place.** C'est la forme générale de ce que les trois entrées
> ci-dessus décrivent chacune par un exemple, et elle vaut au-delà d'eux.
>
> Quand un contrôle s'avère vert pour rien, on trouve une cause, on la corrige,
> et la satisfaction de l'avoir trouvée arrête la recherche. Or les conditions
> qui rendent un défaut invisible **se composent** : il suffit qu'une seule
> subsiste pour que le contrôle reste aveugle — et il sera alors vert *après*
> correction, ce qui est pire qu'avant, puisqu'on le croira réparé.
>
> Mesuré le 2026-09-08 sur la co-visibilité de la réserve du privé, par
> décomposition, correctif applicatif retiré :
>
> | | verdict |
> |---|---|
> | 1280 × 720, **zéro** dépense semée — *le contrôle tel qu'il était* | **vert** |
> | 1280 × 720, six dépenses | rouge |
> | 320 et 390, six dépenses | rouge |
>
> La cause évidente était la largeur — le viewport par défaut de Playwright. La
> seconde, invisible, était le **semis** : un écran court ne sépare rien. Chacune
> suffisait à cacher le défaut. Corriger la largeur seule aurait rendu un
> contrôle qui paraît réparé, dont on aurait cessé de se méfier, et qui serait
> resté aveugle au premier écran un peu plus long.
>
> **Le geste : après avoir trouvé POURQUOI un contrôle était vert pour rien,
> demander « et qu'est-ce qui le cacherait ENCORE ? » — puis le vérifier par
> décomposition**, un facteur à la fois, jusqu'à obtenir le rouge sur chacun.
> C'est le même raisonnement que les deux gardes redondantes ci-dessus, appliqué
> aux conditions d'un contrôle plutôt qu'aux lignes d'un correctif.

**Ce qu'elle exige** — tout contrôle neuf porte son **témoin** : un mutant qui le
fait tomber, ou, quand l'assertion peut être satisfaite trivialement, un témoin
**positif** exigeant que les données mesurées soient non dégénérées. Un contrôle
dont le titre est une égalité doit tomber si l'égalité cesse.

> **Le mutant qui ne tombe pas interroge le CONTRÔLE avant d'interroger le
> code.** Un contrôle peut être vert parce que le défaut a **changé de forme**,
> pas parce qu'il a disparu — et le réflexe naturel est le mauvais : on conclut
> que le code est bon.
>
> Mesuré le 2026-09-06 sur le grand-livre du bilan. Le contrôle mesurait
> `documentElement.scrollWidth <= innerWidth` — la page ne défile pas en
> travers — et il attrapait bien le défaut : un libellé en `flex-shrink: 0`
> faisait **grandir sa boîte**, la boîte poussait la page, 424 px pour 320.
> Le correctif contraint la boîte. Le débordement, lui, ne disparaît pas : il
> **change de forme**, le texte sort de sa propre boîte et se pose sur la
> colonne des montants — 197 px de texte dans 149 px de boîte, jusqu'à 248 dans
> 148. La page, elle, ne défile plus. **Le contrôle est vert sur un grand-livre
> dont les libellés recouvrent les chiffres.**
>
> **Un contrôle qui cesse de mesurer dès que le défaut change de forme n'est pas
> un contrôle, c'est le souvenir d'un défaut.** Il tient la trace du symptôme
> qu'on a vu, pas la propriété qu'on voulait.
>
> Le geste est de poser au mutant vert la question qu'on pose au contrôle vert :
> *qu'est-ce que ce contrôle mesure, au juste ?* Ici la réponse a demandé une
> seconde propriété — aucun libellé ne déborde sa boîte — qui tombe sur ce
> mutant, et sur lui seul.

> **Et la troisième raison qu'a un mutant de rester vert : DEUX GARDES
> REDONDANTES SE DISCULPENT MUTUELLEMENT.** Celle-là est la plus retorse, parce
> qu'elle donne une conclusion exactement inverse de la vérité.
>
> Mesuré le 2026-09-08 sur la réserve du total déclaré. Le couple chiffre +
> réserve était tenu par deux règles CSS : `white-space: nowrap` sur le montant
> et `flex-shrink: 0` sur le même. Retirées **une par une**, le contrôle est
> resté vert les deux fois. La lecture naturelle — « aucune des deux ne porte
> rien, elles sont décoratives, je les enlève » — allait supprimer les deux :
> retirées **ensemble**, « déclaré » descend de 29 px sous le chiffre, à 320
> comme à 390, et le bord de l'écran repasse entre les deux.
>
> **La bonne lecture n'est pas « aucune n'est porteuse » mais « chacune SUFFIT,
> aucune n'est NÉCESSAIRE ».** Un mutant qui n'enlève qu'un membre d'une paire
> redondante ne mesure pas ce membre : il mesure la paire, et la paire tient.
>
> **Le geste : quand un mutant reste vert sur une ligne qu'on croyait porteuse,
> chercher qui d'autre produit le même effet — puis retirer les deux.** Si le
> contrôle tombe alors, il faut en garder UNE : celle qui **énonce la
> propriété**, pas celle qui la produit par un détour. Ici `nowrap` dit « le
> chiffre et sa réserve ne se séparent pas » ; `flex-shrink: 0` disait la même
> chose en parlant de mise en page, et n'est pas revenue. La garde restante est
> alors éprouvable seule — vérifié.

> **Un mutant qui TOMBE se lit aussi — sa chute confirme la détection, son
> MESSAGE dit si le contrôle sait nommer ce qu'il a vu.**
>
> Le pendant du précédent, et il est plus discret : là on interroge un mutant
> resté vert, ici un mutant qui tombe bien. On coche, on passe — et on laisse un
> contrôle qui accuse la mauvaise cause.
>
> Mesuré le 2026-09-08 sur la co-visibilité de la réserve du privé. Le mutant
> « réserve dans un dépliant fermé » faisait bien tomber le contrôle, mais sur
> le message **« le total déclaré est rendu SANS sa réserve »** — c'est-à-dire
> sur une ABSENCE, quand il y avait un REPLI. La cause était juste, le rapport
> envoyait chercher à côté.
>
> La raison tenait à la sonde : elle cherchait la réserve parmi les seuls
> éléments **visibles**, et un contenu de `<details>` fermé n'en est pas un. Elle
> parcourt désormais tous les éléments et distingue trois issues — absente,
> repliée, hors de la vue — chacune avec sa phrase.
>
> **Le geste : après avoir vu un mutant tomber, LIRE son message et se demander
> s'il envoie au bon endroit.** Un contrôle qui nomme mal ce qu'il a vu coûte le
> temps de celui qui le croira.

> **Un jeu d'essai qui ne porte que le cas coupable-mais-indulgent laisse passer
> un correctif partiel.** Corollaire du précédent, et il vise l'entrée du
> contrôle plutôt que sa sortie.
>
> Même chantier, même jour. Le témoin employait « Bartholomew-Maximilien
> Leonard » : 30 caractères, la limite que `#prenomVous` laisse saisir — mais un
> trait d'union et une espace, donc **deux occasions de s'enrouler**. Il était
> bien rouge avant le correctif. Il devenait vert avec un correctif incomplet :
> le prénom s'enroulait tout seul dès qu'on lui laissait la place, sans
> `overflow-wrap`.
>
> Le second cas — « Bartholomewmaximilienleonardxy », 30 caractères insécables —
> a été ajouté **par principe, avant qu'on sache qu'il servirait** : rien
> n'oblige un prénom à porter une coupure, et le champ en accepte autant
> d'insécables. C'est lui, et lui seul, qui a rendu le mutant lisible. Sans lui
> le correctif paraissait complet.
>
> **Le cas indulgent est celui qu'on écrit naturellement** : on prend un exemple
> plausible, et un exemple plausible porte les coupures que la langue met
> partout. Le cas qui mesure est celui qui n'en porte aucune. Quand une entrée a
> une borne — `maxlength`, un plafond, une longueur —, le jeu d'essai doit
> porter la borne **et** sa forme la plus hostile, pas la borne seule.

> **Un jeu d'essai qui ne porte qu'UN RÉGIME ment dans les deux sens.**
> Le miroir exact du cas précédent, et il s'est payé le 2026-09-07.
>
> Là, le cas **indulgent** — un prénom qui porte des coupures — laissait passer
> un correctif partiel. Ici, c'est le cas **sévère** qui a failli masquer une
> différence réelle : sur un prénom long, le grand-livre fait 82 px et
> `align-items: baseline` et `center` rendent tous deux 5/5. **Indiscernables.**
>
> C'est sur un prénom **court**, où la boîte de 44 px n'est pas remplie, que les
> deux se séparent : `center` rend 10/10, `baseline` rend **5/15** — le contenu
> collé en haut. Sans ce cas, on sortait la classe de la règle en croyant ne
> rien perdre, et on rendait un alignement cassé sur tous les écrans où le
> libellé est court, c'est-à-dire presque tous.
>
> **Le cas où la contrainte MORD ne dit rien de ce qui se passe quand elle ne
> mord pas.** Une contrainte saturée masque la règle qui la gouverne : quand
> tout déborde, toutes les stratégies d'alignement se ressemblent. Un jeu
> d'essai doit donc porter **les deux régimes** — celui où la borne est atteinte
> et celui où elle ne l'est pas — et pas seulement le pire des deux.

**Corollaire, payé deux fois.** Un bouchon qui rend une valeur neutre ne mesure
pas le câblage, il le **masque** : `'' + ''` se lit comme `''`, et une étiquette
rendue deux fois y devient invisible. Quand ce qu'on tient est un rendu, le
double doit produire du balisage qu'on puisse compter.

### 2. Deux fabriques d'une même grandeur finissent toujours par diverger

**9 avérées, 2 évitées parce que le motif était nommé — détail en archive.** Dite
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

> **Une COMMANDE est une fabrique, elle aussi — et c'est la forme qu'on ne voit
> pas venir.** La règle se cherche d'ordinaire dans des calculs : deux totaux,
> deux médianes, deux fenêtres de mois. Le 2026-09-08, la neuvième occurrence
> était **un bouton**.
>
> Le lot 5 a ajouté un sélecteur de portée écrivant `porteeCourante` dans
> `state.js`. L'application en avait déjà un : la bascule du résumé, « À deux » /
> « Moi ce mois-ci », qui écrit `ongletDuResume`, une variable de module de
> `summary.js`. Deux commandes, deux états, une seule grandeur — et la
> divergence était immédiate, mesurée sur `main` dans les deux sens : segment sur
> « Moi » pendant que le résumé annonce « À deux », et l'inverse.
>
> **Ce qui l'a rendue invisible : on a mesuré ce que le sélecteur COÛTAIT,
> jamais ce qu'il DOUBLAIT.** Tout un lot de mesures de géométrie — budget,
> largeur, cible tactile, marges — et pas une question sur l'existant.
>
> **Le geste : avant d'ajouter une commande, chercher qui gouverne déjà cette
> grandeur.** Une grandeur gouvernée à deux endroits diverge exactement comme
> une grandeur calculée à deux endroits, et elle se voit moins — parce qu'on
> cherche un doublon dans le code de calcul, pas dans le balisage.
>
> ```bash
> grep -rn "data-action=\"[a-zA-Z]*\"" public/FairSplit.html   # ce qui commande déjà
> grep -rn "^let \|^const " public/js/modules/<module>.js       # les états de module
> ```
>
> ✅ **Fusionnée le 2026-09-08** — `ongletDuResume` et `basculerResume` ont
> disparu, le résumé LIT `porteeCourante`, et le repère de solde a suivi sur le
> segment « À deux ». Ce qui reste est `tests/e2e/portee-unique.spec.js`, écrit
> sur la propriété — « l'écran ne montre jamais deux portées différentes en même
> temps » — et **sans nommer aucune des deux commandes** : son quatrième cas
> parcourt tout ce qui annonce une portée et exige l'accord après chaque geste.
> Éprouvé par mutation : une seconde source rebranchée le fait tomber en
> nommant les deux annonces qu'il a vues.

### 3. On croit avoir mesuré, on n'a rien mesuré

**7 formes recensées — détail en archive.** Un jar d'émulateur qui garde son
port, un `--reporter=basic` qui n'existe pas, un `| tail -45` qui coupe le
rapport — et un `--reporter=line` prescrit par cette règle même, qui n'existe pas
davantage sous Vitest. **Aucune n'est la même commande, et deux n'impliquent
aucun tuyau** : nommer la règle par son déguisement le plus récent, c'est se
préparer à ne pas reconnaître la suivante. La quatrième est arrivée le jour où
la règle a été écrite, dans le texte de la règle.

**Et la septième n'est pas une mesure du tout : c'est une PR verte prise pour
une PR finie.** Le vert des checks dit que l'arbre poussé tient, jamais que le
travail est terminé — et fusionner sur ce signal-là fait tomber le merge sous
les commits en vol. Deux fois en deux jours, même geste. Le détail est au
point 4.

**Et la cinquième n'est même pas une commande.** Le 2026-09-06, une PR a été
mergée sur un head **périmé** : ses deux derniers commits étaient bien poussés,
la branche distante les portait, rien n'était cassé — mais GitHub avait
enregistré le head d'avant, et c'est lui qui a été fusionné. Les checks verts
que j'ai lus portaient donc sur un arbre **sans** le travail qu'ils étaient
censés valider ; vérifié après coup, le commit instrumenté n'avait **aucun check
run**. Ni tuyau, ni rapporteur, ni filtre : **le décalage était entre l'objet
TESTÉ et l'objet MERGÉ**, et le verdict était vert en portant sur autre chose.

**Ce qui la reconnaît** — le symptôme n'est **jamais un test rouge**. C'est une
suite qui ne tourne pas, ou qui tourne et dont on ne lit pas le verdict. Le
chiffre qu'on s'apprête à consigner est alors *supposé*. Un résumé qui ressemble
à un résultat suffit à le cacher — y compris le résumé d'une exécution
**précédente** restée dans le tampon.

**Le signal qui l'attrape est l'INVRAISEMBLANCE du résultat**, jamais la
relecture. Un merge de 33 lignes de Markdown quand on vient d'instrumenter trois
fichiers ; un `0` sur 32 tests en échec ; un résumé daté d'avant la commande
qu'on a lancée. C'est exactement le signal de la règle 5 — la sonde qui répond
`false` pour 🔁 *et* pour 🏠 se dénonce elle-même. **Un chiffre qui ne
ressemble pas à ce qu'on vient de faire est un fait, pas une bizarrerie.**

**Ce qu'elle exige, dans cet ordre :**

1. Lancer **sans tuyau**, avec un rapporteur qui tient dans la sortie — et qui
   **existe** : `--reporter=line` pour Playwright, `--reporter=dot` pour Vitest.
   Les deux outils n'ont pas les mêmes noms, et un nom inventé ne dégrade pas
   vers le défaut : **la suite ne tourne pas du tout**. Mesuré le 2026-09-05 en
   écrivant cette règle même — `vitest run --reporter=line` rend
   `Failed to load custom Reporter from line`, `EXIT=1`, zéro test exécuté.
2. Lire le **code de sortie** — `; echo EXIT=$?` — **avant** le résumé, qui n'en
   est pas un synonyme.
3. **`npm run artefacts` — AVANT toute relance.** Une commande, pas une
   intention : Playwright écrit un dossier par cas dans `test-results/`, et
   rejouer ce cas l'écrase. Le réflexe naturel après un échec — le relancer pour
   voir s'il se reproduit — détruit donc ce qui aurait permis de le comprendre.

   > **Cette étape a été « relever les artefacts avant toute relance » pendant
   > deux jours, et elle a été manquée TROIS fois** — `cout-annuel:60`,
   > `firebase-integration:175`, `depense-perso:101`. À chaque fois la leçon a
   > été réécrite au journal, à chaque fois elle a été refaite. **Une leçon
   > qu'on réapprend trois fois n'est pas apprise** : ce qui manquait n'était
   > pas la connaissance, c'était un geste qui coûte moins cher que l'oubli.
   >
   > `tools/garder-artefacts.mjs` copie — il ne déplace pas — vers
   > `artefacts-locaux/<horodatage>/`, ignoré par git. Ceux qui méritent d'être
   > gardés partent ensuite dans `docs/artefacts/`, à la main et avec leur note
   > d'origine.
4. **Avant tout merge, comparer le head de la PR au commit testé** — deux
   chaînes, lues côte à côte, jamais supposées égales :

   ```bash
   gh pr view <n> --json headRefOid -q .headRefOid
   git rev-parse HEAD
   ```

   Un `push` réussi ne garantit pas que la PR pointe dessus, et des checks verts
   ne disent pas sur quel arbre ils ont tourné. En cas de doute :
   `gh api repos/<dépôt>/commits/<sha>/check-runs` — un commit sans aucun check
   n'a jamais été éprouvé.

   > **La même forme, rencontrée dans l'autre sens — 2026-09-06, PR #161.**
   > Le head n'était pas périmé parce qu'un `push` s'était perdu : **la PR a été
   > fusionnée depuis l'interface pendant que deux commits étaient poussés**.
   > L'objet PR se fige alors au head fusionné, et il ne se resynchronise plus.
   >
   > Le symptôme est déroutant : `gh api .../git/ref/heads/<branche>` rend le
   > commit récent, `git push` répond `Everything up-to-date`, et
   > `gh api .../pulls/<n> -q .head.sha` rend obstinément l'ancien. Trois
   > tentatives de resynchronisation ont échoué — re-`push`, attente,
   > `close`/`reopen` — la dernière en donnant enfin la réponse :
   > *« can't be closed because it was already merged »*.
   >
   > **Une PR qui refuse de se resynchroniser est peut-être déjà fusionnée.**
   > Le remède ne change pas — comparer les deux chaînes — et c'est lui qui a
   > arrêté le geste avant qu'une conclusion fausse en sorte. Ce qui change est
   > la lecture : le décalage ne signale pas toujours un `push` manqué, il peut
   > signaler que l'objet a cessé de suivre la branche. Vérifier
   > `gh api .../pulls/<n> -q .merged` **avant** de chercher à réparer, et
   > rouvrir une PR pour les commits restés en dehors.

   > **ET LA MOITIÉ QUI MANQUAIT : UNE PR VERTE N'EST PAS UNE PR FINIE.**
   >
   > Tout ce qui précède protège **celui qui merge** d'un head périmé : compare
   > les deux chaînes, tu ne fusionneras pas un arbre que personne n'a éprouvé.
   > Rien n'y protégeait **celui qui pousse** d'un merge tombé sous ses commits
   > en vol — et c'est l'autre moitié du même accident.
   >
   > **Deux occurrences en deux jours, même geste** — PR #161 le 2026-09-06,
   > PR #171 le 2026-09-07. Dans les deux cas la branche bougeait encore, dans
   > les deux cas l'objet PR s'est figé au head d'avant, et dans les deux cas un
   > commit est resté dehors sans que rien ne le dise : `deploy` s'exécute sur
   > `main`, il est vert, et il valide un arbre amputé.
   >
   > La cause n'est pas technique. Un job vert **dit que l'arbre poussé tient**,
   > jamais que le travail est terminé : les checks se déclenchent au premier
   > `push`, et une branche en cours en produit autant qu'elle a de commits.
   > Prendre ce vert pour un feu de départ, c'est confondre « ce qui est là
   > passe » avec « il n'y a plus rien à venir ».
   >
   > **Le signal de fin est ÉNONCÉ, jamais déduit.** Il est explicite dans ce
   > dépôt — « je m'arrête là », « la PR attend », « rien n'est fusionné ». Un
   > agent qui pousse le dit ; c'est CE signal qu'on attend pour fusionner, pas
   > la pastille verte.
   >
   > Et le remède du pousseur est le même que celui du mergeur, dans l'autre
   > sens : **après avoir poussé, relire ce que la PR porte vraiment.**
   >
   > ```bash
   > gh pr view <n> --json state,headRefOid -q '[.state,.headRefOid]|@tsv'
   > git rev-parse HEAD                       # les deux chaînes, côte à côte
   > git merge-base --is-ancestor <sha> origin/main   # après une fusion annoncée
   > ```
   >
   > La troisième ligne est celle qui a rattrapé les deux fois : une fusion
   > **annoncée** n'est pas une fusion **constatée**, et la seule façon de
   > trancher est de demander à git si le commit est là.
   >
   > **Et elle rattrape les DEUX causes opposées.** Quatre divergences le
   > 2026-09-07 : trois venaient d'un merge tombé **sous** des commits en vol,
   > la quatrième d'un merge qui **n'avait pas eu lieu** — deux accidents
   > inverses, un seul remède. `merge-base --is-ancestor` ne demande pas
   > *pourquoi* le commit manque, seulement *s'il est là*, et c'est ce qui le
   > rend indifférent à la cause.
5. Filtrer ensuite, sur la sortie déjà conservée, si besoin.

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

> **Le corollaire, et il couvre les cinq formes : un verdict vert ne dit rien
> tant qu'on n'a pas vérifié SUR QUOI il a porté.** Le code de sortie, le
> rapporteur, le tuyau et le head de PR sont quatre façons de perdre cette
> réponse — le port occupé en est une cinquième, qui la perd avant même qu'elle
> existe. La question n'est jamais « est-ce vert ? » mais **« vert sur quoi ? »**

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

- **Le grand-livre du bilan déborde son conteneur de 8 px à 320 px, et aucun
  contrôle ne le dit.** `.summary-details` (`summary.js:873`) mesure
  `scrollWidth` 226 pour une boîte de 218, avec un prénom **court**. Avec un
  prénom de 25 caractères — `#prenomVous` accepte `maxlength="30"` — il monte à
  **344**, et `documentElement.scrollWidth > innerWidth` devient vrai : la page
  défile latéralement. Mesuré le 2026-09-06.
  **Le contrôle existant ne peut pas être étendu à ce défaut, et c'est
  structurel.** `coherence-visuelle:249` « aucun texte n'est coupé » mesure un
  **rognage dans une boîte** — `scrollWidth > width` sur les FEUILLES. Ici la
  boîte **grandit** : `.summary-row span { flex-shrink: 0 }` la porte à
  `max-content`, et c'est le parent qui déborde. Deux propriétés différentes,
  pas un seuil à ajuster. Trois portes fermées d'un coup : les lignes qui
  portent un prénom contiennent un `.summary-percent` imbriqué, donc ne sont pas
  des feuilles ; les feuilles ne débordent pas d'elles-mêmes, relevé nul sur les
  cinq lignes ; `.summary-row` a des enfants, donc `continue`.
  `coherence-visuelle:223` « aucune commande ne dépasse de l'écran » est aveugle
  aussi, bien que les deux lignes `.summary-row--ouvrable` soient des
  `<button>` : leur boîte s'arrête à x = 278 sur 320, c'est leur **contenu** qui
  les déborde.
  La propriété qui l'attrape est `documentElement.scrollWidth <= innerWidth` —
  celle de `mobile.spec.js` « la page ne défile pas latéralement », qui ne tourne
  que sur des profils d'appareil (Pixel 5, 393 px) et avec les prénoms par
  défaut. C'est donc un contrôle **juste, qui ne visite pas le cas**.
  **Cause établie par mutation le 2026-09-06, et la question a changé.** Les
  8 px sont la moitié droite du débord délibéré de `.summary-row`
  (`margin: 0 calc(-1 * var(--space-sm))`, soit ±8 px, qui fait passer la ligne
  à 234 pour un conteneur de 218). Retirer cette marge ramène l'écart à **0** —
  mesuré, pas déduit. Le même écart se lit sur `#resumePanneauDuo`, aux mêmes
  chiffres : c'est un seul débord, vu à deux niveaux.
  Ce n'est donc pas un défaut de mise en page mais un **débord voulu** — c'est
  lui qui laisse le fond de survol dépasser le rembourrage de la carte. **Le
  constat reste ouvert**, mais il ne demande plus « d'où viennent ces 8 px » :
  il demande si un débord délibéré doit être rogné, et le prix est le fond de
  survol. Ne pas « corriger » la marge négative sans avoir répondu à ça.
  Le correctif du grand-livre (`1fr auto`, 2026-09-06) **n'y a rien changé** :
  mesuré à 226/218 avant comme après.

- **`pointer: coarse` change la GÉOMÉTRIE, et presque rien ne l'éprouve.**
  `responsive.css:411` porte quatre groupes de règles, tous géométriques :
  `min-height: 44px` sur **toute** commande ; `min-height` + `display: flex` sur
  les labels de case à cocher ; `min-width: 44px` sur trois classes d'icône ; et
  **`display: flex` sur cinq classes de lignes ouvrables**, dont
  `.summary-row--ouvrable`.
  **Un seul contrôle du dépôt tourne au doigt** — `cible-tactile.spec.js`, à
  390 px — et il vérifie que ces règles *s'appliquent*, jamais **ce qu'elles
  coûtent ailleurs**. Tous les contrôles de budget et de géométrie mesuraient
  donc un écran que personne n'affiche.
  Chiffré le 2026-09-07 : `#mainApp > header` mesure **54 px au doigt contre
  35,5 à la souris** — 18,5 px d'écart, parce que `.btn-logout` est porté à
  44 px. C'est la famille d'`onglets:304` avant son renforcement, appliquée à
  quatre contrôles au lieu d'un. `onglets:280` est étendu au doigt depuis.
  **Ce que les groupes 2 et 3 coûtent — mesuré le 2026-09-07, consigné, NON
  corrigé :**
  - **groupe 3, `min-width: 44px` sur `.period-arrow`** : les flèches passent de
    36 à 44 px, et la ligne du mois rend `scrollWidth` 278 pour un `clientWidth`
    de 270.
    **Ce n'était pas un défaut, et la mesure fine l'a redimensionné.** Relevé
    enfant par enfant : les deux flèches débordent de 8 px **symétriquement**,
    l'une à gauche l'autre à droite, et atterrissent dans le REMBOURRAGE de la
    carte — 17 px et 303 px sur un écran de 320, donc à l'intérieur de l'écran
    comme de la carte. Le mois n'est pas rogné, la page ne défile pas, rien
    n'est perdu. Les arrondis autour des flèches sont simplement plus serrés au
    doigt.
    Consigné quand même : c'est le seul endroit connu où le groupe 3 déplace une
    géométrie, et un signalement qu'on a su ramener à sa taille vaut mieux qu'un
    signalement retiré ;
  - **groupe 2, les labels de case à cocher** : **une seule instance rendue**
    dans toute l'application — `.reminder-toggle`, dans Réglages. Elle passe de
    `display: block` à `flex` et de 22 à 44 px de haut. Inoffensif ici parce que
    son display d'auteur est `block` ; **le jour où un label s'appuiera sur une
    grille, il cassera exactement comme le grand-livre**. Et une seule instance
    fait une couverture mince pour `cible-tactile`.

  **Ce que l'en-tête coûte au doigt, et ce qui le rendrait — mesuré le
  2026-09-07, CONSIGNÉ, non appliqué.** L'en-tête est en `flex` avec
  `align-items: center` : sa hauteur est celle de son plus haut enfant, et cet
  enfant est `#userInfoBar` à 44 px, tenu par le `min-height` du bouton de
  déconnexion.

  | Forme de la déconnexion | En-tête | Premier contenu à 320 | Gain |
  |---|---:|---:|---:|
  | bouton texte *(actuel)* | 54 px | 140 px | — |
  | **bouton d'icône 44 × 44** | **54 px** | **140 px** | **0 px** |
  | hors de l'en-tête | 36 px | 122 px | **18 px** |

  **Le bouton d'icône ne rend RIEN**, et il fallait le mesurer plutôt que le
  supposer : une icône reste un `button`, donc reste à 44 px de haut. Ce qui
  coûte n'est pas sa largeur, c'est sa présence. Masquer l'avatar en plus ne
  change rien — il n'est pas la contrainte.

  > **`hasTouch: true` suffit à déclencher `pointer: coarse` ; `isMobile` non.**
  > Mesuré sur les quatre combinaisons. `hasTouch` bascule aussi
  > `hover: hover` à faux — sans effet sur la géométrie, mais à savoir avant
  > d'imputer une couleur au tactile.

- **Le correctif `1fr auto` du grand-livre était NEUTRALISÉ sur tout appareil
  tactile.** ✅ Corrigé le 2026-09-07 ; **gardé ici parce que le motif reste
  vivant** — trois autres classes portent encore la règle qui l'a causé.
  `responsive.css` déclare, sous `pointer: coarse`,
  `.summary-row--ouvrable { display: flex; align-items: center }`. Cette règle
  charge après `summary.css` et **écrase le `display: grid`** sur lequel repose
  le correctif du lot 2. La déclaration `grid-template-columns` survit dans le
  style calculé, et **ne fait plus rien**.
  Mesuré à 320 px, prénom insécable de 30 caractères :

  | Pointeur | `display` | Largeur de ligne | `documentElement.scrollWidth` |
  |---|---|---:|---:|
  | souris | `grid` — `147,6px 62,4px` | 234 px | 320 ✅ |
  | **doigt** | **`flex`** | **335 px** | **379** ❌ |

  Soit **59 px de débord latéral sur un vrai téléphone**, là où le contrôle
  `grand-livre:120` rend vert à la souris. C'est le seul contrôle du dépôt que
  le tactile fait tomber — relevé sur la suite entière rejouée au doigt.
  **Le correctif ne touche qu'une classe** : `.summary-row--ouvrable` sort de la
  liste et reçoit `display: grid; align-items: center`. Les quatre autres gardent
  la règle mot pour mot — ce qu'elle leur donne n'a pas été mesuré, et rien
  n'obligeait à le changer pour réparer celle-ci.
  `align-items: center` est conservé, et ce n'est pas décoratif. Mesuré sur un
  prénom COURT, où la boîte de 44 px n'est pas remplie :

  | Variante | Contenu, haut / bas |
  |---|---|
  | `flex` (avant) | 10 / 10 — centré |
  | **`grid` + `center`** | **10 / 10 — centré** |
  | `grid` + `baseline` | 5 / 15 — **collé en haut** |

  Sans le cas du prénom court, `baseline` aurait paru équivalent : sur un prénom
  long la ligne fait 82 px et les deux rendent 5/5. C'est le cas où la contrainte
  MORD qui sépare les deux réponses.

- **Une barre collante mange le clic sur le grand-livre, à 390 px — DÉFAUT
  IDENTIFIÉ, NON CORRIGÉ, et aucun contrôle ne le tient.** Sous 900 px l'écran
  porte deux surfaces flottantes qui encadrent le contenu défilant :

  | Surface | Règle | Fichier |
  |---|---|---|
  | Barre d'onglets, en bas | `position: fixed; bottom: 0; z-index: 60` | `onglets.css:38` |
  | Barre de solde, en haut | `position: sticky; top: 0; z-index: 50` | `responsive.css:307` |

  Une ligne du grand-livre amenée dans la vue par `scrollIntoView` peut atterrir
  **sous l'une des deux**. Playwright la juge alors « visible, enabled and
  stable » — la géométrie est bonne — et le test de touche échoue sur un autre
  nœud. Le geste réel a le même sort : un doigt qui vise cette ligne touche la
  barre.
  **Mesuré, non déduit** — CI du 2026-09-01, artefact conservé dans
  `docs/artefacts/detail-depenses/` : `locator.click` expire à 30 s après
  **25 interceptions**, `#balanceBar` 11 fois, `.onglet` 7, `.summary-divider` 5,
  `<details open class="summary-details">` 2. La capture montre une page
  entièrement chargée, défilée de sorte que la ligne du payeur passe sous le
  bandeau collant.
  **Les deux règles sont toujours en place**, et la surface touchée est la liste
  que les lots 5 et 6 modifient. Le remède plausible — `scroll-margin-top` et
  `scroll-padding-bottom` à la hauteur des deux barres — n'est pas appliqué :
  il se décide dans son lot, pas en passant.
  ⚠️ **Aucun contrôle ne mesure cette propriété.** `coherence-visuelle` tient
  le rognage et le débordement, jamais l'atteignabilité au pointeur ; et un test
  qui clique sans expirer ne prouve rien, puisque le défaut ne se manifeste qu'à
  certaines positions de défilement. Ce qui l'attraperait est
  `elementFromPoint()` au centre de la cible, comparé à la cible elle-même.

- **Une classe utilitaire redéclarée dans une feuille chargée plus tard écrase
  silencieusement la règle du composant.** ✅ Corrigé sur la carte du mois le
  2026-09-07 (#166) ; **le motif, lui, reste vivant.**
  Le cas : `onglets.css` déclarait sous 900 px
  `.period-navigation { padding: var(--space-sm) var(--space-md) }`, avec son
  commentaire — « le sélecteur au repos : resserré, pas amputé ».
  `responsive.css` déclare `@media (max-width: 600px) { .card { padding: var(--space-md) } }`,
  **charge après**, et gagnait **à spécificité égale** (0,1,0) sur un élément qui
  porte `class="card period-navigation"`.
  Mesuré : rembourrage vertical **16 px au lieu de 8** à 320 et à 390 px, soit
  **16 px de premier écran perdus sur tout téléphone** — la règle fonctionnait
  entre 601 et 899 px, une tablette, c'est-à-dire partout sauf là où elle avait
  été écrite. Correctif : `.card.period-navigation`, (0,2,0), sans `!important`.
  Tenu par `onglets.spec.js`, « La carte du mois compactée », aux trois largeurs
  320 / 390 / 700, plus son témoin au-delà de 900 px.
  > **Rien ne signale ce motif : la règle est là, lisible, commentée, et sans
  > effet.** Chercher `.card` — et les autres utilitaires — dans
  > `responsive.css` avant de croire qu'une règle de composant s'applique en
  > mobile. `onglets.css` porte déjà deux autres parades au même défaut, écrites
  > avant celle-ci : `body .container` et `body .fab`, toutes deux commentées
  > par la même raison. **Trois occurrences, une seule famille.**
  >
  > Et le même écrasement joue **au-dessus de 900 px**, dans le sens qui aère :
  > `components.css` déclare `.period-navigation { padding: var(--space-md) }`
  > ligne 214 et `.card { padding: var(--space-lg) }` ligne 289 — le navigateur
  > rend 24 px. Ce n'est pas un défaut, et c'est pour ça que le témoin **borne**
  > la compaction au lieu de figer 24 px : figer la valeur enregistrerait
  > l'écrasement comme une intention.

### Le banc d'essai

- **Le viewport par défaut de Playwright est 1280 × 720, et il s'applique en
  SILENCE à tout fichier sans `test.use`.** Un contrôle de mise en page mobile
  qui ne déclare pas sa largeur ne mesure pas le mobile — et rien ne le dit :
  il n'y a ni avertissement, ni valeur visible, ni trace dans le rapport. Le
  projet `chromium` de `playwright.config.js` ne déclare aucun `viewport`, donc
  le défaut de Playwright s'applique tel quel.
  Mesuré le 2026-09-08 sur la co-visibilité de la réserve du privé, écrite **la
  veille** pour protéger un déplacement à venir : verte à 1280, rouge à 320 avec
  son propre semis. **Troisième contrôle de la semaine qui mesure un écran que
  personne n'affiche** — le grand-livre et le budget tactile étaient anciens,
  celui-ci a été écrit en connaissance du motif.
  **Ce n'est PAS un défaut de configuration du projet, et c'est recensé :**

  | | |
  |---|---:|
  | specs E2E | 57 |
  | ne fixent aucune largeur (`viewport`, `setViewportSize`, `devices[…]`) | 32 |
  | parmi elles, qui touchent une géométrie | 3 |
  | qui font une **affirmation de mise en page** | **1** |

  Les 29 autres ne mesurent aucune géométrie, et 1280 leur convient. Donner un
  viewport au projet recontextualiserait **32 fichiers d'un coup** pour n'en
  corriger qu'un — c'est ce que le dépôt s'interdit depuis la pose de l'écouteur
  d'exceptions. **La largeur se déclare par fichier, dans celui qui la mesure.**
  > **Et le viewport n'était que la MOITIÉ du camouflage.** Décomposé par
  > mutation, correctif retiré : à 1280 avec **zéro** dépense semée — la
  > configuration exacte du contrôle de la veille — il rend **vert** ; à 1280
  > avec six, **rouge** ; à 320 et 390 avec six, rouge. Le semis cachait autant
  > que la largeur, et corriger l'un sans l'autre aurait laissé un contrôle
  > encore aveugle. Un faux vert a rarement une seule cause.

- **`\b` ne s'apparie JAMAIS contre une lettre accentuée, et le prix est un
  faux vert.** En JavaScript, `\b` est défini sur `[A-Za-z0-9_]` : « à », « é »,
  « ç » n'en font pas partie, il n'y a donc aucune frontière de mot à leur
  contact. `/\bà deux\b/i` et `/\bprivé\b/i` ne correspondent à rien, jamais —
  et ils se relisent sans alerter, parce qu'ils ont exactement la forme d'un
  motif correct.
  Mesuré le 2026-09-08 en écrivant `portee-unique.spec.js`. Le coût n'a pas été
  une erreur visible mais un **faux vert, sur la propriété même que le contrôle
  existait pour montrer** : « À deux » n'étant pas reconnu, le cas ne relevait
  qu'une seule annonce de portée et concluait à l'accord — sur l'écran qui en
  affichait deux, en désaccord.
  **Le remède** : contre du français accentué, ne pas borner, ou borner
  autrement — `(?<![\p{L}])` avec le drapeau `u`, ou un ancrage sur la casse et
  le contexte réel. Garder `\b` là où le mot est en ASCII et où il sert
  vraiment : `/\bmoi\b/` évite « mois », et c'est sa raison d'être.
  **Le signal** : un motif qui ne trouve jamais rien dans un texte où on
  l'attend. Une sonde neuve se lit d'abord **sur ses cas connus** — c'est la
  règle 5, appliquée à une expression régulière.

- **Une longueur RENDUE ne se compare pas à une chaîne, et surtout pas au texte
  d'un jeton.** Corollaire du piège ci-dessous, et il a fait rougir la CI le
  2026-09-07 sur un contrôle vert cent fois en local :
  `rembourrage haut 7.87571px pour 8px attendu`.
  7,875 px n'est pas un rembourrage, c'est une **transition en vol** —
  `onglets.css` anime `padding` sur `.period-navigation`. Deux remèdes, et le
  second vaut autant que le premier : **attendre que la valeur soit stable sur
  deux images**, et **comparer des nombres avec une tolérance sous le pixel**.
  Une longueur rendue est fractionnaire par nature ; exiger « 8px » au caractère
  près, c'est mesurer le formatage du moteur.
  **Troisième occurrence du même motif en deux jours** : `Math.round` sur une
  frontière de demi-pixel (121,5), `toBe` sur une chaîne de longueur, et la
  lecture pendant une transition. À chaque fois le contrôle était juste et la
  COMPARAISON trop exacte pour ce qu'elle mesurait.
- **`getComputedStyle` lu juste après un changement de style rend la valeur
  D'AVANT, si la propriété est en transition.** `onglets.css:361` déclare
  `.period-navigation { transition: padding … }`. Une sonde qui injecte une règle
  puis mesure dans la foulée lit donc l'ancien rembourrage — et conclut que sa
  règle « n'a pas pris ». Mesuré le 2026-09-07 : même avec `!important` et une
  valeur en dur, la sonde rendait obstinément `16px`.
  Neutraliser les transitions (`* { transition: none !important }`) **avant** de
  mesurer une géométrie, ou attendre. Le symptôme trompe : il ressemble à un
  problème de cascade, et on va chercher une spécificité qui n'est pas en cause.
- **Importer `playwright.config.js` depuis un `.mjs` rend un objet VIDE, et la
  suite entière rougit pour rien.** Le fichier est en ESM dans un paquet sans
  `"type": "module"` : Playwright le transpile, Node non. Un
  `import base from './playwright.config.js'` rend donc un objet sans `use`,
  donc **sans `baseURL`** — et chaque `page.goto('/FairSplit.html')` échoue sur
  « Cannot navigate to invalid URL ».
  Mesuré le 2026-09-07 : **110 échecs**, tous imputables à la config et aucun au
  changement qu'on croyait mesurer. Le symptôme trompe — il ressemble à une
  régression massive. Une config d'appoint s'écrit **autonome**, avec son
  `baseURL` en clair.
- **Une sonde de mise en page mobile relève la LARGEUR autant que la hauteur.**
  Mesuré deux fois le 2026-09-07, sur le même chantier : un instrument qui ne
  mesurait que la hauteur a rendu « 153 px » pour des variantes qui débordent la
  rangée de 6 à 62 px — une rangée qui déborde ne coûte aucune hauteur. Relever
  `scrollWidth > clientWidth` sur la rangée **et**
  `documentElement.scrollWidth > innerWidth` sur la page.
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
- **`detail-depenses.spec.js` : DEUX défauts, pas un — et l'affirmation « un
  seul point de chute » est réfutée par les artefacts (2026-09-07).**
  Elle a tenu deux jours. Les deux artefacts CI ont été **téléchargés et
  conservés** dans `docs/artefacts/detail-depenses/` ; ils se lisent avant toute
  reprise de ce constat, et le `error-context.md` du 2026-09-01 porte le code
  source figé qui tranche : à cette date, le test `:86:7` **cliquait en ligne**,
  le helper ne l'enveloppait pas encore.
  **Occurrence du 2026-09-01 — le clic n'atterrit jamais.** Ce n'est PAS
  « la modale n'a pas été créée » : c'est un recouvrement par barre collante à
  390 px. `locator.click` expire à 30 s, l'élément est « visible, enabled and
  stable », et le test de touche tombe sur autre chose 25 fois. Sortie du
  banc d'essai, mais **cause applicative** : voir le gotcha « Une barre collante
  mange le clic » dans *État et rendu*. Ce n'est plus un contrôle ouvert.
  **Occurrence du 2026-09-02 — le clic passe, la modale n'existe pas.**
  `element(s) not found` en 5 s. Or `#modalDetailDepenses` est **fabriqué en JS**
  (`detail-depenses.js:28`) : la rupture est strictement **avant**
  `document.body.appendChild`.
  *Reproduction* : `--repeat-each=20 --workers=14` sur ce seul fichier, **1 fois
  sur 200**.
  *L'horloge est RÉFUTÉE par la mesure*, pas écartée par raisonnement : le
  symptôme a été produit avec le mois semé égal au mois affiché, en plein mois ;
  et un mois vide créerait quand même la modale (« Aucune dépense… »).
  ***R1 est très affaibli par l'instantané ARIA***, et c'est l'artefact qui le
  dit : « Budgets par catégorie », « Tendances sur 6 mois », « Enveloppes » et
  « Privé » sont tous rendus, donc tout ce qui suit `initDetailDepenses`
  (`auth.js:464`) dans la chaîne `runStep` a tourné — `initCategoryBudgets` est
  en `auth.js:535`. Aucun toast « Chargement partiel ». Et `ouvrirDetailPayeur`
  (`detail-depenses.js:69`) ne peut pas sortir tôt : sa seule garde est
  `qui !== 'vous' && qui !== 'conjointe'`.
  **Restent R2 (exception avant `appendChild`) et R3 (clic sur un nœud
  détaché).** Le helper les relève au moment de l'échec.
  Ne pas refermer sur une explication non exécutée.
  **⚠️ Et la sonde peut avoir supprimé R3 en le mesurant.** Depuis la pose de
  l'instrumentation, **600 tirages n'ont rien déclenché** — quand le défaut
  paraissait 1 fois sur 200 juste avant. À ce taux, 5 % de chance de n'en voir
  aucun : c'est bas. Or `elementHandle()` ajoute un aller-retour **exactement
  dans la fenêtre où R3 se jouerait**, entre la lecture du libellé et le clic.
  Un résultat nul reste donc indiscernable entre « pas eu de chance » et « la
  sonde a déplacé ce qu'elle mesure », et **rejouer 400 tirages de plus avec le
  même instrument ne lèverait pas cette ambiguïté** — c'est pourquoi on ne le
  fait pas, et qu'on laisse la CI nommer la prochaine occurrence.
  **Ces 600 tirages muets ne prouvent RIEN sur la disparition du défaut.** Lire
  cette entrée comme « instrumenté, ne se reproduit plus » serait l'erreur
  exacte que la règle 1 décrit, appliquée à un instrument plutôt qu'à un
  contrôle : **une sonde qui ne peut plus rien voir ressemble à une surface
  saine.**
- **Au-delà de 4 workers, le banc fabrique ses propres échecs — à ne pas
  confondre avec un défaut.** Mesuré le 2026-09-06 : à `--workers=14`, la
  reproduction rend 10 à 18 `locator.click: Test timeout` et des
  `Protocol error … session closed` (le navigateur tombe). **La suite entière au
  réglage de la CI — `--workers=4` — en rend ZÉRO** sur 548 contrôles passés.
  Ces échecs-là sont de la contention, pas des défauts ; ils ne se produisent
  pas en CI, et les compter comme des symptômes ferait chercher une cause qui
  n'existe pas.
- **Les exceptions que la page lève sont désormais visibles partout**
  (`_harness.js`, `surveillerLesErreursDePage`). Quatre specs sur vingt-neuf
  posaient cet écouteur ; les vingt-cinq autres étaient aveugles, dont celle qui
  a fait tomber la CI deux fois. Il **parle sans faire échouer** — basculer 500
  contrôles d'un coup ferait rougir ce qu'on n'a pas mesuré. Mesuré à la pose :
  **0 exception sur 548 contrôles**, donc aucun bruit de fond à trier.
- **`share-mode.test.js` laisse tourner une chaîne asynchrone APRÈS la fin du
  fichier — CAUSE ÉTABLIE le 2026-09-07.** `selectShareMode` appelle
  `saveShareMode()` **sans `await`** (`share-mode.js:42` et `:104`) ;
  `saveShareMode` (`:130`) fait `await import('../db.js')` en `:139` ; `db.js:25`
  importe `utils/miroir.js`. Le test rend la main, le fichier finit,
  l'environnement est démonté — **puis** la chaîne reprend et réclame un module :

  ```text
  EnvironmentTeardownError: Cannot load '/public/js/utils/miroir.js'
  imported from public/js/db.js after the environment was torn down
  - /public/js/utils/miroir.js
  - public/js/db.js
  - public/js/modules/share-mode.js
  - tests/modules/share-mode.test.js
  ```

  La levée est rattrapée en `share-mode.js:146` et journalisée par `debug.error`
  → `console.error`. Or `onUserConsoleLog` est **exactement** le RPC par lequel
  Vitest remonte la console d'un worker : un `console.error` émis pendant la
  fermeture du RPC donne `Closing rpc while "onUserConsoleLog" was pending`.
  C'est le même événement, un cran plus tard. Seconde variante, même fichier,
  même motif : `recalculerApresChangementDeMode:68` → `await import('./carry-over.js')`.
  **Ce que l'entrée précédente affirmait, et qui était faux.** Elle a tenu deux
  jours et envoyait chercher au mauvais endroit :
  - « *une suite qui journalise beaucoup pendant sa fermeture* » — le fichier
    contient **zéro** `console.*`. La journalisation vient du code applicatif
    qu'il a laissé tourner, pas de lui ;
  - « *jouée seule, la suite passe* » — vrai, et ce n'est pas une exonération.
    Jouée seule, **6 fois sur 6**, elle fuit à l'identique : 21, 21, 21, 21, 21
    puis 5 erreurs post-démontage. La fuite est **inconditionnelle** ; seule sa
    conséquence visible est une course.

  Mesuré sur 6 passes complètes : **73 erreurs post-démontage, 73 remontant à
  `share-mode.test.js`**, aucune à un autre fichier de test — et `EXIT=0` six
  fois. Le drapeau rouge est donc rare, la fuite permanente. **Ne pas conclure
  d'une passe verte que le défaut a disparu** : c'est la règle 1 appliquée à un
  symptôme intermittent.
  **La règle 3 avait fonctionné** sur la contradiction d'origine — `3014 passed`
  affiché, `EXIT=1` rendu — et sans `echo EXIT=$?` avant le résumé la passe
  serait passée pour verte. Elle reste la bonne garde ; ce qui manquait, c'est
  d'avoir lu **la sortie d'erreur** plutôt que le seul code de sortie.

> **Il reste UN contrôle ouvert, et c'est un état correct, pas une dette.** Les
> deux autres ont été nommés le 2026-09-07 : `share-mode` a sa cause, et
> l'occurrence du 2026-09-01 de `detail-depenses` est un défaut de mise en page,
> pas un contrôle instable. Ce qui reste ouvert est l'occurrence du 2026-09-02,
> et elle n'est refermée sur aucune hypothèse — la règle 5 dit pourquoi.
>
> **Et la phrase que ce bloc portait était fausse.** Il affirmait que la
> première occurrence « n'avait rien laissé ». Les deux artefacts étaient
> encore téléchargeables au moment où on l'écrivait, et une commande le
> vérifiait :
>
> ```bash
> gh api repos/<dépôt>/actions/runs/<id>/artifacts --jq '.artifacts[] | [.name,.expired] | @tsv'
> ```
>
> C'est la règle 3 dans sa cinquième forme — *vert sur quoi ?* — appliquée à un
> constat plutôt qu'à un test : on a raconté ce qu'un échec avait laissé sans
> aller le chercher. **Le geste est de télécharger l'artefact AVANT d'écrire ce
> qu'il contient** ; `retention-days: 7` ne laisse pas de seconde chance.

### Livraison et commandes

- **`sw.js` tient sa liste de précache à la main** (112 entrées). **Tout module
  neuf doit y être ajouté**, sinon le rendu échoue hors ligne. La garde est
  **`tests/utils/service-worker-precache.test.js`**, cas « couvre tous les
  modules JavaScript publiés » : il énumère `public/**/*.js` et exige que chacun
  figure dans `STATIC_ASSETS`. C'est lui qui a rattrapé `utils/repartition.js`.
  **Et son voisin de nom ne tient PAS cette propriété.**
  `service-worker-installation.test.js` porte « chaque fichier du socle est
  réellement dans la liste de précache » — il vérifie `SOCLE ⊆ STATIC_ASSETS`,
  soit **8 fichiers critiques**, pas les 112. Un module neuf absent du précache
  le laisse **vert**. Mesuré le 2026-09-06 en retirant `utils/portee.js` de la
  liste : `service-worker-installation` rend 6 passés, `service-worker-precache`
  tombe en nommant le fichier manquant.
  Les deux sont justes et complémentaires — le premier empêche un socle qui
  nommerait un fichier jamais mis en cache, donc une installation qui échoue
  pour toujours ; le second empêche un module publié hors du cache. C'est leur
  ressemblance de nom qui trompe.
  > **Un gotcha qui désigne « un test » envoie chercher au mauvais endroit.**
  > La version précédente de cette entrée disait exactement cela, et l'imprécision
  > a coûté une fausse alerte le jour même : garde crue morte parce que le
  > mutant visait le fichier voisin.
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

- **Une spec ne fige l'horloge que si son semis dépend du calendrier**
  (critère reconstitué et mesuré le 2026-09-06, il n'était écrit nulle part).
  Sur 29 specs qui manipulent des dates, **5 figent** — `heure-de-la-depense`,
  `lecture-unique`, `projection-du-mois`, `tendances`, `tendances-metriques` —
  et ce sont exactement celles qui dépendent d'un **jour du mois** ou sèment des
  **mois absolus**. Les 18 qui sèment en **relatif** (`moisCourant()`) sont
  immunisées, sauf une passe à cheval sur un changement de mois : la clé de
  période est mensuelle, le jour ne vit que dans le champ `date`, donc une
  charge semée le 05 est lue tout le mois. Figer partout coûterait 24 réécritures
  pour un risque nul dans la plupart des cas.
  **⚠️ L'angle exposé, relevé et non traité** : `data-flow`, `regles-donnees`,
  `renommage` et `vues` sèment des **mois absolus sans figer l'horloge**. Elles
  passent aujourd'hui, et c'est le motif qui a fait rougir la CI le 2026-09-01.
  À reprendre dans son lot, pas en passant.
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
