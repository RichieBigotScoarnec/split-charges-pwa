# 💰 FairSplit

> Répartition des charges d'un foyer au prorata des salaires nets, avec
> synchronisation temps réel entre deux appareils.

**Version 4.0.0** · PWA · JavaScript ES modules, sans build · Firebase Realtime Database

**En ligne** : <https://richiebigotscoarnec.github.io/split-charges-pwa/>

---

## Le principe

Deux personnes déclarent leurs salaires nets. Chaque charge saisie est répartie
proportionnellement — celui qui gagne 60 % du revenu du foyer paie 60 % du loyer.
L'application suit qui a réellement payé quoi et affiche le solde : *qui doit
combien à qui, ce mois-ci*.

Chaque charge peut déroger à la règle globale (50/50 ou pourcentage libre) sans
changer le mode des autres.

---

## Fonctionnalités

| Domaine | Détail |
| --- | --- |
| **Répartition** | Prorata des salaires, 50/50, ou pourcentages libres — globalement ou charge par charge |
| **Charges** | Fixes (récurrentes ou ponctuelles) et variables, avec catégorie, payeur et destination de virement |
| **Revenus** | Salaires et revenus complémentaires (allocations, loyers perçus, activité annexe), pris ensemble dans l'assiette du prorata |
| **Instantanés** | Un instantané de revenus par période : modifier son salaire ne réécrit pas l'historique des mois passés |
| **Remboursements** | Suivi des transferts entre les deux personnes, intégrés au solde |
| **Règlement** | Solder le mois en une action : le montant exact, dans le bon sens, depuis la barre de solde |
| **Report** | Option : un mois non réglé reste dû le mois suivant au lieu de repartir de zéro |
| **Périodes** | Navigation mensuelle |
| **Reconduction** | Les charges fixes marquées récurrentes sont reprises d'elles-mêmes à l'ouverture d'un mois neuf, une seule fois et jamais vers le passé |
| **Bilan** | Solde net, détail des parts théoriques et des paiements réels, récap des virements par destination, jauge de budget |
| **Budgets** | Budget mensuel global, et budget par catégorie avec alerte à 80 % et dépassement chiffré |
| **Tendances** | Graphique de l'évolution des charges sur six mois, avec moyenne, extrêmes et variation — replié par défaut, calculé au premier dépliage |
| **Saisie rapide** | Ajout en un geste avec géolocalisation et pré-cache GPS |
| **Carte** | Localisation des dépenses (Leaflet + OpenStreetMap), accessible dès qu'une dépense porte des coordonnées ; la bibliothèque n'est chargée qu'à l'ouverture de la carte |
| **Personnalisation** | Catégories et destinations de virement définies par l'utilisateur |
| **Recherche** | Filtrage des charges de la période |
| **Export** | CSV et impression |
| **Sauvegarde** | Fichier JSON complet, et restauration avec copie de sécurité préalable |
| **Corbeille** | Les suppressions sont douces : les éléments effacés du mois restent consultables et récupérables |
| **Rappels** | Notifications de fin de mois, dépassement de budget, remboursements en attente |
| **PWA** | Installable, fonctionne hors ligne via service worker |
| **Inscription** | Fermée. Le parcours de création de compte est conservé dans le code et se rétablit par `SIGNUP_ENABLED` (`js/config.js`) |

---

## Accès

L'application est réservée à deux comptes, définis en dur dans les règles
Firebase. Toute autre adresse est authentifiée puis rejetée. Voir
[SECURITY.md](SECURITY.md).

**Aucune configuration de partage.** Les données du foyer vivent dans un espace
unique : un compte autorisé se connecte et les voit. Il n'y a ni propriétaire,
ni invitation, ni UID à échanger.

---

## Développement

```bash
npm ci                  # dépendances
npm run serve           # http://localhost:3333
npm run check           # lint + tests unitaires (ce que la CI exécute)
```

