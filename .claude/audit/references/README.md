---
nom-canonique: references-readme
version: '1.0'
created: '2026-09-12'
projet: Prompt-Engineer
type: kb
---

# Couche référentielle

Les agents ne connaissent aucune technologie. Ils détectent la pile dans
`PROJECT_CONTEXT.md`, puis chargent le fichier de référence correspondant s'il existe.

**C'est ici que se fait l'extension à une pile nouvelle** — pas dans les agents. Ajouter
Python, Next.js ou une pile qui n'existe pas encore consiste à ajouter un fichier ici.
Aucun agent ne change.

## Ce qu'un fichier de référence contient

Des faits **datés, sourcés, et vérifiables** : versions d'introduction d'une syntaxe,
seuils normatifs, comportements d'outillage contre-intuitifs. Rien d'autre.

Pas de bonnes pratiques, pas de préférences, pas de conseils d'architecture — ceux-là
vivent dans les fichiers d'agents, et ils ne périment pas de la même façon.

## Les trois champs qui font sa valeur

Chaque fait porte :

- **sa source**, nommée et citable ;
- **la date de sa vérification** ;
- **sa condition de péremption** — ce qui le rendrait faux.

Un fait sans ces trois champs n'entre pas. C'est ce qui distingue cette couche d'une
connaissance mémorisée, et c'est pour éviter exactement ce qui est arrivé aux prompts
d'audit de `split-charges-pwa` : cent soixante-treize jours de dérive silencieuse.

## Qui l'écrit

**Pas les agents.** Un agent qui rédigerait sa propre référence y inscrirait ce qu'il
croit savoir, et la couche perdrait sa seule raison d'être. Ces fichiers sont écrits et
révisés à la main, après vérification à la source.

## Ce que fait un agent quand la référence manque

Il écrit son constat en `[À vérifier]`, avec pour condition de levée la vérification à
faire. Il ne tranche jamais de mémoire, et il signale l'absence de référence dans son
périmètre non couvert.

## Contrôle de fraîcheur

Chaque fichier porte une `date-verification`. Au-delà de douze mois, les faits qu'il
contient redeviennent `[À vérifier]` jusqu'à revérification — non parce qu'ils sont faux,
mais parce que **plus personne ne sait s'ils sont vrais**.
