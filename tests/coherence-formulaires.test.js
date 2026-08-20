import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { REIMBURSEMENT_DIRECTIONS } from '../public/js/config.js';

/**
 * Cohérence entre les valeurs proposées par le formulaire et celles attendues
 * par la logique.
 *
 * Le formulaire écrivait `from-you` / `from-partner` tandis que tous les
 * consommateurs comparaient à `vous-to-conjointe` : aucune correspondance.
 * Conséquence, tout remboursement tombait dans la branche « Conjointe → Vous »,
 * s'affichait avec le mauvais libellé et déplaçait le solde dans le mauvais
 * sens. Le défaut a survécu des mois parce que rien ne reliait les deux côtés.
 *
 * Ces tests lisent le HTML livré : ils échouent si l'un des deux dérive.
 */
const html = readFileSync(new URL('../public/FairSplit.html', import.meta.url), 'utf8');

/**
 * Extrait les `value` des <option> d'un <select> donné
 * @param {string} selectId
 * @returns {string[]} valeurs non vides
 */
function optionValues(selectId) {
  const open = html.indexOf(`id="${selectId}"`);
  if (open === -1) throw new Error(`<select id="${selectId}"> introuvable`);
  const block = html.slice(open, html.indexOf('</select>', open));
  return [...block.matchAll(/value="([^"]*)"/g)].map(m => m[1]).filter(Boolean);
}

describe('Cohérence formulaire ↔ logique', () => {
  it('les directions de remboursement du formulaire sont celles attendues', () => {
    const attendues = Object.values(REIMBURSEMENT_DIRECTIONS).sort();
    expect(optionValues('reimbursementDirection').sort()).toEqual(attendues);
  });

  it('les deux sens sont proposés, sans doublon', () => {
    const values = optionValues('reimbursementDirection');
    expect(values).toHaveLength(2);
    expect(new Set(values).size).toBe(2);
  });

  it('les payeurs proposés correspondent à ceux traités par les calculs', () => {
    // computeSummary distingue 'vous', 'conjointe', et traite tout le reste
    // comme partagé. Le formulaire ne doit pas proposer autre chose.
    const values = optionValues('variableChargePaidBy');
    expect(values.sort()).toEqual(['conjointe', 'partage', 'vous']);
  });
});
