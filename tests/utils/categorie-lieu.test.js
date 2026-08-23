import { describe, it, expect } from 'vitest';
import { categoriePourLieu, typesReconnus } from '../../public/js/utils/categorie-lieu.js';
import { CATEGORIES } from '../../public/js/config.js';

/**
 * Le défaut signalé à l'usage : à la Brioche Dorée, aucune catégorie n'était
 * proposée. La table n'en connaissait que quatre — supermarché, station-service,
 * restaurant, pharmacie — et une boulangerie est taguée `bakery`.
 */

/** Les catégories livrées par défaut, sans « Bar » ni « Boulangerie » */
const PAR_DEFAUT = CATEGORIES;

/** Un foyer qui a créé ses propres catégories dans l'application */
const ENRICHIES = [
  ...CATEGORIES,
  { id: 'bar', icon: '🍺', label: 'Bar' },
  { id: 'boulangerie', icon: '🥐', label: 'Boulangerie' }
];

describe('Le type du lieu prime, c\'est une donnée structurée', () => {
  it('une boulangerie tombe sur « Boulangerie » quand elle existe', () => {
    const lieu = { type: 'bakery', nom: 'Brioche Dorée' };

    expect(categoriePourLieu(lieu, ENRICHIES).id).toBe('boulangerie');
  });

  it('… et se rabat sur « Courses » quand elle n\'existe pas', () => {
    // Sans repli, un foyer qui n'a pas créé « Boulangerie » n'aurait aucune
    // détection — le défaut qu'on répare, simplement déplacé.
    const lieu = { type: 'bakery', nom: 'Brioche Dorée' };

    expect(categoriePourLieu(lieu, PAR_DEFAUT).id).toBe('courses');
  });

  it('un bar vise « Bar », puis « Restaurant »', () => {
    expect(categoriePourLieu({ type: 'bar', nom: 'Le Zinc' }, ENRICHIES).id).toBe('bar');
    expect(categoriePourLieu({ type: 'bar', nom: 'Le Zinc' }, PAR_DEFAUT).id).toBe('restaurant');
  });

  it('couvre les lieux courants qui n\'étaient pas reconnus', () => {
    const attendus = {
      cinema: 'loisirs',
      pub: 'restaurant',          // pas de « Bar » dans les catégories livrées
      butcher: 'courses',
      dentist: 'sante',
      doityourself: 'maison',
      train_station: 'transport',
      charging_station: 'essence',
      fast_food: 'restaurant',
      pharmacy: 'sante',
      supermarket: 'courses'
    };

    for (const [type, attendu] of Object.entries(attendus)) {
      const trouvee = categoriePourLieu({ type }, PAR_DEFAUT);
      expect(trouvee, `${type} non reconnu`).not.toBeNull();
      expect(trouvee.id, `${type} mal classé`).toBe(attendu);
    }
  });

  it('la table couvre nettement plus que les quatre types d\'origine', () => {
    expect(typesReconnus().length).toBeGreaterThan(40);
  });
});

describe('Ne rien proposer plutôt que se tromper', () => {
  /**
   * Une catégorie choisie à tort part en base sans qu'on la relise ; une
   * absence se voit et se corrige. Le doute profite donc à l'absence.
   */
  it('un type ambigu ne déclenche aucune détection', () => {
    for (const type of ['yes', 'house', 'residential', 'service', 'clothes', 'hairdresser']) {
      expect(categoriePourLieu({ type }, ENRICHIES), type).toBeNull();
    }
  });

  it('une rue sans commerce ne déclenche rien', () => {
    // Le cas de la capture : « Quai Vasco de Gama », aucun lieu nommé.
    const lieu = { type: 'residential', nom: '', adresseComplete: 'Quai Vasco de Gama, 66700 Argelès-sur-Mer' };

    expect(categoriePourLieu(lieu, ENRICHIES)).toBeNull();
  });

  it('ne lève sur aucune entrée aberrante', () => {
    expect(categoriePourLieu(null, ENRICHIES)).toBeNull();
    expect(categoriePourLieu({}, ENRICHIES)).toBeNull();
    expect(categoriePourLieu({ type: 'bakery' }, [])).toBeNull();
    expect(categoriePourLieu({ type: 'bakery' }, null)).toBeNull();
    expect(categoriePourLieu({ type: 42 }, ENRICHIES)).toBeNull();
  });
});

describe('Le nom, quand le type ne dit rien', () => {
  it('reconnaît une enseigne mal taguée', () => {
    // `building=retail` n'apprend rien ; le nom, si.
    const lieu = { type: 'retail', nom: 'E.Leclerc', adresseComplete: 'E.Leclerc, Rennes' };

    expect(categoriePourLieu(lieu, PAR_DEFAUT).id).toBe('courses');
  });

  it('« Brioche Dorée » est reconnue même sans type exploitable', () => {
    const lieu = { type: 'yes', nom: 'Brioche Dorée', adresseComplete: 'Brioche Dorée, Rennes' };

    expect(categoriePourLieu(lieu, PAR_DEFAUT).id).toBe('courses');
    expect(categoriePourLieu(lieu, ENRICHIES).id).toBe('boulangerie');
  });

  it('le type l\'emporte sur le nom quand les deux parlent', () => {
    // « Le Bar à Pain » est une boulangerie : le tag le sait, le nom trompe.
    const lieu = { type: 'bakery', nom: 'Le Bar à Pain' };

    expect(categoriePourLieu(lieu, ENRICHIES).id).toBe('boulangerie');
  });

  it('un nom quelconque ne déclenche rien', () => {
    const lieu = { type: 'yes', nom: 'Chez Untel', adresseComplete: 'Chez Untel, Rennes' };

    expect(categoriePourLieu(lieu, ENRICHIES)).toBeNull();
  });
});
