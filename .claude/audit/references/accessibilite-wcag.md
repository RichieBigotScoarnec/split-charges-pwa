---
pile: web
date-verification: '2026-09-12'
version: '1.0'
type: reference
---

# Référence — Accessibilité, seuils WCAG

⚠️ **Statut des faits ci-dessous : non revérifiés à la source le 2026-09-12.** Ils sont
inscrits ici depuis une connaissance stable et doivent être confirmés sur
`w3.org/WAI/WCAG22/quickref/` avant d'être cités dans un constat `[Constaté]`. Tant que
cette confirmation n'est pas faite, un agent qui s'en sert écrit `[Déduit]`.

Cette réserve est volontaire : elle montre ce que la couche exige. Un fait non vérifié
n'est pas exclu, il est **étiqueté**.

## Contraste

| Cas | Seuil AA | Seuil AAA |
|---|---|---|
| Texte courant | 4,5:1 | 7:1 |
| Texte large (≥ 18 pt, ou ≥ 14 pt gras) | 3:1 | 4,5:1 |
| Éléments non textuels porteurs de sens, bordures de champs | 3:1 | — |

Le rapport se calcule sur les luminances relatives, `(L1 + 0,05) / (L2 + 0,05)`. Il se
calcule, il ne s'estime pas.

## Taille des cibles

WCAG 2.2, critère 2.5.8 (AA) : **24 × 24 px CSS** minimum, sauf exceptions (espacement
suffisant, cible en ligne dans du texte, contrôle imposé par l'agent utilisateur).
Critère 2.5.5 (AAA) : 44 × 44 px.

## Information portée par la couleur

Critère 1.4.1 : une information ne peut pas être transmise par la seule couleur. Un état
rendu par une cellule colorée sans texte, une pastille sans libellé ou une ligne teintée
sans marqueur échoue à ce critère.

**Condition de péremption** : révision de WCAG. La version 2.2 est la référence courante
de ce fichier ; toute citation doit nommer la version et le numéro de critère.
