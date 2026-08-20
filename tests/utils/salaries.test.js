import { describe, it, expect } from 'vitest';
import { normalizeSalaries, resolveSalaries } from '../../public/js/utils/salaries.js';

describe('normalizeSalaries', () => {
  it('normalise un couple de nombres valides', () => {
    expect(normalizeSalaries({ vous: 2500, conjointe: 1800 }))
      .toEqual({ vous: 2500, conjointe: 1800 });
  });

  it('convertit les chaînes numériques venant de Firebase', () => {
    expect(normalizeSalaries({ vous: '2500.50', conjointe: '1800' }))
      .toEqual({ vous: 2500.5, conjointe: 1800 });
  });

  it('ramène à 0 les valeurs négatives', () => {
    expect(normalizeSalaries({ vous: -100, conjointe: 1800 }))
      .toEqual({ vous: 0, conjointe: 1800 });
  });

  it('ramène à 0 les valeurs non numériques', () => {
    expect(normalizeSalaries({ vous: 'abc', conjointe: null }))
      .toEqual({ vous: 0, conjointe: 0 });
  });

  it('gère un champ absent', () => {
    expect(normalizeSalaries({ vous: 2500 }))
      .toEqual({ vous: 2500, conjointe: 0 });
  });

  it('retourne null pour une entrée inexploitable', () => {
    expect(normalizeSalaries(null)).toBeNull();
    expect(normalizeSalaries(undefined)).toBeNull();
    expect(normalizeSalaries('2500')).toBeNull();
    expect(normalizeSalaries(42)).toBeNull();
  });

  it('accepte zéro comme valeur légitime', () => {
    expect(normalizeSalaries({ vous: 0, conjointe: 0 }))
      .toEqual({ vous: 0, conjointe: 0 });
  });
});

describe('resolveSalaries', () => {
  const global = { vous: 3000, conjointe: 2000 };

  it("privilégie l'instantané de la période quand il existe", () => {
    const snapshot = { vous: 2500, conjointe: 1800 };
    const result = resolveSalaries(snapshot, global);

    expect(result.salaries).toEqual({ vous: 2500, conjointe: 1800 });
    expect(result.fromSnapshot).toBe(true);
  });

  it('retombe sur les salaires globaux sans instantané', () => {
    const result = resolveSalaries(null, global);

    expect(result.salaries).toEqual({ vous: 3000, conjointe: 2000 });
    expect(result.fromSnapshot).toBe(false);
  });

  it("n'écrase pas un instantané à zéro par les globaux", () => {
    // Un mois réellement sans revenu doit rester à zéro : c'est une donnée,
    // pas une absence de donnée.
    const result = resolveSalaries({ vous: 0, conjointe: 0 }, global);

    expect(result.salaries).toEqual({ vous: 0, conjointe: 0 });
    expect(result.fromSnapshot).toBe(true);
  });

  it('retourne un couple à zéro si tout est absent', () => {
    const result = resolveSalaries(null, null);

    expect(result.salaries).toEqual({ vous: 0, conjointe: 0 });
    expect(result.fromSnapshot).toBe(false);
  });

  it("isole les périodes : deux instantanés distincts donnent deux résultats", () => {
    const mars = resolveSalaries({ vous: 2000, conjointe: 1500 }, global);
    const aout = resolveSalaries({ vous: 3200, conjointe: 2100 }, global);

    expect(mars.salaries).toEqual({ vous: 2000, conjointe: 1500 });
    expect(aout.salaries).toEqual({ vous: 3200, conjointe: 2100 });
  });

  it('normalise aussi les instantanés mal typés', () => {
    const result = resolveSalaries({ vous: '2500', conjointe: -5 }, global);

    expect(result.salaries).toEqual({ vous: 2500, conjointe: 0 });
    expect(result.fromSnapshot).toBe(true);
  });
});
