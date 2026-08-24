import { describe, it, expect } from 'vitest';
import {
  resultatsDeRecherche,
  lieuAEcrire,
  requeteUtile,
  distanceKm,
  boiteDeRecherche,
  distanceLisible
} from '../../public/js/utils/recherche-lieu.js';

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

/**
 * Chercher là où l'on se trouve
 *
 * Signalé à l'usage : « je lui mets le Caffe Mamma qui se situe à
 * Argelès-sur-Mer mais il me met des villes lointaines comme à New York ».
 * Nominatim classe par notoriété, pas par proximité — sans lui dire où
 * chercher, il répond pour la planète.
 */

/** Quelques points réels, pour ne pas raisonner sur des nombres inventés */
const ARGELES = { lat: 42.5450, lng: 3.0244 };
const COLLIOURE = { lat: 42.5250, lng: 3.0830 };
const PERPIGNAN = { lat: 42.6986, lng: 2.8956 };
const NEW_YORK = { lat: 40.7128, lng: -74.0060 };
const RENNES = { lat: 48.1113, lng: -1.6800 };
const PARIS = { lat: 48.8566, lng: 2.3522 };

describe('Distance entre deux points', () => {
  it('retrouve une distance connue', () => {
    // Rennes–Paris à vol d'oiseau : environ 309 km. Un test qui ne se compare
    // qu'à lui-même ne prouverait que la stabilité de la formule, pas sa
    // justesse.
    expect(distanceKm(RENNES, PARIS)).toBeCloseTo(308.5, 0);
  });

  it('rend zéro pour un point et lui-même, et ne dépend pas du sens', () => {
    expect(distanceKm(ARGELES, ARGELES)).toBe(0);
    expect(distanceKm(ARGELES, NEW_YORK)).toBeCloseTo(distanceKm(NEW_YORK, ARGELES), 6);
  });

  it('tient compte du rétrécissement des méridiens', () => {
    // Un degré de longitude vaut 111 km à l'équateur et la moitié à 60°. Une
    // formule qui l'ignorerait rendrait la même distance dans les deux cas.
    const aLEquateur = distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    const aSoixante = distanceKm({ lat: 60, lng: 0 }, { lat: 60, lng: 1 });
    expect(aSoixante).toBeCloseTo(aLEquateur / 2, 0);
  });

  it('rend l\'infini plutôt qu\'un nombre faux sur un point inexploitable', () => {
    expect(distanceKm(null, ARGELES)).toBe(Infinity);
    expect(distanceKm(ARGELES, { lat: 'ici', lng: 3 })).toBe(Infinity);
    expect(distanceKm(ARGELES, { lat: 200, lng: 3 })).toBe(Infinity);
  });
});

/** Lit une `viewbox` Nominatim : ouest, sud, est, nord */
function lireBoite(valeur) {
  const [ouest, sud, est, nord] = String(valeur).split(',').map(Number);
  return { ouest, sud, est, nord };
}

/** Le point tombe-t-il dans la boîte ? */
function dansLaBoite(boite, point) {
  return point.lng >= boite.ouest && point.lng <= boite.est
    && point.lat >= boite.sud && point.lat <= boite.nord;
}

describe('Le cadre passé à Nominatim', () => {
  it('rend quatre nombres dans l\'ordre attendu', () => {
    // `viewbox` attend longitudeOuest,latitudeSud,longitudeEst,latitudeNord.
    // Deux nombres intervertis, et la boîte désigne un autre continent.
    const boite = lireBoite(boiteDeRecherche(ARGELES, 60));

    expect(boite.ouest).toBeLessThan(boite.est);
    expect(boite.sud).toBeLessThan(boite.nord);
    expect(boite.sud).toBeLessThan(ARGELES.lat);
    expect(boite.nord).toBeGreaterThan(ARGELES.lat);
    expect(boite.ouest).toBeLessThan(ARGELES.lng);
    expect(boite.est).toBeGreaterThan(ARGELES.lng);
  });

  it('couvre la journée sans couvrir le pays', () => {
    const boite = lireBoite(boiteDeRecherche(ARGELES, 60));

    // Collioure est à 5 km, Perpignan à 20 : deux endroits où l'on va boire un
    // verre depuis Argelès.
    expect(dansLaBoite(boite, COLLIOURE)).toBe(true);
    expect(dansLaBoite(boite, PERPIGNAN)).toBe(true);

    // New York et Paris n'ont rien à y faire — c'est tout l'objet.
    expect(dansLaBoite(boite, NEW_YORK)).toBe(false);
    expect(dansLaBoite(boite, PARIS)).toBe(false);
  });

  it('élargit la boîte en longitude à mesure qu\'on monte vers le nord', () => {
    // Sans le cosinus, la boîte serait deux fois trop étroite à 60°, et un lieu
    // à 55 km à l'est en tomberait dehors alors qu'on le cherche.
    const auNord = lireBoite(boiteDeRecherche({ lat: 60, lng: 0 }, 60));
    const aLEquateur = lireBoite(boiteDeRecherche({ lat: 0, lng: 0 }, 60));

    expect(auNord.est).toBeCloseTo(aLEquateur.est * 2, 1);

    // 55 km plein est à 60° de latitude : dedans.
    const voisin = { lat: 60, lng: 55 / (111.13 * Math.cos((60 * Math.PI) / 180)) };
    expect(distanceKm({ lat: 60, lng: 0 }, voisin)).toBeCloseTo(55, 0);
    expect(dansLaBoite(auNord, voisin)).toBe(true);
  });

  it('ne rend pas de bornes absurdes près des pôles', () => {
    const boite = lireBoite(boiteDeRecherche({ lat: 89.9, lng: 0 }, 60));

    expect(Number.isFinite(boite.ouest)).toBe(true);
    expect(boite.ouest).toBeGreaterThanOrEqual(-180);
    expect(boite.est).toBeLessThanOrEqual(180);
    expect(boite.nord).toBeLessThanOrEqual(90);
  });

  it('refuse de cadrer ce qui ne se cadre pas', () => {
    expect(boiteDeRecherche(null, 60)).toBeNull();
    expect(boiteDeRecherche({ lat: 'ici', lng: 3 }, 60)).toBeNull();
    expect(boiteDeRecherche(ARGELES, 0)).toBeNull();
    expect(boiteDeRecherche(ARGELES, -10)).toBeNull();
  });
});

