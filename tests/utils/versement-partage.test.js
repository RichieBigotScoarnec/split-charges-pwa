import { describe, it, expect } from 'vitest';
import {
  partagerLeVersement, versementsAEcrire, phraseDuPartage, AUTEUR_A_DEUX
} from '../../public/js/utils/versement-partage.js';

/**
 * Alimenter une cagnotte à deux
 *
 * Un versement porte un auteur, et un seul. Mettre 150 € de côté chaque mois
 * pour les vacances — la décision d'un foyer, pas d'une personne — demandait
 * donc de calculer les deux parts de tête, puis de saisir deux versements.
 *
 * Ce qui se vérifie ici : que le partage suive celui des charges plutôt que
 * d'en inventer un autre, et que les deux parts fassent EXACTEMENT le total.
 */

/** Le cas du foyer : 2 600 et 1 800, soit 59,09 % / 40,91 % */
const REVENUS = { vous: 2600, conjointe: 1800, extraVous: 0, extraConjointe: 0 };

describe('Le partage suit le mode du foyer', () => {
  it('au prorata, chacun selon ses revenus', () => {
    const parts = partagerLeVersement({ montant: 150, shareMode: 'prorata', salaries: REVENUS });

    // 150 × 2600/4400 = 88,636… → 88,64 ; le reste va à l'autre.
    expect(parts.vous).toBe(88.64);
    expect(parts.conjointe).toBe(61.36);
    expect(parts.applique).toBe('prorata');
  });

  it('à 50-50, en deux parts égales', () => {
    const parts = partagerLeVersement({ montant: 150, shareMode: '50-50', salaries: REVENUS });

    expect(parts).toMatchObject({ vous: 75, conjointe: 75, applique: '50-50' });
  });

  it('à pourcentages libres, selon les pourcentages du foyer', () => {
    const parts = partagerLeVersement({
      montant: 150, shareMode: 'custom', salaries: REVENUS,
      customPercents: { vous: 70, conjointe: 30 }
    });

    expect(parts).toMatchObject({ vous: 105, conjointe: 45, applique: 'custom' });
  });

  it('les revenus complémentaires entrent dans l\'assiette', () => {
    // Le prorata répond à une question de capacité contributive : un conjoint
    // au salaire modeste mais percevant des allocations conséquentes ne doit
    // pas se voir attribuer une part trop faible. Même assiette que le bilan.
    const avecAllocations = { vous: 2600, conjointe: 1800, extraVous: 0, extraConjointe: 800 };
    const parts = partagerLeVersement({
      montant: 150, shareMode: 'prorata', salaries: avecAllocations
    });

    // 150 × 2600/5200 = 75 exactement.
    expect(parts).toMatchObject({ vous: 75, conjointe: 75 });
  });
});

describe('Les deux parts font exactement le total', () => {
  it.each([
    [150, 'prorata'],
    [100.01, '50-50'],
    [0.01, 'prorata'],
    [33.33, 'prorata'],
    [1234.56, 'prorata'],
    [7, 'custom']
  ])('%s € en mode %s', (montant, shareMode) => {
    // L'une est arrondie, l'autre est le reste. Arrondir les deux séparément
    // fait perdre ou inventer un centime : 100,01 € à parts égales donnerait
    // deux fois 50,01, soit 100,02 en base — pour un pot dont on croit
    // connaître le contenu.
    const parts = partagerLeVersement({
      montant, shareMode, salaries: REVENUS, customPercents: { vous: 70, conjointe: 30 }
    });

    expect(Math.round((parts.vous + parts.conjointe) * 100) / 100).toBe(montant);
  });
});

describe('Le prorata sans revenus n\'est pas un prorata', () => {
  it('partage en deux, et le DIT', () => {
    // `calculateChargeShares` retombe sur 50-50 quand il n'y a rien à diviser.
    // Le repli est le bon ; annoncer « au prorata » par-dessus serait faux, et
    // c'est la phrase que l'écran ira lire.
    const parts = partagerLeVersement({
      montant: 150, shareMode: 'prorata',
      salaries: { vous: 0, conjointe: 0, extraVous: 0, extraConjointe: 0 }
    });

    expect(parts).toMatchObject({ vous: 75, conjointe: 75, applique: '50-50' });
  });

  it('un seul revenu saisi met tout sur celui qui en a un', () => {
    const parts = partagerLeVersement({
      montant: 150, shareMode: 'prorata',
      salaries: { vous: 2000, conjointe: 0, extraVous: 0, extraConjointe: 0 }
    });

    expect(parts).toMatchObject({ vous: 150, conjointe: 0, applique: 'prorata' });
  });
});

describe('Un montant inexploitable ne se partage pas', () => {
  it.each([
    ['zéro', 0],
    ['négatif', -50],
    ['absent', undefined],
    ['pas un nombre', NaN],
    ['textuel', '150']
  ])('%s', (_, montant) => {
    expect(partagerLeVersement({ montant, shareMode: 'prorata', salaries: REVENUS })).toBeNull();
  });

  it('sans argument du tout', () => {
    expect(partagerLeVersement()).toBeNull();
  });
});

describe('Ce qui part réellement en base', () => {
  it('deux versements, un par personne', () => {
    const aEcrire = versementsAEcrire({ vous: 88.64, conjointe: 61.36 });

    expect(aEcrire).toEqual([
      { auteur: 'vous', montant: 88.64 },
      { auteur: 'conjointe', montant: 61.36 }
    ]);
  });

  it('une part nulle ne donne pas de ligne', () => {
    // Les règles exigent un montant strictement positif : écrire quand même
    // produirait un refus sur la moitié du geste, pour une ligne qui n'aurait
    // rien dit de plus qu'une absence.
    expect(versementsAEcrire({ vous: 150, conjointe: 0 }))
      .toEqual([{ auteur: 'vous', montant: 150 }]);
  });

  it('un partage impossible ne donne rien à écrire', () => {
    expect(versementsAEcrire(null)).toEqual([]);
  });
});

describe('La phrase dite avant l\'écriture', () => {
  const parts = {
    montantVous: '88,64 €', montantConjointe: '61,36 €',
    nomVous: 'Richard', nomConjointe: 'Cindy', mois: 'septembre 2026'
  };

  it('nomme les deux personnes, les deux montants, et la règle', () => {
    const phrase = phraseDuPartage({ ...parts, applique: 'prorata' });

    expect(phrase).toContain('88,64 € pour Richard');
    expect(phrase).toContain('61,36 € pour Cindy');
    expect(phrase).toContain('au prorata des revenus de septembre 2026');
  });

  it('dit « à parts égales » quand c\'est le cas', () => {
    expect(phraseDuPartage({ ...parts, applique: '50-50' })).toContain('à parts égales');
  });

  it('un mode inconnu ne fabrique pas une règle inventée', () => {
    expect(phraseDuPartage({ ...parts, applique: 'licorne' })).toContain('à parts égales');
  });
});

describe('La valeur du choix « à deux »', () => {
  it('n\'est aucune des deux personnes', () => {
    // Les règles Firebase n'acceptent que 'vous' et 'conjointe' comme auteur :
    // cette valeur ne doit jamais atteindre la base.
    expect(AUTEUR_A_DEUX).not.toBe('vous');
    expect(AUTEUR_A_DEUX).not.toBe('conjointe');
  });
});
