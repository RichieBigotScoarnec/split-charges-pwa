/**
 * FairSplit — Compter les dépendants d'un module, les deux formes d'import
 *
 * Le tableau des adhérences critiques de `CLAUDE.md` existe pour qu'on sache ce
 * qu'on risque en touchant un module très importé. Il était tenu à la main, et
 * il avait dérivé dans le sens dangereux : 13 dépendants annoncés pour
 * `toast.js` là où il y en a 26, 8 pour `db.js` là où il y en a 25.
 *
 * La commande qu'il prescrivait pour le vérifier échouait deux fois :
 *
 *   — `grep -rl "from '.*MODULE" js/` vise `js/`, un dossier qui n'existe pas
 *     dans ce dépôt — c'est `public/js/`. La commande rendait donc une erreur,
 *     jamais une liste, et une erreur se lit comme « rien à signaler » ;
 *   — `from '…'` ne voit que les imports STATIQUES. Ce dépôt charge beaucoup à
 *     la demande : sur `db.js`, 22 des 25 dépendants passent par `import()`
 *     dynamique. La garde en montrait 3 sur 25.
 *
 * Les deux formes comptent pour la même question — « qui casse si je change la
 * signature de cette fonction ? » — donc les deux sont relevées, et la part
 * dynamique est rendue à part : c'est celle qu'un `grep` ne trouvera jamais.
 *
 * Un fichier qui importe deux fois la même cible compte pour un : ce qu'on veut
 * savoir, c'est combien de FICHIERS il faudra relire.
 *
 * Hors de `public/`, donc jamais publié.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RACINE = 'public/js';

/**
 * Le seuil du tableau des adhérences critiques de `CLAUDE.md`
 *
 * Il est exporté pour que le tableau et le contrôle qui le tient lisent le même
 * nombre. Le tableau retient tout module au-dessus, plus deux points de passage
 * que leur seul compte ne décrit pas.
 */
export const SEUIL = 13;

/** Un spécificateur relatif en tête de ligne : `import … from './x.js'`. */
const RE_STATIQUE = /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*['"](\.[^'"]+)['"]/gm;

/** Un chargement à la demande : `import('./x.js')`. */
const RE_DYNAMIQUE = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g;

const enSlash = (p) => p.split(path.sep).join('/');

/**
 * Les fichiers JS d'un dossier, récursivement
 *
 * @param {string} dossier
 * @returns {string[]} Chemins en slash, depuis la racine du dépôt
 */
export function fichiersJs(dossier) {
  const trouves = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) trouves.push(...fichiersJs(p));
    else if (e.name.endsWith('.js')) trouves.push(enSlash(p));
  }
  return trouves;
}

/**
 * Le graphe des dépendances, à partir des sources elles-mêmes
 *
 * Pure : elle ne lit aucun disque. C'est ce qui permet de l'éprouver sur une
 * entrée synthétique plutôt que sur l'état du dépôt — un contrôle qui lirait
 * `public/js` mesurerait ce que le dépôt contient aujourd'hui, pas ce que le
 * résolveur sait voir.
 *
 * @param {Object<string, string>} sources - Chemin en slash → texte du fichier
 * @returns {Map<string, {statiques: Set<string>, dynamiques: Set<string>}>}
 *   Indexé par chemin de CIBLE ; les valeurs sont les fichiers qui l'importent
 */
export function adherencesDeSources(sources) {
  const graphe = new Map();

  const noter = (cible, source, forme) => {
    if (!graphe.has(cible)) {
      graphe.set(cible, { statiques: new Set(), dynamiques: new Set() });
    }
    graphe.get(cible)[forme].add(source);
  };

  for (const [fichier, texte] of Object.entries(sources)) {
    for (const [motif, forme] of [
      [RE_STATIQUE, 'statiques'],
      [RE_DYNAMIQUE, 'dynamiques'],
    ]) {
      motif.lastIndex = 0;
      let m;
      while ((m = motif.exec(texte))) {
        // Le spécificateur est relatif au fichier qui l'écrit, jamais à la racine.
        let cible = enSlash(path.posix.normalize(path.posix.join(path.posix.dirname(fichier), m[1])));
        if (!cible.endsWith('.js')) cible += '.js';
        noter(cible, fichier, forme);
      }
    }
  }

  return graphe;
}

/**
 * Le graphe des dépendances de `public/js`, lu sur le disque
 *
 * @param {string} [racine] - Dossier à parcourir
 * @returns {Map<string, {statiques: Set<string>, dynamiques: Set<string>}>}
 */
export function releverLesAdherences(racine = RACINE) {
  const sources = {};
  for (const fichier of fichiersJs(racine)) {
    sources[fichier] = fs.readFileSync(fichier, 'utf8');
  }
  return adherencesDeSources(sources);
}

/**
 * Le classement des cibles par nombre de fichiers dépendants
 *
 * @param {Map} graphe - Sortie de `releverLesAdherences`
 * @returns {Array<{cible: string, total: number, statiques: number, dynamiques: number}>}
 */
export function classement(graphe) {
  return [...graphe.entries()]
    .map(([cible, { statiques, dynamiques }]) => ({
      cible,
      // Un fichier qui importe des deux façons ne compte qu'une fois : la
      // question est « combien de fichiers relire », pas « combien de lignes ».
      total: new Set([...statiques, ...dynamiques]).size,
      statiques: statiques.size,
      dynamiques: dynamiques.size,
    }))
    .sort((a, b) => b.total - a.total || a.cible.localeCompare(b.cible));
}

/* c8 ignore start — la sortie console, jouée à la main */
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const demande = process.argv[2];
  const lignes = classement(releverLesAdherences());
  const retenues = demande
    ? lignes.filter((l) => l.cible.includes(demande))
    : lignes.slice(0, 20);

  if (demande && retenues.length === 0) {
    console.log(`Aucune cible ne correspond à « ${demande} ».`);
    process.exit(1);
  }

  console.log('DÉPENDANTS  dont dyn.  CIBLE');
  for (const l of retenues) {
    console.log(
      String(l.total).padStart(9),
      String(l.dynamiques).padStart(9),
      '  ' + l.cible.replace(`${RACINE}/`, ''),
    );
  }

  if (demande) {
    const { statiques, dynamiques } = releverLesAdherences().get(retenues[0].cible);
    console.log('\nFichiers à relire :');
    for (const f of [...new Set([...statiques, ...dynamiques])].sort()) {
      const forme = dynamiques.has(f) && !statiques.has(f) ? ' (import dynamique)' : '';
      console.log('  ' + f.replace(`${RACINE}/`, '') + forme);
    }
  }
}
/* c8 ignore stop */
