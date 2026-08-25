import { describe, it, expect } from 'vitest';
import {
  lignesDeVitest,
  lignesTraversees,
  apportDuNavigateur
} from '../tools/couverture-lignes.mjs';

/**
 * Le calcul de couverture, éprouvé comme le reste
 *
 * Un taux de couverture ne se vérifie pas à l'œil : c'est précisément le genre
 * de chiffre qu'on accepte parce qu'il ressemble à ce qu'on attendait. Je m'y
 * suis trompé deux fois, et chaque fois l'erreur rendait un résultat crédible :
 *
 *   — additionner les compteurs des deux outils, dont les cartes ne se
 *     correspondent pas : 60,5 %, l'apport du navigateur étant jeté ;
 *   — bâtir le dénominateur sur la carte de `v8-to-istanbul`, qui couvre le
 *     fichier entier : 17 623 lignes « exécutables » pour 17 628 lignes de
 *     fichier, soit 87 % de rien.
 *
 * Ces contrôles fixent les deux règles qui séparent une mesure d'un chiffre.
 */

/** Fabrique un relevé Istanbul minimal */
function releve(instructions) {
  const statementMap = {};
  const s = {};

  instructions.forEach(([debut, fin, compte], i) => {
    statementMap[i] = { start: { line: debut }, end: { line: fin } };
    s[i] = compte;
  });

  return { statementMap, s };
}

describe('lignesDeVitest', () => {

  it('rattache une instruction à la ligne où elle commence', () => {
    // La définition d'Istanbul. Marquer tout l'intervalle ferait compter les
    // lignes vides d'une instruction étalée sur quatre lignes.
    const { executables, atteintes } = lignesDeVitest(releve([[10, 13, 1]]));

    expect([...executables]).toEqual([10]);
    expect([...atteintes]).toEqual([10]);
  });

  it('sépare ce qui est exécutable de ce qui a été exécuté', () => {
    const { executables, atteintes } = lignesDeVitest(releve([[5, 5, 3], [9, 9, 0]]));

    expect([...executables].sort((a, b) => a - b)).toEqual([5, 9]);
    expect([...atteintes]).toEqual([5]);
  });

  it('ne tombe pas sur un relevé vide ou absent', () => {
    expect(lignesDeVitest(undefined).executables.size).toBe(0);
    expect(lignesDeVitest({}).executables.size).toBe(0);
  });
});

describe('lignesTraversees', () => {

  it('retient tout l\'intervalle d\'une instruction exécutée', () => {
    // Le navigateur découpe autrement que l'arbre syntaxique : garder
    // l'intervalle est ce qui permet de rattraper les lignes que Vitest
    // rattache ailleurs.
    expect([...lignesTraversees(releve([[10, 12, 1]]))].sort((a, b) => a - b))
      .toEqual([10, 11, 12]);
  });

  it('un intervalle non exécuté l\'emporte sur celui qui le contient', () => {
    // Sans cette priorité, une fonction appelée une fois compterait tout son
    // corps comme exécuté, `else` compris — la mesure dirait alors qu'une
    // branche jamais prise l'a été.
    const vues = lignesTraversees(releve([
      [10, 20, 1],  // le corps de la fonction, appelée
      [14, 16, 0]   // la branche non prise, à l'intérieur
    ]));

    expect(vues.has(13)).toBe(true);
    expect(vues.has(14)).toBe(false);
    expect(vues.has(15)).toBe(false);
    expect(vues.has(16)).toBe(false);
    expect(vues.has(17)).toBe(true);
  });

  it('ignore une position illisible plutôt que de tout perdre', () => {
    const vues = lignesTraversees({
      statementMap: { 0: { start: {} }, 1: { start: { line: 7 }, end: { line: 7 } } },
      s: { 0: 1, 1: 1 }
    });

    expect([...vues]).toEqual([7]);
  });
});

describe('apportDuNavigateur', () => {

  it('ne retient que les lignes que Vitest tient pour du code', () => {
    // C'est ce filtre, et lui seul, qui sépare une couverture d'un compte de
    // lignes de fichier. Sans lui, le dénominateur incluait la JSDoc.
    const reconnues = new Set([10, 12]);
    const apport = apportDuNavigateur(releve([[10, 13, 1]]), reconnues);

    // 11 et 13 sont traversées mais ne sont pas du code : elles sortent.
    expect([...apport].sort((a, b) => a - b)).toEqual([10, 12]);
  });

  it('n\'ajoute rien quand le navigateur n\'a rien exécuté', () => {
    expect(apportDuNavigateur(releve([[10, 13, 0]]), new Set([10, 12])).size).toBe(0);
  });

  it('n\'invente pas de ligne quand Vitest n\'en reconnaît aucune', () => {
    expect(apportDuNavigateur(releve([[10, 13, 1]]), new Set()).size).toBe(0);
  });
});
