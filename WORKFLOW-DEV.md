# 🔄 Workflow de développement — FairSplit

> **Dernière révision** : 2026-08-20

Une branche, un projet Firebase, un espace de données. Ce document décrit le
fonctionnement réel — s'il diverge du dépôt, c'est le dépôt qui fait foi.

---

## 🏗️ Le dispositif en une page

| | |
| --- | --- |
| Branche déployée | `main` — seule branche longue |
| Hébergement | GitHub Pages, via `.github/workflows/deploy.yml` |
| Projet Firebase | `fairsplit-test` — unique |
| Données réelles | nœud `household/` |
| Essais | nœud `sandbox/`, via `?sandbox=1` |

Pousser sur `main` déclenche lint + tests, puis le déploiement. Si le lint ou
un test échoue, **rien n'est déployé**.

> Une architecture à deux environnements (`fairsplit-test` / `fairsplit-prod`,
> `develop` / `main`) a existé. Elle imposait une divergence permanente de
> `js/config.js` entre branches — donc un conflit à chaque fusion — pour une
> production jamais alimentée. Voir [SECURITY.md](SECURITY.md) et
> [README.md](README.md).

---

## 🚀 Cycle standard

```bash
# 1. Branche courte depuis main
git switch main && git pull
git switch -c feat/ma-fonctionnalite

# 2. Développer, puis vérifier ce que la CI vérifiera
npm run check          # eslint --quiet && vitest run

# 3. Essayer dans le bac à sable
npm run serve          # http://localhost:3333/FairSplit.html?sandbox=1

# 4. Publier
git push -u origin feat/ma-fonctionnalite
# → Pull Request vers main
```

Après fusion, la CI déploie seule. Compter deux à trois minutes.

---

## 🧪 Essayer sans toucher aux vraies données

Ajouter `?sandbox=1` à l'URL, en local comme en ligne :

```text
https://richiebigotscoarnec.github.io/split-charges-pwa/FairSplit.html?sandbox=1
```

L'application bascule sur `sandbox/`, isolé de `household/` mais dans le même
projet et sous la même liste blanche — le bac à sable isole les *données*, pas
les droits. Un bandeau ambre et un préfixe `[Bac à sable]` dans le titre le
signalent en permanence.

**Option plus stricte** : l'émulateur Firebase n'écrit rien dans le cloud.

```bash
npm run emulators
# puis FairSplit.html?emulator=1
```

Il exige un **JDK 21+** et le port 9000 libre. Sur une machine où l'une des
deux conditions manque, utiliser le bac à sable.

---

## 🔥 Firebase

Un seul projet : `fairsplit-test` (`.firebaserc`).

```bash
npm run deploy:rules      # publie database.rules.json
npm run deploy:hosting    # Firebase Hosting — optionnel, la prod est GitHub Pages
```

La configuration vit dans [`js/config.js`](js/config.js), en un seul exemplaire.
La clé API y est publique : c'est normal pour Firebase côté web, la protection
repose sur les règles serveur.

---

## 📝 Conventions Git

| Préfixe | Usage | Exemple |
| --- | --- | --- |
| `feat:` | Nouvelle fonctionnalité | `feat: ajout système remboursements` |
| `fix:` | Correction de bug | `fix: calcul prorata incorrect` |
| `refactor:` | Refactoring sans changement fonctionnel | `refactor: extraction des calculs purs` |
| `style:` | Changement CSS/UI | `style: amélioration contraste bandeau` |
| `docs:` | Documentation | `docs: mise à jour README` |
| `test:` | Tests | `test: couverture de resolveSalaries` |
| `chore:` | Maintenance, outillage, CI | `chore: épinglage des actions par SHA` |

---

## ⚠️ Règles de sécurité

La **source de vérité unique** est [`database.rules.json`](database.rules.json),
versionné et déployé via `npm run deploy:rules`.

Ne jamais éditer les règles à la main dans la console Firebase : le prochain
déploiement écraserait la modification, sans trace nulle part.

Les règles refusent tout par défaut à la racine, et n'ouvrent `household/` et
`sandbox/` qu'aux adresses de la liste blanche, vérifiées côté serveur.

> 🚫 **Jamais `".read": true` ni `".write": true`** sur des données utilisateur,
> y compris « temporairement ». Pour essayer sans contrainte : `?sandbox=1`.

Détail complet : [SECURITY.md](SECURITY.md).

---

## 🆘 Dépannage

### Une modification n'apparaît pas après un push

1. Vérifier que la CI est verte :
   <https://github.com/RichieBigotScoarnec/split-charges-pwa/actions>
   — un lint ou un test rouge bloque le déploiement, c'est voulu.
2. Attendre deux à trois minutes (propagation GitHub Pages).
3. Forcer le rechargement : voir [CLEAR-CACHE.md](CLEAR-CACHE.md). Le service
   worker sert volontiers une version périmée.

### Le bandeau ambre apparaît alors que je veux les vraies données

Un `?sandbox=1` traîne dans l'URL. Le retirer et recharger.

### « Permission denied » dans la console

Le compte connecté n'est pas dans la liste blanche de `database.rules.json`.
Ajouter une adresse impose de modifier **à la fois** `ALLOWED_EMAILS` dans
[`js/config.js`](js/config.js) et les règles, puis `npm run deploy:rules`.

### Conflit Git lors d'une fusion

```bash
git merge --abort        # annuler la fusion en cours
git diff main HEAD       # identifier les divergences
```

### L'authentification Google échoue

Voir [TROUBLESHOOTING-AUTH.md](TROUBLESHOOTING-AUTH.md).

---

## 📱 Installation PWA

1. Ouvrir l'URL dans Chrome ou Safari mobile
2. Menu → « Ajouter à l'écran d'accueil »
3. L'icône est générée par [`tools/generate-icons.ps1`](tools/generate-icons.ps1)
   aux couleurs de la marque
