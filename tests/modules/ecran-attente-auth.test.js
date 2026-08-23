// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * L'écran de connexion a trois états, non deux.
 *
 * Il n'en avait que deux : visible ou masqué. Comme le HTML l'affiche par
 * défaut et que seul le JavaScript le retire, chaque chargement montrait le
 * formulaire de connexion — le temps que le SDK Firebase se charge depuis son
 * CDN, s'initialise et relise la session enregistrée. À chaque « tirer pour
 * actualiser » sur mobile, on croyait donc avoir été déconnecté une seconde.
 *
 * Rien n'était exposé pour autant : `#mainApp` reste masqué et aucune donnée
 * n'est demandée avant authentification. C'est une question de confiance, pas
 * de secret — mais dans une application de comptes, elle compte.
 *
 * Le troisième état est l'attente : logo et nom seuls, jusqu'à ce que Firebase
 * dise qui est là.
 */

const html = readFileSync(resolve(process.cwd(), 'public/FairSplit.html'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'public/css/auth.css'), 'utf8');

vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

// Un Firebase qui ne rappelle jamais : c'est exactement la panne que le
// garde-fou doit couvrir.
const authMuet = { onAuthStateChanged: vi.fn(() => vi.fn()) };
vi.mock('../../public/js/firebase-init.js', () => ({
  getFirebaseAuth: () => authMuet,
  getGoogleAuthProvider: vi.fn()
}));

const { revelerFormulaireConnexion } = await import('../../public/js/modules/auth.js');

/** Le fragment de l'écran de connexion, tel qu'il est livré */
function poserEcranDeConnexion() {
  const debut = html.indexOf('<div id="authOverlay"');
  const fin = html.indexOf('<main', debut);
  document.body.innerHTML = html.slice(debut, fin);
}

beforeEach(() => {
  poserEcranDeConnexion();
});

describe('L\'écran de connexion part en attente', () => {
  it('le balisage livré porte l\'état d\'attente', () => {
    // C'est le HTML qui doit le porter, pas le JavaScript : entre le premier
    // pixel affiché et l'exécution du premier module, il n'y a que lui.
    expect(document.getElementById('authOverlay').className)
      .toContain('auth-overlay--attente');
  });

  it('montre le logo et le nom', () => {
    expect(document.querySelector('.auth-logo')).not.toBeNull();
    expect(document.querySelector('.auth-title').textContent).toBe('FairSplit');
  });

  it('la feuille de style masque les commandes pendant l\'attente', () => {
    // jsdom n'applique pas les feuilles externes : la règle est lue à la
    // source. Sans elle, le balisage seul laisserait tout visible.
    const regle = css.slice(css.indexOf('.auth-overlay--attente'));
    const bloc = regle.slice(0, regle.indexOf('}'));

    expect(bloc).toContain('.btn-google-signin');
    expect(bloc).toContain('#authForm');
    expect(regle.slice(0, regle.indexOf('}') + 1)).toContain('display: none');
  });

  it('le message d\'attente disparaît une fois l\'écran révélé', () => {
    // Sinon « Connexion… » resterait au-dessus du formulaire.
    expect(css).toContain('.auth-overlay:not(.auth-overlay--attente) .auth-attente');
  });
});

describe('Révéler le formulaire', () => {
  it('retire l\'état d\'attente', () => {
    revelerFormulaireConnexion();

    expect(document.getElementById('authOverlay').className)
      .not.toContain('auth-overlay--attente');
  });

  it('ne retire pas les autres classes de l\'écran', () => {
    revelerFormulaireConnexion();

    expect(document.getElementById('authOverlay').className)
      .toContain('auth-overlay');
  });

  it('appelée deux fois, reste sans effet la seconde', () => {
    revelerFormulaireConnexion();
    revelerFormulaireConnexion();

    expect(document.getElementById('authOverlay').className)
      .not.toContain('auth-overlay--attente');
  });

  it('ne lève pas quand l\'écran est absent du document', () => {
    // Le garde-fou de `initAuth` se déclenche sur minuterie : rien ne garantit
    // que la page n'a pas changé entre-temps.
    document.body.innerHTML = '';

    expect(() => revelerFormulaireConnexion()).not.toThrow();
  });
});

describe('Le garde-fou de délai', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('signale une attente longue sans ouvrir le formulaire', async () => {
    // Ce test affirmait l'inverse, et décrivait le défaut signalé à l'usage :
    // sur téléphone, la restauration de session dépasse régulièrement six
    // secondes. Le formulaire s'ouvrait donc alors que la session était valide,
    // et l'application s'ouvrait seule un instant plus tard — on croyait avoir
    // été déconnecté à chaque actualisation.
    const { initAuth } = await import('../../public/js/modules/auth.js');

    poserEcranDeConnexion();
    initAuth();

    vi.advanceTimersByTime(6000);

    const ecran = document.getElementById('authOverlay');
    expect(ecran.className, 'l\'écran ne doit pas prétendre à une déconnexion')
      .toContain('auth-overlay--attente');
    expect(ecran.className).toContain('auth-overlay--lent');
  });

  it('laisse une issue : le formulaire s\'ouvre à la demande', async () => {
    // L'attente prolongée doit rester une issue offerte, pas un écran mort.
    const { initAuth } = await import('../../public/js/modules/auth.js');

    poserEcranDeConnexion();
    initAuth();
    vi.advanceTimersByTime(6000);

    document.getElementById('authForcerFormulaire').click();

    expect(document.getElementById('authOverlay').className)
      .not.toContain('auth-overlay--attente');
  });

  it('ne signale rien si Firebase répond avant le délai', async () => {
    const { initAuth } = await import('../../public/js/modules/auth.js');

    poserEcranDeConnexion();
    initAuth();

    // Firebase répond : le minuteur est annulé.
    authMuet.onAuthStateChanged.mock.calls.at(-1)[0](null);
    vi.advanceTimersByTime(20000);

    expect(document.getElementById('authOverlay').className)
      .not.toContain('auth-overlay--lent');
  });
});
