import { describe, it, expect } from 'vitest';
import { expliquerLeReport } from '../../public/js/utils/explication-solde.js';

/**
 * Un report ne se raconte pas comme une part d'un total
 *
 * La phrase disait « dont X que la conjointe devait déjà au titre des mois
 * précédents », sur la seule existence d'un report, sans regarder ni son sens
 * ni ce qu'il restait à devoir. Trois de ses quatre cas étaient faux.
 *
 * Ces contrôles énumèrent les quatre, parce que c'est l'énumération qui manquait
 * — le code n'avait qu'une branche là où il fallait choisir.
 *
 * Convention de signe, celle de `computeSummary` : positif, la conjointe doit.
 */

/** Le mois de la capture : 39,01 € dus, le mois en rembourse 29,43 € */
const CAPTURE = { carryOver: 39.01, ownBalance: -29.43, finalBalance: 9.58 };

describe('expliquerLeReport', () => {
  describe('sans report', () => {
    it('ne dit rien : le solde EST le mois, il n\'y a rien à composer', () => {
      expect(expliquerLeReport({ carryOver: 0, ownBalance: 50, finalBalance: 50 })).toBe('');
    });

    it('se tait aussi sur un report abîmé, plutôt que d\'inventer', () => {
      expect(expliquerLeReport({ carryOver: undefined, ownBalance: 50, finalBalance: 50 })).toBe('');
      expect(expliquerLeReport({ carryOver: NaN, ownBalance: 50, finalBalance: 50 })).toBe('');
    });
  });

  describe('le mois creuse l\'ardoise — le seul cas où « dont » disait vrai', () => {
    it('additionne les deux composantes vers le total', () => {
      const phrase = expliquerLeReport({ carryOver: 39.01, ownBalance: 20, finalBalance: 59.01 });

      expect(phrase).toContain('dont');
      expect(phrase).toContain('39,01');
      expect(phrase).toContain('20,00');
    });

    it('vaut dans l\'autre sens de dette', () => {
      const phrase = expliquerLeReport({ carryOver: -39.01, ownBalance: -20, finalBalance: -59.01 });

      expect(phrase).toContain('dont');
      expect(phrase).toContain('39,01');
    });
  });

  describe('le mois rembourse l\'ardoise', () => {
    it('ne présente plus une partie plus grande que le tout', () => {
      // Le défaut vu à l'écran : « 9,58 € dont 39,01 € ».
      const phrase = expliquerLeReport(CAPTURE);

      expect(phrase).not.toContain('dont');
      expect(phrase).toContain('39,01');
      expect(phrase).toContain('29,43');
      expect(phrase).toContain('effacé');
    });

    it('dit ce que le mois a effacé, pas ce qui reste — le solde le dit déjà', () => {
      expect(expliquerLeReport(CAPTURE)).not.toContain('9,58');
    });
  });

  describe('le mois solde exactement', () => {
    it('ne contredit plus « Comptes équilibrés » affiché juste au-dessus', () => {
      // Le pire des quatre : l'application annonçait que tout était réglé, puis
      // affirmait dans la même carte qu'il restait une dette.
      const phrase = expliquerLeReport({ carryOver: 39.01, ownBalance: -39.01, finalBalance: 0 });

      expect(phrase).toContain('soldés');
      expect(phrase).not.toContain('dont');
      expect(phrase).not.toContain('doit');
    });

    it('tient sur un solde nul obtenu par arrondi', () => {
      // `computeSummary` arrondit le total au centime ; les composantes, non.
      // Comparer les flottants bruts ferait basculer de cas sur un résidu.
      const phrase = expliquerLeReport({
        carryOver: 39.01, ownBalance: -39.0100001, finalBalance: 0
      });

      expect(phrase).toContain('soldés');
    });
  });

  describe('le mois dépasse l\'ardoise et bascule le sens', () => {
    it('dit que l\'ardoise est soldée et que le reste va dans l\'autre sens', () => {
      const phrase = expliquerLeReport({ carryOver: 39.01, ownBalance: -44.01, finalBalance: -5 });

      expect(phrase).toContain('soldés');
      expect(phrase).toContain('39,01');
      expect(phrase).toContain('autre sens');
      expect(phrase).toContain('5,00');
    });

    it('ne nomme personne : qui doit désormais est déjà dit par le solde', () => {
      // Nommer ici obligerait à faire transiter un prénom dans cette fonction,
      // donc à l'échapper, pour répéter ce que la ligne au-dessus annonce.
      const phrase = expliquerLeReport({ carryOver: -39.01, ownBalance: 44.01, finalBalance: 5 });

      expect(phrase).not.toMatch(/conjointe|vous devez/i);
      expect(phrase).toContain('autre sens');
    });
  });

  describe('le mois ne change rien', () => {
    it('le dit, au lieu de laisser croire que le report vient du mois', () => {
      const phrase = expliquerLeReport({ carryOver: 39.01, ownBalance: 0, finalBalance: 39.01 });

      expect(phrase).toContain('39,01');
      expect(phrase).toContain('rien changé');
      expect(phrase).not.toContain('dont');
    });
  });

  describe('les quatre cas sont couverts', () => {
    it.each([
      ['creuse', { carryOver: 40, ownBalance: 10, finalBalance: 50 }],
      ['rembourse en partie', { carryOver: 40, ownBalance: -10, finalBalance: 30 }],
      ['solde exactement', { carryOver: 40, ownBalance: -40, finalBalance: 0 }],
      ['dépasse et bascule', { carryOver: 40, ownBalance: -50, finalBalance: -10 }],
      ['ne change rien', { carryOver: 40, ownBalance: 0, finalBalance: 40 }]
    ])('« %s » rend une phrase, jamais un vide', (_, entree) => {
      const phrase = expliquerLeReport(entree);
      expect(phrase.length).toBeGreaterThan(0);
      expect(phrase).not.toContain('NaN');
      expect(phrase).not.toContain('undefined');
    });
  });
});
