// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const noter = vi.fn();
vi.mock('../public/js/utils/diagnostics.js', () => ({
  noter: (...arguments_) => noter(...arguments_),
  exigerElement: (id) => document.getElementById(id),
  initDiagnostics: vi.fn(),
  rapport: vi.fn(() => '')
}));

const { refreshConnectionBanner, majSaisiesEnAttente, initConnectionBanner } =
  await import('../public/js/utils/connection-banner.js');

/**
 * Ce que le bandeau annonce pendant la coupure
 *
 * Il a longtemps dit « vos saisies ne sont pas enregistrées ». C'était vrai, et
 * c'est devenu faux le jour où elles ont été gardées sur l'appareil : elles
 * partent maintenant à la reconnexion. Un bandeau qui annonce une perte qui
 * n'a pas lieu apprend à ne plus lire les bandeaux.
 *
 * Le balisage est celui de la page réellement livrée, extrait de
 * `FairSplit.html`. Un banc d'essai qui poserait le sien ne dirait rien du cas
 * qui casse pour de bon : le module écrit dans un identifiant que la page ne
 * porte plus.
 */

/** Le bandeau tel que la page le livre */
function bandeauLivre() {
  const page = readFileSync(resolve(process.cwd(), 'public/FairSplit.html'), 'utf8');
  const debut = page.indexOf('<div id="offlineBanner"');
  expect(debut, 'bandeau hors ligne introuvable dans FairSplit.html').toBeGreaterThan(-1);

  const fin = page.indexOf('</div>', debut);
  return page.slice(debut, fin + '</div>'.length);
}

