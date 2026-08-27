/**
 * Les règles acceptent tous les chemins que l'application écrit
 *
 * `database.rules.json` ferme chaque niveau par un fourre-tout
 * `"$autre": { ".validate": false }` — refus par défaut, et c'est la bonne
 * valeur par défaut. Le prix en est qu'un champ ajouté dans le code, mais
 * oublié dans les règles, est refusé par le serveur.
 *
 * C'est arrivé, et c'est passé inaperçu pendant des semaines :
 * `reconduction.js:83` réserve le mois cible en écrivant
 * `periods/{mois}/reconductedFrom`, une clé qui n'était déclarée nulle part.
 * Le serveur refusait (401, mesuré contre le moteur réel), la transaction
 * échouait, et les charges fixes n'étaient jamais reconduites — le loyer ne
 * revenait pas, chaque mois, avec à l'écran une promesse de rattrapage que la
 * règle rendait impossible à tenir.
 *
 * Rien ne pouvait le voir : le test unitaire de la reconduction remplace
 * Firebase par des doubles, et le seul test end-to-end qui écrit ce champ
 * porte `test.skip(!MOT_DE_PASSE)` — la CI n'a pas ce secret, par conception.
 *
 * Ce test-ci ne parle à aucun serveur : il compare le code aux règles, à plat.
 * Il ne dit pas si une valeur est acceptable, seulement si le *chemin* est
 * déclaré. C'est exactement ce qui manquait.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = new URL('..', import.meta.url).pathname;
const REGLES = JSON.parse(readFileSync(join(RACINE, 'database.rules.json'), 'utf-8')).rules;

/** Tous les fichiers JS livrés */
function sources(dossier, trouves = []) {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) sources(chemin, trouves);
    else if (entree.endsWith('.js')) trouves.push(chemin);
  }
  return trouves;
}

/**
 * Les chemins de base écrits en dur dans le code
 *
 * `getDataPath('x')` comme `dbSet('x', …)` visent tous deux `{racine}/x`.
 */
function cheminsEcrits() {
  const motif = /(?:getDataPath|dbSet|dbUpdate|dbPush)\(\s*([`'"])([^`'"]*)\1/g;
  const trouves = new Set();

  for (const fichier of sources(join(RACINE, 'public/js'))) {
    const source = readFileSync(fichier, 'utf-8');
    for (const [, , chemin] of source.matchAll(motif)) {
      if (chemin.trim()) trouves.add(chemin);
    }
  }
  return [...trouves].sort();
}

/** Un segment est-il une interpolation, donc n'importe quelle clé ? */
const estVariable = (segment) => /^\$\{.*\}$/.test(segment);

/** Le nœud de règles refuse-t-il tout ? */
const refuseTout = (noeud) => !noeud || noeud['.validate'] === false;

/**
 * Le chemin est-il déclaré sous cet espace de règles ?
 *
 * Un segment interpolé peut valoir n'importe quelle clé : on essaie chaque
 * enfant déclaré, et il suffit qu'une descente aboutisse.
 *
 * @param {Object} noeud - Nœud de règles courant
 * @param {Array<string>} segments - Ce qu'il reste du chemin
 * @returns {boolean}
 */
function cheminDeclare(noeud, segments) {
  if (refuseTout(noeud)) return false;
  if (segments.length === 0) return true;

  const [tete, ...reste] = segments;
  const enfants = Object.keys(noeud).filter(cle => !cle.startsWith('.'));

  if (!estVariable(tete)) {
    if (Object.hasOwn(noeud, tete)) return cheminDeclare(noeud[tete], reste);
    // Pas de clé nommée : reste le fourre-tout, s'il en existe un d'ouvert.
    const joker = enfants.find(cle => cle.startsWith('$'));
    return joker ? cheminDeclare(noeud[joker], reste) : false;
  }

  // Segment interpolé : n'importe quel enfant peut convenir.
  return enfants.some(cle => cheminDeclare(noeud[cle], reste));
}

describe('Chaque chemin écrit par l\'application est déclaré dans les règles', () => {
  const chemins = cheminsEcrits();

  it('le relevé des chemins n\'est pas vide', () => {
    // Sans cette garde, une expression régulière cassée rendrait le fichier
    // entier silencieusement vert.
    expect(chemins.length).toBeGreaterThan(8);
  });

  it.each(['household', 'sandbox'])('espace %s', (espace) => {
    const refuses = chemins.filter(
      chemin => !cheminDeclare(REGLES[espace], chemin.split('/').filter(Boolean))
    );

    expect(refuses).toEqual([]);
  });

  it('les deux clés de niveau période que le code écrit sont déclarées', () => {
    // Nommément, parce que ce sont elles qui manquaient, et que leur absence
    // ne coûtait rien de visible avant le premier jour d'un mois neuf.
    for (const espace of ['household', 'sandbox']) {
      const periode = REGLES[espace].periods.$periode;
      expect(Object.keys(periode)).toContain('reconductedFrom');
      expect(Object.keys(periode)).toContain('shareMode');
    }
  });

  it('un chemin non déclaré est bien détecté', () => {
    // Le test doit savoir échouer : sans cela il ne prouve rien.
    expect(cheminDeclare(REGLES.household, ['periods', '2026-09', 'inventé'])).toBe(false);
    expect(cheminDeclare(REGLES.household, ['periods', '2026-09', 'reconductedFrom'])).toBe(true);
  });
});
