// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../public/js/db.js', () => ({
  dbGet: vi.fn(() => Promise.resolve(null)), dbSet: vi.fn(), dbUpdate: vi.fn(), dbPush: vi.fn()
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/utils/debug.js', () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const { identifiantDepuisLibelle } = await import('../../public/js/modules/custom-lists.js');

/**
 * L'identifiant est écrit sur chaque charge et sert à retrouver la catégorie.
 * L'ancienne formule retirait tout ce qui n'était pas `[a-z0-9-]` après un
 * simple `toLowerCase()` : les accents ne survivaient pas. « Café » donnait
 * `caf`, et la détection par le lieu — qui vise `cafe` — ne le trouvait jamais.
 */
describe('Identifiant engendré depuis un libellé', () => {
  it('conserve les lettres accentuées, dépliées', () => {
    expect(identifiantDepuisLibelle('Café')).toBe('cafe');
    expect(identifiantDepuisLibelle('Santé')).toBe('sante');
    expect(identifiantDepuisLibelle('Péage')).toBe('peage');
    expect(identifiantDepuisLibelle('Épicerie')).toBe('epicerie');
    expect(identifiantDepuisLibelle('Crèche')).toBe('creche');
    expect(identifiantDepuisLibelle('Bien-être')).toBe('bien-etre');
  });

  it('laisse intact ce qui n\'a pas d\'accent', () => {
    // Les identifiants déjà en base ne doivent pas changer de forme.
    expect(identifiantDepuisLibelle('Bar')).toBe('bar');
    expect(identifiantDepuisLibelle('Boulangerie')).toBe('boulangerie');
    expect(identifiantDepuisLibelle('Compte Commun')).toBe('compte-commun');
  });

  it('ne rend jamais un identifiant vide', () => {
    // Un libellé fait uniquement de caractères écartés — un emoji seul —
    // produisait une chaîne vide, qu'aucune recherche ne retrouve.
    expect(identifiantDepuisLibelle('🍺')).toBe('categorie');
    expect(identifiantDepuisLibelle('???')).toBe('categorie');
    expect(identifiantDepuisLibelle('')).toBe('categorie');
    expect(identifiantDepuisLibelle(null)).toBe('categorie');
  });

  it('évite de reprendre un identifiant déjà pris', () => {
    // Deux libellés distincts pouvaient produire le même identifiant. La
    // recherche renvoie la première trouvée : la grille aurait sélectionné la
    // mauvaise tuile, sans qu'aucune erreur ne le dise.
    const existantes = [{ id: 'bar' }, { id: 'bar-2' }];

    expect(identifiantDepuisLibelle('Bar', existantes)).toBe('bar-3');
  });

  it('« Cafe » et « Café » ne se confondent plus silencieusement', () => {
    const existantes = [{ id: 'cafe', label: 'Cafe' }];

    expect(identifiantDepuisLibelle('Café', existantes)).toBe('cafe-2');
  });
});