beforeEach(() => {
  document.body.innerHTML = bandeauLivre();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Le texte du bandeau, espaces normalisés */
function texte() {
  return document.getElementById('offlineBanner').textContent.replace(/\s+/g, ' ').trim();
}

describe('La page livre bien ce que le module écrit', () => {
  it('porte l\'emplacement du compte des saisies', () => {
    // C'est le point de rupture silencieuse : le module écrit dans un
    // identifiant, la page le perd au fil d'une refonte, et le bandeau annonce
    // pour toujours le texte d'origine sans que rien ne le signale.
    expect(document.getElementById('offlineBannerAttente')).not.toBeNull();
  });

  it('n\'annonce plus une perte qui n\'a pas lieu', () => {
    expect(texte()).not.toContain('ne sont pas enregistrées');
    expect(texte()).toContain('conservées sur cet appareil');
  });

  it('nomme toujours le bouclier de navigateur', () => {
    // Deux pannes signalées en production venaient de là, et personne ne fera
    // spontanément le lien entre « mes salaires ne partent pas » et « mon
    // navigateur protège ma vie privée ».
    expect(texte()).toMatch(/bloqueur de contenu/i);
  });

  it('reste masqué tant que rien ne l\'a affiché', () => {
    expect(document.getElementById('offlineBanner').hidden).toBe(true);
  });
});

describe('Le compte des saisies en attente', () => {
  it('reste général quand rien n\'attend', () => {
    majSaisiesEnAttente(0);
    expect(texte()).toContain('vos saisies sont conservées sur cet appareil et partiront');
  });

  it('s\'accorde au singulier, verbe de fin compris', () => {
    // Signalé à l'usage, capture à l'appui : « 1 saisie est conservée sur cet
    // appareil et partiront ». La phrase était coupée en deux entre le balisage
    // et le module, et la fin restait au pluriel. Une phrase à cheval sur deux
    // fichiers finit toujours par se désaccorder.
    majSaisiesEnAttente(1);
    expect(texte()).toContain('1 saisie est conservée sur cet appareil et partira');
    expect(texte(), 'la fin de phrase doit s\'accorder elle aussi')
      .not.toMatch(/1 saisie est conservée[^.]*partiront/);
  });

  it('s\'accorde au pluriel', () => {
    majSaisiesEnAttente(3);
    expect(texte()).toContain('3 saisies sont conservées sur cet appareil et partiront');
  });

  it('accorde le verbe de fin à chaque nombre, sans exception', () => {
    // Le contrôle de fond : tout ce qui s'accorde avec le nombre doit être
    // écrit par le module, verbe de fin compris. Compter les verbes ne suffit
    // pas — il y en a un dans les deux cas, y compris quand il est faux. C'est
    // l'accord qu'il faut lire.
    const attendu = { 0: 'partiront', 1: 'partira', 2: 'partiront', 17: 'partiront' };

    for (const [nombre, verbe] of Object.entries(attendu)) {
      majSaisiesEnAttente(Number(nombre));
      const dit = texte();

      expect(dit, `« ${verbe} » attendu pour ${nombre}`).toContain(`${verbe} dès que`);

      const faux = verbe === 'partira' ? 'partiront' : 'partira ';
      expect(dit, `« ${faux.trim()} » ne doit pas apparaître pour ${nombre}`).not.toContain(faux);
    }
  });

  it('ne se laisse pas écrire n\'importe quoi', () => {
    majSaisiesEnAttente(NaN);
    expect(texte()).toContain('vos saisies sont conservées');

    majSaisiesEnAttente(-4);
    expect(texte()).toContain('vos saisies sont conservées');
  });

  it('se met à jour alors que le bandeau est déjà affiché', () => {
    // Aucun événement de connexion ne survient pendant la coupure : sans cette
    // mise à jour, le bandeau dirait « 1 saisie » alors qu'il y en a trois.
    refreshConnectionBanner(false, 1);
    vi.advanceTimersByTime(9000);
    expect(document.getElementById('offlineBanner').hidden).toBe(false);

    majSaisiesEnAttente(3);
    expect(texte()).toContain('3 saisies sont conservées');
    expect(document.getElementById('offlineBanner').hidden, 'le bandeau ne doit pas se refermer')
      .toBe(false);
  });
});

describe('L\'affichage du bandeau', () => {
  it('ne paraît pas pour la reconnexion ordinaire', () => {
    // Firebase annonce « déconnecté » le temps d'établir sa liaison, à chaque
    // ouverture. Un bandeau qui clignote à chaque ouverture ne se lit plus.
    refreshConnectionBanner(false, 0);
    vi.advanceTimersByTime(3000);
    refreshConnectionBanner(true, 0);
    vi.advanceTimersByTime(20000);

    expect(document.getElementById('offlineBanner').hidden).toBe(true);
  });

  it('paraît quand la coupure dure, avec son compte', () => {
    refreshConnectionBanner(false, 2);
    vi.advanceTimersByTime(9000);

    expect(document.getElementById('offlineBanner').hidden).toBe(false);
    expect(texte()).toContain('2 saisies sont conservées sur cet appareil');
  });

  it('disparaît au retour de la liaison', () => {
    refreshConnectionBanner(false, 2);
    vi.advanceTimersByTime(9000);
    refreshConnectionBanner(true, 0);

    expect(document.getElementById('offlineBanner').hidden).toBe(true);
  });
});

describe('Le sondage de la base, quand la liaison ne revient pas', () => {
  /**
   * Realtime Database parle d'abord par WebSocket. Quand `.info/connected`
   * reste faux, deux causes sans rapport se ressemblent : l'hôte est hors
   * d'atteinte, ou il répond très bien en HTTPS et seul le WebSocket est
   * bloqué — ce que font couramment un pare-feu ou un opérateur mobile.
   *
   * Le sondage les départage, et l'écrit dans le journal. Sans lui, on en est
   * réduit à des hypothèses sur un téléphone qu'on n'a pas sous la main.
   */

  beforeEach(() => {
    noter.mockClear();
  });

  it('ne sonde rien tant que la liaison tient', async () => {
    globalThis.fetch = vi.fn();

    refreshConnectionBanner(true, 0);
    await vi.advanceTimersByTimeAsync(20000);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sonde quand le bandeau s\'affiche, et note que l\'hôte répond', async () => {
    // Un 401 est une bonne nouvelle : la requête n'est pas authentifiée, elle
    // doit être refusée — et ce refus prouve que l'hôte est joignable.
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 401 }));

    refreshConnectionBanner(false, 1);
    await vi.advanceTimersByTimeAsync(9000);

    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('firebasedatabase.app');
    expect(url, 'shallow : la requête ne peut rien rapporter').toContain('shallow=true');
    expect(options.cache, 'une réponse en cache ne dirait rien de l\'instant').toBe('no-store');

    const sondage = noter.mock.calls.find(([, message]) => message.includes('la base répond'));
    expect(sondage, 'le sondage doit être journalisé').toBeTruthy();
    expect(sondage[2].statut).toBe(401);
  });

  it('note l\'absence de réponse, qui ne se confond pas avec un refus', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));

    refreshConnectionBanner(false, 1);
    await vi.advanceTimersByTimeAsync(9000);

    const sondage = noter.mock.calls.find(([, message]) => message.includes('aucune réponse'));
    expect(sondage).toBeTruthy();
    expect(sondage[2].motif).toContain('Failed to fetch');
  });

  it('abandonne un sondage qui traîne, plutôt que d\'attendre sans fin', async () => {
    // C'est exactement le travers que tout ce fichier combat : une opération
    // réseau qui ne rend jamais la main n'apprend rien à personne.
    globalThis.fetch = vi.fn((_, options) => new Promise((_resolve, rejeter) => {
      options.signal.addEventListener('abort', () => {
        const echec = new Error('abandon');
        echec.name = 'AbortError';
        rejeter(echec);
      });
    }));

    refreshConnectionBanner(false, 1);
    await vi.advanceTimersByTimeAsync(9000 + 9000);

    const sondage = noter.mock.calls.find(([, message]) => message.includes('aucune réponse'));
    expect(sondage).toBeTruthy();
    expect(sondage[2].motif).toContain('abandon après 8 s');
  });
});

