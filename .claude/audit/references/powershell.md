---
pile: powershell
date-verification: '2026-09-12'
version: '1.0'
type: reference
---

# Référence — PowerShell

## Versions d'introduction des syntaxes

| Syntaxe | Version minimale réelle | Détail |
|---|---|---|
| `??`, `??=` | **7.0** | opérateurs de coalescence nulle |
| `?.`, `?[]` | **7.1** | opérateurs null-conditionnels : expérimentaux en 7.0 derrière `Enable-ExperimentalFeature PSNullConditionalOperators`, passés en courant en 7.1 |
| `-Parallel` sur `ForEach-Object` | 7.0 | |
| Opérateur ternaire `? :` | 7.0 | |
| Chaînage `&&` et `\|\|` | 7.0 | |

**Source** : Microsoft Learn, « Differences between Windows PowerShell 5.1 and
PowerShell 7.x », consulté le 2026-09-12.

⚠️ **Ce que cette table corrige** : jusqu'au 2026-09-12, `?.` était supposé disponible dès
7.0 dans les constats produits sur le dépôt témoin. Un module utilisant `?.` **et** `??`
exige donc 7.1 au minimum, pas 7.0. Une version d'introduction approchée produit un
constat de compatibilité faux.

**Condition de péremption** : cette table ne périme pas — une version d'introduction est
un fait historique. En revanche, toute nouvelle syntaxe absente d'ici est une lacune, pas
une absence de contrainte.

## Comportements d'outillage contre-intuitifs

**`Mock` de Pester ne s'applique pas à l'intérieur d'un module.** Une commande appelée
depuis le code d'un module chargé n'est pas interceptée par un `Mock` posé dans le fichier
de test, sauf à préciser `-ModuleName <nom>`. Le test passe, le simulacre ne fait rien, et
**le code réel s'exécute**.

Conséquence mesurée le 2026-09-11 : une suite de tests censée simuler un appel réseau a
déclenché un appel réel, authentifié, portant les identifiants du module.

Un test qui mocke une commande appelée depuis un module et n'a pas `-ModuleName` est un
constat `QA` de plein droit, pas une remarque de style.

**Condition de péremption** : comportement du moteur de portée de Pester 5.x. À
revérifier si le projet cible Pester 6.

## Compatibilité déclarée

`PowerShellVersion` du manifeste `.psd1` est une **déclaration**, pas une contrainte
appliquée : PowerShell ne refuse pas de charger un module dont le code dépasse la version
déclarée. L'écart ne se voit qu'à l'exécution de la fonction concernée, sur la version
basse.

C'est ce qui rend le constat utile : il est invisible autrement.
