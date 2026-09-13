---
description: Audite les seuls changements par rapport à la branche par défaut — passe courte, à lancer sur chaque modification.
argument-hint: [référence de comparaison, par défaut origin/main]
---

# Audit d'un diff

Même bibliothèque, même contrat, périmètre réduit aux fichiers modifiés.

Référence de comparaison : $ARGUMENTS — à défaut `origin/main`.

⚠️ **Une revue de diff propre ne déclare pas le dépôt sain.** Un défaut qui dort depuis
des mois n'apparaît dans aucun diff, et aucune accumulation de passes courtes ne le
trouvera. Celle-ci est la revue continue ; `/audit` reste le balayage profond, à lancer
périodiquement.

## Ancrage

Comme `/audit` : relève `git rev-parse HEAD` et la branche au départ, revérifie avant
chaque étape, arrête-toi si l'un des deux a changé.

## Séquence

### 1. Périmètre

```bash
git diff --name-only <référence>...HEAD
```

Retire les fichiers de la bibliothèque (`.claude/agents/`, `.claude/commands/audit*.md`,
`.claude/contrat-agents-audit.md`, `.claude/audit/`).

⛔ **Si le diff dépasse ce qu'une passe peut porter — au-delà d'environ 2 000 lignes
modifiées, ou s'il contient des fichiers de verrouillage, minifiés, générés ou
vendus — tu le réduis, et tu dis lesquels tu as écartés et pourquoi.** Un rapport ne
prétend jamais implicitement couvrir un diff qu'il a tronqué.

### 2. Contexte

Réutilise `.claude/audit/PROJECT_CONTEXT.md` **s'il existe et porte un commit dont le
diff ne modifie aucun des fichiers qu'il décrit**. Sinon, relance `project-analyst` sur
le périmètre du diff seulement.

⚠️ Un contexte reconstruit depuis un diff est aveugle à tout ce que le diff ne touche
pas. Il le déclare.

### 3. Agents

Sélectionne **sur ce que le diff touche**, pas sur le dépôt entier : un diff qui ne
change que du CSS n'appelle ni `api-integrations` ni `qa-tests`.

Écarter un agent ici est normal et attendu — l'inverse de `/audit`, où c'est
l'exception. Ta justification figure au compte rendu.

### 4. Consolidation

`review-board` sur les seules fiches produites. **Pas de Red Team** : elle a besoin d'une
vue d'ensemble qu'un diff ne donne pas.

## Compte rendu

Comme `/audit`, plus : la référence de comparaison, le nombre de fichiers et de lignes du
diff, ce qui a été écarté par réduction, et les agents non lancés avec leur raison.

⚠️ **La couverture d'un diff n'est pas la couverture du dépôt.** Le rapport le dit en
toutes lettres, faute de quoi une succession de passes propres se lit comme un quitus
qu'aucune n'a donné.