describe('Les deux issues du bandeau', () => {
  /**
   * Le mode hors ligne se soigne tout seul, mais ses délais s'espacent jusqu'à
   * cinq minutes. Quelqu'un qui vient de rétablir son réseau n'a aucune raison
   * d'attendre — et quelqu'un dont la session a expiré n'en sortira jamais sans
   * se reconnecter, ce qui fut exactement le cas signalé.
   */

  it('la page porte les deux boutons, et « Se reconnecter » passe par la délégation', () => {
    // `data-action` est le mécanisme que `init.js` sait router : un bouton
    // câblé autrement resterait muet, comme l'a été celui des destinations.
    expect(document.getElementById('offlineBannerReessayer')).not.toBeNull();

    const reconnexion = document.querySelector('.offline-banner [data-action="signOut"]');
    expect(reconnexion, '« Se reconnecter » doit exister').not.toBeNull();
    expect(reconnexion.textContent).toContain('Se reconnecter');
  });

  it('dit franchement que les saisies ne vivent que là', () => {
    // L'avertissement manquait, et une saisie a été perdue par un effacement
    // des données du site.
    expect(texte()).toContain('ne vivent que sur cet appareil');
    expect(texte()).toMatch(/effacer les données du site/i);
  });

  it('« Réessayer » redemande la liaison et le montre', async () => {
    let demandes = 0;
    initConnectionBanner(async () => { demandes += 1; return false; });

    const bouton = document.getElementById('offlineBannerReessayer');
    bouton.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(demandes).toBe(1);
    expect(bouton.textContent, 'un bouton muet est indiscernable d\'un bouton mort')
      .toBe('Toujours rien');
    expect(bouton.disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(3000);
    expect(bouton.disabled, 'il doit redevenir utilisable').toBe(false);
    expect(bouton.textContent).toBe('Réessayer');
  });

  it('ne se remet pas à « Toujours rien » quand la liaison revient', async () => {
    initConnectionBanner(async () => true);

    const bouton = document.getElementById('offlineBannerReessayer');
    bouton.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(bouton.textContent).not.toBe('Toujours rien');
  });

  it('ne se rompt pas si la reprise lève', async () => {
    initConnectionBanner(async () => { throw new Error('réseau'); });

    const bouton = document.getElementById('offlineBannerReessayer');
    expect(() => bouton.click()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(bouton.textContent).toBe('Toujours rien');
  });

  it('revenir sur l\'application redemande la liaison', async () => {
    // Le réseau a pu redevenir joignable pendant que l'écran était éteint.
    let demandes = 0;
    initConnectionBanner(async () => { demandes += 1; return false; });

    refreshConnectionBanner(false, 1);
    await vi.advanceTimersByTimeAsync(9000);

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(demandes).toBe(1);
  });
});
