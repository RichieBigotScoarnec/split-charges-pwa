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
