# Les deux occurrences CI de `detail-depenses.spec.js`, conservées

Ces quatre fichiers sont les **artefacts Playwright d'origine**, tels que la CI
les a produits. Ils ne sont ni retranscrits ni résumés : ce sont les octets
téléchargés depuis GitHub Actions le 2026-09-07.

| Fichier | Vient de |
|---|---|
| `2026-09-01-clic-intercepte.*` | run [33525030834](https://github.com/RichieBigotScoarnec/split-charges-pwa/actions/runs/33525030834), job « Tests end-to-end », branche `main` |
| `2026-09-02-modale-absente.*` | run [33679221473](https://github.com/RichieBigotScoarnec/split-charges-pwa/actions/runs/33679221473), job « Tests end-to-end », branche `feat/correction-retroactive-garde-fou` |

Empreintes, pour que la copie se vérifie :

```text
187e9a21fde9bd0dd6934a65ed2f6a29a887ee004baa4ff6e55acd03ac93b151  2026-09-01-clic-intercepte.png
f9e5d900659669c8488cb0066f07160b4cd17d9f801c84904ffbbc2976ce0bef  2026-09-01-clic-intercepte.error-context.md
3af5c76d8492be6d4d9e9de171e5eefe94fc209b0a8d0ded078d0f3d8f1d7cc3  2026-09-02-modale-absente.png
aace6d4e855936ffde060517fc1aaa45f5aa6df906675b2c0dc590507419b61b  2026-09-02-modale-absente.error-context.md
```

## Pourquoi ils sont dans le dépôt

`deploy.yml` conserve `test-results/` **sept jours** (`retention-days: 7`).
Celui du 2026-09-01 expirait le 2026-09-08 — le lendemain du jour où il a été
lu pour la première fois.

Ce sont les **seules preuves de deux occurrences que personne n'a su
reproduire** : quatre passes complètes de la suite au réglage de la CI
(`--workers=4`, sous émulateurs) rendent 4 × 591 contrôles passés, EXIT=0
quatre fois. Ce qui n'est pas reproductible ne se remesure pas ; il ne reste
que ce qui a été gardé.

Le journal d'actionnabilité complet est **dans les `error-context.md`**, pas
seulement dans le log du job : ces fichiers sont autoportants, et ils survivront
à l'expiration des journaux d'exécution.

## Ce qu'ils disent, et qui n'était pas ce qu'on croyait

Le dépôt a tenu deux jours l'affirmation « trois cas différents, **un seul point
de chute** — le helper `ouvrirLePayeur` ». Le code source figé dans
`2026-09-01-clic-intercepte.error-context.md` la réfute : à cette date, le test
`:86:7` **cliquait en ligne**, le helper ne l'enveloppait pas encore. Et les
deux échecs ne sont pas le même :

**2026-09-01 — le clic n'atterrit jamais.** `locator.click` expire à 30 s.
L'élément est résolu, « visible, enabled and stable », Playwright le fait
défiler dans la vue — et le test de touche tombe sur autre chose,
**25 fois en 30 secondes**, sur quatre intercepteurs :

| Intercepteur | Reprises |
|---|---|
| `#balanceBar` dans `.bandeau-colle` | 11 |
| `.onglet[data-panneau="panneauCharges"]` dans `<nav id="onglets">` | 7 |
| `.summary-divider` | 5 |
| `<details open class="summary-details">` | 2 |

La capture montre une page **entièrement chargée**, défilée de sorte que la
ligne du payeur passe sous le bandeau collant. Ce n'est pas « la modale n'a pas
été créée » : c'est un recouvrement par barre collante à 390 px. Voir le gotcha
correspondant dans `CLAUDE.md`.

**2026-09-02 — le clic passe, la modale n'existe pas.**
`expect(#modalDetailDepenses).toBeVisible()` rend `element(s) not found` en 5 s.
L'instantané ARIA montre l'application **complètement initialisée** — « Budgets
par catégorie », « Tendances sur 6 mois », « Enveloppes », « Privé », toutes
posées **après** `initDetailDepenses` (`auth.js:464`), dont `initCategoryBudgets`
(`auth.js:535`). Le bouton payeur est là, libellé « Vous a payé › 1 198,67 € ».
Aucun nœud de modale dans le document, aucun toast « Chargement partiel ».

Deux conséquences pour l'instrumentation posée dans le helper :

- **R1 (import échoué) est très affaibli** — tout ce qui suit `auth.js:464` dans
  la chaîne `runStep` a bien tourné, l'instantané le montre nœud par nœud ;
- `ouvrirDetailPayeur` (`detail-depenses.js:69`) ne peut pas sortir tôt : sa
  seule garde est `qui !== 'vous' && qui !== 'conjointe'`. Restent **R2**
  (exception avant `appendChild`) et R3.

## La leçon de méthode, et elle a coûté deux jours

`CLAUDE.md` portait « la première n'avait rien laissé ». **C'était faux, et
vérifiable en une commande** — les deux artefacts étaient encore téléchargeables
au moment où on écrivait qu'ils n'existaient pas :

```bash
gh api repos/<dépôt>/actions/runs/<id>/artifacts --jq '.artifacts[] | [.name,.expired] | @tsv'
```

C'est la règle 3 dans sa cinquième forme — *vert sur quoi ?*, appliquée à un
constat plutôt qu'à un test. On a raconté ce qu'un échec avait laissé sans
aller le chercher. Et la règle 5 par-dessus : refermer sur « un seul point de
chute » a fait cesser de regarder l'occurrence qui n'y entrait pas.

**Le geste, désormais : télécharger l'artefact AVANT d'écrire ce qu'il
contient.** Sept jours, ce n'est pas long.
