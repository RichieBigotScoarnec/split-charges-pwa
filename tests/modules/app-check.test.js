// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Activation d'App Check
 *
 * Les règles de sécurité vérifient qui parle ; App Check atteste d'où. Sans
 * lui, la clé API — publique par construction — suffit à marteler
 * `signInWithPassword` sur les comptes du foyer depuis n'importe quel script.
 *
 * Ces tests portent moins sur le chemin nominal que sur ses abandons. Une
 * attestation qui échoue en silence est pire qu'une attestation absente :
 * l'application forcée est activée dans la console en croyant le client prêt,
 * et plus rien ne fonctionne — sans que rien n'ait jamais prévenu.
 */

vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

const noter = vi.fn();
vi.mock('../../public/js/utils/diagnostics.js', () => ({
  noter: (...arguments_) => noter(...arguments_),
  exigerElement: (id) => document.getElementById(id),
  initDiagnostics: vi.fn(),
  rapport: vi.fn(() => '')
}));

/** Journal des activations demandées au SDK */
let activations;

/**
 * Installe un SDK Firebase simulé
 * @param {Object} options - { avecAppCheck } présence du SDK App Check
 */
function installerFirebase({ avecAppCheck = true, jeton = undefined } = {}) {
  activations = [];

  const appCheck = avecAppCheck
    ? Object.assign(
      () => ({
        activate: (fournisseur, autoRefresh) => activations.push({ fournisseur, autoRefresh }),
        ...(jeton === undefined ? {} : { getToken: () => jeton() })
      }),
      {
        ReCaptchaV3Provider: class { constructor(cle) { this.type = 'v3'; this.cle = cle; } },
        ReCaptchaEnterpriseProvider: class { constructor(cle) { this.type = 'enterprise'; this.cle = cle; } }
      }
    )
    : undefined;

  globalThis.firebase = {
    initializeApp: vi.fn(() => ({})),
    database: vi.fn(() => ({ useEmulator: vi.fn() })),
    auth: vi.fn(() => ({ useEmulator: vi.fn() })),
    ...(appCheck ? { appCheck } : {})
  };
}

/**
 * Charge firebase-init avec une configuration donnée
 * @param {Object} config - Valeurs surchargées de js/config.js
 */
async function chargerAvec(config) {
  vi.resetModules();
  vi.doMock('../../public/js/config.js', async (importOriginal) => ({
    ...(await importOriginal()),
    ...config
  }));
  return import('../../public/js/firebase-init.js');
}

beforeEach(() => {
  installerFirebase();
});

describe('Activation d\'App Check', () => {
  it('une clé configurée active l\'attestation, avec renouvellement automatique', async () => {
    const { initFirebase } = await chargerAvec({
      APP_CHECK_SITE_KEY: '6Lc-cle-de-site',
      APP_CHECK_PROVIDER: 'recaptcha-v3',
      USE_EMULATOR: false
    });

    initFirebase();

    expect(activations).toHaveLength(1);
    expect(activations[0].fournisseur.type).toBe('v3');
    expect(activations[0].fournisseur.cle).toBe('6Lc-cle-de-site');
    // Sans renouvellement, une session ouverte plusieurs heures finit par
    // présenter un jeton expiré.
    expect(activations[0].autoRefresh).toBe(true);
  });

  it('le fournisseur Enterprise est retenu quand il est demandé', async () => {
    const { initFirebase } = await chargerAvec({
      APP_CHECK_SITE_KEY: '6Lc-cle-entreprise',
      APP_CHECK_PROVIDER: 'recaptcha-enterprise',
      USE_EMULATOR: false
    });

    initFirebase();

    expect(activations[0].fournisseur.type).toBe('enterprise');
  });

  it('sans clé, rien n\'est activé et l\'abandon est signalé', async () => {
    const { initFirebase } = await chargerAvec({ APP_CHECK_SITE_KEY: '', USE_EMULATOR: false });
    const { warn } = await import('../../public/js/utils/debug.js');

    initFirebase();

    expect(activations).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('App Check inactif'));
  });

  it('sans le SDK App Check, l\'application démarre quand même', async () => {
    // Le SDK vient d'un CDN : il peut manquer là où le reste passe. Une
    // attestation impossible ne doit pas priver le foyer de son application.
    installerFirebase({ avecAppCheck: false });
    const { initFirebase } = await chargerAvec({
      APP_CHECK_SITE_KEY: '6Lc-cle-de-site',
      USE_EMULATOR: false
    });
    const { warn } = await import('../../public/js/utils/debug.js');

    expect(() => initFirebase()).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('le SDK n\'est pas chargé'));
  });

  it('une erreur du SDK n\'interrompt pas l\'initialisation', async () => {
    globalThis.firebase.appCheck = Object.assign(
      () => ({ activate: () => { throw new Error('clé refusée'); } }),
      { ReCaptchaV3Provider: class {} }
    );
    const { initFirebase } = await chargerAvec({
      APP_CHECK_SITE_KEY: '6Lc-cle-de-site',
      USE_EMULATOR: false
    });

    expect(() => initFirebase()).not.toThrow();
    expect(globalThis.firebase.database).toHaveBeenCalled();
  });

  it('les émulateurs n\'exigent aucune attestation', async () => {
    const { initFirebase } = await chargerAvec({
      APP_CHECK_SITE_KEY: '6Lc-cle-de-site',
      USE_EMULATOR: true
    });

    initFirebase();

    expect(activations).toHaveLength(0);
  });
});

