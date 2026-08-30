// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Le geste qui déclare un abonnement fixe, mesuré sur ce qui part en base
 *
 * `planDeclarationFixe` est éprouvée à part, comme fonction pure. Ce fichier-ci
 * regarde le CÂBLAGE : ce que le module lit avant d'écrire, ce qu'il écrit, et
 * ce qu'il refuse d'écrire.
 *
 * C'est la leçon du fil précédent : une lecture de source mesure la forme du
 * câblage, jamais son effet. Ici on inspecte le lot multi-chemins réellement
 * envoyé à `dbUpdate`.
 */

const dbGet = vi.fn();
const dbUpdate = vi.fn();
const liaisonRompue = vi.fn(() => false);
vi.mock('../../public/js/db.js', () => ({
  dbGet: (...a) => dbGet(...a),
  dbUpdate: (...a) => dbUpdate(...a),
  liaisonRompue: (...a) => liaisonRompue(...a),
  dbSet: vi.fn(),
  dbPush: vi.fn()
}));

let rangDeCle = 0;
vi.mock('../../public/js/firebase-init.js', () => ({
  getFirebaseDatabase: () => ({ ref: () => ({ push: () => ({ key: `neuve${++rangDeCle}` }) }) }),
  getFirebaseAuth: vi.fn(),
  getGoogleAuthProvider: vi.fn(),
  initFirebase: vi.fn(),
  onConnectionChange: vi.fn()
}));

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));

const showConfirmModal = vi.fn(async () => true);
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: (...a) => showConfirmModal(...a)
}));

const loadVariableCharges = vi.fn(async () => {});
vi.mock('../../public/js/modules/variable-charges.js', () => ({
  loadVariableCharges: (...a) => loadVariableCharges(...a),
  initVariableCharges: vi.fn()
}));

import { toast } from '../../public/js/components/toast.js';
import { setState, resetState } from '../../public/js/state.js';
import { declarerAbonnementsProposes } from '../../public/js/modules/fixed-charges.js';

/** Le mois affiché, tel que la base le rend */
const PERIODE = {
  variableCharges: {
    v1: {
      description: 'Netflix', amount: 13.49, category: 'Loisirs',
      paidBy: 'vous', date: '2026-08-04', deleted: false
    }
  },
  fixedCharges: {
    f1: {
      description: 'Loyer', amount: 900, paidBy: 'vous',
      date: '2026-08-01', recurring: true, deleted: false
    }
  }
};

/** L'observation, telle que `anticiper` la laisse dans l'état */
const OBSERVATION = {
  cle: 'abonnements-non-declares',
  titre: '2 charges reviennent chaque mois sans être déclarées fixes',
  propositionFixe: {
    charges: [
      { libelle: 'Netflix', montant: 13.49, payeur: 'vous', categorie: 'Loisirs' },
      { libelle: 'Salle de sport', montant: 29.9, payeur: 'conjointe', categorie: 'Sport' }
    ],
    parMois: 43.39,
    parAn: 520.68
  }
};

/** Monte l'état comme `loadPeriodData` le monte */
function monter({ observations = [OBSERVATION], periode = PERIODE } = {}) {
  resetState();
  document.body.innerHTML = '<div id="summarySection"></div>';
  setState('currentPeriod', '2026-08');
  setState('observations', observations);
  setState('fixedCharges', Object.values(periode?.fixedCharges || {}));
  setState('variableCharges', Object.values(periode?.variableCharges || {}));
  setState('salaries', { vous: 3000, conjointe: 1000 });
  setState('reimbursements', []);
  setState('shareMode', 'prorata');

  dbGet.mockImplementation(async (chemin) =>
    (chemin === 'periods' ? { '2026-08': periode } : periode));
}

/** Le lot multi-chemins réellement envoyé */
const lot = () => {
  const appel = dbUpdate.mock.calls.find(([chemin]) => chemin === undefined);
  return appel ? appel[1] : null;
};

beforeEach(() => {
  vi.clearAllMocks();
  rangDeCle = 0;
  showConfirmModal.mockResolvedValue(true);
  liaisonRompue.mockReturnValue(false);
  dbUpdate.mockResolvedValue(undefined);
});

describe('CE QUI PART EN BASE', () => {
  it('les charges fixes ET la corbeille, dans UNE SEULE écriture', async () => {
    // Deux écritures séparées pourraient échouer à moitié et laisser le mois
    // compté deux fois : la charge fixe créée, la variable toujours là.
    monter();

    expect(await declarerAbonnementsProposes('abonnements-non-declares')).toBe(true);
    expect(dbUpdate).toHaveBeenCalledTimes(1);

    const chemins = Object.keys(lot());
    expect(chemins).toHaveLength(3);
    expect(chemins.filter(c => c.includes('/fixedCharges/'))).toHaveLength(2);
    expect(lot()['periods/2026-08/variableCharges/v1/deleted']).toBe(true);
  });

  it('la charge écrite est récurrente, commune, et porte le bon montant', async () => {
    monter();
    await declarerAbonnementsProposes('abonnements-non-declares');

    const netflix = Object.values(lot()).find(v => v && v.description === 'Netflix');

    expect(netflix.recurring).toBe(true);
    expect(netflix.perimetre).toBe('commun');
    expect(netflix.paidBy).toBe('vous');
    expect(netflix.amount).toBeCloseTo(13.49, 2);
    expect(netflix.deleted).toBe(false);
  });

  it('LE MOIS EST RELU avant d\'écrire, jamais pris dans l\'état', async () => {
    // Entre l'affichage de la carte et le clic, l'autre téléphone a pu saisir
    // l'abonnement — ou le déclarer fixe lui-même. Sans cette relecture, le
    // mois serait compté deux fois.
    monter();
    await declarerAbonnementsProposes('abonnements-non-declares');

    expect(dbGet).toHaveBeenCalledWith('periods/2026-08');
    // Et la lecture précède l'écriture.
    expect(dbGet.mock.invocationCallOrder[0]).toBeLessThan(dbUpdate.mock.invocationCallOrder[0]);
  });

  it('ce que l\'autre téléphone a déclaré entre-temps n\'est pas réécrit', async () => {
    // La base fait foi, pas la carte affichée.
    monter({
      periode: {
        fixedCharges: {
          f9: { description: 'Netflix', amount: 13.49, paidBy: 'vous', recurring: true, deleted: false }
        }
      }
    });

    await declarerAbonnementsProposes('abonnements-non-declares');

    const ecrites = Object.values(lot()).filter(v => v && v.description);
    expect(ecrites.map(c => c.description)).toEqual(['Salle de sport']);
  });
});

