/**
 * Fabrique les icônes de l'application à partir de la marque
 *
 * `tools/logo-fairsplit.svg` est la source unique. Les quatre PNG que la page
 * déclare en sont tirés ici, ce qui garantit qu'ils ne peuvent pas diverger de
 * ce que l'application affiche à l'écran.
 *
 * Il existait `generate-icons.ps1`, en PowerShell : il ne tournait que sous
 * Windows, et les icônes livrées ne ressemblaient déjà plus au logo de
 * l'application — l'écran d'accueil montrait un cercle partagé, l'application
 * un emoji de sac d'argent. Une source qu'on ne peut pas exécuter finit
 * toujours par ne plus correspondre à ce qu'elle a produit.
 *
 * Usage :  node tools/generer-icones.mjs
 *
 * Deux formats, comme l'exige le manifeste :
 *  - « any » : la marque occupe la place qu'elle peut, le fond va aux bords ;
 *  - « maskable » : Android rogne l'icône en cercle, en losange ou en écusson
 *    selon le lanceur. Il garantit seulement les 80 % centraux — la zone dite
 *    sûre. La marque y est donc plus petite, sans quoi le rognage l'ampute.
 */

import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, '..');

/** Les deux extrémités du dégradé de fond — celles de `--primary-color` */
const DEGRADE = { debut: '#4F46E5', fin: '#6366F1' };

/**
 * Le dégradé de fond, en carré arrondi
 *
 * Le rayon vaut 22,5 % du côté, la proportion qu'emploient iOS et Android pour
 * leurs icônes : plus carré, l'icône jure entre les autres ; plus rond, elle
 * perd sa surface utile.
 *
 * @param {number} taille - Côté, en pixels
 * @param {boolean} carreArrondi - false pour un fond plein (maskable)
 * @returns {Buffer}
 */
function fond(taille, carreArrondi) {
  const rayon = carreArrondi ? Math.round(taille * 0.225) : 0;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}">
    <defs>
      <linearGradient id="d" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${DEGRADE.debut}"/>
        <stop offset="1" stop-color="${DEGRADE.fin}"/>
      </linearGradient>
    </defs>
    <rect width="${taille}" height="${taille}" rx="${rayon}" fill="url(#d)"/>
  </svg>`);
}

/**
 * La marque, en blanc, à la taille demandée
 *
 * `currentColor` n'a pas de sens hors d'un document : on le remplace par du
 * blanc, la seule couleur qui tienne sur ce dégradé.
 *
 * Aucune taille ici : le SVG n'en porte pas, seulement un `viewBox`. C'est
 * `density` puis `resize`, au moment du rendu, qui décident de la finesse —
 * fixer une taille dans le balisage la doublerait sans rien gagner.
 *
 * @returns {Buffer}
 */
function marque() {
  const source = readFileSync(resolve(ICI, 'logo-fairsplit.svg'), 'utf8');
  return Buffer.from(source.replace(/currentColor/g, '#FFFFFF'));
}

/**
 * Écrit une icône
 *
 * @param {string} nom - Nom du fichier, sous public/
 * @param {number} taille
 * @param {number} part - Part du côté qu'occupe la marque
 * @param {boolean} carreArrondi
 * @returns {Promise<void>}
 */
async function ecrire(nom, taille, part, carreArrondi) {
  const cote = Math.round(taille * part);
  const decalage = Math.round((taille - cote) / 2);

  const dessin = await sharp(marque(), { density: 400 })
    .resize(cote, cote)
    .png()
    .toBuffer();

  await sharp(fond(taille, carreArrondi))
    .composite([{ input: dessin, top: decalage, left: decalage }])
    .png()
    .toFile(resolve(RACINE, 'public', nom));

  console.log(`✓ ${nom} — ${taille}px, marque à ${Math.round(part * 100)} %`);
}

// « any » : la marque remplit 78 % du carré, comme sur les icônes du système.
// « maskable » : 56 %, pour tenir dans la zone sûre quel que soit le rognage.
await ecrire('icon-192.png', 192, 0.78, true);
await ecrire('icon-512.png', 512, 0.78, true);
await ecrire('icon-192-maskable.png', 192, 0.56, false);
await ecrire('icon-512-maskable.png', 512, 0.56, false);
