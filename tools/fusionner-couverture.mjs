/**
 * FairSplit — Une seule mesure de couverture, au lieu de deux partielles
 *
 * Le projet annonçait 59 % : c'était la couverture Vitest seule. Les
 * 300 tests Playwright pilotent un vrai navigateur et exercent précisément ce
 * que Vitest ne peut pas — authentification, carte, corbeille, reconduction,
 * rendu du bilan. Rien de tout cela n'entrait dans le chiffre, si bien que des
 * modules réellement éprouvés y figuraient à 0 %.
 *
 * Deux mesures partielles ne font pas une mesure : on ne savait donc pas où
 * l'application était aveugle, ce qui est la seule chose qu'une couverture
 * serve à dire.
 *
 *   COUVERTURE=1 npx playwright test        # collecte, dans .couverture-e2e/
 *   npx vitest run --coverage --coverage.reporter=json
 *   node tools/fusionner-couverture.mjs     # fusionne et affiche
 *
 * La grandeur retenue est **la ligne**, et c'est un choix, pas un pis-aller.
 *
 * Les deux outils décrivent le même fichier avec des cartes d'instructions
 * différentes — Vitest remonte à l'arbre syntaxique, `v8-to-istanbul` découpe
 * autrement. Additionner leurs compteurs revenait à additionner des choses qui
 * ne se correspondent pas : la première version de ce script retenait Vitest
 * seul dès que les cartes divergeaient, c'est-à-dire presque toujours, et
 * jetait donc l'apport du navigateur qu'elle prétendait mesurer. Le total
 * bougeait de 59,3 à 60,5 %, et `app.js` restait à 0 % alors que chacun des
 * 300 tests le charge.
 *
 * Une ligne, elle, désigne la même chose des deux côtés. Une ligne est couverte
 * si l'une des deux suites l'a exécutée : c'est exactement la question posée.
 *
 * Hors de `public/`, donc jamais publié.
 */

import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import v8toIstanbul from 'v8-to-istanbul';
import { lignesDeVitest, apportDuNavigateur } from './couverture-lignes.mjs';

const RACINE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RELEVES_E2E = resolve(RACINE, '.couverture-e2e');
const COUVERTURE_VITEST = resolve(RACINE, 'coverage/coverage-final.json');
const SORTIE = resolve(RACINE, 'coverage-fusionnee');

/**
 * Ce que Vitest dit être une ligne de code
 *
 * Le dénominateur vient de lui seul, et c'est la clé de tout ce script.
 *
 * `v8-to-istanbul` ne découpe pas le JavaScript en instructions : il projette
 * les intervalles d'octets que V8 lui rend. Sa carte couvre donc le fichier
 * entier, commentaires et lignes vides compris. Bâtir le dénominateur dessus
 * annonçait 17 623 lignes exécutables pour 17 628 lignes de fichier —
 * c'est-à-dire toutes, JSDoc comprise. Le taux qui en sortait, 87 %, ne
 * mesurait rien.
 *
 * Vitest, lui, remonte à l'arbre syntaxique : sa carte ne désigne que du code.
 * Elle décide donc de ce qui compte, et les deux suites votent seulement sur ce
 * qui a été exécuté.
 *
 * @type {Map<string, Set<number>>}
 */
const executables = new Map();

/** Lignes atteintes, par l'une ou l'autre suite @type {Map<string, Set<number>>} */
const atteintes = new Map();

/**
 * Range une ligne dans l'une des deux cartes
 * @param {Map<string, Set<number>>} carte
 * @param {string} fichier
 * @param {number} ligne
 * @returns {void}
 */
function poser(carte, fichier, ligne) {
  if (!carte.has(fichier)) carte.set(fichier, new Set());
  carte.get(fichier).add(ligne);
}

/**
 * Le fichier source que désigne une URL servie par le serveur de test
 *
 * Les relevés portent « http://localhost:3333/js/utils/format.js ». Le rapport
 * doit parler de chemins du dépôt, sans quoi les deux mesures ne se
 * superposeraient pas — le même fichier y figurerait deux fois, sous deux noms.
 *
 * @param {string} url
 * @returns {string|null} Chemin absolu dans `public/`, ou null
 */
function fichierDeLUrl(url) {
  let chemin;
  try {
    chemin = new URL(url).pathname;
  } catch {
    return null;
  }

  const absolu = resolve(RACINE, 'public', chemin.replace(/^\/+/, ''));
  return existsSync(absolu) ? absolu : null;
}

/**
 * Dépouille la couverture Vitest — elle établit le dénominateur
 *
 * Lue en premier, nécessairement : le navigateur ne fait ensuite qu'ajouter
 * des lignes atteintes parmi celles que Vitest reconnaît comme du code.
 *
 * @returns {number} Nombre de fichiers lus
 */
