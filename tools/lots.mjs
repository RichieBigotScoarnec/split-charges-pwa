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
 *   node tools/lots.mjs > .claude/audit/lots.json
 *
 * Dimensionnement : chaque lot vise un budget de jetons qui laisse à l'agent
 * de la place pour raisonner. La dégradation du contexte commence bien avant
 * sa limite — viser 100 % de la fenêtre, c'est auditer avec un modèle dégradé.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const BUDGET = Number(process.env.LOT_BUDGET || 60000);   // jetons de lecture par lot
const PLAFOND = Number(process.env.LOT_PLAFOND || 14);    // fichiers par lot
const RISQUE = '.claude/audit/tooling/risque.json';

const EXCLUS = [
  /^\.claude\//, /^package-lock\.json$/, /\.(png|jpe?g|gif|svg|webp|woff2?|ico|zip)$/i
];

const suivis = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !EXCLUS.some((r) => r.test(f)));

// Ordre de traitement : le classement par risque s'il existe, sinon la taille.
let ordre = new Map();
if (existsSync(RISQUE)) {
  const r = JSON.parse(readFileSync(RISQUE, 'utf8'));
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

const total = suivis.length;
const assignes = lots.reduce((n, l) => n + l.fichiers.length, 0);

console.log(JSON.stringify({
  outil: 'tools/lots.mjs',
  date: new Date().toISOString().slice(0, 10),
  commit: execSync('git rev-parse --short HEAD').toString().trim(),
  budget_jetons_par_lot: BUDGET,
  plafond_fichiers_par_lot: PLAFOND,
  classement_par_risque: ordre.size > 0,
  fichiers_suivis: total,
  fichiers_assignes: assignes,
  // Le contrôle qui rend la partition vérifiable : aucun fichier perdu,
  // aucun fichier en double. Si ces deux lignes ne sont pas vraies,
  // la couverture annoncée en fin de passe ne veut rien dire.
  partition_complete: assignes === total,
  doublons: assignes - new Set(lots.flatMap((l) => l.fichiers)).size,
  lots_total: lots.length,
  lots
}, null, 2));
