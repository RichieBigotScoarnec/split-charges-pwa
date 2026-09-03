// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Agir sur plusieurs charges à la fois
 *
 * Ce qui se juge ici, c'est ce qui part réellement en base, et ce qui n'y part
 * pas. Les règles de comptage et d'accord sont fixées par
 * `tests/utils/selection-lot.test.js` ; cette suite-ci porte sur les gestes.
 */

const dbUpdate = vi.fn(() => Promise.resolve());

vi.mock('../../public/js/db.js', () => ({
  dbUpdate,
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
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
vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));
vi.mock('../../public/js/modules/variable-charges.js', () => ({
  loadVariableCharges: vi.fn(() => Promise.resolve()),
  renderVariableCharges: vi.fn()
}));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategories: vi.fn(() => [
    { id: 'courses', icon: '🛒', label: 'Courses' },
    { id: 'essence', icon: '⛽', label: 'Essence' }
  ]),
  populateCategorySelect: vi.fn()
}));
vi.mock('../../public/js/modules/envelopes.js', () => ({
  populateEnvelopeSelect: vi.fn()
}));

const {
  initSelectionCharges, basculerModeSelection, basculerChargeChoisie,
  toutSelectionner, supprimerLaSelection, appliquerCategorieAuLot,
  appliquerEnveloppeAuLot, estEnModeSelection, estChoisie
} = await import('../../public/js/modules/selection-charges.js');
const { toast } = await import('../../public/js/components/toast.js');
const { showConfirmModal } = await import('../../public/js/components/modal.js');
const { setState, resetState } = await import('../../public/js/state.js');

const BALISAGE = `
  <button type="button" id="selectionBasculer" aria-pressed="false">Sélectionner</button>
  <div class="selection-barre" id="selectionBarre" hidden>
    <div id="selectionCompte"></div>
    <button type="button" id="selectionTout">Tout</button>
    <select id="selectionCategorie"></select>
    <select id="selectionEnveloppe"></select>
    <button type="button" id="selectionSupprimer">Supprimer</button>
  </div>
`;

const CHARGES = [
  { id: 'a', amount: 12.5, description: 'Courses', category: 'Autre' },
  { id: 'b', amount: 30, description: 'Essence', category: 'Autre' },
  { id: 'c', amount: 7.25, description: 'Pain', category: 'Autre' }
];

/** Entre en mode sélection et retient les charges nommées */
function choisir(...ids) {
  basculerModeSelection();
  ids.forEach(id => basculerChargeChoisie(id));
}

/** Les chemins écrits, dans l'ordre */
const cheminsEcrits = () => dbUpdate.mock.calls.map(appel => appel[0]);

beforeEach(() => {
  vi.clearAllMocks();
  showConfirmModal.mockResolvedValue(true);
  dbUpdate.mockResolvedValue(undefined);
  resetState();
  document.body.innerHTML = BALISAGE;
  setState('currentPeriod', '2026-08');
  setState('variableCharges', CHARGES);
  initSelectionCharges();
});

