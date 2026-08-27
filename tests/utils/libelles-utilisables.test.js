/**
 * Un libellé ne doit pas pouvoir casser les budgets
 *
 * `category-budgets.js` se sert du **libellé** d'une catégorie comme clé de
 * l'objet écrit sous `categoryBudgets`. Or Realtime Database refuse
 * `.` `$` `#` `[` `]` `/` dans une clé, et le SDK lève à l'écriture.
 *
 * Une catégorie nommée « Eau/Gaz » ou « Frais 2.5 % » — rien d'exotique —
 * rendait donc **tous** les budgets insauvegardables, avec pour seul message
 * « Enregistrement impossible ». Rien ne reliait la panne au nom choisi, et
 * elle durait tant que la catégorie existait.
 *
 * L'identifiant était nettoyé depuis longtemps (`identifiantDepuisLibelle`) ;
 * le libellé, lui, n'était que `trim()`é. Et le contrôle vit dans
 * `libelleAcceptable`, que l'ajout n'utilisait pas — il refaisait ses propres
 * règles, ce qui est exactement ainsi qu'une vérification manque d'un côté
 * tout en existant de l'autre.
 */

import { describe, it, expect } from 'vitest';
import { libelleAcceptable } from '../../public/js/utils/renommage.js';

const seul = (libelle) => libelleAcceptable(libelle, [], -1);

describe('Les libellés que Realtime Database accepterait comme clé', () => {
  it.each([
    'Courses',
    'Frais bancaires',
    'Auto-école',
    'Café & thé',
    'Restaurant (midi)',
    'Énergie + eau',
    "Cadeaux d'anniversaire",
    'Vêtements, chaussures'
  ])('« %s » est accepté', (libelle) => {
    expect(seul(libelle).valide).toBe(true);
  });

  it('l\'espace et le tiret restent permis', () => {
    // Une classe de caractères mal écrite les rejetterait tous les deux, et la
    // moitié des noms courants avec.
    expect(seul('Frais bancaires').valide).toBe(true);
    expect(seul('Auto-école').valide).toBe(true);
  });
});

describe('Les libellés qui casseraient les budgets', () => {
  it.each([
    ['Eau/Gaz', '/'],
    ['Frais 2.5 %', '.'],
    ['Prix $', '$'],
    ['Liste [1]', '['],
    ['Fin]', ']'],
    ['Dièse #', '#'],
    ['Fin.', '.']
  ])('« %s » est refusé, et le message nomme « %s »', (libelle, caractere) => {
    const verdict = seul(libelle);
    expect(verdict.valide).toBe(false);
    expect(verdict.erreur).toContain(caractere);
  });

  it('un caractère de contrôle est refusé, et annoncé comme invisible', () => {
    // Au milieu du mot, et non en fin : `trim()` retire déjà tabulations et
    // sauts de ligne, mais pas les autres caractères de contrôle.
    const verdict = seul(`Cour${String.fromCharCode(1)}ses`);
    expect(verdict.valide).toBe(false);
    expect(verdict.erreur).toContain('invisible');
  });
});

describe('Les autres règles tiennent toujours', () => {
  it('un nom vide est refusé', () => {
    expect(seul('   ').erreur).toBe('Nom requis');
  });

  it('un nom trop long est refusé', () => {
    expect(seul('x'.repeat(31)).erreur).toContain('trop long');
  });

  it('un doublon est refusé, casse ignorée', () => {
    const existants = [{ label: 'Courses' }];
    expect(libelleAcceptable('courses', existants, -1).erreur).toBe('Ce nom existe déjà');
  });

  it('renommer une entrée en elle-même reste possible', () => {
    const existants = [{ label: 'Courses' }, { label: 'Maison' }];
    expect(libelleAcceptable('Courses', existants, 0).valide).toBe(true);
  });
});
