// @vitest-environment jsdom
/**
 * La reconduction rend son empreinte quand la copie échoue
 *
 * `applyRecurringCharges` réserve d'abord la marque `reconductedFrom` par une
 * transaction — c'est ce qui empêche deux téléphones ouvrant l'application le
 * même matin de reconduire chacun les charges. Puis elle copie.
 *
 * Entre les deux, tout peut arriver : une coupure, un refus de règle. La marque
 * était alors posée sans une seule charge en face, et `planRecurrence` s'y
 * arrête définitivement — « Déjà reconduit : l'empreinte fait foi, même si les
 * charges ont depuis été supprimées ». Aucune réouverture ne réessayait, et le
 * `catch` avalait l'erreur : le loyer disparaissait du mois, pour de bon, sans
 * un mot.
 *
 * Un mois qui devait s'ouvrir avec le loyer et qui s'ouvre vide se lit comme un
 * mois où il n'y a rien à payer. C'est le constat le plus cher de l'audit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const toasts = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn()
}));

vi.mock('../../public/js/components/toast.js', () => ({ toast: toasts }));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/fixed-charges.js', () => ({
  loadFixedCharges: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));
vi.mock('../../public/js/db.js', () => ({
  getDataPath: (chemin) => `household/${chemin}`,
  dbGet: vi.fn()
}));

const base = vi.hoisted(() => ({ instance: null }));
vi.mock('../../public/js/firebase-init.js', () => ({
  getFirebaseDatabase: () => base.instance
}));

/**
 * Recharge le module et lance la reconduction sur un mois neuf
 *
 * `reconduction.js` garde sa référence de base entre deux appels
 * (`database = database || getFirebaseDatabase()`) — c'est voulu, et c'est ce
 * qui a réparé la reconduction qui ne partait jamais au démarrage. Mais en
 * test, cela fait hériter chaque cas de la base factice du précédent : sans ce
 * rechargement, quatre cas sur cinq observaient la base du premier et
 * passaient à côté de ce qu'ils prétendaient vérifier.
 *
 * @param {string} periode - Le mois affiché
 * @returns {Promise<number>} Le nombre de charges reconduites
 */
async function reconduireDans(periode) {
  vi.resetModules();

  const { setState, resetState } = await import('../../public/js/state.js');
  const { dbGet } = await import('../../public/js/db.js');
  const { applyRecurringCharges } = await import('../../public/js/modules/reconduction.js');

  resetState();
  setState('currentPeriod', periode);
  dbGet.mockResolvedValue(PERIODES);

  return applyRecurringCharges();
}

/** Un mois d'août garni, un mois de septembre neuf */
const PERIODES = {
  '2026-08': {
    fixedCharges: {
      loyer: { description: 'Loyer', amount: 900, recurring: true, date: '2026-08-05' },
      internet: { description: 'Internet', amount: 39.99, recurring: true }
    }
  }
};

/**
 * Une base factice dont on décide si l'écriture des charges aboutit
 *
 * @param {Object} options
 * @param {boolean} options.copieEchoue - L'`update` final rejette-t-il ?
 * @param {boolean} [options.retraitEchoue] - Le retrait de l'empreinte rejette-t-il aussi ?
 * @returns {Object} La base, et le journal de ce qui lui a été demandé
 */
function baseFactice({ copieEchoue, retraitEchoue = false }) {
  const journal = { empreinte: [], copies: 0 };

  const empreinte = {
    transaction: vi.fn(async (decider) => {
      const valeur = decider(null);
      journal.empreinte.push(valeur);
      return { committed: valeur !== undefined };
    }),
    set: vi.fn(async (valeur) => {
      journal.empreinte.push(valeur);
      if (retraitEchoue) throw new Error('retrait refusé lui aussi');
    })
  };

  const racine = {
    push: () => ({ key: `cle-${Math.random().toString(36).slice(2, 8)}` }),
    update: vi.fn(async () => {
      journal.copies += 1;
      if (copieEchoue) throw new Error('liaison perdue pendant la copie');
    })
  };

  return {
    journal,
    instance: {
      ref: (chemin) => (chemin === undefined ? racine : empreinte)
    }
  };
}

describe('Reconduction : l\'empreinte ne survit pas à une copie ratée', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copie les charges et garde l\'empreinte quand tout va bien', async () => {
    const { instance, journal } = baseFactice({ copieEchoue: false });
    base.instance = instance;

    const nombre = await reconduireDans('2026-09');

    expect(nombre).toBe(2);
    expect(journal.copies).toBe(1);
    // Posée, et jamais reprise : le mois est bien reconduit.
    expect(journal.empreinte).toEqual(['2026-08']);
  });

  it('rend l\'empreinte quand la copie échoue', async () => {
    const { instance, journal } = baseFactice({ copieEchoue: true });
    base.instance = instance;

    const nombre = await reconduireDans('2026-09');

    expect(nombre).toBe(0);
    // Posée puis reprise : le mois redevient reconductible.
    expect(journal.empreinte, 'l\'empreinte est restée sur un mois sans charges')
      .toEqual(['2026-08', null]);
  });

  it('le dit, au lieu de laisser découvrir un mois vide', async () => {
    base.instance = baseFactice({ copieEchoue: true }).instance;

    await reconduireDans('2026-09');

    expect(toasts.error).toHaveBeenCalledTimes(1);
    expect(toasts.error.mock.calls[0][0]).toContain('non reconduites');
  });

  it('ne lève pas quand le retrait échoue à son tour', async () => {
    // Cas probable : la liaison est coupée, donc les deux écritures ratent.
    // On ne peut alors pas faire mieux depuis l'appareil — mais la fonction
    // doit rendre la main, pas emporter le chargement de la période.
    const { instance } = baseFactice({ copieEchoue: true, retraitEchoue: true });
    base.instance = instance;

    await expect(reconduireDans('2026-09')).resolves.toBe(0);
  });

  it('ne réserve rien quand un autre appel a déjà la marque', async () => {
    const { instance, journal } = baseFactice({ copieEchoue: false });
    // Une empreinte déjà posée : la transaction rend `undefined`, donc pas de
    // commit. Le second téléphone n'écrit rien — et surtout ne va pas
    // retirer l'empreinte du premier.
    instance.ref('x').transaction = vi.fn(async () => ({ committed: false }));
    base.instance = instance;

    const nombre = await reconduireDans('2026-09');

    expect(nombre).toBe(0);
    expect(journal.copies).toBe(0);
    expect(journal.empreinte).toEqual([]);
  });
});
