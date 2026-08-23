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

describe('Les habitudes du foyer arbitrent les replis', () => {
  /**
   * L'ordre de la table classe les candidates par précision. Il reste juste
   * pour la candidate exacte, mais au-delà c'est un choix éditorial : rien ne
   * dit qu'un foyer sans « Bar » range ses sorties sous « Restaurant » plutôt
   * que sous « Loisirs ». Celui qui saisit le sait ; la table, non.
   */
  const SANS_BAR = CATEGORIES;   // ni « Bar », ni « Boulangerie »

  /** Ce foyer range tout ce qui sort sous « Loisirs » */
  const HABITUE_LOISIRS = [
    { id: 'loisirs', label: 'Loisirs' },
    { id: 'courses', label: 'Courses' },
    { id: 'restaurant', label: 'Restaurant' }
  ];

  it('un bar tombe sur la catégorie que ce foyer emploie le plus', () => {
    // Sans habitudes, la table imposerait « Restaurant ».
    const lieu = { type: 'bar', nom: 'Le Zinc' };

    expect(categoriePourLieu(lieu, SANS_BAR).id).toBe('restaurant');
    expect(categoriePourLieu(lieu, SANS_BAR, HABITUE_LOISIRS).id).toBe('loisirs');
  });

  it('la catégorie exacte l\'emporte toujours sur les habitudes', () => {
    // « Bar » existe : il n'y a rien à arbitrer, et un foyer qui l'a créé l'a
    // fait pour qu'il serve.
    const lieu = { type: 'bar', nom: 'Le Zinc' };

    expect(categoriePourLieu(lieu, ENRICHIES, HABITUE_LOISIRS).id).toBe('bar');
  });

  it('une catégorie jamais employée passe derrière, sans être écartée', () => {
    // C'est peut-être la première fois qu'on va dans ce genre d'endroit.
    const jamaisLoisirs = [{ id: 'restaurant', label: 'Restaurant' }];

    expect(categoriePourLieu({ type: 'bar' }, SANS_BAR, jamaisLoisirs).id).toBe('restaurant');
  });

  it('sans habitudes connues, la table décide comme avant', () => {
    expect(categoriePourLieu({ type: 'bar' }, SANS_BAR, []).id).toBe('restaurant');
    expect(categoriePourLieu({ type: 'bakery' }, SANS_BAR, []).id).toBe('courses');
  });

  it('arbitre aussi les replis venus du nom', () => {
    const lieu = { type: 'yes', nom: 'Le Pub du Port', adresseComplete: 'Le Pub du Port, Brest' };

    expect(categoriePourLieu(lieu, SANS_BAR).id).toBe('restaurant');
    expect(categoriePourLieu(lieu, SANS_BAR, HABITUE_LOISIRS).id).toBe('loisirs');
  });

  it('ne lève pas sur des habitudes mal formées', () => {
    expect(() => categoriePourLieu({ type: 'bar' }, SANS_BAR, null)).not.toThrow();
    expect(() => categoriePourLieu({ type: 'bar' }, SANS_BAR, [null, undefined])).not.toThrow();
    expect(categoriePourLieu({ type: 'bar' }, SANS_BAR, [null]).id).toBe('restaurant');
  });
});
