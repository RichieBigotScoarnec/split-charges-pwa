# Passe d'audit — mode opératoire

Bibliothèque déployée sur la branche `audit/bibliotheque`, qui contient désormais la
fusion de `main` (lot E inclus). Contrat v1.6.

⛔ **Ne change pas de branche pendant une passe.** Les agents ne vivent que sur cette
branche : basculer sur `main` les fait disparaître au milieu de la séquence. C'est ce qui
a interrompu la tentative du 2026-09-12. L'orchestrateur relève maintenant le commit et
la branche au départ et les revérifie avant chaque étape — il s'arrêtera si l'arbre
bouge, mais mieux vaut qu'il ne bouge pas.

```bash
git fetch origin
git checkout audit/bibliotheque
claude
```

⚠️ **Relance `claude` après le checkout.** Les fichiers d'agents sont lus au démarrage de
session ; ceux arrivés pendant qu'une session tourne sont invisibles.

## Lancer

```
/audit
```

Sans argument, le périmètre est l'ensemble du dépôt hors `.claude/`.

## Ce que ce dépôt a de particulier

**446 fichiers suivis, contre 44 sur le dépôt témoin.**
Dix fois le volume sur lequel la bibliothèque a été mesurée. Les durées observées sur le
témoin — 9 min 36 pour la vague de sept, 15 min pour la consolidation — n'ont aucune
raison de tenir.

**236 fichiers de test sur 423.** Plus de la moitié du dépôt. C'est le cas idéal pour
`qa-tests` et le cas piège pour `repo-hygiene` : aucun n'est importé par le code, tous
sont découverts par motif de nom. C'est le leurre L1 du témoin, à l'échelle réelle.

**Deux prompts d'audit préexistants** dans `.claude/commands/` :
`audit-web-fairsplit.md` et `audit-design-fairsplit.md`. **Laissés en place
délibérément.** Le second n'est pas une commande mais un rapport d'audit daté de mars
2026 ; le premier cible deux fichiers qui n'existent plus et décrit une architecture
morte. `repo-hygiene` devrait les trouver.

C'est la comparaison qui vaut cette passe : ces défauts ont été relevés à la main le
2026-09-11 et consignés dans
`60-Lessons-Learned/2026-09-11-todo-fairsplit-prompts-audit-derive.md` du vault. **Si
l'instrument les retrouve seul, il est validé sur du réel. S'il les rate, on sait quoi
corriger.**

## Si ça dure trop longtemps

La séquence est arrêtable entre les étapes. Si la vague d'audits dépasse la demi-heure,
laisse finir — c'est une mesure utile en soi. Si un agent se bloque sans rien écrire,
l'orchestrateur le relance une fois, à l'identique.

## Ce que je veux en retour

`.claude/audit/` en entier, et les durées par agent. Le nombre de constats m'intéresse
moins que **le temps et le volume** : c'est ce qui décidera si la chaîne est utilisable
sur le monorepo pro, qui est encore plus gros.

## Ce que la passe ne modifiera pas

Aucun agent n'écrit hors de `.claude/audit/`, aucun n'exécute le code du dépôt, aucun ne
touche à git. `git status` doit ne montrer que `.claude/audit/` à la fin.
