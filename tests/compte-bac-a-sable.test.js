// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALLOWED_EMAILS, SANDBOX_ONLY_EMAILS, resolveDataRoot } from '../public/js/config.js';
import { setAuthenticatedUser, getDataPath, getDataRoot, initDatabase } from '../public/js/db.js';

/**
 * Un compte de test existe pour exercer l'application contre le vrai Firebase.
 * Son mot de passe circule, et sera changé régulièrement.
 *
 * Deux barrières le tiennent à l'écart des données du foyer. Les règles de
 * sécurité, qui font autorité et lui refusent `household`. Et ce cantonnement
 * côté application, qui évite qu'il ne s'y adresse pour rien — et surtout qui
 * ne dépend pas du paramètre `?sandbox=1` : confier la séparation des données
 * à la mémoire de celui qui ouvre l'application n'en serait pas une.
 */

describe('Le compte de test est cantonné au bac à sable', () => {
  beforeEach(() => {
    initDatabase({ ref: () => ({ once: () => Promise.resolve({ val: () => null }) }) });
  });

  afterEach(() => setAuthenticatedUser(null));

  it('la liste des comptes cantonnés n\'est pas vide et fait partie des autorisés', () => {
    // Un compte cantonné mais non autorisé ne pourrait pas se connecter du tout.
    expect(SANDBOX_ONLY_EMAILS.length).toBeGreaterThan(0);
    for (const email of SANDBOX_ONLY_EMAILS) {
      expect(ALLOWED_EMAILS, `${email} absent de la liste blanche`).toContain(email);
    }
  });

  it('aucun compte du foyer n\'est cantonné', () => {
    for (const email of ['bigot.richard@gmail.com', 'cindypepe.cp95@gmail.com']) {
      expect(SANDBOX_ONLY_EMAILS).not.toContain(email);
    }
  });

  it.each(SANDBOX_ONLY_EMAILS)('%s écrit dans sandbox, sans paramètre d\'URL', (email) => {
    setAuthenticatedUser('uid-test', email);

    expect(getDataRoot()).toBe('sandbox');
    expect(getDataPath('periods/2026-08/salaries')).toBe('sandbox/periods/2026-08/salaries');
    expect(getDataPath()).toBe('sandbox');
  });

  it('un compte du foyer conserve l\'espace du foyer', () => {
    setAuthenticatedUser('uid-richard', 'bigot.richard@gmail.com');

    expect(getDataRoot()).toBe('household');
    expect(getDataPath('salaries')).toBe('household/salaries');
  });

  it('aucun chemin du compte de test ne touche household', () => {
    setAuthenticatedUser('uid-test', SANDBOX_ONLY_EMAILS[0]);

    for (const chemin of ['salaries', 'periods', 'customCategories', 'carryOverEnabled', undefined]) {
      expect(getDataPath(chemin)).not.toContain('household');
    }
  });

  it('la déconnexion remet la racine par défaut', () => {
    setAuthenticatedUser('uid-test', SANDBOX_ONLY_EMAILS[0]);
    expect(getDataRoot()).toBe('sandbox');

    setAuthenticatedUser(null);
    expect(getDataRoot()).toBe('household');
  });

  it('resolveDataRoot est indifférente aux entrées inattendues', () => {
    expect(resolveDataRoot(null)).toBe('household');
    expect(resolveDataRoot(undefined)).toBe('household');
    expect(resolveDataRoot('')).toBe('household');
    expect(resolveDataRoot('inconnu@example.com')).toBe('household');
  });
});

