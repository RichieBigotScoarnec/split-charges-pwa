import { describe, it, expect } from 'vitest';
import { categoriePourLieu, typesReconnus } from '../../public/js/utils/categorie-lieu.js';
import { CATEGORIES } from '../../public/js/config.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Le défaut signalé à l'usage : à la Brioche Dorée, aucune catégorie n'était
 * proposée. La table n'en connaissait que quatre — supermarché, station-service,
 * restaurant, pharmacie — et une boulangerie est taguée `bakery`.
 */

/** Les catégories livrées par défaut — « Bar », « Café » et « Boulangerie »
 *  en font désormais partie : douze types de lieux les visaient sans qu'aucun
 *  foyer ne les possède. */
const PAR_DEFAUT = CATEGORIES;

/** Un foyer resté sur l'ancienne liste, ou qui a supprimé ces catégories */
const SANS_LES_NOUVELLES = CATEGORIES.filter(
  c => !['bar', 'cafe', 'boulangerie'].includes(c.id)
);

describe('Le type du lieu prime, c\'est une donnée structurée', () => {
  it('une boulangerie tombe sur « Boulangerie », livrée par défaut', () => {
    const lieu = { type: 'bakery', nom: 'Brioche Dorée' };

    expect(categoriePourLieu(lieu, PAR_DEFAUT).id).toBe('boulangerie');
  });

  it('… et se rabat sur « Courses » chez qui l\'a supprimée', () => {
    // Sans repli, un foyer qui n'a pas cette catégorie n'aurait aucune
    // détection — le défaut qu'on répare, simplement déplacé.
    const lieu = { type: 'bakery', nom: 'Brioche Dorée' };

    expect(categoriePourLieu(lieu, SANS_LES_NOUVELLES).id).toBe('courses');
  });

  it('un bar vise « Bar », puis « Restaurant »', () => {
    expect(categoriePourLieu({ type: 'bar', nom: 'Le Zinc' }, PAR_DEFAUT).id).toBe('bar');
    expect(categoriePourLieu({ type: 'bar', nom: 'Le Zinc' }, SANS_LES_NOUVELLES).id)
      .toBe('restaurant');
  });

  it('un café tombe sur « Café » plutôt que sur « Restaurant »', () => {
    // C'est le gain : douze types de lieux visaient une catégorie absente, et
    // se rangeaient donc sous un à-peu-près permanent.
    expect(categoriePourLieu({ type: 'cafe', nom: 'Colombus' }, PAR_DEFAUT).id).toBe('cafe');
    expect(categoriePourLieu({ type: 'pub', nom: 'Le Zinc' }, PAR_DEFAUT).id).toBe('bar');
  });

  it('couvre les lieux courants qui n\'étaient pas reconnus', () => {
    const attendus = {
      cinema: 'loisirs',
      pub: 'bar',
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
      expect(categoriePourLieu({ type }, PAR_DEFAUT), type).toBeNull();
    }
  });

  it('une rue sans commerce ne déclenche rien', () => {
    // Le cas de la capture : « Quai Vasco de Gama », aucun lieu nommé.
    const lieu = { type: 'residential', nom: '', adresseComplete: 'Quai Vasco de Gama, 66700 Argelès-sur-Mer' };

    expect(categoriePourLieu(lieu, PAR_DEFAUT)).toBeNull();
  });

  it('ne lève sur aucune entrée aberrante', () => {
    expect(categoriePourLieu(null, PAR_DEFAUT)).toBeNull();
    expect(categoriePourLieu({}, PAR_DEFAUT)).toBeNull();
    expect(categoriePourLieu({ type: 'bakery' }, [])).toBeNull();
    expect(categoriePourLieu({ type: 'bakery' }, null)).toBeNull();
    expect(categoriePourLieu({ type: 42 }, PAR_DEFAUT)).toBeNull();
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

    expect(categoriePourLieu(lieu, PAR_DEFAUT).id).toBe('boulangerie');
    expect(categoriePourLieu(lieu, SANS_LES_NOUVELLES).id).toBe('courses');
  });

  it('le type l\'emporte sur le nom quand les deux parlent', () => {
    // « Le Bar à Pain » est une boulangerie : le tag le sait, le nom trompe.
    const lieu = { type: 'bakery', nom: 'Le Bar à Pain' };

    expect(categoriePourLieu(lieu, PAR_DEFAUT).id).toBe('boulangerie');
  });

  it('un nom quelconque ne déclenche rien', () => {
    const lieu = { type: 'yes', nom: 'Chez Untel', adresseComplete: 'Chez Untel, Rennes' };

    expect(categoriePourLieu(lieu, PAR_DEFAUT)).toBeNull();
  });
});

