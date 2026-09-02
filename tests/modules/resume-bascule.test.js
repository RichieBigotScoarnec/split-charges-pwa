// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn()
}));

import { setState, resetState } from '../../public/js/state.js';
import { calculateSummary, basculerResume } from '../../public/js/modules/summary.js';
import { formatCurrency } from '../../public/js/utils/format.js';

/**
 * Le résumé porte DEUX questions, et une seule avait un chiffre
 *
 * « Qui doit combien à qui » est la question du foyer. « Qu'est-ce que ce mois
 * me coûte » est la mienne, et elle n'existait nulle part : ma part et mes
 * charges solo étaient calculées séparément, leur somme jamais.
 *
 * Ce que ces contrôles tiennent :
 *
 *   1. L'application ouvre sur le foyer. Mémoriser l'onglet à travers les
 *      rechargements ferait ouvrir sur un écran où un solde impayé n'apparaît
 *      nulle part.
 *   2. Un repère sur « À deux » tant qu'un solde reste dû — c'est ce qui rend
 *      la mémoire de session acceptable.
 *   3. Le panneau personnel ne porte AUCUN chiffre du foyer. C'est la raison
 *      d'être de la bascule : un onglet qui redit l'autre n'en a plus.
 *   4. Il n'écrit pas `.summary-balance`. `barre-solde.js` s'en sert comme
 *      témoin pour se taire ; l'écrire ici ferait taire la barre sur un écran
 *      qui ne porte aucune dette.
 *   5. L'état actif se lit sur `aria-selected` : impossible de peindre un
 *      onglet actif sans l'annoncer.
 */

const SALAIRES = { vous: 3000, conjointe: 1000 };

const commune = (id, amount, paidBy = 'vous') => ({
  id, description: 'Courses', amount, category: 'Maison',
  paidBy, deleted: false, date: '2026-08-04'
});

const solo = (id, amount, paidBy = 'vous') => ({
  ...commune(id, amount, paidBy), description: 'Salle de sport', perimetre: 'solo'
});

const LE_10_AOUT = new Date(2026, 7, 10, 12, 0, 0);

/**
 * Prorata 75/25, 1 000 € de commun avancés par vous, 100 € de solo.
 *
 *   ma part du commun  750,00     mes revenus       3 000,00
 *   mes charges solo   100,00     engagé              850,00
 *   reste à vivre    2 150,00     taux d'effort        28,3 %
 */
function resumeRendu({ onglet = 'duo', charges, salaires = SALAIRES, mode = 'prorata' } = {}) {
  resetState();
  setState('currentPeriod', '2026-08');
  setState('salaries', salaires);
  setState('variableCharges', charges ?? [commune('v1', 1000), solo('s1', 100)]);
  setState('fixedCharges', []);
  setState('reimbursements', []);
  setState('shareMode', mode);

  // L'onglet est une variable de module : il survit d'un contrôle à l'autre.
  basculerResume(onglet);
  calculateSummary();

  const bilan = document.getElementById('summarySection');
  return {
    bilan,
    texte: bilan.textContent,
    duo: bilan.querySelector('#resumePanneauDuo'),
    solo: bilan.querySelector('#resumePanneauSolo'),
    ongletDuo: bilan.querySelector('#resumeOngletDuo'),
    ongletSolo: bilan.querySelector('#resumeOngletSolo')
  };
}

