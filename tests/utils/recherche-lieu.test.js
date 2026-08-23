import { describe, it, expect } from 'vitest';
import { resultatsDeRecherche, lieuAEcrire, requeteUtile } from '../../public/js/utils/recherche-lieu.js';

/**
 * Chercher un lieu par son nom
 *
 * Le GPS ne sait dire qu'une chose : où l'on est maintenant. C'est ce qu'il
 * faut au moment de payer, et c'est inutile ensuite — un verre bu hier soir se
 * note souvent le lendemain, depuis chez soi, et la position du téléphone
 * désigne alors le domicile.
 *
 * Les réponses ci-dessous ont la forme de celles de Nominatim : un tableau
 * d'entrées portant `lat`, `lon` en chaînes, plus le même `address` que le
 * géocodage inversé.
 */

/** Une entrée telle que Nominatim la rend */
const entree = (extra = {}) => ({
  lat: '48.1113',
  lon: '-1.6800',
  name: 'Le Bistrot',
  type: 'bar',
  address: { amenity: 'Le Bistrot', road: 'Rue Saint-Michel', postcode: '35000', city: 'Rennes' },
  ...extra
});

describe('Mise en forme des propositions', () => {
  it('rend une étiquette lisible et des coordonnées exploitables', () => {
    const [premier] = resultatsDeRecherche([entree()]);

    expect(premier.etiquette).toBe('Le Bistrot, 35000 Rennes');
    expect(premier.lat).toBeCloseTo(48.1113, 4);
    expect(premier.lng).toBeCloseTo(-1.68, 4);
    expect(premier.commune).toBe('Rennes');
    expect(premier.codePostal).toBe('35000');
  });

  it('convertit les coordonnées, que Nominatim rend en chaînes', () => {
    // Écrites telles quelles, les règles de sécurité les refuseraient :
    // `location.lat` doit être un nombre.
    const [premier] = resultatsDeRecherche([entree()]);
    expect(typeof premier.lat).toBe('number');
    expect(typeof premier.lng).toBe('number');
  });

  it('écarte les entrées sans coordonnées exploitables', () => {
    // Un lieu qu'on ne peut pas placer sur la carte n'a pas sa place dans une
    // liste dont c'est l'objet.
    const resultats = resultatsDeRecherche([
      entree({ lat: '', lon: '' }),
      entree({ lat: 'quelque part', lon: '-1.68' }),
      entree({ lat: '200', lon: '-1.68' }),
      entree({ lon: '400' }),
      entree({ name: 'Le Bon', address: { amenity: 'Le Bon', city: 'Rennes' } })
    ]);

    expect(resultats).toHaveLength(1);
    expect(resultats[0].nom).toBe('Le Bon');
  });

  it('écarte les doublons d\'étiquette', () => {
    // Nominatim rend volontiers plusieurs entrées pour un même établissement.
    // Deux lignes identiques obligent à choisir sans rien pour départager.
    const resultats = resultatsDeRecherche([entree(), entree({ lat: '48.1114' })]);
    expect(resultats).toHaveLength(1);
  });

  it('écarte ce qui ne porte aucun libellé', () => {
    const resultats = resultatsDeRecherche([{ lat: '48.1', lon: '-1.6' }]);
    expect(resultats).toEqual([]);
  });

  it('plafonne la liste — au-delà, elle ne se lit plus', () => {
    const beaucoup = Array.from({ length: 12 }, (_, rang) => entree({
      name: `Bar ${rang}`,
      address: { amenity: `Bar ${rang}`, postcode: '35000', city: 'Rennes' }
    }));
    expect(resultatsDeRecherche(beaucoup)).toHaveLength(5);
  });

  it('accepte une réponse inattendue sans se rompre', () => {
    // Le réseau rend parfois autre chose que ce qu'on attend ; le formulaire
    // doit rester utilisable.
    expect(resultatsDeRecherche(null)).toEqual([]);
    expect(resultatsDeRecherche({})).toEqual([]);
    expect(resultatsDeRecherche('erreur')).toEqual([]);
    expect(resultatsDeRecherche([null, 'x', 42])).toEqual([]);
  });
});

describe('Ce qui est écrit sur la charge', () => {
  it('porte le nom, la commune et le code postal', () => {
    const [choisi] = resultatsDeRecherche([entree()]);
    const lieu = lieuAEcrire(choisi);

    expect(lieu.name).toBe('Le Bistrot, 35000 Rennes');
    expect(lieu.commune).toBe('Rennes');
    expect(lieu.codePostal).toBe('35000');
    expect(lieu.lat).toBeCloseTo(48.1113, 4);
  });

  it('ne porte pas d\'horodatage', () => {
    // La saisie rapide y met l'instant où le GPS a rendu la position — une
    // mesure. Un lieu choisi dans une liste n'a pas d'instant : y écrire
    // l'heure du choix laisserait croire qu'on y était.
    const [choisi] = resultatsDeRecherche([entree()]);
    expect(lieuAEcrire(choisi)).not.toHaveProperty('timestamp');
  });

  it('n\'écrit pas de clé vide pour une commune absente', () => {
    // Firebase refuse `undefined`, et une clé vide encombre sans rien dire.
    const lieu = lieuAEcrire({ etiquette: 'Quelque part', lat: 48.1, lng: -1.6 });
    expect(lieu).not.toHaveProperty('commune');
    expect(lieu).not.toHaveProperty('codePostal');
    expect(lieu.name).toBe('Quelque part');
  });

  it('tronque un libellé au-delà de ce que les règles acceptent', () => {
    // `location.name` est borné à 200 caractères : au-delà, Firebase refuserait
    // l'écriture de la charge entière.
    const lieu = lieuAEcrire({ etiquette: 'x'.repeat(300), lat: 48.1, lng: -1.6 });
    expect(lieu.name).toHaveLength(200);
  });

  it('refuse ce qui n\'est pas plaçable', () => {
    expect(lieuAEcrire(null)).toBeNull();
    expect(lieuAEcrire({ etiquette: 'Sans coordonnées' })).toBeNull();
    expect(lieuAEcrire({ etiquette: 'Hors bornes', lat: 91, lng: 0 })).toBeNull();
    expect(lieuAEcrire({ etiquette: '   ', lat: 48.1, lng: -1.6 })).toBeNull();
  });
});

describe('Quand interroger le service', () => {
  it('pas avant trois caractères', () => {
    // Nominatim est gratuit et plafonné à une requête par seconde. Deux lettres
    // ne désignent aucun lieu, et la réponse arriverait après la suivante.
    expect(requeteUtile('')).toBe(false);
    expect(requeteUtile('L')).toBe(false);
    expect(requeteUtile('Le')).toBe(false);
    expect(requeteUtile('  Le  ')).toBe(false);
    expect(requeteUtile('Bar')).toBe(true);
  });

  it('ne se laisse pas surprendre par autre chose qu\'un texte', () => {
    expect(requeteUtile(null)).toBe(false);
    expect(requeteUtile(undefined)).toBe(false);
    expect(requeteUtile(123)).toBe(false);
  });
});
