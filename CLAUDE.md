# CLAUDE.md — FairSplit PWA

App web PWA de partage de charges en couple au prorata des salaires. Synchronisation temps réel Firebase, auth Google/Email, espace de données unique partagé par les comptes autorisés.

> **Version** : 4.0.0 | **Mise à jour** : 2026-09-16 | **Branche unique** : main

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
│       │                       # + `cheminDuPersonnel` (où vit la poche
│       │                       # personnelle — la connaissance de l'arbre est
│       │                       # ici, pas dans `perimetre.js`, qui est pur)
│       ├── state.js            # État global (lecture/écriture, sans abonnés)
│       ├── components/         # modal.js, toast.js
│       ├── modules/            # 32 modules fonctionnels — dont trash (rétablir
│       │                       # ce qui a été supprimé en douceur, sur tout
│       │                       # l'historique), selection-charges (agir sur
│       │                       # plusieurs charges à la fois),
│       │                       # versement-mensuel (la cagnotte qu'on alimente
│       │                       # sans y penser), resume-prive (ce que l'autre
│       │                       # voit d'un espace privé, selon la posture
│       │                       # accordée : rien, un total, ou le détail)
│       └── utils/              # 72 aides pures — dont phrase-reglement (ce qu'un
│                               # règlement fera au solde : « il reviendra à zéro »,
│                               # « il restera X à régler », « tu devras X » — la
│                               # seule protection contre la faute de frappe, le
│                               # trop-versé n'ayant aucun plafond),
│                               # decomposition (pourquoi
│                               # ma part vaut ce qu'elle vaut : une ligne par
│                               # RÈGLE appliquée, jamais par catégorie),
│                               # onglets (quel panneau
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
│                               # les trois postures, et ce
│                               # que chacune laisse franchir le mur),
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
│                               # elle qui affichait un chiffre faux ; porte
│                               # aussi l'UNIQUE rédaction de « commun + X
│                               # perso », lue par le pied comme par l'en-tête
│                               # de catégorie, et le renvoi qui dit où sont
│                               # parties les dépenses que la portée retire —
│                               # DEUX natures : mon personnel sous « À deux »,
│                               # chiffré ; le commun sous « Moi », sans aucun
│                               # nombre. Plus l'état vide des deux listes, en
│                               # nœuds construits et non en chaîne : une
│                               # chaîne assignée à `innerHTML` coûterait deux
│                               # sites au plafond, pour des phrases qui
│                               # n'interpolent rien),
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
├── tools/                      # 11 outils, hors `public/` donc jamais publiés :
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
│                               # liberer-les-ports.mjs (le jar d'émulateur qui
│                               # garde son port — quatre fois subi malgré son
│                               # gotcha, donc devenu une commande),
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
| `utils/debug.js` | 38 | 0 | Critique — le plus importé du dépôt |
| `state.js` | 35 | 1 | Critique — état global |
| `utils/format.js` | 30 | 0 | Critique — affichage monétaire |
| `components/toast.js` | 26 | 0 | Critique — feedback utilisateur partout |
| `db.js` | 26 | **21** | Critique — abstraction DB |
| `utils/date.js` | 25 | 0 | Important — date et période d'une charge |
| `utils/members.js` | 25 | 0 | Important — qui doit à qui |
| `utils/perimetre.js` | 24 | 0 | Important — ce qui pèse sur le solde |
| `poches.js` | 18 | 0 | Critique — les deux poches lues comme une seule |
| `utils/montant.js` | 19 | 0 | Important — lecture d'une saisie |
| `config.js` | 14 | 0 | Critique — `DATA_ROOT`, liste blanche |
| `modules/summary.js` | 14 | 6 | Important — calculs dépendants |
| `components/modal.js` | 13 | 2 | Important — piège à focus, confirmations |
| `utils/diagnostics.js` | 13 | 0 | Important — le journal qui survit au téléphone |
| `firebase-init.js` | 6 | 3 | Critique — connexion DB |
| `modules/auth.js` | 1 | 0 | Critique — **hub** : 30 imports statiques, 29 appels à `runStep` |

> **Relevé le 2026-09-08 par `node tools/adherences.mjs`, et quatre lignes
> avaient dérivé** — debug 35 → 36, state 31 → 32, date 24 → 25,
> summary 13/5 → 14/6. Un seul de ces écarts vient du lot du jour ; les trois
> autres s'étaient accumulés sur les lots précédents sans que personne ne
> recompte. C'est le défaut que ce tableau documente déjà pour lui-même :
> **le rejouer coûte une seconde, le croire coûte une décision.**

> **CINQUIÈME DÉRIVE, relevée le 2026-09-16 — et il y en avait DEUX, pas une.**
> `utils/perimetre.js` 17 → 18 avait motivé le recompte ; rejouer
> `node tools/adherences.mjs` **sans argument** a montré que `utils/format.js`
> était à 28 pour 27 annoncés, sur `main`, depuis un lot antérieur que
> personne n'a identifié.
>
> **C'est la leçon de ce recompte, et elle est plus large que le chiffre :
> vérifier UNE ligne ne dit rien des treize autres.** On corrige celle qui a
> attiré l'attention, on referme, et les voisines continuent de dériver — c'est
> le défaut que ce dépôt a déjà payé sur `encre-sur-surface.test.js`, où une
> leçon écrite trois cas plus haut n'avait été appliquée qu'à la garde qui
> avait rougi. **Le classement complet coûte une seconde.**
>
> Les deux autres écarts du jour viennent du lot P1a et sont les siens :
> `state.js` 32 → 33 et `utils/members.js` 17 → 18, tous deux parce que
> `backup.js` doit savoir QUI est connecté pour ne lire que sa poche.
>
> **Et rien ne tient ces chiffres.** `adherences-declarees.test.js` tient
> l'appartenance au tableau — quel module y figure —, jamais son compte : les
> six dérives sont donc toutes passées en vert. Voir le point 0 de « Ce qui
> reste OUVERT », dans les *Décisions de conception*.

> **Relevé le 2026-09-16 pour le lot P1b** — `poches.js` entre au tableau à
> **14 dépendants**, et quatre lignes bougent avec lui : debug 36 → 37,
> state 33 → 34, members 18 → 20, et **`db.js` passe de 22 imports dynamiques à
> 20**.
>
> Cette dernière est la seule qui DESCEND, et sa raison mérite d'être dite :
> `poches.js` s'importe **statiquement** partout, là où `db.js` s'importe
> presque toujours par `await import()`. Ce n'est pas une préférence de style —
> mesuré le 2026-09-16, un `poches.js` importé dynamiquement était résolu par
> Vitest **hors du graphe doublé** : le module recevait le VRAI `db.js` malgré
> un double en place, et quatre cas de `saisie-rapide.test.js` échouaient sur
> « Database not initialized » sans que rien ne désigne la cause. L'import
> statique la referme, et il est de toute façon le bon choix pour une couche
> qui s'intercale sous tout le reste.

> **SIXIÈME DÉRIVE, relevée le 2026-09-16 par le lot P1b — et le classement
> complet a été rejoué, pas la seule ligne qui avait rougi.**
> `adherences-declarees.test.js` a signalé `utils/diagnostics.js` à 13, absent
> du tableau. Rejouer `node tools/adherences.mjs` **sans argument** a montré que
> **six autres lignes** avaient bougé dans le même lot — `utils/debug.js`
> 37 → 38, `state.js` 34 → 35, `utils/format.js` 28 → 29, `db.js` 25/20 →
> 26/21, `utils/members.js` 20 → 23, `utils/perimetre.js` 18 → 21, `poches.js`
> 14 → 18. Toutes viennent de ce lot : `poches.js` est devenu le point de
> passage de la lecture, et `renommage.js`, `migration-poches.js`,
> `bascule-poche.js` l'importent avec ses voisins.
>
> **Rejoué une seconde fois à la fin du lot**, et deux lignes avaient encore
> bougé en trois commits : `utils/members.js` 23 → 22 (la migration lit
> `confidentialite.js` plutôt que `members.js`, pour n'avoir aucun repli
> d'emplacement) et `utils/perimetre.js` 21 → 22 (`recurrence.js` a gagné le
> périmètre). C'est la mesure de ce que coûte l'habitude de ne recompter
> qu'une fois : un lot de trois commits déplace ces chiffres trois fois.
>
> **Et les deux chiffres du hub étaient faux, faute de définition.** Le tableau
> annonçait « importe 28 modules et en initialise 26 ». Mesuré sur `origin/main`
> **avant** ce lot : 28 imports statiques — le premier chiffre était juste et
> sans définition écrite — et **27** appels à `runStep`, non 26. Les deux
> portent désormais le nom de ce qu'on compte, parce qu'un compte sans sa
> définition ne se refait pas :
>
> ```bash
> grep -c '^import ' public/js/modules/auth.js        # imports statiques
> grep -c 'await runStep(' public/js/modules/auth.js  # étapes initialisées
> ```
>
> C'est le point 0 de « Ce qui reste OUVERT » qui rend ces dérives possibles :
> la garde tient l'APPARTENANCE au tableau, jamais les comptes. Elle a fait son
> travail — elle a nommé le module qui franchissait le seuil — et elle ne
> pouvait rien dire des six autres.

> **SEPTIÈME DÉRIVE, relevée le 2026-09-17 par le lot P2 — et cette fois le
> classement complet a été rejoué AVANT d'écrire une seule ligne du tableau.**
> Trois lignes bougent, et **une seule des trois vient du lot du jour** :
>
> - **`utils/perimetre.js` 21 → 24**, et c'est le lot P2 : `utils/tri.js` et
>   `utils/portee.js` le lisent désormais, plus `utils/totaux-liste.js` qui le
>   lisait déjà. C'est l'effet voulu — la distinction de périmètre a cessé de
>   vivre par-dessus les fabriques pour entrer dedans ;
> - **`utils/members.js` 23 → 22** et **`auth.js` 28 → 29 appels à `runStep`** :
>   les deux datent de **P1b**, qui les avait mesurées et les avait écrites dans
>   sa propre note — « rejoué une seconde fois à la fin du lot, et deux lignes
>   avaient encore bougé » — **sans jamais les reporter dans le tableau**.
>
> **C'est une forme neuve du défaut, et elle est plus retorse que les six
> précédentes : le chiffre juste était écrit, en prose, trois paragraphes sous
> le tableau qui le contredisait.** Les six dérives antérieures venaient de
> n'avoir pas recompté. Celle-ci vient d'avoir recompté, consigné la mesure, et
> laissé le tableau dire autre chose — or c'est le TABLEAU qu'on lit avant de
> toucher à un module, jamais la note qui le commente.
>
> Le geste : quand un recompte est consigné en prose, **la même passe corrige la
> ligne du tableau**. Une mesure notée à côté de ce qu'elle démentait ne
> corrige rien, elle documente une contradiction.

> **Relevé le 2026-09-17 pour le lot « Moi » — et ce n'est PAS une dérive.**
> Une seule ligne bouge, `utils/members.js` 22 → 24, et elle est celle du lot :
> `search.js` et `selection-charges.js` doivent savoir QUI est connecté pour
> filtrer « Moi ce mois » sur le bon personnel. `utils/portee.js` passe de 9 à
> 10 dépendants — sous le seuil, donc hors tableau — et `utils/perimetre.js`
> reste à 24, ses deux nouveaux lecteurs l'important déjà.
>
> C'est ce que le classement complet coûte quand il est rejoué **dans la même
> passe que le lot** : une ligne à corriger, et treize dont on sait qu'elles
> n'ont pas bougé. La septième dérive vient de n'avoir pas fait ça.

> **Relevé le 2026-09-17 pour le lot du règlement à montant libre — et ce
> n'est PAS une dérive : le classement complet a été rejoué dans la même passe
> que le lot.** Trois lignes bougent, les trois sont les siennes, et elles ont
> toutes la même cause : `utils/phrase-reglement.js` — `utils/format.js`
> 29 → 30, `utils/members.js` 24 → 25, `utils/montant.js` 18 → 19. Les onze
> autres lignes n'ont pas bougé, et on le SAIT plutôt que de le supposer. Le
> hub est inchangé : 30 imports statiques, 29 `runStep`.

`auth.js` est le cas inverse des autres : presque personne ne l'importe, il
importe presque tout. Le compter par ses dépendants ne dit rien de son risque.

## Conventions

### CSS
- Tokens dans `public/css/variables.css` via `var(--xxx)`, jamais de valeurs en dur ailleurs
- Mobile-first. **Rupture principale : 900 px** — sous 899 px, les trois panneaux
  deviennent trois onglets (`onglets.css:38`) ; au-delà, la barre disparaît, la
  tête du bilan tient toute la largeur, et dessous les charges (1,4fr, à
  gauche) et la colonne des cartes (1fr) se partagent la rangée — zones
  nommées et sous-grille, `responsive.css`, « La silhouette des planches » ; le
  panneau Bilan y garde sa boîte, ce que `display: contents` lui aurait
  retiré. Réglages
  est un écran à part, ouvert par la porte « ⚙️ Réglages » de l'en-tête et
  refermé par « ← Retour au tableau de bord » (`onglets.css`, « Les portes du
  bureau »). Jusqu'au lot E (2026-09-11), Réglages était empilé sous le bilan,
  puis troisième colonne au-delà de 1600 px. C'est le même balisage des deux
  côtés.
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
- `npm run e2e` — la suite de bout en bout **sous émulateurs**, ports libérés
  d'abord. C'est la commande à employer : la lancer à la main a échoué quatre
  fois sur un jar résiduel dans la seule semaine du chantier
