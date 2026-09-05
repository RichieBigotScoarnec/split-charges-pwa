import { describe, it, expect } from 'vitest';
import { libelleDeLaRepartition } from '../../public/js/utils/repartition.js';

/**
 * La grammaire d'une répartition dérogatoire, seule et pour elle-même
 *
 * Trois surfaces l'écrivent — les deux listes de charges et le récap des
 * virements — et leurs témoins respectifs tiennent le CÂBLAGE : la pastille
 * paraît sur la bonne ligne, elle dit la règle, une charge ordinaire n'en porte
 * aucune. Ce fichier-ci tient la FABRIQUE, et notamment les deux cas qu'aucune
 * des trois surfaces n'exerce parce qu'aucun formulaire ne les produit — mais
 * que les règles Firebase acceptent, donc que la base peut contenir.
 */

describe('Ce qui ne déroge à rien ne s\'écrit pas', () => {
  it('une charge sans `splitOverride` ne rend aucun libellé', () => {
    expect(libelleDeLaRepartition(null)).toBe('');
    expect(libelleDeLaRepartition(undefined)).toBe('');
  });
});

describe('Les deux formes que les formulaires écrivent', () => {
  it('le partage en deux se lit « 50/50 »', () => {
    expect(libelleDeLaRepartition({ mode: '50-50' })).toBe('50/50');
  });

  it('des pourcentages se lisent dans l\'ordre « vous / conjointe »', () => {
    expect(libelleDeLaRepartition({ mode: 'custom', vous: 70, conjointe: 30 }))
      .toBe('70/30');
    // L'ordre n'est pas cosmétique : 70/30 et 30/70 désignent deux répartitions
    // opposées, et le lecteur doit savoir laquelle sans ouvrir la charge.
    expect(libelleDeLaRepartition({ mode: 'custom', vous: 30, conjointe: 70 }))
      .toBe('30/70');
  });
});

describe('Ce que les règles acceptent et qu\'aucun formulaire n\'écrit', () => {
  it('`{mode: custom}` SANS ses chiffres se lit « 50/50 », jamais « undefined »', () => {
    // Les règles n'exigent la somme que si les deux clés sont présentes : cette
    // forme s'écrit. `pourcentages()` retombe alors sur le partage en deux —
    // c'est écrit dans son en-tête, et c'est un défaut qui a déjà rendu tout le
    // bilan NaN. La pastille doit donc nommer la règle RÉELLEMENT appliquée au
    // montant qu'elle accompagne.
    //
    // Les deux listes affichaient ici « undefined/undefined ».
    expect(libelleDeLaRepartition({ mode: 'custom' })).toBe('50/50');
    expect(libelleDeLaRepartition({ mode: 'custom', vous: 70 })).toBe('50/50');
    expect(libelleDeLaRepartition({ mode: 'custom', vous: 'sept', conjointe: 30 }))
      .toBe('50/50');
  });

  it('`{mode: prorata}` ne rend aucun libellé : il ne nomme aucune division fixe', () => {
    // `database.rules.json:278` l'admet, aucun formulaire ne l'écrit. Ce mode
    // EST le partage par défaut du foyer : une pastille dirait qu'on s'écarte
    // de quelque chose alors qu'on n'en fait rien, et le gabarit d'avant
    // rendait « undefined/undefined ».
    expect(libelleDeLaRepartition({ mode: 'prorata' })).toBe('');
  });

  it('un mode inconnu ne rend rien non plus', () => {
    expect(libelleDeLaRepartition({ mode: '' })).toBe('');
    expect(libelleDeLaRepartition({ vous: 70, conjointe: 30 })).toBe('');
  });
});

describe('TÉMOIN — la fabrique distingue vraiment ses cas', () => {
  it('les libellés rendus ne sont pas tous identiques', () => {
    // Sans lui, une fabrique rendant toujours « 50/50 » passerait la moitié des
    // contrôles ci-dessus, et la pastille cesserait de distinguer quoi que ce
    // soit — c'est exactement le défaut qu'elle existe pour signaler.
    const rendus = [
      libelleDeLaRepartition({ mode: '50-50' }),
      libelleDeLaRepartition({ mode: 'custom', vous: 70, conjointe: 30 }),
      libelleDeLaRepartition({ mode: 'prorata' }),
      libelleDeLaRepartition(null)
    ];

    expect(new Set(rendus).size).toBe(3);
  });
});
