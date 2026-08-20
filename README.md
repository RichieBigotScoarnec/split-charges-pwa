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
| **Salaires** | Instantané par période : modifier son salaire ne réécrit pas l'historique des mois passés |
| **Remboursements** | Suivi des transferts entre les deux personnes, intégrés au solde |
| **Périodes** | Navigation mensuelle, reconduction des charges fixes récurrentes d'un mois sur l'autre |
| **Bilan** | Solde net, détail des parts théoriques et des paiements réels, récap des virements par destination, jauge de budget |
| **Analyse** | Répartition par catégorie, tendances sur 6 mois |
| **Saisie rapide** | Ajout en un geste avec géolocalisation et pré-cache GPS |
| **Carte** | Localisation des dépenses (Leaflet + OpenStreetMap) |
| **Personnalisation** | Catégories et destinations de virement définies par l'utilisateur |
| **Recherche** | Filtrage des charges de la période |
| **Export** | CSV et impression |
| **Rappels** | Notifications de fin de mois, dépassement de budget, remboursements en attente |
| **PWA** | Installable, fonctionne hors ligne via service worker |

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

```bash
npm run emulators
```

puis ouvrir `FairSplit.html?emulator=1`. Sans ce paramètre, l'application se
connecte au Firebase réel, y compris en local.

### Icônes

Les icônes PWA sont générées, pas dessinées à la main :

```bash
pwsh -NoProfile -File tools/generate-icons.ps1
```

---

## Architecture

```text
FairSplit.html          Point d'entrée — aucun JavaScript inline
index.html              Redirection
css/                    8 feuilles, variables.css porte les tokens du design system
js/
  app.js                Amorçage : Firebase, composants, authentification
  config.js             Configuration Firebase, constantes, liste blanche
  firebase-init.js      Initialisation SDK et émulateurs
  db.js                 Accès base — préfixage automatique par household/
  state.js              État global (observateur)
  components/           modal.js, toast.js
  modules/              16 modules fonctionnels
  utils/                Fonctions pures : calculs, dates, formats, validation, salaires
tests/                  Vitest (unitaires) + Playwright (E2E)
tools/                  Génération des icônes
database.rules.json     Règles de sécurité — source de vérité unique
```

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
| [DEPLOIEMENT-GITHUB-PAGES.md](DEPLOIEMENT-GITHUB-PAGES.md) | Détail du déploiement |
| [TROUBLESHOOTING-AUTH.md](TROUBLESHOOTING-AUTH.md) | Dépannage de l'authentification Google |
| [CLEAR-CACHE.md](CLEAR-CACHE.md) | Forcer le rechargement (service worker) |