| Commande | Rôle |
| --- | --- |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Tests end-to-end (Playwright) |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint avec correction automatique |
| `npm run emulators` | Émulateurs Firebase locaux |
| `npm run deploy:rules` | Déploie `database.rules.json` |

### Travailler sans toucher aux données réelles

Ajouter `?sandbox=1` à l'URL — en local comme en ligne :

```text
public/FairSplit.html?sandbox=1
```

L'application bascule sur le nœud `sandbox/`, isolé de `household/` mais dans
le même projet Firebase et sous la même liste blanche. Un bandeau ambre le
signale en permanence.

Alternative plus stricte, si la machine le permet : `npm run emulators` puis
`FairSplit.html?emulator=1`, qui n'écrit rien dans le cloud. Elle exige un
**JDK 21+** et le port 9000 libre — conditions non réunies partout.

### Icônes

Les icônes PWA sont générées, pas dessinées à la main :

```bash
pwsh -NoProfile -File tools/generate-icons.ps1
```

---

## Architecture

```text
public/                 Tout ce qui est publié — et rien d'autre
  FairSplit.html        Point d'entrée — aucun JavaScript inline
  index.html            Redirection
  sw.js  manifest.json  icon-*.png
  css/                  8 feuilles, variables.css porte les tokens du design system
  js/
    app.js              Amorçage : Firebase, composants, authentification
    config.js           Configuration Firebase, constantes, liste blanche
    firebase-init.js    Initialisation SDK et émulateurs
    db.js               Accès base — préfixage automatique par DATA_ROOT
    state.js            État global (observateur)
    components/         modal.js, toast.js
    modules/            16 modules fonctionnels
    utils/              Fonctions pures : calculs, dates, formats, validation, salaires
tests/                  Vitest (unitaires) + Playwright (E2E)
tools/                  Génération des icônes
docs/                   Dépannage, déploiement, aide-mémoire Git
database.rules.json     Règles de sécurité — source de vérité unique
```

Le déploiement publie `public/` et rien d'autre. Auparavant la racine entière
était publiée, filtrée par une liste d'exclusion à maintenir à la main — qui a
laissé fuiter `package.json`, `vitest.config.js`, `tools/` et
`eslint.config.mjs`. Publier est désormais un acte délibéré.

**Une seule branche** : `main`, déployée automatiquement sur GitHub Pages après
succès du lint et des tests. Les évolutions passent par des branches courtes
(`fix/…`, `feat/…`) puis une PR.

Conventions détaillées : [CLAUDE.md](CLAUDE.md).

---

## Choix techniques

**Pas de framework, pas d'étape de build.** L'artefact livré n'a aucune
dépendance npm : les 900 paquets du `node_modules` servent exclusivement aux
tests et à l'outillage. L'application continuera de fonctionner sans
maintenance de dépendances.

**Firebase Realtime Database.** Synchronisation temps réel entre deux appareils
sans backend à maintenir. Les règles de sécurité côté serveur portent tout le
contrôle d'accès.

**Un seul environnement Firebase.** Un second projet « production » a existé ;
il imposait une divergence permanente de la configuration entre branches pour
un bénéfice nul, et n'a jamais été alimenté. L'isolation de développement passe
désormais par l'émulateur.

---

## Documentation

| Fichier | Contenu |
| --- | --- |
| [SECURITY.md](SECURITY.md) | Modèle de menace, protections en place, limites assumées |
| [CLAUDE.md](CLAUDE.md) | Conventions de code et contraintes |
| [WORKFLOW-DEV.md](WORKFLOW-DEV.md) | Workflow Git et déploiement |
| [DEPLOIEMENT-GITHUB-PAGES.md](docs/DEPLOIEMENT-GITHUB-PAGES.md) | Détail du déploiement |
| [TROUBLESHOOTING-AUTH.md](docs/TROUBLESHOOTING-AUTH.md) | Dépannage de l'authentification Google |
| [CLEAR-CACHE.md](docs/CLEAR-CACHE.md) | Forcer le rechargement (service worker) |
