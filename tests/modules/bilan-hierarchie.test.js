// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn()
}));

import { setState, resetState } from '../../public/js/state.js';
import { calculateSummary } from '../../public/js/modules/summary.js';
import { describeBalance } from '../../public/js/utils/members.js';
import { formatCurrency } from '../../public/js/utils/format.js';

/**
 * Le bilan ouvre sur ce qui est COMMUN, l'écart vient après
 *
 * La première ligne du premier écran disait « Conjointe vous doit 408,37 € »,
 * en 28 px, répétée par la barre collante tout du long. Le calcul est juste ;
 * le cadrage était un choix, et ce choix n'avait jamais été fait — il était
 * arrivé par défaut. Une application de couple qui ouvre sur une créance
 * transforme une organisation commune en comptabilité entre deux parties, et
 * c'est celui des deux qui doit qui le lit chaque jour.
 *
 * Ce que ces contrôles tiennent :
 *
 *   1. La tête porte le TOTAL, pas le solde.
 *   2. L'écart reste entier, nommé, et RENDU SANS CONDITION — y compris à zéro.
 *      `barre-solde.js` masque la barre collante sur la seule géométrie de
 *      `.summary-balance`, sur la prémisse « le bilan dit déjà la même chose » :
 *      un bilan qui, dans un cas, ne porterait plus le solde rendrait cette
 *      prémisse fausse en silence, et « Comptes équilibrés » ne serait alors
 *      NULLE PART à l'écran.
 *   3. La barre garde le verbe « devoir », mot juste au moment de régler.
 *   4. Le mois est nommé selon son ÉTAT : « ce mois » ne vaut que du mois en
 *      cours, et le sélecteur en propose un d'avance.
 *   5. Aucun chiffre ne change : les deux surfaces lisent la même fabrique.
 */

const SALAIRES = { vous: 3000, conjointe: 1000 };

/** Une charge avancée par une seule personne : c'est ce qui crée l'écart */
const charge = (id, amount, paidBy = 'vous') => ({
  id, description: 'Courses', amount, category: 'Maison',
  paidBy, deleted: false, date: '2026-08-04'
});

/** Le 10 août 2026 : le mois en cours est donc « 2026-08 » */
const LE_10_AOUT = new Date(2026, 7, 10, 12, 0, 0);

function bilanRendu({ mois = '2026-08', charges = [charge('v1', 1000)], membres } = {}) {
  resetState();
  setState('currentPeriod', mois);
  setState('salaries', SALAIRES);
  setState('variableCharges', charges);
  setState('fixedCharges', []);
  setState('reimbursements', []);
  setState('shareMode', 'prorata');
  if (membres) setState('members', membres);

  calculateSummary();

  return {
    bilan: document.getElementById('summarySection'),
    barre: document.getElementById('balanceBar')
  };
}

