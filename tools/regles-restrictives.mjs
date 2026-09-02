/**
 * FairSplit — Une règle qui RESTREINT ne se publie pas comme les autres
 *
 * Le pipeline publie les règles AVANT le site, et c'est le bon ordre pour une
 * règle qui élargit : un champ accepté en plus ne gêne aucun client déjà en
 * ligne, alors qu'un client publié avant sa règle voit ses écritures refusées.
 *
 * Une règle qui RESTREINT demande exactement l'ordre inverse. Publiée d'abord,
 * elle casse le client en production — celui qui écrit encore le champ qu'on
 * vient d'interdire — pendant tout le temps que met le site à se publier.
 *
 * Ce cas ne se détectait par rien. Il vivait dans un commentaire de workflow,
 * c'est-à-dire nulle part le jour où quelqu'un retire un champ sans avoir lu ce
 * commentaire. Ce contrôle le rend visible au moment où il se décide : en
 * revue, pas en production.
 *
 * ## Ce qu'il détecte, et ce qu'il ne détecte pas
 *
 * Deux formes non ambiguës :
 *
 *   1. un chemin RETIRÉ — `$autre/.validate` valant `false`, tout champ qui
 *      disparaît de l'arbre devient un champ refusé par le serveur ;
 *   2. un `.read` / `.write` / `.validate` qui devient `false`.
 *
 * Il ne juge PAS les expressions booléennes. Passer de `a` à `a && b` restreint,
 * et ce contrôle n'en saura rien — décider si une condition en implique une
 * autre demande un solveur, et un contrôle qui prétend tout attraper est pire
 * que celui qui dit où il s'arrête : on cesse de relire.
 *
 * ## L'acquittement
 *
 * Un retrait légitime s'inscrit dans `.github/regles-retirees.txt`, un chemin
 * par ligne. Le fichier n'existe pas tant qu'il ne sert pas : un garde-fou dont
 * l'échappatoire est déjà en place invite à s'en servir.
 *
 * Hors de `public/`, donc jamais publié.
 */

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

/** Les trois clés dont la valeur `false` est un refus, et non une donnée */
const CLES_DE_REFUS = Object.freeze(['.read', '.write', '.validate']);

/**
 * Tous les chemins terminaux d'un arbre de règles
 *
 * @param {*} noeud - Arbre lu depuis `database.rules.json`
 * @param {string} [prefixe]
 * @returns {Map<string, *>} Chemin complet vers sa valeur terminale
 */
export function cheminsDesRegles(noeud, prefixe = '') {
  const chemins = new Map();
  if (!noeud || typeof noeud !== 'object') return chemins;

  for (const [cle, valeur] of Object.entries(noeud)) {
    const chemin = prefixe ? `${prefixe}/${cle}` : cle;
    if (valeur && typeof valeur === 'object') {
      for (const [sous, v] of cheminsDesRegles(valeur, chemin)) chemins.set(sous, v);
    } else {
      chemins.set(chemin, valeur);
    }
  }
  return chemins;
}

/**
 * Ce qu'un changement de règles retire
 *
 * Deux formes, décrites en tête de fichier. Le résultat est trié : un ordre
 * stable rend le message de la CI comparable d'une exécution à l'autre.
 *
 * @param {*} base - `database.rules.json` d'avant
 * @param {*} tete - `database.rules.json` d'après
 * @returns {Array<{chemin: string, forme: 'retire'|'refuse'}>}
 */
export function restrictions(base, tete) {
  const avant = cheminsDesRegles(base);
  const apres = cheminsDesRegles(tete);
  const trouvees = [];

  for (const [chemin, valeur] of avant) {
    if (!apres.has(chemin)) {
      trouvees.push({ chemin, forme: 'retire' });
      continue;
    }

    // `false` n'est un refus que sur les trois clés qui gouvernent un accès.
    // Ailleurs, c'est une donnée comme une autre.
    const cle = chemin.slice(chemin.lastIndexOf('/') + 1);
    if (!CLES_DE_REFUS.includes(cle)) continue;

    if (valeur !== false && apres.get(chemin) === false) {
      trouvees.push({ chemin, forme: 'refuse' });
    }
  }

  return trouvees.sort((a, b) => a.chemin.localeCompare(b.chemin));
}

/**
 * Les acquittements déclarés, s'il y en a
 *
 * Un fichier absent vaut « aucun » : c'est le cas normal, et il ne doit pas
 * ressembler à une panne de lecture.
 *
 * @param {string} contenu - Contenu brut du fichier, ou chaîne vide
 * @returns {Set<string>}
 */
export function acquittements(contenu) {
  return new Set(
    String(contenu ?? '')
      .split('\n')
      .map((ligne) => ligne.split('#')[0].trim())
      .filter(Boolean)
  );
}

/**
 * Le verdict, séparé de l'affichage pour être éprouvable
 *
 * @param {Array<{chemin: string}>} trouvees
 * @param {Set<string>} acquittes
 * @returns {{bloque: boolean, nonAcquittes: Array<Object>}}
 */
export function verdict(trouvees, acquittes) {
  const nonAcquittes = trouvees.filter((r) => !acquittes.has(r.chemin));
  return { bloque: nonAcquittes.length > 0, nonAcquittes };
}

/* c8 ignore start — orchestration, éprouvée par la CI elle-même */

// `pathToFileURL` et non une concaténation : sous Windows, `process.argv[1]`
// vaut `C:\...` quand `import.meta.url` vaut `file:///C:/...`. Le test collé à
// la main échouerait toujours, et le contrôle passerait au vert sans avoir
// tourné — le défaut même qu'il surveille. Leçon de `plafond-innerhtml.mjs`.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cheminBase, cheminTete] = process.argv.slice(2);

  if (!cheminBase || !cheminTete) {
    console.error('Usage : node tools/regles-restrictives.mjs <base.json> <tete.json>');
    process.exit(1);
  }

  const lire = (chemin) => {
    try {
      return JSON.parse(readFileSync(chemin, 'utf-8'));
    } catch (erreur) {
      console.error(`Règles illisibles (${chemin}) : ${erreur.message}`);
      process.exit(1);
    }
  };

  let declares = '';
  try {
    declares = readFileSync('.github/regles-retirees.txt', 'utf-8');
  } catch {
    // Absent : aucun acquittement, ce qui est le cas normal.
  }

  const trouvees = restrictions(lire(cheminBase), lire(cheminTete));
  const { bloque, nonAcquittes } = verdict(trouvees, acquittements(declares));

  if (!bloque) {
    console.log(
      trouvees.length === 0
        ? 'Aucune restriction dans ce changement de règles.'
        : `${trouvees.length} restriction(s), toutes acquittées.`
    );
    process.exit(0);
  }

  for (const { chemin, forme } of nonAcquittes) {
    console.log(`  ${forme === 'retire' ? 'retiré ' : 'refusé '} ${chemin}`);
  }

  console.error(
    `\nCe changement RESTREINT les règles, et le pipeline publie les règles` +
      ` AVANT le site.\nPubliées d'abord, elles casseraient le client en` +
      ` production jusqu'à ce que le site suive.\n\n` +
      `Deux issues :\n` +
      `  — publier en deux temps : d'abord un client qui n'écrit plus ce champ,` +
      ` ensuite la règle qui l'interdit ;\n` +
      `  — si le retrait est sans risque, l'inscrire dans` +
      ` .github/regles-retirees.txt avec sa raison.\n`
  );
  process.exit(1);
}
/* c8 ignore stop */
