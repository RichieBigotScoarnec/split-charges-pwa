import { describe, it, expect } from 'vitest';
import { identifiantDepuisLibelle } from '../../public/js/utils/identifiant.js';

/**
 * La fabrique d'identifiants, éprouvée sans navigateur
 *
 * Elle vivait dans `modules/custom-lists.js`, qui touche à `window` : la
 * couvrir exigeait un jsdom. Catégories, destinations et enveloppes s'en
 * servent maintenant toutes les trois — une seconde copie de cette formule
 * aurait dérivé de la première, et c'est très exactement ainsi que le défaut
 * des accents avait survécu si longtemps.
 *
 * `tests/modules/identifiant-categorie.test.js` continue de l'éprouver telle
 * qu'elle est employée depuis les catégories.
 */

describe('Identifiant fabriqué depuis un libellé', () => {
  it('déplie les accents plutôt que de les retirer', () => {
    // « Café » donnait `caf`, « Péage » donnait `page`, « Crèche » donnait
    // `crche`. La détection par le lieu vise `cafe` : elle ne trouvait jamais
    // rien, sans qu'aucune erreur ne le dise.
    expect(identifiantDepuisLibelle('Café')).toBe('cafe');
    expect(identifiantDepuisLibelle('Péage')).toBe('peage');
    expect(identifiantDepuisLibelle('Crèche')).toBe('creche');
    expect(identifiantDepuisLibelle('Vacances été')).toBe('vacances-ete');
  });

  it('remplace les espaces par des tirets', () => {
    expect(identifiantDepuisLibelle('Grand  chantier')).toBe('grand-chantier');
  });

  it('ne rend jamais un identifiant vide', () => {
    // Un libellé entièrement composé de caractères écartés — « ??? », un emoji
    // seul — donnerait un identifiant qu'aucune recherche ne retrouverait.
    expect(identifiantDepuisLibelle('???')).toBe('categorie');
    expect(identifiantDepuisLibelle('🏖️')).toBe('categorie');
    expect(identifiantDepuisLibelle('')).toBe('categorie');
    expect(identifiantDepuisLibelle(null)).toBe('categorie');
  });

  it('numérote plutôt que de réemployer un identifiant pris', () => {
    // La recherche par identifiant rend la première trouvée : un doublon aurait
    // désigné la mauvaise entrée, en silence.
    const existantes = [{ id: 'vacances' }, { id: 'vacances-2' }];
    expect(identifiantDepuisLibelle('Vacances', existantes)).toBe('vacances-3');
  });

  it('distingue deux libellés que les accents rendaient identiques', () => {
    const existantes = [{ id: 'cafe' }];
    expect(identifiantDepuisLibelle('Café', existantes)).toBe('cafe-2');
  });

  it('accepte une liste absente', () => {
    expect(identifiantDepuisLibelle('Chantier')).toBe('chantier');
    expect(identifiantDepuisLibelle('Chantier', null)).toBe('chantier');
  });
});
