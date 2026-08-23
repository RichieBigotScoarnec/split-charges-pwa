// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * La date, du formulaire jusqu'à la liste
 *
 * Signalé à l'usage : « il manque la date de la transaction ». Le défaut
 * traversait toute la chaîne — pas de champ pour la saisir, pas d'écriture en
 * base depuis les formulaires complets, pas d'affichage.
 *
 * `tests/utils/date-des-charges.test.js` couvre le calcul. Ici, le parcours
 * réel : ce que le formulaire écrit, et ce que la liste montre.
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
  showModal: vi.fn(),
  closeModal: vi.fn(),
  showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));
vi.mock('../../public/js/modules/trash.js', () => ({ refreshTrashButton: vi.fn() }));
vi.mock('../../public/js/modules/map.js', () => ({ refreshMapButton: vi.fn() }));
vi.mock('../../public/js/modules/trends.js', () => ({ invalidateTrends: vi.fn() }));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategoryIcon: vi.fn(() => '🛒'),
  populateCategorySelect: vi.fn(),
  populateDestinationSelect: vi.fn()
}));
vi.mock('../../public/js/modules/envelopes.js', () => ({
  populateEnvelopeSelect: vi.fn(),
  etiquetteEnveloppe: vi.fn(() => '')
}));

const {
  saveVariableCharge,
  renderVariableCharges,
  editVariableCharge,
  showAddVariableChargeModal
} = await import('../../public/js/modules/variable-charges.js');
const { saveFixedCharge, renderFixedCharges } = await import('../../public/js/modules/fixed-charges.js');
const { setState, resetState } = await import('../../public/js/state.js');
const { dateDuJour } = await import('../../public/js/utils/date.js');

/** Le formulaire de charge variable, tel que le livre FairSplit.html */
const formulaireVariable = `
  <input type="hidden" id="variableChargeId" value="" />
  <input id="variableChargeDescription" value="Courses" />
  <input id="variableChargeAmount" value="42,50" />
  <input type="date" id="variableChargeDate" value="" />
  <select id="variableChargeCategory"><option value="Courses" selected>Courses</option></select>
  <select id="variableChargePaidBy"><option value="vous" selected>Vous</option></select>
  <select id="variableChargeEnvelope"><option value="" selected></option></select>
  <input type="checkbox" id="variableChargeSplitToggle" />
  <div id="variableChargeSplitOptions"></div>
  <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
`;

/** Le formulaire de charge fixe */
const formulaireFixe = `
  <input type="hidden" id="fixedChargeId" value="" />
  <input id="fixedChargeDescription" value="Loyer" />
  <input id="fixedChargeAmount" value="900" />
  <input type="date" id="fixedChargeDate" value="" />
  <select id="fixedChargeCategory"><option value="Maison" selected>Maison</option></select>
  <select id="fixedChargePaidBy"><option value="vous" selected>Vous</option></select>
  <select id="fixedChargeDestination"><option value="" selected></option></select>
  <select id="fixedChargeEnvelope"><option value="" selected></option></select>
  <input type="checkbox" id="fixedChargeRecurring" checked />
  <input type="checkbox" id="fixedChargeSplitToggle" />
  <div id="fixedChargeSplitOptions"></div>
  <div id="fixedChargesList"></div><span id="fixedChargesTotal"></span>
`;

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  setState('currentPeriod', '2026-08');
});

/** Les données passées à la dernière écriture */
const derniereEcriture = () => dbPush.mock.calls.at(-1)[1];

