// @vitest-environment jsdom
/**
 * Bandeau « base injoignable ».
 *
 * Un bouclier de navigateur bloquait l'accès à la base. Le plus grave n'était
 * pas le blocage : c'était le silence. Firebase résout ses lectures depuis un
 * cache local vide et met ses écritures en file d'attente — l'écran affichait
 * un mois vide parfaitement crédible et avalait les saisies sans un mot.
 *
 * Le bandeau est la seule chose qui distingue « ce mois est vide » de « je ne
 * peux pas lire ce mois ».
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Bandeau de liaison', () => {
  let refreshConnectionBanner;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = '<div id="offlineBanner" hidden></div>';
    ({ refreshConnectionBanner } = await import('../../public/js/utils/connection-banner.js'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** @returns {boolean} Le bandeau est-il affiché ? */
  const affiche = () => !document.getElementById('offlineBanner').hidden;

  it('ne clignote pas pendant que la liaison s\'établit', () => {
    // Firebase annonce « déconnecté » le temps d'ouvrir sa liaison. Réagir
    // aussitôt ferait apparaître une alarme rouge à chaque ouverture.
    refreshConnectionBanner(false);
    vi.advanceTimersByTime(3000);
    expect(affiche(), 'le bandeau est apparu trop tôt').toBe(false);

    refreshConnectionBanner(true);
    vi.advanceTimersByTime(30000);
    expect(affiche(), 'le bandeau est apparu après reconnexion').toBe(false);
  });

  it('apparaît quand la coupure dure', () => {
    refreshConnectionBanner(false);
    vi.advanceTimersByTime(9000);
    expect(affiche()).toBe(true);
  });

  it('disparaît dès que la base redevient joignable', () => {
    refreshConnectionBanner(false);
    vi.advanceTimersByTime(9000);
    expect(affiche()).toBe(true);

    refreshConnectionBanner(true);
    expect(affiche(), 'le bandeau est resté après reconnexion').toBe(false);
  });

  it('ne programme pas plusieurs affichages pour une même coupure', () => {
    // Firebase peut répéter l'état : chaque répétition ne doit pas décaler ni
    // multiplier la minuterie.
    for (let i = 0; i < 5; i++) refreshConnectionBanner(false);
    vi.advanceTimersByTime(9000);
    expect(affiche()).toBe(true);

    refreshConnectionBanner(true);
    vi.advanceTimersByTime(30000);
    expect(affiche(), 'une minuterie oubliée a rallumé le bandeau').toBe(false);
  });

  it('consigne chaque bascule dans le journal, sans la répéter', async () => {
    const { rapport } = await import('../../public/js/utils/diagnostics.js');

    refreshConnectionBanner(false);
    refreshConnectionBanner(false);
    refreshConnectionBanner(true);

    const lignes = rapport().split('\n').filter(l => l.includes('[liaison]'));
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toContain('base injoignable');
    expect(lignes[1]).toContain('base joignable');
  });

  it('ne casse pas si le bandeau est absent du balisage', () => {
    document.body.innerHTML = '';
    expect(() => {
      refreshConnectionBanner(false);
      vi.advanceTimersByTime(9000);
    }).not.toThrow();
  });
});