describe('La bascule du résumé', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="summarySection"></div>
      <div id="balanceBar"></div>
      <div id="categoryBudgets"></div>
      <section id="trendsSection"></section>
    `;
    vi.useFakeTimers();
    vi.setSystemTime(LE_10_AOUT);
  });

  afterEach(() => {
    vi.useRealTimers();
    basculerResume('duo');
  });

  describe('l\'ouverture', () => {
    it('ouvre sur le foyer, jamais sur le suivi personnel', () => {
      const { duo, solo: panneauSolo, ongletDuo } = resumeRendu();

      expect(duo).not.toBeNull();
      expect(panneauSolo).toBeNull();
      expect(ongletDuo.getAttribute('aria-selected')).toBe('true');
    });

    it('porte le total du foyer en tête, comme avant la bascule', () => {
      const { texte } = resumeRendu();
      expect(texte).toContain(formatCurrency(1000));
    });
  });

  describe('le repère de solde', () => {
    it('marque « À deux » tant qu\'un solde reste dû', () => {
      const { ongletDuo } = resumeRendu();
      expect(ongletDuo.querySelector('.resume-onglet-repere')).not.toBeNull();
    });

    it('reste visible depuis l\'onglet personnel — sinon la dette disparaîtrait', () => {
      const { ongletDuo } = resumeRendu({ onglet: 'solo' });
      expect(ongletDuo.querySelector('.resume-onglet-repere')).not.toBeNull();
    });

    it('disparaît quand les comptes sont équilibrés', () => {
      // Chacun avance sa part exacte : rien à se rembourser.
      const { ongletDuo } = resumeRendu({
        charges: [commune('v1', 750, 'vous'), commune('v2', 250, 'conjointe')]
      });
      expect(ongletDuo.querySelector('.resume-onglet-repere')).toBeNull();
    });
  });

  describe('le panneau personnel', () => {
    it('affiche le reste à vivre et le taux d\'effort', () => {
      const { texte } = resumeRendu({ onglet: 'solo' });

      expect(texte).toContain(formatCurrency(2150));
      expect(texte).toContain('Reste à vivre hors privé');
      expect(texte).toContain('28');
    });

    it('dit que les dépenses privées n\'en sont pas déduites', () => {
      const { texte } = resumeRendu({ onglet: 'solo' });
      expect(texte).toContain('privées n\'en sont pas déduites');
    });

    it('affiche mes charges solo, et dit qu\'elles sont visibles', () => {
      const { texte } = resumeRendu({ onglet: 'solo' });
      expect(texte).toContain(formatCurrency(100));
      expect(texte).toContain('visible de');
    });

    it('ne porte AUCUN chiffre du foyer', () => {
      const { texte } = resumeRendu({ onglet: 'solo' });

      // Le total du foyer, la part due, le geste de règlement : tout cela
      // appartient à l'autre question.
      expect(texte).not.toContain(formatCurrency(1000));
      expect(texte).not.toContain(formatCurrency(750));
      expect(texte).not.toContain('Régler ce solde');
    });

    it('n\'écrit pas `.summary-balance` — la barre collante doit reprendre le relais', () => {
      const { bilan } = resumeRendu({ onglet: 'solo' });
      expect(bilan.querySelector('.summary-balance')).toBeNull();
    });

    it('demande les revenus plutôt que d\'inventer un reste à vivre', () => {
      // Le 50-50 ne réclame aucun salaire — c'est souvent la raison de son
      // choix. Le bilan se calcule ; le versant personnel, lui, n'a rien à
      // diviser, et le dit pour lui seul.
      const { texte, bilan } = resumeRendu({
        onglet: 'solo', salaires: { vous: 0, conjointe: 0 }, mode: '50-50'
      });

      expect(texte).toContain('Renseignez vos revenus');
      expect(bilan.querySelector('[data-action="focusSalaries"]')).not.toBeNull();
      expect(texte).not.toContain('Reste à vivre hors privé');
    });
  });

  describe('l\'annonce de l\'onglet actif', () => {
    it('bascule `aria-selected` des deux côtés', () => {
      const enSolo = resumeRendu({ onglet: 'solo' });
      expect(enSolo.ongletSolo.getAttribute('aria-selected')).toBe('true');
      expect(enSolo.ongletDuo.getAttribute('aria-selected')).toBe('false');

      const enDuo = resumeRendu({ onglet: 'duo' });
      expect(enDuo.ongletDuo.getAttribute('aria-selected')).toBe('true');
      expect(enDuo.ongletSolo.getAttribute('aria-selected')).toBe('false');
    });

    it('garde les deux onglets atteignables depuis l\'un et l\'autre', () => {
      const { ongletDuo, ongletSolo } = resumeRendu({ onglet: 'solo' });
      expect(ongletDuo).not.toBeNull();
      expect(ongletSolo).not.toBeNull();
    });
  });
});
