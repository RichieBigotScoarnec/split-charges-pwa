import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Ce que la page va chercher avant de s'afficher
 *
 * Sur une connexion mobile à forte latence, ce n'est pas le poids qui coûte,
 * c'est le nombre d'allers-retours — et surtout leur mise en file. Un `@import`
 * en tête de la première feuille imposait la chaîne : HTML, puis
 * variables.css, puis le CSS de Google Fonts, puis les fichiers de police.
 * Quatre attentes l'une après l'autre, chacune bloquant le rendu, avant même
 * que Firebase ne commence.
 *
 * Ces contrôles portent sur le balisage livré. Ils ne mesurent pas un temps de
 * chargement — seul un vrai appareil le peut — mais ils empêchent la mise en
 * file de revenir, et c'est elle qui coûtait.
 */

const RACINE = process.cwd();
const html = readFileSync(resolve(RACINE, 'public/FairSplit.html'), 'utf8');

/** Chaque feuille de style livrée, avec son nom */
const feuilles = readdirSync(resolve(RACINE, 'public/css'))
  .filter((nom) => nom.endsWith('.css'))
  .map((nom) => ({ nom, source: readFileSync(resolve(RACINE, 'public/css', nom), 'utf8') }));

describe('Les feuilles de style ne mettent rien en file', () => {
  it('aucune ne charge de ressource distante par @import', () => {
    // Le cas trouvé : `@import url('https://fonts.googleapis.com/…')` en
    // deuxième ligne de variables.css, la première feuille de la page.
    const fautives = feuilles
      .filter(({ source }) => /@import\s+url\(\s*['"]?https?:/i.test(source))
      .map(({ nom }) => nom);

    expect(fautives, `@import distant dans : ${fautives.join(', ')}`).toEqual([]);
  });
});

describe('Les polices', () => {
  /** La balise qui charge les polices, s'il y en a une */
  const lienPolices = html
    .split('\n')
    .find((ligne) => ligne.includes('fonts.googleapis.com') && ligne.includes('rel="stylesheet"'));

  it('sont chargées depuis le document, en parallèle des feuilles', () => {
    expect(lienPolices, 'aucun <link> de polices dans le document').toBeTruthy();
  });

  it('ne demandent que les graisses réellement employées', () => {
    // DM Sans 300 était téléchargée sans qu'aucune règle ne l'utilise.
    const graissesUtilisees = new Set(
      feuilles.flatMap(({ source }) =>
        [...source.matchAll(/font-weight:\s*(\d{3})/g)].map((m) => m[1])
      )
    );
    const graissesDemandees = new Set(
      [...lienPolices.matchAll(/[,@](\d{3})[;&"]/g)].map((m) => m[1])
    );

    for (const demandee of graissesDemandees) {
      expect(
        graissesUtilisees.has(demandee),
        `graisse ${demandee} demandée mais employée par aucune règle`
      ).toBe(true);
    }
    expect(graissesDemandees.size).toBeGreaterThan(0);
  });

  it('ne demandent pas d\'italique, qui n\'est employé nulle part', () => {
    const italiqueEmploye = feuilles.some(({ source }) => /font-style:\s*italic/.test(source));

    expect(italiqueEmploye).toBe(false);
    expect(lienPolices).not.toContain('ital');
  });

  it('laissent le texte s\'afficher pendant leur chargement', () => {
    // Sans `display=swap`, le texte reste invisible le temps du téléchargement
    // — le pire comportement possible sur une connexion lente.
    expect(lienPolices).toContain('display=swap');
  });
});

describe('Les connexions anticipées', () => {
  it('ne visent que des origines employées au démarrage', () => {
    // unpkg ne sert qu'à Leaflet, chargé seulement si la carte s'ouvre :
    // anticiper sa connexion coûtait DNS et TLS pour rien.
    const preconnects = [...html.matchAll(/rel="preconnect"\s+href="([^"]+)"/g)].map((m) => m[1]);

    expect(preconnects).not.toContain('https://unpkg.com');
    expect(preconnects).toContain('https://fonts.gstatic.com');
  });
});
