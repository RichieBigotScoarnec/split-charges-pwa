# CLAUDE.md — FairSplit PWA

App web PWA de partage de charges en couple au prorata des salaires. Synchronisation temps réel Firebase, auth Google/Email, espace de données unique partagé par les comptes autorisés.

> **Version** : 4.0.0 | **Mise à jour** : 2026-08-24 | **Branche unique** : main

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
│   ├── FairSplit.html          # Point d'entrée HTML
│   ├── index.html              # Redirection
│   ├── sw.js  manifest.json  icon-*.png
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
│       ├── config.js           # Firebase config, DATA_ROOT, liste blanche
│       ├── firebase-init.js    # Init Firebase, providers, émulateurs
│       ├── db.js               # Abstraction DB (préfixage DATA_ROOT)
│       ├── state.js            # État global (lecture/écriture, sans abonnés)
│       ├── components/         # modal.js, toast.js
│       ├── modules/            # 25 modules fonctionnels
│       └── utils/              # 45 aides pures — dont onglets (quel panneau
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
│                               # ecouteur (un écouteur posé une seule fois),
│                               # periodes (les mois que le sélecteur propose),
│                               # renommage (renommer sans détacher les charges),
│                               # tendances (ce que six mois de dépenses disent),
│                               # raccourci (ce que l'URL demande à l'ouverture),
│                               # attente-application (attendre d'avoir de quoi
│                               # écrire), previsionnel (ce qui reste à passer
│                               # ce mois-ci), calculations, format, validation,
│                               # salaries
├── tests/                      # Vitest (unitaires) + Playwright (E2E)
├── tools/                      # generer-icones.mjs, enveloppe-sauvegarde.mjs,
│                               # migration-repartition.mjs,
│                               # fusionner-couverture.mjs + couverture-lignes.mjs
│                               # (la couverture réelle, E2E comprise)
│                               # (hors `public/`, donc jamais publié)
├── docs/                       # Dépannage, déploiement, aide-mémoire Git
└── database.rules.json         # Règles de sécurité — source de vérité unique
```

Le déploiement publie `public/` et rien d'autre. Ne jamais placer à la racine
un fichier destiné à être servi, ni dans `public/` un fichier qui ne doit pas
l'être.

## Adhérences critiques

Avant de modifier un module très importé, vérifier les dépendants : `grep -rl "from '.*MODULE_NAME" js/`

| Module | Imports | Risque |
|---|---|---|
| `state.js` | 22 | Critique — état global |
| `toast.js` | 13 | Critique — feedback utilisateur partout |
| `firebase-init.js` | 5 | Critique — connexion DB |
| `auth.js` | Hub | Critique — initialise TOUS les modules |
| `db.js` | 8 | Critique — abstraction DB |
| `format.js` | 9 | Important — affichage monétaire |
| `summary.js` | 7 | Important — calculs dépendants |

## Conventions

### CSS
- Tokens dans `public/css/variables.css` via `var(--xxx)`, jamais de valeurs en dur ailleurs
- Mobile-first, breakpoint principal : 600px
- Classes en kebab-case

### JavaScript
- ES6 modules partout, pas de globals sauf compat legacy (`window.xxx`)
- State centralisé : `getState('key')` / `setState('key', value)` via `state.js`
  (lecture/écriture seules : le registre d'abonnés n'a jamais eu d'abonné et a
  été retiré — chaque module appelle son rendu après avoir écrit)
- DB via `db.js` : `dbGet`, `dbSet`, `dbPush`, `dbUpdate` (chemins auto-préfixés par `DATA_ROOT` : `household/`, ou `sandbox/` avec `?sandbox=1`)
- Async/await + try/catch sur tous les appels Firebase
- `escapeHtml()` obligatoire pour tout contenu dynamique injecté en HTML
- Toast pour feedback : `toast.success()`, `toast.error()`

### Nommage
- Fichiers JS : kebab-case (`variable-charges.js`)
- Fonctions : camelCase (`loadVariableCharges`)
- Constantes : UPPER_SNAKE (`MAX_SALARY`)
- Classes CSS : kebab-case (`.charge-item`)

### Git
- Commits français : `feat:`, `fix:`, `refactor:`, `style:`, `docs:`, `chore:`
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
2. Vérifier les adhérences si module critique (`grep -rl`)
3. Proposer un plan (3-5 lignes) avant d'implémenter
4. Implémenter avec escapeHtml pour contenu dynamique
5. Vérifier : `npx vitest run` passe

## Design

Secteur : finance personnelle / couple. Émotion : confiance, clarté, simplicité.

Principes UX :
- Le BILAN doit être la première section visible après la période
- Solde net en gros texte ("Conjointe vous doit X €") avant le détail
- Cibles tactiles minimum 44×44px
- Contrastes WCAG AA (4.5:1 texte, 3:1 grand texte)
- Mobile-first, whitespace généreux

## État de cohérence

Suivi des écarts entre ce CLAUDE.md et l'état réel du code. Mettre à jour cette section après chaque correction.

| Déclaration CLAUDE.md | Fichier réel | État | Action |
|---|---|---|---|
| Design = clarté, confiance, thème clair | `public/css/variables.css` | ✅ RÉSOLU 2026-03-22 — thème clair + dark mode auto | — |
| Tout JS dans les modules | `public/FairSplit.html` | ✅ RÉSOLU — HTML propre (604 lignes, aucun JS inline) | — |
| `utils.js` = legacy à supprimer | `js/utils.js` (supprimé) | ✅ RÉSOLU 2026-03-22 — git rm, aucun import résiduel | — |
| `window.quickAddState` = legacy | `public/js/modules/quick-add.js` | ✅ RÉSOLU — local const, plus de global `window.quickAddState` | — |
| Font Awesome non chargé | `public/js/modules/variable-charges.js`, `fixed-charges.js` | ✅ RÉSOLU 2026-03-22 — emojis utilisés + `.btn-icon` stylé | — |
| `escapeHtml()` dupliqué | `public/js/utils/format.js` | ✅ RÉSOLU 2026-03-22 — utils.js supprimé, une seule copie dans format.js | — |
| Bilan en bas de page | `public/FairSplit.html` + `summary.js` | ✅ RÉSOLU 2026-03-22 — bilan en position 3, solde net 28px en tête | — |

| `state.js` = Observer pattern | `public/js/state.js` | ✅ RÉSOLU 2026-08-22 — registre d'abonnés retiré, personne ne s'y abonnait | — |
| Liste de précache tenue à la main | `public/sw.js` | ✅ RÉSOLU 2026-08-22 — test comparant la liste au disque | — |
| Classes CSS orphelines des deux côtés | `public/css/`, modules de rendu | ✅ RÉSOLU 2026-08-22 — feuilles alignées sur le balisage, règles mortes retirées | — |
| `utils/` listé à cinq fichiers | `public/js/utils/` (15 fichiers) | ✅ RÉSOLU 2026-08-22 — inventaire remis à jour | — |
| Montants lus par `parseFloat` | `public/js/utils/montant.js` | ✅ RÉSOLU 2026-08-22 — virgule acceptée, une seule lecture partagée | — |
| Sauvegarde entièrement manuelle | `.github/workflows/sauvegarde.yml` | ✅ RÉSOLU 2026-08-22 — export chiffré quotidien, restaurable depuis l'application | Exige le secret `SAUVEGARDE_PASSPHRASE` |
| Répartition de la saisie rapide écrite dans `splitMode`, que personne ne lit | `public/js/modules/quick-add.js` | ✅ RÉSOLU 2026-08-23 — `splitOverride`, le champ qu'interroge le calcul | — |
| Charges antérieures restées au prorata malgré un « 50-50 » choisi | `.github/workflows/migration-repartition.yml` | ✅ RÉSOLU 2026-08-23 — migration à la demande, simulation par défaut, sauvegarde puis contrôle après écriture | Lancer depuis l'onglet Actions |
| Gestion des destinations exposée sur `window` sans aucun bouton | `public/FairSplit.html` | ✅ RÉSOLU 2026-08-23 — bouton « 🏦 Destinations », les deux sens fermés par `tests/actions-atteignables.test.js` | — |
| Sélecteur d'emoji sans bière, café ni croissant — les catégories que le GPS vise | `public/js/modules/custom-lists.js` | ✅ RÉSOLU 2026-08-23 — 57 propositions rangées par familles, contrôlées par test | — |
| Aucun moyen de regrouper les dépenses d'un séjour ou d'un chantier | `public/js/modules/envelopes.js` | ✅ RÉSOLU 2026-08-23 — enveloppes transversales, sur charges fixes comme variables, sans effet sur le solde | Vue dédiée et enveloppe active à venir |
| Aucune charge ne portait ni n'affichait la date de la dépense | `public/js/utils/date.js`, les deux formulaires | ✅ RÉSOLU 2026-08-23 — champ « Date de la dépense », affichage sur chaque ligne, exports corrigés | — |
| Jour calculé en UTC : une dépense de 00h30 datée de la veille en hiver | `public/js/modules/quick-add.js` | ✅ RÉSOLU 2026-08-23 — `dateDuJour()` lit le fuseau de l'appareil | — |
| Aucune liste n'était triée : ordre des clés Firebase | `public/js/utils/tri.js` | ✅ RÉSOLU 2026-08-23 — plus récent d'abord, catégories par total décroissant | — |
| Un remboursement n'avait ni date ni moyen d'être corrigé | `public/js/modules/reimbursements.js` | ✅ RÉSOLU 2026-08-23 — champ date, réouverture, tri | — |
| Recherche aveugle au payeur, à l'enveloppe, à la date, au lieu et aux remboursements | `public/js/modules/search.js` | ✅ RÉSOLU 2026-08-23 — ce qu'on lit à l'écran se cherche | — |
| Éditer une charge affichait « Ajouter » | les trois modales de saisie | ✅ RÉSOLU 2026-08-23 — titre et bouton accordés au geste | — |
| Le lieu ne s'écrivait que par le GPS, au moment de la saisie | `public/js/utils/recherche-lieu.js`, `public/js/modules/choix-lieu.js` | ✅ RÉSOLU 2026-08-23 — recherche par nom, rattachable après coup | Charges variables seules |
| Recherche de lieu à l'échelle de la planète : « Caffe Mamma » à Argelès rendait New York | `public/js/utils/recherche-lieu.js`, `public/js/modules/choix-lieu.js` | ✅ RÉSOLU 2026-08-23 — cadrée sur 60 km autour de la position connue, classée par distance, élargie et annoncée si rien | — |
| Hors réseau, l'application se chargeait et ne servait à rien : dix secondes par lecture, quinze par écriture, puis rien | `public/js/utils/miroir.js`, `public/js/db.js` | ✅ RÉSOLU 2026-08-24 — miroir des lectures et file d'attente durables, rejeu à la reconnexion | `localStorage` ; effacé à la déconnexion |
| Le mode hors ligne ne savait en sortir que si Firebase annonçait la reconnexion — jamais de lui-même | `public/js/db.js`, `public/js/utils/connection-banner.js` | ✅ RÉSOLU 2026-08-24 — reprises espacées, au retour au premier plan, et deux issues sur le bandeau | Signalé après des heures bloquées |
| Journal de diagnostic figé à 4 s, et effacé par le rechargement qui servait à le lire | `public/js/utils/diagnostics.js` | ✅ RÉSOLU 2026-08-24 — bouton « Rafraîchir », session précédente mise à l'abri à l'import | — |
| App Check : `activate()` ne prouve rien, 0 requête validée sur 159 | `public/js/firebase-init.js` | ⚠️ INSTRUMENTÉ, NON RÉSOLU — `connect-src` corrigé, mais l'échange rend toujours « 400 ». Reste à vérifier dans la console : clé de site et fournisseur déclarés | NE PAS passer en « Appliqué » avant de voir des requêtes validées |
| `connect-src` interdisait à reCAPTCHA ses propres requêtes | `public/FairSplit.html`, `firebase.json` | ✅ RÉSOLU 2026-08-24 — origine ajoutée des deux côtés | `?appcheck=0` ouvre sans attestation |
| **Base injoignable pour toujours sur un réseau sain.** Un mode avion pose `previous_websocket_failure` dans `localStorage` ; le SDK bascule alors sur le long-polling, qui injecte des `<script>` vers l'hôte de la base — ce que `script-src` refusait. Bascule sans retour : le drapeau ne s'efface que sur une liaison réussie, devenue impossible. Effacer les données du site était le seul remède | `public/FairSplit.html` | ✅ RÉSOLU 2026-08-24 — hôte autorisé dans `script-src` et `frame-src` | Le refus a lieu dans l'iframe du SDK : aucune violation n'était journalisée |
| Les deux politiques n'étaient comparées que dans un sens : ce que la page autorise doit être dans `firebase.json`. L'inverse, non — et c'est par là que la panne est passée | `tests/chargement-initial.test.js` | ✅ RÉSOLU 2026-08-24 — comparaison bidirectionnelle, `script-src-elem` résolu selon la spécification | A trouvé `frame-src` dès sa première exécution |
| Rien ne distinguait quatre causes de base injoignable, aux remèdes opposés — se déconnecter ne répare pas un WebSocket coupé | `public/js/utils/sonde-liaison.js` | ✅ RÉSOLU 2026-08-24 — jeton renouvelé de force puis lecture HTTPS authentifiée ; le bandeau annonce la cause établie | Le jeton n'est jamais journalisé, seulement sa longueur |
| Six secondes par ouverture pour une attestation qui échoue : auth bloquée 6 621 ms avec, 1 146 ms sans | `public/js/utils/attestation.js` | ✅ RÉSOLU 2026-08-24 — écartée pour 24 h après un échec, retentée ensuite | Le repos est borné : sinon une console réparée ne serait jamais reprise |
| Le compte des saisies retombait à zéro au retour au premier plan | `public/js/utils/connection-banner.js` | ✅ RÉSOLU 2026-08-24 — le bandeau retient le dernier compte annoncé | — |

| Le compte connecté n'était rattaché à aucun emplacement : la saisie rapide proposait `vous` en dur, sur les deux téléphones | `public/js/config.js`, `public/js/utils/members.js` | ✅ RÉSOLU 2026-08-24 — `EMPLACEMENTS_PAR_COMPTE`, le payeur proposé est celui qui tient l'appareil | Repli sur `vous` pour un compte non déclaré |
| Deux messages simultanés se posaient au même point : `.toast` sortait du flux de son conteneur | `public/css/components.css` | ✅ RÉSOLU 2026-08-24 — mesuré à 3 px d'écart avant, 59 après | La garde du bas d'écran est rétablie |
| Le bouton « Ajouter » d'une enveloppe précédait le budget et les deux dates qu'il envoie | `public/js/modules/envelopes.js` | ✅ RÉSOLU 2026-08-24 — bouton sous ses champs, Entrée avance au lieu de valider | — |
| La carte n'avait de modale que le balisage : `position: static`, posée au dernier pixel de la page | `public/css/map.css` | ✅ RÉSOLU 2026-08-24 — voile fixe, Échap et clic extérieur, défilement interne | — |
| La recherche exigeait les accents : « intermarche » ne trouvait pas « Intermarché » | `public/js/utils/recherche-texte.js` | ✅ RÉSOLU 2026-08-24 — pliage Unicode des deux côtés | La requête vide ne filtre toujours rien |
| Les lavis sémantiques étaient écrits en dur, avec les teintes du thème sombre | `public/css/variables.css` | ✅ RÉSOLU 2026-08-24 — dix jetons, déclinés dans les deux thèmes | Le bouton Google reste en dur, sa charte l'impose |
| Trois bascules de rappel que Chrome sur Android refusait en silence | `public/js/modules/notifications.js` | ✅ RÉSOLU 2026-08-24 — envoi par le service worker, échec annoncé | Les rappels ne partent que si l'application est ouverte : le panneau le dit |
| Au-delà de douze mois, l'historique restait en base sans qu'aucun chemin ne l'affiche | `public/js/utils/periodes.js` | ✅ RÉSOLU 2026-08-24 — tous les mois connus, plus un mois d'avance | — |
| « Renommer » promis par deux info-bulles, absent partout | `public/js/utils/renommage.js` | ✅ RÉSOLU 2026-08-24 — renommage des trois listes, report sur les charges | Une charge porte le libellé, pas l'identifiant |
| Une enveloppe ne se lisait que mois par mois, et ne s'éditait pas | `public/js/modules/envelopes.js` | ✅ RÉSOLU 2026-08-24 — vue tous mois confondus, édition sur place | La vue lit `periods` une fois, à l'ouverture |
| Le 50-50 exigeait des salaires dont il n'a pas besoin | `public/js/utils/calculations.js` | ✅ RÉSOLU 2026-08-24 — `exigeLesSalaires` | Le prorata les réclame toujours |
| Une charge sans montant rendait tout le bilan égal à NaN | `public/js/utils/calculations.js` | ✅ RÉSOLU 2026-08-24 — un montant inexploitable vaut zéro | — |
| Le graphe de tendances était étiré 1,56× sur un écran fin | `public/js/modules/trends.js` | ✅ RÉSOLU 2026-08-24 — canevas accordé à `devicePixelRatio` | Remesuré à 1,00 |
| Le graphe de tendances n'avait que 25 px de haut pour six graduations, qui se chevauchaient | `public/css/summary.css`, `public/js/modules/trends.js` | ✅ RÉSOLU 2026-08-25 — hauteur réelle, marges calculées, légende sortie du tracé | Régression de la correction `devicePixelRatio` |
| Un seul mois produisait un graphe d'un point et une « tendance » de 0 € en rouge | `public/js/modules/trends.js` | ✅ RÉSOLU 2026-08-25 — le panneau dit qu'il n'y a pas encore de quoi comparer | — |
| « Tendance » comparait le premier mois au dernier, et « Moyenne » se laissait tirer par un mois exceptionnel | `public/js/utils/tendances.js` | ✅ RÉSOLU 2026-08-25 — écart à la médiane des mois précédents, mois ordinaire | Le mois en cours est signalé comme incomplet |
| Les revenus et les charges détaillées étaient lus par le module de tendances, puis jetés | `public/js/modules/trends.js` | ✅ RÉSOLU 2026-08-25 — taux d'effort, reste à vivre, catégorie qui a le plus bougé | Aucune lecture supplémentaire |
| Saisir une dépense exigeait d'ouvrir l'application, d'attendre, puis de viser le bouton flottant | `public/manifest.json`, `public/js/utils/raccourci.js` | ✅ RÉSOLU 2026-08-25 — raccourci d'appui long « ⚡ Saisie rapide », posable sur l'écran d'accueil | Un vrai widget Android exigerait une application native |
| La modale du raccourci n'ouvrait qu'au bout de l'initialisation : le temps gagné sur les gestes était repris par l'attente | `public/js/app.js`, `public/js/utils/attente-application.js` | ✅ RÉSOLU 2026-08-25 — ouverte avant Firebase, sur les valeurs par défaut ; l'écriture seule attend | Se referme si Firebase répond qu'il n'y a personne |
| Une modale reprenait le focus 100 ms après l'ouverture, même posé ailleurs entre-temps : « 12,50 » puis « Cafe » donnaient un montant à « 12,50Cafe » | `public/js/components/modal.js`, `public/js/modules/quick-add.js` | ✅ RÉSOLU 2026-08-25 — le report ne s'applique plus si le focus est déjà posé dans la modale | Défaut ancien, rendu atteignable par le raccourci |
| Les contrôles du raccourci tenaient sur un délai fixe : sur un runner chargé la fenêtre se refermait avant d'être vue, et le déploiement, qui en dépend, ne s'est pas fait | `tests/e2e/_harness.js` | ✅ RÉSOLU 2026-08-25 — Firebase retenu jusqu'à `__libererAuth()`, fenêtre sans durée | C'est ce contrôle qui a révélé le vol de focus |
| Le bilan disait ce qui avait été dépensé, jamais ce qui restait à passer — alors que la reconduction inscrit les charges fixes à leur quantième dès le premier du mois | `public/js/utils/previsionnel.js`, `public/js/modules/summary.js` | ✅ RÉSOLU 2026-08-25 — montant encore à venir sous le solde, échéances nommées | Aucune lecture ni donnée supplémentaire |
| Un déploiement raté ne se voyait nulle part : le job E2E tombé sur main, `deploy` sauté, le site figé deux heures sans un mot | `.github/workflows/deploy.yml` | ✅ RÉSOLU 2026-08-25 — `gh-pages` comparée à `public/` après publication, et un ticket ouvert dès qu'une étape échoue | Le ticket est unique par panne, pas par exécution |
| `components/modal.js` à 29,5 % de couverture, alors que neuf modules en dépendent et qu'un défaut de montant y a vécu des mois | `tests/components/modal.test.js` | ✅ RÉSOLU 2026-08-25 — 100 % des instructions : piège à focus, Échap, remise à zéro, confirmation | — |
| La couverture annoncée ignorait 300 tests de bout en bout : des modules réellement éprouvés figuraient à 0 % | `tools/fusionner-couverture.mjs` | ✅ RÉSOLU 2026-08-25 — relevés V8 du navigateur fusionnés avec Vitest ; 59,4 % → **85,2 %** de lignes, mesure inchangée, comptage corrigé | Deux erreurs de méthode avant d'y arriver, toutes deux plausibles |
| Le prévisionnel disparaissait dès que tout était passé : le 25 du mois il ne montrait rien, et un panneau absent se lit comme une panne | `public/js/utils/previsionnel.js`, `public/js/modules/summary.js` | ✅ RÉSOLU 2026-08-25 — « Tout est passé ce mois-ci » quand les dates permettent de l'affirmer ; silence seulement si aucune charge n'est datée | Signalé à l'usage, le jour même de la mise en ligne |
| Douze types de lieux OpenStreetMap visaient « Café », « Bar » et « Boulangerie », trois catégories qu'aucun foyer ne possédait | `public/js/config.js`, `public/js/utils/categorie-lieu.js` | ✅ RÉSOLU 2026-08-25 — ajoutées aux défauts, et proposées à qui a déjà une liste enregistrée | Un test compare les deux fichiers et tombe s'ils divergent |
| Onze catégories pour 81 types de lieux : « Bricolage », « Jardin », « Culture », « Sport », « Vêtements », « Coiffeur », « Péage », « Parking » manquaient, et le GPS repliait tout sur « Maison » ou « Loisirs » | `public/js/config.js`, `public/js/utils/categorie-lieu.js` | ✅ RÉSOLU 2026-08-25 — dix-neuf catégories, 93 types de lieux, chacun visant la sienne | Le test qui compare les deux fichiers tient toujours |
| Dix-neuf tuiles à parcourir pour en toucher une : la saisie rapide devenait plus lente que le formulaire complet | `public/js/utils/categories-frequentes.js`, `public/js/modules/quick-add.js` | ✅ RÉSOLU 2026-08-25 — six tuiles classées par usage réel, une septième déplie le reste | La ligne « Souvent » disparaît : elle répétait la grille |
| La date disait quel jour, jamais à quel moment : deux courses du même samedi se lisaient à l'identique, et sortaient dans l'ordre de saisie | `public/js/utils/date.js`, `public/js/utils/tri.js` | ✅ RÉSOLU 2026-08-25 — champ `heure` (HH:MM local), prérempli et effaçable, affiché, trié, cherché et exporté | Jamais déduite de `timestamp` : l'instant d'écriture n'est pas celui de la dépense |
| Un second appui pendant que `dbPush` répondait écrivait une seconde charge : le verrou n'existait que dans la saisie rapide | `public/js/utils/soumission.js` | ✅ RÉSOLU 2026-08-25 — verrou partagé, nommé par formulaire, et bouton qui dit l'écriture en cours | Un loyer compté deux fois pèse plus qu'un café |
| Le panneau des virements rendait « NaN € » là où le bilan avait été blindé contre le même montant abîmé | `public/js/utils/calculations.js` | ✅ RÉSOLU 2026-08-25 — même garde des deux côtés, et un test qui compare les deux chiffres | Mesuré : bilan 900 €, virement NaN |
| La déconnexion effaçait le miroir de l'espace courant — déjà retombé au foyer quand le compte venait du bac à sable | `public/js/db.js`, `public/js/modules/auth.js` | ✅ RÉSOLU 2026-08-25 — l'espace est relevé avant `signOut()`, effacé après | L'ordre d'origine était juste, sa lecture ne l'était plus |
| `heure` était le seul champ d'une charge sans règle de validation : il tombait dans le fourre-tout | `database.rules.json` | ✅ RÉSOLU 2026-08-25 — format contrôlé, chaîne vide comprise, dans les quatre blocs de charges | Les remboursements n'en portent pas |
| Une sauvegarde en échec ne se voyait nulle part, alors que le workflow lui-même dit qu'une sauvegarde qu'on croit faite est pire que rien | `.github/workflows/sauvegarde.yml` | ✅ RÉSOLU 2026-08-25 — ticket ouvert dès qu'une exécution échoue, un par panne | Il tourne à 03:17, sans témoin |
| Rien n'empêchait un site tiers d'encadrer l'application : Pages ne pose aucun en-tête, et `frame-ancestors` est ignorée en `<meta>` | `public/js/utils/cadre.js` | ✅ RÉSOLU 2026-08-25 — la page se vide et s'explique si elle est encadrée, avant Firebase | Un cadre ne lit rien ; il fait cliquer |
| La reconduction posait son empreinte avant de copier : une coupure entre les deux lignes laissait le mois marqué « reconduit » sans une seule charge, et `planRecurrence` s'y arrête pour de bon. Le loyer disparaissait du mois, définitivement, en silence | `public/js/modules/reconduction.js` | ✅ RÉSOLU 2026-08-26 — empreinte rendue si la copie échoue, et l'échec annoncé | La transaction contre le doublon à deux téléphones est conservée |
| Se déconnecter puis se reconnecter sans recharger reposait un second écouteur sur sept modules : deux relectures par changement de mois, deux toasts par message | `public/js/utils/ecouteur.js` | ✅ RÉSOLU 2026-08-26 — registre hors du DOM, `WeakMap` plutôt qu'attribut | Les écritures en double étaient déjà bloquées par `soumission.js` |
| Deux lectures d'initialisation retombaient en silence sur une valeur par défaut qui fausse l'argent : mode illisible → prorata, report illisible → désactivé | `public/js/modules/share-mode.js`, `carry-over.js` | ✅ RÉSOLU 2026-08-26 — l'erreur remonte à `runStep`, qui nomme l'étape dans « Chargement partiel » | Le repli reste appliqué : sans mode, aucun bilan |
| Le conteneur des toasts ne portait aucune région vivante : tout le retour de l'application était muet pour un lecteur d'écran | `public/js/components/toast.js` | ✅ RÉSOLU 2026-08-26 — `role="status"`, et `role="alert"` sur les erreurs | Chaque bandeau du HTML en portait un, celui-là non |
| La comparaison des deux politiques de sécurité ne couvrait que quatre directives sur huit — celles qu'une panne avait fait ajouter | `tests/chargement-initial.test.js`, `firebase.json` | ✅ RÉSOLU 2026-08-26 — réunion des deux fichiers, plus de liste tenue à la main | Aucun trou en production : Pages ne sert que la balise |
| Les boutons à deux états de la saisie rapide ne marquaient leur choix que par une classe CSS | `public/js/modules/quick-add.js` | ✅ RÉSOLU 2026-08-26 — `aria-pressed` sur les trois groupes, `aria-expanded` sur « N autres » | « Payé par » décide du sens du solde |
| Les règles étaient plus permissives que les formulaires : salaires ×10, montants ×100 | `database.rules.json` | ✅ RÉSOLU 2026-08-26 — alignées sur `LIMITS`, et un test les tient ensemble | Les budgets restent plus larges, à dessein |
| **La reconduction mensuelle était refusée par les règles.** `reconduction.js:83` réserve le mois par `periods/{mois}/reconductedFrom`, clé qui tombait dans `$autre: {".validate": false}` — mesuré 401 contre le moteur réel. Les charges fixes n'étaient donc reconduites aucun mois, avec à l'écran « elles le seront à la prochaine ouverture », promesse que la règle rendait intenable | `database.rules.json`, `tests/regles-couvrent-les-ecritures.test.js` | ✅ RÉSOLU 2026-08-27 — `reconductedFrom` et `shareMode` déclarés, et un test compare tout chemin écrit par le code aux règles | Le test unitaire mockait Firebase ; le seul E2E qui l'écrivait est `skip` en CI |
| Une confirmation écartée d'un clic restait armée : `closeModal` ne faisait pas le `cleanup()` de `showConfirmModal`. Écarter « Remplacer toutes vos données ? » puis confirmer une suppression déclenchait les deux | `public/js/components/modal.js` | ✅ RÉSOLU 2026-08-27 — toute fermeture dénoue la promesse ; 5 des 7 nouveaux tests tombent sur le code d'avant | 100 % des instructions ne l'avait pas vu : c'est la rencontre de deux chemins couverts |
| Un instantané de revenus partiel mettait les trois autres à zéro : corriger son seul salaire faisait basculer le prorata à 100/0 | `public/js/utils/salaries.js` | ✅ RÉSOLU 2026-08-27 — une clé absente retombe sur la valeur globale, un zéro saisi reste un zéro | Mesuré : solde 0 € au lieu de 409,09 € |
| La chaîne de report calculait une autre assiette que l'écran : `normalizePair` jetait les revenus complémentaires | `public/js/utils/calculations.js` | ✅ RÉSOLU 2026-08-27 — une seule fabrique d'assiette, et un test qui verrouille l'égalité | Mesuré : écran 400 €, report 500 €, cumulés chaque mois |
| Changer de mode de partage réécrivait les mois déjà soldés : le repli `period.shareMode` n'était jamais écrit | `public/js/modules/reconduction.js` | ✅ RÉSOLU 2026-08-27 — le mois reconduit fige son mode, dans la même écriture atomique | Mesuré : un juillet clos ressuscitait 125 € |
| Un remboursement sans `direction` était compté comme « conjointe → vous » | `public/js/utils/calculations.js`, `database.rules.json` | ✅ RÉSOLU 2026-08-27 — sens inconnu ignoré, et les deux valeurs exigées côté serveur | Mesuré : 1 000 € d'écart entre les deux lectures |
| Le budget par catégorie comptait les charges supprimées, tombait à `NaN` sur un montant absent, et attribuait le partagé à la conjointe | `public/js/modules/categories.js` | ✅ RÉSOLU 2026-08-27 — la garde de `calculations.js`, posée là où elle manquait | Le test qui verrouillait le défaut a été retourné |
| Les totaux des exports CSV et PDF n'avaient pas la garde du bilan | `public/js/modules/export.js` | ✅ RÉSOLU 2026-08-27 — `totalDesCharges()`, une seule lecture d'un montant stocké | Troisième occurrence de la même garde |
| Un compte du foyer effaçait tout l'espace en une requête : `.validate` n'est jamais évaluée sur une suppression | `database.rules.json` | ✅ RÉSOLU 2026-08-27 — `newData.exists()` sur `.write`, et `hasChildren()` sur les conteneurs | L'effacement ciblé de `periods` reste possible : le cascade `.write` ne permet pas de restreindre un descendant |
| La file hors ligne rejouait sans revalider : une entrée forgée dans `localStorage` — origine partagée par tous les dépôts Pages du compte — écrivait n'importe quoi, effacement compris | `public/js/db.js` | ✅ RÉSOLU 2026-08-27 — `operationRejouable()` au dépôt comme au rejeu | `getDataPath('')` rend `household` : c'était la charge utile |
| Restaurer une sauvegarde hors ligne mettait l'écrasement de toute la racine en file, en l'annonçant comme réussi | `public/js/modules/backup.js` | ✅ RÉSOLU 2026-08-27 — refusée hors ligne, avec le motif | C'est le cas nominal : on restaure quand l'application paraît cassée |
| Le jeton d'identité Firebase voyageait dans la query string, exposé par l'API Resource Timing et par tout proxy TLS | `public/js/utils/sonde-liaison.js` | ✅ RÉSOLU 2026-08-27 — `Authorization: Bearer` et `referrerPolicy: no-referrer` | La sonde ne part que si la liaison est rompue, donc d'abord derrière un tunnel d'entreprise |
| `?emulator=1` restait actif en production, et la CSP y autorisait `http://localhost:*` | `public/js/config.js`, `public/FairSplit.html` | ✅ RÉSOLU 2026-08-27 — restreint à un hôte local, origines retirées de la politique publiée | `auth.useEmulator()` désactive toute vérification de jeton |
| `paidBy`, `splitMode`, `splitOverride.mode` et `customPercents` n'étaient bornés que côté client : 100 %/100 % inventait de l'argent | `database.rules.json` | ✅ RÉSOLU 2026-08-27 — ensembles de valeurs et invariant de somme côté serveur | 45 contrôles rejoués dans les deux sens contre le moteur réel |
| `SECURITY.md` affirmait le dépôt privé — il est public, et ses artefacts de sauvegarde avec lui | `SECURITY.md`, `.github/workflows/sauvegarde.yml` | ✅ RÉSOLU 2026-08-27 — affirmation corrigée, paramètres S2K épinglés | Reste à trancher : passer le dépôt en privé referme le point d'un geste |
| La CI lançait `eslint --quiet`, qui supprime **tous** les avertissements `no-unsanitized` que `SECURITY.md` annonce comme garde-fou | `.github/workflows/deploy.yml` | ✅ RÉSOLU 2026-08-27 — plafond figé sur `public/js`, un site de plus fait échouer la CI | Mesuré : `eslint .` en rapporte 26, `--quiet` n'affiche rien |
| `init.js` résolvait un nom de fonction sur `window` depuis un attribut du DOM : 47 fonctions joignables par leur nom, dont `settleBalance` et `pickBackupFile`. La CSP ne voit pas `data-action`, donc toute injection HTML redevenait un appel arbitraire | `public/js/init.js`, `tests/actions-declarees.test.js` | ✅ RÉSOLU 2026-08-27 — liste blanche de 43 actions, tenue au balisage dans les deux sens | `data-on-input` n'exigeait même pas de clic |
| `script-src` autorisait `unpkg.com` en entier — un CDN qui sert n'importe quel paquet npm, donc du script arbitraire | `public/FairSplit.html`, `firebase.json` | ✅ RÉSOLU 2026-08-27 — borné au chemin exact de Leaflet | Servir Leaflet depuis l'application supprimerait l'origine ; à faire |
| Une écriture refusée en permanence bloquait la file hors ligne pour toujours, et tout ce qui suivait avec | `public/js/db.js`, `public/js/modules/auth.js` | ✅ RÉSOLU 2026-08-27 — refus définitif distingué de la panne, écarté et annoncé | `deploy-rules` redéploie les règles à chaque fusion : le déclencheur est dans la CI |
| Un libellé contenant `.` `$` `#` `[` `]` `/` rendait **tous** les budgets insauvegardables : `category-budgets.js` s'en sert comme clé Firebase | `public/js/utils/renommage.js` | ✅ RÉSOLU 2026-08-27 — validateur partagé par l'ajout et le renommage, message qui nomme le caractère | « Eau/Gaz » suffisait ; rien ne reliait la panne au nom |
| Le service worker adoptait un cache incomplet : `skipWaiting()` avant le précache, et l'échec d'`addAll` avalé | `public/sw.js` | ✅ RÉSOLU 2026-08-27 — fichier par fichier, socle exigé, `skipWaiting` après | Un portail captif au mauvais moment suffisait |
| La garde anti-encadrement ne s'exécutait qu'après le rendu, et pas du tout si `app.js` échouait | `public/js/anti-cadre.js` | ✅ RÉSOLU 2026-08-27 — script classique en tête de `<head>`, avant la première feuille | Fichier externe : la CSP se passe d'`unsafe-inline`, on n'y touche pas |
| Le compte de service Firebase Admin partageait son job avec `npm ci`, donc avec les scripts d'installation de 973 dépendances | les trois workflows | ✅ RÉSOLU 2026-08-27 — `firebase-tools` seul, épinglé, `--ignore-scripts` | `SECURITY.md` posait déjà ce raisonnement pour l'autre secret |
| Les alertes de CI choisissaient leur ticket par recherche de titre : sur un dépôt public, n'importe qui pouvait le détourner | `deploy.yml`, `sauvegarde.yml` | ✅ RÉSOLU 2026-08-27 — recherche par étiquette et par auteur | Les liens d'exécution partaient dans le ticket d'un tiers |
| Le résumé public de la migration recopiait les totaux mensuels en euros du foyer | `.github/workflows/migration-repartition.yml` | ✅ RÉSOLU 2026-08-27 — détail renvoyé aux journaux du job | Le résumé est lisible par qui peut lire le dépôt |
| Les coordonnées du domicile partaient chez Nominatim en précision brute (quinze décimales) | `public/js/modules/quick-add.js` | ✅ RÉSOLU 2026-08-27 — quatre décimales, et `referrerPolicy: no-referrer` | La position complète reste sur la charge, en base |
| Un nom de lieu Nominatim n'était pas borné, alors que les règles le plafonnent à 200 caractères : l'écriture était refusée | `public/js/utils/lieu.js` | ✅ RÉSOLU 2026-08-27 — tronqué au dernier espace | Le refus allait grossir la file hors ligne |
| L'adresse du compte refusé était écrite dans la console au niveau de journalisation de production | `public/js/modules/auth.js` | ✅ RÉSOLU 2026-08-27 — le motif sans la valeur | Le journal de diagnostic la garde, il ne s'ouvre que par `?diag=1` |
| Le `<select>` de répartition d'une charge fixe n'avait aucun gestionnaire : « Personnalisé » n'affichait jamais ses champs et enregistrait 50/50 | `public/js/modules/fixed-charges.js`, `public/FairSplit.html` | ✅ RÉSOLU 2026-08-27 — le jumeau du côté variable, qui existait déjà | On demandait du sur-mesure, on obtenait un partage en deux |
| « X ajouté » s'affichait même quand l'enregistrement avait échoué : deux messages contradictoires, le dernier disant que tout allait bien | `public/js/modules/custom-lists.js` | ✅ RÉSOLU 2026-08-27 — la sauvegarde dit si elle a abouti | — |
| Un `splitOverride` partiel rendait la part de chacun `NaN` | `public/js/utils/calculations.js` | ✅ RÉSOLU 2026-08-27 — une seule lecture des pourcentages, repli 50/50 | Les règles acceptent `{mode:'custom'}` sans les chiffres |
| `docs/TROUBLESHOOTING-AUTH.md` prescrivait d'ajouter `http://localhost` aux origines autorisées, sans date de péremption | `docs/TROUBLESHOOTING-AUTH.md` | ✅ RÉSOLU 2026-08-27 — production d'abord, local le temps du dépannage, et le dire | Une origine autorisée l'est durablement |
| L'estampillage du service worker n'était jamais vérifié : `grep -n` affichait sans échouer, et le contrôle de publication rejouait le même `sed` | `.github/workflows/deploy.yml` | ✅ RÉSOLU 2026-08-27 — `grep -q` sur la valeur substituée, échec franc | Les deux côtés auraient été identiquement non estampillés |
| Les hôtes d'émulateur n'étaient pas exclus du service worker : les lectures locales étaient mises en cache et resservies comme fraîches | `public/sw.js` | ✅ RÉSOLU 2026-08-27 — `estEmulateurLocal()` | Exactement le symptôme que cette liste existe pour empêcher |
| Sauvegarde et migration tournaient sur Node 20 quand `engines` exige ≥ 22 | `sauvegarde.yml`, `migration-repartition.yml` | ✅ RÉSOLU 2026-08-27 — Node 22 partout | Les deux workflows qui touchent la production |
| **La CSP n'était appliquée nulle part depuis la #94.** Le `-->` orphelin avait poussé la balise dans `<body>`, où Chromium l'ignore purement — mesuré sur deux pages témoins : même script en ligne bloqué en tête, exécuté dans le corps. La balise était bien dans le fichier, l'onglet Éléments la montrait, et le site tournait sans politique. Remise en tête, elle a aussitôt refusé les émulateurs, dont `connect-src` avait perdu les origines locales : cinq tests d'intégration tombés, `#mainApp` resté caché | `public/FairSplit.html`, `firebase.json`, `tests/balisage-sain.test.js` | ✅ RÉSOLU 2026-08-27 — origines locales rendues à `connect-src`, et deux contrôles : la balise doit être dans `<head>`, et les origines locales tombent avec la garde d'hôte de `config.js` | Ce qui ferme le lien piégé, c'est `USE_EMULATOR`, pas l'absence d'origine |
| Toute charge était commune : `paidBy` disait qui avait **avancé** l'argent, jamais à qui la dépense **appartenait**. Une séance de sport, un cadeau, des courses de midi — tout entrait dans le solde, et il fallait choisir entre fausser le décompte ou ne rien saisir | `public/js/utils/perimetre.js` | ✅ RÉSOLU 2026-08-27 — champ `perimetre`, exclu du bilan, des virements, du report, du prévisionnel, des budgets, des tendances et des exports | Une charge sans le champ reste commune : tout l'existant est préservé |
| Un champ neuf devait être respecté par sept fonctions d'argent, et un seul oubli rendait un chiffre faux **en silence** — la classe de défaut qui a coûté le plus cher à ce dépôt | `tests/utils/perimetre-transversal.test.js` | ✅ RÉSOLU 2026-08-27 — le test vérifie la propriété `f(communes) === f(communes + solo)` sur chaque fonction, sans rien supposer de la façon dont le filtre est posé | A trouvé `previsionnelDuMois` avant écriture : 1 817 € au lieu de 1 215 €, et « Salle de sport » nommée parmi les échéances du foyer |
| Rien n'empêchait d'écrire une dépense solo « partagée » — une charge sortie du solde sans qu'on sache à qui elle est | `database.rules.json` | ✅ RÉSOLU 2026-08-27 — invariant croisé côté serveur : `perimetre === 'solo'` exige `paidBy` ∈ {vous, conjointe} | 14 écritures rejouées contre le moteur réel, 6 acceptées et 8 refusées, toutes conformes |
| L'enveloppe montait de zéro vers un plafond quand celle d'une banque descend d'une allocation vers zéro. Même arithmétique, lecture inverse — et « 480 € dépensés » se constate quand « 120 € restants » se décide | `public/js/utils/enveloppes.js` | ✅ RÉSOLU 2026-08-27 — `partRestante`, la jauge descend ; en dépassement elle se rend pleine et rouge plutôt que de s'effacer | Une barre vide se lit « pas de données », pas « vous avez dépassé » |
| Une seule sorte d'enveloppe pour deux besoins opposés : un budget dont le reliquat est une *information*, et une cagnotte dont le reliquat *est* de l'argent | `public/js/utils/enveloppes.js` | ✅ RÉSOLU 2026-08-27 — `nature` (mensuelle / cagnotte) et `report`, avec le cadrage par mois qui en découle | L'absence vaut `cagnotte` : c'est exactement ce que faisait l'enveloppe, toutes celles en base sont préservées |
| Les enveloppes étaient rangées par sujet, jamais par rythme de trésorerie : une provision de Noël partageait sa poche avec les sorties du samedi, et perdait toujours | `public/js/modules/envelopes.js` | ✅ RÉSOLU 2026-08-27 — cinq rangs, ordonnés comme l'argent quitte le compte le jour de paie, « À classer » en fin plutôt que caché | Diagnostiqué sur les captures Sumeria du foyer : le pot « Envies » vidé le 15 |
| `chargesDuMois()` rendait des charges sans `periode`, or le cadrage d'une mensuelle filtre dessus : passées au bilan, elles auraient toutes été écartées | `public/js/modules/envelopes.js` | ✅ RÉSOLU 2026-08-27 — la période est estampillée à la source | Piège désamorcé avant son premier appelant |
| Une enveloppe solo pouvait s'écrire sans propriétaire, et un propriétaire se poser sur une commune | `database.rules.json` | ✅ RÉSOLU 2026-08-27 — invariant croisé dans les deux sens | 16 écritures rejouées contre le moteur réel, 7 acceptées et 9 refusées |
| Une cagnotte ne savait pas dire ce qu'elle **contenait** : seulement ce qu'il restait d'un objectif. Or « Travaux : 28,63 € » n'est pas un reliquat de budget, c'est de l'argent qui existe | `public/js/utils/versements.js` | ✅ RÉSOLU 2026-08-27 — nœud `/versements/{enveloppe}`, solde = versé − dépensé, et la jauge **monte** vers l'objectif au lieu de descendre | Un budget se vide, une cagnotte se remplit : même widget, sens opposé |
| Le basculement vers « contenu réel » ne pouvait pas être inconditionnel : appliqué à une cagnotte sans versement, `versé − dépensé` aurait donné un pot négatif là où l'écran affichait un budget tenu | `public/js/utils/versements.js` | ✅ RÉSOLU 2026-08-27 — `estAlimentee()` décide : sans versement, la lecture d'avant ; dès le premier, le contenu fait foi | Forcé par la rétrocompatibilité, pas choisi |
| Un versement ressemble à une dépense, et compter le même argent deux fois — en entrant dans le pot, puis en sortant comme charge — était le piège évident | `tests/e2e/cagnotte-versements.spec.js` | ✅ RÉSOLU 2026-08-27 — un test mesure le solde avant et après 400 € versés, et exige l'égalité | La règle fondatrice de l'enveloppe, verrouillée là où elle est le plus tentante à enfreindre |
| Le nœud `versements` était neuf, donc sous `$autre: false` : toute écriture aurait été refusée après un toast de succès | `database.rules.json` | ✅ RÉSOLU 2026-08-27 — déclaré, montant strictement positif, auteur nominatif obligatoire | 14 écritures rejouées contre le moteur réel, 5 acceptées et 9 refusées |
| « Perso » voulait dire « ça ne se partage pas », jamais « c'est à moi seul » : les deux comptes lisent tout `household`, et une dépense solo s'y affichait avec son montant et son libellé | `public/js/utils/confidentialite.js`, `database.rules.json` | ✅ RÉSOLU 2026-08-27 — espace `/prive/{qui}`, lisible par son seul propriétaire ; le refus vient du serveur | 28 lectures et écritures rejouées contre le moteur réel, dans les deux sens |
| **L'aval portait sur le mauvais geste.** La première version exigeait l'accord de la conjointe pour enregistrer ses **propres** dépenses privées : elle demandait la permission d'avoir un jardin secret, et rendait la fonction inutilisable tant que personne n'avait rien accordé. Ce qui doit être soumis à validation, c'est l'accès au détail de **l'autre** | `database.rules.json`, `public/js/utils/confidentialite.js`, `public/js/modules/prive.js` | ✅ RÉSOLU 2026-08-27 — écrire chez soi ne demande rien ; `/aval/{qui}` est devenu une permission de **lecture**, accordée par le propriétaire sur ses propres données | Signalé à la relecture : « chacun a le droit de mettre des données privées » |
| Un accès qu'on pourrait s'accorder soi-même ne serait pas un accès | `database.rules.json` | ✅ RÉSOLU 2026-08-27 — `/aval/{qui}` n'est écrivable que par **{qui}** : nul ne peut s'ouvrir l'espace d'en face. Même garantie qu'avant, dans l'autre sens | Trois racines hors de `household` : `.read` comme `.write` y cascadent, une règle profonde ne peut jamais restreindre |
| Refermer l'accès devait aussi refermer le passé — sinon « je referme » n'aurait voulu dire que « je referme à partir de maintenant » | `database.rules.json` | ✅ RÉSOLU 2026-08-27 — la lecture est conditionnée à l'accord courant, sans branche qui lui survive ; écrire et effacer les siennes restent toujours possibles | Cohérent avec ce qu'est cet accord : une permission de lecture, pas un permis déjà consommé |
| L'émulateur de base traite un jeton passé en `Authorization: Bearer` comme un **compte de service** et accorde la propriété : les 28 contrôles passaient tous, y compris les quatorze qui devaient échouer | script de vérification | ✅ RÉSOLU 2026-08-27 — identité passée par le paramètre `auth` | Un contrôle qui ne mesure rien est pire qu'un contrôle absent ; deux ❌ ultérieurs venaient d'un espace pollué par cette première exécution |
| Le détail privé mis en file hors ligne aurait atterri dans `localStorage`, sur l'origine que partagent tous les dépôts Pages du compte | `public/js/db.js` | ✅ RÉSOLU 2026-08-27 — accès absolus sans miroir ni file ; hors ligne, une écriture privée échoue franchement | La confidentialité vaut mieux qu'une saisie différée |
| Le total qui franchit le mur est **déclaratif** : aucune règle ne peut vérifier la somme de ce qu'elle n'a pas le droit de lire | `public/js/modules/prive.js` | ⚠️ INHÉRENT, ASSUMÉ — l'écran le dit en toutes lettres plutôt que de laisser croire à une garantie technique | C'est le prix du choix « détail privé, total public », pas un défaut |
| Le plafond d'avertissements eslint a arrêté la livraison pour un `innerHTML` de plus | `.github/workflows/deploy.yml` | ✅ RÉSOLU 2026-08-27 — 22 → 23, après avoir vérifié que les 53 interpolations du fichier sont échappées | Le garde-fou a fait son travail : exiger une justification plutôt que laisser passer en silence |
| **Un `-->` orphelin dans le commentaire de la garde anti-encadrement.** Trois lignes se retrouvaient hors commentaire, dont un `<script>` cité qui ouvrait un vrai élément : « Fichier externe, et non balise ` » s'affichait en haut de l'écran, et `anti-cadre.js`, avalé comme contenu de ce script, n'était jamais chargé — la garde était inerte tout en paraissant posée | `public/FairSplit.html`, `tests/balisage-sain.test.js` | ✅ RÉSOLU 2026-08-27 — commentaire refermé, et la page relue par un analyseur HTML réel | Introduit par le correctif précédent ; 5 assertions sur 9 tombent sur le balisage fautif |

| **Dix boutons d'outils et cinq sections empilés sur un seul écran.** Sur un téléphone, lire le solde et corriger une charge de la semaine passée demandaient le même geste : faire défiler jusqu'à trouver. Les huit outils qu'on ouvre deux fois l'an étaient rangés à égalité avec les deux qu'on ouvre chaque semaine — il fallait lire les dix pour en viser un | `public/css/onglets.css`, `public/js/utils/onglets.js` | ✅ RÉSOLU 2026-08-27 — trois onglets sous 900 px : Bilan, Charges, Réglages ; les colonnes de bureau intactes au-delà, barre effacée | Le point de rupture est celui qui existait déjà |
| Le balisage de `<main>` était déséquilibré depuis des mois : un `</section>` et un `</div>` orphelins, plus `.col-reglages` et sa section jamais refermées. L'analyseur HTML les ignore — rien ne se voyait, et rien ne l'aurait signalé avant qu'on touche à la structure | `public/FairSplit.html` | ✅ RÉSOLU 2026-08-27 — équilibré, et le découpage en panneaux repose dessus | Trouvé en préparant le découpage, pas par un test |
| Le bouton « Renseigner les salaires » vise un champ d'un autre panneau. Sous 900 px celui-ci est en `display: none` : `scrollIntoView` n'a nulle part où aller et `focus()` échoue en silence. Le bouton serait resté visible et inerte, là où l'application réclame une action | `public/js/modules/period.js` | ✅ RÉSOLU 2026-08-27 — l'onglet change avant que le champ soit visé | Trouvé sur une capture d'écran, pas dans le code |
| `.container .fab` ne désignait rien : le bouton flottant est un enfant direct de `<body>`. La règle qui devait le hisser au-dessus de la barre d'onglets était morte, et seule la valeur héritée de `responsive.css` évitait le chevauchement | `public/css/onglets.css` | ✅ RÉSOLU 2026-08-27 — `body .fab`, et un test qui mesure le chevauchement | Le sélecteur avait l'air juste |
| Sous 600 px, `responsive.css` applique `padding: var(--space-sm)` — un raccourci qui réécrit les quatre côtés et annulait la réserve gardée pour la barre fixe. Mesuré : 32 px de contenu masqués en bas de chaque panneau | `public/css/onglets.css` | ✅ RÉSOLU 2026-08-27 — `body .container`, spécificité supérieure | Trouvé par le test écrit pour ce cas précis |

| **L'en-tête et le sélecteur de mois occupaient 294 px sur 844 — 35 % du premier écran** — et le découpage en onglets a alourdi ce péage : changer d'onglet remonte en haut, donc on le repaie à chaque fois. Rien ne restait épinglé au défilement : passé le premier écran, plus moyen de savoir quel mois on lisait | `public/css/onglets.css`, `public/js/utils/entete.js` | ✅ RÉSOLU 2026-08-27 — en-tête sur une ligne (159 → 70 px), sélecteur collé qui se compacte, badge effacé au défilement. Mesuré : **294 → 193 px, 35 % → 23 %**, et 54 px épinglés qui portent le mois | Rien de tout cela au-delà de 900 px |
| Coller le mois et le solde chacun de son côté aurait exigé de décaler le second de la hauteur exacte du premier — une valeur qui change entre l'état compact et l'état de repos, donc un nombre en dur qui ment un cas sur deux | `public/FairSplit.html` | ✅ RÉSOLU 2026-08-27 — un seul conteneur `.bandeau-colle`, où les deux s'empilent d'eux-mêmes ; `display: contents` le rend à la grille au-delà de 900 px | Un test mesure le recouvrement plutôt que de le supposer |

| Une charge annuelle n'appartient pas au mois où elle tombe, et rien ne faisait la division : les enveloppes portaient un objectif, une échéance et le contenu du pot, mais octobre portait seul les 1 200 € de la taxe foncière | `public/js/utils/provisions.js` | ✅ RÉSOLU 2026-08-27 — part mensuelle calculée sur ce qui manque, divisé par ce qui reste de mois ; le retard fait monter la part au lieu de laisser filer l'objectif | Le rang ne décide de rien : une épargne datée obéit au même calcul |
| `moisEcoules` ramène tout écart nul ou négatif à 1 — juste pour une durée écoulée, faux pour une échéance : une provision dépassée aurait réclamé un douzième de plus au lieu de la totalité | `public/js/utils/provisions.js` | ✅ RÉSOLU 2026-08-27 — `moisRestants` distinct, qui rend 0, et six contrôles sur cette seule frontière | Trois états à l'écran : atteinte, dépassée, en cours |
| **La recherche ne voyait que le mois affiché.** Elle masquait des lignes déjà rendues — les autres mois ne sont pas dans la page, aucun réglage ne pouvait l'étendre | `public/js/utils/recherche-historique.js`, `public/js/modules/search.js` | ✅ RÉSOLU 2026-08-27 — case « tous les mois », panneau de résultats groupés, en-tête cliquable qui emmène au mois | Décochée par défaut : la lecture de tout l'historique se demande |
| `changePeriod()` ne prend aucun argument — elle lit le sélecteur. Lui passer une période ne faisait rien du tout | `public/js/modules/search.js` | ✅ RÉSOLU 2026-08-27 — la valeur est posée là où elle se lit, et l'option créée si le mois manque | Trouvé par le test du clic sur un mois |
| La reconduction n'écrivait que dans `fixedCharges` : une dépense régulière au montant changeant se ressaisissait chaque mois | `public/js/utils/recurrence.js`, `public/js/modules/reconduction.js` | ✅ RÉSOLU 2026-08-27 — case décochée par défaut, et la ligne repart **sans son montant** | La règle inverse des charges fixes, à dessein : le défaut y vaut « récurrente » |
| Aucune entrée en masse : le premier mois se saisissait charge par charge, et un relevé bancaire ne pouvait pas être versé | `public/js/utils/import-csv.js`, `public/js/modules/import.js` | ✅ RÉSOLU 2026-08-27 — import CSV tolérant sur la forme, avec aperçu et motifs de rejet | **Le payeur n'est jamais deviné** : sans colonne, l'écran le demande |
| Aucun garde-fou sur la géométrie : deux défauts d'un même jour trouvés sur des captures, pas par un test | `tests/e2e/coherence-visuelle.spec.js` | ✅ RÉSOLU 2026-08-27 — quatre propriétés sur trois onglets et quatre largeurs | Pas de captures de référence : le lissage des polices diverge entre conteneur et CI |
| **Toute sauvegarde prise depuis le 2026-08-27 était irrestaurable.** La sauvegarde lit la racine entière, donc `versements` y figurait ; `NOEUDS_CONNUS`, que `validateBackup` consulte avant d'écrire, ne le portait pas. Le fichier partait, paraissait complet, et ne mourait qu'au moment où l'on en avait besoin. Deuxième occurrence : le commentaire de `envelopes` raconte la panne identique | `public/js/modules/backup.js`, `tests/sauvegarde-noeuds-declares.test.js` | ✅ RÉSOLU 2026-08-27 — les règles font autorité, et les deux listes sont comparées **dans les deux sens**, plus la parité foyer / bac à sable | Ajouter une ligne n'aurait fait qu'attendre la troisième |
| L'écran ignorait le mode de partage **figé** du mois quand la chaîne de report le respectait : `computeBalanceChain` lisait `period.shareMode`, `summary.js` jamais. Un mois reconduit au prorata puis un passage du foyer au 50-50 donnait deux soldes pour le même mois | `public/js/utils/calculations.js`, `public/js/modules/summary.js`, `public/js/modules/period.js` | ✅ RÉSOLU 2026-08-27 — `resolveShareMode`, une seule fabrique des deux côtés | Jumeau exact de `normalizePair`. Mesuré par le témoin négatif : **250 € d'écart sur un seul mois** |
| **Quatre lectures du nœud `periods` entier par ouverture**, chacune relisant ce que la précédente venait de lire. Mesuré à 12 mois : 4 × 113 Ko, soit **96 % de tout ce que l'ouverture télécharge** ; et `memoriserLecture` réécrit tout le miroir `localStorage` à chaque lecture, synchronement | `public/js/modules/auth.js`, `period.js`, `carry-over.js`, `reconduction.js` | ✅ RÉSOLU 2026-08-27 — un instantané par **geste**, passé en paramètre **optionnel**. 22 → 13 lectures, 471 861 → 122 644 octets (−74 %) ; à 5 ans, 2 292 405 → 577 780 | Rien de dérivé n'est stocké, rien n'est mis en cache : aucune règle d'invalidation à écrire. Un appelant qui oublie le paramètre paie une lecture, jamais un chiffre faux |
| Le nœud d'agrégats mensuels **écarté**, et pourquoi : trois conceptions jugées sur trois angles (dérive, gain réel, tenue dans le temps), le nœud de soldes matérialisés noté 3/10, 6/10, 3/10 | — | ⚠️ DÉCIDÉ, NON FAIT — il exposerait un chiffre d'argent dérivé à 25 chemins d'écriture, au rejeu hors ligne, à une restauration qui écrase la racine et à un workflow de migration | Les règles n'en vérifieraient que la forme : leur langage n'a ni itération ni somme, et `.validate` n'est jamais évaluée sur une suppression |
| Le sélecteur de mois portait **deux branchements pour le même geste** : un écouteur direct et la délégation `data-on-change`. Chaque changement de mois exécutait `loadPeriodData` deux fois — deux lectures de l'historique, deux des salaires, deux chargements des trois listes, deux rendus | `public/js/modules/period.js` | ✅ RÉSOLU 2026-08-27 — la délégation seule, que `actions-declarees.test.js` tient au balisage. Un changement de mois : 18 → 5 lectures, 429 412 → 111 593 octets | `ecouterUneFois` garantit qu'un écouteur n'est posé qu'une fois, pas qu'un geste n'est traité qu'une fois. Trouvé en mesurant |
| `fetchHistoricalData` était la seule lecture du dépôt à contourner `db.js` : ni miroir, ni file, ni **délai de garde**. Hors réseau la promesse n'aboutissait jamais, et le panneau restait ouvert sur rien | `public/js/modules/trends.js` | ✅ RÉSOLU 2026-08-27 — passe par `dbGet` ; le test double désormais le joint que le module traverse | Exactement la panne qui avait motivé `withTimeout` |

Quand un écart est corrigé → changer l'état en ✅ RÉSOLU avec la date.

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
