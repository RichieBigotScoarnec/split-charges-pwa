repo: RichieBigotScoarnec/split-charges-pwa
branch: main
path: public/

## Last sync

date: 2026-09-04T19:20:03Z

### Updated in this project

- Trois planches : tableau de bord grand écran en thème sombre ET clair, plus l'écran Réglages/Outils.
- Couleurs relues sur le chantier de contraste de `variables.css` : `--primary-color` sombre à #6264ED, encres `--primary-ink` / `--info-ink`, `--on-danger` / `--on-success`.
- Polices auto-hébergées copiées depuis `public/fonts/` — plus aucune origine tierce, conforme à `font-src 'self'`.
- Badge de mode de partage par ligne réintégré : c'est le 50/50 du Festival qui referme l'arithmétique du solde (prorata réel 71/29).
- Cibles tactiles portées à 44 px, icônes maintenues en emojis du dépôt (Loisirs 🎮).
- Badge « 02/02 » de la capture identifié : c'est `charge-split-tag` (`variable-charges.js:758`) rendant `50/50` — lecture fautive à 67 % de zoom, pas un élément inconnu.

### À traiter côté code, hors maquette

Quatre points relevés en lisant le dépôt, aucun ne concerne les planches.

1. **`EMOJI_PICKER` n'a aucune flèche de répétition** (`custom-lists.js:31`, 57 entrées). 🔁 dirait mieux « charge fixe » que 🏠 — elle se reconduit, elle n'est pas la maison. Ajouter l'entrée est une évolution du code, et le test des 57 propositions doit suivre. La planche reste sur 🏠, qui existe dans `CATEGORIES`.

2. **`charge-split-tag` affiche `70/30` sans `%`**, au même format que `50/50` (`variable-charges.js:758`, `fixed-charges.js:810`). Deux sens pour une même forme : une fraction et une paire de pourcentages.

3. **La classe `charge-split-tag` porte deux sémantiques.** Elle rend la répartition dérogatoire dans les deux listes de charges, mais le mot « fixe » dans `detail-depenses.js:142` et `envelopes.js:1918`. Piège de lecture : chercher la classe rend quatre sites, dont deux étrangers au champ. Chercher `splitOverride` est la bonne entrée.

4. **`computeVirementsByDestination` applique `splitOverride` sans l'afficher** (`calculations.js:448`). Le panneau dit combien virer par destination et n'expose que le montant : une charge fixe en 50/50 y change le chiffre sans qu'aucune trace ne le signale. Le badge existe dans la liste, pas dans ce panneau. Aggravé par `abonnements.js:149`, qui recopie `source?.splitOverride || null` : la répartition est alors **héritée**, l'utilisateur ne l'a pas choisie pour cette occurrence, et le badge est son unique signal.

### Traces visibles de `splitOverride`, inventaire

| Site | Nature |
|---|---|
| `variable-charges.js:757` | Badge sur la ligne de charge variable |
| `fixed-charges.js:809` | Badge sur la ligne de charge fixe |
| `variable-charges.js:598-609` | Bascule, mode et pourcentages restaurés à l'édition |
| `fixed-charges.js:577-588` | Jumeau du précédent |
| `calculations.js:448` | **Lu sans être affiché** — cf. point 4 |

### Règle retenue de cette session

Un élément d'interface qui porte une règle de calcul ne se supprime pas au nom de la densité visuelle — sa suppression doit être justifiée par le calcul. Et un élément non identifié est porteur d'un invariant jusqu'à preuve du contraire : c'est en classant le badge `50/50` comme ornement qu'un prorata faux (67/33 au lieu de 71/29) est passé dans une maquette réputée vérifiée contre le code.

## Sync history

### 2026-09-04T13:11:48Z

- Périmètres À deux / Solo / Privé en navigation principale.
- Chiffres du bilan recalés sur `computeSummary` et `computeMoisPersonnel`.
- Vue Privé alignée sur les trois postures de `confidentialite.js`.

## Screen map

| Écran du projet | Fichiers du dépôt |
|---|---|
| FairSplit Tableau de bord.dc.html — en-tête, sélecteur de mois, compte | `public/FairSplit.html`, `public/css/base.css`, `public/css/onglets.css`, `public/js/utils/periodes.js`, `public/js/utils/members.js` |
| — vue « À deux » : solde, grand-livre, reste à vivre, taux d'effort | `public/js/utils/calculations.js` (`computeSummary`, `computeBalanceChain`, `computeMoisPersonnel`), `public/js/utils/salaries.js`, `public/js/modules/summary.js`, `public/css/summary.css` |
| — listes de charges, catégories, virements | `public/js/modules/variable-charges.js`, `fixed-charges.js`, `reimbursements.js`, `public/js/utils/totaux-liste.js`, `public/js/utils/tri.js` |
| — budgets et répartition par catégorie | `public/js/modules/category-budgets.js`, `public/js/modules/categories.js` |
| — vue « Solo » | `public/js/utils/perimetre.js` (`chargesSolo`, `proprietaireDuSolo`, `totauxParPerimetre`), `public/js/modules/envelopes.js`, `public/js/utils/enveloppes.js` |
| — vue « Privé » et postures de partage | `public/js/utils/confidentialite.js` (`posturePartage`, `resumePublie`, `resumeLu`), `public/js/modules/prive.js`, `database.rules.json` (`/prive/{qui}`, `/aval/{qui}`) |
| — enveloppes et cagnottes | `public/js/utils/enveloppes.js`, `public/js/utils/versements.js` |
| — jetons visuels (couleurs, polices, rayons, espacements) | `public/css/variables.css` |
| — polices copiées dans le projet | `public/fonts/dm-sans-latin.woff2`, `public/fonts/jetbrains-mono-latin.woff2` |
| — catégories et emojis, destinations, emplacements par compte | `public/js/config.js` |
| — badge de mode de partage par ligne | `public/js/utils/calculations.js` (`calculateChargeShares`, `splitOverride`) |
| Planche 3 — Réglages et Outils | `public/FairSplit.html` (panneau Réglages), `public/js/modules/share-mode.js`, `carry-over.js`, `notifications.js`, `custom-lists.js`, `backup.js`, `export.js` |
