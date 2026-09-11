// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn()
}));
// Le panneau privé se remplit par une lecture en base, asynchrone : ici on ne
// mesure que la tête, qui est rendue avant. Le laisser courir ferait survivre
// une chaîne à la fin du fichier — le motif de `fuite-post-demontage`.
vi.mock('../../public/js/modules/prive.js', () => ({ remplirLePanneauPrive: vi.fn() }));

import { setState, resetState } from '../../public/js/state.js';
import { calculateSummary } from '../../public/js/modules/summary.js';
import { formatCurrency } from '../../public/js/utils/format.js';
import { PORTEES } from '../../public/js/utils/portee.js';

/**
 * La hiérarchie du bilan — la créance en tête, sur « À deux » seulement
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE FICHIER A CHANGÉ DE SUJET EN GARDANT SON ARGUMENT — lot D, 2026-09-11
 *
 * Il tenait l'inverse : « le bilan ouvre sur ce qui est COMMUN, l'écart vient
 * après » — la décision du 2026-08-31, pour laquelle « une application de
 * couple qui ouvre sur une créance transforme une organisation commune en
 * comptabilité ». Elle est révoquée (`CLAUDE.md`, *Design*, 2026-09-10). Ses
 * contrôles ne sont pas supprimés : ils sont réécrits sur la nouvelle
 * hiérarchie, et ce qu'ils protégeaient survit, mot pour mot quand c'est
 * possible :
 *
 *   1. La tête porte la CRÉANCE sur « À deux » — et seulement là.
 *   2. Le fait symétrique RESTE, au rang 3 : « Dépensé à deux », le total.
 *   3. La tête dit le solde SANS CONDITION, y compris à zéro. `barre-solde.js`
 *      se tait sur la seule géométrie de `.summary-balance` : un bilan qui,
 *      dans un cas, ne porterait plus le solde laisserait « Comptes
 *      équilibrés » nulle part.
 *   4. La barre collante et la tête annoncent le MÊME montant.
 *   5. Le mois du total est nommé selon son ÉTAT.
 *   6. La phrase est dite à la personne qui tient le téléphone — et le reste à
 *      vivre est le sien.
 */

const SALAIRES = { vous: 3000, conjointe: 1000 };
const MEMBRES = { vous: 'Richard', conjointe: 'Cindy' };

/** Une charge avancée par une seule personne : c'est ce qui crée l'écart */
const charge = (id, amount, paidBy = 'vous') => ({
  id, description: 'Courses', amount, category: 'Maison',
  paidBy, deleted: false, date: '2026-08-04'
});

/** Le 10 août 2026 : le mois en cours est donc « 2026-08 » */
const LE_10_AOUT = new Date(2026, 7, 10, 12, 0, 0);

/**
 * 1 000 € avancés par Richard, salaires 3000/1000 : sa part est de 750 €,
 * celle de Cindy de 250 €. Le solde vaut +250 — Cindy doit 250 € à Richard.
 */
