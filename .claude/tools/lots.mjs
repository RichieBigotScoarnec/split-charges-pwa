/**
 * FairSplit — Partition déterministe du dépôt en lots d'audit
 *
 * Le défaut mesuré : onze agents libres de choisir leurs fichiers ouvrent tous
 * les mêmes fichiers centraux et laissent des zones que personne ne regarde.
 * Sur 446 fichiers, l'union plafonne à 14 %.
 *
 * La parade : chaque fichier est assigné à EXACTEMENT UN lot, avant que le
 * moindre agent ne démarre. Un agent reçoit un lot fini et n'en sort pas.
 *
 *   node .claude/tools/lots.mjs   → écrit .claude/audit/lots.json lui-même, en UTF-8
 *
 * Dimensionnement : chaque lot vise un budget de jetons qui laisse à l'agent
 * de la place pour raisonner. La dégradation du contexte commence bien avant
 * sa limite — viser 100 % de la fenêtre, c'est auditer avec un modèle dégradé.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const BUDGET = Number(process.env.LOT_BUDGET || 60000);   // jetons de lecture par lot
const PLAFOND = Number(process.env.LOT_PLAFOND || 14);    // fichiers par lot
const RISQUE = '.claude/audit/tooling/risque.json';

// Frontière de la bibliothèque — LA MÊME LISTE dans lots.mjs et risque.mjs, nommée
// fichier par fichier comme au contrat (périmètre par défaut). Seule la bibliothèque
// s'exclut, pas tout `.claude/` : le reste y est du contenu de projet comme un autre,
// et une exclusion en bloc emporte plus que sa raison — des commandes héritées
// échappaient à la partition (mesuré le 2026-09-13).
const BIBLIOTHEQUE = [
  /^\.claude\/agents\//,
  /^\.claude\/commands\/audit(-diff)?\.md$/,
  /^\.claude\/contrat-agents-audit\.md$/,
  /^\.claude\/outillage-deterministe\.md$/,
  /^\.claude\/preuve-dynamique\.md$/,
  /^\.claude\/audit\//,
  /^\.claude\/tools\//
];

// Exclusions de la partition, hors bibliothèque — chacune porte son motif, et chaque
// fichier exclu est écrit dans lots.json avec lui. Une exclusion silencieuse rendait
// `partition_complete` aveugle : le total était compté APRÈS filtrage, et six SVG
// suivis restaient hors lot sous un drapeau vrai (ha-config, 69f2767, 2026-11-20).
const EXCLUSIONS = [
  { motif: 'fichier de verrouillage npm, généré', re: /^package-lock\.json$/ },
  { motif: 'image, police ou archive (extension exclue d\'office)',
    re: /\.(png|jpe?g|gif|svg|webp|woff2?|ico|zip)$/i }
];

// Le périmètre : tout ce que git suit, moins la bibliothèque. C'est contre lui que la
// complétude se calcule, pas contre ce qui reste après les exclusions.
const tous = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const horsBibliotheque = tous.filter((f) => !BIBLIOTHEQUE.some((r) => r.test(f)));
const exclus = [];
const suivis = [];
for (const f of horsBibliotheque) {
  const e = EXCLUSIONS.find((x) => x.re.test(f));
  if (e) exclus.push({ fichier: f, motif: e.motif }); else suivis.push(f);
}

// Ordre de traitement : le rang dans le classement par risque s'il existe. Un fichier
// qu'il ne classe pas — ou tous, s'il est absent — prend le rang 99999 ; le tri étant
// stable, ces fichiers gardent l'ordre de `git ls-files`. Aucun tri par taille.
const ordre = new Map();
if (existsSync(RISQUE)) {
  // ⚠️ PowerShell écrit ses redirections `>` en UTF-16 avec un BOM : `JSON.parse`
  // bute alors sur le marqueur d'octets. Mesuré le 2026-09-13 sur Windows.
  // On lit en tolérant le BOM, et on écrit soi-même en UTF-8 (voir plus bas).
  const r = JSON.parse(readFileSync(RISQUE, 'utf8').replace(/^\uFEFF/, ''));
  r.fichiers.forEach((f, i) => ordre.set(f.fichier, i));
}
const rang = (f) => (ordre.has(f) ? ordre.get(f) : 99999);

const jetons = (f) => {
  try { return Math.ceil(statSync(f).size / 4); } catch { return 0; }
};

// Zone = le répertoire qui contient le fichier. Un lot ne mélange pas les
// zones : un agent qui saute de CSS à des tests perd le fil de ce qu'il
// cherche.
// ⚠️ Ne pas prendre « les deux premiers segments » : un fichier directement
// sous `tests/` deviendrait sa propre zone, et la partition exploserait en
// autant de lots que de fichiers. Mesuré : 96 lots au lieu de 40.
const zone = (f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '(racine)');

const parZone = {};
for (const f of suivis) (parZone[zone(f)] ||= []).push(f);

const lots = [];
for (const [z, fichiers] of Object.entries(parZone)) {
  fichiers.sort((a, b) => rang(a) - rang(b));
  let courant = [], poids = 0;
  const fermer = () => {
    if (!courant.length) return;
    lots.push({
      id: `L${String(lots.length + 1).padStart(2, '0')}`,
      zone: z,
      fichiers: courant,
      jetons_estimes: poids,
      rang_min: Math.min(...courant.map(rang)),
      statut: 'a_traiter'
    });
    courant = []; poids = 0;
  };
  for (const f of fichiers) {
    const j = jetons(f);
    // Un fichier plus gros que le budget forme son propre lot : le découper
    // en tranches ferait perdre le fil à l'agent.
    if (j > BUDGET) { fermer(); lots.push({
      id: `L${String(lots.length + 1).padStart(2, '0')}`, zone: z, fichiers: [f],
      jetons_estimes: j, rang_min: rang(f), statut: 'a_traiter',
      note: 'fichier seul — dépasse le budget d\'un lot'
    }); continue; }
    if (poids + j > BUDGET || courant.length >= PLAFOND) fermer();
    courant.push(f); poids += j;
  }
  fermer();
}

// Les lots les plus à risque en premier : si la passe est interrompue,
// ce qui a été couvert est ce qui comptait le plus.
lots.sort((a, b) => a.rang_min - b.rang_min);
lots.forEach((l, i) => { l.id = `L${String(i + 1).padStart(2, '0')}`; });

const total = horsBibliotheque.length;
const assignes = lots.reduce((n, l) => n + l.fichiers.length, 0);
const dansUnLot = new Set(lots.flatMap((l) => l.fichiers));
const dansExclus = new Set(exclus.map((e) => e.fichier));
// Complète = chaque fichier suivi hors bibliothèque est dans un lot OU dans la liste
// des exclus, jamais dans les deux, et les comptes tombent juste.
const complete = horsBibliotheque.every((f) => dansUnLot.has(f) !== dansExclus.has(f))
  && assignes + exclus.length === total;

const sortie = JSON.stringify({
  outil: '.claude/tools/lots.mjs',
  date: new Date().toISOString().slice(0, 10),
  commit: execSync('git rev-parse --short HEAD').toString().trim(),
  budget_jetons_par_lot: BUDGET,
  plafond_fichiers_par_lot: PLAFOND,
  classement_par_risque: ordre.size > 0,
  fichiers_bibliotheque: tous.length - total,
  fichiers_suivis: total,          // suivis par git, hors bibliothèque
  fichiers_assignes: assignes,
  fichiers_exclus: exclus.length,
  // Le contrôle qui rend la partition vérifiable : aucun fichier perdu — ni lot ni
  // exclusion motivée —, aucun fichier en double. Si ces deux lignes ne sont pas
  // vraies, la couverture annoncée en fin de passe ne veut rien dire.
  partition_complete: complete,
  doublons: assignes - dansUnLot.size,
  exclus,
  lots_total: lots.length,
  lots
}, null, 2);

// Le script écrit son fichier lui-même plutôt que de compter sur une
// redirection du shell : `>` produit de l'UTF-16 avec BOM sous PowerShell,
// illisible par le script suivant.
mkdirSync('.claude/audit', { recursive: true });
writeFileSync('.claude/audit/lots.json', sortie, 'utf8');
console.log(`lots.json écrit — ${total} suivis hors bibliothèque : ${assignes} assignés, ${exclus.length} exclus, ${lots.length} lots, complet=${complete}`);