describe('Cohérence entre la page et le code', () => {
  it('le SDK App Check est chargé par FairSplit.html, avec empreinte SRI', async () => {
    // Le code appelle firebase.appCheck() : sans la balise, l'attestation est
    // inactive alors que la configuration la croit prête.
    const { readFileSync } = await import('node:fs');
    const html = readFileSync('public/FairSplit.html', 'utf8');

    const balise = html.split('\n').find(l => l.includes('firebase-app-check-compat.js'));
    expect(balise).toBeDefined();
    expect(balise).toMatch(/integrity="sha384-/);
    expect(balise).toMatch(/crossorigin="anonymous"/);
  });

  it('la politique de sécurité autorise reCAPTCHA', async () => {
    // App Check charge son épreuve depuis www.google.com : absent de la
    // politique, le script est bloqué et l'attestation échoue silencieusement.
    const { readFileSync } = await import('node:fs');
    const html = readFileSync('public/FairSplit.html', 'utf8');
    const csp = html.split('\n').find(l => l.includes('Content-Security-Policy'));

    const scriptSrc = csp.match(/script-src ([^;]+)/)[1];
    const frameSrc = csp.match(/frame-src ([^;"]+)/)[1];

    expect(scriptSrc).toContain('https://www.google.com');
    expect(frameSrc).toContain('https://www.google.com');
  });
  it('la configuration livrée porte une clé de site', async () => {
    // Les cas ci-dessus simulent la configuration : aucun ne dirait que la
    // vraie est restée vide. C'est pourtant l'état dans lequel l'attestation
    // ne part jamais, alors que tout le câblage donne l'illusion du contraire.
    //
    // Le fichier est lu sur le disque, non importé : `vi.doMock` a remplacé ce
    // module pour les tests précédents, et un import rendrait la configuration
    // simulée. Ce test passait ainsi la clé réellement vide -- un double qui
    // ment sur la réalité ne vérifie que lui-même.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('public/js/config.js', 'utf8');

    const cle = source.match(/APP_CHECK_SITE_KEY = '([^']*)'/)[1];
    const fournisseur = source.match(/APP_CHECK_PROVIDER = '([^']*)'/)[1];

    expect(cle, 'APP_CHECK_SITE_KEY est vide : aucune attestation ne part').toMatch(/^6L/);
    // Le fournisseur doit correspondre au type de clé créé dans la console :
    // une clé v3 présentée comme Enterprise est refusée à l'exécution.
    expect(fournisseur).toBe('recaptcha-v3');
  });
});

describe('L\'attestation aboutit-elle réellement ?', () => {
  /**
   * `activate()` ne dit rien de plus que « la configuration est acceptée ». La
   * console Firebase, elle, comptait zéro requête validée sur cent
   * cinquante-neuf en sept jours : l'attestation était configurée, enregistrée,
   * et n'aboutissait jamais. Le jour où l'application forcée serait activée, ce
   * serait cent pour cent de refus, immédiatement, pour tout le monde.
   */

  const CONFIG = { APP_CHECK_SITE_KEY: '6Lc-cle-de-site', APP_CHECK_PROVIDER: 'recaptcha-v3', USE_EMULATOR: false };

  beforeEach(() => {
    noter.mockClear();
  });

  /** Laisse la promesse d'attestation se dénouer */
  const laisserSeDenouer = () => new Promise(suite => setTimeout(suite, 0));

  it('consigne l\'attestation obtenue, sans jamais écrire le jeton', async () => {
    // Le jeton est un secret de courte durée : sa taille suffit à prouver qu'il
    // existe, et un journal qu'on ne peut pas coller ne sert à rien.
    installerFirebase({ jeton: () => Promise.resolve({ token: 'j'.repeat(420) }) });
    const { initFirebase } = await chargerAvec(CONFIG);
    initFirebase();
    await laisserSeDenouer();

    const trace = noter.mock.calls.find(([, message]) => message === 'attestation obtenue');
    expect(trace).toBeTruthy();
    expect(trace[2].taille).toBe(420);
    expect(JSON.stringify(noter.mock.calls)).not.toContain('jjjj');
  });

  it('consigne l\'attestation impossible, avec son motif', async () => {
    // Le cas réel : rien ne le disait, et la console comptait 0 sur 159.
    installerFirebase({ jeton: () => Promise.reject(new Error('reCAPTCHA error: timeout')) });
    const { initFirebase } = await chargerAvec(CONFIG);
    initFirebase();
    await laisserSeDenouer();

    const trace = noter.mock.calls.find(([, message]) => message === 'attestation impossible');
    expect(trace).toBeTruthy();
    expect(trace[2].motif).toContain('reCAPTCHA');
  });

  it('ne rompt pas l\'initialisation quand le SDK n\'offre pas getToken', async () => {
    installerFirebase();
    const { initFirebase } = await chargerAvec(CONFIG);

    expect(() => initFirebase()).not.toThrow();
    await laisserSeDenouer();

    const trace = noter.mock.calls.find(([categorie]) => categorie === 'appcheck');
    expect(trace, 'l\'abandon doit rester visible').toBeTruthy();
  });

  it('signale un SDK absent dans le journal, pas seulement en console', async () => {
    // La console est hors d'atteinte sur un téléphone : c'est précisément là
    // que l'attestation échoue sans que personne ne puisse le constater.
    installerFirebase({ avecAppCheck: false });
    const { initFirebase } = await chargerAvec(CONFIG);
    initFirebase();

    const trace = noter.mock.calls.find(([, message]) => message.includes('SDK non chargé'));
    expect(trace).toBeTruthy();
  });
});