function lireVitest() {
  if (!existsSync(COUVERTURE_VITEST)) return 0;

  const brut = JSON.parse(readFileSync(COUVERTURE_VITEST, 'utf8'));
  let lus = 0;

  for (const [chemin, releve] of Object.entries(brut)) {
    // Vitest mesure aussi ses propres fichiers de test et l'outillage : seul
    // le code publié nous intéresse.
    const absolu = resolve(RACINE, chemin);
    if (!absolu.startsWith(resolve(RACINE, 'public'))) continue;

    const { executables: reconnues, atteintes: vues } = lignesDeVitest(releve);
    for (const ligne of reconnues) poser(executables, absolu, ligne);
    for (const ligne of vues) poser(atteintes, absolu, ligne);
    lus++;
  }

  return lus;
}

/**
 * Dépouille les relevés V8 du navigateur
 *
 * Ce qu'il apporte est filtré par ce que Vitest reconnaît : une ligne que le
 * navigateur dit avoir traversée mais que l'arbre syntaxique ignore est un
 * commentaire ou une ligne vide, et n'a rien à faire dans la mesure.
 *
 * @returns {Promise<number>} Nombre de relevés lus
 */
async function lireLeNavigateur() {
  if (!existsSync(RELEVES_E2E)) return 0;

  const fichiers = readdirSync(RELEVES_E2E).filter(f => f.endsWith('.json'));

  for (const nom of fichiers) {
    const entrees = JSON.parse(readFileSync(resolve(RELEVES_E2E, nom), 'utf8'));

    for (const entree of entrees) {
      const source = fichierDeLUrl(entree.url);
      if (!source || !executables.has(source)) continue;

      const convertisseur = v8toIstanbul(source, 0, {
        source: readFileSync(source, 'utf8')
      });
      await convertisseur.load();
      convertisseur.applyCoverage(entree.functions);

      const rendu = convertisseur.toIstanbul()[source];
      convertisseur.destroy();
      if (!rendu) continue;

      for (const ligne of apportDuNavigateur(rendu, executables.get(source))) {
        poser(atteintes, source, ligne);
      }
    }
  }

  return fichiers.length;
}

const fichiersVitest = lireVitest();
const relevesNavigateur = await lireLeNavigateur();

if (fichiersVitest === 0) {
  console.warn('\u26a0\ufe0f  Aucun relevé Vitest : lancez `npx vitest run --coverage --coverage.reporter=json`.');
}
if (relevesNavigateur === 0) {
  console.warn('\u26a0\ufe0f  Aucun relevé de navigateur : lancez `COUVERTURE=1 npx playwright test`.');
}

const lignes = [];
let totalAtteintes = 0;
let totalExecutables = 0;

for (const [fichier, reconnues] of executables) {
  const vues = atteintes.get(fichier) || new Set();

  totalAtteintes += vues.size;
  totalExecutables += reconnues.size;

  lignes.push({
    fichier: relative(RACINE, fichier),
    atteintes: vues.size,
    executables: reconnues.size,
    part: reconnues.size ? (vues.size / reconnues.size) * 100 : 100,
    // Ce que personne n'a jamais exécuté : de quoi savoir où regarder.
    jamais: [...reconnues].filter(l => !vues.has(l)).sort((a, b) => a - b)
  });
}

lignes.sort((a, b) => a.part - b.part || a.fichier.localeCompare(b.fichier));

mkdirSync(SORTIE, { recursive: true });
writeFileSync(
  resolve(SORTIE, 'lignes.json'),
  JSON.stringify({ total: { atteintes: totalAtteintes, executables: totalExecutables }, fichiers: lignes }, null, 2)
);

const part = totalExecutables ? ((totalAtteintes / totalExecutables) * 100).toFixed(2) : '100.00';

console.log('\n=== Couverture de lignes — Vitest et bout en bout réunis ===\n');
console.log(`  ${part} %   (${totalAtteintes} lignes de code atteintes sur ${totalExecutables})`);
console.log(`  ${fichiersVitest} fichiers, ${relevesNavigateur} relevés de navigateur\n`);

console.log('Les douze fichiers les moins couverts :\n');
for (const ligne of lignes.slice(0, 12)) {
  const pourcent = `${ligne.part.toFixed(1)} %`.padStart(7);
  const compte = `${ligne.atteintes}/${ligne.executables}`.padStart(9);
  console.log(`  ${pourcent} ${compte}  ${ligne.fichier}`);
}

console.log(`\nDétail par fichier, lignes jamais exécutées comprises : ${relative(RACINE, SORTIE)}/lignes.json\n`);
