// @vitest-environment jsdom
/**
 * Un repli qui fausse l'argent ne se fait pas en silence
 *
 * Deux lectures d'initialisation retombaient sur une valeur par défaut sans
 * que rien à l'écran ne le dise :
 *
 *   — `loadShareMode` : mode illisible → prorata. Un foyer en 50-50 voyait le
 *     bilan entier recalculé au prorata. Des parts et un solde parfaitement
 *     crédibles, et faux.
 *   — `initCarryOver` : réglage illisible → report désactivé, avec un `warn` en
 *     console pour tout signe — hors d'atteinte depuis un téléphone. Le solde
 *     perdait alors tous les mois accumulés.
 *
 * C'est la faute que `depuisMiroir` refuse de commettre dans `db.js` : « rendre
 * null afficherait un mois vide parfaitement crédible ». Les deux erreurs
 * remontent désormais à `runStep`, qui nomme l'étape dans « Chargement partiel »
 * et en consigne le motif au journal.
 *
 * Le repli lui-même reste appliqué : sans mode, aucun bilan ne se calcule.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbGet = vi.hoisted(() => vi.fn());

vi.mock('../../public/js/db.js', () => ({ dbGet, dbSet: vi.fn() }));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));
vi.mock('../../public/js/utils/calculations.js', () => ({
  computeBalanceChain: () => new Map()
}));

import { loadShareMode } from '../../public/js/modules/share-mode.js';
import { initCarryOver } from '../../public/js/modules/carry-over.js';
import { getState, resetState } from '../../public/js/state.js';

describe('Le mode de partage illisible ne passe pas inaperçu', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    dbGet.mockReset();
    resetState();
    document.body.innerHTML = `
      <button id="shareModeProrata"></button>
      <button id="shareMode5050"></button>
      <button id="shareModeCustom"></button>
      <div id="customPercentsSection"></div>
      <input id="customPercentYou" /><input id="customPercentPartner" />`;
  });

  it('charge le mode enregistré quand la lecture aboutit', async () => {
    dbGet.mockResolvedValue({ mode: '50-50' });

    await expect(loadShareMode()).resolves.toBeUndefined();
    expect(getState('shareMode')).toBe('50-50');
  });

  it('lève quand la lecture échoue, pour que l\'étape soit nommée', async () => {
    dbGet.mockRejectedValue(new Error('permission_denied'));

    // C'est tout le correctif : l'erreur était avalée ici, et `runStep`
    // enregistrait une étape réussie sur un bilan devenu faux.
    await expect(loadShareMode(), 'l\'échec est resté silencieux')
      .rejects.toThrow('permission_denied');
  });

  it('applique quand même le repli, pour que le bilan s\'affiche', async () => {
    dbGet.mockRejectedValue(new Error('hors ligne'));

    await loadShareMode().catch(() => {});

    // Sans mode, `computeSummary` ne rend rien : une application qui n'affiche
    // aucun chiffre est pire qu'une qui en affiche un signalé comme douteux.
    expect(getState('shareMode')).toBe('prorata');
  });
});

describe('Le report illisible ne passe pas inaperçu', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    dbGet.mockReset();
    resetState();
    document.body.innerHTML = '<input type="checkbox" id="carryOverToggle" />';
  });

  it('lit le réglage quand la lecture aboutit', async () => {
    dbGet.mockResolvedValue(true);

    await expect(initCarryOver()).resolves.toBeUndefined();
    expect(getState('carryOverEnabled')).toBe(true);
    expect(document.getElementById('carryOverToggle').checked).toBe(true);
  });

  it('lève quand la lecture échoue', async () => {
    dbGet.mockRejectedValue(new Error('hors ligne'));

    await expect(initCarryOver()).rejects.toThrow('hors ligne');
    expect(getState('carryOverEnabled')).toBe(false);
  });

  it('laisse la case utilisable même après l\'échec', async () => {
    // L'exposition sur `window` suivait la lecture : la faire lever aurait
    // rendu la case inerte — précisément quand on veut pouvoir corriger le
    // réglage à la main.
    dbGet.mockRejectedValue(new Error('hors ligne'));

    await initCarryOver().catch(() => {});

    expect(typeof window.toggleCarryOver, 'la case à cocher n\'a plus d\'action')
      .toBe('function');
  });
});
