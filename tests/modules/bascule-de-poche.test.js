// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Cocher ou décocher « perso » CHANGE DE POCHE, et ça se demande
 *
 * C'est le premier changement de chemin qu'une édition produise dans cette
 * application. Le raisonnement qui interdit déjà de déplacer une charge de MOIS
 * s'y applique, et plus fort : ici la charge ne change pas de mois, elle change
 * de VISIBILITÉ. Décocher « perso » par mégarde PUBLIE une dépense, et rien à
 * l'écran ne le dirait — la liste s'allonge d'une ligne chez l'autre, c'est
 * tout.
 *
 * Trois propriétés, et elles ne se mesurent pas l'une avec l'autre :
 *
 *   1. le geste est NOMMÉ et confirmé, jamais un effet de bord ;
 *   2. refusé, RIEN n'est écrit — un formulaire qui appliquerait les autres
 *      champs en laissant la case où elle était obéirait à moitié ;
 *   3. accepté, le déplacement est ATOMIQUE — en deux écritures, un échec
 *      laisserait la charge comptée deux fois, ou dans aucune poche.
 *
 * Les deux listes sont éprouvées : elles portent le même geste, et un contrôle
 * qui n'en tient qu'une ne verrait pas l'autre partir (règle 4).
 */

const dbUpdate = vi.fn(() => Promise.resolve());
const dbPush = vi.fn(() => Promise.resolve('cle-neuve'));
const showConfirmModal = vi.fn(() => Promise.resolve(true));
const info = vi.fn();

