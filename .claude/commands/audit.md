---
description: Lance une passe d'audit complète sur ce dépôt — sélection des agents, séquencement, consolidation.
argument-hint: [chemin ou périmètre, facultatif]
---

# Passe d'audit

Tu pilotes la bibliothèque d'agents d'audit. Tu ne lis pas le code, tu ne juges aucun
constat, tu ne résumes pas les rapports : tu choisis qui intervient, dans quel ordre, et
tu rends compte de ce qui s'est passé.

Contrat : `.claude/contrat-agents-audit.md`. Agents : `.claude/agents/`.

Périmètre demandé : $ARGUMENTS — à défaut, **l'ensemble du dépôt sauf la bibliothèque
elle-même** : `.claude/agents/`, `.claude/commands/audit.md`,
`.claude/contrat-agents-audit.md`, `.claude/audit/`.

⚠️ Tout le reste de `.claude/` **s'audite** : c'est du contenu de projet comme un autre.
Une exclusion posée pour une bonne raison — empêcher la bibliothèque de s'auditer
elle-même — emporte bien plus que sa raison si elle est prise en bloc.

## La règle qui prime sur toutes les autres

**Tu transmets le périmètre, et rien d'autre.**

Chaque agent porte son propre contrat : son domaine, ses exclusions, sa méthode, ce qu'il
doit écarter. Ton message de délégation ne contient que le dépôt et le périmètre.

⛔ **Tu n'ajoutes aucune consigne de domaine à un agent.** Ni « fais attention à… », ni
« ignore… », ni « analyse sans… ». Si tu juges qu'une consigne manque, c'est le fichier
de l'agent qu'il faut corriger, et tu le signales en fin de passe au lieu de le rattraper
à la volée.

⛔ **Tu ne restreins pas le périmètre d'un agent.** Lui dire d'ignorer un répertoire le
prive d'un cas qu'il devait traiter, et fausse la mesure de son comportement.

⚠️ Motif mesuré le 2026-09-11 : lors de la première passe réelle, l'orchestrateur a
ajouté des consignes de son cru à trois agents et a dit à un quatrième d'ignorer
`.claude/`. Les consignes étaient de bonne foi et l'une d'elles tombait juste — mais
elles étaient réparties au hasard : l'interdiction d'appeler un service externe n'avait
été donnée qu'à un seul agent, et c'est un autre qui a déclenché un appel réseau
authentifié sortant.

**Une consigne donnée à un agent sur sept n'est pas un garde-fou, c'est une loterie.**

## Ancrage au commit — avant toute chose

Relève `git rev-parse HEAD` et le nom de la branche **au tout début**, et inscris-les dans
ton compte rendu. **Avant chaque étape**, relève-les à nouveau et compare.

Si l'un des deux a changé : **arrête la passe et rends la main.** Ne continue pas, ne
relance pas, ne recompose pas. Dis ce qui a changé, et laisse `.claude/audit/` intact.

Une seule commande git t'est permise, en lecture : `git rev-parse HEAD` et
`git rev-parse --abbrev-ref HEAD`. Tu ne bascules pas, tu ne tires pas, tu ne fusionnes
pas — même pour réparer.

⚠️ Motif mesuré le 2026-09-12 sur un dépôt réel : l'arbre de travail a changé de branche
pendant que le Project Analyst tournait, et le dépôt a avancé de huit commits. Deux choses
ont cassé d'un coup — **les agents ont disparu**, parce qu'ils ne vivaient que sur la
branche quittée, et **le contexte est devenu faux**, parce qu'il décrivait un commit qui
n'était plus celui du disque. Seule la première a été visible. Sans ce contrôle, une passe
aurait pu se poursuivre sur un contexte périmé sans que rien ne le signale.

## Séquence

Trois étapes, dans cet ordre, avec des conditions de passage strictes.

### 1. Contexte

```
Utilise le sous-agent project-analyst pour analyser ce dépôt et écrire
.claude/audit/PROJECT_CONTEXT.md. Le périmètre est <périmètre>.
```

**Condition de passage** : `.claude/audit/PROJECT_CONTEXT.md` existe et porte une section
« Chargements non statiques ». Sans elle, les agents suivants prendront du code vivant
pour du code mort — n'enchaîne pas, rends la main.

### 2. Audits

Lis `PROJECT_CONTEXT.md` et sélectionne les agents. **Sur ce que le contexte établit, pas
sur une étiquette de domaine** : un dépôt sans stockage n'a pas besoin de l'agent données
pour son volet `DATA`, mais il en a besoin pour son volet `PERF`.

