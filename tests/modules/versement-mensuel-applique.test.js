// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Le versement mensuel, à l'ouverture d'un mois neuf
 *
 * La décision est fixée par `tests/utils/versement-mensuel.test.js`. Ce qui se
 * juge ici : ce qui part en base, sous quelles clés, et surtout ce qui NE part
 * pas une seconde fois.
 */

const dbGet = vi.fn(() => Promise.resolve(null));
const dbSet = vi.fn(() => Promise.resolve());

vi.mock('../../public/js/db.js', () => ({
  dbGet, dbSet,
  dbPush: vi.fn(() => Promise.resolve('cle')),
  dbUpdate: vi.fn(() => Promise.resolve()),
  getDataPath: vi.fn(chemin => `household/${chemin}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/utils/date.js', async (reel) => ({
  ...await reel(),
  getCurrentPeriod: vi.fn(() => '2026-09')
}));

const { appliquerLesVersementsMensuels } =
  await import('../../public/js/modules/versement-mensuel.js');
const { toast } = await import('../../public/js/components/toast.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** L'enveloppe du foyer : 150 € par mois, à deux */
const VACANCES = {
  id: 'vacances-2027', label: 'Vacances 2027', icon: '🏖️',
  cloturee: false, debut: null, fin: null, nature: 'cagnotte',
  versementMensuel: { montant: 150, auteur: 'deux' }
};

/** Ce qui a été écrit : chemin → contenu */
const ecritures = () => dbSet.mock.calls.map(([chemin, valeur]) => ({ chemin, valeur }));

/**
 * Ce que la base rend, pour ce cas
 * @param {Object} [options]
 * @param {Object} [options.versements] - Nœud `versements` complet
 */
function baseAvec({ versements = null } = {}) {
  dbGet.mockImplementation(chemin => {
    if (chemin === 'versements') return Promise.resolve(versements);
    if (chemin === 'periods') return Promise.resolve({ '2026-09': {} });
    if (chemin === 'salaries') return Promise.resolve({ vous: 2600, conjointe: 1800 });
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbSet.mockResolvedValue(undefined);
  resetState();
  setState('currentPeriod', '2026-09');
  setState('shareMode', 'prorata');
  setState('salaries', { vous: 2600, conjointe: 1800 });
  setState('envelopes', [VACANCES]);
  baseAvec();
});

describe('Ce qui est mis de côté', () => {
  it('écrit une ligne par personne, sous des clés déterministes', async () => {
    const ecrits = await appliquerLesVersementsMensuels();

    expect(ecrits).toBe(2);
    expect(ecritures().map(e => e.chemin)).toEqual([
      'versements/vacances-2027/auto-2026-09-vous',
      'versements/vacances-2027/auto-2026-09-conjointe'
    ]);
  });

  it('les deux parts font exactement le montant réglé', async () => {
    await appliquerLesVersementsMensuels();

    const total = ecritures().reduce((somme, e) => somme + e.valeur.montant, 0);
    expect(Math.round(total * 100) / 100).toBe(150);
  });

  it('elles sont partagées au prorata des revenus du mois visé', async () => {
    await appliquerLesVersementsMensuels();

    // 150 × 2600/4400 = 88,636… → 88,64, le reste à l'autre.
    expect(ecritures()[0].valeur).toMatchObject({ auteur: 'vous', montant: 88.64 });
    expect(ecritures()[1].valeur).toMatchObject({ auteur: 'conjointe', montant: 61.36 });
  });

  it('l\'instantané du mois prime sur les revenus globaux', async () => {
    // Le mois visé a son propre instantané : c'est lui qui décide, comme
    // partout ailleurs dans l'application.
    dbGet.mockImplementation(chemin => {
      if (chemin === 'periods') {
        return Promise.resolve({ '2026-09': { salaries: { vous: 1000, conjointe: 1000 } } });
      }
      if (chemin === 'salaries') return Promise.resolve({ vous: 2600, conjointe: 1800 });
      return Promise.resolve(null);
    });

    await appliquerLesVersementsMensuels();

    expect(ecritures()[0].valeur.montant).toBe(75);
    expect(ecritures()[1].valeur.montant).toBe(75);
  });

  it('les lignes sont datées du premier du mois', async () => {
    await appliquerLesVersementsMensuels();

    expect(ecritures().every(e => e.valeur.date === '2026-09-01')).toBe(true);
  });

  it('ce sont des versements ordinaires, pas une forme à part', async () => {
    // Mêmes champs, mêmes règles, même corbeille : rien ne les distingue à la
    // lecture sinon leur clé.
    await appliquerLesVersementsMensuels();

    expect(Object.keys(ecritures()[0].valeur).sort())
      .toEqual(['auteur', 'date', 'deleted', 'montant', 'timestamp']);
  });

  it('un destinataire unique ne donne qu\'une ligne', async () => {
    setState('envelopes', [{ ...VACANCES, versementMensuel: { montant: 150, auteur: 'vous' } }]);

    await appliquerLesVersementsMensuels();

    expect(ecritures()).toHaveLength(1);
    expect(ecritures()[0].valeur).toMatchObject({ auteur: 'vous', montant: 150 });
  });

  it('le foyer est prévenu de ce qui vient de bouger', async () => {
    // De l'argent qui se met de côté sans qu'on l'ait demandé ce matin-là doit
    // se voir : un mois qui se remplit en silence se lit comme une anomalie.
    await appliquerLesVersementsMensuels();

    expect(toast.info).toHaveBeenCalledTimes(1);
    const dit = toast.info.mock.calls[0][0];
    expect(dit).toContain('150,00');
    expect(dit).toContain('Vacances 2027');
  });
});

describe('Ce qui ne part pas une seconde fois', () => {
  it('un mois déjà alimenté ne l\'est pas de nouveau', async () => {
    baseAvec({
      versements: {
        'vacances-2027': {
          'auto-2026-09-vous': { montant: 88.64, auteur: 'vous', deleted: false },
          'auto-2026-09-conjointe': { montant: 61.36, auteur: 'conjointe', deleted: false }
        }
      }
    });

    expect(await appliquerLesVersementsMensuels()).toBe(0);
    expect(dbSet).not.toHaveBeenCalled();
  });

  it('un versement RETIRÉ ne revient pas', async () => {
    // La suppression est douce : la clé demeure. Sans elle, retirer le
    // versement de septembre le ferait réapparaître à la prochaine ouverture.
    baseAvec({
      versements: {
        'vacances-2027': {
          'auto-2026-09-vous': { montant: 88.64, auteur: 'vous', deleted: true },
          'auto-2026-09-conjointe': { montant: 61.36, auteur: 'conjointe', deleted: true }
        }
      }
    });

    expect(await appliquerLesVersementsMensuels()).toBe(0);
  });

  it('une entrée abîmée compte quand même comme présente', async () => {
    // Les clés BRUTES du nœud, et non des versements normalisés : une entrée
    // qu'une normalisation écarterait ferait réalimenter un mois qui l'est
    // déjà, et doublerait la mise.
    baseAvec({
      versements: { 'vacances-2027': { 'auto-2026-09-vous': { montant: 'abîmé' } } }
    });

    expect(await appliquerLesVersementsMensuels()).toBe(0);
  });

  it('les versements d\'un autre mois ne bloquent rien', async () => {
    baseAvec({
      versements: {
        'vacances-2027': {
          'auto-2026-08-vous': { montant: 88.64, auteur: 'vous', deleted: false },
          '-NabcDEF123': { montant: 50, auteur: 'vous', deleted: false }
        }
      }
    });

    expect(await appliquerLesVersementsMensuels()).toBe(2);
  });
});

describe('Quand il n\'y a rien à faire', () => {
  it('aucune enveloppe réglée : pas même une lecture', async () => {
    setState('envelopes', [{ ...VACANCES, versementMensuel: null }]);

    expect(await appliquerLesVersementsMensuels()).toBe(0);
    expect(dbGet).not.toHaveBeenCalled();
  });

  it('sans période affichée, rien ne part', async () => {
    setState('currentPeriod', null);

    expect(await appliquerLesVersementsMensuels()).toBe(0);
    expect(dbSet).not.toHaveBeenCalled();
  });

  it('un mois PASSÉ n\'est jamais alimenté', async () => {
    setState('currentPeriod', '2026-07');

    expect(await appliquerLesVersementsMensuels()).toBe(0);
    expect(dbSet).not.toHaveBeenCalled();
  });

  it('rien à faire ne dit rien', async () => {
    setState('envelopes', [{ ...VACANCES, versementMensuel: null }]);

    await appliquerLesVersementsMensuels();
    expect(toast.info).not.toHaveBeenCalled();
  });
});

describe('Un échec ne bloque pas le mois', () => {
  it('une base injoignable rend zéro plutôt que de lever', async () => {
    // Un pot non alimenté se rattrape au geste suivant ; un bilan qui refuse de
    // s'afficher ne se rattrape pas du tout.
    dbGet.mockRejectedValue(new Error('offline'));

    await expect(appliquerLesVersementsMensuels()).resolves.toBe(0);
  });

  it('une enveloppe refusée n\'emporte pas les autres', async () => {
    setState('envelopes', [
      VACANCES,
      { ...VACANCES, id: 'travaux', label: 'Travaux', versementMensuel: { montant: 50, auteur: 'vous' } }
    ]);
    dbSet
      .mockRejectedValueOnce(new Error('PERMISSION_DENIED'))
      .mockResolvedValue(undefined);

    expect(await appliquerLesVersementsMensuels()).toBe(2);
    expect(dbSet).toHaveBeenCalledTimes(3);
  });
});
