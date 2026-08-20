// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/db.js', () => ({
  dbSet: vi.fn(() => Promise.resolve()),
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbPush: vi.fn(() => Promise.resolve('mock-key')),
  dbUpdate: vi.fn(() => Promise.resolve()),
  getDataPath: vi.fn(path => `household/${path}`)
}));
vi.mock('../../public/js/modules/summary.js', () => ({
  calculateSummary: vi.fn()
}));

import { getState, setState, resetState } from '../../public/js/state.js';
import { selectShareMode, validateCustomPercents } from '../../public/js/modules/share-mode.js';

function setupDOM() {
  document.body.innerHTML = `
    <button class="share-mode-option" id="modeProrata">Prorata</button>
    <button class="share-mode-option" id="mode5050">50-50</button>
    <button class="share-mode-option" id="modeCustom">Personnalisé</button>
    <div id="customPercentages"></div>
    <input id="customPercentYou" type="number" value="50" />
    <input id="customPercentPartner" type="number" value="50" />
    <div id="shareModeValidation"></div>
  `;
}

beforeEach(() => {
  resetState();
  setupDOM();
  vi.clearAllMocks();
});

// ===== selectShareMode — état =====
describe('selectShareMode — mise à jour du state', () => {
  it('sélectionne prorata → shareMode = prorata', () => {
    selectShareMode('prorata');
    expect(getState('shareMode')).toBe('prorata');
  });

  it('sélectionne 50-50 → shareMode = 50-50', () => {
    selectShareMode('50-50');
    expect(getState('shareMode')).toBe('50-50');
  });

  it('sélectionne custom → shareMode = custom', () => {
    selectShareMode('custom');
    expect(getState('shareMode')).toBe('custom');
  });

  it('écrase le mode précédent', () => {
    selectShareMode('50-50');
    selectShareMode('prorata');
    expect(getState('shareMode')).toBe('prorata');
  });
});

// ===== selectShareMode — DOM =====
describe('selectShareMode — mise à jour du DOM', () => {
  it('ajoute la classe selected au bouton prorata', () => {
    selectShareMode('prorata');
    expect(document.getElementById('modeProrata').classList.contains('selected')).toBe(true);
  });

  it('ajoute la classe selected au bouton 50-50', () => {
    selectShareMode('50-50');
    expect(document.getElementById('mode5050').classList.contains('selected')).toBe(true);
  });

  it('ajoute la classe selected au bouton custom', () => {
    selectShareMode('custom');
    expect(document.getElementById('modeCustom').classList.contains('selected')).toBe(true);
  });

  it('supprime selected des autres boutons', () => {
    document.getElementById('modeProrata').classList.add('selected');
    document.getElementById('mode5050').classList.add('selected');
    selectShareMode('custom');
    expect(document.getElementById('modeProrata').classList.contains('selected')).toBe(false);
    expect(document.getElementById('mode5050').classList.contains('selected')).toBe(false);
  });

  it('mode custom → active #customPercentages', () => {
    selectShareMode('custom');
    expect(document.getElementById('customPercentages').classList.contains('active')).toBe(true);
  });

  it('mode prorata → désactive #customPercentages', () => {
    document.getElementById('customPercentages').classList.add('active');
    selectShareMode('prorata');
    expect(document.getElementById('customPercentages').classList.contains('active')).toBe(false);
  });

  it('mode 50-50 → désactive #customPercentages', () => {
    document.getElementById('customPercentages').classList.add('active');
    selectShareMode('50-50');
    expect(document.getElementById('customPercentages').classList.contains('active')).toBe(false);
  });
});

// ===== validateCustomPercents — state =====
describe('validateCustomPercents — mise à jour du state', () => {
  it('70+30 → customPercents = {vous: 70, conjointe: 30}', () => {
    document.getElementById('customPercentYou').value = '70';
    document.getElementById('customPercentPartner').value = '30';
    validateCustomPercents();
    const cp = getState('customPercents');
    expect(cp.vous).toBe(70);
    expect(cp.conjointe).toBe(30);
  });

  it('50+50 → customPercents = {vous: 50, conjointe: 50}', () => {
    document.getElementById('customPercentYou').value = '50';
    document.getElementById('customPercentPartner').value = '50';
    validateCustomPercents();
    const cp = getState('customPercents');
    expect(cp.vous).toBe(50);
    expect(cp.conjointe).toBe(50);
  });

  it('valeur vide comptée comme 0 (0+100)', () => {
    document.getElementById('customPercentYou').value = '';
    document.getElementById('customPercentPartner').value = '100';
    validateCustomPercents();
    const cp = getState('customPercents');
    expect(cp.vous).toBe(0);
    expect(cp.conjointe).toBe(100);
  });

  it('total ≠ 100 → customPercents non mis à jour', () => {
    setState('customPercents', { vous: 60, conjointe: 40 });
    document.getElementById('customPercentYou').value = '60';
    document.getElementById('customPercentPartner').value = '30';
    validateCustomPercents();
    expect(getState('customPercents').vous).toBe(60); // inchangé
    expect(getState('customPercents').conjointe).toBe(40); // inchangé
  });
});

// ===== validateCustomPercents — DOM =====
describe('validateCustomPercents — mise à jour du DOM', () => {
  it('total = 100 → message valide dans #shareModeValidation', () => {
    document.getElementById('customPercentYou').value = '70';
    document.getElementById('customPercentPartner').value = '30';
    validateCustomPercents();
    const msg = document.getElementById('shareModeValidation').textContent;
    expect(msg).toMatch(/valid/i);
  });

  it('total ≠ 100 → message d\'erreur contenant le total réel', () => {
    document.getElementById('customPercentYou').value = '60';
    document.getElementById('customPercentPartner').value = '30';
    validateCustomPercents();
    const msg = document.getElementById('shareModeValidation').textContent;
    expect(msg).toContain('90%');
  });

  it('total = 100 → classe valid sur #shareModeValidation', () => {
    document.getElementById('customPercentYou').value = '40';
    document.getElementById('customPercentPartner').value = '60';
    validateCustomPercents();
    expect(document.getElementById('shareModeValidation').className).toContain('valid');
  });

  it('total ≠ 100 → classe invalid sur #shareModeValidation', () => {
    document.getElementById('customPercentYou').value = '40';
    document.getElementById('customPercentPartner').value = '40';
    validateCustomPercents();
    expect(document.getElementById('shareModeValidation').className).toContain('invalid');
  });
});