- `npm run ports` — libère les ports des émulateurs, et dit ce qu'il a tué

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

**La référence visuelle est `design/`** — six planches : `tableau-de-bord.html`
(1 tableau de bord sombre, 2 le même en clair, 3 Réglages et Outils),
`mobile.html` (4 à 390 px sombre, 5 à 390 px clair, **6 à 320 px, « les cinq
adaptations forcées »**) et `connexion.html`. La maquette est le **livrable**,
pas une inspiration : le chantier de structure de septembre en a traduit la
portée, les vues et la décomposition, et a laissé toute la mise en forme de
côté. C'est ce que les lots d'apparence reprennent.

> **Les chiffres des planches sont ceux du concepteur — re-mesurés le
> 2026-09-10, trois sur cinq tiennent.** La planche 6 chiffre « les cinq
> adaptations forcées » à 320 px. Rejouées sur le rendu réel, avec les fontes
> auto-hébergées du dépôt :
>
> | # | La planche affirme | Mesuré | |
> |---|---|---:|---|
> | 1 | héros 40 px = 168 px | **159,61** | tient, 8 px de marge en plus |
> | 2 | sous-ligne ≈ 251 px, « Alimentation » casserait | **177,45** de texte | **réfutée** |
> | 3 | « 2 888,43 € » = 132 px dans 136 | **119,70** | tient, 16 px restants et non 4 |
> | 4 | « 🤝 À deux » = 69 px pour 96 | **68** | exacte à 1 px |
> | 5 | pastille « ＋ Dépense » = 145 px | **81** + 58 = **139** | tient à 6 px |
>
> **La n° 2 est fausse dans le sens qui compte** : elle prescrit d'enrouler les
> libellés du grand-livre parce qu'il ne resterait « que 25 px ». Il en reste
> une cinquantaine, et le cas qu'elle nomme comme cassant — « Alimentation,
> prorata 71 % », 145,36 px — **entre**. L'enroulement reste défendable pour
> d'autres raisons ; il ne l'est pas par ce calcul.
>
> **Deux caveats qui valent pour toute mesure de ce genre ici :**
>
> - **`document.fonts.ready` n'attend QUE les fontes déjà employées par la
>   page.** JetBrains Mono 700 est bien déclarée (`variables.css:65`) mais
>   n'était pas téléchargée : `fonts.check()` rendait `false`, et le premier
>   relevé a mesuré une fonte de repli — 145,55 px au lieu de 159,61, soit 9 %
>   d'erreur dans le sens rassurant. C'est le **témoin positif** de la sonde qui
>   l'a dit, pas la relecture. Charger explicitement par `document.fonts.load()`
>   chaque couple graisse/taille avant de mesurer ;
> - **`🤝` et `＋` (U+FF0B) sortent de l'`unicode-range` des woff2** et sont donc
>   rendus par une fonte SYSTÈME. Les adaptations 4 et 5 dépendent de la
>   plateforme ; les chiffres ci-dessus sont ceux de Windows.

Principes UX :
- Le BILAN doit être la première section visible après la période
- **La tête du bilan porte la CRÉANCE, et seulement sur « À deux »**
  (2026-09-10, sur les six planches). « Tu dois **66,94 €** à Cindy » — 54 px au
  bureau, 40 px à 390, 32 px à 320, en ambre, seul chiffre coloré des trois
  cartes de tête. Le mois est nommé selon son état (`etatDuMois`).
- **Le fait symétrique reste, au rang 3** — « Dépensé à deux : 229,04 € », 31 px,
  encre neutre, troisième carte de tête ; et « Ta part du commun » ouvre le
  grand-livre. Il n'est pas supprimé, il est **rétrogradé**.
- **Appliqué au lot D (2026-09-11), avec trois entorses dites plutôt que
  cachées** : la carte 3 est en **21 px** et non 31 — elle vit dans la colonne
  du bilan, qui a la largeur d'un téléphone de 900 à 1100 px, jusqu'au lot des
  colonnes ; le grand-livre garde son **contenu** d'avant (« Total des
  charges », pas encore « Ta part du commun ») ; et il est **replié sous
  900 px**, ce que `mobile.html` ne fait pas — décision du foyer, sur son coût
  (250 à 337 px de premier écran à 320).
- **Les deux autres portées ne portent aucune créance** — et depuis les
  planches 12 à 16 (`design/bilan-par-portee.html`, 2026-09-11), chacune porte
  SA tête, par une fabrique et un gabarit (`utils/tete-du-bilan.js`) :
  - **Moi** : « Il te reste 2 888,43 € à vivre », encre neutre, suivi du
    grand-livre qui le vérifie — revenus − part du commun − dépenses solo. **Il
    exclut les dépenses privées** : c'est un plafond, pas un solde, dit sous le
    grand-livre avec « Les compter ». Les inclure ferait du reste un indice de
    ce qu'on a dépensé en privé, lisible par-dessus l'épaule ;
  - **Privé** : **pas de héros chiffré**, pour une raison mécanique — la portée
    vit en mémoire vive pour qu'un rechargement ne rouvre pas cet écran, et un
    grand chiffre en tête défait cette protection. Un titre qui dit la règle,
    selon le réglage réel, puis deux faces de permission.

  > **⟲ CE CADRAGE EST SUSPENDU LE 2026-09-16 — voir « Le personnel n'a qu'une
  > poche », en tête des *Décisions de conception*.** Privé cesse d'être une
  > portée : il devient une fenêtre en lecture seule sur le personnel de
  > l'autre, absente sans aval. Ce que ce point décrit reste EXACT pour le code
  > d'aujourd'hui — il est conservé pour cela, et il ne doit plus servir de
  > consigne. Le bloc des *Décisions* est ce qu'on applique.
  ~~Solo met un total personnel en encre neutre — « personne ne doit rien à
  personne dessus » — et Privé n'affiche aucun chiffre, sa tête est une phrase
  et son montant est masqué (`••••`).~~ Le fait symétrique, lui, ne paraît que
  sur « À deux ».
- **Le héros porte l'encre de son SENS** (2026-09-11, décision du foyer, et
  **écart assumé aux planches**, qui peignent la créance en ambre et le reste
  de « Moi » en encre neutre). Deux encres, jamais trois :
  - **À deux** : dette > 0 → `--danger-ink` ; sinon → `--success-ink` ;
  - **Moi** : reste > 0 → `--success-ink` ; sinon → `--danger-ink`.
  **Les deux zéros ne sont pas symétriques, et c'est voulu** : soldé est l'état
  sain ; un plafond à zéro est déjà négatif au pire. Ne pas les « harmoniser »
  — la raison est dans `SENS_DU_HEROS` (`utils/tete-du-bilan.js`), tenue par
  `tete-du-bilan.test.js` et `tests/e2e/sens-du-heros.spec.js`, qui lisent le
  SENS et jamais un hexadécimal.