vi.mock('../../public/js/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // Accesseurs PARESSEUX : le facteur d'un double `async` est invoqué avant les
  // `const` du fichier, et une référence directe y tombe en zone morte
  // temporelle — Vitest sert alors le module ORIGINAL, en silence.
  dbUpdate: (...args) => dbUpdate(...args),
  dbPush: (...args) => dbPush(...args),
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  getDataPath: vi.fn(chemin => `household/${chemin}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info, warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(),
  closeModal: vi.fn(),
  showConfirmModal: (...args) => showConfirmModal(...args)
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
  etiquetteEnveloppe: vi.fn(() => ''),
  renderCarteEnveloppes: vi.fn()
}));

const { saveVariableCharge } = await import('../../public/js/modules/variable-charges.js');
const { saveFixedCharge } = await import('../../public/js/modules/fixed-charges.js');
const { setState, resetState } = await import('../../public/js/state.js');

const MOIS = '2026-09';

/** Le formulaire de charge variable, en édition d'une charge existante */
const FORMULAIRE_VARIABLE = `
  <input type="hidden" id="variableChargeId" value="c1" />
  <input id="variableChargeDescription" value="Festival" />
  <input id="variableChargeAmount" value="45" />
  <input type="date" id="variableChargeDate" value="2026-09-10" />
  <input type="time" id="variableChargeHeure" value="" />
  <select id="variableChargeCategory"><option value="Loisirs" selected>Loisirs</option></select>
  <select id="variableChargePaidBy"><option value="vous" selected>Vous</option></select>
  <select id="variableChargeEnvelope"><option value="" selected></option></select>
  <input type="checkbox" id="variableChargePerso" />
  <input type="checkbox" id="variableChargeSplitToggle" />
  <div id="variableChargeSplitOptions"></div>
  <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
`;

/** Le formulaire de charge fixe, en édition */
const FORMULAIRE_FIXE = `
  <input type="hidden" id="fixedChargeId" value="f1" />
  <input id="fixedChargeDescription" value="Abonnement" />
  <input id="fixedChargeAmount" value="12" />
  <input type="date" id="fixedChargeDate" value="2026-09-03" />
  <select id="fixedChargeCategory"><option value="Loisirs" selected>Loisirs</option></select>
  <select id="fixedChargePaidBy"><option value="vous" selected>Vous</option></select>
  <select id="fixedChargeDestination"><option value="" selected></option></select>
  <select id="fixedChargeEnvelope"><option value="" selected></option></select>
  <input type="checkbox" id="fixedChargeRecurring" />
  <input type="checkbox" id="fixedChargePerso" />
  <input type="checkbox" id="fixedChargeSplitToggle" />
  <div id="fixedChargesList"></div><span id="fixedChargesTotal"></span>
  <span id="fixedChargesAnnuel"></span>
`;

/**
 * Les deux listes, décrites pour n'écrire la suite qu'une fois
 *
 * Elles portent le même geste. Deux rédactions de ces cas divergeraient au
 * premier correctif, et la moins à jour serait celle qui décrit une frontière
 * de confidentialité.
 */
const LISTES = [
  {
    nom: 'charges variables',
    collection: 'variableCharges',
    cle: 'c1',
    formulaire: FORMULAIRE_VARIABLE,
    perso: 'variableChargePerso',
    enregistrer: () => saveVariableCharge(),
    commune: { id: 'c1', description: 'Festival', amount: 45, paidBy: 'vous' },
    personnelle: {
      id: 'c1', description: 'Festival', amount: 45, paidBy: 'vous', perimetre: 'solo'
    }
  },
  {
    nom: 'charges fixes',
    collection: 'fixedCharges',
    cle: 'f1',
    formulaire: FORMULAIRE_FIXE,
    perso: 'fixedChargePerso',
    enregistrer: () => saveFixedCharge(),
    commune: { id: 'f1', description: 'Abonnement', amount: 12, paidBy: 'vous' },
    personnelle: {
      id: 'f1', description: 'Abonnement', amount: 12, paidBy: 'vous', perimetre: 'solo'
    }
  }
];

/** Ce que la dernière écriture a visé */
const derniereEcriture = () => dbUpdate.mock.calls.at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  showConfirmModal.mockResolvedValue(true);
  resetState();
  setState('currentPeriod', MOIS);
  setState('emplacementCourant', 'vous');
  setState('members', { vous: 'Richie', conjointe: 'Cindy' });
});

describe.each(LISTES)('La bascule « perso » — $nom', (liste) => {
  const poser = (charges) => {
    document.body.innerHTML = liste.formulaire;
    setState(liste.collection, charges);
  };

  describe('Cocher « perso » sur une charge commune', () => {
    beforeEach(() => {
      poser([liste.commune]);
      document.getElementById(liste.perso).checked = true;
    });

    it('DEMANDE, et la question nomme la personne concernée', async () => {
      await liste.enregistrer();

      expect(showConfirmModal).toHaveBeenCalledTimes(1);
      expect(showConfirmModal.mock.calls[0][0]).toContain('Cindy');
    });

    it('ATOMIQUE : la destination et l\'origine partent dans UNE écriture', async () => {
      await liste.enregistrer();

      expect(dbUpdate).toHaveBeenCalledTimes(1);
      const [chemin, ecritures] = derniereEcriture();
      // `undefined` en premier argument : un lot multi-chemins, appliqué tout
      // ou rien. En deux écritures, un échec entre les deux laisserait la
      // charge comptée deux fois — ou dans aucune poche.
      expect(chemin).toBeUndefined();
      expect(ecritures[`periods/${MOIS}/${liste.collection}/${liste.cle}`]).toBeNull();
      expect(ecritures[
        `personnel/vous/periods/${MOIS}/${liste.collection}/${liste.cle}`
      ]).toMatchObject({ perimetre: 'solo' });
    });

    it('REFUSÉE, rien n\'est écrit du tout', async () => {
      // Pas « rien n'est déplacé » : rien. Appliquer les autres champs en
      // laissant la case où elle était rendrait un formulaire qui obéit à
      // moitié, et personne ne saurait lequel des deux a gagné.
      showConfirmModal.mockResolvedValue(false);

      await liste.enregistrer();

      expect(dbUpdate).not.toHaveBeenCalled();
      expect(dbPush).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalled();
    });
  });

  describe('Décocher « perso » — LE SENS QUI PUBLIE', () => {
    beforeEach(() => {
      poser([liste.personnelle]);
      document.getElementById(liste.perso).checked = false;
    });

    it('demande, et la question dit que la dépense devient VISIBLE', async () => {
      await liste.enregistrer();

      expect(showConfirmModal).toHaveBeenCalledTimes(1);
      expect(showConfirmModal.mock.calls[0][0]).toMatch(/VISIBLE/);
    });

    it('déplace de la poche vers le commun, en une écriture', async () => {
      await liste.enregistrer();

      const [chemin, ecritures] = derniereEcriture();
      expect(chemin).toBeUndefined();
      expect(ecritures[
        `personnel/vous/periods/${MOIS}/${liste.collection}/${liste.cle}`
      ]).toBeNull();
      expect(ecritures[`periods/${MOIS}/${liste.collection}/${liste.cle}`])
        .toMatchObject({ description: liste.commune.description });
    });
  });

  describe('Une édition qui ne change pas de poche', () => {
    it('ne demande RIEN et écrit au chemin commun', async () => {
      // Le cas de loin le plus fréquent. Une confirmation ici serait du bruit,
      // et le bruit est ce qui fait cliquer « oui » sans lire le jour où la
      // question compte.
      poser([liste.commune]);

      await liste.enregistrer();

      expect(showConfirmModal).not.toHaveBeenCalled();
      expect(derniereEcriture()[0])
        .toBe(`periods/${MOIS}/${liste.collection}/${liste.cle}`);
    });

    it('et écrit DANS LA POCHE quand la charge y vivait déjà', async () => {
      // LE TÉMOIN du cas ci-dessus : sans lui, « écrit au chemin commun »
      // serait satisfait par un code qui compose toujours le chemin commun —
      // ce qui était très exactement le défaut d'avant P1b.
      poser([liste.personnelle]);
      document.getElementById(liste.perso).checked = true;

      await liste.enregistrer();

      expect(showConfirmModal).not.toHaveBeenCalled();
      expect(derniereEcriture()[0])
        .toBe(`personnel/vous/periods/${MOIS}/${liste.collection}/${liste.cle}`);
    });
  });

  describe('Une charge NEUVE va directement dans sa poche', () => {
    it('cochée « perso », elle est poussée dans la poche, sans question', async () => {
      // Aucune visibilité ne change : la charge n'existait pas. Demander ici
      // ferait de la création un geste à deux étapes pour rien.
      poser([]);
      document.getElementById(`${liste.collection === 'variableCharges' ? 'variable' : 'fixed'}ChargeId`)
        .value = '';
      document.getElementById(liste.perso).checked = true;

      await liste.enregistrer();

      expect(showConfirmModal).not.toHaveBeenCalled();
      expect(dbPush.mock.calls.at(-1)[0])
        .toBe(`personnel/vous/periods/${MOIS}/${liste.collection}`);
    });

    it('non cochée, elle est poussée dans le commun', async () => {
      poser([]);
      document.getElementById(`${liste.collection === 'variableCharges' ? 'variable' : 'fixed'}ChargeId`)
        .value = '';

      await liste.enregistrer();

      expect(dbPush.mock.calls.at(-1)[0]).toBe(`periods/${MOIS}/${liste.collection}`);
    });
  });
});

describe('LA POCHE SUIT LE COMPTE, pas un nom en dur', () => {
  it('la charge de la conjointe part dans SA poche', async () => {
    // Le cas symétrique : c'est lui qui prouve que le chemin se dérive du
    // PAYEUR de la charge, et non de l'emplacement écrit en dur.
    document.body.innerHTML = FORMULAIRE_VARIABLE;
    const selecteur = document.getElementById('variableChargePaidBy');
    selecteur.innerHTML = '<option value="conjointe" selected>Conjointe</option>';
    document.getElementById('variableChargePerso').checked = true;
    setState('emplacementCourant', 'conjointe');
    setState('variableCharges', [
      { id: 'c1', description: 'Festival', amount: 45, paidBy: 'conjointe' }
    ]);

    await saveVariableCharge();

    const [, ecritures] = derniereEcriture();
    expect(ecritures).toHaveProperty(
      `personnel/conjointe/periods/${MOIS}/variableCharges/c1`
    );
  });
});
