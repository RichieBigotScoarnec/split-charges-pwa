import { describe, it, expect } from 'vitest';
import {
  validateAmount,
  validateSalary,
  validateChargeAmount,
  validateRequired,
  validateChargeName,
  validateNote,
  validatePercentage,
  validateCustomSplit,
  validatePeriod,
  validateCharge
} from '../public/js/utils/validation.js';
import { LIMITS } from '../public/js/config.js';

// ===== validateAmount =====
describe('validateAmount', () => {
  it('valeur valide', () => {
    expect(validateAmount(100).valid).toBe(true);
  });

  it('zéro est valide', () => {
    expect(validateAmount(0).valid).toBe(true);
  });

  it('montant null est invalide', () => {
    const r = validateAmount(null);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/requis/i);
  });

  it('chaîne vide est invalide', () => {
    expect(validateAmount('').valid).toBe(false);
  });

  it('undefined est invalide', () => {
    expect(validateAmount(undefined).valid).toBe(false);
  });

  it('NaN est invalide', () => {
    expect(validateAmount('abc').valid).toBe(false);
  });

  it('négatif est invalide', () => {
    const r = validateAmount(-5);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/négatif/i);
  });

  it('au-delà du max est invalide', () => {
    const r = validateAmount(LIMITS.MAX_CHARGE + 1);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/dépasser/i);
  });

  it('exactement le max est valide', () => {
    expect(validateAmount(LIMITS.MAX_CHARGE).valid).toBe(true);
  });

  it('fieldName personnalisé dans le message', () => {
    const r = validateAmount(null, 'Salaire');
    expect(r.error).toMatch(/Salaire/);
  });

  it('chaîne numérique valide', () => {
    expect(validateAmount('150').valid).toBe(true);
  });
});

// ===== validateSalary =====
describe('validateSalary', () => {
  it('salaire valide', () => {
    expect(validateSalary(3000).valid).toBe(true);
  });

  it('salaire au-delà du max invalide', () => {
    expect(validateSalary(LIMITS.MAX_SALARY + 1).valid).toBe(false);
  });

  it('salaire nul valide (pas de salaire)', () => {
    expect(validateSalary(0).valid).toBe(true);
  });

  it('salaire négatif invalide', () => {
    expect(validateSalary(-1).valid).toBe(false);
  });
});

// ===== validateChargeAmount =====
describe('validateChargeAmount', () => {
  it('charge valide', () => {
    expect(validateChargeAmount(500).valid).toBe(true);
  });

  it('charge au-delà du max invalide', () => {
    expect(validateChargeAmount(LIMITS.MAX_CHARGE + 1).valid).toBe(false);
  });

  it('charge de 0 valide', () => {
    expect(validateChargeAmount(0).valid).toBe(true);
  });
});

// ===== validateRequired =====
describe('validateRequired', () => {
  it('chaîne non vide valide', () => {
    expect(validateRequired('Loyer').valid).toBe(true);
  });

  it('chaîne vide invalide', () => {
    const r = validateRequired('');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/requis/i);
  });

  it('null invalide', () => {
    expect(validateRequired(null).valid).toBe(false);
  });

  it('espaces seuls invalide', () => {
    expect(validateRequired('   ').valid).toBe(false);
  });

  it('trop long invalide', () => {
    const r = validateRequired('a'.repeat(LIMITS.MAX_NAME_LENGTH + 1));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/dépasser/i);
  });

  it('exactement à la limite valide', () => {
    expect(validateRequired('a'.repeat(LIMITS.MAX_NAME_LENGTH)).valid).toBe(true);
  });

  it('fieldName dans le message d\'erreur', () => {
    const r = validateRequired('', 'Description');
    expect(r.error).toMatch(/Description/);
  });
});

// ===== validateChargeName =====
describe('validateChargeName', () => {
  it('nom valide', () => {
    expect(validateChargeName('Loyer').valid).toBe(true);
  });

  it('nom vide invalide', () => {
    expect(validateChargeName('').valid).toBe(false);
  });

  it('nom trop long invalide', () => {
    expect(validateChargeName('a'.repeat(LIMITS.MAX_NAME_LENGTH + 1)).valid).toBe(false);
  });
});

