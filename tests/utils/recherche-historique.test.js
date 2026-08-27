import { describe, it, expect } from 'vitest';

import {
  chargesDeTousLesMois,
  grouperParMois,
  moisRepresentes
} from '../../public/js/utils/recherche-historique.js';

/**
 * Chercher au-delà du mois affiché
 *
 * La recherche filtrait les lignes déjà rendues : structurellement incapable de
 * trouver quoi que ce soit dans un autre mois, puisque les autres mois ne sont
 * pas dans la page. « Quand a-t-on acheté la machine à laver ? » restait sans
 * réponse alors que la donnée est là.
 */

const PERIODS = {
  '2026-08': {
    variableCharges: {
      v1: { description: 'Courses Leclerc', amount: 84.3, paidBy: 'vous' },
      v2: { description: 'Machine à laver', amount: 499, paidBy: 'conjointe' }
    },
    fixedCharges: { f1: { description: 'Loyer', amount: 950, paidBy: 'vous' } },
    reimbursements: { r1: { amount: 100, note: 'Remboursement courses' } }
  },
  '2026-06': {
    variableCharges: {
      v3: { description: 'Garage', amount: 320, paidBy: 'vous' },
      v4: { description: 'Vieille charge', amount: 12, deleted: true }
    }
  },
  '2025-11': {
    variableCharges: { v5: { description: 'Pneus', amount: 480, paidBy: 'conjointe' } }
  },
  // Ce que le nœud peut contenir sans être un mois
  salaries: { vous: 2500 },
  'pas-un-mois': { variableCharges: { x: { description: 'Intrus' } } },
  '2026-13': { variableCharges: { y: { description: 'Mois impossible' } } }
};

describe('chargesDeTousLesMois — mettre tout l\'historique à plat', () => {
  it('rassemble les trois collections de tous les mois', () => {
    const tout = chargesDeTousLesMois(PERIODS);
    expect(tout.map(e => e.description || e.note).sort()).toEqual([
      'Courses Leclerc', 'Garage', 'Loyer', 'Machine à laver', 'Pneus', 'Remboursement courses'
    ]);
  });

  it('reporte la période sur chaque entrée', () => {
    const machine = chargesDeTousLesMois(PERIODS).find(e => e.description === 'Machine à laver');
    expect(machine.periode).toBe('2026-08');
    const pneus = chargesDeTousLesMois(PERIODS).find(e => e.description === 'Pneus');
    expect(pneus.periode).toBe('2025-11');
  });

  it('reporte l\'identifiant, que la clé Firebase porte seule', () => {
    const loyer = chargesDeTousLesMois(PERIODS).find(e => e.description === 'Loyer');
    expect(loyer.id).toBe('f1');
  });

  it('nomme le type comme l\'écran le nomme', () => {
    const tout = chargesDeTousLesMois(PERIODS);
    expect(tout.find(e => e.description === 'Loyer').typeLabel).toBe('Charge fixe');
    expect(tout.find(e => e.description === 'Garage').typeLabel).toBe('Charge variable');
    expect(tout.find(e => e.note === 'Remboursement courses').typeLabel).toBe('Remboursement');
  });

  it('écarte ce qui est à la corbeille', () => {
    // La corbeille montre les suppressions, pas la recherche. Les faire
    // remonter ferait proposer de retrouver ce qu'on a voulu retirer.
    const tout = chargesDeTousLesMois(PERIODS);
    expect(tout.map(e => e.description)).not.toContain('Vieille charge');
  });

  it('ignore les clés qui ne sont pas des mois', () => {
    // `periods` n'est pas garanti ne contenir que des mois : une clé étrangère
    // ferait remonter des entrées sous une période illisible.
    const tout = chargesDeTousLesMois(PERIODS);
    expect(tout.map(e => e.description)).not.toContain('Intrus');
    expect(tout.map(e => e.description)).not.toContain('Mois impossible');
  });

  it('rend les mois du plus récent au plus ancien', () => {
    const periodes = [...new Set(chargesDeTousLesMois(PERIODS).map(e => e.periode))];
    expect(periodes).toEqual(['2026-08', '2026-06', '2025-11']);
  });

  it.each([[null], [undefined], [{}], ['periods'], [42], [[]]])(
    'un nœud inexploitable (%s) rend une liste vide',
    (noeud) => {
      expect(chargesDeTousLesMois(noeud)).toEqual([]);
    }
  );

  it('un mois vide ou abîmé n\'emporte pas les autres', () => {
    const tout = chargesDeTousLesMois({
      '2026-08': null,
      '2026-07': 'cassé',
      '2026-06': { variableCharges: { v: { description: 'Survivante' } } }
    });
    expect(tout.map(e => e.description)).toEqual(['Survivante']);
  });
});

describe('grouperParMois — situer la réponse', () => {
  const RESULTATS = [
    { id: 'a', periode: '2026-06', description: 'Garage' },
    { id: 'b', periode: '2026-08', description: 'Machine' },
    { id: 'c', periode: '2026-06', description: 'Pneus' }
  ];

  it('groupe, et range du plus récent au plus ancien', () => {
    const groupes = grouperParMois(RESULTATS);
    expect(groupes.map(g => g.periode)).toEqual(['2026-08', '2026-06']);
    expect(groupes[1].lignes.map(l => l.id)).toEqual(['a', 'c']);
  });

  it('écarte un résultat sans période lisible', () => {
    const groupes = grouperParMois([...RESULTATS, { id: 'd', periode: 'hier' }, null]);
    expect(groupes.flatMap(g => g.lignes).map(l => l.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it.each([[null], [undefined], ['résultats'], [{}]])(
    'une entrée inexploitable (%s) rend une liste vide',
    (resultats) => {
      expect(grouperParMois(resultats)).toEqual([]);
    }
  );
});

describe('moisRepresentes — « 7 résultats dans 3 mois »', () => {
  it('compte les mois distincts', () => {
    expect(moisRepresentes([
      { periode: '2026-08' }, { periode: '2026-08' }, { periode: '2025-11' }
    ])).toBe(2);
  });

  it('rend zéro sur une liste vide', () => {
    expect(moisRepresentes([])).toBe(0);
    expect(moisRepresentes(null)).toBe(0);
  });
});
