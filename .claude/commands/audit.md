---
description: Passe d'audit complète, partitionnée en lots — chaque fichier assigné à exactement un agent.
argument-hint: [chemin ou zone, facultatif — restreint la partition]
---

# Passe d'audit

Tu pilotes la bibliothèque. Tu ne lis pas le code, tu ne juges aucun constat, tu ne
résumes pas les rapports : tu partitionnes, tu assignes, tu tiens le registre.

Contrat : `.claude/contrat-agents-audit.md`. Agents : `.claude/agents/`.
Périmètre : $ARGUMENTS — à défaut, tout le dépôt sauf la bibliothèque
(`.claude/agents/`, `.claude/commands/audit*.md`, `.claude/contrat-agents-audit.md`,
`.claude/audit/`).

## La règle qui prime

**Tu transmets le lot, et rien d'autre.** Chaque agent porte son contrat : domaine,
exclusions, méthode. Ton message contient le dépôt, la liste de fichiers du lot, et
l'emplacement du contexte partagé.

⛔ Aucune consigne de domaine ajoutée. ⛔ Aucun périmètre restreint au-delà du lot. Si une
consigne manque, c'est le fichier de l'agent qu'il faut corriger, et tu le signales en fin
de passe.
⚠️ Une consigne donnée à un agent sur sept n'est pas un garde-fou, c'est une loterie.

## Ancrage

Relève `git rev-parse HEAD` et la branche au départ. Revérifie **avant chaque vague**.
S'ils changent : arrête, rends la main, laisse `.claude/audit/` intact. Deux commandes git
te sont permises, en lecture seule ; tu ne bascules pas, ne tires pas, ne fusionnes pas.

## Séquence

### 1. Contexte

```
Utilise le sous-agent project-analyst pour analyser ce dépôt et écrire
.claude/audit/PROJECT_CONTEXT.md. Le périmètre est <périmètre>.
```

**Condition de passage** : le fichier existe et porte sa section « Chargements non
statiques ». Sans elle, la suite prendra du code vivant pour du code mort.

### 1 bis. Les indices, pour CE commit

Vérifie la date des fichiers de `.claude/audit/tooling/` contre le commit audité. **S'ils
datent d'un commit antérieur, ils ne valent rien** : ils décrivent un autre état.

Tu ne lances aucun analyseur toi-même (§10, §16). Tu **rappelles à l'humain** les
commandes de `outillage-deterministe.md` et tu inscris la lacune à ton compte rendu.

⚠️ Mesuré le 2026-09-13 : les sorties d'ESLint, Knip, Madge et npm audit dataient du
commit précédent et sont parties en archive. Les agents ont travaillé sans indices, et
**aucun ne l'a signalé**.

### 2. Partition — l'étape qui décide de la couverture

```bash
node tools/lots.mjs
```

⛔ **Sans redirection.** Le script écrit `.claude/audit/lots.json` lui-même ; un `>`
l'écraserait avec son message de console — et sous PowerShell produirait de l'UTF-16 que
le script suivant ne saurait pas relire. Même chose pour `tools/risque.mjs`.

⛔ **Vérifie `partition_complete` et `doublons` avant d'aller plus loin.** Complète à
faux, ou doublons non nul : arrête. Une couverture calculée sur une partition trouée ne
veut rien dire (§23).

Si `tools/lots.mjs` n'existe pas dans ce dépôt, dis-le et rends la main. **N'improvise
aucun découpage** : un découpage improvisé par toi reproduit tes biais, et c'est
exactement le défaut que la partition corrige.

Inscris le nombre de lots et le total de fichiers assignés dans ton compte rendu.

### 3. Vagues

Les lots sont déjà ordonnés par risque : traite-les **dans l'ordre**, par vagues de
**dix au plus** — c'est ce que Claude Code exécute réellement en parallèle.

Pour chaque lot, un agent, choisi sur la nature des fichiers du lot d'après
`PROJECT_CONTEXT.md`. Message type, à ne pas enrichir :

```
Utilise le sous-agent <agent> pour auditer le lot <Lxx>, ces fichiers et eux seuls :
<liste des fichiers du lot>
Numérote tes fiches <PREFIXE>-<Lxx>-<NN>, par exemple CQ-<Lxx>-01.
Le contexte partagé est dans .claude/audit/PROJECT_CONTEXT.md.
```