describe('Ce que le formulaire écrit', () => {
  it('une charge variable porte la date saisie', async () => {
    document.body.innerHTML = formulaireVariable;
    document.getElementById('variableChargeDate').value = '2026-08-15';

    await saveVariableCharge();

    // Saisie aujourd'hui pour une dépense du 15 : c'est le 15 qui est écrit.
    expect(derniereEcriture().date).toBe('2026-08-15');
  });

  it('une charge fixe porte la date saisie', async () => {
    document.body.innerHTML = formulaireFixe;
    document.getElementById('fixedChargeDate').value = '2026-08-05';

    await saveFixedCharge();

    expect(derniereEcriture().date).toBe('2026-08-05');
  });

  it('à défaut de saisie, le jour courant — jamais rien', async () => {
    // Une charge sans date ne pourrait plus être située, et `timestamp` ne dit
    // que le moment de l'écriture.
    document.body.innerHTML = formulaireVariable;
    document.getElementById('variableChargeDate').value = '';

    await saveVariableCharge();

    expect(derniereEcriture().date).toBe(dateDuJour());
  });

  it('la date ne remplace pas l\'horodatage, elle s\'y ajoute', async () => {
    // Les deux disent des choses différentes : quand la dépense a eu lieu, et
    // quand elle a été enregistrée. La corbeille et la reconduction lisent le
    // second.
    document.body.innerHTML = formulaireVariable;
    document.getElementById('variableChargeDate').value = '2026-08-15';

    await saveVariableCharge();

    const ecrite = derniereEcriture();
    expect(ecrite.date).toBe('2026-08-15');
    expect(typeof ecrite.timestamp).toBe('number');
  });
});

describe('Ce que la liste montre', () => {
  it('la date apparaît sur chaque charge variable', async () => {
    document.body.innerHTML = formulaireVariable;
    setState('variableCharges', [
      { id: '1', description: 'Courses', amount: 42, category: 'Courses', paidBy: 'vous', date: '2026-08-15' }
    ]);

    renderVariableCharges();

    const ligne = document.querySelector('.charge-date');
    expect(ligne, 'aucune date rendue').not.toBeNull();
    expect(ligne.textContent).toContain('15');
    expect(ligne.textContent).toContain('2026');
  });

  it('la date apparaît sur chaque charge fixe', async () => {
    document.body.innerHTML = formulaireFixe;
    setState('fixedCharges', [
      { id: '1', description: 'Loyer', amount: 900, category: 'Maison', paidBy: 'vous', date: '2026-08-05' }
    ]);

    renderFixedCharges();

    const ligne = document.querySelector('.charge-date');
    expect(ligne, 'aucune date rendue').not.toBeNull();
    expect(ligne.textContent).toContain('5');
  });

  it('les charges d\'avant ce champ retombent sur leur horodatage', async () => {
    // Approximation assumée plutôt qu'une ligne vide : la saisie suivait
    // généralement la dépense de peu.
    document.body.innerHTML = formulaireVariable;
    setState('variableCharges', [
      {
        id: '1', description: 'Ancienne', amount: 20, category: 'Courses', paidBy: 'vous',
        timestamp: new Date(2026, 6, 9, 12, 0).getTime()
      }
    ]);

    renderVariableCharges();

    expect(document.querySelector('.charge-date').textContent).toContain('9');
  });

  it('une charge sans date ni horodatage n\'en invente pas', async () => {
    // `formatDate(undefined)` affichait autrefois la date du jour : l'absence
    // devenait une affirmation fausse.
    document.body.innerHTML = formulaireVariable;
    setState('variableCharges', [
      { id: '1', description: 'Sans repère', amount: 20, category: 'Courses', paidBy: 'vous' }
    ]);

    renderVariableCharges();

    expect(document.querySelector('.charge-date')).toBeNull();
    // La charge, elle, reste affichée : une date manquante ne la fait pas
    // disparaître.
    expect(document.querySelector('.charge-item')).not.toBeNull();
  });

  it('la date est échappée', async () => {
    // Elle vient de la base, pas d'un champ libre — mais elle traverse
    // `innerHTML` comme le reste.
    document.body.innerHTML = formulaireVariable;
    setState('variableCharges', [
      {
        id: '1', description: 'Piégée', amount: 20, category: 'Courses', paidBy: 'vous',
        date: '<img src=x onerror=alert(1)>'
      }
    ]);

    renderVariableCharges();

    expect(document.querySelector('img')).toBeNull();
  });
});