describe('Le mode sélection', () => {
  it('est éteint au démarrage', () => {
    expect(estEnModeSelection()).toBe(false);
    expect(document.getElementById('selectionBarre').hidden).toBe(true);
  });

  it('s\'allume et découvre la barre', () => {
    basculerModeSelection();

    expect(estEnModeSelection()).toBe(true);
    expect(document.getElementById('selectionBarre').hidden).toBe(false);
    expect(document.getElementById('selectionBasculer').getAttribute('aria-pressed')).toBe('true');
  });

  it('en sortant, il vide la sélection', () => {
    // La garder ferait réapparaître à la prochaine entrée un lot constitué on
    // ne sait quand, sur un mois peut-être différent.
    choisir('a', 'b');
    basculerModeSelection();
    basculerModeSelection();

    expect(estChoisie('a')).toBe(false);
    expect(estChoisie('b')).toBe(false);
  });

  it('cocher hors du mode ne fait rien', () => {
    basculerChargeChoisie('a');
    expect(estChoisie('a')).toBe(false);
  });

  it('la barre dit le compte ET le total', () => {
    // « 2 charges » ne dit pas si l'on s'apprête à effacer 40 € ou 1 400 €.
    choisir('a', 'b');

    const compte = document.getElementById('selectionCompte').textContent;
    expect(compte).toContain('2 sélectionnées');
    expect(compte).toContain('42,50');
  });

  it('les gestes sont éteints tant que rien n\'est coché', () => {
    basculerModeSelection();

    expect(document.getElementById('selectionSupprimer').disabled).toBe(true);
    expect(document.getElementById('selectionCategorie').disabled).toBe(true);
  });

  it('« Tout » retient tout, puis relâche tout', () => {
    basculerModeSelection();
    toutSelectionner();
    expect(['a', 'b', 'c'].every(estChoisie)).toBe(true);

    toutSelectionner();
    expect(['a', 'b', 'c'].some(estChoisie)).toBe(false);
  });
});