// ===== validateNote =====
describe('validateNote', () => {
  it('note vide valide (optionnel)', () => {
    expect(validateNote('').valid).toBe(true);
  });

  it('null valide (optionnel)', () => {
    expect(validateNote(null).valid).toBe(true);
  });

  it('undefined valide (optionnel)', () => {
    expect(validateNote(undefined).valid).toBe(true);
  });

  it('note normale valide', () => {
    expect(validateNote('Remboursement courses').valid).toBe(true);
  });

  it('note trop longue invalide', () => {
    const r = validateNote('a'.repeat(LIMITS.MAX_NOTE_LENGTH + 1));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/dépasser/i);
  });

  it('exactement à la limite valide', () => {
    expect(validateNote('a'.repeat(LIMITS.MAX_NOTE_LENGTH)).valid).toBe(true);
  });
});

// ===== validatePercentage =====
describe('validatePercentage', () => {
  it('50 est valide', () => {
    expect(validatePercentage(50).valid).toBe(true);
  });

  it('0 est valide', () => {
    expect(validatePercentage(0).valid).toBe(true);
  });

  it('100 est valide', () => {
    expect(validatePercentage(100).valid).toBe(true);
  });

  it('-1 est invalide', () => {
    expect(validatePercentage(-1).valid).toBe(false);
  });

  it('101 est invalide', () => {
    expect(validatePercentage(101).valid).toBe(false);
  });

  it('NaN est invalide', () => {
    expect(validatePercentage('abc').valid).toBe(false);
  });

  it('chaîne numérique valide', () => {
    expect(validatePercentage('40').valid).toBe(true);
  });
});

// ===== validateCustomSplit =====
describe('validateCustomSplit', () => {
  it('60/40 valide', () => {
    expect(validateCustomSplit(60, 40).valid).toBe(true);
  });

  it('50/50 valide', () => {
    expect(validateCustomSplit(50, 50).valid).toBe(true);
  });

  it('0/100 valide', () => {
    expect(validateCustomSplit(0, 100).valid).toBe(true);
  });

  it('100/0 valide', () => {
    expect(validateCustomSplit(100, 0).valid).toBe(true);
  });

  it('60/41 invalide (total ≠ 100)', () => {
    const r = validateCustomSplit(60, 41);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/100/);
  });

  it('50/49 invalide', () => {
    expect(validateCustomSplit(50, 49).valid).toBe(false);
  });

  it('pourcentage invalide transmis', () => {
    expect(validateCustomSplit(-10, 110).valid).toBe(false);
  });

  it('tolérance 0.01 sur la somme', () => {
    // 33.33 + 66.67 = 100.00 — valide
    expect(validateCustomSplit(33.33, 66.67).valid).toBe(true);
  });
});

// ===== validatePeriod =====
describe('validatePeriod', () => {
  it('format correct', () => {
    expect(validatePeriod('2026-03').valid).toBe(true);
  });

  it('mois 01 valide', () => {
    expect(validatePeriod('2026-01').valid).toBe(true);
  });

  it('mois 12 valide', () => {
    expect(validatePeriod('2026-12').valid).toBe(true);
  });

  it('null invalide', () => {
    expect(validatePeriod(null).valid).toBe(false);
  });

  it('chaîne vide invalide', () => {
    expect(validatePeriod('').valid).toBe(false);
  });

  it('mois 13 invalide', () => {
    expect(validatePeriod('2026-13').valid).toBe(false);
  });

  it('mois 00 invalide', () => {
    expect(validatePeriod('2026-00').valid).toBe(false);
  });

  it('format sans tiret invalide', () => {
    expect(validatePeriod('202603').valid).toBe(false);
  });

  it('année courte invalide', () => {
    expect(validatePeriod('26-03').valid).toBe(false);
  });

  it('format avec jour invalide', () => {
    expect(validatePeriod('2026-03-01').valid).toBe(false);
  });
});

// ===== validateCharge =====
describe('validateCharge', () => {
  it('charge complète valide', () => {
    const r = validateCharge({ name: 'Loyer', amount: 1200 });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('nom manquant invalide', () => {
    const r = validateCharge({ name: '', amount: 1200 });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('montant négatif invalide', () => {
    const r = validateCharge({ name: 'Loyer', amount: -100 });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('note trop longue invalide', () => {
    const r = validateCharge({
      name: 'Loyer',
      amount: 1200,
      note: 'a'.repeat(LIMITS.MAX_NOTE_LENGTH + 1)
    });
    expect(r.valid).toBe(false);
  });

  it('accumule plusieurs erreurs', () => {
    const r = validateCharge({ name: '', amount: -100 });
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('sans note : valide', () => {
    const r = validateCharge({ name: 'EDF', amount: 80 });
    expect(r.valid).toBe(true);
  });
});
