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

/**
 * Le nœud `versements` tel qu'il est réellement en base
 *
 * Les contrôles d'écriture partielle portent sur CE QUI RESTE en base après un
 * refus, et non sur le nombre d'appels à telle ou telle fonction : la garantie
 * qui compte est l'état du pot, pas le mécanisme qui l'écrit. Un test qui
 * compterait les `dbSet` interdirait de passer à une écriture atomique, alors
 * que c'est précisément le remède d'AUDIT-001.
 *
 * @type {Object<string, Object>}
 */
let baseVersements = {};

/**
 * Ce que le serveur refuse, ou `null` s'il accepte tout
 * @type {((enveloppe: string, cles: string[]) => boolean)|null}
 */
let refus = null;

/**
 * Refuse comme Realtime Database refuse
 *
 * Un lot multi-chemins dont UN enfant est invalide est rejeté ENTIER : c'est
 * le comportement du moteur, et c'est ce qui distingue une écriture atomique
 * d'une suite d'écritures indépendantes.
 *
 * @param {string} enveloppe
 * @param {string[]} cles - Les clés que cette écriture pose
 * @returns {Promise<never>|null}
 */
function refuserSiBesoin(enveloppe, cles) {
  return refus && refus(enveloppe, cles)
    ? Promise.reject(new Error('PERMISSION_DENIED'))
    : null;
}

const dbSet = vi.fn((chemin, valeur) => {
  const [, enveloppe, cle] = chemin.split('/');
  return refuserSiBesoin(enveloppe, [cle]) || Promise.resolve(
    (baseVersements[enveloppe] = { ...(baseVersements[enveloppe] || {}), [cle]: valeur }, undefined)
  );
});

const dbUpdate = vi.fn((chemin, modifications) => {
  const enveloppe = chemin.split('/')[1];
  return refuserSiBesoin(enveloppe, Object.keys(modifications)) || Promise.resolve(
    (baseVersements[enveloppe] = { ...(baseVersements[enveloppe] || {}), ...modifications }, undefined)
  );
});

/** Ce qui est effectivement en base, à plat — l'ordre est celui de l'écriture */
const ecritures = () => Object.entries(baseVersements).flatMap(
  ([enveloppe, lignes]) => Object.entries(lignes).map(([cle, valeur]) => ({
    chemin: `versements/${enveloppe}/${cle}`, valeur
  }))
);

/** Ce que le pot d'une enveloppe contient réellement */
const contenuDe = (enveloppe) => Math.round(
  Object.values(baseVersements[enveloppe] || {})
    .reduce((somme, ligne) => somme + ligne.montant, 0) * 100
) / 100;

/** Une écriture a-t-elle seulement été tentée ? */
const aTenteDEcrire = () => dbSet.mock.calls.length + dbUpdate.mock.calls.length > 0;

vi.mock('../../public/js/db.js', () => ({
  dbGet, dbSet, dbUpdate,
  dbPush: vi.fn(() => Promise.resolve('cle')),
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
  baseVersements = {};
  refus = null;
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
    expect(aTenteDEcrire()).toBe(false);
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
    expect(aTenteDEcrire()).toBe(false);
  });

  it('un mois PASSÉ n\'est jamais alimenté', async () => {
    setState('currentPeriod', '2026-07');

    expect(await appliquerLesVersementsMensuels()).toBe(0);
    expect(aTenteDEcrire()).toBe(false);
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
    // C'est la raison pour laquelle les enveloppes ne partent PAS dans une
    // écriture unique : un pot refusé ne doit pas priver les autres.
    setState('envelopes', [
      { ...VACANCES, id: 'travaux', label: 'Travaux', versementMensuel: { montant: 50, auteur: 'vous' } },
      VACANCES
    ]);
    refus = (enveloppe) => enveloppe === 'travaux';

    expect(await appliquerLesVersementsMensuels()).toBe(2);
    expect(contenuDe('travaux')).toBe(0);
    expect(contenuDe('vacances-2027')).toBe(150);
  });
});

/**
 * AUDIT-001 — un versement « à deux » ne s'écrit jamais à moitié
 *
 * Les deux parts d'un versement partagé ne sont pas deux décisions : c'est une
 * décision, écrite en deux lignes parce qu'il faut attribuer chaque part à
 * quelqu'un. Les écrire une par une laissait exactement une clé en place quand
 * la seconde était refusée — et la garde d'idempotence, qui déclare le mois
 * alimenté dès qu'UNE des deux clés est là, tenait alors la moitié manquante
 * pour un mois complet. La cagnotte perdait une part, définitivement, sans
 * que rien ne le signale.
 *
 * Ce qui se juge ici est l'ÉTAT DU POT, jamais le nombre d'écritures : la
 * garantie doit survivre à un changement de mécanisme.
 */