describe('Les règles déployées couvrent le compte de test', () => {
  const regles = JSON.parse(
    readFileSync(resolve(process.cwd(), 'database.rules.json'), 'utf8')
  ).rules;

  it('household reste fermé au compte de test', () => {
    // La barrière qui fait autorité. Le cantonnement applicatif ne remplace
    // pas les règles : il évite seulement des requêtes vouées au refus.
    for (const email of SANDBOX_ONLY_EMAILS) {
      expect(regles.household['.read']).not.toContain(email);
      expect(regles.household['.write']).not.toContain(email);
    }
  });

  it('sandbox est ouvert au compte de test', () => {
    for (const email of SANDBOX_ONLY_EMAILS) {
      expect(regles.sandbox['.read']).toContain(email);
      expect(regles.sandbox['.write']).toContain(email);
    }
  });

  it('la racine reste refusée par défaut', () => {
    expect(regles['.read']).toBe(false);
    expect(regles['.write']).toBe(false);
  });

  /**
   * Ce que la règle FAIT, et non ce qu'elle CONTIENT
   *
   * Les clauses d'accès sont des expressions JavaScript pures : le moteur les
   * évalue contre `auth`. Les évaluer ici avec un jeton fabriqué mesure donc
   * l'EFFET, là où un `toContain('email_verified')` ne mesure que la forme —
   * et la forme survit à tout déplacement de la garde dans l'expression.
   *
   * Le témoin qui fait autorité reste `tests/e2e/regles-donnees.spec.js`,
   * rejoué contre le moteur réel. Celui-ci le double sans émulateur.
   *
   * @param {string} expression - Clause `.read` ou `.write`
   * @param {{email: string, email_verified: boolean}} token
   * @returns {boolean}
   */
  const accorde = (expression, token) =>
    // eslint-disable-next-line no-new-func -- l'expression EST du JavaScript ;
    // la réécrire en JS l'aurait fait diverger de ce qui est déployé.
    new Function('auth', 'newData', `return (${expression});`)(
      { uid: 'u1', token }, { exists: () => true }
    ) === true;

  const VERIFIE = (email) => ({ email, email_verified: true });
  const NON_VERIFIE = (email) => ({ email, email_verified: false });

  it('le foyer exige une adresse vérifiée', () => {
    // L'adresse seule décidait de l'accès, alors que `accounts:signUp` reste
    // joignable avec la clé publique du projet : un compte créé par cette API
    // et revendiquant une adresse de la liste blanche entrait dans le foyer.
    for (const droit of ['.read', '.write']) {
      expect(accorde(regles.household[droit], VERIFIE(ALLOWED_EMAILS[0]))).toBe(true);
      expect(accorde(regles.household[droit], NON_VERIFIE(ALLOWED_EMAILS[0]))).toBe(false);
    }
  });

  it('le bac à sable l\'exige AUSSI des comptes du foyer', () => {
    // AUDIT-010. Le bac à sable avait été écrit comme une copie assouplie du
    // foyer : les deux adresses du foyer y entraient sans avoir prouvé la
    // boîte aux lettres. Ce n'est pas l'espace des finances réelles, mais
    // c'est une écriture arbitraire dans la base du projet de production,
    // sous une identité que les règles tiennent pour légitime.
    for (const droit of ['.read', '.write']) {
      for (const email of ALLOWED_EMAILS.filter(e => !SANDBOX_ONLY_EMAILS.includes(e))) {
        expect(accorde(regles.sandbox[droit], VERIFIE(email)), `${email} vérifié`).toBe(true);
        expect(accorde(regles.sandbox[droit], NON_VERIFIE(email)), `${email} non vérifié`).toBe(false);
      }
    }
  });

  it('le compte de test, lui, entre au bac à sable sans adresse vérifiée', () => {
    // Le témoin qui interdit la sur-correction. Le compte de test
    // s'authentifie par mot de passe et n'a pas d'adresse à prouver : lui
    // imposer la même condition qu'au foyer fermerait le bac à sable, dont
    // c'est le seul usage — et avec lui les 17 contrôles de bout en bout qui
    // s'y déroulent. Aligner les deux espaces sans distinguer les comptes
    // aurait donc échangé une exposition contre une panne.
    for (const droit of ['.read', '.write']) {
      for (const email of SANDBOX_ONLY_EMAILS) {
        expect(accorde(regles.sandbox[droit], NON_VERIFIE(email)), `${email} au bac à sable`).toBe(true);
        expect(accorde(regles.household[droit], NON_VERIFIE(email)), `${email} au foyer`).toBe(false);
      }
    }
  });

  it('la liste blanche décide toujours, dans les deux espaces', () => {
    // Le témoin négatif des trois précédents : ce n'est pas la vérification
    // qui ouvre, c'est l'adresse. Une adresse inconnue reste dehors, vérifiée
    // ou non.
    for (const espace of ['household', 'sandbox']) {
      for (const droit of ['.read', '.write']) {
        expect(accorde(regles[espace][droit], VERIFIE('inconnu@example.com'))).toBe(false);
        expect(accorde(regles[espace][droit], NON_VERIFIE('inconnu@example.com'))).toBe(false);
      }
    }
  });

  it('les deux espaces portent exactement le même schéma', () => {
    // Le schéma de validation est écrit deux fois : les règles Realtime
    // Database n'ont aucun mécanisme de réutilisation, et scinder l'accès des
    // deux espaces derrière un joker rendrait la liste blanche — la partie qui
    // compte — nettement moins lisible. La duplication est donc assumée, mais
    // elle dérive dès qu'on l'oublie : un bac à sable plus permissif que le
    // foyer n'éprouverait plus rien de ce que le foyer subira.
    const schema = (espace) => {
      const copie = { ...regles[espace] };
      delete copie['.read'];
      delete copie['.write'];
      return copie;
    };

    expect(schema('sandbox')).toEqual(schema('household'));
  });

  it('chaque espace borne ce qu\'il accepte', () => {
    // Sans .validate, un jeton dérobé écrivait n'importe quelle structure de
    // n'importe quelle taille sous l'espace du foyer.
    for (const espace of ['household', 'sandbox']) {
      expect(regles[espace].periods.$periode.variableCharges.$id.description['.validate'])
        .toMatch(/length <= \d+/);
      expect(regles[espace].periods.$periode.variableCharges.$id.amount['.validate'])
        .toMatch(/isNumber\(\)/);
      // Tout nœud non déclaré est refusé : rien ne se plante à côté du schéma.
      expect(regles[espace].$autre['.validate']).toBe(false);
    }
  });

  it('tout compte autorisé figure dans au moins une règle', () => {
    // Un compte dans ALLOWED_EMAILS mais absent des règles se connecterait
    // pour ne rien pouvoir lire — panne silencieuse difficile à diagnostiquer.
    for (const email of ALLOWED_EMAILS) {
      const cite = regles.household['.read'].includes(email) || regles.sandbox['.read'].includes(email);
      expect(cite, `${email} n'apparaît dans aucune règle`).toBe(true);
    }
  });
});

describe('Le repère du bac à sable', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="sandboxBanner" hidden></div>';
    document.title = 'FairSplit';
  });

  it('révèle la bannière et préfixe le titre', async () => {
    const { showSandboxBanner } = await import('../public/js/utils/sandbox-banner.js');
    showSandboxBanner();

    expect(document.getElementById('sandboxBanner').hidden).toBe(false);
    expect(document.title).toBe('[Bac à sable] FairSplit');
  });

  it('ne préfixe le titre qu\'une fois, malgré deux appels', async () => {
    // Il est posé au démarrage puis après connexion : sans garde, le titre
    // porterait deux fois la mention.
    const { showSandboxBanner } = await import('../public/js/utils/sandbox-banner.js');
    showSandboxBanner();
    showSandboxBanner();

    expect(document.title).toBe('[Bac à sable] FairSplit');
  });
});
