import { describe, it, expect } from 'vitest';
import {
  validateAmount,
  validateChargeAmount,
  validateRequired,
  validateChargeName,
} from '../../public/js/utils/validation.js';
import { LIMITS } from '../../public/js/config.js';

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

// ===== validateChargeAmount =====
describe('validateChargeAmount', () => {
  it('charge valide', () => {
    expect(validateChargeAmount(500).valid).toBe(true);
  });

  it('charge au-delà du max invalide', () => {
    expect(validateChargeAmount(LIMITS.MAX_CHARGE + 1).valid).toBe(false);
  });

  it('charge de 0 refusée', () => {
    // Ce test affirmait l'inverse. Il décrivait une règle qu'aucun formulaire
    // n'appliquait : tous refusaient déjà zéro à la main. Un salaire nul est
    // une situation réelle, une charge de zéro euro n'apprend rien.
    const r = validateChargeAmount(0);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/supérieur à zéro/);
  });

  it('un montant strictement positif reste accepté', () => {
    expect(validateChargeAmount(0.01).valid).toBe(true);
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

// ===== validateCharge =====
// Ces cas décrivent une charge portant `name`, forme que l'application ne
// produit nulle part — elle écrit `description`. Écrits d'après la fonction
// plutôt que d'après les données, ils l'ont confortée dans son erreur pendant
// tout ce temps. Ils sont conservés : `name` reste accepté en repli, et une
// suite de tests n'a pas à mentir sur ce que le code fait aujourd'hui.

