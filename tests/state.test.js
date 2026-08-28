// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getState, setState, resetState, resetUserData
} from '../public/js/state.js';

beforeEach(() => {
  resetState();
});

// ===== getState =====
describe('getState', () => {
  it('retourne toute la state sans argument', () => {
    const s = getState();
    expect(s).toHaveProperty('shareMode');
    expect(s).toHaveProperty('salaries');
    expect(s).toHaveProperty('variableCharges');
  });

  it('retourne une valeur scalaire', () => {
    expect(getState('shareMode')).toBe('prorata');
  });

  it('supporte la notation pointée', () => {
    expect(getState('salaries.vous')).toBe(0);
    expect(getState('salaries.conjointe')).toBe(0);
  });

  it('retourne undefined pour une clé inexistante', () => {
    expect(getState('inexistant')).toBeUndefined();
  });

  it('retourne undefined via notation pointée sur clé manquante', () => {
    expect(getState('salaries.inexistant')).toBeUndefined();
  });

  it('retourne une copie des tableaux — pas de mutation directe', () => {
    setState('variableCharges', [{ id: '1', amount: 100 }]);
    const copy = getState('variableCharges');
    copy.push({ id: '2', amount: 200 });
    expect(getState('variableCharges')).toHaveLength(1);
  });

  it('retourne une copie des objets — pas de mutation directe', () => {
    const salaries = getState('salaries');
    salaries.vous = 9999;
    expect(getState('salaries.vous')).toBe(0);
  });

  it('retourne null correctement', () => {
    setState('currentUser', null);
    expect(getState('currentUser')).toBeNull();
  });

  it('retourne false correctement', () => {
    expect(getState('isAuthenticated')).toBe(false);
  });
});

// ===== setState =====
describe('setState', () => {
  it('définit une valeur scalaire', () => {
    setState('shareMode', '50-50');
    expect(getState('shareMode')).toBe('50-50');
  });

  it('supporte la notation pointée', () => {
    setState('salaries.vous', 3000);
    expect(getState('salaries.vous')).toBe(3000);
  });

  it('ne réinitialise pas les autres propriétés de l\'objet', () => {
    setState('salaries.vous', 3000);
    expect(getState('salaries.conjointe')).toBe(0);
  });

  it('définit un tableau', () => {
    setState('fixedCharges', [{ id: '1', amount: 500 }]);
    expect(getState('fixedCharges')).toHaveLength(1);
  });

  it('peut écraser une valeur existante', () => {
    setState('shareMode', '50-50');
    setState('shareMode', 'custom');
    expect(getState('shareMode')).toBe('custom');
  });

  it('crée les clés intermédiaires manquantes via notation pointée', () => {
    setState('quickAddState.selectedCategory', 'Loyer');
    expect(getState('quickAddState.selectedCategory')).toBe('Loyer');
  });

  it('définit un objet', () => {
    setState('customPercents', { vous: 70, conjointe: 30 });
    expect(getState('customPercents.vous')).toBe(70);
  });
});

// ===== resetState =====
describe('resetState', () => {
  it('réinitialise shareMode à prorata', () => {
    setState('shareMode', '50-50');
    resetState();
    expect(getState('shareMode')).toBe('prorata');
  });

  it('réinitialise les tableaux à vide', () => {
    setState('variableCharges', [{ id: '1' }]);
    resetState();
    expect(getState('variableCharges')).toHaveLength(0);
  });

  it('réinitialise les salaires à 0', () => {
    setState('salaries.vous', 5000);
    resetState();
    expect(getState('salaries.vous')).toBe(0);
  });

  it('remet customPercents à 50/50', () => {
    setState('customPercents', { vous: 70, conjointe: 30 });
    resetState();
    expect(getState('customPercents.vous')).toBe(50);
    expect(getState('customPercents.conjointe')).toBe(50);
  });
});

// ===== resetUserData =====
describe('resetUserData', () => {
  it('efface les salaires', () => {
    setState('salaries.vous', 4000);
    resetUserData();
    expect(getState('salaries.vous')).toBe(0);
  });

  it('efface les charges variables', () => {
    setState('variableCharges', [{ id: '1' }]);
    resetUserData();
    expect(getState('variableCharges')).toHaveLength(0);
  });

  it('efface les charges fixes', () => {
    setState('fixedCharges', [{ id: '1' }]);
    resetUserData();
    expect(getState('fixedCharges')).toHaveLength(0);
  });

  it('efface les remboursements', () => {
    setState('reimbursements', [{ id: '1' }]);
    resetUserData();
    expect(getState('reimbursements')).toHaveLength(0);
  });

  it('efface tout ce qui est dérivé de l\'historique du foyer', () => {
    // Se reconnecter sur un autre compte sans recharger la page laissait
    // autrement l'historique complet du foyer précédent dans l'état — le nœud
    // `periods` en entier pour le rapport, et ce que la mémoire des libellés
    // en avait appris.
    setState('historiquePourLeRapport', { '2026-07': { variableCharges: {} } });
    setState('memoireLibelles', { intermarche: 'Courses' });
    setState('haussesChargesFixes', { lignes: [{ description: 'Loyer' }] });
    setState('rapportDuMois', { mois: '2026-08', total: 1300 });
    setState('observations', [{ cle: 'rythme-du-mois:2026-08' }]);

    resetUserData();

    expect(getState('historiquePourLeRapport')).toBe(null);
    expect(getState('memoireLibelles')).toEqual({});
    expect(getState('haussesChargesFixes')).toBe(null);
    expect(getState('rapportDuMois')).toBe(null);
    expect(getState('observations')).toHaveLength(0);
  });

  it('remet shareMode à prorata', () => {
    setState('shareMode', '50-50');
    resetUserData();
    expect(getState('shareMode')).toBe('prorata');
  });

  it('remet currentUser à null', () => {
    setState('currentUser', { uid: 'abc' });
    resetUserData();
    expect(getState('currentUser')).toBeNull();
  });

  it('remet isAuthenticated à false', () => {
    setState('isAuthenticated', true);
    resetUserData();
    expect(getState('isAuthenticated')).toBe(false);
  });

  it('efface l\'état d\'édition', () => {
    setState('editingCharge', { id: '1' });
    resetUserData();
    expect(getState('editingCharge')).toBeNull();
  });
});

describe('setState — pollution de prototype', () => {
  // CodeQL js/prototype-pollution-utility : setState construisait les niveaux
  // intermédiaires sans filtrer les segments de clé. Un segment __proto__
  // écrivait sur le prototype d'Object, et toute l'application en héritait.

  it('refuse un segment __proto__ et ne pollue pas Object', () => {
    setState('__proto__.pollue', 'oui');
    expect({}.pollue).toBeUndefined();
    expect(Object.prototype.pollue).toBeUndefined();
  });

  it('refuse constructor et prototype', () => {
    setState('constructor.pollue2', 'oui');
    setState('a.prototype.pollue3', 'oui');
    expect({}.pollue2).toBeUndefined();
    expect({}.pollue3).toBeUndefined();
  });

  it('laisse passer une clé imbriquée légitime', () => {
    setState('quickAddState.gpsLocation', { lat: 1 });
    expect(getState('quickAddState').gpsLocation).toEqual({ lat: 1 });
  });
});
