/**
 * FairSplit — Classement des fichiers par risque
 *
 * Ne produit aucun constat. Dirige l'attention : quand un agent ne peut ouvrir
 * qu'un cinquième des fichiers, ce classement décide lequel.
 *
 * Deux signaux déterministes :
 *   - la fréquence de modification, depuis git log ;
 *   - la couverture de test, depuis la couverture fusionnée si elle existe.
 *
 * Un fichier souvent modifié et peu couvert est l'endroit où les défauts vivent.
 *
 *   node tools/risque.mjs    → écrit .claude/audit/tooling/risque.json en UTF-8
 *
 * ⚠️ Le script écrit son fichier lui-même : sous PowerShell, une redirection `>`
 * produit de l'UTF-16 avec BOM, que le script suivant ne sait pas relire.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const DEPUIS = process.env.RISQUE_DEPUIS || '6 months ago';
const COUVERTURE = 'coverage/coverage-final.json';

const suivis = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(js|mjs|html|css|json|ps1|psm1|psd1)$/.test(f))
  .filter((f) => !f.startsWith('.claude/') && f !== 'package-lock.json');

// Fréquence de modification
const journal = execSync(
  `git log --since="${DEPUIS}" --name-only --pretty=format: --no-merges`,
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
).split('\n').filter(Boolean);

const modifications = {};
for (const f of journal) modifications[f] = (modifications[f] || 0) + 1;

// Couverture, si elle a été produite
const couverture = {};
if (existsSync(COUVERTURE)) {
  const brut = JSON.parse(readFileSync(COUVERTURE, 'utf8').replace(/^\uFEFF/, ''));
  for (const [chemin, d] of Object.entries(brut)) {
    const total = Object.keys(d.statementMap || {}).length;
    const vus = Object.values(d.s || {}).filter((n) => n > 0).length;
    const relatif = chemin.replace(process.cwd().replace(/\\/g, '/') + '/', '').replace(/\\/g, '/');
    couverture[relatif] = total ? vus / total : null;
  }
}

const fichiers = suivis.map((f) => {
  const n = modifications[f] || 0;
  const c = couverture[f] ?? null;
  // Le risque croît avec les modifications et décroît avec la couverture.
  // Un fichier sans mesure de couverture est traité comme non couvert, et la
  // ligne le déclare — ne pas confondre « non couvert » et « non mesuré ».
  const score = n * (1 - (c ?? 0));
  return {
    fichier: f,
    modifications: n,
    couverture: c === null ? null : Math.round(c * 100) / 100,
    couverture_mesuree: c !== null,
    score: Math.round(score * 100) / 100
  };
});

fichiers.sort((a, b) => b.score - a.score);

const sortie = JSON.stringify({
  outil: 'tools/risque.mjs',
  date: new Date().toISOString().slice(0, 10),
  commit: execSync('git rev-parse --short HEAD').toString().trim(),
  fenetre: DEPUIS,
  couverture_disponible: Object.keys(couverture).length > 0,
  avertissement: Object.keys(couverture).length
    ? null
    : 'Aucune couverture trouvée : le score ne reflète que la fréquence de modification.',
  fichiers
}, null, 2);

mkdirSync('.claude/audit/tooling', { recursive: true });
writeFileSync('.claude/audit/tooling/risque.json', sortie, 'utf8');
console.log(`risque.json écrit — ${fichiers.length} fichiers classés, couverture disponible : ${Object.keys(couverture).length > 0}`);
