// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Savoir pourquoi la base ne répond pas
 *
 * Trois causes produisent le même écran, et chacune appelle un remède
 * différent : session expirée, jeton refusé, transport bloqué. Se déconnecter
 * n'a jamais réparé un WebSocket coupé, et attendre n'a jamais renouvelé un
 * jeton mort.
 *
 * On a passé des heures à supposer. Ces contrôles portent sur la lecture des
 * mesures — la partie qu'il ne faut pas se tromper à écrire, puisque c'est
 * elle qui oriente le remède.
 */

const noter = vi.fn();
vi.mock('../../public/js/utils/diagnostics.js', () => ({
  noter: (...arguments_) => noter(...arguments_),
  exigerElement: (id) => document.getElementById(id),
  initDiagnostics: vi.fn(),
  rapport: vi.fn(() => '')
}));

const { renouvelerLeJeton, lireEnHttps, conclusion, diagnostiquerLaLiaison } =
  await import('../../public/js/utils/sonde-liaison.js');

/** Un compte dont le jeton se renouvelle */
function compteValide(jeton = 'x'.repeat(900)) {
  return { getIdToken: vi.fn(async (forcer) => { compteValide.forcer = forcer; return jeton; }) };
}

beforeEach(() => {
  noter.mockClear();
});

describe('Le renouvellement du jeton', () => {
  it('force le renouvellement, faute de quoi il ne mesure rien', async () => {
    // Sans `true`, Firebase rend le jeton qu'il garde en mémoire — valide une
    // heure — et l'on ne saurait rien de ce qui compte : la capacité à en
    // obtenir un *nouveau*. C'est elle qui manque quand une session a expiré.
    const utilisateur = compteValide();

    await renouvelerLeJeton(utilisateur);

    expect(utilisateur.getIdToken).toHaveBeenCalledWith(true);
  });

  it('rend la longueur du jeton, jamais le jeton dans le journal', async () => {
    const resultat = await renouvelerLeJeton(compteValide('abcdef'));

    expect(resultat.ok).toBe(true);
    expect(resultat.taille).toBe(6);
  });

  it('un jeton vide ne compte pas pour un succès', async () => {
    const resultat = await renouvelerLeJeton({ getIdToken: async () => '' });

    expect(resultat.ok).toBe(false);
    expect(resultat.motif).toBe('jeton vide');
  });

  it('sans session ouverte, le dit plutôt que de lever', async () => {
    const resultat = await renouvelerLeJeton(null);

    expect(resultat.ok).toBe(false);
    expect(resultat.motif).toBe('aucune session ouverte');
  });

  it('un refus de Firebase est rapporté, pas propagé', async () => {
    const resultat = await renouvelerLeJeton({
      getIdToken: async () => { throw new Error('auth/user-token-expired'); }
    });

    expect(resultat.ok).toBe(false);
    expect(resultat.motif).toContain('user-token-expired');
  });
});

describe('La lecture HTTPS authentifiée', () => {
  it('demande le chemin voulu, et porte le jeton en en-tête', async () => {
    const recuperer = vi.fn(async () => ({ status: 200 }));

    await lireEnHttps({
      base: 'https://base.exemple',
      chemin: 'household/shareMode',
      jeton: 'JETON',
      recuperer
    });

    const [adresse, options] = recuperer.mock.calls[0];
    expect(adresse).toContain('https://base.exemple/household/shareMode.json');
    // On veut un code de réponse, pas des montants.
    expect(adresse).toContain('shallow=true');
    expect(options.headers.Authorization).toBe('Bearer JETON');
  });

  it('ne met jamais le jeton dans l\'adresse', async () => {
    // Ce test attendait l'inverse. `?auth=` est le mécanisme hérité des
    // *database secrets* : une query string ressort par
    // `performance.getEntriesByType('resource')`, lisible par tout script de
    // l'origine et conservée après coup, et par les journaux de tout proxy qui
    // déchiffre le TLS. Or la sonde ne part que si la liaison est rompue,
    // c'est-à-dire d'abord derrière un tunnel d'entreprise.
    const recuperer = vi.fn(async () => ({ status: 200 }));

    await lireEnHttps({
      base: 'https://base.exemple',
      chemin: 'household/shareMode',
      jeton: 'JETON-SECRET',
      recuperer
    });

    const [adresse, options] = recuperer.mock.calls[0];
    expect(adresse).not.toContain('JETON-SECRET');
    expect(adresse).not.toContain('auth=');
    expect(options.referrerPolicy).toBe('no-referrer');
  });

  it('rapporte une absence de réponse sans lever', async () => {
    const resultat = await lireEnHttps({
      base: 'https://base.exemple',
      chemin: 'household/shareMode',
      jeton: 'JETON',
      recuperer: async () => { throw new Error('Failed to fetch'); }
    });

    expect(resultat.statut).toBeNull();
    expect(resultat.motif).toContain('Failed to fetch');
  });
});

describe('La lecture des deux mesures', () => {
  it('jeton mort : se reconnecter, et rien d\'autre', () => {
    expect(conclusion({ ok: false }, null)).toContain('se reconnecter');
  });

  it('jeton bon et base qui répond : seul le transport est en cause', () => {
    // Le cas qui compte le plus, parce que c'est celui où l'on se trompe de
    // remède : tout est valide, se déconnecter ne répare rien.
    const lu = conclusion({ ok: true }, { statut: 200 });

    expect(lu).toContain('transport');
    expect(lu, 'ne doit surtout pas envoyer se reconnecter').not.toContain('reconnecter');
  });

  it('jeton bon mais refusé : ce sont les règles ou le compte', () => {
    expect(conclusion({ ok: true }, { statut: 401 })).toContain('refusé');
    expect(conclusion({ ok: true }, { statut: 403 })).toContain('refusé');
  });

  it('jeton bon et hôte muet : la base est hors d\'atteinte', () => {
    expect(conclusion({ ok: true }, { statut: null })).toContain('n\'a pas répondu');
  });
});

describe('Ce que le journal retient', () => {
  it('consigne les deux étapes puis la cause, sans jamais le jeton', async () => {
    await diagnostiquerLaLiaison({
      utilisateur: compteValide('S3CR3T-de-courte-duree'),
      base: 'https://base.exemple',
      chemin: 'household/shareMode',
      recuperer: async () => ({ status: 200 })
    });

    const entrees = noter.mock.calls;
    expect(entrees.map(appel => appel[1])).toEqual([
      'jeton renouvelé',
      'lecture HTTPS authentifiée',
      'diagnostic'
    ]);

    // Le jeton ouvre l'accès aux comptes du foyer : il n'a rien à faire dans
    // un journal fait pour être copié et collé dans une conversation.
    const journalise = JSON.stringify(entrees);
    expect(journalise).not.toContain('S3CR3T');
    expect(journalise).toContain('"taille":22');
  });

  it('s\'arrête au jeton quand il ne se renouvelle pas, sans sonder pour rien', async () => {
    const recuperer = vi.fn();

    await diagnostiquerLaLiaison({
      utilisateur: { getIdToken: async () => { throw new Error('auth/network-request-failed'); } },
      base: 'https://base.exemple',
      chemin: 'household/shareMode',
      recuperer
    });

    expect(recuperer).not.toHaveBeenCalled();
    expect(noter.mock.calls.map(appel => appel[1])).toEqual(['jeton non renouvelé', 'diagnostic']);
    expect(noter.mock.calls.at(-1)[2].cause).toContain('se reconnecter');
  });
});
