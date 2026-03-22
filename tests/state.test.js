// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getState, setState, subscribe, resetState, resetUserData,
  addToArray, updateInArray, removeFromArray, getActiveItems
} from '../js/state.js';

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

// ===== subscribe =====
describe('subscribe', () => {
  it('appelle le callback lors d\'un changement', () => {
    let called = false;
    subscribe('shareMode', () => { called = true; });
    setState('shareMode', '50-50');
    expect(called).toBe(true);
  });

  it('reçoit la nouvelle valeur', () => {
    let received;
    subscribe('shareMode', (val) => { received = val; });
    setState('shareMode', 'custom');
    expect(received).toBe('custom');
  });

  it('reçoit la clé modifiée', () => {
    let receivedKey;
    subscribe('shareMode', (val, key) => { receivedKey = key; });
    setState('shareMode', '50-50');
    expect(receivedKey).toBe('shareMode');
  });

  it('notifie le parent lors d\'un changement de clé enfant', () => {
    let parentCalled = false;
    subscribe('salaries', () => { parentCalled = true; });
    setState('salaries.vous', 2000);
    expect(parentCalled).toBe(true);
  });

  it('notifie le wildcard *', () => {
    let count = 0;
    subscribe('*', () => { count++; });
    setState('shareMode', '50-50');
    setState('shareMode', 'prorata');
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('l\'unsubscribe arrête les notifications', () => {
    let count = 0;
    const unsub = subscribe('shareMode', () => { count++; });
    setState('shareMode', '50-50');
    unsub();
    setState('shareMode', 'prorata');
    expect(count).toBe(1);
  });

  it('supporte plusieurs subscribers sur la même clé', () => {
    let a = 0, b = 0;
    subscribe('shareMode', () => { a++; });
    subscribe('shareMode', () => { b++; });
    setState('shareMode', '50-50');
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('ne déclenche pas les autres subscribers', () => {
    let calledA = false, calledB = false;
    subscribe('shareMode', () => { calledA = true; });
    subscribe('isAuthenticated', () => { calledB = true; });
    setState('shareMode', 'custom');
    expect(calledA).toBe(true);
    expect(calledB).toBe(false);
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

  it('notifie les subscribers lors du reset', () => {
    let notified = false;
    subscribe('shareMode', () => { notified = true; });
    resetState();
    expect(notified).toBe(true);
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

// ===== addToArray =====
describe('addToArray', () => {
  it('ajoute un élément dans un tableau vide', () => {
    addToArray('variableCharges', { id: '1', amount: 100 });
    expect(getState('variableCharges')).toHaveLength(1);
  });

  it('préserve les éléments existants', () => {
    addToArray('variableCharges', { id: '1', amount: 100 });
    addToArray('variableCharges', { id: '2', amount: 200 });
    expect(getState('variableCharges')).toHaveLength(2);
  });

  it('initialise si le tableau était null/undefined', () => {
    setState('variableCharges', undefined);
    addToArray('variableCharges', { id: '1', amount: 50 });
    expect(getState('variableCharges')).toHaveLength(1);
  });

  it('l\'élément ajouté est bien présent', () => {
    addToArray('variableCharges', { id: 'xyz', amount: 150 });
    const charges = getState('variableCharges');
    expect(charges.find(c => c.id === 'xyz')).toBeDefined();
  });
});

// ===== updateInArray =====
describe('updateInArray', () => {
  beforeEach(() => {
    setState('variableCharges', [
      { id: 'abc', amount: 100, description: 'Loyer' },
      { id: 'def', amount: 200, description: 'EDF' }
    ]);
  });

  it('met à jour la bonne propriété du bon élément', () => {
    updateInArray('variableCharges', 'abc', { amount: 999 });
    expect(getState('variableCharges').find(c => c.id === 'abc').amount).toBe(999);
  });

  it('préserve les autres propriétés de l\'élément', () => {
    updateInArray('variableCharges', 'abc', { amount: 999 });
    expect(getState('variableCharges').find(c => c.id === 'abc').description).toBe('Loyer');
  });

  it('ne modifie pas les autres éléments', () => {
    updateInArray('variableCharges', 'abc', { amount: 999 });
    expect(getState('variableCharges').find(c => c.id === 'def').amount).toBe(200);
  });

  it('ignore un id inexistant sans erreur', () => {
    updateInArray('variableCharges', 'zzz', { amount: 0 });
    expect(getState('variableCharges')).toHaveLength(2);
  });

  it('peut ajouter de nouvelles propriétés', () => {
    updateInArray('variableCharges', 'abc', { note: 'Ajouté' });
    expect(getState('variableCharges').find(c => c.id === 'abc').note).toBe('Ajouté');
  });
});

// ===== removeFromArray — soft delete =====
describe('removeFromArray — soft delete (par défaut)', () => {
  beforeEach(() => {
    setState('variableCharges', [
      { id: 'abc', amount: 100 },
      { id: 'def', amount: 200 }
    ]);
  });

  it('marque l\'élément comme deleted', () => {
    removeFromArray('variableCharges', 'abc');
    expect(getState('variableCharges').find(c => c.id === 'abc').deleted).toBe(true);
  });

  it('ajoute deletedAt en ISO string', () => {
    removeFromArray('variableCharges', 'abc');
    const deletedAt = getState('variableCharges').find(c => c.id === 'abc').deletedAt;
    expect(deletedAt).toBeDefined();
    expect(() => new Date(deletedAt)).not.toThrow();
  });

  it('conserve l\'élément dans le tableau (soft)', () => {
    removeFromArray('variableCharges', 'abc');
    expect(getState('variableCharges')).toHaveLength(2);
  });

  it('ne touche pas les autres éléments', () => {
    removeFromArray('variableCharges', 'abc');
    expect(getState('variableCharges').find(c => c.id === 'def').deleted).toBeUndefined();
  });
});

// ===== removeFromArray — hard delete =====
describe('removeFromArray — hard delete', () => {
  beforeEach(() => {
    setState('variableCharges', [
      { id: 'abc', amount: 100 },
      { id: 'def', amount: 200 }
    ]);
  });

  it('supprime complètement l\'élément', () => {
    removeFromArray('variableCharges', 'abc', true);
    expect(getState('variableCharges')).toHaveLength(1);
    expect(getState('variableCharges').find(c => c.id === 'abc')).toBeUndefined();
  });

  it('préserve les autres éléments', () => {
    removeFromArray('variableCharges', 'abc', true);
    expect(getState('variableCharges').find(c => c.id === 'def')).toBeDefined();
  });
});

// ===== getActiveItems =====
describe('getActiveItems', () => {
  it('filtre les items marqués deleted', () => {
    setState('variableCharges', [
      { id: '1', amount: 100 },
      { id: '2', amount: 200, deleted: true },
      { id: '3', amount: 300 }
    ]);
    expect(getActiveItems('variableCharges')).toHaveLength(2);
  });

  it('retourne tout si aucun supprimé', () => {
    setState('variableCharges', [
      { id: '1', amount: 100 },
      { id: '2', amount: 200 }
    ]);
    expect(getActiveItems('variableCharges')).toHaveLength(2);
  });

  it('retourne tableau vide si tout est supprimé', () => {
    setState('variableCharges', [{ id: '1', deleted: true }]);
    expect(getActiveItems('variableCharges')).toHaveLength(0);
  });

  it('retourne tableau vide si clé inexistante', () => {
    expect(getActiveItems('inexistant')).toHaveLength(0);
  });

  it('fonctionne avec les charges fixes', () => {
    setState('fixedCharges', [
      { id: 'a', amount: 500, deleted: true },
      { id: 'b', amount: 1000 }
    ]);
    const active = getActiveItems('fixedCharges');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('b');
  });
});
