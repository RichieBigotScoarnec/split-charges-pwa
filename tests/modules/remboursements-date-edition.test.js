// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Les remboursements : datés, modifiables, triés
 *
 * Trois manques de la même famille que la date des charges, trouvés en
 * cherchant « qu'a-t-on encore oublié d'aussi simple ? » :
 *
 *   — un remboursement ne portait aucune date, et rien ne l'affichait ;
 *   — il ne pouvait pas être rouvert, seulement supprimé ;
 *   — la liste n'était pas triée.
 *
 * Le deuxième est le plus gênant : un remboursement déplace le solde. Devoir le
 * supprimer pour corriger une virgule, c'est faire du geste risqué la seule
 * porte de sortie de l'erreur bénigne.
 */

const dbPush = vi.fn(() => Promise.resolve('cle-neuve'));
const dbUpdate = vi.fn(() => Promise.resolve());

vi.mock('../../public/js/db.js', () => ({
  dbPush,
  dbUpdate,
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  getDataPath: vi.fn(path => `household/${path}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(),
  showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));
vi.mock('../../public/js/modules/trash.js', () => ({ refreshTrashButton: vi.fn() }));

const {
  saveReimbursement,
  editReimbursement,
  renderReimbursements,
  showAddReimbursementModal
} = await import('../../public/js/modules/reimbursements.js');
const { setState, resetState } = await import('../../public/js/state.js');
const { dateDuJour } = await import('../../public/js/utils/date.js');

/** Le formulaire de remboursement, tel que le livre FairSplit.html */
const formulaire = `
  <h2 id="modalAddReimbursementTitle">Ajouter Remboursement</h2>
  <input type="hidden" id="reimbursementId" value="" />
  <select id="reimbursementDirection"><option value="vous-to-conjointe" selected>x</option></select>
  <input id="reimbursementAmount" value="50" />
  <input type="date" id="reimbursementDate" value="" />
  <input id="reimbursementNote" value="" />
  <button id="saveReimbursement">Ajouter</button>
  <div id="reimbursementsList"></div><span id="reimbursementsTotal"></span>
`;

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  setState('currentPeriod', '2026-08');
  setState('members', { vous: 'Richard', conjointe: 'Cindy' });
  document.body.innerHTML = formulaire;
});

describe('Un remboursement porte une date', () => {
  it('la date saisie est écrite', async () => {
    document.getElementById('reimbursementDate').value = '2026-08-12';
    await saveReimbursement();

    expect(dbPush.mock.calls.at(-1)[1].date).toBe('2026-08-12');
  });

  it('à défaut, le jour courant', async () => {
    document.getElementById('reimbursementDate').value = '';
    await saveReimbursement();

    expect(dbPush.mock.calls.at(-1)[1].date).toBe(dateDuJour());
  });

  it('la date s\'affiche dans la liste', () => {
    setState('reimbursements', [
      { id: '1', direction: 'vous-to-conjointe', amount: 50, date: '2026-08-12' }
    ]);
    renderReimbursements();

    const jour = document.querySelector('.charge-date');
    expect(jour, 'aucune date rendue sur le remboursement').not.toBeNull();
    expect(jour.textContent).toContain('12');
  });

  it('les remboursements d\'avant ce champ retombent sur leur horodatage', () => {
    setState('reimbursements', [
      {
        id: '1', direction: 'vous-to-conjointe', amount: 50,
        timestamp: new Date(2026, 7, 9, 10, 0).getTime()
      }
    ]);
    renderReimbursements();

    expect(document.querySelector('.charge-date').textContent).toContain('9');
  });
});

describe('Un remboursement se corrige', () => {
  const existant = {
    id: 'r1',
    direction: 'vous-to-conjointe',
    amount: 50,
    note: 'Courses',
    date: '2026-08-12'
  };

  it('la liste propose de le rouvrir', () => {
    setState('reimbursements', [existant]);
    renderReimbursements();

    const bouton = document.querySelector('[data-action="editReimbursement"]');
    expect(bouton, 'aucun bouton de modification').not.toBeNull();
    expect(bouton.dataset.arg).toBe('r1');
  });

  it('la réouverture remplit le formulaire', () => {
    setState('reimbursements', [existant]);
    editReimbursement('r1');

    expect(document.getElementById('reimbursementId').value).toBe('r1');
    expect(document.getElementById('reimbursementAmount').value).toBe('50');
    expect(document.getElementById('reimbursementNote').value).toBe('Courses');
    expect(document.getElementById('reimbursementDate').value).toBe('2026-08-12');
  });

  it('l\'enregistrement modifie au lieu d\'ajouter', async () => {
    // Sans cela, corriger un montant créerait un second remboursement et
    // déplacerait le solde deux fois.
    setState('reimbursements', [existant]);
    editReimbursement('r1');
    document.getElementById('reimbursementAmount').value = '75';

    await saveReimbursement();

    expect(dbPush).not.toHaveBeenCalled();
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    const [chemin, donnees] = dbUpdate.mock.calls.at(-1);
    expect(chemin).toContain('reimbursements/r1');
    expect(donnees.amount).toBe(75);
  });

  it('rouvrir puis fermer sans enregistrer ne fige pas le formulaire suivant', () => {
    // L'identifiant reste sinon dans le champ caché, et le remboursement
    // suivant écraserait celui qu'on venait de consulter.
    setState('reimbursements', [existant]);
    editReimbursement('r1');
    showAddReimbursementModal();

    expect(document.getElementById('reimbursementId').value).toBe('');
  });

  it('le titre et le bouton disent ce qu\'on est en train de faire', () => {
    setState('reimbursements', [existant]);

    editReimbursement('r1');
    expect(document.getElementById('modalAddReimbursementTitle').textContent).toContain('Modifier');
    expect(document.getElementById('saveReimbursement').textContent).toBe('Enregistrer');

    showAddReimbursementModal();
    expect(document.getElementById('modalAddReimbursementTitle').textContent).toContain('Ajouter');
    expect(document.getElementById('saveReimbursement').textContent).toBe('Ajouter');
  });

  it('refuse un identifiant inconnu plutôt que d\'ouvrir un formulaire vide', () => {
    setState('reimbursements', [existant]);
    editReimbursement('inexistant');

    expect(document.getElementById('reimbursementId').value).toBe('');
  });
});

describe('La liste est triée', () => {
  it('du plus récent au plus ancien', () => {
    setState('reimbursements', [
      { id: 'a', direction: 'vous-to-conjointe', amount: 10, date: '2026-08-03' },
      { id: 'c', direction: 'vous-to-conjointe', amount: 30, date: '2026-08-20' },
      { id: 'b', direction: 'vous-to-conjointe', amount: 20, date: '2026-08-11' }
    ]);
    renderReimbursements();

    const rendus = [...document.querySelectorAll('[data-action="editReimbursement"]')]
      .map(b => b.dataset.arg);
    expect(rendus).toEqual(['c', 'b', 'a']);
  });

  it('le total ne dépend pas de l\'ordre', () => {
    // Une somme est commutative : le tri ne doit rien changer aux montants.
    setState('reimbursements', [
      { id: 'a', direction: 'vous-to-conjointe', amount: 10, date: '2026-08-03' },
      { id: 'b', direction: 'conjointe-to-vous', amount: 30, date: '2026-08-20' }
    ]);
    renderReimbursements();

    expect(document.getElementById('reimbursementsTotal').textContent).toMatch(/20/);
  });
});