⚠️ **Le numéro de lot doit figurer dans le message.** Mesuré le 2026-09-14 : sans lui,
des agents ont produit `QA-001`, `A11Y-01`, `A11Y-DESIGN-01` ou littéralement
`QA-<LOT>-NN`, et il a fallu les renuméroter à la main. Certains retombaient sur
l'ancien compteur partagé, qui écrase.

⚠️ **Les indices d'outillage n'ont pas de destinataire dans une passe partitionnée.**
Mesuré le 2026-09-14 : 24 alertes ESLint et 3 vulnérabilités npm n'ont été ni vérifiées
ni écartées, parce qu'aucun agent de lot ne porte la sécurité. Quand tu assignes un lot,
**transmets à l'agent les lignes d'indices qui portent sur ses fichiers**, extraites des
sorties. Ce qui ne tombe dans aucun lot revient au Review Board.

Lance aussi `/security-review` **une fois pour la passe**, pas par lot :

```
Lance la commande /security-review sur l'ensemble du dépôt, pas seulement sur les
changements de la branche. Écris sa sortie brute, sans la reformuler, dans
.claude/audit/security-review-output.md.
```

**Dès la partition validée**, crée `.claude/audit/REGISTRE.md` avec une ligne par lot en
`statut=a_traiter`. Bascule chaque ligne **au retour de son agent**, pas en fin de vague :
une passe arrêtée en cours de vague doit laisser une trace.

```
L07 | design | 1 fichier | agent=repo-hygiene | statut=couvert | 3 constats | AAAA-MM-JJ
```

⛔ **Toi seul écris le registre.** L'écriture concurrente sur un fichier partagé a déjà
détruit un index et écrasé quatre fois un fichier d'indices (§24).

Un agent qui rend sans avoir écrit de fiche **n'est pas en échec** : un lot peut être
sain. Statut `couvert`, zéro constat. Un agent bloqué sans rien écrire ni rien dire se
relance **une fois, à l'identique**, puis son lot passe `non_couvert` avec la raison.

### 4. Consolidation

Quand tous les lots portent un statut :

```
Utilise le sous-agent review-board pour consolider les constats de .claude/audit/constats/.
Le registre de progression est dans .claude/audit/REGISTRE.md.
```

Puis, **seulement si un rapport consolidé existe** :

```
Utilise le sous-agent red-team pour chercher les enchaînements dans les constats consolidés.
```

## Reprise

`.claude/audit/REGISTRE.md` existe et le commit n'a pas changé → propose de **reprendre**
les lots `statut != couvert` plutôt que de tout relancer. C'est le principal apport du
registre : la couverture devient un compteur qui monte d'une passe à l'autre.

Le commit a changé → la reprise est impossible, les lots décrivent un autre état. Archive
et repars.

## Ce que tu ne fais pas

- **Tu n'écris sous `.claude/audit/` que trois choses, nommément** : `REGISTRE.md`,
  `lots.json`, et **une fiche à la place d'un agent qui a refusé de l'écrire** (§26) —
  sans la reformuler. Rien d'autre.
  ⚠️ Trois interdictions générales successives de ce contrat ont emporté plus que leur
  raison : `.claude/` exclu en bloc, `INDEX.md` interdit à tout le monde, puis
  `.claude/audit/` fermé à l'orchestrateur. Une interdiction se nomme, elle ne se
  généralise pas.
- **Tu ne résumes pas les constats.** Le rapport consolidé est le livrable.
- **Tu ne juges aucun constat**, et tu ne dis jamais à un agent ce qu'un autre a trouvé.
- **Tu ne touches pas à git.**
- ⛔ **Aucun score, aucune note de santé.** Tu peux recopier un dénombrement.

## Compte rendu

| | |
|---|---|
| Commit et branche | relevés au départ, revérifiés à chaque vague |
| Partition | lots, fichiers assignés, `partition_complete`, `doublons` |
| Vagues | combien, durée de chacune |
| Lots couverts / total | le chiffre de couverture réel |
| Lots non couverts | lesquels, et pourquoi |
| Durée et tokens | par agent |
| Chemin du rapport | `.claude/audit/reports/…` |

Puis **Signaux sur la bibliothèque** : consignes qui t'ont manqué, agents dont le
comportement t'a surpris, règles du contrat qu'un agent n'a pas tenues. Personne d'autre
que toi n'est placé pour l'observer.
