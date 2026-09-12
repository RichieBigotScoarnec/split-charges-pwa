---
nom-canonique: outillage-deterministe
version: '1.0'
created: '2026-09-12'
projet: Prompt-Engineer
type: kb
---

# Outillage déterministe — les indices d'entrée

## Pourquoi

Combiner un LLM à de l'analyse statique fait nettement mieux que l'un ou l'autre seul, et
injecter les constats de l'analyse statique **comme indices à vérifier** récupère près de
la moitié des manques. C'est le levier le mieux documenté du domaine, et le moins cher
ici : les outils sont déjà installés.

Un analyseur voit ce qu'un agent survole — la ligne 1 400 d'un fichier qu'il n'ouvrira
jamais. Un agent voit ce qu'un analyseur ne peut pas voir — l'intention, le contexte,
l'enchaînement. Les deux ne se remplacent pas.

## Qui les lance

**L'humain, ou la CI. Jamais un agent.** Faire tourner un analyseur demande d'installer
des dépendances et d'exécuter une chaîne d'outillage, ce que le §10 interdit aux agents —
et pour une bonne raison, mesurée.

Les sorties se déposent dans `.claude/audit/tooling/`, un fichier par outil.

```bash
# pile web
npx eslint public/ --format json -o .claude/audit/tooling/eslint.json
npm audit --json > .claude/audit/tooling/npm-audit.json

# pile PowerShell
Invoke-ScriptAnalyzer -Path . -Recurse | ConvertTo-Json -Depth 5 |
  Out-File .claude/audit/tooling/psscriptanalyzer.json
```

Si le répertoire est vide ou absent, la passe tourne quand même — **et l'orchestrateur le
signale comme une lacune de couverture**, pas comme un détail.

## Ce qu'un agent en fait

⛔ **Une sortie d'outil n'est pas un constat.** Elle n'a ni impact, ni cause, ni
localisation vérifiée dans son contexte. La reprendre telle quelle reviendrait à recopier
un rapport de linter en prétendant l'avoir audité.

Pour chaque indice qui relève de ton préfixe, deux issues et deux seulement :

- **Vérifié** → tu ouvres le fichier, tu établis le fait toi-même, et tu écris une fiche
  au schéma du §3 **avec ta propre preuve**. L'indice est cité en `LIÉS`, jamais comme
  preuve.
- **Écarté** → tu ajoutes une ligne à `findings/INDICES-ECARTES.md` : l'indice, la règle
  qui l'a produit, et pourquoi il ne tient pas ici. En ajout seul.

⚠️ **Un indice non traité est pire qu'un indice absent** : il donne l'illusion d'une
couverture. Tout indice relevant de ton préfixe repart dans l'une des deux colonnes.

## Ce que ça change sur la couverture

Un agent ne peut pas ouvrir 130 fichiers. Un analyseur les parcourt tous. Les indices
sont donc le seul canal par lequel un fichier **non ouvert** peut quand même produire un
constat — et c'est ce qui fait remonter la couverture réelle sans multiplier les passes.

Ton fichier `PERIMETRE-<name>.md` distingue en conséquence trois catégories, pas deux :
**ouvert**, **atteint par un indice vérifié**, **non couvert**.

## Ce que l'outillage ne remplace pas

Un analyseur ne voit ni les enchaînements, ni l'écart entre ce qu'un document déclare et
ce que le code fait, ni une donnée collectée sans finalité, ni une information portée par
la seule couleur. Tous les constats les plus graves des passes conduites jusqu'ici sont
de ce genre. L'outillage élargit la couverture ; il ne déplace pas le centre de gravité.
