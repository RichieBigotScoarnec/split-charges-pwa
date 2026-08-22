import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
  const variables = feuilles.find(({ nom }) => nom === 'variables.css').source;

  it('sont servies par l\'application, sans passer par un tiers', () => {
    // Le <link> vers Google supprimait bien la mise en file, mais restait une
    // inclusion de code depuis une origine tierce, sans empreinte possible :
    // le CSS de Google varie selon le navigateur, `integrity` n'y est pas
    // applicable. CodeQL l'a signale, a juste titre.
    expect(html).not.toContain('fonts.googleapis.com');
    expect(variables).toMatch(/@font-face/);
    expect(variables).toMatch(/url\('\.\.\/fonts\//);
  });

  it('pointent vers des fichiers qui existent', () => {
    const declarees = [...variables.matchAll(/url\('\.\.\/(fonts\/[^']+)'\)/g)].map((m) => m[1]);
    const absentes = declarees.filter(
      (chemin) => !existsSync(resolve(RACINE, 'public', chemin))
    );

    expect(declarees.length).toBeGreaterThan(0);
    expect(absentes, `declarees mais absentes : ${absentes.join(', ')}`).toEqual([]);
  });

  it('ne declarent que les graisses reellement employees', () => {
    // DM Sans 300 etait telechargee sans qu'aucune regle ne l'utilise.
    const employees = new Set(
      feuilles.flatMap(({ source }) =>
        [...source.matchAll(/^\s*font-weight:\s*(\d{3});/gm)].map((m) => m[1])
      )
    );
    const declarees = new Set(
      [...variables.matchAll(/@font-face[^}]*?font-weight:\s*(\d{3});/gs)].map((m) => m[1])
    );

    for (const graisse of declarees) {
      expect(
        employees.has(graisse),
        `graisse ${graisse} declaree mais employee par aucune regle`
      ).toBe(true);
    }
    expect(declarees.size).toBeGreaterThan(0);
  });

  it('ne declarent pas d\'italique, qui n\'est employe nulle part', () => {
    const italiqueEmploye = feuilles.some(({ source }) => /font-style:\s*italic/.test(source));

    expect(italiqueEmploye).toBe(false);
  });

  it('laissent le texte s\'afficher pendant leur chargement', () => {
    // Sans `font-display: swap`, le texte reste invisible le temps du
    // telechargement -- le pire comportement possible sur connexion lente.
    const blocs = variables.match(/@font-face\s*\{[^}]*\}/g) || [];

    for (const bloc of blocs) {
      expect(bloc, 'un @font-face sans font-display: swap').toContain('font-display: swap');
    }
  });
});

describe('Les connexions anticipees', () => {
  it('ne visent aucune origine tierce, faute d\'en joindre une au demarrage', () => {
    // unpkg ne sert qu'a Leaflet, charge seulement si la carte s'ouvre ; les
    // polices sont desormais locales. Anticiper une connexion inutilisee
    // coutait DNS et TLS pour rien.
    const preconnects = [...html.matchAll(/rel="preconnect"\s+href="([^"]+)"/g)].map((m) => m[1]);

    expect(preconnects, `preconnect inutilise : ${preconnects.join(', ')}`).toEqual([]);
  });
});

describe('La politique de securite', () => {
  it('n\'autorise plus Google pour les styles ni les polices', () => {
    // Une origine qui n'est plus jointe n'a pas a rester autorisee.
    const csp = html.split('\n').find((l) => l.includes('Content-Security-Policy'));

    expect(csp).toContain("font-src 'self'");
    expect(csp).not.toContain('fonts.googleapis.com');
    expect(csp).not.toContain('fonts.gstatic.com');
  });
});
