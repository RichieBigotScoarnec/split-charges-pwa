# Chaîne d'audit — mode opératoire

Contrat v2.1. Onze agents, deux commandes.

## Avant toute passe : produire les indices

La chaîne lit des sorties d'outils qu'**elle ne produit pas elle-même** — un agent n'a
pas le droit d'exécuter le code du dépôt. Sans ces sorties, elle tourne quand même, avec
une couverture nettement moindre, et l'orchestrateur le signale.

```bash
npm install

mkdir -p .claude/audit/tooling

# statique
npx eslint . --format json -o .claude/audit/tooling/eslint.json
npx knip --reporter json > .claude/audit/tooling/knip.json
npx madge --circular --json public/js > .claude/audit/tooling/madge.json
npm audit --json > .claude/audit/tooling/npm-audit.json

# dynamique
npm run couverture
npx playwright test tests/audit/axe.spec.js
npm run regles

# priorisation
node tools/risque.mjs > .claude/audit/tooling/risque.json
```

⚠️ `node tools/risque.mjs` **après** `npm run couverture` : sans la couverture, le
classement ne reflète que la fréquence de modification, et il le déclare.

## Les deux commandes

```
/audit            balayage profond — périodique, coûteux, seul à trouver ce qui dort
/audit-diff       changements seulement — continu, court, à chaque modification
```

⚠️ Une revue de diff propre **ne déclare pas le dépôt sain**. Aucune accumulation de
passes courtes ne trouve un défaut qui n'apparaît dans aucun diff.

## Ce que la passe ne fera pas

Elle ne conclura pas sous 80 % de couverture du périmètre. Elle rendra ses constats et
dira quels lots restent. C'est voulu : un audit qui trouve peu sur un cinquième d'un
dépôt et un audit qui trouve peu sur un dépôt sain se ressemblent exactement.

Pour monter la couverture, découpe : `/audit public/js/modules`, puis
`/audit public/js/utils`, puis `/audit tests`. L'union des passes couvre le périmètre.

## Les deux fichiers que toi seul écris

- `.claude/audit/false-positives.md` — ce qui ne doit plus remonter, avec sa raison.
- `.claude/audit/risques-acceptes.md` — un constat réel, compris et assumé. Il porte
  l'empreinte stable du constat, la date, et ce qui ferait le réexaminer.

Sans eux, ce que tu décides ne revient jamais dans le système, et tu apprendras à ignorer
les rapports.
