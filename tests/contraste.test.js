import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Le contraste des textes, mesuré plutôt qu'affirmé.
 *
 * J'avais annoncé « 4,98:1, ça passe » après n'avoir mesuré que le thème
 * sombre — celui des captures qu'on m'envoyait. Le thème clair est pourtant le
 * thème par défaut, et le même libellé y tombait à 4,34:1, sous le seuil AA.
 *
 * Une mesure faite une fois à la main ne protège de rien : elle vieillit dès
 * qu'un jeton bouge, et personne ne la refait. Celle-ci est refaite à chaque
 * exécution, sur les jetons réellement livrés.
 *
 * Seuil retenu : 4,5:1, celui de CLAUDE.md pour le texte courant.
 */

const variables = readFileSync(resolve(process.cwd(), 'public/css/variables.css'), 'utf8');

/**
 * Luminance relative d'une couleur, selon WCAG 2.1
 * @param {string} hex - Couleur au format #RRGGBB
 * @returns {number}
 */
function luminance(hex) {
  const canal = (valeur) => {
    const c = valeur / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const v = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * canal(r) + 0.7152 * canal(v) + 0.0722 * canal(b);
}

/**
 * Rapport de contraste entre deux couleurs
 * @param {string} premier
 * @param {string} second
 * @returns {number}
 */
export function contraste(premier, second) {
  const a = luminance(premier);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Valeur d'un jeton, lue dans le bloc demandé
 *
 * Le thème sombre redéfinit une partie des jetons dans une media query : les
 * lire à la source évite de mesurer le thème clair en croyant faire l'autre.
 *
 * @param {string} nom - Nom du jeton, sans les tirets initiaux
 * @param {'clair'|'sombre'} theme
 * @returns {string} Couleur au format #RRGGBB
 */
function jeton(nom, theme) {
  const debut = theme === 'sombre'
    ? variables.indexOf('@media (prefers-color-scheme: dark)')
    : variables.indexOf(':root {');
  const bloc = variables.slice(debut, theme === 'sombre' ? undefined : variables.indexOf('@media'));

  const trouve = bloc.match(new RegExp(`--${nom}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!trouve) throw new Error(`Jeton --${nom} introuvable en thème ${theme}`);
  return trouve[1].toUpperCase();
}

/** Les surfaces sur lesquelles du texte est réellement posé */
const SURFACES = ['dark-bg', 'card-bg', 'elevated-bg'];

describe('Contraste des textes, thème clair', () => {
  /**
   * C'est le thème par défaut : sans préférence système, c'est lui qui
   * s'affiche. Il avait échappé à ma mesure.
   */
  it('le texte principal tient largement sur chaque surface', () => {
    for (const surface of SURFACES) {
      const mesure = contraste(jeton('text-primary', 'clair'), jeton(surface, 'clair'));
      expect(mesure, `text-primary sur ${surface} : ${mesure.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('le texte secondaire tient sur chaque surface', () => {
    // Il portait les libellés de la grille de catégories à 4,34:1 sur
    // --elevated-bg. Sous le seuil, donc à corriger — et non à arrondir.
    for (const surface of SURFACES) {
      const mesure = contraste(jeton('text-secondary', 'clair'), jeton(surface, 'clair'));
      expect(mesure, `text-secondary sur ${surface} : ${mesure.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Contraste des textes, thème sombre', () => {
  it('le texte principal tient sur chaque surface', () => {
    for (const surface of SURFACES) {
      const mesure = contraste(jeton('text-primary', 'sombre'), jeton(surface, 'sombre'));
      expect(mesure, `text-primary sur ${surface} : ${mesure.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('le texte secondaire tient sur chaque surface', () => {
    for (const surface of SURFACES) {
      const mesure = contraste(jeton('text-secondary', 'sombre'), jeton(surface, 'sombre'));
      expect(mesure, `text-secondary sur ${surface} : ${mesure.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Le calcul lui-même', () => {
  // Un mesureur faux validerait n'importe quoi en silence : on l'étalonne sur
  // des valeurs dont le rapport est connu.
  it('noir sur blanc vaut 21:1', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('une couleur avec elle-même vaut 1:1', () => {
    expect(contraste('#5B6980', '#5B6980')).toBeCloseTo(1, 5);
  });

  it('l\'ordre des couleurs est sans effet', () => {
    expect(contraste('#5B6980', '#F1F5F9')).toBeCloseTo(contraste('#F1F5F9', '#5B6980'), 5);
  });
});

describe('Le palier « muted »', () => {
  /**
   * Ce cas était un CONSTAT ; il est devenu une EXIGENCE.
   *
   * Il consignait un écart assumé : `--text-muted` mesurait 2,42:1, et le
   * porter à 4,5 devait le rendre « indiscernable de `--text-secondary` ».
   * Le cas disait lui-même quoi faire le jour où la décision serait prise :
   * le remplacer par une vraie exigence. C'est fait.
   *
   * Ce qui a emporté la décision, c'est la mesure. #7A6A5B franchit le seuil
   * en gardant 32 % de luminance de plus que `--text-secondary` : les deux
   * paliers restent séparés à l'œil. La crainte n'était pas fondée.
   *
   * Et l'usage l'imposait : ce jeton portait les libellés de section, la
   * phrase qui explique le solde et le chevron d'une commande. Du texte qu'on
   * lit — pas de l'ornement.
   */
  it('tient le seuil AA sur chaque surface, dans les deux thèmes', () => {
    for (const theme of ['clair', 'sombre']) {
      for (const surface of SURFACES) {
        const mesure = contraste(jeton('text-muted', theme), jeton(surface, theme));
        expect(mesure, `text-muted sur ${surface} en thème ${theme} : ${mesure.toFixed(2)}:1`)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('reste un palier : plus clair que le texte secondaire', () => {
    // Sans ce cas, « corriger » le contraste en alignant `--text-muted` sur
    // `--text-secondary` passerait — et supprimerait le palier pour de bon,
    // c'est-à-dire ferait exactement ce que l'ancienne décision redoutait.
    // En thème clair, où les trois paliers existent réellement.
    const surface = jeton('card-bg', 'clair');
    const discret = contraste(jeton('text-muted', 'clair'), surface);
    const secondaire = contraste(jeton('text-secondary', 'clair'), surface);

    expect(discret, 'le palier discret doit rester moins contrasté que le secondaire')
      .toBeLessThan(secondaire);
    expect(secondaire - discret, 'et l\'écart doit rester perceptible')
      .toBeGreaterThan(0.5);
  });
});
