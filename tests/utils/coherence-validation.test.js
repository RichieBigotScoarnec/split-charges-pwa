import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIMITS } from '../../public/js/config.js';
import { validateChargeAmount, validateAmount } from '../../public/js/utils/validation.js';

/**
 * `utils/validation.js` existait, testé sur 334 lignes, et n'était importé par
 * personne : chaque formulaire réécrivait ses contrôles à la main. Les règles
 * avaient donc divergé sans que rien ne le signale — une charge de 80 000 €
 * passait par le formulaire habituel et était refusée par la saisie rapide.
 *
 * Ces tests portent sur la propriété qui compte : une règle énoncée une fois
 * ne peut plus diverger. Ils lisent le code livré, et échouent dès qu'un
 * formulaire recommence à écrire son propre seuil.
 */

/** Les formulaires qui acceptent un montant */
const FORMULAIRES = [
  'public/js/modules/variable-charges.js',
  'public/js/modules/fixed-charges.js',
  'public/js/modules/reimbursements.js',
  'public/js/modules/quick-add.js',
  'public/js/modules/period.js'
];

/**
 * Lit un fichier du projet
 * @param {string} chemin - Chemin relatif à la racine
 * @returns {string} Contenu
 */
const lire = (chemin) => readFileSync(resolve(process.cwd(), chemin), 'utf8');

describe('Aucun formulaire ne réécrit ses seuils', () => {
  it.each(FORMULAIRES)('%s ne code aucun plafond en dur', (chemin) => {
    const source = lire(chemin);

    // Un montant littéral à cinq chiffres dans une comparaison est le signe
    // d'un seuil réécrit sur place.
    const seuils = source.match(/[<>]=?\s*\d{4,}/g) || [];
    expect(seuils, `seuils en dur : ${seuils.join(', ')}`).toEqual([]);
  });

  it.each(FORMULAIRES)('%s importe les règles partagées', (chemin) => {
    expect(lire(chemin)).toMatch(/from '\.\.\/utils\/validation\.js'/);
  });

  it('le plafond de charge est celui de la configuration, pas une copie', () => {
    expect(validateChargeAmount(LIMITS.MAX_CHARGE).valid).toBe(true);
    expect(validateChargeAmount(LIMITS.MAX_CHARGE + 1).valid).toBe(false);
  });
});

describe('Les quatre portes appliquent la même règle', () => {
  /**
   * Le même montant doit recevoir le même verdict quelle que soit la porte
   * empruntée. C'est ce qui n'était pas vrai : 80 000 € passait par le
   * formulaire habituel et échouait en saisie rapide.
   */
  it.each([
    ['un montant courant', 42.5, true],
    ['un montant élevé mais plausible', 80000, true],
    ['la limite exacte', LIMITS.MAX_CHARGE, true],
    ['un centime au-dessus de la limite', LIMITS.MAX_CHARGE + 0.01, false],
    ['zéro', 0, false],
    ['un montant négatif', -10, false],
    ['une saisie non numérique', 'beaucoup', false]
  ])('%s : verdict unique', (_libelle, montant, attendu) => {
    expect(validateChargeAmount(montant).valid).toBe(attendu);
  });

  it('un refus dit toujours pourquoi', () => {
    for (const montant of [0, -10, 'abc', LIMITS.MAX_CHARGE + 1]) {
      const verdict = validateChargeAmount(montant);
      expect(verdict.valid).toBe(false);
      expect(verdict.error, `pas de motif pour ${montant}`).toBeTruthy();
    }
  });
});

describe('Revenus et charges ne suivent pas la même règle', () => {
  it('un revenu nul est légitime, une charge nulle ne l\'est pas', () => {
    // Ne pas percevoir de salaire est une situation réelle ; une charge de
    // zéro euro n'apprend rien.
    expect(validateAmount(0, 'Salaire', LIMITS.MAX_SALARY).valid).toBe(true);
    expect(validateChargeAmount(0).valid).toBe(false);
  });

  it('le plafond de revenu est distinct de celui des charges', () => {
    expect(validateAmount(LIMITS.MAX_SALARY, 'Salaire', LIMITS.MAX_SALARY).valid).toBe(true);
    expect(validateAmount(LIMITS.MAX_SALARY + 1, 'Salaire', LIMITS.MAX_SALARY).valid).toBe(false);
  });

  it('le message nomme le champ refusé', () => {
    // « Montant invalide » ne dit pas lequel quand quatre champs coexistent.
    expect(validateAmount(-1, 'Vos autres revenus', LIMITS.MAX_SALARY).error)
      .toContain('Vos autres revenus');
  });
});
