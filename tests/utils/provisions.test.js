import { describe, it, expect } from 'vitest';

import {
  moisRestants,
  provisionMensuelle,
  etatProvision,
  provisionsDuMois
} from '../../public/js/utils/provisions.js';

/**
 * Ce qu'il faut mettre de côté ce mois-ci
 *
 * Une charge annuelle n'appartient pas au mois où elle tombe. Les enveloppes
 * savaient déjà accumuler — objectif, échéance, contenu réel du pot — mais
 * **rien ne faisait la division**. C'est elle qui transforme une cagnotte en
 * provision, et c'est elle qui est verrouillée ici.
 *
 * Les deux erreurs qui coûteraient le plus cher :
 *
 *   - confondre « échéance dépassée » et « il reste un mois » : la première
 *     réclame tout ce qui manque, immédiatement ;
 *   - annoncer une part mensuelle sur une enveloppe qui ne vise aucune date.
 */

/** Une cagnotte visant 1 200 € pour octobre 2026 */
const TAXE = {
  id: 'taxe', label: 'Taxe foncière', nature: 'cagnotte',
  budget: 1200, fin: '2026-10-15', rang: 'provision'
};

describe('moisRestants — l\'échéance comprise, et zéro si elle est passée', () => {
  it('compte le mois de l\'échéance : on peut encore mettre de côté en octobre', () => {
    expect(moisRestants('2026-10-15', '2026-08')).toBe(3); // août, septembre, octobre
  });

  it('le mois de l\'échéance lui-même laisse un mois', () => {
    expect(moisRestants('2026-08-15', '2026-08')).toBe(1);
  });

  it('franchit les années', () => {
    expect(moisRestants('2027-02-01', '2026-11')).toBe(4);
  });

  it.each([['2026-07-15'], ['2026-01-01'], ['2025-12-31']])(
    'une échéance passée (%s) rend zéro, jamais un',
    (echeance) => {
      // La distinction qui compte. `moisEcoules` d'`enveloppes.js` ramène tout
      // écart nul ou négatif à 1 — ce qui convient pour mesurer une durée
      // écoulée, et fausserait tout ici : une provision en retard réclame la
      // totalité de ce qui manque, pas un douzième de plus.
      expect(moisRestants(echeance, '2026-08')).toBe(0);
    }
  );

  it.each([[null], [undefined], [''], ['octobre'], ['2026-13'], [42]])(
    'une borne illisible (%s) rend zéro',
    (valeur) => {
      expect(moisRestants(valeur, '2026-08')).toBe(0);
      expect(moisRestants('2026-10', valeur)).toBe(0);
    }
  );
});

describe('provisionMensuelle — le manque divisé par ce qui reste', () => {
  it('1 200 € en 3 mois, pot vide : 400 € par mois', () => {
    expect(provisionMensuelle(1200, 0, 3)).toBeCloseTo(400, 6);
  });

  it('ne redemande que ce qui manque', () => {
    // 1 200 visés, 600 déjà mis, 3 mois : 200 par mois, pas 400.
    expect(provisionMensuelle(1200, 600, 3)).toBeCloseTo(200, 6);
  });

  it('le retard fait monter la part, il ne la laisse pas filer', () => {
    // À un mois de l'échéance avec la moitié du pot, il faut tout le reste.
    expect(provisionMensuelle(1200, 600, 1)).toBeCloseTo(600, 6);
  });

  it('un objectif atteint ne demande plus rien', () => {
    expect(provisionMensuelle(1200, 1200, 3)).toBe(0);
    expect(provisionMensuelle(1200, 1500, 3)).toBe(0);
  });

  it('une échéance dépassée réclame tout ce qui manque, d\'un coup', () => {
    // Rendre 0 laisserait croire que c'est réglé ; diviser par zéro mois
    // n'aurait aucun sens.
    expect(provisionMensuelle(1200, 800, 0)).toBeCloseTo(400, 6);
  });

  it.each([[undefined], [null], [NaN], ['1200']])(
    'un objectif inexploitable (%s) ne demande rien plutôt que NaN',
    (objectif) => {
      expect(provisionMensuelle(objectif, 0, 3)).toBe(0);
    }
  );

  it('un pot inexploitable compte pour zéro, jamais NaN', () => {
    const part = provisionMensuelle(1200, undefined, 3);
    expect(Number.isFinite(part)).toBe(true);
    expect(part).toBeCloseTo(400, 6);
  });
});