function bilanRendu({
  mois = '2026-08', charges = [charge('v1', 1000)], membres = MEMBRES, moi = 'vous', portee
} = {}) {
  resetState();
  setState('currentPeriod', mois);
  setState('salaries', SALAIRES);
  setState('variableCharges', charges);
  setState('fixedCharges', []);
  setState('reimbursements', []);
  setState('shareMode', 'prorata');
  setState('members', membres);
  setState('emplacementCourant', moi);
  if (portee) setState('porteeCourante', portee);

  calculateSummary();

  const bilan = document.getElementById('summarySection');
  return {
    bilan,
    barre: document.getElementById('balanceBar'),
    tete: bilan.querySelector('.bilan-heros')
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

  describe('LA TÊTE PORTE LA CRÉANCE', () => {
    it('sous le libellé « Solde du mois », avec le montant du solde', () => {
      const { tete } = bilanRendu();

      expect(tete.querySelector('.bilan-tete').textContent.trim()).toBe('Solde du mois');
      expect(tete.querySelector('.bilan-heros-montant').textContent).toBe(formatCurrency(250));
      expect(tete.classList.contains('bilan-heros--creance')).toBe(true);
    });

    it('dite à qui tient le téléphone : le créancier lit « Cindy te doit »', () => {
      const { tete } = bilanRendu({ moi: 'vous' });
      expect(tete.querySelector('.bilan-heros-phrase').textContent).toContain('Cindy te doit');
    });

    it('et le débiteur lit « Tu dois … à Richard » — la même dette, le même montant', () => {
      const { tete } = bilanRendu({ moi: 'conjointe' });
      const phrase = tete.querySelector('.bilan-heros-phrase').textContent;

      expect(phrase).toContain('Tu dois');
      expect(phrase).toContain('à Richard');
      expect(tete.querySelector('.bilan-heros-montant').textContent).toBe(formatCurrency(250));
    });

    it('le témoin de `barre-solde.js` est la PHRASE du solde — pas la carte entière', () => {
      // La barre se tait tant que les deux tiers de ce témoin sont à l'écran.
      // Posé sur la carte, il englobait le grand-livre ouvert : à 1280 × 720
      // un tiers seulement était visible, et la barre répétait le solde
      // au-dessus de la phrase qui le disait (`data-flow:786`, mesuré rouge).
      const { bilan, tete } = bilanRendu();
      const temoins = bilan.querySelectorAll('.summary-balance');

      expect(temoins).toHaveLength(1);
      expect(tete.contains(temoins[0])).toBe(true);
      expect(temoins[0].querySelector('.bilan-heros-montant')).not.toBeNull();
      expect(temoins[0].querySelector('.summary-details')).toBeNull();
    });
  });

  describe('LE FAIT SYMÉTRIQUE RESTE, AU RANG 3', () => {
    it('le total commun est dans « Dépensé à deux », jamais en tête', () => {
      // 1 000 € de charges, solde de 250 € : le mutant qui remet le total en
      // tête fait tomber ce contrôle, et celui qui met le solde en carte 3 aussi.
      const { bilan, tete } = bilanRendu();
      const commun = bilan.querySelector('.carte-tete--commun');

      expect(commun.querySelector('.carte-tete-montant').textContent).toBe(formatCurrency(1000));
      expect(tete.querySelector('.bilan-heros-montant').textContent).not.toBe(formatCurrency(1000));
    });

    it('il vient APRÈS la tête, et après le reste à vivre', () => {
      const { bilan, tete } = bilanRendu();
      const reste = bilan.querySelector('.carte-tete--reste');
      const commun = bilan.querySelector('.carte-tete--commun');
      const suit = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

      expect(suit(tete, reste)).toBe(true);
      expect(suit(reste, commun)).toBe(true);
    });

    it('il dit combien de charges il additionne', () => {
      const { bilan } = bilanRendu({ charges: [charge('v1', 600), charge('v2', 400)] });
      expect(bilan.querySelector('.carte-tete--commun').textContent).toContain('Sur 2 charges communes');
    });
  });

  describe('LA BARRE COLLANTE', () => {
    it('garde le verbe « devoir », et le montant de la tête', () => {
      const { barre, tete } = bilanRendu();

      expect(barre.textContent).toContain('doit');
      expect(barre.textContent).toContain(tete.querySelector('.bilan-heros-montant').textContent);
    });
  });

  describe('À SOLDE NUL, LA TÊTE LE DIT QUAND MÊME', () => {
    const EQUILIBRE = [charge('v1', 750, 'vous'), charge('v2', 250, 'conjointe')];

    it('« Comptes équilibrés », sans montant et sans ambre', () => {
      const { tete } = bilanRendu({ charges: EQUILIBRE });

      expect(tete.textContent).toContain('Comptes équilibrés');
      expect(tete.querySelector('.bilan-heros-montant')).toBeNull();
      expect(tete.classList.contains('bilan-heros--creance')).toBe(false);
    });

    it('et la barre s\'accorde : personne n\'est nommé', () => {
      const { barre } = bilanRendu({ charges: EQUILIBRE });
      expect(barre.textContent).toContain('Comptes équilibrés');
    });

    it('le total, lui, reste affiché au rang 3', () => {
      const { bilan } = bilanRendu({ charges: EQUILIBRE });
      expect(bilan.querySelector('.carte-tete--commun .carte-tete-montant').textContent)
        .toBe(formatCurrency(1000));
    });
  });

  describe('LA CRÉANCE N\'EST EN TÊTE QUE SUR « À DEUX »', () => {
    it('Solo : un total neutre, jamais la créance ni le verbe', () => {
      const { tete } = bilanRendu({ portee: PORTEES.SOLO });

      expect(tete.querySelector('.bilan-tete').textContent.trim()).toBe('Mes dépenses solo');
      expect(tete.classList.contains('bilan-heros--creance')).toBe(false);
      // La PHRASE, pas la note — qui dit « personne ne doit rien à personne ».
      expect(tete.querySelector('.bilan-heros-phrase').textContent).not.toMatch(/\bdoi[st]\b/);
    });

    it('Privé : aucun chiffre dans la tête', () => {
      const { tete } = bilanRendu({ portee: PORTEES.PRIVE });

      expect(tete.querySelector('.bilan-tete').textContent.trim()).toBe('Mon espace privé');
      expect(tete.textContent).not.toMatch(/\d/);
      // Témoin : la même sonde, sur la tête « À deux », trouve bien un chiffre.
      expect(bilanRendu().tete.textContent).toMatch(/\d/);
    });
  });

  describe('LE MOIS DU TOTAL EST NOMMÉ SELON SON ÉTAT', () => {
    it('un mois révolu porte son nom', () => {
      const { bilan } = bilanRendu({ mois: '2026-07' });
      const libelle = bilan.querySelector('.carte-tete--commun .bilan-tete').textContent;

      expect(libelle).toContain('juillet 2026');
    });

    it('un mois à venir est « engagé », jamais « dépensé »', () => {
      // Le sélecteur propose un mois d'avance, où la reconduction a pu inscrire
      // les charges fixes dès le premier. Le rapport a payé cette leçon en
      // annonçant « 1 090 € de moins qu'un mois ordinaire » pour un mois qui
      // n'avait pas commencé.
      const { bilan } = bilanRendu({ mois: '2026-09' });
      const libelle = bilan.querySelector('.carte-tete--commun .bilan-tete').textContent;

      expect(libelle).toContain('Déjà engagé');
      expect(libelle).toContain('septembre 2026');
      expect(libelle).not.toContain('Dépensé');
    });
  });

  describe('LE RESTE À VIVRE EST CELUI DE QUI TIENT LE TÉLÉPHONE', () => {
    it('Richard : 3 000 − 750 ; Cindy : 1 000 − 250 — deux chiffres que le jeu d\'essai sépare', () => {
      // Le calcul portait sur `vous` quel que soit le compte : ce cas l'aurait
      // vu, parce que les deux réponses diffèrent. Sur des revenus égaux, il
      // serait vert sur le défaut.
      const chezRichard = bilanRendu({ moi: 'vous' }).bilan
        .querySelector('.carte-tete--reste .carte-tete-montant').textContent;
      const chezCindy = bilanRendu({ moi: 'conjointe' }).bilan
        .querySelector('.carte-tete--reste .carte-tete-montant').textContent;

      expect(chezRichard).toBe(formatCurrency(2250));
      expect(chezCindy).toBe(formatCurrency(750));
    });
  });

  it('un prénom saisi est échappé, dans la tête comme dans la barre', () => {
    const { bilan, barre, tete } = bilanRendu({
      membres: { vous: 'Richard', conjointe: '<img src=x onerror=alert(1)>' }
    });

    // Le prénom est du contenu saisi par le foyer : il ne doit jamais entrer
    // dans le HTML sans passer par `escapeHtml`.
    expect(bilan.querySelector('img')).toBe(null);
    expect(barre.querySelector('img')).toBe(null);
    expect(tete.textContent).toContain('te doit');
  });
});
