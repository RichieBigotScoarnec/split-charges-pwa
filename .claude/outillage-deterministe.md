---
nom-canonique: outillage-deterministe
version: '2.0'
created: '2026-09-12'
projet: Prompt-Engineer
type: kb
---

# Outillage déterministe — les indices d'entrée

## Pourquoi

Combiner un LLM à de l'analyse statique fait nettement mieux que l'un ou l'autre seul, et
injecter les constats de l'analyse statique **comme indices à vérifier** récupère une part
importante de ce qu'une passe manque.

Un analyseur voit ce qu'un agent survole — la ligne 1 400 d'un fichier qu'il n'ouvrira
jamais, sur **100 % des fichiers**. Un agent voit ce qu'un analyseur ne peut pas voir :
l'intention, le contexte, l'enchaînement, l'écart entre ce qu'un document déclare et ce
que le code fait. Les deux ne se remplacent pas — ils se partagent le travail.

## Qui les lance

**L'humain ou la CI. Jamais un agent** (§10, §16). Sorties dans `.claude/audit/tooling/`.

## Pile web

| Outil | Ce qu'il rend | Ce qu'il dispense de chercher à la main |
|---|---|---|
| **ESLint** + `no-unsanitized` | défauts intra-fichier, injections DOM | variables mortes, `innerHTML` non assaini |
| **Knip** | fichiers, exports et dépendances inutilisés ; **dépendances importées non déclarées** | l'essentiel des constats `CQ` et une partie des `REPO` |
| **Madge** | cycles de dépendance | ce que Knip ne fait pas et le dit |
| **npm audit** | vulnérabilités des dépendances | la veille de sécurité des paquets |
| **couverture fusionnée** | quels fichiers ne sont exercés par aucun test | ce que l'agent QA devine aujourd'hui |
| **axe-core** (§17) | accessibilité sur le DOM rendu | le contraste après composition, le focus, la tabulation |

```bash
npx eslint . --format json -o .claude/audit/tooling/eslint.json
npx knip --reporter json > .claude/audit/tooling/knip.json
npx madge --circular --json public/js > .claude/audit/tooling/madge.json
npm audit --json > .claude/audit/tooling/npm-audit.json
npm run couverture   # produit la couverture fusionnée
```

⚠️ Knip connaît les conventions des lanceurs de tests : il ne signale pas une suite
découverte par motif de nom. C'est le leurre le plus coûteux de la chaîne, traité ici de
façon déterministe.

## Pile PowerShell

| Outil | Ce qu'il rend |
|---|---|
| **PSScriptAnalyzer** | variables non initialisées, `Invoke-Expression`, `catch` vides, usage de `PSCredential`, conventions |
| **InjectionHunter** | règles personnalisées de l'équipe PowerShell de Microsoft, dédiées à la détection d'injection |
| **jeux de règles livrés** | `ScriptSecurity.psd1`, `CmdletDesign.psd1` — visables directement |
| **Pester + couverture** | quels chemins ne sont exercés par aucun test |

```powershell
Install-Module PSScriptAnalyzer, InjectionHunter -Scope CurrentUser

# settings.psd1 : @{ IncludeDefaultRules = $true; CustomRulePath = "<chemin InjectionHunter>" }
Invoke-ScriptAnalyzer -Path . -Recurse -Settings .\PSScriptAnalyzerSettings.psd1 |
  ConvertTo-Json -Depth 5 | Out-File .claude/audit/tooling/psscriptanalyzer.json
```

⚠️ InjectionHunter est le seul outil de cette liste qui vise la classe de défaut la plus
grave du domaine — un filtre ou une commande construits par concaténation d'une entrée non
maîtrisée. Sans lui, PSScriptAnalyzer seul ne la voit pas.

## Pondération par le risque

Deux signaux déterministes et gratuits, que rien n'exploitait :

- **la fréquence de modification** d'un fichier, depuis `git log` ;
- **sa couverture de test**, depuis la couverture fusionnée.

Un fichier souvent modifié et peu couvert est l'endroit où les défauts vivent. Un fichier
inchangé depuis deux ans est calme.

```bash
node tools/risque.mjs > .claude/audit/tooling/risque.json
```

Ce classement ne produit aucun constat. Il **dirige l'attention** : quand un agent ne peut
ouvrir qu'un cinquième des fichiers, il décide lequel.

## Ce qu'un agent en fait

⛔ **Une sortie d'outil n'est pas un constat.** Deux issues et deux seulement :

- **Vérifié** → fiche au schéma du §3, **avec sa propre preuve**. L'indice en `LIÉS`.
- **Écarté** → une ligne dans `findings/INDICES-ECARTES.md`, en ajout seul, avec la raison.

⚠️ **Un indice non traité est pire qu'un indice absent** : il donne l'illusion d'une
couverture.

## Ce que l'outillage ne remplace pas

Ni les enchaînements, ni l'écart entre ce qu'un document déclare et ce que le code fait,
ni une donnée collectée sans finalité, ni une information portée par la seule couleur, ni
une alerte conditionnée à un échec qui ne se produit jamais. Tous les constats les plus
graves produits jusqu'ici sont de ce genre.

**L'outillage élargit la couverture ; il ne déplace pas le centre de gravité.**
