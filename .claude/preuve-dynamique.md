---
nom-canonique: preuve-dynamique
version: '1.0'
created: '2026-09-12'
projet: Prompt-Engineer
type: kb
---

# La preuve dynamique

## Ce qu'elle débloque

Toute la chaîne est statique. Elle lit du code et n'observe jamais ce qu'il produit. Une
classe entière de défauts lui est donc inaccessible, et ce ne sont pas les moindres :

- le **contraste réel après superposition**, opacité et héritage — un calcul sur deux
  jetons de couleur ne dit rien d'un texte posé sur un dégradé ;
- l'**ordre de tabulation effectif**, qui dépend du DOM rendu, pas du HTML servi ;
- le **focus piégé** dans une fenêtre modale ;
- ce qu'une **règle d'accès accepte réellement**, par opposition à ce qu'on lit dans le
  fichier de règles ;
- les **temps de rendu** et le poids réellement transmis.

⚠️ Conséquence directe sur la certitude : un constat adossé à une mesure sur le rendu est
`[Constaté]`. Le même constat établi par lecture seule plafonne à `[Déduit]`, et il porte
alors sa condition de levée — qui est précisément cette mesure. **La preuve dynamique est
le seul moyen de lever ces conditions.**

## Qui l'exécute

**L'humain ou la CI, jamais un agent** — même règle qu'au §16, et ici la raison est plus
forte encore : exécuter, c'est faire tourner le code du dépôt, ce que le §10 interdit
depuis qu'une suite de tests lancée par un agent a émis du trafic réseau authentifié.

Les sorties vont dans `.claude/audit/tooling/`, comme les indices statiques.

## Ce qu'il faut lancer

### Accessibilité sur le DOM rendu

`@axe-core/playwright`, dans un test qui ouvre chaque écran et écrit son rapport. Il
mesure le contraste après composition, la sémantique effective, les noms accessibles tels
que l'arbre d'accessibilité les expose.

```bash
npm i -D @axe-core/playwright
npx playwright test tests/audit/axe.spec.js
# → .claude/audit/tooling/axe.json
```

⚠️ Un balayage automatique ne couvre qu'une partie des critères — l'ordre de lecture, la
pertinence d'un libellé ou le sens d'une animation lui échappent. Il ne remplace pas
l'agent : il lui donne le socle mesuré sur lequel poser le reste.

### Règles d'accès contre l'émulateur

C'est le manque le plus grave de la chaîne. Un fichier de règles se lit ; ce qu'il
autorise réellement ne se déduit pas de sa lecture.

```bash
npx firebase emulators:exec --only database "npx vitest run tests/regles/"
# → .claude/audit/tooling/regles.json
```

Chaque cas est une assertion : tel compte, tel chemin, lecture ou écriture, autorisé ou
refusé. Les cas à écrire sont ceux que l'audit a déjà nommés — un espace privé qu'un
autre compte ne doit pas lire, un conteneur qu'un `set` ne doit pas remplacer en entier,
un champ qui doit refuser une valeur hors bornes.

### Couverture de tests

Elle répond de façon exacte à la question que l'agent QA devine : quels fichiers ne sont
exercés par aucun test.

```bash
npm run couverture
# → .claude/audit/tooling/couverture.json
```

## Ce qu'un agent en fait

Même règle qu'au §16 : **une sortie d'outil n'est jamais un constat**. Elle est vérifiée
et devient une fiche avec sa propre preuve, ou elle est écartée avec sa raison.

Une seule différence, et elle joue dans l'autre sens : **une mesure sur le rendu est une
preuve recevable** au sens du §3. Un agent qui cite un rapport d'axe daté du même commit
peut écrire `[Constaté]` là où il aurait dû écrire `[Déduit]`.

## Péremption

Une sortie dynamique est **plus périssable** qu'une sortie statique : elle dépend du
commit, mais aussi de la version du navigateur, de l'émulateur, du jeu de données. Elle
porte donc sa date, son commit, et la version de l'outil qui l'a produite.

⛔ Une sortie dynamique dont le commit ne correspond pas à celui de la passe **ne
s'utilise pas**. Elle décrit un autre état de l'application, et rien ne le signalerait.