- **La barre collante rappelle le solde sur « À deux » et « Moi », jamais sur
  « Privé »** (2026-09-11, vu à l'écran par le foyer) — la portée Privé ne
  porte aucune créance. Déclaré par `porteeRappelleLeSolde` (`utils/portee.js`),
  tenu par `portee.test.js` et `tests/e2e/barre-par-portee.spec.js`, rouge avant
  le correctif.
- **La portée gouverne TOUT le panneau Bilan** (2026-09-11, décision du
  foyer) : sous « Moi » et « Privé », aucune carte du bilan n'affiche de
  chiffre du foyer. **Refus par défaut, porté par le panneau** —
  `porteeMontreLeFoyer` (`utils/portee.js`) déclare, summary.js pose
  `data-lecture` sur `#panneauBilan`, et `summary.css` fait taire toute carte
  qui ne se déclare pas `data-lecture="personnelle"`. Aucune ne se déclare :
  mesuré, les quatre affichaient les catégories du foyer sous Moi et Privé,
  aucune n'a de version personnelle. **La colonne des cartes est donc vide sur
  ces deux portées**, et le foyer a demandé à la voir avant de la figer. Tenu
  par `portee.test.js` et `tests/e2e/portee-du-panneau.spec.js`, qui ne
  nomme aucune carte — rouge avant la règle.
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
>
> **⟲ ET CE RETRAIT EST RÉVOQUÉ LE 2026-09-10. Le bloc ci-dessus reste — c'est
> lui qui rend la révocation lisible.** Ce qui revient n'est pas l'ancien
> cadrage : c'est celui des planches, qui n'est pas le même.
>
> **Pourquoi la décision du 31/08 ne tient plus.** Elle a été prise **sans
> maquette, sur un raisonnement**, et **avant que la portée existe**. Son grief
> — « celui des deux qui doit le lit chaque jour » — supposait un écran unique
> où la créance serait la seule lecture possible. Cet écran n'existe plus : il y
> en a trois, et la mesure des six planches le dit :
>
> | Portée | Tête | Fait symétrique |
> |---|---|---|
> | **À deux** *(par défaut)* | créance, 54 px ambre | **oui**, rang 3, 31 px neutre |
> | Solo | total personnel, encre neutre, « personne ne doit rien à personne dessus » | non |
> | Privé | **aucun chiffre** — une phrase ; le montant est masqué `••••` | non |
>
> Le grief portait donc sur **un écran sur trois**. Il n'est pas nul pour
> autant, et il faut le dire : c'est **celui de l'ouverture**, la portée par
> défaut. La révocation est un arbitrage assumé, pas un désamorçage complet.
>
> **Et le fait symétrique n'est pas supprimé** — c'est la différence avec
> l'ancien cadrage, qui l'ignorait. Il passe de rang 1 à 28 px, à rang 3 à
> 31 px : il grossit de 3 px en perdant la tête. Ce que la maquette apporte est
> une **inversion de hiérarchie**, pas une amputation.
>
> **La raison de fond :** la maquette est le livrable. La respecter partout sauf
> sur sa tête donnerait un écran qui lui ressemble sans dire ce qu'elle dit.
>
> **Ce que `bilan-hierarchie` devient.** Il ne disparaît pas : **il change de
> sujet en gardant son argument.** Sa propriété qui compte — *le solde reste
> visible depuis la portée personnelle* — survit intacte ; c'est sa **surface**
> qui bouge, de `.bilan-tete` vers la carte de tête. Ses cas qui exigent
> `toContainText('Ensemble')` sur `.bilan-tete` (`:69`) et son absence de la
> barre collante (`:100`) sont à réécrire **sur la nouvelle hiérarchie**, pas à
> supprimer. ~~C'est le lot H.~~ **C'est le lot D, et c'est fait le 2026-09-11**
> — les deux fichiers sont réécrits, aucun cas supprimé. Le « lot H » n'a jamais
> existé que dans cette phrase (`refonte-lots.md`, §0).

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

**9 avérées, 3 évitées parce que le motif était nommé — détail en archive.** Dite
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

> **LA TROISIÈME ÉVITÉE, ET CE QU'ELLE A COÛTÉ POUR RESTER ÉVITÉE — 2026-09-09.**
> Le dépliant décompose la part par règle. Pour cela il lui faut l'assiette
> exacte que `computeSummary` a retenue — solo écartées, supprimées filtrées,
> montants illisibles ramenés à zéro. La refaire dans `summary.js` aurait tenu
> le premier jour, puis divergé au correctif suivant, et l'écran aurait montré
> **une décomposition dont la somme ne fait pas le total qu'elle explique.**
>
> `computeSummary` expose donc `chargesRetenues`. Deux enseignements en sont
> sortis, et aucun n'était prévu :
>
> - **exposer les charges ENTIÈRES a fait tomber `enveloppes.test.js`** — « une
>   enveloppe ne déplace pas un euro » compare deux bilans poste à poste, et un
>   champ `envelope` traversait la sortie sans qu'aucun euro n'ait bougé. Le
>   contrôle avait raison : **une sortie de calcul ne doit porter que ce qui
>   participe au calcul**, sinon elle change quand des données étrangères
>   changent. Projeté à `{ amount, splitOverride }` ;
> - **la garde de câblage ne mesurait rien**, et pour la raison exacte que ce
>   lot venait de nommer ailleurs. Le mutant — nourrir la décomposition de
>   `variableCharges` au lieu de `chargesRetenues` — restait VERT : sur le semis
>   du contrôle, toutes les charges étaient variables, communes et actives, donc
>   **les deux assiettes étaient identiques**. Il a fallu y ajouter une charge
>   fixe (que l'une manque) et une dépense solo (que l'autre ajoute).
>
> **Un jeu d'essai qui ne sépare pas les deux fabriques ne prouve ni l'une ni
> l'autre** — c'est ce que la règle exige déjà, et il faut se le redemander
> pour CHAQUE contrôle qu'on écrit, pas seulement pour celui qui a motivé la
> règle. Ici le même défaut a été rencontré deux fois dans le même lot : sur la
> maquette qui ne pouvait pas trancher entre deux lectures, puis sur ma propre
> garde.

### 3. On croit avoir mesuré, on n'a rien mesuré

**9 formes recensées — détail en archive, la neuvième ci-dessous.** Un jar d'émulateur qui garde son
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

**Et la huitième est ROUGE, pas verte — « rouge sur quoi ? » est la même
question.** Le 2026-09-09, la CI d'une PR annonçait « Lint et tests unitaires :
failure » et « Tests end-to-end : **skipped** ». La lecture immédiate — celle
que j'ai failli faire — est « mon lot casse quelque chose ». Les deux moitiés
étaient fausses :

- l'échec venait de `npm audit --audit-level=high`, sur un avis publié le matin
  même contre une dépendance transitive de développement. **Rien à voir avec le
  lot** ;
- et l'E2E n'avait pas « rien à signaler » : **il n'avait jamais tourné.** Un job
  qui s'arrête à une étape précoce fait passer les suivantes en `skipped`, et un
  `skipped` se lit comme un silence rassurant.

**Un rouge accepté sans savoir ce qui a tourné coûte autant qu'un vert.** On
allait fusionner sur des checks qui n'avaient pas porté sur le travail — la
cinquième forme, à l'envers.

**Le geste, en deux temps :**

1. **lire CE QUI a tourné**, pas seulement le verdict — `gh run view <id>
   --log-failed`, et repérer les étapes `skipped` qui suivent l'échec ;
2. **demander si `main` est rouge pour la même raison** — un héritage n'est pas
   une régression, et le remède n'est pas dans le lot.

```bash
gh run list --branch main --limit 3 --json databaseId,conclusion -q '.[]|[.databaseId,.conclusion]|@tsv'
gh run view <id> --log-failed
```

**Et la neuvième n'est pas une mesure de code : c'est un écran — « vu à l'écran »
n'est pas « commité ».** Le 2026-09-11, la couleur du héros a été validée à
l'écran par le foyer, puis #198 a été fusionnée sur `686f3e0` : le travail
validé n'était commité nulle part, il vivait dans l'arbre de travail.

Trois conditions s'y sont composées, aucune ne suffisait seule :

- le serveur local (`http-server public -p 3333`) sert **l'arbre de travail**,
  pas une branche : on voit du non-commité sans rien tirer, donc voir ne prouve
  rien de ce qui est commité ;
- le commit avait été lié à la suite complète (« je commite quand elle aura
  rendu son verdict ») — or un commit est local, gratuit et réversible ; c'est
  la FUSION qui a besoin de la suite complète, pas le commit ;
- la PR ouverte ne portait aucun signal du travail en vol — ni brouillon, ni
  commentaire : elle avait l'air finie. C'est le point 4 ci-dessous, en pire :
  rien n'étant commité, même `merge-base --is-ancestor` ne pouvait le voir.

**Le protocole supposait que « je pousse » et « tu regardes » portaient sur la
même chose, et rien ne le vérifiait. Le retour visuel porte sur un SHA, pas sur
un écran.**

**Le geste, avant CHAQUE « poussé, regarde » :**

```bash
git status --short          # VIDE, ou l'on s'apprête à faire regarder du non-commité
git rev-parse --short HEAD  # le SHA qu'on nomme dans le message
```

Et ses deux compléments : **commiter dès qu'un état est vert** — la suite
complète garde la fusion, pas le commit — et **mettre la PR en brouillon**
(`gh pr ready --undo`) dès qu'un travail est en vol pour elle.

> **C'était la seconde fois ce jour-là qu'un travail validé a failli
> disparaître.** La première : une branche qui portait un commit unique et en
> détruisait 1 500 lignes (voir *Livraison et commandes*, « `git log` et
> `git diff` ne répondent pas à la même question »). Les deux fois, ce qui a
> sauvé est d'avoir **mesuré avant d'agir** — le `--stat` là, le `git status`
> ici.

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

**5 hypothèses réfutées par la mesure — détail en archive — plus une sixième,
réfutée le 2026-09-10 et consignée ci-dessous.** Jamais énoncée comme
règle jusqu'ici : elle n'existait que par ses exemples. Le `grep` du sommaire
compte les mentions de l'**archive** ; la sixième vit ici, elle ne s'y trouvera
donc pas.

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

> **ET PIRE QUE LA THÈSE DE L'AUTEUR : L'ARTEFACT D'EXÉCUTION RECOPIÉ SANS SA
> DATE.** Une pile d'appels, une sortie de commande, un tableau de mesures sont
> des **sorties de machine** — donc ils ont l'air d'une preuve, et pas d'une
> opinion. C'est exactement ce qui les rend dangereux : une thèse d'auteur, on
> sait la mettre en doute ; **une pile recopiée, on la croit.**
>
> Or un artefact d'exécution est une preuve **DATÉE**. Il dit ce qui s'est
> produit un jour donné, sur un état donné du code — et il ne le dit pas
> lui-même. Recopié sans sa date, il passe pour intemporel.
>
> Mesuré le 2026-09-10 sur l'entrée `share-mode`. Elle se présentait comme
> « CAUSE ÉTABLIE », et portait la pile complète d'un
> `EnvironmentTeardownError` traversant `db.js` → `utils/miroir.js`. La pile
> était **authentique** : elle avait bien été obtenue, sur un état du fichier de
> test **antérieur au mock de `db.js`**. Depuis, le mock intercepte l'import et
> cette chaîne ne peut plus se produire — 0 mention de `db.js` dans la sortie,
> 0 levée portant l'étiquette de son `catch`. L'entrée a survécu **deux jours**,
> et ce n'est pas malgré la pile : **c'est grâce à elle.**
>
> **Ce qu'elle exige** — quand une entrée porte un artefact d'exécution, elle
> doit dire **de quand il date et sur quel état du code il a été obtenu**. Une
> ligne suffit : « relevé le AAAA-MM-JJ, avant le mock de `db.js` ». Sans elle,
> l'artefact est **plus difficile à mettre en doute qu'une thèse**, alors qu'il
> est plus périssable : une thèse reste vraie ou fausse, un relevé cesse d'être
> vrai dès que le code bouge sous lui.
>
> C'est la même famille que la quatrième réponse condamnante de la règle 1 — un
> contrôle qui nomme une surface se périme au premier déménagement, EN VERT. Ici
> c'est une **entrée** qui nomme un état, et elle se périme de la même façon :
> sans rougir, en restant parfaitement lisible.

**Ce qu'elle exige** — vouloir **prouver** l'explication plutôt que la raconter :
c'est le **mutant appliqué à une explication au lieu d'un contrôle**. L'exécuter
avant de bâtir dessus, lire toute sonde neuve **sur ses cas connus** d'abord, et
ne pas se contenter qu'une histoire soit cohérente. Le seul moyen de savoir si
une assertion de non-changement vaut quelque chose est de lui présenter un
changement.

**Et son revers, qui coûte autant** — refermer un constat sur une hypothèse
fausse est **pire** que le laisser ouvert : on cesse de le surveiller en croyant
l'avoir compris. Un contrôle tombé une fois et non reproduit reste ouvert.

> **UN ÉCART RELEVÉ SUR UN JEU DE DONNÉES PAUVRE PEUT ÊTRE UN ÉCART DE
> DONNÉES.** Le 2026-09-12, l'écran rendait « Où vous dépensez » et
> « Enveloppes à deux » réduites à un bouton. Le constat était juste, sa cause
> ne l'était pas : le mois affiché ne portait **aucune dépense localisée ni
> aucune enveloppe**. Semé — deux passages à Landivisiau, un à Saint-Goazec,
> une enveloppe alimentée —, le même code écrit les montants, le total et le
> nombre de passages.
>
> Ce qui l'avait rendu invisible est que **les deux lectures sont vraies** :
> « la carte ne montre qu'un bouton » décrit exactement l'écran, et
> « l'implémentation est incomplète » en est une explication plausible. Le
> désaccord ne porte pas sur ce qu'on voit, mais sur ce qui le produit — et
> c'est précisément ce qu'un écran vide ne peut pas dire.
>
> **Le geste : avant de conclure qu'un rendu manque, SEMER ce qu'il devrait
> montrer.** Si l'écran parle alors, l'écart est de données. S'il se tait
> encore, il est d'implémentation — et on sait lequel des deux on répare.

## Les gotchas vivants

Pièges **encore actifs**, vérifiés contre le code le 2026-09-05 — pas déduits de
leur formulation. Ils vivaient noyés dans 184 000 caractères de journal, alors
que ce sont exactement les choses à savoir **avant** de toucher au code.
Dédupliqués : `$autre: false` était raconté cinq fois, `fusionnerListe` six.

### Base de données et règles

- **Tout nœud neuf est refusé après un toast de succès.** Écrire un champ ou un
  nœud non déclaré part, paraît réussir côté client, et est rejeté par le
  serveur. Déclarer la règle **en même temps** que le champ.

  > **⚠️ MAIS « chaque objet est fermé par `$autre: false` » EST FAUX, et le
  > compte de 52 qui l'accompagnait n'était pas celui-là.** Corrigé le
  > 2026-09-16, sur mesure. Les 52 étaient **tous** les `$autre` du fichier,
  > dont **42 seulement** valaient `false` ; les 10 autres bornent un scalaire
  > (`isBoolean() || isNumber() || (isString() && length <= 500)`).
  >
  > Et les 10 ouverts sont exactement ceux qui comptent ici : **l'objet CHARGE
  > et son `location`**. Un champ inconnu sur une charge **passe**, s'il est
  > simple et court — c'est délibéré, une sauvegarde d'une version antérieure
  > doit pouvoir être restaurée (`SECURITY.md`, § 3). Ce sont les
  > CONTENEURS et les objets de réglage qui sont fermés, jamais la charge.
  >
  > Relevé après le lot P1a : **84 `$autre`, 58 fermés par `false`, 26 bornés à
  > un scalaire** — le personnel a recopié le schéma de charge, donc ses
  > `$autre` ouverts avec. Le compte se refait :
  >
  > ```bash
  > node -e 'const d=JSON.parse(require("fs").readFileSync("database.rules.json","utf8")).rules;
  >   let f=0,o=0;(function w(n){if(!n||typeof n!=="object")return;
  >   for(const[k,v]of Object.entries(n)){if(k==="$autre")
  >     (v&&v[".validate"]===false)?f++:o++;w(v)}})(d);
  >   console.log(f+o,"$autre —",f,"fermés,",o,"bornés")'
  > ```
  >
  > **Un compte recopié sans sa définition est plus dangereux qu'un compte
  > absent** : celui-ci a servi à généraliser « chaque objet est fermé », et
  > c'est sur cette généralisation qu'on a failli appauvrir le schéma du
  > personnel pour le « fermer » comme ses voisins.
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
- **Une classe neuve se vérifie contre `main` avant d'être posée.** Le
  2026-09-11, la section de tête du bilan a été nommée `.bilan-tete` — nom
  déjà pris par l'étiquette « Solde du mois », en `text-transform:
  uppercase` (`summary.css:553`). Toute la tête s'est affichée en capitales,
  et c'est un test sur le texte du bandeau qui l'a vu, pas la relecture. Le
  geste, avec son témoin positif (un nom connu doit rendre plus de zéro) :
  `git grep -nE "(\.|class=\"[^\"]*\b|id=\")NOM\b" origin/main -- public/`.
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
  **Un seul contrôle du dépôt tournait au doigt** — `cible-tactile.spec.js`, à
  390 px — et il vérifie que ces règles *s'appliquent*, jamais **ce qu'elles
  coûtent ailleurs**. Tous les contrôles de budget et de géométrie mesuraient
  donc un écran que personne n'affiche.
  Ils sont **quatre** depuis : `onglets:280` (2026-09-07), `grand-livre`,
  `portee-selecteur`, et `coherence-visuelle` — le balayage entier, quatre
  largeurs × deux pointeurs, renforcé le 2026-09-09. Ce dernier porte ses deux
  témoins : une commande difforme injectée sous `pointer: coarse` est VUE par la
  moitié tactile et invisible pour l'autre. Le renfort a d'ailleurs commencé par
  ne rien démontrer — voir le gotcha suivant.
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

  **Ce que l'en-tête coûtait au doigt — mesuré le 2026-09-07, ✅ APPLIQUÉ le
  jour même (#172).** L'en-tête est en `flex` avec `align-items: center` : sa
  hauteur est celle de son plus haut enfant, et cet enfant était `#userInfoBar`
  à 44 px, tenu par le `min-height` du bouton de déconnexion.

  | Forme de la déconnexion | En-tête | Premier contenu à 320 | Gain |
  |---|---:|---:|---:|
  | bouton texte *(l'ancien)* | 54 px | 140 px | — |
  | bouton d'icône 44 × 44 | 54 px | 140 px | 0 px |
  | **hors de l'en-tête** *(retenu)* | **36 px** | **122 px** | **18 px** |

  **Le bouton d'icône ne rendait RIEN**, et il fallait le mesurer plutôt que le
  supposer : une icône reste un `button`, donc reste à 44 px de haut. Ce qui
  coûtait n'était pas sa largeur, c'était sa présence. Masquer l'avatar en plus
  n'y changeait rien — il n'était pas la contrainte.

  **La déconnexion vit dans Réglages depuis.** Vérifié le 2026-09-09 : l'en-tête
  mesure **36 px au doigt** et le premier contenu est à 162 px — les 18 px ont
  été encaissés. Ce qui reste ici est la MESURE, parce qu'elle dit pourquoi la
  troisième ligne a été retenue et pourquoi la deuxième ne servait à rien.

  > **Cette entrée a porté « CONSIGNÉ, non appliqué » pendant deux jours après
  > l'avoir été.** Une note qui se lit comme une dette et n'en est plus une
  > envoie chercher un travail déjà fait — et, pire, laisse croire que 18 px
  > restent à gagner là où il n'y en a plus. Le geste : quand une mesure
  > consignée devient un correctif, **c'est le même jour qu'on retourne changer
  > le mot**, pas au prochain inventaire.

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

- **Une barre collante mange le clic sur le grand-livre — ✅ CORRIGÉ le
  2026-09-09, et le contrôle qui manquait existe.** Sous 900 px l'écran
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
  **Le remède écrit ici depuis le 2026-09-01 n'était pas tout à fait le bon**, et
  c'est la mesure qui l'a dit. Il annonçait `scroll-margin-top` sur la cible ;
  c'est `scroll-padding` sur le **conteneur** qui est posé — les deux barres ne
  sont la propriété d'aucune ligne, et une marge sur les lignes du grand-livre
  aurait laissé le prochain élément qu'on amène dans la vue retomber dans le
  même trou. Les deux réserves sont dans `onglets.css`, sous 900 px, aux jetons
  `--bandeau-colle-h` (103 px) et `--barre-onglets-h` (57 px).
  **Et il ne corrige pas ce qu'on croyait.** Un balayage complet relève
  **22 positions de défilement à 320 px** où le centre d'une ligne appartient à
  une barre — mais un bandeau `sticky` recouvre par construction ce qui défile
  dessous, et aucune valeur de `scroll-*` n'y change rien. Ce qui n'avait aucun
  recours, et qui est réparé, c'est le **geste** qui amène quelqu'un sur une
  ligne pour la toucher : `scrollIntoView()` la garait à `top: 0`, sous le
  bandeau.
  Le contrôle qui manquait est `tests/e2e/clic-au-bord.spec.js` —
  `elementFromPoint()` au centre de chaque ligne, après chacun des deux gestes,
  aux deux largeurs, au doigt. Éprouvé par mutation : retirer la réserve du haut
  fait tomber le cas de 320 sur `#periodSelect`, retirer celle du bas fait
  tomber celui de 390 sur `.onglet`. Deux moitiés indépendantes, aucune ne
  couvre l'autre.

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

- **`scrollIntoView({ block: 'center' })` amène la cible là où aucune barre ne
  vit.** Une sonde qui cherche un recouvrement par barre collante et centre sa
  cible ne visitera jamais le cas : les deux barres sont **aux bords**, et
  « centre » est très exactement leur complément.
  Mesuré le 2026-09-09. Je cherchais un défaut que je savais vivant — 25
  interceptions dans un artefact de CI — et l'instrument a répondu
  `interceptions: []`. **Le signal n'était pas une relecture du code, c'était
  l'INVRAISEMBLANCE** : un résultat qui ne ressemble pas à ce qu'on sait déjà.
  Rejoué par balayage complet du défilement, une position tous les 10 px : 22
  positions à 320 px, 4 à 390.
  **Le geste** : une sonde de recouvrement balaie, elle ne se place pas. Et
  quand elle doit se placer, elle emploie le geste qu'on éprouve —
  `scrollIntoViewIfNeeded` pour reproduire Playwright, `scrollIntoView()` pour
  reproduire le code de l'application — jamais un troisième, choisi pour la
  commodité de la mesure.

- **Un balayage qui filtre sur le viewport ne voit que le premier écran, et il
  ne défile jamais.** `coherence-visuelle` portait, sur sa propriété
  HORIZONTALE — « aucune commande ne dépasse de l'écran » —, un filtre
  VERTICAL : `if (r.bottom <= 0 || r.top >= innerHeight) continue`.
  Mesuré le 2026-09-09 : un bouton de **900 px de large** sur un écran de 320
  — `right: 941` — était ignoré parce qu'il vivait à `top: 1257`. Sur un bilan
  semé à 320 px, la moitié du panneau échappait au contrôle.
  Le filtre n'achetait rien : les éléments non rendus sont déjà écartés par
  `r.width === 0`, et une commande qui dépasse à droite est tout aussi
  inatteignable qu'on ait défilé jusqu'à elle ou non.
  **Le geste** : vérifier que les filtres d'un balayage portent sur le MÊME AXE
  que la propriété. Un filtre sur l'autre axe ne borne pas le bruit, il retire
  de la couverture — et il le fait en silence, puisque ce qu'il écarte n'est
  jamais compté.

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

  | | au relevé | recompté le 09-09 au soir |
  |---|---:|---:|
  | specs E2E | 57 | **59** |
  | ne fixent aucune largeur (`viewport`, `setViewportSize`, `devices[…]`) | 32 | **31** |
  | parmi elles, qui touchent une géométrie | 3 | **2** |
  | qui font une **affirmation de mise en page** | **1** | **0** |

  La dernière colonne est le même comptage rejoué après les correctifs : la
  seule affirmation de mise en page sans largeur déclarée était
  `depense-privee`, et elle en déclare deux depuis. Les deux qui restent —
  `raccourci` et `prive-bac-a-sable` — n'en font pas : un contrôle d'ordre
  d'empilement et une aide à la visibilité.

  Les autres ne mesurent aucune géométrie, et 1280 leur convient. Donner un
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
- **Un contrôle de recouvrement qui ne collecte que des COMMANDES laisse
  passer tout le reste — et sa limite était écrite dans son commentaire.**
  `coherence-visuelle`, « aucune commande du contenu n'en recouvre une
  autre », compare `button, a[href], select, input`. Le 2026-09-12, le bandeau
  du partage (qui porte un bouton) et le prévisionnel (qui n'en porte aucun)
  se chevauchaient de 8 px à 390, 900 et 1280 px : la paire n'a jamais été
  comparée, et la suite entière est restée verte. Le commentaire du contrôle
  disait déjà, à propos d'un dépliant : *« ce contrôle ne collecte que des
  commandes, et une division n'en est pas une »*. **Une limite consignée dans
  un commentaire n'est pas un contrôle.** `blocs-du-bilan.spec.js` tient
  désormais la propriété sur des FRÈRES de pile, quels qu'ils soient — le
  défaut venait d'une marge négative (`.summary-previsionnel`, −8 px) qui a
  trouvé un voisin qu'elle n'attendait pas.
- **Fermer une modale RESTITUE le défilement de son ouverture — c'est le
  navigateur, pas le code.** `showModal` pousse une entrée d'historique
  (`empilerCouche`), `closeModal` la consomme par `history.back()`, et
  `history.scrollRestoration` vaut `'auto'` : la page revient, **de façon
  asynchrone**, là où elle était à l'ouverture. Mesuré le 2026-09-11 à
  1280 × 720 : 831 px à l'ouverture, 891 après la fermeture malgré un
  `scrollTo(0, 0)` posé entre-temps ; 0 avec `'manual'`. Pour la personne,
  c'est juste — on revient où l'on était. Pour le banc d'essai, un `scrollTo`
  posé avant une assertion de géométrie est défait sous ses yeux : remettre la
  position **dans** un `expect.poll`, à chaque essai (`data-flow:827`). Deux
  hypothèses sont tombées avant celle-ci — le focus rendu au déclencheur, le
  bouton recréé par le rendu.
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
  **Depuis le lot E (2026-09-11), « on a navigué » a deux chemins** : une
  commande visible qui NOMME le panneau — l'onglet sous 900 px, une porte au
  bureau (`.porte[data-panneau]`) —, ou une destination voisine qui le fait
  paraître. Le second existe parce qu'au bureau, sur l'écran Réglages, aucune
  commande ne nomme les charges : « ← Retour au tableau de bord » nomme le
  bilan, et montre les charges avec lui. `garde-du-panneau.spec.js` tient les
  quatre issues.
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
- **Une chaîne asynchrone qui survit à la fin d'un fichier de test réclame un
  module après le démontage.** Le motif : un appel à une fonction `async` sans
  `await` rend la main tout de suite, mais sa chaîne continue. Le test finit, le
  fichier finit, Vitest démonte l'environnement du worker — **puis** la promesse
  reprend et demande un module. D'où `EnvironmentTeardownError`, rattrapée par le
  `catch` applicatif et journalisée par `debug.error` → `console.error`. Or
  `onUserConsoleLog` est **exactement** le RPC par lequel Vitest remonte la
  console d'un worker : un `console.error` émis pendant sa fermeture donne
  `Closing rpc while "onUserConsoleLog" was pending`, et un `EXIT=1` sur une
  passe où tous les tests sont verts. **La fuite est inconditionnelle, la course
  est le seul élément intermittent** — une passe verte ne prouve donc rien.
  ✅ **Corrigé sur `share-mode.js` le 2026-09-10** (import statique de
  `carry-over.js` + `void` aux deux sites d'appel), et tenu par
  **`tests/fuite-post-demontage.test.js`**, qui rejoue la suite visée dans un
  sous-processus et lit la « last recorded callstack » de chaque levée. Ce qui
  reste ici est le motif, encore vivant partout ailleurs.

  > **DEUX AFFIRMATIONS DE CETTE ENTRÉE ÉTAIENT FAUSSES, ET ELLE SE PRÉSENTAIT
  > COMME « CAUSE ÉTABLIE ».** Corrigées le 2026-09-10 après remesure. Elles ont
  > tenu deux jours et envoyaient chercher au mauvais endroit :
  >
  > - **la cause principale annoncée ne peut pas se produire.** L'entrée nommait
  >   `saveShareMode` → `await import('../db.js')` (`:139`) → `db.js:25` →
  >   `utils/miroir.js`, avec la pile recopiée. Or `share-mode.test.js:7` **mocke
  >   `db.js`** : le mock intercepte l'import dynamique, `db.js` n'est jamais
  >   chargé. Remesuré — **0 mention de `db.js` ou de `miroir.js`** dans la
  >   sortie, et **0 des 21 levées** ne porte l'étiquette
  >   `❌ Erreur sauvegarde mode partage` du `catch` de `saveShareMode`. La
  >   seule chaîne vivante est celle que l'entrée reléguait en « seconde
  >   variante » : `recalculerApresChangementDeMode` (`:68`) →
  >   `await import('./carry-over.js')` (`:70`) → `calculations.js` → feuille,
  >   et **les 21 levées portent son étiquette**, `❌ Report non recalculé après
  >   changement de mode` ;
  > - **la feuille réclamée n'est pas stable.** Même défaut, trois modules en
  >   trois mesures, selon le cache de modules de la passe : `utils/miroir.js`
  >   au relevé du 2026-09-07, `utils/salaries.js` sur le fichier joué seul le
  >   2026-09-10, `utils/perimetre.js` sur la suite entière le même jour. C'est
  >   ce qui justifie que le contrôle tienne la **racine** de la pile — le
  >   fichier de test, seul élément stable de la chaîne — et jamais la feuille.
  >   **Un contrôle qui l'aurait nommée se serait périmé EN VERT** au premier de
  >   ces déplacements : c'est la quatrième réponse condamnante de la règle 1,
  >   « il interroge la surface où la chose vit, pas la propriété ».
  >
  > **Et les deux valent au-delà du cas. Une entrée qui dit « cause établie »
  > doit dire PAR QUELLE MESURE, et laquelle a été rejouée.** Ce que cette
  > entrée a coûté est devenu la **sixième réfutation de la règle 5** — un
  > artefact d'exécution recopié sans sa date se croit plus qu'une thèse, et se
  > périme plus vite. Le geste est là-bas, il n'est pas redit ici.

  Ce qui reste exact de la mesure d'origine, et qui a été rejoué le 2026-09-10 :
  la fuite est **inconditionnelle**. Jouée seule, 6 fois sur 6, elle fuyait à
  l'identique (21 erreurs), et sur 6 passes complètes **73 erreurs
  post-démontage, 73 remontant à `share-mode.test.js`**, aucune à un autre
  fichier de test, `EXIT=0` six fois. Remesuré le 2026-09-10 avant correctif :
  **21 levées, les 21 enracinées dans `share-mode.test.js`, zéro ailleurs** sur
  168 fichiers et 3078 tests verts, `Closing rpc` absent. **Ne pas conclure
  d'une passe verte que le défaut a disparu** — règle 1 appliquée à un symptôme
  intermittent.
  **La règle 3 avait fonctionné** sur la contradiction d'origine — `3014 passed`
  affiché, `EXIT=1` rendu — et sans `echo EXIT=$?` avant le résumé la passe
  serait passée pour verte. Elle reste la bonne garde ; ce qui manquait, c'est
  d'avoir lu **la sortie d'erreur** plutôt que le seul code de sortie.

- **27 appels flottants du même genre vivent dans le dépôt, et un seul fuyait.**
  Relevé le 2026-09-10 : 27 appels à une fonction `async` déclarée et appelée
  dans le **même** fichier, sans `await` ni consommation, répartis sur 12
  modules — `choix-lieu` ×2, `custom-lists` ×2, `envelopes` ×3, `map` ×2,
  `notifications` ×4, `period` ×1, `quick-add` ×5, `search` ×1, `share-mode` ×4
  (corrigés), `connection-banner` ×2.
  **Aucune campagne n'est lancée, et c'est mesuré plutôt que supposé** : sur la
  suite entière, une seule spec fuit. Un appel flottant ne devient une fuite
  post-démontage que s'il **charge un module** après la fin du fichier ; les
  autres sites sont soit jamais atteints par un test unitaire, soit atteints avec
  leurs dépendances asynchrones mockées.
  > **La limite du balayage, dite parce qu'elle compte : il ne voit QUE les
  > appels dont la fonction est déclarée dans le même fichier.** Un appel
  > flottant vers une fonction `async` **importée d'ailleurs** lui échappe
  > entièrement, et il n'y a pas d'heuristique bon marché pour le voir — il
  > faudrait résoudre les imports et savoir quelles exportations sont `async`.
  > Ce trou n'est pas couvert par le balayage : il est couvert par **la passe
  > complète**, où une telle fuite se serait affichée comme les 21 autres. C'est
  > donc la passe qui fait autorité sur « y en a-t-il d'autres », et le balayage
  > qui sert à dire « où le motif existe-t-il encore ».
  >
  > La forme générale du contrôle serait la suite ENTIÈRE dans le
  > sous-processus : elle nommerait la prochaine fuite dans n'importe quel
  > fichier. La commande est écrite en tête de `tests/fuite-post-demontage.test.js`
  > et **délibérément non branchée** — deux minutes par passe pour le verdict
  > qu'on vient d'obtenir à la main.

> **Il reste UN contrôle ouvert, et c'est un état correct, pas une dette.** Les
> deux autres sont refermés : `share-mode` a son correctif et sa garde depuis le
> 2026-09-10 — sa cause avait été nommée le 2026-09-07, et **à moitié faux**,
> voir ci-dessus — et
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

### Le prix d'une ouverture

- **Une étape d'initialisation qui lit `periods` de son côté DOUBLE le coût
  d'une ouverture, et `lecture-unique.spec.js` est le seul à le dire.** Mesuré
  à douze mois de données : `periods` pèse **96 % des octets** téléchargés à
  l'ouverture, et à cinq ans c'est 568 Ko par lecture. `initializeAppData` le
  lit **une fois** — c'est l'étape de migration des poches qui le rapporte
  depuis le lot P1b — et le passe à toutes les étapes qui en ont besoin, par un
  paramètre `historique` toujours OPTIONNEL : l'oublier coûte une lecture,
  jamais un chiffre faux.
  **Le lot P1b l'a cassé deux fois d'un coup, et c'est le contrôle qui l'a
  dit** — `periods` lu 3 fois, chaque poche 2 fois. Deux étapes neuves
  lisaient chacune l'historique : la migration des poches et la reprise des
  libellés personnels. Le remède n'est pas de relâcher le contrôle : la
  migration rend son instantané, la reprise le reçoit.
  **Et le raisonnement qui autorise à réutiliser l'instantané est écrit, parce
  qu'il n'est pas évident : le nœud FUSIONNÉ est invariant sous la migration.**
  Déplacer une charge d'une poche à l'autre change son chemin, jamais
  l'ensemble que la fusion réunit. Le nœud COMMUN, lui, change bel et bien — et
  c'est pour cela que c'est lui, et lui seul, que la migration inspecte
  (`lireLesPoches`, qui rend les trois nœuds et leur fusion en une passe).
  Une étape neuve qui a besoin de l'historique **reçoit** l'instantané ; elle
  ne le lit pas.

### Livraison et commandes

- **`sw.js` tient sa liste de précache à la main** (135 entrées). **Tout module
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
  > **⚠️ Et un TERNAIRE affecté à `innerHTML` compte comme un site, même entre
  > deux littéraux qui n'interpolent rien.** Mesuré le 2026-09-17 : le lot P2
  > remplaçait, dans les deux modules de liste, un état vide littéral par
  > `innerHTML = condition ? 'littéral A' : 'littéral B'` — et le plafond
  > passait de **24 à 26**, sur deux chaînes sans une seule donnée.
  > `no-unsanitized` ne reconnaît qu'une expression littérale : une
  > `ConditionalExpression` n'en est pas une, quoi qu'elle contienne.
  >
  > Le remède ne coûte rien : **deux branches, deux affectations littérales**.
  > Ce qu'il faut savoir, c'est que le plafond est à marge nulle et qu'il
  > refuse alors un ajout qui n'ouvre AUCUNE surface — un refus qu'on prend
  > pour un faux positif si on ne sait pas d'où il vient, et qu'on est tenté de
  > régler en déplaçant le plafond.
  >
  > **Et la SORTIE de ce piège, quand les branches se multiplient : construire
  > le DOM.** Le lot « Moi » a porté ces états vides de quatre rédactions à
  > six, dans deux fichiers — la règle 4 à l'état pur. Les réunir dans une
  > fabrique qui rend une CHAÎNE aurait fait 26 ; une fabrique qui pose des
  > nœuds (`createElement` + `replaceChildren`) coûte **zéro**, et le précédent
  > était déjà dans le fichier où la rédaction devait vivre — `afficherLeRenvoi`,
  > `utils/totaux-liste.js`. Le plafond n'interdit donc pas la fabrique : il
  > interdit de lui faire produire du balisage en chaîne.
- **`no-control-regex` est une ERREUR**, pas un avertissement : elle vient de
  `js.configs.recommended` (`eslint.config.mjs:26`), sans clause `files`. Et la
  CI lance `npx eslint .`, qui couvre `tests/`.
- **`--reporter=basic` n'existe pas en Vitest 4** (`^4.1.0`). La suite ne tourne
  pas du tout, et un `tail` sert alors le résumé d'une exécution précédente.
- **Le jar d'émulateur survit à son arrêt — ✅ le geste a changé le 2026-09-09.**
  `firebase emulators:exec` annonce « Stopping Database Emulator » sans toujours
  l'obtenir : `java` garde le port, et la passe suivante échoue sur `port taken`.

  > **Cette entrée a porté ses trois commandes manuelles pendant des semaines, et
  > le défaut a été subi QUATRE FOIS de plus dans la seule semaine du chantier.**
  > À chaque fois la suite entière n'a pas tourné, et à chaque fois le premier
  > réflexe a été de lire le résumé plutôt que le code de sortie.
  >
  > C'est le même constat que les artefacts perdus trois fois : **une leçon
  > qu'on réapprend n'est pas apprise.** Ce qui manquait n'était pas la
  > connaissance — elle était écrite ici — c'était un geste qui coûte moins cher
  > que l'oubli.

  **`npm run ports`** lit les ports dans `firebase.json`, nomme qui les tient
  avec son heure de démarrage, et ne tue que `java`. Il est branché en `pre`
  devant tout ce qui démarre un émulateur : `npm run emulators`,
  `npm run emulators:test`, `npm run couverture:e2e`. Et **`npm run e2e`** est
  la suite complète sous émulateurs, ports libérés d'abord.

  Il ne tue que `java` à dessein : un port peut être occupé par autre chose, et
  tuer à l'aveugle serait pire que l'échec qu'on évite. Il ne le fait jamais en
  silence non plus — l'heure de démarrage est affichée en clair, parce que c'est
  elle qui distingue un jar résiduel d'un émulateur qu'on venait de lancer
  exprès.
- **`git checkout -- <fichier>` pour défaire un mutant efface le correctif en
  cours**, puisqu'il restaure HEAD et que le travail n'est pas commité. Copie de
  sûreté **avant** de muter, restauration par `cp`. Le piège est discret : le
  rouge qui suit ressemble à un mutant mal défait, pas à un correctif effacé.

- **`git log main..branche` et `git diff main..branche` ne répondent PAS à la
  même question, et seule la seconde protège d'un merge destructeur.**

  | Commande | Ce qu'elle dit |
  |---|---|
  | `git log main..branche` | ce que la branche **apporte**, en SHA |
  | `git diff main..branche --stat` | ce qu'un merge **changerait**, en arbres |

  Une branche périmée a un `log` court et rassurant — elle n'a rien fait de plus
  — pendant que son `diff` porte **tout ce que `main` a gagné depuis** en
  négatif. Le `log` est une liste de commits, le `diff` est une comparaison
  d'états : c'est la règle 3 appliquée à git, « un commit, sur quoi ? ».

  **Deux cas mesurés le 2026-09-11, tous deux sur des branches qu'on
  s'apprêtait à fusionner :**

  - **deux commits de documentation, aucun fichier de code touché.** Le `log`
    rendait exactement les deux commits attendus. Le `--stat` rendait
    `package.json`, `package-lock.json` et `tests/utils/retour.test.js` — trois
    fichiers que la branche n'avait jamais ouverts. Le merge aurait rétrogradé
    **Playwright 1.63 → 1.62, Vitest 5 → 4, coverage-v8 5 → 4, eslint 10.10 →
    10.9, globals 17.12 → 17.11** et **défait le correctif jsdom** de
    `retour.test.js`. Cause : branche créée avant la montée du groupe, jamais
    rebasée. Le plus retors : sa contribution réelle était **déjà dans `main`**
    par une autre PR, donc il ne restait d'elle que les dégâts ;
  - **un commit unique, déjà présent dans `main` sous un autre SHA.** `log`
    rendait une ligne — « la déconnexion quitte l'en-tête permanent » — et ce
    commit vivait déjà dans `main` en `38cbfd7`, via la PR #172 ; la branche en
    portait une copie rebasée, donc d'empreinte différente, donc « absente » du
    log. Le `--stat` rendait **42 fichiers, 836 insertions, 5 959
    suppressions** : `portee-unique.spec.js`, `prive-en-vue.spec.js`,
    `decomposition.test.js`, `fuite-post-demontage.test.js` et
    `tools/liberer-les-ports.mjs` — cinq fichiers effacés, dont deux livrés le
    jour même.

  > **Le signal d'alerte est dans le `--stat`, pas dans le log : des
  > suppressions massives de fichiers RÉCENTS.** Une branche saine ajoute ; une
  > branche périmée retire ce qu'elle n'a jamais vu. Quand le rapport
  > insertions/suppressions penche lourdement du mauvais côté, la branche est
  > périmée **quel que soit son log**.
  >
  > **Le geste, avant tout merge d'une branche qu'on n'a pas poussée à
  > l'instant :**
  >
  > ```bash
  > git log  main..branche --oneline        # ce qu'elle apporte
  > git diff main..branche --stat | tail -5 # ce qu'elle changerait — LE verdict
  > ```
  >
  > Et le remède est le même dans les deux cas : **fusionner `main` DANS la
  > branche d'abord**, puis relire le `--stat`. S'il ne reste plus rien, la
  > branche était déjà dans `main` et n'a plus qu'à être fermée.

  **Et il existe un TROISIÈME signal, plus tôt et moins cher que les deux
  autres : le refus de `git branch -d`.**

  | | |
  |---|---|
  | `git branch -d` | **refuse** une branche non fusionnée |
  | `git branch -D` | force, sans rien demander |

  **Un `-D` nécessaire est une information, pas un obstacle** : il dit qu'il
  reste du travail unique sur la branche. C'est le moment de lire le `--stat`,
  jamais celui de forcer. Le nettoyage de 23 branches du 2026-09-11 s'est fait
  entièrement en `-d`, et les 23 sont passées — c'est ce qui prouvait qu'aucune
  ne portait rien d'unique. Une seule qui aurait résisté aurait suffi à
  suspendre le geste.

  > **⚠️ Et la reconstitution de mémoire est le pire guide des trois.**
  > Après coup, on a cru se souvenir que la branche du cas 2 portait un
  > correctif perdu : `.envelope-close` resté à `opacity: 0.55` sur `main`. La
  > mesure dit l'inverse sur les trois points — `opacity: 0.55` n'existe
  > **nulle part** dans `public/css/` ; `.envelope-close` porte sur `main`
  > `background: transparent` avec douze lignes expliquant que l'opacité a été
  > **retirée** parce qu'elle cassait le contraste ; et la branche en porte la
  > **version identique**, diff vide sur cette classe.
  >
  > Le remède qu'on tirait de ce faux souvenir aurait été « vérifier que le
  > contenu est passé ailleurs » — et il est plus faible que le vrai : **une
  > branche peut porter du travail réel ET être destructrice.** Les deux ne
  > s'excluent pas, c'est pour cela que seul le `--stat` tranche. Règle 5 : on a
  > affirmé sans mesurer, et le remède qu'on en tirait était le mauvais.

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

- **Les `overrides` s'accumulent, personne ne les relit, et AUCUN des quatre
  n'est porteur.** Question posée le 2026-09-09 : y a-t-il une échéance à
  laquelle on les relit ? **Non.** Il n'y a ni commentaire, ni note, ni
  entrée de journal — ils s'ajoutent, et c'est tout.
  **Mesuré, et le résultat surprend** : les quatre retirés d'un coup, suivis d'un
  `npm update` des paquets concernés, `npm audit --audit-level=high` rend **0** —
  12 modérées, zéro haute. Ils font descendre le compte des **modérées** de 12 à
  5 ; ils ne tiennent pas la porte que la CI applique.
  **Le réflexe à éviter** : le quatrième a failli être ajouté par mimétisme —
  « il y en a déjà trois ». Vérification faite, `firebase-tools` déclare
  `js-yaml@^4`, qui **admettait déjà** la version corrigée : le verrou était
  simplement resté en arrière. `npm update <paquet> --package-lock-only` a suffi,
  trois lignes, et rien qui s'accumule.
  **Avant d'ajouter un override, demander si la plage du parent admet déjà le
  correctif.** Un override sert quand elle ne l'admet PAS ; sinon c'est une
  ligne permanente pour un problème de verrou.
  Retirer les trois existants n'est pas décidé : ils achètent de l'hygiène au
  niveau modéré, et la décision ne se prend pas en passant.

## Décisions de conception

Arbitrages déjà pris, qui se reposeraient à l'identique. **Une décision qu'on
reprend faute de savoir qu'elle a été prise coûte plus cher qu'un gotcha.**

## ⚠️ 2026-09-16 — LE PERSONNEL N'A QU'UNE POCHE, ET LE MUR QUI LUI MANQUE EXISTE DÉJÀ

**Décision de Richie.** Elle suspend les lots d'écran en cours. Mesures prises à
`44a5cff9b2b6`. Les lots sont dans `refonte-lots.md`, avec leurs commandes.

**Le modèle cible.**

| Poche | Qui saisit | Qui lit |
|---|---|---|
| **Commune** | les deux | les deux |
| **Personnelle** (aujourd'hui « solo ») | son propriétaire | son propriétaire — **et l'autre seulement si un aval est actif** |

**Pas de troisième poche.** Personne ne saisit dans « Privé » : la saisie
personnelle EST la saisie solo. L'onglet « Privé » devient une **fenêtre en
lecture seule sur le personnel de l'autre**, nommée d'après lui, et **absente
tant qu'aucun aval n'est actif** — un onglet qui explique qu'il n'y a rien à
voir est un onglet de trop. Le réglage du partage part dans **Réglages**.

**Vocabulaire, et c'est ce qui casse un filtre écrit de mémoire** : une charge
payée par une personne **et partagée** est COMMUNE, jamais personnelle
(`perimetre.js:181`). Ce qui revient au propriétaire sur une charge commune est
**sa part**, pas une dépense à lui. Un filtre qui déduit le périmètre du PAYEUR
est faux.

**« Moi ce mois-ci »** : la liste montre le **personnel seul** ; la part du
commun y figure en **carte agrégée**, jamais en lignes communes à leur montant
plein — une ligne à 122,07 € sur l'écran « toi » contredirait le héros, et la
réafficher à ta part serait un second rendu de la même liste (règle 2).

**Le motif du défaut, et il vaut au-delà de cet écran.** Le propriétaire de
l'application a utilisé cet onglet quotidiennement **sans savoir ce qu'il
faisait de ses données**. L'écran explique le mécanisme du mur en quatre
paragraphes et ne dit jamais la phrase simple : *ce que tu saisis ici, l'autre
le verra si tu ouvres le partage*. **Une garantie exacte n'est pas une
information reçue.**

> **✅ P1a APPLIQUÉ LE 2026-09-16 — le mur du personnel existe, et il est
> ÉPROUVÉ. Aucune donnée n'a bougé.** Ce qui est en place :
>
> - **`household/personnel/{vous|conjointe}`**, avec le `.read` de `prive/`
>   repris **verbatim** — propriétaire toujours, l'autre sous `aval/{qui}/actif`
>   — et le schéma **complet** d'une charge, les 18 champs, `.write` de
>   propriétaire à la feuille. Symétrique sous `sandbox`.
> - **le `.read` a quitté la racine des deux espaces** et se repose sur chacun
>   de leurs 13 enfants directs. Il le fallait : un `.read` cascade et ne se
>   révoque nulle part en dessous, donc un sous-arbre caché sous une racine
>   lisible était impossible. Acquitté dans `.github/regles-retirees.txt`, qui
>   naît de ce lot — avec son prix : un client publié avant les règles voit
>   « Télécharger une sauvegarde » échouer jusqu'à ce que le site suive.
> - **la sauvegarde lit nœud par nœud** (`plansDeLecture`), omet ce qui n'existe
>   pas en base, et ne lit que SA poche ; **la restauration n'écrase plus la
>   racine d'un `set`** — elle écrit les nœuds du foyer en mise à jour
>   multi-chemins et sa seule poche par un chemin dédié.
> - **`cheminDuPersonnel` vit dans `db.js`**, pas dans `perimetre.js`, et la
>   commande de `refonte-lots.md` a changé dans le même commit, avec sa raison.
>
> **Ce que P1a NE fait pas, et pourquoi.** Il ne déplace **aucune** charge : les
> 3 charges `perimetre: 'solo'` (1 mois, `2026-09`, relevé sur sauvegarde le
> 2026-09-16) restent dans la poche commune, donc lisibles par l'autre. Les
> déplacer avant que les lecteurs sachent lire les deux poches ferait que
> tendances, recherche, rapport mensuel, reconduction et coût annuel cessent de
> compter le personnel **en restant verts** — 37 points de passage relevés.
> C'est P1b, chacun avec un verdict écrit, la migration EN DERNIER.
>
> **⚠️ Ce qui protège la poche de l'autre à la restauration est le CLIENT, pas
> la règle.** Le `set` de racine reste autorisé, et il efface bel et bien les
> deux poches — mesuré, et tenu comme témoin permanent
> (`etendue-ecrasement.test.js`, « l'ancien `set` de racine, lui, efface les
> deux »). Le fermer demanderait de descendre le `.write` de restauration, ce
> qui rouvrirait partiellement l'écrasement de conteneur que `4ac03f8` vient de
> fermer. Arbitrage de Richie, écrit plutôt que subi.
>
> **Et un fichier de sauvegarde porte désormais les dépenses personnelles EN
> CLAIR** — le mur est en base, pas dans le fichier. Consigné dans
> `SECURITY.md`. Ce qui reste garanti est plus étroit et exact : une sauvegarde
> ne peut pas contenir la poche de l'autre.

> **✅ P1b APPLIQUÉ LE 2026-09-16, en trois commits — les 3 charges sont dans
> leur poche.** Ce que P1a avait posé est maintenant rempli.
>
> - **La lecture.** Une seule fabrique de fusion, `poches.js`, lue par les 19
>   sites de lecture. L'invariant est rétabli : `getState('variableCharges')` et
>   `getState('fixedCharges')` portent le commun ET le personnel qu'on a le
>   droit de lire, comme avant P1a. Les 33 `getState` ont suivi gratuitement.
>   **Elle ne consulte JAMAIS `aval/`** : les quatre accès absolus lèvent en bac
>   à sable, et un refus de lecture est une réponse suffisante — « pas de
>   personnel », jamais une panne.
> - **Le chemin se DÉRIVE de la charge, il ne se compose plus.**
>   `cheminDeLaCharge(charge, {periode, collection, id})`, aux 19 sites
>   d'écriture. Aucun marqueur n'est porté par l'objet : le périmètre et le
>   payeur suffisent, et `perimetre.js` tranche.
> - **La bascule « perso » est nommée, confirmée et atomique.** C'est le premier
>   changement de chemin qu'une édition produise. Refusée, RIEN n'est écrit —
>   pas même les autres champs.
> - **La migration : chacun la sienne, à l'ouverture.** Personne n'a le droit
>   d'écrire dans la poche de l'autre, donc aucun compte ne peut migrer les
>   deux. `modules/migration-poches.js` lit le nœud COMMUN — jamais le fusionné,
>   ce qui la rend idempotente — et renonce hors ligne comme quand des écritures
>   attendent de partir.
>
> **UN DÉFAUT RÉEL, trouvé en balayant les sites d'écriture et absent du
> relevé.** `quick-add.js` composait `periods/{mois}/variableCharges` pour TOUTE
> dépense, « Perso » comprise : elle partait bien avec `perimetre: 'solo'` —
> donc hors du solde — mais dans la poche COMMUNE, lisible par l'autre sans
> aucun aval. C'est le geste le plus fréquent de l'application. Le relevé de
> phase 1 avait compté les 19 sites de LECTURE et les traversées ; il n'avait
> pas ouvert chaque `dbPush`.
>
> **TROIS ASYMÉTRIES ASSUMÉES, écrites plutôt que subies** — chacune est le prix
> du mur, pas un défaut à réparer :
>
> - **le miroir.** Sa propre poche est mémorisée sur l'appareil et mise en file
>   hors ligne ; celle de l'autre ne l'est **jamais** — ni mémoire à l'aller, ni
>   repli au retour. Une poche qu'on ne peut pas relire est une poche qu'on
>   n'affiche pas ;
> - **le renommage.** Il suit les charges du foyer et les miennes ; les
>   personnelles de l'autre gardent l'ancien libellé, et l'écran dit combien.
>   Chacun reprend la sienne à l'ouverture (`planRattrapage`), par la
>   correspondance dérivable entre le libellé d'une charge et l'identifiant
>   d'une entrée — qui survit au renommage. **Sa limite est tenue par un cas :**
>   deux renommages successifs pendant qu'une poche dort ne sont PAS repris,
>   parce que rien ne les distingue d'un libellé étranger à la liste ;
> - **la reconduction.** Elle porte **une marque par poche** — le seul nœud que
>   P1b ajoute aux règles. La marque commune ne peut pas servir au personnel :
>   celui des deux qui ouvre l'application le premier la réserve, et la poche de
>   l'autre ne serait alors jamais reconduite.
>
> **Et le total de catégorie inclut toujours le personnel sans le dire** — c'est
> P2, délibérément. Un lot qui change à la fois la lecture, les écritures et un
> affichage de total ne se relit plus.

> **✅ P2 APPLIQUÉ LE 2026-09-17 — « À deux » montre le commun, et le dit.**
> Le sélecteur existait depuis le lot 5 et ne filtrait rien : la commande
> promettait un filtre qu'elle n'appliquait pas. Trois choses, une seule lecture
> de `perimetre.js` :
>
> - **le filtre**, `chargesDeLaPortee` (`utils/portee.js`), sur une liste
>   déclarée privée — `PORTEES_QUI_FILTRENT_LA_LISTE`, du même patron que
>   `PORTEES_QUI_RAPPELLENT_LE_SOLDE` : le contrôle prouve le comportement,
>   jamais le contenu de la liste ;
> - **le total de catégorie annonce le personnel** — `commun + X perso`, et
>   seulement s'il existe. La distinction entre dans `grouperParCategorie`
>   (`utils/tri.js`), qui rend le couple, et `totaux-liste.js` cesse de la
>   recalculer par-dessus : **une seule rédaction**, `libelleDuTotal`, lue par
>   le pied ET par l'en-tête ;
> - **le renvoi en pied est CRÉÉ** — il n'existait pas. Il nomme sa destination,
>   et c'est un **bouton NU** : un `aria-checked`, `aria-selected` ou
>   `aria-current` en ferait une SECONDE annonce de portée pour
>   `portee-unique.spec.js`, sur l'écran dont il tient qu'il n'en annonce
>   qu'une.
>
> **LE PIÈGE, ET IL AURAIT COÛTÉ DES EUROS EN SILENCE : le filtre ne déduit
> jamais le périmètre du PAYEUR.** Une charge avancée par une personne et
> partagée est COMMUNE (`perimetre.js`, « `paidBy` dit qui a *avancé* l'argent,
> jamais à qui la dépense *appartient* »). Un filtre écrit sur le payeur la
> retirerait de la liste du foyer pendant que le solde continuerait de la
> compter — l'écran et le bilan en désaccord, sans qu'aucun contrôle ne bronche.
> Le jeu d'essai porte donc **les quatre combinaisons** (payeur × périmètre), et
> c'est la seule forme qui les sépare : sans une dépense payée par une personne
> ET partagée, « je garde ce qui est `partage` » et « je garde ce qui est
> commun » rendent le même écran.
>
> **Le renvoi corrige la seule affirmation que filtrer rend FAUSSE.** Un mois
> qui ne porte que du personnel annonçait « Aucune charge variable pour cette
> période » sous « À deux ». C'est faux — il y en a, elles sont ailleurs. La
> propriété tenue : **l'écran ne prétend jamais qu'un mois est vide quand il ne
> l'est pas.**
>
> **Trois bornes assumées, écrites plutôt que subies :**
>
> - ~~**« Moi ce mois » n'est PAS filtré**, et c'est une décision de Richie, pas
>   un oubli : la liste y montrera le personnel seul, la part du commun en
>   carte agrégée, au lot « Moi, rangs 2 et 3 ».~~ **⟲ RÉVOQUÉ le 2026-09-17 :
>   « Moi » filtre, et la carte est abandonnée** — voir le bloc du lot « Moi »
>   ci-dessous. Ce qui reste vrai de cette ligne : une ligne commune à son
>   montant plein sur l'écran « toi » contredirait le héros, et la réafficher à
>   ta part serait un second rendu de la même liste (règle 2) ;
> - **ni la recherche historique ni la corbeille ne sont filtrées** — elles
>   répondent à « où est cette dépense », et une portée y masquerait la réponse ;
> - **l'en-tête est BORNÉ** : l'annotation ne paraît que sur une catégorie qui
>   garde au moins une ligne affichée. Une catégorie entièrement personnelle
>   disparaît de « À deux » — un en-tête sans une seule ligne dessous serait
>   plus déroutant que son absence — et n'est couverte que par le renvoi.
>
> **⚠️ LE TROU CONSIGNÉ, ET IL NE SE COMBLE PAS ICI : le personnel de l'AUTRE,
> sous aval, n'a aucun renvoi.** `renvoiDeLaPortee` ne chiffre que
> `chargesSolo(charges, moi)`. Compter les deux ferait dire au pied « 2 dépenses
> perso (50,00 €) » là où une seule est à moi, et surtout : mener quelque part
> supposerait un endroit où aller. Cet endroit est **la fenêtre de P3** — Privé
> cesse d'être une portée pour devenir une fenêtre en lecture seule sur le
> personnel de l'autre. Le combler avant P3 serait poser un renvoi vers un écran
> qui n'existe pas encore. Tenu par un cas de
> `tests/e2e/portee-filtre-la-liste.spec.js`, qui sème une personnelle dans
> CHAQUE poche et exige que le renvoi n'en chiffre qu'une.

> **✅ LE LOT « MOI » APPLIQUÉ LE 2026-09-17 — et la CARTE qu'il devait porter
> est ABANDONNÉE, sur mesure.** Le cahier annonçait « Moi, rangs 2 et 3 » : une
> carte agrégée « Ta part du commun » dans la colonne du bilan, qui ouvrirait le
> grand-livre, PUIS le filtre. Sa prémisse était que le héros de « Moi »
> soustrait une part du commun que rien à l'écran ne montre.
>
> **Elle est fausse.** `suiteDeMoi` (`summary.js`) affiche déjà « Ta part du
> commun » textuellement, sous le héros, et son grand-livre n'est **pas** un
> `<details>` : son ouverture permanente est une décision prise avec son prix
> chiffré — 300 px à 320 px — et sa raison, « la réserve ne doit jamais être
> séparée du chiffre qu'elle qualifie, ni derrière un geste ». « La carte ouvre
> le grand-livre » n'avait donc pas d'objet, et répéter le même montant trois
> lignes plus bas coûte de la hauteur sur la portée qui en a le moins.
>
> **La colonne des cartes reste donc VIDE sous « Moi » et « Privé »**, et ce
> n'est plus une question ouverte : le foyer l'a vue et a répondu. La réponse
> est écrite là où on la cherchera, dans `summary.css`, « La portée gouverne le
> panneau ».
>
> Ce que le lot fait, et c'est tout :
>
> - **le filtre sur « Moi » → MON personnel, seul.** `chargesDeLaPortee` prend
>   un troisième argument, `moi`, et il est OBLIGATOIRE : depuis P1b,
>   `poches.js` fusionne dans l'état le personnel de l'autre quand un aval le
>   rend lisible, et un filtre qui l'ignorerait afficherait ses dépenses sous
>   « Moi ce mois ». Sans emplacement lisible, la liste est **vide** et non
>   complète — un défaut qu'on voit vaut mieux qu'une fuite que personne ne
>   voit. Quatre sites d'appel, comme à P2 ;
> - **une seule déclaration pour les deux portées.** P2 portait une LISTE de
>   portées plus un comportement écrit dans la fonction ; à deux comportements,
>   ce serait deux déclarations du même fait, et la première divergence serait
>   une portée inscrite dans la liste que personne n'a câblée — filtrée par un
>   comportement absent, donc rendue vide sans un mot. `FILTRE_DE_LA_PORTEE` est
>   la seule déclaration : `porteeFiltreLaListe` lit ses clés ;
> - **une SECONDE NATURE de renvoi.** Voir ci-dessous, c'est le piège du lot ;
> - **l'état vide par une fabrique qui construit le DOM** —
>   `afficherEtatVide`, dans `utils/totaux-liste.js` avec le reste. Six
>   rédactions du même patron dans deux fichiers auraient été la règle 4 à
>   l'état pur. Et la forme est imposée par la mesure : une fabrique qui rendrait
>   une CHAÎNE assignée à `innerHTML` porte le plafond des sites d'injection de
>   24 à 26, sur des phrases qui n'interpolent rien.
>
> **LE PIÈGE, MÉCANIQUE : inscrire « Moi » dans la table ALLUME le renvoi de P2
> tout seul.** `renvoiDeLaPortee` s'ouvre sur `porteeFiltreLaListe`. Le renvoi
> aurait donc annoncé « 3 dépenses perso (45,00 €) — rangées dans "Moi ce
> mois" » **sur l'écran « Moi ce mois »** : un compte de ce qui est AFFICHÉ, et
> une destination qui est l'écran où l'on se trouve déjà. `portee.test.js` porte
> la garde qui l'attrape, et elle n'a pas été relâchée — elle a changé de
> propriété, parce qu'elle était devenue **verte par coïncidence** : elle lisait
> `nombre`, et le renvoi du commun vaut zéro par décision.
>
> **Et ce qui manquait sous « Moi » n'était pas un chiffre : c'était une
> ADRESSE.** Vérifié plutôt que supposé — un agrégat ne répond pas à « où est
> passée ma course de 122,07 € ». Le renvoi du commun dit donc que le commun
> n'est pas dans cette liste, nomme « À deux », et **ne porte aucun nombre** :
> le montant est déjà dans le grand-livre, deux cartes plus haut. La décision
> est dans la DONNÉE (`nombre: 0`, `total: 0`) et pas seulement dans la
> rédaction — ce qu'on ne calcule pas ne peut pas s'afficher par accident.
>
> **TROIS CONSÉQUENCES QUE LE FILTRE FORCE, et qui n'étaient pas au cahier :**
>
> - **`libelleDuTotal` gagne une clause symétrique.** Sous « Moi », la formule de
>   P2 rendait « 0,00 € + 45,00 € perso » — exact, illisible. L'annotation
>   existe pour DISTINGUER deux natures dans une même liste ; quand l'une manque,
>   il n'y a rien à distinguer ;
> - **`coupleDeLaPortee` remplace le couple de `grouperParCategorie`** comme
>   source de l'en-tête. Le `commun` du groupe est le commun du FOYER : sous
>   « Moi », l'en-tête aurait annoncé « 120,00 € + 45,00 € perso » au-dessus
>   d'une liste qui ne montre que les 45 €. Une seule formule sert les deux
>   portées — *ce que la portée montre, plus mon personnel qu'elle cache* — et
>   elle corrige au passage une imprécision de P2 : l'en-tête annonçait le solo
>   du groupe entier, donc celui des DEUX comptes sous un aval, là où le renvoi
>   ne comptait que le mien. `utils/tri.js` rend toujours le couple, et ses cas
>   le tiennent, mais **ce n'est plus la source de l'en-tête** ;
> - **le coût annuel reçoit les charges AFFICHÉES.** `coutDesChargesFixes`
>   traverse `chargesCommunes` en dur : nourri du mois entier, il annonçait sous
>   « Moi » le coût annuel du COMMUN. Il se tait désormais sur cette portée. ⚠️ Le
>   prix, dit plutôt que découvert : le jour où un abonnement personnel existera,
>   son coût annuel restera masqué — la fabrique ne sait compter que du commun.
>   Zéro charge fixe personnelle en base au 2026-09-17.
>
> **Et la section des charges fixes vide sous « Moi » est le cas NOMINAL** —
> zéro charge fixe personnelle contre trois variables, relevé sur la base réelle
> le 2026-09-17. Elle reste, et sa phrase lève l'ambiguïté qu'une section vide
> installe : « je n'en ai pas » ou « on ne me les montre pas ? ». La masquer
> aurait répondu à la question en la supprimant.

> **✅ LE RÈGLEMENT À MONTANT LIBRE, APPLIQUÉ LE 2026-09-17 — D1 à D6, décisions
> du foyer.** « Régler ce solde » écrivait le montant EXACT du solde après une
> question fermée. On rembourse pourtant rarement au centime : on arrondit —
> 70 € pour 66,94 € —, on paie en deux fois, ou on verse ce que la banque a
> débité. Un paiement partiel obligeait à retrouver la carte
> « 💸 Remboursements » et son bouton « + Ajouter » ; **rien depuis « Régler »
> n'y menait**, et on en concluait que ce n'était pas possible.
>
> - **D1 — une vraie modale de saisie**, `#modalReglerSolde`, à la place de
>   `showConfirmModal`. Le champ est PRÉ-REMPLI de `reglementPour(solde).amount`
>   et modifiable ; le cas au centime reste donc à un appui, ouvrir puis valider.
>   **Le SENS n'est pas offert au choix** : il découle du signe du solde. Le
>   rendre modifiable ouvrirait un versement qui AGGRAVE l'écart, et aucune des
>   trois phrases ci-dessous ne saurait l'appeler un règlement.
> - **D2 — une phrase de conséquence, co-visible avec le champ**, recalculée à
>   chaque frappe sur le solde CUMULÉ, report compris. Une seule fabrique pure,
>   `utils/phrase-reglement.js`, et la comparaison se fait **au centime**
>   (`Math.round(x * 100)`) : `0,1 + 0,2 − 0,3` n'est pas nul en flottant, et un
>   paiement exact aurait annoncé « il restera 0,00 € à régler ».
> - **D3 — le trop-versé est accepté, sans aucun plafond.** La protection contre
>   la faute de frappe EST la phrase : un plafond refuserait un geste légitime, et
>   un refus n'apprend rien, quand « Il restera 1 233,06 € à régler » se lit tout
>   seul quand on voulait taper 70 et qu'on a tapé 7.
> - **D4 — payer en plusieurs fois, c'est faire plusieurs règlements.** Pas
>   d'échéancier : au geste suivant, le pré-remplissage donne le reste.
> - **D5 — un règlement appartient au mois AFFICHÉ, qu'il solde**, jamais au mois
>   de sa date : `periods/${currentPeriod}`, comportement conservé. Le titre le
>   NOMME — « Régler septembre 2026 » — parce que sans lui rien à l'écran ne dirait
>   quel mois on solde. ⚠️ **C'est l'inverse du formulaire « + Ajouter »**, qui
>   range par `periodeDeLaDate` et n'a pas été touché : là-bas on saisit un
>   virement, ici on éteint un mois. Conséquence assumée, mesurée à l'étape 0 : un
>   règlement d'août saisi le 3 septembre s'affiche dans la carte d'août daté du
>   03/09, **sans aucune marque** — `renderReimbursements` peint la date telle
>   quelle, l'appartenance au mois venant du CHEMIN.
> - **D6 — pas de raccourcis d'arrondi en v1.**
>
> **CE QUI A CHANGÉ DANS LA RELECTURE, et c'est la conséquence la moins évidente
> du montant libre.** Le code comparait le montant FRAIS au montant confirmé :
> deux grandeurs de même nature. Le montant étant désormais saisi, cette
> comparaison n'a plus d'objet — 70 € restent 70 € quoi qu'ait fait le solde. Ce
> qui est comparé est le **SOLDE relu au solde sur lequel la phrase a été
> affichée**, au centime. Et le remède n'est plus de rendre la main : rien n'est
> écrit, **la modale RESTE ouverte avec le montant saisi**, la phrase est
> recalculée sur le solde frais, un avertissement dit ce qui a bougé, et un
> second appui décide. Fermer ferait retaper un montant que personne n'a
> contesté. Un solde frais à zéro, lui, ferme : la modale n'a plus d'objet.
>
> **LE VERROU `reglementEnCours` A SUIVI L'ÉCRITURE.** Il gardait l'ouverture du
> geste, parce que l'ouverture ALLAIT jusqu'au `dbPush`. Depuis qu'une modale
> s'intercale, garder l'ouverture ne garderait plus rien — elle rend la main dès
> que la modale est à l'écran. Il garde `confirmerLeReglement`, où deux appuis
> feraient basculer le solde du même montant dans l'autre sens ; rouvrir la
> modale deux fois, à l'inverse, ne coûte rien (`empilerCouche` est idempotente).
>
> **ÉCART ASSUMÉ À LA LETTRE DE D2, et il est mesuré.** D2 rédigeait le
> trop-versé « *<prénom du créancier devenu débiteur> te devra X* ». Cette
> formulation n'est vraie que d'UN des deux cas : quand c'est l'AUTRE qui verse
> trop, c'est **moi** qui deviens débiteur, et la phrase rendrait « Richard te
> devra 3,06 € » sur le téléphone de Richard. Le module applique donc D2 **plus
> son miroir** — « Tu devras 3,06 € à Cindy » —, par
> `describeBalance().emplacementDebiteur`, seule fabrique de la convention de
> signe, et la convention du « tu » de `tete-du-bilan.js`. Tenu par un cas qui
> joue les MÊMES données sur les deux téléphones et exige deux phrases
> différentes ; une rédaction unique le fait tomber.
>
> **Et la couleur : le bouton de validation n'est PAS en `--danger`.** C'est un
> paiement, pas une destruction — voir le point ouvert du libellé de
> `showConfirmModal`, qui porte le relevé des douze appels.

### Le mur existe, il est ÉPROUVÉ, et il protège la mauvaise poche

- **`tests/regles/mur-prive.test.js`** (fusionné le 2026-09-14, PR #211) ne lit
  pas les règles : il demande à l'émulateur ce qu'il **autorise**. Il tient déjà
  la propriété du modèle cible — « l'aval actif ouvre la lecture, et lui seul »,
  « l'aval ouvre la lecture, **jamais l'écriture** », « un aval retiré referme
  la lecture », « un tiers ne lit rien, et une adresse non vérifiée non plus ».
- **`database.rules.json:979` / `:1023`** conditionnent le `.read` de
  `prive/{qui}` à `aval/{qui}/actif`. Posture « Rien » → aucun accès.
  **Vérifié contre le moteur, pas contre un libellé d'écran.**
- **~~Mais les dépenses solo vivent dans `household/`~~ ✅ REFERMÉ le
  2026-09-16 par P1b.** Le constat était : elles étaient **lisibles par l'autre,
  sans aucun aval**, et la réalité était l'inverse de la crainte — ce qu'on
  croyait exposé était protégé, ce qu'on saisit réellement ne l'était pas. La
  structure est venue avec P1a, les 3 charges avec P1b. Le texte reste, parce
  que c'est lui qui rend le lot lisible : un constat effacé donne un dépôt qui
  a l'air de n'avoir jamais eu le défaut.
- **Ce constat est NEUF.** `PRIV-001`, `PRIV-002`, `PRIV-003` (agent
  `privacy-compliance`, commit `b2e5622`) portent sur Nominatim absent de
  `SECURITY.md`, sur deux fabriques de géocodage dont une n'arrondit pas la
  position, et sur l'absence de purge définitive. **Aucun ne relève la
  visibilité du solo.** L'agent a regardé `prive/` et les tiers ; il n'a pas
  regardé la poche réellement utilisée.

### Le coût : une MIGRATION, pas un mur à inventer

Rendre le personnel invisible sans aval n'est pas un filtre d'affichage —
l'autre lit la même base. Il faut le sortir de `household/` **vers le mécanisme
qui existe déjà**. Restent : les quatre accès absolus, `perimetre.js`, la
migration des données existantes, `SECURITY.md`, et la place du personnel dans
les totaux. `mur-prive.test.js` est le gabarit qui reçoit les cas neufs.

**Conséquence sur les chiffres** : après migration, le total de catégorie ne
peut plus inclure le personnel sur l'écran de l'autre — il ne peut plus le lire.
La structure règle ce que l'affichage discutait.

**⚠️ `PRIV-003` heurte une CONTRAINTE, il ne s'y ajoute pas.** La section
*Contraintes* porte « NE JAMAIS supprimer de données Firebase sans soft-delete ».
Une purge définitive du personnel — la seule poche dont un libellé peut nommer
un professionnel de santé ou un avocat — serait une **exception à une contrainte
de premier niveau**, et l'espace privé n'a même pas de corbeille
(`prive.js:667-689`). À arbitrer, pas à écrire en passant.

### Mesures de l'état actuel (2026-09-16, arbre de `44a5cff`)

Le `pull` de `39efd31` à `44a5cff` ne touche, dans `public/js`, que `backup.js` :
les relevés pris avant valent toujours.

- ~~**`utils/tri.js:101` `grouperParCategorie` est la fabrique unique** — trois
  appelants. **Elle ne porte aucune notion de périmètre** : zéro occurrence de
  `solo` ou `commun` dans `tri.js`. La règle 2 n'est **pas** en cause — c'est
  une distinction appliquée à une surface sur deux.~~
  ~~**`totaux-liste.js:46`** appelle `totauxParPerimetre` **par-dessus**, pour
  son seul pied de liste.~~
  ~~**`variable-charges.js:743`** peint un scalaire muet. Vérifié à la main sur
  capture : `122,07 + 20,64 + 20,00 + 25,00 + 80,18 + 10,00 + 103,86 = 381,75`
  — **le total de catégorie inclut le perso sans le dire**.~~
  ~~**`:729` lit `getState('variableCharges')`** sans passer par
  `perimetre.js`.~~
  **✅ LES QUATRE REFERMÉS LE 2026-09-17 par P2, et c'était un seul défaut vu à
  quatre endroits** — la distinction vivait par-dessus la fabrique au lieu d'y
  vivre. `grouperParCategorie` rend le couple `{commun, solo}`, `totaux-liste.js`
  ne recalcule plus rien au-dessus, les deux modules de liste lisent
  `porteeCourante`. Le relevé reste : c'est lui qui dit pourquoi le correctif
  porte sur la fabrique et non sur les deux surfaces, et **il portait le chiffre
  qui a servi de témoin** — 381,75 dont 10,00.
  > **Et « la règle 2 n'est pas en cause » était juste pour la mauvaise
  > raison.** Elle ne l'était pas sur le GROUPEMENT, qui n'avait qu'une
  > fabrique ; elle l'était sur la RÉDACTION — « `commun + X perso` » n'existait
  > qu'en clair dans `afficherTotalDeListe`, et le lot lui donnait un second
  > lecteur. Deux rédactions du même chiffre à deux lignes de distance, c'est
  > le symptôme exact de la règle 2. `libelleDuTotal` est né de là.
- **Le sélecteur de portée est rendu deux fois, VU à l'écran** (2026-09-16),
  après la mesure aux quatre largeurs consignée dans `refonte-lots.md`.
- **Sous « Privé », la liste du bas affiche les charges du foyer**, payeur et
  lieu compris — sur l'écran qui promet que l'autre ne voit rien de cet espace.
- **`soloDansLaListe` n'existe nulle part** — 0 occurrence, mesuré le
  2026-09-12 (`41f915c`). Toute note qui l'annonce comme « un tweak existant,
  désactivé » envoie chercher ce qui n'est pas là.

### Ce qui reste OUVERT — à ne pas trancher par omission

0. **Les chiffres du tableau des adhérences ne sont tenus par RIEN**, et c'est
   la **septième** dérive (`perimetre.js` 21 → 24, `members.js` 23 → 22,
   `auth.js` 28 → 29 `runStep`, corrigés le 2026-09-17 ; la cinquième était
   `perimetre.js` 17 → 18, le 2026-09-16). **La septième s'est produite sur des
   chiffres DÉJÀ MESURÉS et consignés en prose sous le tableau** — voir sa note,
   en tête des *Adhérences critiques* : la garde n'y est pour rien, personne
   n'avait reporté la mesure dans la ligne.
   `adherences-declarees.test.js` tient l'**appartenance** au tableau — quel
   module y figure — jamais son compte : mesuré en lisant le fichier, ses six
   cas comparent des listes de noms. Les rendre exacts serait un contrôle de
   trois lignes ; le prix est qu'un import ajouté rendrait la CI rouge jusqu'à
   ce que le tableau soit réécrit. C'est un arbitrage qui ne se prend pas en
   passant, donc il est écrit ici plutôt qu'appliqué.
1. **« Il te reste » compte-t-il le personnel ?** Il le soustrait aujourd'hui et
   **exclut le privé** (2026-09-11, argument de l'épaule). Les deux poches n'en
   faisant plus qu'une, la question se repose entière.
   **Le lot « Moi » (2026-09-17) ne l'a PAS tranchée, et il ne l'a pas
   effleurée** : `computeMoisPersonnel` est inchangé, `suiteDeMoi` est
   inchangé. Ce que le lot change est que le chiffre se VÉRIFIE à l'écran —
   la liste sous le grand-livre ne montre plus que les dépenses personnelles
   que celui-ci soustrait. C'est la condition d'une réponse, pas la réponse.
2. **Le nom de l'onglet-fenêtre** et le sort de `prive/` : renommé, ou devenu la
   maison du personnel.
3. **Où atterrit le personnel** dans l'arbre, et la migration des données.
4. **La purge définitive** — `PRIV-003`, contre la contrainte ci-dessus.
5. **⚠️ `showConfirmModal` rend « Supprimer » EN ROUGE pour les DOUZE appels du
   dépôt, dont sept ne suppriment rien.** Le libellé et la couleur sont écrits
   en dur dans le balisage — `FairSplit.html`, bouton `#modalConfirmOk`,
   `class="btn btn-danger"` — et **aucun JS ne les touche** : `modal.js` ne lit
   cet élément que pour y poser ses écouteurs. Relevé le 2026-09-17, en ouvrant
   l'étape 0 du lot du règlement :

   | Fichier:ligne | Action confirmée | Juste ? |
   |---|---|---|
   | `backup.js:395` | remplacer toutes les données par une sauvegarde | non — « Restaurer » |
   | `fixed-charges.js:187` | reconduire des charges fixes | **non** — création |
   | `fixed-charges.js:533` | basculer une charge fixe commun ⇄ perso | **non** — déplacement |
   | `fixed-charges.js:667` | supprimer une charge fixe | oui |
   | `envelopes.js:189` | **créer** une cagnotte | **non** |
   | `envelopes.js:1366` | supprimer une enveloppe | oui |
   | `auth.js:176` | se déconnecter avec des saisies en attente | **non** |
   | `selection-charges.js:294` | supprimer un lot de charges | oui |
   | `variable-charges.js:546` | basculer une charge variable commun ⇄ perso | **non** |
   | `variable-charges.js:711` | supprimer une charge variable | oui |
   | `reimbursements.js:496` | supprimer un remboursement | oui |

   Le douzième était `reimbursements.js:412`, « enregistrer un règlement » : il
   **a quitté cette liste** le 2026-09-17, en gagnant sa propre modale. Les onze
   autres restent, et **ce lot ne les corrige pas** — c'est un lot séparé, et
   toucher onze sites de confirmation dans le même commit qu'un changement de
   mécanique de règlement rendrait les deux illisibles.

   Ce que le correctif demandera : un libellé et un ton PARAMÉTRÉS, avec un
   défaut. Le passer à `showConfirmModal` sans défaut ferait un treizième site
   qu'on oublierait de renseigner, et un bouton vide est pire qu'un bouton faux.
6. **⚠️ `expliquerLeReport` — la branche « sens opposés, total basculé » répète
   le héros au lieu de dire le mouvement du mois** (constaté à l'écran le
   2026-09-17).
   - Fichier : `public/js/utils/explication-solde.js`, avant-dernière branche.
   - Cas réel : report de 40,51 € dû à Richard, mois propre de 211,37 € dû par
     Richard, aucun remboursement. Solde : 170,86 €.
   - Rendu actuel : « les 40,51 € dus des mois précédents sont soldés ; ce
     mois-ci laisse 170,86 € dans l'autre sens ».
   - Défaut : la phrase affiche `somme(total)` là où « ce mois-ci » appelle
     `somme(mois)`. Elle répète le héros, rend 40,51 et 170,86 invérifiables de
     tête (contre le principe écrit en tête du fichier), et « soldés » suggère
     un paiement qui n'a pas eu lieu.
   - Formulation proposée, non encore validée : « ce mois-ci pèse X dans
     l'autre sens et efface les Y dus des mois précédents ».
   - À traiter APRÈS la fusion de ce lot : un règlement partiel fait entrer des
     remboursements dans `ownBalance`, et « ce mois-ci » mélangerait alors
     charges et versements. Le lot de correction devra couvrir ce cas par un
     test.

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
  **Elles sont SIX depuis le 2026-09-12** : `recherche-montant` a rejoint la
  liste, et il a fallu 20 chutes sur 20 pour le voir. Son semis effaçait le
  champ date, avec sa raison écrite — *« une date vide est la seule valeur qui
  ne puisse contenir aucun chiffre »*. **Elle est fausse** :
  `variable-charges.js:425` fait `date = champ.value || dateDuJour()`, donc
  vider le champ enregistre la date DU JOUR, que la recherche couvre. Le 12 du
  mois, « 12 » ramenait les trois charges semées, et le cas « 12 ne ramène pas
  120 » tombait — un cas qui passait la veille et serait repassé le lendemain.
  **Neutraliser une SAISIE ne neutralise pas le calendrier tant que le code
  porte un repli** : c'est l'horloge qu'il faut figer, à une date choisie pour
  ne porter aucun des chiffres que le fichier cherche.
  **✅ L'angle qu'on croyait exposé ne l'est pas — MESURÉ le 2026-09-10, après
  deux jours passés en ⚠️.** `data-flow`, `regles-donnees`, `renommage` et
  `vues` sèment bien des **mois absolus sans figer l'horloge** : la description
  était exacte. L'**exposition**, elle, ne se réalise pas. Balayage de
  **12 dates sur un an** — les deux bords de chaque mois, premier à 00 h 30
  (jour UTC = la veille) et dernier à 23 h 58, décembre et passage d'année
  compris —, horloge déplacée par `page.clock.setFixedTime`, sous émulateurs :
  **143 contrôles verts aux 12 dates, zéro rouge.**
  La sonde a été lue **sur son cas connu d'abord** — figée à aujourd'hui, elle
  rend 143 verts, donc un rouge ailleurs aurait été calendaire.
  **Et deux mécanismes plausibles sont réfutés sur le code**, pas écartés par
  raisonnement : `data-flow` sème `exportedAt: '2027-01-01'` pour un fichier
  « plus récent que l'application », mais `backup.js:177` tranche sur la
  **version**, jamais sur la date ; et `database.rules.json` ne contient
  **aucune** occurrence de `now`, donc les dates de `regles-donnees` sont des
  charges utiles inertes. `renommage` agrège une enveloppe **à travers les
  mois** par construction, et `vues` ne fait entrer aucun mois vide dans sa
  fenêtre — seuls les mois écrits existent comme clés.
  > **La note visait le bon motif et les mauvais fichiers.** Le mécanisme du
  > 2026-09-01 est à `journal-archive.md:568`, et il est plus étroit que
  > « semer de l'absolu » : c'est **un mois vide neuf qui entre dans une fenêtre
  > de calcul** — le 1ᵉʳ septembre a ouvert sur un `2026-09` vide, et la médiane
  > des tendances est passée de 1 014 € sur quatre mois à 973 € sur cinq. Aucune
  > des quatre n'a cette forme. Une alerte posée par ressemblance de forme, sans
  > la mesure, a coûté deux jours de dette imaginaire.

  **⚠️ Ce qui EST exposé, et que le balayage a trouvé en passant :**
  `playwright.config.js` ne déclare **aucun `timezoneId`**. Le navigateur hérite
  du fuseau de la machine — **Europe/Paris en local, UTC sur les runners
  GitHub**. La suite unitaire épingle `TZ: 'Europe/Paris'` avec sa
  justification écrite dans `vitest.config.mjs` ; la suite de bout en bout
  n'épingle rien. C'est le même défaut, sur l'autre suite, et il n'est pas
  traité.
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
`.claude/commands/audit.md`, `.claude/commands/audit-diff.md`,
`.claude/commands/audit-design-fairsplit.md`, `.claude/commands/audit-web-fairsplit.md`
— les quatre relevés le 2026-09-16 à `44a5cff`

Prompts d'audit locaux : `docs/claude/prompts/local/` — dette technique,
règles Firebase, design PWA.

> Les entrées `docs/claude/prompts/core/`, `stacks/javascript/`,
> `docs/claude/references/` et le script `Sync-Toolkit.ps1` figuraient ici
> sans jamais avoir existé dans ce dépôt. Une documentation qui annonce un
> mécanisme absent finit par le faire croire actif : ne rétablir ces lignes
> que le jour où les fichiers existent.
