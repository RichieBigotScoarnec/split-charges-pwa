// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted() garantit que les variables sont disponibles quand vi.mock() les utilise
//
// Le module lit désormais par `dbGet` et non plus par un appel direct au SDK :
// il obtient ainsi le miroir hors ligne, la file d'attente et surtout le délai
// de garde, dont cette lecture était la seule du dépôt à être privée. Le double
// suit ce joint-là.
const { mockDbGet } = vi.hoisted(() => ({ mockDbGet: vi.fn() }));

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/db.js', () => ({
  dbGet: mockDbGet,
  getDataPath: vi.fn(path => `household/${path}`)
}));

import { setState, resetState } from '../../public/js/state.js';
import { initTrends, fetchHistoricalData } from '../../public/js/modules/trends.js';
import { toast } from '../../public/js/components/toast.js';

const mockPeriods = {
  '2026-01': {
    fixedCharges: {
      'f1': { amount: 1000, deleted: false },
      'f2': { amount: 500, deleted: true }   // exclu
    },
    variableCharges: {
      'v1': { amount: 200, deleted: false },
      'v2': { amount: 100, deleted: false }
    },
    salaries: { vous: 3000, conjointe: 2000 }
  },
  '2026-02': {
    fixedCharges: {
      'f3': { amount: 1000, deleted: false }
    },
    variableCharges: {
      'v3': { amount: 300, deleted: false }
    },
    salaries: { vous: 3000, conjointe: 2000 }
  },
  '2026-03': {
    fixedCharges: {},
    variableCharges: {
      'v4': { amount: 150, deleted: false }
    },
    salaries: { vous: 3500, conjointe: 2500 }
  }
};

function setupDefaultMockRef() {
  mockDbGet.mockResolvedValue(mockPeriods);
}

beforeEach(() => {
  resetState();
  vi.clearAllMocks();
  // Rétablir l'implémentation du ref après clearAllMocks
  setupDefaultMockRef();
  // Initialiser le module (expose window.toggleTrends)
  document.body.innerHTML = '<button id="generateTrendsBtn"></button>';
  initTrends();
});

// ===== Garde-fous =====
describe('fetchHistoricalData — garde-fous', () => {
  it('sans utilisateur connecté → retourne null', async () => {
    const result = await fetchHistoricalData();
    expect(result).toBeNull();
  });

  it('sans utilisateur → toast.error appelé', async () => {
    await fetchHistoricalData();
    expect(toast.error).toHaveBeenCalled();
  });
});

// ===== Calculs (utilisateur connecté) =====
describe('fetchHistoricalData — calcul des totaux', () => {
  beforeEach(() => {
    setState('currentUser', { uid: 'test-uid', email: 'test@test.com' });
  });

  it('retourne un objet avec periods et data', async () => {
    const result = await fetchHistoricalData();
    expect(result).toHaveProperty('periods');
    expect(result).toHaveProperty('data');
  });

  it('exclut les charges deleted=true du total fixedCharges', async () => {
    // 2026-01 : f1=1000 (actif) + f2=500 (deleted) → 1000 seulement
    const result = await fetchHistoricalData();
    expect(result.data['2026-01'].fixedCharges).toBe(1000);
  });

  it('somme correctement les charges variables non supprimées', async () => {
    // 2026-01 : v1=200 + v2=100 = 300
    const result = await fetchHistoricalData();
    expect(result.data['2026-01'].variableCharges).toBe(300);
  });

  it('total = fixedCharges + variableCharges', async () => {
    const result = await fetchHistoricalData();
    const p = result.data['2026-01'];
    expect(p.total).toBe(p.fixedCharges + p.variableCharges);
  });

  it('total 2026-01 = 1000 + 300 = 1300', async () => {
    const result = await fetchHistoricalData();
    expect(result.data['2026-01'].total).toBe(1300);
  });

  it('total 2026-02 = 1000 + 300 = 1300', async () => {
    const result = await fetchHistoricalData();
    expect(result.data['2026-02'].total).toBe(1300);
  });

  it('total 2026-03 = 0 + 150 = 150', async () => {
    const result = await fetchHistoricalData();
    expect(result.data['2026-03'].total).toBe(150);
  });

  it('retourne les salaires de chaque période', async () => {
    const result = await fetchHistoricalData();
    expect(result.data['2026-01'].salaries).toEqual({ vous: 3000, conjointe: 2000 });
    expect(result.data['2026-03'].salaries).toEqual({ vous: 3500, conjointe: 2500 });
  });
});

// ===== Tri et limite des périodes =====
describe('fetchHistoricalData — périodes retournées', () => {
  beforeEach(() => {
    setState('currentUser', { uid: 'test-uid', email: 'test@test.com' });
  });

  it('retourne les périodes en ordre chronologique croissant', async () => {
    const result = await fetchHistoricalData();
    const periods = result.periods;
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i] >= periods[i - 1]).toBe(true);
    }
  });

  it('months=1 → une seule période (la plus récente)', async () => {
    const result = await fetchHistoricalData(1);
    expect(result.periods).toHaveLength(1);
  });

  it('months=1 → retourne la période la plus récente (2026-03)', async () => {
    const result = await fetchHistoricalData(1);
    expect(result.periods[0]).toBe('2026-03');
  });

  it('months=2 → deux périodes maximum', async () => {
    const result = await fetchHistoricalData(2);
    expect(result.periods.length).toBeLessThanOrEqual(2);
  });

  it('months supérieur au nombre disponible → toutes les périodes (3)', async () => {
    const result = await fetchHistoricalData(12);
    expect(result.periods).toHaveLength(3);
  });
});

// ===== Cas Firebase vide ou absent =====
describe('fetchHistoricalData — données Firebase absentes', () => {
  beforeEach(() => {
    setState('currentUser', { uid: 'test-uid', email: 'test@test.com' });
  });

  it('un historique absent → { periods: [], data: {} }', async () => {
    mockDbGet.mockResolvedValue(null);
    const result = await fetchHistoricalData();
    expect(result).toEqual({ periods: [], data: {} });
  });

  it('période sans charges → total = 0', async () => {
    mockDbGet.mockResolvedValue({
      '2026-04': {
        fixedCharges: null,
        variableCharges: null,
        salaries: { vous: 0, conjointe: 0 }
      }
    });
    const result = await fetchHistoricalData();
    expect(result.data['2026-04'].total).toBe(0);
    expect(result.data['2026-04'].fixedCharges).toBe(0);
    expect(result.data['2026-04'].variableCharges).toBe(0);
  });

  it('période avec uniquement des charges supprimées → total = 0', async () => {
    mockDbGet.mockResolvedValue({
      '2026-05': {
        fixedCharges: {
          'f1': { amount: 500, deleted: true },
          'f2': { amount: 300, deleted: true }
        },
        variableCharges: {
          'v1': { amount: 100, deleted: true }
        },
        salaries: { vous: 2000, conjointe: 1500 }
      }
    });
    const result = await fetchHistoricalData();
    expect(result.data['2026-05'].total).toBe(0);
  });
});