describe('La hiérarchie du bilan', () => {
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
  });

  it('ouvre sur le total commun, pas sur la créance', () => {
    const { bilan } = bilanRendu();

    const tete = bilan.querySelector('.bilan-tete');
    const montant = bilan.querySelector('.summary-balance > strong');

    expect(tete.textContent.trim()).toBe('Ensemble ce mois');
    expect(montant.textContent).toBe(formatCurrency(1000));
  });

  it('le montant de tête est le TOTAL des charges, jamais le solde', () => {
    // 1 000 € de charges, salaires 3000/1000 → part de 750 €, solde 250 €.
    // Le mutant qui met `finalBalance` en tête fait tomber ce contrôle.
    const { bilan } = bilanRendu();
    const montant = bilan.querySelector('.summary-balance > strong').textContent;

    expect(montant).toBe(formatCurrency(1000));
    expect(montant).not.toBe(formatCurrency(250));
  });

  it('range l\'écart juste en dessous, entier et nommé', () => {
    const { bilan } = bilanRendu();
    const ecart = bilan.querySelector('.bilan-ecart');

    expect(ecart).not.toBe(null);
    expect(ecart.textContent).toContain('À rééquilibrer');
    expect(ecart.querySelector('.bilan-ecart-montant').textContent)
      .toBe(formatCurrency(250));
    // Le sens vient de `describeBalance`, la fabrique unique : le rendu ne
    // rédige pas une seconde façon de dire qui doit à qui.
    expect(ecart.textContent).toContain(describeBalance(250, null).sens);
  });

  it('la barre collante, elle, garde le verbe « devoir »', () => {
    // C'est le mot juste au moment de régler, et la barre est ce qui rappelle
    // le solde pendant qu'on parcourt les charges. Le mutant qui lui donne la
    // phrase du bilan fait tomber ce contrôle — et briserait la raison d'être
    // de la barre.
    const { barre } = bilanRendu();

    expect(barre.textContent).toContain('doit');
    expect(barre.textContent).toContain(formatCurrency(250));
    expect(barre.textContent).not.toContain('Ensemble ce mois');
  });

  it('les deux surfaces annoncent le MÊME montant', () => {
    const { bilan, barre } = bilanRendu();

    const surLeBilan = bilan.querySelector('.bilan-ecart-montant').textContent;
    expect(barre.textContent).toContain(surLeBilan);
  });

  describe('À SOLDE NUL, LE BILAN LE DIT QUAND MÊME', () => {
    // Sans cette ligne, `.summary-balance` ne porterait plus le solde ; la barre
    // collante se masquerait sur sa géométrie, en croyant que le bilan dit la
    // même chose ; et « Comptes équilibrés » ne serait nulle part.
    const EQUILIBRE = [charge('v1', 750, 'vous'), charge('v2', 250, 'conjointe')];

    it('rend l\'écart même quand il n\'y a rien à rééquilibrer', () => {
      const { bilan } = bilanRendu({ charges: EQUILIBRE });
      const ecart = bilan.querySelector('.bilan-ecart');

      expect(ecart).not.toBe(null);
      expect(ecart.textContent).toContain('Comptes équilibrés');
    });

    it('et les deux surfaces s\'accordent : personne n\'est nommé', () => {
      const { bilan, barre } = bilanRendu({ charges: EQUILIBRE });

      expect(bilan.querySelector('.bilan-ecart').textContent).toContain('rien à se rembourser');
      expect(barre.textContent).toContain('Comptes équilibrés');
      // `describeBalance` ne nomme personne à zéro : il n'y a rien à faire
      // correspondre, et exiger un nom serait insatisfaisable.
      expect(describeBalance(0, null).sens).toBe('');
    });

    it('le total de tête, lui, reste affiché', () => {
      const { bilan } = bilanRendu({ charges: EQUILIBRE });

      expect(bilan.querySelector('.summary-balance > strong').textContent)
        .toBe(formatCurrency(1000));
    });
  });

  describe('LE MOIS EST NOMMÉ SELON SON ÉTAT', () => {
    it('un mois révolu porte son nom, pas « ce mois »', () => {
      const { bilan } = bilanRendu({ mois: '2026-07' });

      expect(bilan.querySelector('.bilan-tete').textContent).toContain('juillet 2026');
      expect(bilan.querySelector('.bilan-tete').textContent).not.toContain('ce mois');
    });

    it('un mois à venir est « engagé », jamais « dépensé »', () => {
      // Le sélecteur propose un mois d'avance, où la reconduction a pu inscrire
      // les charges fixes dès le premier. Le rapport a payé cette leçon en
      // annonçant « 1 090 € de moins qu'un mois ordinaire » pour un mois qui
      // n'avait pas commencé.
      const { bilan } = bilanRendu({ mois: '2026-09' });
      const tete = bilan.querySelector('.bilan-tete').textContent;

      expect(tete).toContain('Déjà engagé');
      expect(tete).toContain('septembre 2026');
    });
  });

  it('un prénom saisi se retrouve dans les deux surfaces, échappé', () => {
    const { bilan, barre } = bilanRendu({
      membres: { vous: 'Richard', conjointe: '<img src=x onerror=alert(1)>' }
    });

    // Le prénom est du contenu saisi par le foyer : il ne doit jamais entrer
    // dans le HTML sans passer par `escapeHtml`.
    expect(bilan.querySelector('img')).toBe(null);
    expect(barre.querySelector('img')).toBe(null);
    expect(bilan.querySelector('.bilan-ecart').textContent).toContain('Richard');
  });
});
