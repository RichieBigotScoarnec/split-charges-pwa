// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Une ligne de charge porte son étiquette d'enveloppe UNE fois
 *
 * `fixed-charges.js` appelait `etiquetteEnveloppe(charge)` deux fois de suite
 * dans le même gabarit : toute charge fixe rattachée à une enveloppe affichait
 * « 🏖️ Vacances 🏖️ Vacances ». La liste variable, elle, ne l'appelle qu'une
 * fois — les deux gabarits avaient divergé, dans le sens le plus discret qui
 * soit, puisqu'une répétition ne ressemble pas à une panne.
 *
 * ## Pourquoi personne ne l'a vu
 *
 * `etiquetteEnveloppe` est éprouvée sous tous ses angles — `enveloppes-ecran.js`
 * la monte pour de vrai. Mais **les quatre suites qui rendent une liste la
 * bouchonnent à la chaîne vide.** Or `'' + ''` se lit exactement comme `''` :
 * le défaut était couvert par un rendu, mesuré par un test, et invisible aux
 * deux. C'est encore le motif de ce dépôt — la fonction pure blindée, le
 * câblage nu — et cette fois le bouchon lui-même était l'angle mort.
 *
 * Le témoin de la pastille de répartition, écrit une heure plus tôt sur ces
 * deux mêmes gabarits, ne pouvait pas le voir non plus : il bouchonne pareil.
 * Le défaut a été trouvé à l'œil, en relisant le bloc. C'est ce qui justifie
 * cette suite-ci : ici, l'étiquette rend du vrai balisage.
 *
 * ## La propriété, et pourquoi elle vaut pour les deux listes
 *
 * Une charge n'a qu'une enveloppe : sa ligne le dit une fois. La propriété est
 * jouée sur les DEUX listes — c'est une divergence de copie qu'on referme, et
 * n'en tenir qu'une laisserait la jumelle libre de dériver à son tour.
 */

vi.mock('../../public/js/db.js', () => ({
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve()),
  dbPush: vi.fn(() => Promise.resolve('cle')),
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
vi.mock('../../public/js/modules/summary.js', () => ({
  calculateSummary: vi.fn(() => ({ balance: 0 }))
}));
vi.mock('../../public/js/modules/trash.js', () => ({ refreshTrashButton: vi.fn() }));
vi.mock('../../public/js/modules/map.js', () => ({ refreshMapButton: vi.fn() }));
vi.mock('../../public/js/modules/trends.js', () => ({ invalidateTrends: vi.fn() }));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategoryIcon: vi.fn(() => '🏠'),
  getCategories: vi.fn(() => [{ id: 'maison', icon: '🏠', label: 'Maison' }]),
  populateCategorySelect: vi.fn(),
  populateDestinationSelect: vi.fn()
}));

// L'étiquette rend du VRAI balisage, et c'est tout l'objet de cette suite.
// Bouchonnée à la chaîne vide comme partout ailleurs, elle ne mesurerait rien :
// c'est exactement ainsi que la duplication a survécu.
vi.mock('../../public/js/modules/envelopes.js', () => ({
  populateEnvelopeSelect: vi.fn(),
  etiquetteEnveloppe: vi.fn(charge => (charge && charge.envelope
    ? '<span class="charge-enveloppe">🏖️ Vacances</span>'
    : ''))
}));

const { renderVariableCharges } = await import('../../public/js/modules/variable-charges.js');
const { renderFixedCharges } = await import('../../public/js/modules/fixed-charges.js');
const { setState, resetState } = await import('../../public/js/state.js');

const CHARGES = [
  {
    id: 'rattachee', amount: 300, description: 'Camping', category: 'Maison',
    paidBy: 'vous', envelope: 'vacances-ete'
  },
  {
    id: 'libre', amount: 100, description: 'Internet', category: 'Maison',
    paidBy: 'vous'
  }
];

const LISTES = [
  { nom: 'charges variables', etat: 'variableCharges', rendre: renderVariableCharges },
  { nom: 'charges fixes', etat: 'fixedCharges', rendre: renderFixedCharges }
];

/** La ligne d'une charge, telle que la liste vient de la peindre */
function ligne(id) {
  return document.querySelector(`.charge-item[data-id="${id}"]`);
}

beforeEach(() => {
  resetState();
  document.body.innerHTML = `
    <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
    <div id="fixedChargesList"></div><span id="fixedChargesTotal"></span>
  `;
  setState('currentPeriod', '2026-09');
});

describe.each(LISTES)('L\'étiquette d\'enveloppe ne se répète pas — $nom', ({ etat, rendre }) => {
  beforeEach(() => {
    setState(etat, CHARGES);
    rendre();
  });

  it('une charge rattachée porte son enveloppe UNE seule fois', () => {
    const etiquettes = ligne('rattachee').querySelectorAll('.charge-enveloppe');

    expect(
      etiquettes.length,
      'une charge n\'a qu\'une enveloppe : sa ligne doit le dire une fois, '
      + `et cette ligne le dit ${etiquettes.length} fois`
    ).toBe(1);
  });

  it('TÉMOIN — une charge sans enveloppe n\'en porte aucune', () => {
    // Sans lui, poser l'étiquette sur toutes les lignes satisferait le
    // contrôle précédent et l'étiquette cesserait de distinguer quoi que ce soit.
    expect(ligne('libre').querySelectorAll('.charge-enveloppe')).toHaveLength(0);

    // Et sur la liste entière : une étiquette de trop, où qu'elle soit posée.
    expect(document.querySelectorAll('.charge-enveloppe')).toHaveLength(1);
  });
});
