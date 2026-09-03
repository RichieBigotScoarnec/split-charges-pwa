import { describe, it, expect } from 'vitest';
import { ecartLaisseParLaCorrection } from '../../public/js/utils/correction-retroactive.js';

/**
 * L'écart qu'une correction rétroactive laisse sur place
 *
 * Corriger le salaire d'un mois archivé est sûr par construction : chaque mois
 * porte son instantané de revenus, et les revenus globaux ne suivent que sur le
 * mois courant. Il reste un cas — un seul — où le geste laisse quelque chose
 * derrière lui : août soldé, report désactivé, on corrige août. Le solde d'août
 * bouge, le remboursement enregistré ne correspond plus, et rien ne porte
 * l'écart vers septembre.
 *
 * Ces contrôles portent sur la frontière : quand parler, et surtout quand se
 * taire. Une phrase qui paraît à tort apprend à ignorer les phrases.
 */

/** Le cas qui a motivé la fonction : août soldé, corrigé depuis septembre */
const AOUT_DESOLDE = {
  periode: '2026-08',
  moisCourant: '2026-09',
  reportActif: false,
  soldeAvant: 0,
  soldeApres: 42.17
};

describe('Le cas qui appelle une phrase', () => {
  it('un mois soldé qui cesse de l\'être, report désactivé', () => {
    const phrase = ecartLaisseParLaCorrection(AOUT_DESOLDE);

    expect(phrase).toContain('août 2026');
    expect(phrase).toContain('42,17');
    expect(phrase).toContain('report');
  });

  it('la phrase donne les deux soldes, pas seulement l\'écart', () => {
    // « 42,17 € d'écart » n'apprend pas d'où l'on part : un mois qui passe de
    // 0 à 42,17 € et un mois qui passe de 100 à 142,17 € n'appellent pas la
    // même vérification.
    const phrase = ecartLaisseParLaCorrection({ ...AOUT_DESOLDE, soldeAvant: 100, soldeApres: 142.17 });

    expect(phrase).toContain('100,00');
    expect(phrase).toContain('142,17');
  });

  it('un mois jamais soldé qui se déplace le dit aussi', () => {
    // La condition n'est pas « le mois était à zéro » mais « le solde a bougé
    // et n'est plus nul » : un mois qu'on croyait devoir 300 € en doit 340,
    // et cet écart-là ne rejoindra rien non plus.
    expect(ecartLaisseParLaCorrection({ ...AOUT_DESOLDE, soldeAvant: 300, soldeApres: 340 }))
      .not.toBeNull();
  });

  it('un mois très ancien reste concerné', () => {
    expect(ecartLaisseParLaCorrection({ ...AOUT_DESOLDE, periode: '2024-02' })).not.toBeNull();
  });
});

describe('Les cas où il n\'y a rien à dire', () => {
  it('report activé : la chaîne des soldes porte l\'écart au mois suivant', () => {
    // C'est très exactement ce pour quoi le report existe. Avertir ici
    // reviendrait à signaler comme un défaut le fonctionnement nominal.
    expect(ecartLaisseParLaCorrection({ ...AOUT_DESOLDE, reportActif: true })).toBeNull();
  });

  it('le mois courant : c\'est la saisie ordinaire', () => {
    expect(ecartLaisseParLaCorrection({ ...AOUT_DESOLDE, periode: '2026-09' })).toBeNull();
  });

  it('un mois à venir non plus', () => {
    expect(ecartLaisseParLaCorrection({ ...AOUT_DESOLDE, periode: '2026-12' })).toBeNull();
  });

  it('le solde n\'a pas bougé', () => {
    expect(ecartLaisseParLaCorrection({ ...AOUT_DESOLDE, soldeAvant: 42.17, soldeApres: 42.17 }))
      .toBeNull();
  });

  it('la correction SOLDE le mois : c\'est la bonne nouvelle', () => {
    // Traiter une réussite comme un incident est la façon la plus sûre de
    // rendre les avertissements illisibles.
    expect(ecartLaisseParLaCorrection({ ...AOUT_DESOLDE, soldeAvant: 42.17, soldeApres: 0 }))
      .toBeNull();
  });

  it('un déplacement sous le centime ne se voit pas à l\'écran', () => {
    // Les soldes sortent d'une division par une somme de salaires. Comparer les
    // valeurs brutes ferait paraître une phrase pour un chiffre que personne ne
    // peut voir bouger.
    expect(ecartLaisseParLaCorrection({ ...AOUT_DESOLDE, soldeAvant: 42.170, soldeApres: 42.1704 }))
      .toBeNull();
  });

  it('un centime entier, lui, se voit', () => {
    expect(ecartLaisseParLaCorrection({ ...AOUT_DESOLDE, soldeAvant: 42.17, soldeApres: 42.18 }))
      .not.toBeNull();
  });
});

describe('Les entrées illisibles ne produisent pas de phrase', () => {
  it.each([
    ['aucun argument', undefined],
    ['période absente', { ...AOUT_DESOLDE, periode: undefined }],
    ['période au mauvais format', { ...AOUT_DESOLDE, periode: '2026-8' }],
    ['mois 13', { ...AOUT_DESOLDE, periode: '2026-13' }],
    ['mois courant absent', { ...AOUT_DESOLDE, moisCourant: null }],
    ['période non textuelle', { ...AOUT_DESOLDE, periode: 202608 }]
  ])('%s', (_, entree) => {
    expect(ecartLaisseParLaCorrection(entree)).toBeNull();
  });

  it('un solde non numérique vaut zéro plutôt qu\'une phrase absurde', () => {
    // `undefined` avant et 42,17 après : le mois passe bien de rien à 42,17 €.
    const phrase = ecartLaisseParLaCorrection({ ...AOUT_DESOLDE, soldeAvant: undefined });
    expect(phrase).toContain('0,00');
    expect(phrase).toContain('42,17');
  });
});