Par défaut, lance-les tous. Écarter un agent demande une justification tirée du contexte,
et cette justification figure dans ton compte rendu.

**Formule exacte, à ne pas improviser** — c'est la seule exception nommée à la règle du
périmètre et rien d'autre, parce que cette commande n'est pas un agent de la bibliothèque
et ne connaît ni le schéma des fiches ni l'emplacement des sorties :

```
Lance la commande /security-review sur l'ensemble du dépôt, pas seulement sur les
changements de la branche. Écris sa sortie brute, sans la reformuler, dans
.claude/audit/security-review-output.md.
```

⚠️ Telle quelle, la commande native n'examine que les changements par rapport à la
branche par défaut. Sur une branche sans changement de code, elle ne voit rien. La
première ligne de la formule est donc obligatoire.

Sa sortie s'écrit dans `.claude/audit/security-review-output.md` — emplacement fixé au
contrat, plus de dossier temporaire ni de chemin ajouté au message du Board.

Lance **aussi `/security-review`** dans cette étape : le préfixe `SEC` n'a produit aucune
fiche sur les deux premières passes, faute d'être branché. C'est une commande et non un
sous-agent, sa sortie ne suit pas le schéma des fiches — le Review Board la transcrira.

Lance-les **en parallèle**, en une seule vague. Claude Code met en file et exécute
jusqu'à dix tâches simultanées ; huit agents passent donc d'un coup.

**Condition de passage** : tous les agents lancés ont rendu. Un agent arrêté en chemin est
une information, pas un échec — note son message d'arrêt et continue.

⚠️ **Un agent peut aussi se bloquer sans rien écrire ni rien dire.** C'est arrivé au
Review Board le 2026-09-12, stoppé par un chien de garde après dix minutes sans
progression. Vérifie la condition de passage **sur l'état du disque**, jamais sur ce
qu'un agent a déclaré. Un agent muet se relance **une fois, à l'identique** — sans rien
ajouter à son message, la règle de non-ingérence valant aussi pour une reprise. S'il
échoue deux fois, rends la main.

### 3. Consolidation

```
Utilise le sous-agent review-board pour consolider les constats de .claude/audit/findings/.
```

Puis, **seulement si un rapport consolidé existe** :

```
Utilise le sous-agent red-team pour chercher les enchaînements dans les constats consolidés.
```

## Ce que tu ne fais pas

- **Tu n'écris rien sous `.claude/audit/`.** Ni index, ni rapport, ni correction. Un
  agent qui a mal écrit se corrige dans son fichier, pas dans sa sortie.
  L'index est reconstruit par le Review Board — tranché le 2026-09-12, trois textes se
  l'attribuant ou se l'interdisant.
- **Tu ne résumes pas les constats.** Le rapport consolidé est le livrable ; le
  paraphraser en dégrade la précision et donne l'illusion qu'il a été lu.
- **Tu ne juges aucun constat**, ni ne signales à un agent ce qu'un autre a trouvé.
  L'indépendance des passes est ce qui rend les recoupements informatifs.
- **Tu ne touches pas à git.** Ni commit, ni pull, ni bascule de branche.

## Compte rendu

À la fin, et seulement à la fin :

| | |
|---|---|
| Agents lancés | lesquels |
| Agents écartés | lesquels, et sur quel élément du contexte |
| Agents arrêtés | lesquels, avec leur message |
| Durée et tokens | par agent |
| Chemin du rapport | `.claude/audit/reports/…` |
| Commit et branche | relevés au départ, revérifiés à chaque étape |

Puis une section **Signaux sur la bibliothèque** : consignes qui t'ont manqué, agents
dont le comportement t'a surpris, règles du contrat qu'un agent n'a pas tenues. C'est ce
qui fait progresser les fichiers d'agents, et personne d'autre que toi n'est placé pour
l'observer.

⛔ **Aucun score, aucune note de santé.** Tu peux dénombrer les constats par sévérité en
recopiant le dénombrement du rapport. Tu n'en produis pas d'autre.

## Reprise

Si `.claude/audit/` contient déjà une passe, dis-le et demande : reprendre là où elle
s'est arrêtée, ou repartir de zéro. Ne mélange jamais les constats de deux passes — leurs
identifiants se recoupent, et le rapport qui en sortirait ne décrirait aucun état réel du
dépôt.
