import { describe, it, expect } from 'vitest';
import { parseMontant, parseMontantOu } from '../../public/js/utils/montant.js';

describe('parseMontant', () => {
  it('lit un montant à la virgule', () => {
    // Le défaut d'origine : `parseFloat('12,50')` rend 12, les centimes
    // disparaissaient en silence.
    expect(parseMontant('12,50')).toBe(12.5);
  });

  it('lit un montant au point, comme avant', () => {
    expect(parseMontant('12.50')).toBe(12.5);
  });

  it('lit un entier', () => {
    expect(parseMontant('800')).toBe(800);
  });

  it('accepte un séparateur de milliers en espace, avec virgule décimale', () => {
    // `parseFloat('2 450,50')` rendait 2. Sur un salaire, la part du mois
    // entière en découle.
    expect(parseMontant('2 450,50')).toBe(2450.5);
  });

  it('accepte l\'espace insécable et la fine insécable', () => {
    // Ce que produit `Intl.NumberFormat` en français, donc ce qu'on recopie
    // depuis l'écran de l'application elle-même.
    expect(parseMontant('2 450,50')).toBe(2450.5);
    expect(parseMontant('2 450,50')).toBe(2450.5);
  });

  it('point pour les milliers et virgule décimale', () => {
    expect(parseMontant('1.234,56')).toBe(1234.56);
  });

  it('virgule pour les milliers et point décimal', () => {
    expect(parseMontant('1,234.56')).toBe(1234.56);
  });

  it('garde les décimales sans partie entière', () => {
    expect(parseMontant(',5')).toBe(0.5);
    expect(parseMontant('.5')).toBe(0.5);
  });

  it('accepte zéro', () => {
    expect(parseMontant('0')).toBe(0);
    expect(parseMontant('0,00')).toBe(0);
  });

  it('laisse passer un négatif, que la validation refusera', () => {
    // Le rôle de cette fonction est de lire, pas de juger : `validateAmount`
    // porte le message « ne peut pas être négatif ».
    expect(parseMontant('-5,50')).toBe(-5.5);
  });

  it('ignore les espaces autour', () => {
    expect(parseMontant('  12,50  ')).toBe(12.5);
  });

  it('rend NaN sur du texte', () => {
    expect(parseMontant('abc')).toBeNaN();
  });

  it('refuse ce que parseFloat acceptait à moitié', () => {
    // `parseFloat('12abc')` rendait 12. Sur un montant, mieux vaut refuser que
    // deviner : la personne voit son erreur au lieu de la découvrir au bilan.
    expect(parseMontant('12abc')).toBeNaN();
    expect(parseMontant('12,50€')).toBeNaN();
  });

  it('refuse deux séparateurs décimaux', () => {
    expect(parseMontant('1.2.3')).toBeNaN();
    expect(parseMontant('1,2,3')).toBeNaN();
  });

  it('refuse la notation scientifique', () => {
    expect(parseMontant('1e3')).toBeNaN();
  });

  it('rend NaN sur le vide et l\'absence', () => {
    expect(parseMontant('')).toBeNaN();
    expect(parseMontant('   ')).toBeNaN();
    expect(parseMontant(null)).toBeNaN();
    expect(parseMontant(undefined)).toBeNaN();
  });

  it('laisse un nombre intact', () => {
    expect(parseMontant(12.5)).toBe(12.5);
    expect(parseMontant(0)).toBe(0);
  });

  it('rend NaN sur un nombre non fini', () => {
    expect(parseMontant(Infinity)).toBeNaN();
    expect(parseMontant(NaN)).toBeNaN();
  });
});

describe('parseMontantOu', () => {
  it('rend la valeur lue quand elle existe', () => {
    expect(parseMontantOu('12,50')).toBe(12.5);
  });

  it('rend le repli quand la saisie n\'est pas un nombre', () => {
    expect(parseMontantOu('', 0)).toBe(0);
    expect(parseMontantOu('abc', 0)).toBe(0);
    expect(parseMontantOu(null, 3000)).toBe(3000);
  });

  it('ne confond pas un zéro saisi avec un champ vide', () => {
    expect(parseMontantOu('0', 3000)).toBe(0);
  });
});
