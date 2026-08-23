// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Ce que la recherche atteint
 *
 * Elle ignorait les remboursements — chercher « courses » ne trouvait pas celui
 * dont la note dit « Remboursement courses ». Elle ignorait aussi le payeur,
 * l'enveloppe, la date et le lieu, alors que l'écran les affiche tous.
 *
 * Et elle interrogeait `charge.note`, un champ qu'aucune charge n'a jamais
 * porté : du code mort qui donnait l'apparence d'une couverture plus large.
 *
 * La règle retenue : ce qu'on lit à l'écran, on doit pouvoir le chercher.
 */

vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

const { searchInCharges } = await import('../../public/js/modules/search.js');
const { setState, resetState } = await import('../../public/js/state.js');

beforeEach(() => {
  resetState();
  setState('members', { vous: 'Richard', conjointe: 'Cindy' });
  setState('envelopes', [{ id: 'vacances-ete', label: 'Vacances été', icon: '🏖️' }]);
  setState('fixedCharges', [
    { id: 'f1', description: 'Loyer', category: 'Maison', amount: 900, paidBy: 'vous', date: '2026-08-05' }
  ]);
  setState('variableCharges', [
    {
      id: 'v1', description: 'Restaurant', category: 'Restaurant', amount: 42,
      paidBy: 'conjointe', date: '2026-08-15', envelope: 'vacances-ete',
      location: { name: 'Le Bistrot', commune: 'Rennes' }
    }
  ]);
  setState('reimbursements', [
    { id: 'r1', direction: 'vous-to-conjointe', amount: 50, note: 'Remboursement courses', date: '2026-08-12' }
  ]);
});

/** Identifiants trouvés pour une requête */
const trouves = (requete) => searchInCharges(requete.toLowerCase()).map(r => r.id);

describe('Les remboursements entrent dans le champ', () => {
  it('une note de remboursement est trouvée', () => {
    expect(trouves('courses')).toContain('r1');
  });

  it('le résultat est étiqueté comme tel', () => {
    const resultat = searchInCharges('courses').find(r => r.id === 'r1');
    expect(resultat.typeLabel).toBe('Remboursement');
  });

  it('un remboursement supprimé reste hors du champ', () => {
    setState('reimbursements', [
      { id: 'r1', direction: 'vous-to-conjointe', amount: 50, note: 'Courses', deleted: true }
    ]);
    expect(trouves('courses')).not.toContain('r1');
  });
});

describe('Ce qu\'on lit à l\'écran, on peut le chercher', () => {
  it('le payeur, sous son prénom', () => {
    // « Cindy » s'affiche sur la ligne ; la recherche ne le connaissait pas.
    expect(trouves('cindy')).toContain('v1');
  });

  it('l\'enveloppe, sous son libellé', () => {
    expect(trouves('vacances')).toContain('v1');
  });

  it('la date, telle qu\'elle s\'affiche', () => {
    // « 15 août 2026 » est ce que la ligne montre.
    expect(trouves('août')).toContain('v1');
  });

  it('la date, sous sa forme technique', () => {
    // « 2026-08 » sert à balayer un mois entier.
    const aout = trouves('2026-08');
    expect(aout).toContain('v1');
    expect(aout).toContain('f1');
    expect(aout).toContain('r1');
  });

  it('le lieu, nom comme commune', () => {
    expect(trouves('bistrot')).toContain('v1');
    expect(trouves('rennes')).toContain('v1');
  });
});

describe('Ce qui marchait continue de marcher', () => {
  it('la description', () => {
    expect(trouves('loyer')).toContain('f1');
  });

  it('la catégorie', () => {
    expect(trouves('maison')).toContain('f1');
  });

  it('le montant', () => {
    expect(trouves('900')).toContain('f1');
  });

  it('une requête sans correspondance ne rend rien', () => {
    expect(trouves('zzzzz')).toEqual([]);
  });
});

describe('Robustesse', () => {
  it('une charge sans montant exploitable n\'interrompt pas la recherche', () => {
    // Appeler toString() sur un montant absent interrompait autrefois la
    // recherche entière sur une seule entrée abîmée.
    setState('variableCharges', [
      { id: 'abimee' },
      { id: 'saine', description: 'Courses', category: 'Courses', amount: 30 }
    ]);
    expect(trouves('courses')).toContain('saine');
  });

  it('une enveloppe disparue ne fait pas échouer la recherche', () => {
    setState('envelopes', []);
    expect(() => trouves('vacances')).not.toThrow();
  });
});