describe('Les habitudes du foyer arbitrent les replis', () => {
  /**
   * L'ordre de la table classe les candidates par précision. Il reste juste
   * pour la candidate exacte, mais au-delà c'est un choix éditorial : rien ne
   * dit qu'un foyer sans « Bar » range ses sorties sous « Restaurant » plutôt
   * que sous « Loisirs ». Celui qui saisit le sait ; la table, non.
   */
  // Un foyer qui a supprimé « Bar », « Café » et « Boulangerie » de sa liste :
  // c'est là que l'arbitrage par les habitudes a encore quelque chose à faire.
  const SANS_BAR = CATEGORIES.filter(c => !['bar', 'cafe', 'boulangerie'].includes(c.id));

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

    expect(categoriePourLieu(lieu, PAR_DEFAUT, HABITUE_LOISIRS).id).toBe('bar');
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

/**
 * Les deux fichiers doivent se correspondre
 *
 * `categorie-lieu.js` vise des identifiants de catégories ; `config.js` décide
 * de celles qui existent au premier usage. Rien ne les tenait ensemble.
 *
 * Douze types de lieux avaient donc pour premier choix `bar`, `cafe` ou
 * `boulangerie`, trois catégories qu'aucun foyer ne possédait : un café était
 * rangé en « Restaurant », une boulangerie en « Courses ». Le repli
 * fonctionnait — la précision se perdait, sans que rien ne le signale.
 */
describe('La table des lieux et les catégories par défaut', () => {
  const TABLE = readFileSync(
    resolve(process.cwd(), 'public/js/utils/categorie-lieu.js'),
    'utf8'
  );

  /** Les catégories visées par la table, du premier choix au dernier */
  function ciblesDeLaTable() {
    const bloc = TABLE.slice(
      TABLE.indexOf('const TYPES = {'),
      TABLE.indexOf('\n};', TABLE.indexOf('const TYPES = {'))
    );

    const cibles = new Map();
    for (const ligne of bloc.matchAll(/^\s+([a-z_0-9]+):\s*\[([^\]]+)\]/gm)) {
      const [type, liste] = [ligne[1], ligne[2]];
      cibles.set(type, liste.split(',').map(c => c.trim().replace(/'/g, '')));
    }
    return cibles;
  }

  it('chaque premier choix existe parmi les catégories par défaut', () => {
    // Le premier choix est celui qui décrit le lieu le plus justement. S'il
    // n'existe pas, la détection retombe sur un à-peu-près permanent.
    const disponibles = new Set(CATEGORIES.map(c => c.id));

    for (const [type, cibles] of ciblesDeLaTable()) {
      expect(disponibles, `« ${type} » vise « ${cibles[0]} », absente des défauts`)
        .toContain(cibles[0]);
    }
  });

  it('aucune cible, même de repli, ne désigne une catégorie inexistante', () => {
    // Une cible de repli inexistante n'est pas fausse — elle est simplement
    // sans effet, et elle laisse croire à une couverture qui n'existe pas.
    const disponibles = new Set(CATEGORIES.map(c => c.id));

    for (const [type, cibles] of ciblesDeLaTable()) {
      for (const cible of cibles) {
        expect(disponibles, `« ${type} » vise « ${cible} », absente des défauts`)
          .toContain(cible);
      }
    }
  });

  it('les nouvelles catégories portent une icône et une couleur', () => {
    for (const id of ['cafe', 'bar', 'boulangerie']) {
      const categorie = CATEGORIES.find(c => c.id === id);
      expect(categorie, `${id} absente`).toBeDefined();
      expect(categorie.icon).toBeTruthy();
      expect(categorie.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(categorie.label).toBeTruthy();
    }
  });
});
