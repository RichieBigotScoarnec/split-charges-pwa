// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Une modification qui change le mois de la date DÉPLACE la charge
 *
 * Mesuré le 2026-10-29 sur une sauvegarde réelle : une charge commune de 182 €
 * datée du 2026-11-01 vivait sous `periods/2026-10` et pesait sur le solde
 * d'octobre. L'ajout rangeait par la date (`charge-rangee-par-sa-date.test.js`),
 * la modification rangeait par le mois AFFICHÉ — deux chemins qui décidaient
 * différemment de la même grandeur (règle 2).
 *
 * Ce que ces cas tiennent, sur les DEUX listes (règle 4) et les DEUX poches :
 *
 *   1. le mois de la nouvelle date décide, en UNE écriture atomique, dans la
 *      poche de la charge, et le toast nomme le mois d'arrivée ;
 *   2. un changement de jour sans changement de mois ne déplace rien ;
 *   3. une charge déjà mal rangée dont la DATE ne change pas ne bouge pas —
 *      critère (b), décision du foyer du 2026-10-29 ;
 *   4. poche et mois changent ensemble en une seule écriture, une seule
 *      confirmation ;
 *   5. hors ligne, un déplacement est refusé en le disant — il ne peut pas
 *      être mis en file (`operationRejouable` refuse la racine) ;
 *   6. le mois qu'on quitte peut avoir été soldé : report désactivé, l'écart
 *      se dit.
 */

const dbUpdate = vi.fn(() => Promise.resolve());
const dbPush = vi.fn(() => Promise.resolve('cle-neuve'));
const dbGet = vi.fn(() => Promise.resolve(null));
const showConfirmModal = vi.fn(() => Promise.resolve(true));
const toastes = {
  success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn()
};
let horsLigne = false;
/** Le solde du mois quitté, avec puis sans la charge déplacée */
let soldeAvec = 0;
let soldeSans = 0;

