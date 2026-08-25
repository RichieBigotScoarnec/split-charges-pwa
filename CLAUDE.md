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
│   │   └── responsive.css      # Media queries + print
│   └── js/
│       ├── app.js              # Entry point — init Firebase, auth, modules
│       ├── config.js           # Firebase config, DATA_ROOT, liste blanche
│       ├── firebase-init.js    # Init Firebase, providers, émulateurs
│       ├── db.js               # Abstraction DB (préfixage DATA_ROOT)
│       ├── state.js            # État global (lecture/écriture, sans abonnés)
│       ├── components/         # modal.js, toast.js
│       ├── modules/            # 22 modules fonctionnels
│       └── utils/              # 34 aides pures — dont miroir (ce que l'appareil
│                               # garde hors réseau : dernière valeur lue de
│                               # chaque chemin, file des écritures à rejouer),
│                               # montant (lecture d'une
│                               # saisie), lieu (géocodage), categorie-lieu
│                               # (catégorie déduite du lieu),
│                               # categories-frequentes, auth-errors,
│                               # enveloppes (regroupements transversaux),
│                               # recherche-lieu (chercher un lieu par son nom),
│                               # tri (ordre d'affichage des listes),
│                               # identifiant (fabrique d'identifiants, partagée
│                               # par catégories, destinations et enveloppes),
│                               # recherche-texte (chercher sans les accents),
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