describe('Supprimer un lot', () => {
  it('supprime en douceur, et seulement les charges retenues', async () => {
    choisir('a', 'c');
    await supprimerLaSelection();

    expect(cheminsEcrits()).toEqual([
      'periods/2026-08/variableCharges/a',
      'periods/2026-08/variableCharges/c'
    ]);
    expect(dbUpdate.mock.calls[0][1]).toEqual({ deleted: true });
  });

  it('demande confirmation, et le total y figure', async () => {
    choisir('a', 'b');
    await supprimerLaSelection();

    expect(showConfirmModal).toHaveBeenCalledTimes(1);
    expect(showConfirmModal.mock.calls[0][0]).toContain('42,50');
    expect(showConfirmModal.mock.calls[0][0]).toContain('corbeille');
  });

  it('un refus n\'écrit rien', async () => {
    showConfirmModal.mockResolvedValue(false);
    choisir('a', 'b');
    await supprimerLaSelection();

    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it('offre d\'annuler, et l\'annulation rend les charges', async () => {
    choisir('a', 'b');
    await supprimerLaSelection();

    const options = toast.success.mock.calls.at(-1)[1];
    expect(typeof options.onUndo).toBe('function');

    dbUpdate.mockClear();
    await options.onUndo();

    expect(dbUpdate).toHaveBeenCalledTimes(2);
    expect(dbUpdate.mock.calls[0][1]).toEqual({ deleted: false });
  });

  it('le mode se referme une fois le geste passé', async () => {
    choisir('a');
    await supprimerLaSelection();

    expect(estEnModeSelection()).toBe(false);
  });
});

describe('Un lot ne tombe pas en bloc', () => {
  it('une charge refusée laisse passer les autres', async () => {
    // Un `update` multi-chemins est atomique : une règle qui refuse ferait
    // échouer les deux autres, sans dire laquelle. Une par une, donc.
    dbUpdate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('PERMISSION_DENIED'))
      .mockResolvedValueOnce(undefined);

    choisir('a', 'b', 'c');
    await supprimerLaSelection();

    expect(dbUpdate).toHaveBeenCalledTimes(3);
  });

  it('le compte rendu dit les deux nombres, et n\'est pas vert', async () => {
    dbUpdate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('PERMISSION_DENIED'))
      .mockResolvedValueOnce(undefined);

    choisir('a', 'b', 'c');
    await supprimerLaSelection();

    expect(toast.success).not.toHaveBeenCalled();
    const dit = toast.warning.mock.calls.at(-1)[0];
    expect(dit).toContain('2 charges supprimées');
    expect(dit).toContain('1 refusée');
  });

  it('l\'annulation ne promet pas de rendre ce qui a été refusé', async () => {
    // Restaurer une charge dont on sait déjà que l'écriture échouera reviendrait
    // à offrir un geste qui ne peut pas aboutir.
    dbUpdate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('PERMISSION_DENIED'));

    choisir('a', 'b');
    await supprimerLaSelection();

    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('Ranger un lot dans une catégorie', () => {
  it('écrit le libellé, l\'identifiant ET l\'icône', async () => {
    // `categoryIcon` sert de repli à l'anticipation des abonnements : le
    // laisser sur l'ancienne catégorie donnerait une ligne cohérente à l'écran
    // et fausse ailleurs.
    choisir('a', 'b');
    await appliquerCategorieAuLot('Courses');

    expect(dbUpdate.mock.calls[0][1]).toEqual({
      category: 'Courses', categoryId: 'courses', categoryIcon: '🛒'
    });
    expect(dbUpdate).toHaveBeenCalledTimes(2);
  });

  it('ne demande aucune confirmation : le geste est réversible d\'un autre geste', async () => {
    choisir('a');
    await appliquerCategorieAuLot('Courses');

    expect(showConfirmModal).not.toHaveBeenCalled();
  });

  it('une catégorie inconnue n\'écrit rien', async () => {
    choisir('a');
    await appliquerCategorieAuLot('Licorne');

    expect(dbUpdate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('le placeholder ne déclenche rien', async () => {
    // Le select revient à vide après chaque geste : ce retour ne doit pas
    // relancer le lot précédent.
    choisir('a');
    await appliquerCategorieAuLot('');

    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it('le select revient à son placeholder après le geste', async () => {
    choisir('a');
    await appliquerCategorieAuLot('Courses');

    expect(document.getElementById('selectionCategorie').value).toBe('');
  });
});

describe('Rattacher ou détacher une enveloppe', () => {
  it('rattache à l\'enveloppe choisie', async () => {
    choisir('a', 'b');
    await appliquerEnveloppeAuLot('vacances-2027');

    expect(dbUpdate.mock.calls[0][1]).toEqual({ envelope: 'vacances-2027' });
  });

  it('« retirer » écrit null, et non la chaîne vide', async () => {
    // Firebase supprime la clé sur `null` ; une chaîne vide se lirait comme un
    // identifiant d'enveloppe introuvable.
    choisir('a');
    await appliquerEnveloppeAuLot('detacher');

    expect(dbUpdate.mock.calls[0][1]).toEqual({ envelope: null });
  });

  it('le placeholder ne détache pas : il ne fait rien', async () => {
    // C'est toute la raison d'être de l'option « retirer ». Sans elle, le
    // placeholder devrait porter les deux sens.
    choisir('a');
    await appliquerEnveloppeAuLot('');

    expect(dbUpdate).not.toHaveBeenCalled();
  });
});

describe('Une sélection qui ne désigne plus rien', () => {
  it('n\'écrit nulle part quand le mois a changé sous elle', async () => {
    // On coche en août, la liste se recharge sur septembre. Les identifiants
    // d'août existent encore en base : sans purge, l'écriture partirait sous
    // `periods/2026-09/variableCharges/a` et créerait une charge fantôme.
    choisir('a', 'b');
    setState('currentPeriod', '2026-09');
    setState('variableCharges', [{ id: 'z', amount: 5, description: 'Autre mois' }]);

    await supprimerLaSelection();

    expect(dbUpdate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Aucune charge sélectionnée');
  });

  it('ne compte pas les charges supprimées entre-temps', async () => {
    choisir('a', 'b');
    setState('variableCharges', [
      { id: 'a', amount: 12.5, deleted: true },
      { id: 'b', amount: 30 }
    ]);

    await supprimerLaSelection();

    expect(cheminsEcrits()).toEqual(['periods/2026-08/variableCharges/b']);
  });

  it('sans période, aucun geste ne part', async () => {
    choisir('a');
    setState('currentPeriod', null);

    await supprimerLaSelection();

    expect(dbUpdate).not.toHaveBeenCalled();
  });
});
