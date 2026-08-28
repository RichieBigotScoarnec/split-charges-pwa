import { describe, it, expect } from 'vitest';
import {
  normaliserSaisieMontant,
  montantCorrespond
} from '../../public/js/utils/recherche-montant.js';

/**
 * Chercher un montant, tel qu'on le lit et tel qu'on le tape
 *
 * La recherche versait le montant brut parmi les champs de texte :
 * `String(charge.amount)`. Une charge de 12,50 € y entrait sous la forme
 * « 12.5 » — si bien que ni « 12,50 » (ce que l'écran affiche) ni « 12.50 »
 * (la même somme, au point) ne la trouvaient. Et la comparaison par
 * sous-chaîne rendait l'inverse aussi faux : « 17 » trouvait 1 171,01.
 *
 * Signalé à l'usage.
 */

describe('Ce qui est un montant, et ce qui n\'en est pas', () => {
  it('accepte les deux séparateurs décimaux', () => {
    expect(normaliserSaisieMontant('12,50')).toBe('12.50');
    expect(normaliserSaisieMontant('12.50')).toBe('12.50');
  });

  it('ignore les séparateurs de milliers, y compris ceux que l\'écran produit', () => {
    // `formatCurrency` pose une espace insécable étroite (U+202F) que personne
    // ne tape : recopier le montant lu à l'écran doit fonctionner.
    expect(normaliserSaisieMontant('1 171,01')).toBe('1171.01');
    expect(normaliserSaisieMontant('1 171,01')).toBe('1171.01');
    expect(normaliserSaisieMontant('1 171,01')).toBe('1171.01');
  });

  it('supporte le symbole recopié avec le montant', () => {
    expect(normaliserSaisieMontant('12,50 €')).toBe('12.50');
  });

  it('rend null sur ce qui n\'est pas un montant — le texte reste au texte', () => {
    expect(normaliserSaisieMontant('courses')).toBe(null);
    expect(normaliserSaisieMontant('12 août')).toBe(null);
    expect(normaliserSaisieMontant('')).toBe(null);
    expect(normaliserSaisieMontant(null)).toBe(null);
    // Trois décimales ne sont pas une somme en euros.
    expect(normaliserSaisieMontant('12,505')).toBe(null);
    // Deux séparateurs non plus.
    expect(normaliserSaisieMontant('12,5,0')).toBe(null);
  });
});

describe('Les cas signalés à l\'usage', () => {
  it('« 12,50 » et « 12.50 » trouvent tous deux une charge de 12,5', () => {
    // La base garde 12.5, l'écran écrit 12,50 : l'utilisateur ne devrait pas
    // avoir à savoir laquelle des deux écritures il interroge.
    expect(montantCorrespond(12.5, '12,50')).toBe(true);
    expect(montantCorrespond(12.5, '12.50')).toBe(true);
    expect(montantCorrespond(12.5, '12,5')).toBe(true);
    expect(montantCorrespond(12.5, '12.5')).toBe(true);
  });

  it('le montant recopié de l\'écran, espace comprise', () => {
    expect(montantCorrespond(1171.01, '1\u202F171,01')).toBe(true);   // tel que l'écran l'écrit
    expect(montantCorrespond(1171.01, '1 171,01')).toBe(true);        // tel qu'on le tape
    expect(montantCorrespond(1171.01, '1171,01')).toBe(true);
    expect(montantCorrespond(1171.01, '1171.01')).toBe(true);
  });

  it('TÉMOIN NÉGATIF : la comparaison de texte répondait faux dans les deux sens', () => {
    // Ce que faisait l'ancien code, reproduit ici : `String(12.5)` vaut « 12.5 »,
    // et c'est dans cette chaîne qu'on cherchait la requête.
    const commeAvant = (montant, requete) => String(montant).includes(requete);

    // Vide sur ce qui existe…
    expect(commeAvant(12.5, '12,50')).toBe(false);
    expect(commeAvant(12.5, '12.50')).toBe(false);
    expect(commeAvant(1171.01, '1\u202F171,01')).toBe(false);

    // …et faux sur ce qui n'a rien à voir.
    expect(commeAvant(1171.01, '17')).toBe(true);
    expect(montantCorrespond(1171.01, '17')).toBe(false);
  });
});

describe('Ce qu\'une saisie sans décimales désigne', () => {
  it('les euros : « 12 » trouve 12,00 et 12,50', () => {
    expect(montantCorrespond(12, '12')).toBe(true);
    expect(montantCorrespond(12.5, '12')).toBe(true);
    expect(montantCorrespond(12.99, '12')).toBe(true);
  });

  it('mais jamais 120,00, qui est un autre montant', () => {
    // Un préfixe ramènerait 120, 1200, 12000 : chercher un ordre de grandeur
    // est légitime, ramener tout ce qui commence pareil ne l'est pas.
    expect(montantCorrespond(120, '12')).toBe(false);
    expect(montantCorrespond(1200, '12')).toBe(false);
  });

  it('« 1171 » trouve 1 171,01', () => {
    expect(montantCorrespond(1171.01, '1171')).toBe(true);
  });
});

describe('Les bords', () => {
  it('avec décimales, la comparaison se fait au centime', () => {
    expect(montantCorrespond(12.5, '12,51')).toBe(false);
    expect(montantCorrespond(12.5, '12,49')).toBe(false);
  });

  it('le flottant ne fait pas rater une égalité exacte', () => {
    // 1171,01 × 100 vaut 117101,00000000001 : une égalité sur les décimales
    // aurait été fausse une fois sur deux.
    expect(montantCorrespond(1171.01, '1171,01')).toBe(true);
    expect(montantCorrespond(0.07, '0,07')).toBe(true);
    expect(montantCorrespond(29.64, '29,64')).toBe(true);
  });

  it('le sens d\'un remboursement ne décide pas de sa trouvabilité', () => {
    expect(montantCorrespond(-29.64, '29,64')).toBe(true);
  });

  it('un montant absent ou abîmé ne correspond à rien', () => {
    expect(montantCorrespond(undefined, '12')).toBe(false);
    expect(montantCorrespond(NaN, '12')).toBe(false);
    expect(montantCorrespond('douze', '12')).toBe(false);
  });

  it('une requête vide ne correspond à rien', () => {
    // Le champ effacé ne doit pas se mettre à tout trouver par le montant.
    expect(montantCorrespond(12.5, '')).toBe(false);
    expect(montantCorrespond(12.5, '   ')).toBe(false);
  });

  it('zéro se cherche comme les autres', () => {
    expect(montantCorrespond(0, '0')).toBe(true);
    expect(montantCorrespond(0.5, '0,50')).toBe(true);
  });
});