describe('Rouvrir une charge ne la redate pas', () => {
  it('l\'édition rappelle la date déclarée', () => {
    document.body.innerHTML = formulaireVariable;
    setState('variableCharges', [
      { id: '1', description: 'Courses', amount: 42, category: 'Courses', paidBy: 'vous', date: '2026-08-15' }
    ]);

    editVariableCharge('1');

    expect(document.getElementById('variableChargeDate').value).toBe('2026-08-15');
  });

  it('l\'édition d\'une charge ancienne propose sa date d\'écriture', () => {
    // Sans cela, le champ resterait vide et l'enregistrement la redaterait
    // d'aujourd'hui : corriger un montant aurait déplacé la dépense dans le
    // temps sans que personne ne l'ait demandé.
    document.body.innerHTML = formulaireVariable;
    setState('variableCharges', [
      {
        id: '1', description: 'Ancienne', amount: 42, category: 'Courses', paidBy: 'vous',
        timestamp: new Date(2026, 6, 9, 12, 0).getTime()
      }
    ]);

    editVariableCharge('1');

    expect(document.getElementById('variableChargeDate').value).toBe('2026-07-09');
  });
});

describe('La modale dit ce qu\'on est en train de faire', () => {
  /**
   * Éditer une charge ouvrait « Ajouter Charge Variable », bouton « Ajouter ».
   * Rien ne distinguait une modification d'une création — et un formulaire
   * prérempli qu'on croit vide invite à tout ressaisir.
   */
  const balisage = `
    <h2 id="modalAddVariableChargeTitle">Ajouter Charge Variable</h2>
    <button id="saveVariableCharge">Ajouter</button>
  ` + formulaireVariable;

  it('« Modifier » et « Enregistrer » en édition', () => {
    document.body.innerHTML = balisage;
    setState('variableCharges', [
      { id: '1', description: 'Courses', amount: 42, category: 'Courses', paidBy: 'vous', date: '2026-08-15' }
    ]);

    editVariableCharge('1');

    expect(document.getElementById('modalAddVariableChargeTitle').textContent).toContain('Modifier');
    expect(document.getElementById('saveVariableCharge').textContent).toBe('Enregistrer');
  });

  it('« Ajouter » revient à l\'ouverture suivante', () => {
    // Sans ce retour, la modale resterait intitulée « Modifier » pour toutes
    // les créations de la session.
    document.body.innerHTML = balisage;
    setState('variableCharges', [
      { id: '1', description: 'Courses', amount: 42, category: 'Courses', paidBy: 'vous', date: '2026-08-15' }
    ]);

    editVariableCharge('1');
    showAddVariableChargeModal();

    expect(document.getElementById('modalAddVariableChargeTitle').textContent).toContain('Ajouter');
    expect(document.getElementById('saveVariableCharge').textContent).toBe('Ajouter');
  });
});

describe('L\'ordre de la liste', () => {
  it('la plus récente en tête, à l\'intérieur d\'une catégorie', () => {
    document.body.innerHTML = formulaireVariable;
    setState('variableCharges', [
      { id: 'vieille', description: 'A', amount: 10, category: 'Courses', paidBy: 'vous', date: '2026-08-03' },
      { id: 'recente', description: 'B', amount: 20, category: 'Courses', paidBy: 'vous', date: '2026-08-20' }
    ]);

    renderVariableCharges();

    const ordre = [...document.querySelectorAll('.charge-item')].map(e => e.dataset.id);
    expect(ordre).toEqual(['recente', 'vieille']);
  });

  it('la catégorie la plus dépensière en tête', () => {
    document.body.innerHTML = formulaireVariable;
    setState('variableCharges', [
      { id: '1', description: 'Petite', amount: 10, category: 'Loisirs', paidBy: 'vous', date: '2026-08-03' },
      { id: '2', description: 'Grosse', amount: 500, category: 'Maison', paidBy: 'vous', date: '2026-08-05' }
    ]);

    renderVariableCharges();

    const categories = [...document.querySelectorAll('.category-header')].map(e => e.textContent.trim());
    expect(categories[0]).toContain('Maison');
  });
});