describe('etatProvision — ce qui fait d\'une enveloppe une provision', () => {
  it('une cagnotte avec objectif et échéance en est une', () => {
    const etat = etatProvision(TAXE, 300, '2026-08');
    expect(etat.concernee).toBe(true);
    expect(etat.restants).toBe(3);
    expect(etat.manque).toBe(900);
    expect(etat.parMois).toBeCloseTo(300, 6);
    expect(etat.echeance).toBe('2026-10-15');
  });

  it('une mensuelle n\'en est pas une : elle se recharge, elle ne vise rien', () => {
    const etat = etatProvision({ ...TAXE, nature: 'mensuelle' }, 300, '2026-08');
    expect(etat.concernee).toBe(false);
    expect(etat.parMois).toBe(0);
  });

  it('sans échéance, il n\'y a rien à diviser', () => {
    expect(etatProvision({ ...TAXE, fin: null }, 300, '2026-08').concernee).toBe(false);
  });

  it('sans objectif, il n\'y a rien à atteindre', () => {
    expect(etatProvision({ ...TAXE, budget: 0 }, 300, '2026-08').concernee).toBe(false);
    expect(etatProvision({ ...TAXE, budget: null }, 300, '2026-08').concernee).toBe(false);
  });

  it('le rang ne décide de rien : une épargne datée obéit au même calcul', () => {
    // Le rang range à l'écran ; lui faire porter le calcul refuserait la
    // division à une enveloppe qui en a exactement besoin.
    const etat = etatProvision({ ...TAXE, rang: 'epargne' }, 300, '2026-08');
    expect(etat.concernee).toBe(true);
    expect(etat.parMois).toBeCloseTo(300, 6);
  });

  it('une provision atteinte se signale, et ne demande plus rien', () => {
    const etat = etatProvision(TAXE, 1200, '2026-08');
    expect(etat.atteinte).toBe(true);
    expect(etat.enRetard).toBe(false);
    expect(etat.parMois).toBe(0);
  });

  it('une échéance dépassée et non atteinte se signale comme telle', () => {
    const etat = etatProvision(TAXE, 800, '2026-12');
    expect(etat.enRetard).toBe(true);
    expect(etat.atteinte).toBe(false);
    expect(etat.restants).toBe(0);
    expect(etat.parMois).toBeCloseTo(400, 6);
  });

  it('une enveloppe absente ne fait pas tomber le calcul', () => {
    expect(etatProvision(null, 0, '2026-08').concernee).toBe(false);
    expect(etatProvision(undefined, 0, '2026-08').parMois).toBe(0);
  });
});

describe('provisionsDuMois — le chiffre qui manquait au bilan', () => {
  const NOEL = {
    id: 'noel', label: 'Noël', nature: 'cagnotte',
    budget: 600, fin: '2026-12-20', rang: 'provision'
  };
  const VACANCES = {
    id: 'vac', label: 'Vacances', nature: 'cagnotte',
    budget: 2000, fin: '2027-07-01', rang: 'provision'
  };
  const COURSES = {
    id: 'courses', label: 'Courses', nature: 'mensuelle', budget: 500, fin: null
  };

  const ENTREES = [
    { enveloppe: TAXE, dansLePot: 300 },      // 900 sur 3 mois  → 300,00
    { enveloppe: NOEL, dansLePot: 100 },      // 500 sur 5 mois  → 100,00
    { enveloppe: VACANCES, dansLePot: 200 },  // 1800 sur 12 mois → 150,00
    { enveloppe: COURSES, dansLePot: 0 }      // écartée : mensuelle
  ];

  it('additionne ce qu\'il faut mettre de côté ce mois-ci', () => {
    const { total } = provisionsDuMois(ENTREES, '2026-08');
    expect(total).toBeCloseTo(300 + 100 + 150, 6);
  });

  it('écarte ce qui n\'est pas une provision', () => {
    const { lignes } = provisionsDuMois(ENTREES, '2026-08');
    expect(lignes.map(l => l.enveloppe.id)).not.toContain('courses');
  });

  it('écarte une provision atteinte : elle ne demande plus rien', () => {
    const { lignes, total } = provisionsDuMois(
      [{ enveloppe: TAXE, dansLePot: 1200 }, { enveloppe: NOEL, dansLePot: 100 }], '2026-08');
    expect(lignes.map(l => l.enveloppe.id)).toEqual(['noel']);
    expect(total).toBeCloseTo(100, 6);
  });

  it('range la plus pressée d\'abord', () => {
    const { lignes } = provisionsDuMois(ENTREES, '2026-08');
    expect(lignes.map(l => l.enveloppe.id)).toEqual(['taxe', 'noel', 'vac']);
  });

  it('une échéance dépassée passe devant tout le reste, et se compte', () => {
    const { lignes, enRetard } = provisionsDuMois(
      [{ enveloppe: NOEL, dansLePot: 100 }, { enveloppe: TAXE, dansLePot: 800 }], '2026-11');
    expect(lignes[0].enveloppe.id).toBe('taxe');
    expect(lignes[0].enRetard).toBe(true);
    expect(enRetard).toBe(1);
  });

  it.each([[null], [undefined], [[]], ['rien']])(
    'une entrée inexploitable (%s) rend un total de zéro',
    (entrees) => {
      const { total, lignes } = provisionsDuMois(entrees, '2026-08');
      expect(total).toBe(0);
      expect(lignes).toEqual([]);
    }
  );

  it('une entrée abîmée au milieu n\'emporte pas les autres', () => {
    const { lignes } = provisionsDuMois(
      [{ enveloppe: TAXE, dansLePot: 300 }, null, { enveloppe: null }, { enveloppe: NOEL, dansLePot: 100 }],
      '2026-08');
    expect(lignes).toHaveLength(2);
  });

  it('le total reste un nombre, quoi qu\'on lui passe', () => {
    const { total } = provisionsDuMois(
      [{ enveloppe: { ...TAXE, budget: NaN }, dansLePot: undefined }], '2026-08');
    expect(Number.isFinite(total)).toBe(true);
  });
});
