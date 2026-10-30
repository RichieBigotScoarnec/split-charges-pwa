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
let soldeApresCalcul = null;

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
  // Le bilan recalculé pose `dernierSolde` : c'est ce que le module relit pour
  // savoir si le mois quitté a cessé d'être soldé.
  // SYNCHRONE, comme le vrai (`summary.js` pose `dernierSolde` dans la même
  // tâche) : un double asynchrone mesurerait un ordre que le code n'a pas.
  calculateSummary: vi.fn(() => globalThis.__apresLeBilan?.())
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

globalThis.__apresLeBilan = () => {
  if (soldeApresCalcul !== null) setState('dernierSolde', soldeApresCalcul);
};

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
  soldeApresCalcul = null;
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

    it('MOIS SOLDÉ QUITTÉ, report désactivé : l\'écart laissé derrière se dit', async () => {
      setState('currentPeriod', '2026-09');
      setState('carryOverEnabled', false);
      setState('dernierSolde', 0);
      soldeApresCalcul = 91;
      poser({ ...liste.charge, date: '2026-09-20' }, { date: '2026-10-01' });

      await liste.enregistrer();

      expect(dits('info').join(' ')).toMatch(/Le solde de septembre 2026 passe de/);
    });

    it('TÉMOIN — le même geste, report ACTIVÉ : l\'écart rejoint la chaîne, rien à dire', async () => {
      setState('currentPeriod', '2026-09');
      setState('carryOverEnabled', true);
      setState('dernierSolde', 0);
      soldeApresCalcul = 91;
      poser({ ...liste.charge, date: '2026-09-20' }, { date: '2026-10-01' });

      await liste.enregistrer();

      expect(dits('info').join(' ')).not.toMatch(/Le solde de/);
    });
  });
}

describe('La reconduction, après le déplacement d\'une charge fixe', () => {
  it('le blocage d\'un mois neuf ARRIVE à l\'écran', async () => {
    // Octobre porte deux abonnements récurrents ; Netflix part en novembre, mois
    // pas encore ouvert. Sans avertissement, novembre ne recevrait jamais le
    // loyer — la garde « mois déjà garni » de `recurrence.js`.
    const commun = {
      [OCTOBRE]: {
        fixedCharges: {
          f0: { description: 'Loyer', amount: 900, paidBy: 'vous', recurring: true },
          f1: LISTES[1].charge
        }
      }
    };
    dbGet.mockImplementation(async (chemin) => (chemin === 'periods' ? commun : null));

    document.body.innerHTML = FORMULAIRE_FIXE;
    setState('fixedCharges', [LISTES[1].charge]);
    document.getElementById('fixedChargeDate').value = '2026-11-01';

    await saveFixedCharge();

    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(dits('warning').join(' ')).toMatch(/Novembre 2026 ne recevra pas/);
  });

  it('TÉMOIN — une charge VARIABLE déplacée ne lit pas l\'historique pour rien', async () => {
    document.body.innerHTML = FORMULAIRE_VARIABLE;
    setState('variableCharges', [LISTES[0].charge]);
    document.getElementById('variableChargeDate').value = '2026-11-01';

    await saveVariableCharge();

    expect(dbGet.mock.calls.map(([chemin]) => chemin)).not.toContain('periods');
  });
});
