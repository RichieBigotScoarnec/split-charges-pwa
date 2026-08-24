import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Une seule marque, partout
 *
 * L'application affichait l'emoji 💰 tandis que l'icône installée montrait un
 * cercle partagé : l'écran d'accueil promettait un produit, l'application en
 * ouvrait un autre. L'emoji posait deux problèmes de plus — il se dessine
 * autrement sur chaque plateforme, et il porte un « $ » sur la plupart
 * d'entre elles, pour une application en euros.
 *
 * La marque vit maintenant dans `tools/logo-fairsplit.svg`, dont les icônes
 * sont tirées et dont la page porte une copie inline. Deux copies d'une même
 * forme finissent toujours par diverger : ces contrôles les tiennent ensemble.
 */

const RACINE = process.cwd();
const page = readFileSync(resolve(RACINE, 'public/FairSplit.html'), 'utf8');
const source = readFileSync(resolve(RACINE, 'tools/logo-fairsplit.svg'), 'utf8');

/** Les tracés d'un SVG, dans l'ordre, espaces normalisés */
function traces(svg) {
  return [...svg.matchAll(/<path\s+d="([^"]+)"/g)].map(m => m[1].replace(/\s+/g, ' ').trim());
}

describe('La marque livrée', () => {
  it('la page ne montre plus d\'emoji en guise de logo', () => {
    // Le commentaire qui explique ce changement cite l'emoji : on ne cherche
    // donc pas son absence du fichier, mais son absence de ce qui s'affiche.
    const balisage = page.replace(/<!--[\s\S]*?-->/g, '');

    expect(balisage, 'un emoji sert encore de logo').not.toContain('💰');
  });

  it('le cercle partagé figure aux deux endroits où la marque paraît', () => {
    // L'écran d'attente, et le bandeau une fois connecté.
    expect((page.match(/class="marque"/g) || []).length).toBe(2);
  });

  it('la copie inline reprend exactement les tracés de la source', () => {
    // C'est par là qu'une divergence passerait : on corrige la source pour les
    // icônes, la page garde l'ancienne forme, et personne ne le voit — les
    // deux restent plausibles séparément.
    const attendus = traces(source);
    expect(attendus, 'la source ne porte pas deux tracés').toHaveLength(2);

    for (const trace of attendus) {
      expect(page, `tracé absent de la page : ${trace}`).toContain(trace);
    }
  });

  it('la marche est décalée : l\'application partage au prorata, pas en deux', () => {
    // Une séparation au centre dirait « ça partage ». Décalée, elle dit « pas
    // à parts égales » — ce que fait réellement FairSplit. Le jour où quelqu'un
    // recentrera la ligne, ce contrôle rappellera que c'était voulu.
    const abscisse = Number(traces(source)[0].match(/^M\s*([\d.]+)/)[1]);
    const centre = 24;

    expect(abscisse, 'la séparation est revenue au centre').toBeGreaterThan(centre + 1);
    expect(abscisse, 'la séparation est trop décalée pour se lire comme un partage')
      .toBeLessThan(centre + 6);
  });

  it('n\'écrit aucune couleur en dur : la marque suit le thème', () => {
    expect(source).toContain('currentColor');
    expect(source, 'une couleur figée ne suivrait pas le thème sombre').not.toMatch(/fill="#[0-9A-Fa-f]{3,8}"/);
  });
});

describe('Les icônes de l\'application', () => {
  it('sont toutes celles que le manifeste déclare', () => {
    const manifeste = JSON.parse(readFileSync(resolve(RACINE, 'public/manifest.json'), 'utf8'));

    for (const icone of manifeste.icons) {
      const chemin = resolve(RACINE, 'public', icone.src.replace(/^\.?\//, ''));
      expect(existsSync(chemin), `${icone.src} est déclarée et absente`).toBe(true);
    }
  });

  it('se refabriquent depuis la source, sur n\'importe quelle machine', () => {
    // L'ancien script était en PowerShell : il ne tournait que sous Windows, et
    // les icônes avaient fini par ne plus ressembler au logo de l'application.
    // Une source qu'on ne peut pas exécuter cesse de correspondre à ce qu'elle
    // a produit.
    expect(existsSync(resolve(RACINE, 'tools/generer-icones.mjs'))).toBe(true);
    expect(existsSync(resolve(RACINE, 'tools/generate-icons.ps1')),
      'le script Windows subsiste : deux sources pour une même icône').toBe(false);
  });
});