describe('ON DEMANDE AVANT D\'ÉCRIRE', () => {
  it('la question nomme les charges et ce qu\'elles engagent', async () => {
    monter();
    await declarerAbonnementsProposes('abonnements-non-declares');

    const [question] = showConfirmModal.mock.calls[0];
    expect(question).toContain('Netflix');
    expect(question).toContain('Salle de sport');
    expect(question).toContain('par mois');
  });

  it('refuser n\'écrit rien du tout', async () => {
    monter();
    showConfirmModal.mockResolvedValue(false);

    expect(await declarerAbonnementsProposes('abonnements-non-declares')).toBe(false);
    expect(dbUpdate).not.toHaveBeenCalled();
  });
});

describe('CE QUI NE S\'ÉCRIT PAS', () => {
  it('une observation qui n\'est plus à l\'écran', async () => {
    monter({ observations: [] });

    expect(await declarerAbonnementsProposes('abonnements-non-declares')).toBe(false);
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('une observation sans proposition — la clé d\'une AUTRE carte', async () => {
    monter({ observations: [{ cle: 'depenses-par-lieu', titre: 'x' }] });

    expect(await declarerAbonnementsProposes('depenses-par-lieu')).toBe(false);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it('un payeur que la fenêtre n\'établit pas — et le motif est DIT', async () => {
    // Le bouton paraîtrait inerte sans ce message, et le foyer cliquerait
    // encore. « Le payeur n'est jamais deviné » doit s'expliquer.
    monter({
      observations: [{
        cle: 'abonnements-non-declares',
        propositionFixe: {
          charges: [{ libelle: 'Netflix', montant: 13.49, payeur: null, categorie: 'Loisirs' }]
        }
      }]
    });

    expect(await declarerAbonnementsProposes('abonnements-non-declares')).toBe(false);
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(toast.info.mock.calls.flat().join(' ')).toContain('payeur variable');
  });

  it('HORS LIGNE : refusé avant même de demander', async () => {
    // Le lot vise la racine de l'espace, et `operationRejouable` refuse de
    // différer une écriture qui ne nomme aucun nœud — c'est la garde qui
    // empêche une entrée forgée d'effacer le foyer. L'écriture échouerait donc
    // de toute façon, mais après avoir posé la question et reçu un oui.
    monter();
    liaisonRompue.mockReturnValue(true);

    expect(await declarerAbonnementsProposes('abonnements-non-declares')).toBe(false);
    expect(showConfirmModal).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(toast.error.mock.calls.flat().join(' ')).toContain('hors ligne');
  });

  it('et une lecture du mois qui échoue ne fait rien écrire non plus', async () => {
    monter();
    dbGet.mockRejectedValue(new Error('réseau'));

    expect(await declarerAbonnementsProposes('abonnements-non-declares')).toBe(false);
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('APRÈS L\'ÉCRITURE', () => {
  it('les DEUX listes sont relues : des variables viennent de partir', async () => {
    // Sans cela l'écran montrerait encore la charge à la corbeille, et le foyer
    // la croirait comptée deux fois.
    monter();
    await declarerAbonnementsProposes('abonnements-non-declares');

    expect(loadVariableCharges).toHaveBeenCalled();
  });

  it('une écriture refusée est annoncée, et ne prétend rien', async () => {
    monter();
    dbUpdate.mockRejectedValue(new Error('PERMISSION_DENIED'));

    expect(await declarerAbonnementsProposes('abonnements-non-declares')).toBe(false);
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('ce qui a été écarté est dit, même quand le reste est passé', async () => {
    // Un silence laisserait croire que tout est passé — et le mois prochain la
    // carte reviendrait sans qu'on comprenne pourquoi.
    monter({
      observations: [{
        cle: 'abonnements-non-declares',
        propositionFixe: {
          charges: [
            { libelle: 'Netflix', montant: 13.49, payeur: 'vous', categorie: 'Loisirs' },
            { libelle: 'Mutuelle', montant: 60, payeur: null, categorie: 'Santé' }
          ]
        }
      }]
    });

    expect(await declarerAbonnementsProposes('abonnements-non-declares')).toBe(true);
    expect(toast.success).toHaveBeenCalled();
    expect(toast.info.mock.calls.flat().join(' ')).toContain('Mutuelle');
  });
});