vi.mock('../../public/js/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // Accesseurs PARESSEUX — voir `bascule-de-poche.test.js`.
  dbUpdate: (...args) => dbUpdate(...args),
  dbPush: (...args) => dbPush(...args),
  dbGet: (...args) => dbGet(...args),
  dbSet: vi.fn(() => Promise.resolve()),
  liaisonRompue: () => horsLigne,
  getDataPath: vi.fn(chemin => `household/${chemin}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({ toast: toastes }));
vi.mock('../../public/js/components/modal.js', async (reel) => ({
  ...await reel(),
  showModal: vi.fn(),
  closeModal: vi.fn(),
  showConfirmModal: (...args) => showConfirmModal(...args)
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/summary.js', () => ({
  calculateSummary: vi.fn(),
  // Le solde du mois quitté, AVEC la charge (sans argument) et SANS elle
  // (avec une liste de remplacement) — lu AVANT l'écriture, pour que l'écart
  // laissé sur un mois soldé se confirme au lieu de se découvrir après.
  //
  // Le solde « sans » n'est rendu que si la charge déplacée a VRAIMENT quitté
  // la liste fournie : un double qui le rendrait pour n'importe quelle liste
  // laisserait vert un code qui passe la liste entière, charge comprise.
  soldeDuMoisAffiche: (remplacements) => {
    const liste = remplacements?.variableCharges || remplacements?.fixedCharges;
    const sansElle = Array.isArray(liste) && !liste.some(c => c.id === 'c1' || c.id === 'f1');
    return sansElle ? soldeSans : soldeAvec;
  }
}));
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
  etiquetteEnveloppe: vi.fn(() => ''),
  renderCarteEnveloppes: vi.fn()
}));

const { saveVariableCharge } = await import('../../public/js/modules/variable-charges.js');
const { saveFixedCharge } = await import('../../public/js/modules/fixed-charges.js');
const { setState, resetState } = await import('../../public/js/state.js');

/**
 * Répond à la confirmation, et relève combien d'écritures étaient DÉJÀ parties
 * au moment où la question a été posée. Une question posée après l'écriture
 * n'est pas une confirmation : c'est le défaut vu à l'écran le 2026-11-01.
 *
 * @param {boolean} reponse
 * @returns {{avant: number|null}}
 */
function repondre(reponse) {
  const releve = { avant: null };
  showConfirmModal.mockImplementation(async () => {
    releve.avant = dbUpdate.mock.calls.length;
    return reponse;
  });
  return releve;
}

const OCTOBRE = '2026-10';

const FORMULAIRE_VARIABLE = `
  <input type="hidden" id="variableChargeId" value="c1" />
  <input id="variableChargeDescription" value="Courses" />
  <input id="variableChargeAmount" value="182" />
  <input type="date" id="variableChargeDate" value="2026-10-20" />
  <input type="time" id="variableChargeHeure" value="" />
  <select id="variableChargeCategory"><option value="Courses" selected>Courses</option></select>
  <select id="variableChargePaidBy"><option value="vous" selected>Vous</option></select>
  <select id="variableChargeEnvelope"><option value="" selected></option></select>
  <input type="checkbox" id="variableChargePerso" />
  <input type="checkbox" id="variableChargeSplitToggle" />
  <div id="variableChargeSplitOptions"></div>
  <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
`;

const FORMULAIRE_FIXE = `
  <input type="hidden" id="fixedChargeId" value="f1" />
  <input id="fixedChargeDescription" value="Netflix" />
  <input id="fixedChargeAmount" value="14" />
  <input type="date" id="fixedChargeDate" value="2026-10-20" />
  <select id="fixedChargeCategory"><option value="Loisirs" selected>Loisirs</option></select>
  <select id="fixedChargePaidBy"><option value="vous" selected>Vous</option></select>
  <select id="fixedChargeDestination"><option value="" selected></option></select>
  <select id="fixedChargeEnvelope"><option value="" selected></option></select>
  <input type="checkbox" id="fixedChargeRecurring" checked />
  <input type="checkbox" id="fixedChargePerso" />
  <input type="checkbox" id="fixedChargeSplitToggle" />
  <div id="fixedChargesList"></div><span id="fixedChargesTotal"></span>
  <span id="fixedChargesAnnuel"></span>
`;

/** Les deux listes portent le même geste — décrites une fois (règle 4) */
const LISTES = [
  {
    nom: 'charges variables',
    collection: 'variableCharges',
    cle: 'c1',
    formulaire: FORMULAIRE_VARIABLE,
    date: 'variableChargeDate',
    perso: 'variableChargePerso',
    enregistrer: () => saveVariableCharge(),
    charge: { id: 'c1', description: 'Courses', amount: 182, paidBy: 'vous', date: '2026-10-20' }
  },
  {
    nom: 'charges fixes',
    collection: 'fixedCharges',
    cle: 'f1',
    formulaire: FORMULAIRE_FIXE,
    date: 'fixedChargeDate',
    perso: 'fixedChargePerso',
    enregistrer: () => saveFixedCharge(),
    charge: {
      id: 'f1', description: 'Netflix', amount: 14, paidBy: 'vous', date: '2026-10-20', recurring: true
    }
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  horsLigne = false;
  soldeAvec = 0;
  soldeSans = 0;
  // `clearAllMocks` efface les appels, PAS une implémentation posée par un cas
  // précédent : un « Annuler » y survivrait au cas suivant.
  showConfirmModal.mockImplementation(() => Promise.resolve(true));
  setState('currentPeriod', OCTOBRE);
  setState('emplacementCourant', 'vous');
  setState('members', { vous: { prenom: 'Richard' }, conjointe: { prenom: 'Cindy' } });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 29, 10));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Les messages d'un canal de toast, en clair */
const dits = (canal) => toastes[canal].mock.calls.map(([texte]) => texte);

for (const liste of LISTES) {
  const poser = (charge, { date, perso = false } = {}) => {
    document.body.innerHTML = liste.formulaire;
    setState(liste.collection, [charge]);
    if (date) document.getElementById(liste.date).value = date;
    document.getElementById(liste.perso).checked = perso;
  };

  describe(`Le mois suit la date — ${liste.nom}`, () => {
    it('LE CAS RÉEL — octobre → 1er novembre : une écriture, origine effacée, toast nommé', async () => {
      poser(liste.charge, { date: '2026-11-01' });

      await liste.enregistrer();

      expect(dbUpdate).toHaveBeenCalledTimes(1);
      const [chemin, ecritures] = dbUpdate.mock.calls[0];
      expect(chemin).toBeUndefined();
      expect(Object.keys(ecritures).sort()).toEqual([
        `periods/2026-10/${liste.collection}/${liste.cle}`,
        `periods/2026-11/${liste.collection}/${liste.cle}`
      ]);
      expect(ecritures[`periods/2026-10/${liste.collection}/${liste.cle}`]).toBeNull();
      expect(ecritures[`periods/2026-11/${liste.collection}/${liste.cle}`].date).toBe('2026-11-01');
      expect(dbPush).not.toHaveBeenCalled();
      // Un changement de mois seul ne se demande pas : la date saisie EST la
      // demande, et le toast dit où la charge est partie.
      expect(showConfirmModal).not.toHaveBeenCalled();
      expect(dits('success')).toContain('Charge déplacée en novembre 2026, sa date');
    });

    it('dans la poche PERSONNELLE, les deux chemins restent dans la poche', async () => {
      poser({ ...liste.charge, perimetre: 'solo' }, { date: '2026-11-01', perso: true });

      await liste.enregistrer();

      expect(dbUpdate).toHaveBeenCalledTimes(1);
      expect(Object.keys(dbUpdate.mock.calls[0][1]).sort()).toEqual([
        `personnel/vous/periods/2026-10/${liste.collection}/${liste.cle}`,
        `personnel/vous/periods/2026-11/${liste.collection}/${liste.cle}`
      ]);
      expect(showConfirmModal).not.toHaveBeenCalled();
    });

    it('TÉMOIN — un changement de JOUR dans le même mois écrit sur place', async () => {
      poser(liste.charge, { date: '2026-10-28' });

      await liste.enregistrer();

      expect(dbUpdate).toHaveBeenCalledTimes(1);
      expect(dbUpdate.mock.calls[0][0]).toBe(`periods/2026-10/${liste.collection}/${liste.cle}`);
      expect(dits('success')).toContain('Charge modifiée');
    });

    it('CRITÈRE (b) — une charge mal rangée dont la date ne change pas reste où elle vit', async () => {
      // La 182 € telle qu'en base : datée de novembre, rangée en octobre. On
      // corrige son montant ; sa date n'est pas touchée.
      poser({ ...liste.charge, date: '2026-11-01' }, { date: '2026-11-01' });

      await liste.enregistrer();

      expect(dbUpdate).toHaveBeenCalledTimes(1);
      expect(dbUpdate.mock.calls[0][0]).toBe(`periods/2026-10/${liste.collection}/${liste.cle}`);
    });

    it('poche ET mois ensemble : UNE confirmation, UNE écriture, deux chemins', async () => {
      poser(liste.charge, { date: '2026-11-01', perso: true });

      await liste.enregistrer();

      expect(showConfirmModal).toHaveBeenCalledTimes(1);
      expect(dbUpdate).toHaveBeenCalledTimes(1);
      expect(dbUpdate.mock.calls[0][1]).toEqual({
        [`personnel/vous/periods/2026-11/${liste.collection}/${liste.cle}`]:
          expect.objectContaining({ perimetre: 'solo', date: '2026-11-01' }),
        [`periods/2026-10/${liste.collection}/${liste.cle}`]: null
      });
    });

    it('… et refusée, RIEN n\'est écrit — ni la poche, ni le mois', async () => {
      showConfirmModal.mockResolvedValueOnce(false);
      poser(liste.charge, { date: '2026-11-01', perso: true });

      await liste.enregistrer();

      expect(dbUpdate).not.toHaveBeenCalled();
      expect(dbPush).not.toHaveBeenCalled();
    });

    it('HORS LIGNE — un déplacement est refusé, et l\'écran dit pourquoi', async () => {
      horsLigne = true;
      poser(liste.charge, { date: '2026-11-01' });

      await liste.enregistrer();

      expect(dbUpdate).not.toHaveBeenCalled();
      expect(dits('error').join(' ')).toMatch(/hors ligne/i);
      expect(dits('error').join(' ')).toMatch(/rien n'a été modifié/i);
    });

    it('TÉMOIN — hors ligne, une modification sur place part toujours (en file)', async () => {
      horsLigne = true;
      poser(liste.charge, { date: '2026-10-28' });

      await liste.enregistrer();

      expect(dbUpdate).toHaveBeenCalledTimes(1);
      expect(dits('error')).toEqual([]);
    });

    // ⟲ Ces cas tenaient un TOAST après l'écriture. Vu à l'écran le
    // 2026-11-01 : un message qui paraît puis disparaît, sans rien demander,
    // après que l'argent a déjà bougé. La conséquence se CONFIRME désormais
    // avant — et Annuler n'écrit rien.
    const quitterSeptembreSolde = () => {
      setState('currentPeriod', '2026-09');
      setState('carryOverEnabled', false);
      soldeAvec = 0;
      soldeSans = 91;
      poser({ ...liste.charge, date: '2026-09-20' }, { date: '2026-10-01' });
    };

    it('MOIS SOLDÉ QUITTÉ, report désactivé : l\'écart se CONFIRME avant d\'écrire', async () => {
      const releve = repondre(true);
      quitterSeptembreSolde();

      await liste.enregistrer();

      expect(showConfirmModal).toHaveBeenCalledTimes(1);
      expect(showConfirmModal.mock.calls[0][0]).toMatch(/Le solde de septembre 2026 passe de/);
      expect(releve.avant).toBe(0);
      expect(dbUpdate).toHaveBeenCalledTimes(1);
    });

    it('… et ANNULER n\'écrit rien, ni dans un mois ni dans l\'autre', async () => {
      repondre(false);
      quitterSeptembreSolde();

      await liste.enregistrer();

      expect(showConfirmModal).toHaveBeenCalledTimes(1);
      expect(dbUpdate).not.toHaveBeenCalled();
      expect(dbPush).not.toHaveBeenCalled();
      expect(dits('info')).toContain('Rien n\'a été modifié');
    });

    it('TÉMOIN — le même geste, report ACTIVÉ : l\'écart rejoint la chaîne, rien à demander', async () => {
      quitterSeptembreSolde();
      setState('carryOverEnabled', true);

      await liste.enregistrer();

      expect(showConfirmModal).not.toHaveBeenCalled();
      expect(dbUpdate).toHaveBeenCalledTimes(1);
    });
  });
}

describe('La reconduction, AVANT le déplacement d\'une charge fixe', () => {
  const LOYER = { description: 'Loyer', amount: 900, paidBy: 'vous', recurring: true };

  /** Sert la base commune ; tout le reste — les poches — est vide */
  const servir = (commun) =>
    dbGet.mockImplementation(async (chemin) => (chemin === 'periods' ? commun : null));

  /** Rouvre Netflix (f1) d'octobre et le redate au 5 novembre */
  const redaterAu5Novembre = async () => {
    document.body.innerHTML = FORMULAIRE_FIXE;
    setState('fixedCharges', [LISTES[1].charge]);
    document.getElementById('fixedChargeDate').value = '2026-11-05';
    await saveFixedCharge();
  };

  const OCTOBRE_GARNI = { fixedCharges: { f0: LOYER, f1: LISTES[1].charge } };

  /**
   * LE CAS VU À L'ÉCRAN, le 2026-11-01 en bac à sable : novembre déjà reconduit
   * — il porte la copie de Netflix —, et le Netflix d'octobre redaté au 05/11.
   * Deux exemplaires en novembre, 8 € au lieu de 4 €. Le message n'est arrivé
   * qu'APRÈS l'écriture, puis a disparu.
   */
  const NOVEMBRE_RECONDUIT_AVEC_SA_COPIE = {
    [OCTOBRE]: OCTOBRE_GARNI,
    '2026-11': {
      reconductedFrom: OCTOBRE,
      fixedCharges: { r1: { ...LISTES[1].charge, id: undefined, date: '2026-11-03' } }
    }
  };

  it('DOUBLON — la modale paraît AVANT l\'écriture et nomme la conséquence', async () => {
    servir(NOVEMBRE_RECONDUIT_AVEC_SA_COPIE);
    const releve = repondre(true);

    await redaterAu5Novembre();

    expect(showConfirmModal).toHaveBeenCalledTimes(1);
    expect(showConfirmModal.mock.calls[0][0])
      .toMatch(/Novembre 2026 porte déjà une charge « Netflix » : la déplacer la comptera deux fois\./);
    expect(releve.avant).toBe(0);
  });

  it('DOUBLON — ANNULER laisse les deux mois intacts', async () => {
    servir(NOVEMBRE_RECONDUIT_AVEC_SA_COPIE);
    repondre(false);

    await redaterAu5Novembre();

    expect(dbUpdate).not.toHaveBeenCalled();
    expect(dbPush).not.toHaveBeenCalled();
    expect(dits('info')).toContain('Rien n\'a été modifié');
    expect(dits('success')).toEqual([]);
  });

  it('DOUBLON — CONFIRMER déplace, en une écriture', async () => {
    servir(NOVEMBRE_RECONDUIT_AVEC_SA_COPIE);
    repondre(true);

    await redaterAu5Novembre();

    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(dbUpdate.mock.calls[0][1]).toEqual({
      'periods/2026-11/fixedCharges/f1': expect.objectContaining({ date: '2026-11-05' }),
      'periods/2026-10/fixedCharges/f1': null
    });
    expect(dits('success')).toContain('Charge déplacée en novembre 2026, sa date');
  });

  it('TÉMOIN — destination reconduite SANS charge du même libellé : aucune modale', async () => {
    // Une modale qui paraîtrait à chaque déplacement deviendrait du bruit qu'on
    // valide sans le lire — et ne protégerait plus le cas qui compte.
    servir({
      [OCTOBRE]: OCTOBRE_GARNI,
      '2026-11': { reconductedFrom: OCTOBRE, fixedCharges: { r0: { ...LOYER } } }
    });

    await redaterAu5Novembre();

    expect(showConfirmModal).not.toHaveBeenCalled();
    expect(dbUpdate).toHaveBeenCalledTimes(1);
  });

  it('BLOCAGE — un mois pas encore reconduit : la modale paraît, Annuler n\'écrit rien', async () => {
    // Novembre n'est pas reconduit : Netflix le garnirait, et `recurrence.js`
    // refuse un mois « déjà garni » — le loyer n'y arriverait jamais.
    servir({ [OCTOBRE]: OCTOBRE_GARNI });
    repondre(false);

    await redaterAu5Novembre();

    expect(showConfirmModal).toHaveBeenCalledTimes(1);
    expect(showConfirmModal.mock.calls[0][0]).toMatch(/Novembre 2026 ne recevra pas/);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it('LECTURE IMPOSSIBLE — on ne se tait pas : la modale le dit', async () => {
    // Un contrôle qui ne peut pas mesurer ne doit pas passer pour un contrôle
    // qui n'a rien trouvé (règle 1).
    dbGet.mockImplementation(async () => { throw new Error('réseau'); });
    repondre(false);

    await redaterAu5Novembre();

    expect(showConfirmModal).toHaveBeenCalledTimes(1);
    expect(showConfirmModal.mock.calls[0][0]).toMatch(/n'a pas pu être vérifi/);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it('TÉMOIN — une charge VARIABLE déplacée ne lit pas l\'historique pour rien', async () => {
    document.body.innerHTML = FORMULAIRE_VARIABLE;
    setState('variableCharges', [LISTES[0].charge]);
    document.getElementById('variableChargeDate').value = '2026-11-01';

    await saveVariableCharge();

    expect(dbGet.mock.calls.map(([chemin]) => chemin)).not.toContain('periods');
  });
});