describe('AUDIT-001 · Un versement « à deux » ne s\'écrit jamais à moitié', () => {
  /** Le serveur refuse la part de la conjointe, et elle seule */
  const refuserLaPartConjointe = () => {
    refus = (_enveloppe, cles) => cles.includes('auto-2026-09-conjointe');
  };

  it('une part refusée ne laisse pas l\'autre en base', async () => {
    refuserLaPartConjointe();

    await appliquerLesVersementsMensuels();

    expect(ecritures()).toHaveLength(0);
    expect(contenuDe('vacances-2027')).toBe(0);
  });

  it('le mois refusé est repris ENTIER à l\'ouverture suivante', async () => {
    // Le cœur du constat. Une moitié laissée en base rendait le mois
    // « déjà alimenté » : la part manquante n'était jamais rattrapée, et
    // l'écart ne se découvrait qu'à l'échéance.
    refuserLaPartConjointe();
    await appliquerLesVersementsMensuels();

    // Ouverture suivante : le serveur accepte, et la base rend ce qu'elle porte.
    refus = null;
    baseAvec({ versements: baseVersements });

    expect(await appliquerLesVersementsMensuels()).toBe(2);
    expect(contenuDe('vacances-2027')).toBe(150);
  });

  it('rien n\'est annoncé quand rien n\'a été écrit', async () => {
    refuserLaPartConjointe();

    await appliquerLesVersementsMensuels();

    expect(toast.info).not.toHaveBeenCalled();
  });

  it('un mois complet reste intouché à l\'ouverture suivante', async () => {
    // Le témoin négatif du rattrapage : resserrer la garde ne doit pas rouvrir
    // la porte au double versement qu'elle ferme.
    expect(await appliquerLesVersementsMensuels()).toBe(2);

    baseAvec({ versements: baseVersements });

    expect(await appliquerLesVersementsMensuels()).toBe(0);
    expect(contenuDe('vacances-2027')).toBe(150);
  });

  it('deux ouvertures simultanées n\'écrivent pas deux fois', async () => {
    // La clé est déterministe : deux appels concurrents écrivent au même
    // endroit la même chose, le second recouvre le premier. C'est la garantie
    // que la reconduction obtient, elle, par une transaction.
    await Promise.all([appliquerLesVersementsMensuels(), appliquerLesVersementsMensuels()]);

    expect(ecritures()).toHaveLength(2);
    expect(contenuDe('vacances-2027')).toBe(150);
  });

  it('une part NULLE légitime ne fait pas réclamer le mois indéfiniment', async () => {
    // Un mois où l'un des deux n'a aucun revenu ne produit qu'une ligne, par
    // conception : `versementsAEcrire` écarte les montants nuls. La garde ne
    // doit pas réclamer indéfiniment une part qui ne doit pas exister.
    dbGet.mockImplementation(chemin => {
      if (chemin === 'periods') {
        return Promise.resolve({ '2026-09': { salaries: { vous: 0, conjointe: 1800 } } });
      }
      return Promise.resolve(null);
    });

    expect(await appliquerLesVersementsMensuels()).toBe(1);
    expect(contenuDe('vacances-2027')).toBe(150);

    baseAvec({ versements: baseVersements });
    expect(await appliquerLesVersementsMensuels()).toBe(0);
  });
});

/**
 * AUDIT-002 — le message dit ce qui a été écrit, pas ce qui était prévu
 *
 * L'annonce était calculée sur les lignes PLANIFIÉES, les noms sur les
 * enveloppes RÉELLEMENT alimentées : le message était incohérent avec
 * lui-même, et prétendait qu'un lot partiel était complet. Le module voisin
 * `utils/selection-lot.js` traite exactement ce cas, et bien.
 */
describe('AUDIT-002 · Le message annonce ce qui est en base', () => {
  /** Ce que le dernier toast a dit */
  const dit = () => toast.info.mock.calls.at(-1)?.[0] || '';

  it('un lot partiel n\'annonce que ce qui est passé', async () => {
    setState('envelopes', [
      VACANCES,
      { ...VACANCES, id: 'travaux', label: 'Travaux', icon: '🔨', versementMensuel: { montant: 400, auteur: 'vous' } }
    ]);
    refus = (enveloppe) => enveloppe === 'travaux';

    await appliquerLesVersementsMensuels();

    expect(dit()).toContain('150,00');
    expect(dit()).not.toContain('550,00');
    expect(dit()).toContain('Vacances 2027');
    expect(dit()).not.toContain('Travaux');
  });

  it('le total annoncé est celui que la base porte', async () => {
    // La propriété, plutôt qu'un nombre écrit à la main : ce qui est dit doit
    // être ce qui est là, quel que soit le jeu d'essai.
    setState('envelopes', [
      VACANCES,
      { ...VACANCES, id: 'travaux', label: 'Travaux', icon: '🔨', versementMensuel: { montant: 400, auteur: 'vous' } }
    ]);
    refus = (enveloppe) => enveloppe === 'travaux';

    await appliquerLesVersementsMensuels();

    const enBase = contenuDe('vacances-2027') + contenuDe('travaux');
    expect(dit()).toContain(enBase.toFixed(2).replace('.', ','));
  });

  it('un succès complet annonce toujours le total entier', async () => {
    // Le témoin positif : corriger le compte ne doit pas le faire mentir dans
    // l'autre sens.
    setState('envelopes', [
      VACANCES,
      { ...VACANCES, id: 'travaux', label: 'Travaux', icon: '🔨', versementMensuel: { montant: 400, auteur: 'vous' } }
    ]);

    await appliquerLesVersementsMensuels();

    expect(dit()).toContain('550,00');
    expect(dit()).toContain('2 cagnottes');
  });
});
