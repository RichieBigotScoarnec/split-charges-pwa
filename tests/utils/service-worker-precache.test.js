import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

/**
 * La liste de précache, comparée au contenu réel de `public/`
 *
 * Elle est tenue à la main, et elle avait décroché : douze modules
 * manquaient, dont `utils/calculations.js` — le moteur du solde, importé
 * statiquement par `summary.js`. Hors ligne, cette requête échouait et le
 * graphe d'imports s'effondrait : l'application ne démarrait pas du tout,
 * alors même qu'elle s'annonce installable.
 *
 * Une liste manuelle dérive dès qu'un fichier est ajouté sans y penser. Ce
 * test la confronte au disque : c'est le seul moyen d'empêcher la dérive de
 * recommencer, puisque rien à l'exécution ne la signale — le défaut ne se voit
 * qu'hors ligne, c'est-à-dire jamais pendant le développement.
 */

const RACINE = resolve(process.cwd(), 'public');
const sw = readFileSync(resolve(RACINE, 'sw.js'), 'utf8');

/** Entrées déclarées dans STATIC_ASSETS */
const declarees = new Set(
  sw
    .slice(sw.indexOf('const STATIC_ASSETS = ['), sw.indexOf('];', sw.indexOf('const STATIC_ASSETS = [')))
    .match(/'\.\/([^']+)'/g)
    ?.map(entree => entree.slice(3, -1)) ?? []
);

/**
 * Fichiers publiés correspondant à une extension
 * @param {RegExp} motif - Extension recherchée
 * @returns {string[]} Chemins relatifs à public/
 */
function fichiersPublies(motif) {
  const trouves = [];
  const explorer = (dossier) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = resolve(dossier, entree.name);
      if (entree.isDirectory()) explorer(chemin);
      else if (motif.test(entree.name)) trouves.push(relative(RACINE, chemin).replace(/\\/g, '/'));
    }
  };
  explorer(RACINE);
  return trouves;
}

describe('Précache du service worker', () => {
  it('couvre tous les modules JavaScript publiés', () => {
    // Le service worker lui-même n'a pas à se mettre en cache.
    const attendus = fichiersPublies(/\.js$/).filter(f => f !== 'sw.js');
    const manquants = attendus.filter(f => !declarees.has(f));

    expect(manquants, `absents de STATIC_ASSETS : ${manquants.join(', ')}`).toEqual([]);
  });

  it('couvre toutes les feuilles de style publiées', () => {
    const manquants = fichiersPublies(/\.css$/).filter(f => !declarees.has(f));

    expect(manquants, `absents de STATIC_ASSETS : ${manquants.join(', ')}`).toEqual([]);
  });

  it('couvre la page, le manifeste et les icônes', () => {
    const attendus = ['FairSplit.html', 'manifest.json', ...fichiersPublies(/^icon-.*\.png$/)];
    const manquants = attendus.filter(f => !declarees.has(f));

    expect(manquants, `absents de STATIC_ASSETS : ${manquants.join(', ')}`).toEqual([]);
  });

  it('ne déclare rien qui n\'existe pas', () => {
    // `cache.addAll` échoue en bloc : une seule entrée fantôme et rien n'est
    // mis en cache, sans que l'application s'en aperçoive.
    const tous = new Set([
      ...fichiersPublies(/\.(js|css|png|html|json)$/)
    ]);
    const fantomes = [...declarees].filter(f => !tous.has(f));

    expect(fantomes, `déclarés mais absents du disque : ${fantomes.join(', ')}`).toEqual([]);
  });
});

describe('Repli hors ligne', () => {
  it('ne sert la page qu\'à une navigation', () => {
    // Le repli s'appliquait à toute requête : un module absent du cache
    // recevait du HTML, que le navigateur tentait d'interpréter comme du
    // JavaScript. L'erreur parlait de syntaxe, jamais du fichier manquant.
    const replis = sw.match(/caches\.match\('\.\/FairSplit\.html'\)/g) || [];
    const gardes = sw.match(/request\.mode === 'navigate'/g) || [];

    expect(replis.length).toBeGreaterThan(0);
    expect(gardes.length).toBe(replis.length);
  });
});