/** Une entrée Nominatim posée à un endroit donné */
const entreeA = (nom, point) => ({
  lat: String(point.lat),
  lon: String(point.lng),
  name: nom,
  type: 'cafe',
  address: { amenity: nom, city: 'Ailleurs' }
});

describe('Classement par proximité', () => {
  it('rend le lieu d\'à côté avant son homonyme lointain', () => {
    // Le cas signalé, dans l'ordre où Nominatim l'avait rendu : New York
    // d'abord, parce que plus « important ».
    const resultats = resultatsDeRecherche([
      entreeA('Caffe Mamma', NEW_YORK),
      entreeA('Caffe Mamma', COLLIOURE)
    ], { centre: ARGELES });

    expect(resultats[0].nom).toBe('Caffe Mamma');
    expect(resultats[0].lat).toBeCloseTo(COLLIOURE.lat, 3);
    expect(resultats[0].distanceKm).toBeLessThan(10);
  });

  it('classe avant de couper à cinq, sans quoi trier ne servirait à rien', () => {
    // Six lointains puis un proche : couper d'abord retiendrait les six
    // premiers et perdrait le seul qui compte.
    const reponse = [
      ...Array.from({ length: 6 }, (_, rang) => entreeA(`Loin ${rang}`, NEW_YORK)),
      entreeA('Le bar d\'à côté', COLLIOURE)
    ];

    const resultats = resultatsDeRecherche(reponse, { centre: ARGELES });

    expect(resultats).toHaveLength(5);
    expect(resultats[0].nom).toBe('Le bar d\'à côté');
  });

  it('de deux entrées identiques, garde la plus proche', () => {
    const resultats = resultatsDeRecherche([
      entreeA('Le Bistrot', PARIS),
      entreeA('Le Bistrot', PERPIGNAN)
    ], { centre: ARGELES });

    expect(resultats).toHaveLength(1);
    expect(resultats[0].lat).toBeCloseTo(PERPIGNAN.lat, 3);
  });

  it('mesure la distance depuis le centre donné', () => {
    const [proposition] = resultatsDeRecherche([entreeA('Caffe Mamma', NEW_YORK)], { centre: ARGELES });
    expect(proposition.distanceKm).toBeCloseTo(6172, -2);
  });

  it('sans centre, ne touche à rien', () => {
    // Sur un ordinateur sans GPS et sans dépense localisée, on ne sait pas où
    // l'utilisateur se trouve : inventer un centre classerait au hasard.
    const resultats = resultatsDeRecherche([
      entreeA('Premier', NEW_YORK),
      entreeA('Second', COLLIOURE)
    ]);

    expect(resultats[0].nom).toBe('Premier');
    expect(resultats[0]).not.toHaveProperty('distanceKm');
  });

  it('ignore un centre inexploitable plutôt que de classer sur du vide', () => {
    const resultats = resultatsDeRecherche([
      entreeA('Premier', NEW_YORK),
      entreeA('Second', COLLIOURE)
    ], { centre: { lat: null, lng: undefined } });

    expect(resultats[0].nom).toBe('Premier');
    expect(resultats[0]).not.toHaveProperty('distanceKm');
  });

  it('la distance ne part pas dans Firebase', () => {
    // Les règles ferment les clés inconnues sous `location` : une charge
    // portant `distanceKm` serait refusée à l'écriture.
    const [proposition] = resultatsDeRecherche([entreeA('Caffe Mamma', COLLIOURE)], { centre: ARGELES });
    expect(proposition.distanceKm).toBeGreaterThan(0);
    expect(lieuAEcrire(proposition)).not.toHaveProperty('distanceKm');
  });
});

describe('Distance telle qu\'elle se lit', () => {
  it('passe aux mètres sous le kilomètre', () => {
    // « 0,3 km » se lit deux fois ; « 300 m », une seule.
    expect(distanceLisible(0.3)).toBe('300 m');
    expect(distanceLisible(0.045)).toBe('45 m');
    expect(distanceLisible(0)).toBe('0 m');
  });

  it('garde une décimale sur les courtes distances, avec une virgule', () => {
    expect(distanceLisible(3.14)).toBe('3,1 km');
    expect(distanceLisible(5.291)).toBe('5,3 km');
  });

  it('arrondit au-delà de dix kilomètres', () => {
    expect(distanceLisible(20.4)).toBe('20 km');
    expect(distanceLisible(6171.54)).toBe('6172 km');
  });

  it('ne dit rien plutôt que de dire faux', () => {
    expect(distanceLisible(undefined)).toBe('');
    expect(distanceLisible(NaN)).toBe('');
    expect(distanceLisible(Infinity)).toBe('');
    expect(distanceLisible(-3)).toBe('');
  });
});
