import { decrireLieu } from './lieu.js';

/**
 * Chercher un lieu par son nom, plutôt que par sa position
 *
 * Le GPS ne sait dire qu'une chose : où l'on est maintenant. C'est ce qu'il
 * faut au moment de payer, et c'est inutile ensuite — un verre bu hier soir se
 * note souvent le lendemain, depuis chez soi, et la position du téléphone
 * désigne alors le domicile.
 *
 * Nominatim répond aussi à la question inverse : « Le Bistrot Rennes » rend une
 * liste de lieux avec leurs coordonnées. La même mise en forme s'applique —
 * `decrireLieu` lit indifféremment une réponse de `/reverse` et un élément de
 * `/search`, tous deux portant `name`, `address` et `type`.
 *
 * Reste que « où étions-nous » se pose toujours près de chez soi. Nominatim,
 * lui, répond pour la planète entière et classe par notoriété : demander
 * « Caffe Mamma » depuis Argelès-sur-Mer rendait New York. Ce module sait donc
 * aussi fabriquer le cadre à interroger autour d'un point, et classer les
 * réponses par distance.
 *
 * Ce module ne touche pas au réseau : il met en forme une réponse déjà reçue,
 * ce qui le rend vérifiable sur des réponses réelles enregistrées.
 */

/** Au-delà, la liste ne se lit plus : elle se subit */
const MAXIMUM = 5;

/** Rayon moyen de la Terre, en kilomètres */
const RAYON_TERRE_KM = 6371;

/**
 * Degrés de latitude par kilomètre
 *
 * Un degré de latitude vaut la même distance partout : le méridien fait
 * 40 008 km pour 360°, soit 111,13 km par degré.
 */
const DEGRES_LAT_PAR_KM = 1 / 111.13;

/**
 * Met en forme une réponse de recherche Nominatim
 *
 * Les résultats sans coordonnées exploitables sont écartés : un lieu qu'on ne
 * peut pas placer sur la carte n'a pas sa place dans une liste dont c'est
 * l'objet. Les doublons d'étiquette le sont aussi — Nominatim rend volontiers
 * plusieurs entrées pour un même établissement, et deux lignes identiques
 * obligent à choisir sans rien pour départager.
 *
 * Avec un centre, la liste est classée du plus proche au plus lointain. C'est
 * l'ordre de Nominatim qui posait problème à l'usage : il classe par
 * « importance » — une notoriété mondiale — et rendait donc un homonyme de New
 * York avant le bar d'à côté. Le classement précède la coupe à cinq, faute de
 * quoi trier ne servirait à rien : les cinq lointains seraient déjà retenus.
 *
 * @param {*} reponse - Corps JSON de `/search`, un tableau
 * @param {{centre?: {lat: number, lng: number}}} [options]
 * @returns {Array<{etiquette: string, nom: string, commune: string, codePostal: string, lat: number, lng: number, distanceKm?: number}>}
 */
export function resultatsDeRecherche(reponse, options = {}) {
  if (!Array.isArray(reponse)) return [];

  const centre = pointValide(options && options.centre) ? options.centre : null;
  const candidats = [];

  for (const brut of reponse) {
    if (!brut || typeof brut !== 'object') continue;

    const lat = Number.parseFloat(brut.lat);
    const lng = Number.parseFloat(brut.lon);
    if (!coordonneeValide(lat, 90) || !coordonneeValide(lng, 180)) continue;

    const decrit = decrireLieu(brut);
    if (!decrit) continue;

    const candidat = {
      etiquette: decrit.etiquette,
      nom: decrit.nom,
      commune: decrit.commune,
      codePostal: decrit.codePostal,
      lat,
      lng
    };

    if (centre) candidat.distanceKm = distanceKm(centre, candidat);

    candidats.push(candidat);
  }

  // Sans centre, on ne trie pas du tout : l'ordre de Nominatim est alors le
  // seul dont on dispose, et le laisser intact garde ce module prévisible.
  if (centre) candidats.sort((a, b) => a.distanceKm - b.distanceKm);

  // La déduplication vient après le tri : de deux entrées d'étiquette
  // identique, on garde ainsi la plus proche, et non la première venue.
  const vues = new Set();
  const resultats = [];

  for (const candidat of candidats) {
    if (vues.has(candidat.etiquette)) continue;
    vues.add(candidat.etiquette);
    resultats.push(candidat);
    if (resultats.length >= MAXIMUM) break;
  }

  return resultats;
}

/**
 * Distance à vol d'oiseau entre deux points, en kilomètres (formule de
 * haversine)
 *
 * La précision d'une sphère suffit largement ici : on classe des propositions
 * et on affiche « à 3 km », pas de quoi justifier un ellipsoïde.
 *
 * @param {{lat: number, lng: number}} a
 * @param {{lat: number, lng: number}} b
 * @returns {number} Distance en km, `Infinity` si un point est inexploitable
 */
export function distanceKm(a, b) {
  if (!pointValide(a) || !pointValide(b)) return Infinity;

  const enRadians = (degres) => (degres * Math.PI) / 180;

  const dLat = enRadians(b.lat - a.lat);
  const dLng = enRadians(b.lng - a.lng);

  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(enRadians(a.lat)) * Math.cos(enRadians(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Le cadre à passer à Nominatim pour chercher autour d'un point
 *
 * Le paramètre `viewbox` attend quatre nombres dans l'ordre
 * `longitudeOuest,latitudeSud,longitudeEst,latitudeNord`. Un degré de longitude
 * rétrécit avec la latitude — 111 km à l'équateur, la moitié à 60° — d'où le
 * cosinus : sans lui, la boîte serait deux fois trop étroite en Bretagne et
 * absurde près des pôles.
 *
 * @param {{lat: number, lng: number}} centre
 * @param {number} rayonKm - Demi-côté de la boîte
 * @returns {string|null} Valeur du paramètre `viewbox`, null si le centre ne vaut rien
 */
export function boiteDeRecherche(centre, rayonKm) {
  if (!pointValide(centre)) return null;
  if (!Number.isFinite(rayonKm) || rayonKm <= 0) return null;

  const marcheLat = rayonKm * DEGRES_LAT_PAR_KM;

  // Près des pôles le cosinus tend vers zéro et la marge exploserait : on la
  // borne, quitte à couvrir plus large que demandé là où personne n'habite.
  const cosinus = Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.01);
  const marcheLng = (rayonKm * DEGRES_LAT_PAR_KM) / cosinus;

  const sud = Math.max(-90, centre.lat - marcheLat);
  const nord = Math.min(90, centre.lat + marcheLat);

  // Une boîte qui déborde l'antiméridien ne se décrit pas avec deux bornes :
  // plutôt que d'en rendre une fausse, on couvre alors tout le tour.
  const deborde = marcheLng >= 180 || centre.lng - marcheLng < -180 || centre.lng + marcheLng > 180;
  const ouest = deborde ? -180 : centre.lng - marcheLng;
  const est = deborde ? 180 : centre.lng + marcheLng;

  return [ouest, sud, est, nord].map(nombre => nombre.toFixed(6)).join(',');
}

/**
 * Distance telle qu'elle se lit sous une proposition
 *
 * Sous le kilomètre, les mètres parlent seuls — « 0,3 km » se lit deux fois.
 * Au-delà de dix, la décimale ne renseigne plus personne.
 *
 * @param {number} km
 * @returns {string} Chaîne vide si la distance n'est pas exploitable
 */
export function distanceLisible(km) {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/**
 * Un point est-il exploitable comme centre ou comme destination ?
 * @param {*} point
 * @returns {boolean}
 */
function pointValide(point) {
  if (!point || typeof point !== 'object') return false;
  return coordonneeValide(point.lat, 90) && coordonneeValide(point.lng, 180);
}

/**
 * Une coordonnée est-elle exploitable ?
 *
 * `parseFloat` rend `NaN` sur une chaîne vide comme sur du texte, et les règles
 * de sécurité refusent tout ce qui sort des bornes : autant l'écarter ici, où
 * l'on peut encore proposer autre chose, plutôt qu'à l'écriture.
 *
 * @param {number} valeur
 * @param {number} borne - 90 pour une latitude, 180 pour une longitude
 * @returns {boolean}
 */
function coordonneeValide(valeur, borne) {
  return Number.isFinite(valeur) && valeur >= -borne && valeur <= borne;
}

/**
 * Le lieu à écrire sur une charge, à partir d'un résultat choisi
 *
 * `timestamp` est délibérément absent. La saisie rapide y met l'instant où le
 * GPS a rendu la position — une mesure. Un lieu choisi dans une liste n'a pas
 * d'instant : y écrire l'heure du choix laisserait croire qu'on y était.
 * Personne ne lit ce champ, et une valeur fausse vaut moins que rien.
 *
 * @param {Object} resultat - Entrée rendue par `resultatsDeRecherche`
 * @returns {{lat: number, lng: number, name: string, commune?: string, codePostal?: string}|null}
 */
export function lieuAEcrire(resultat) {
  if (!resultat || typeof resultat !== 'object') return null;
  if (!coordonneeValide(resultat.lat, 90) || !coordonneeValide(resultat.lng, 180)) return null;

  const etiquette = typeof resultat.etiquette === 'string' ? resultat.etiquette.trim() : '';
  if (!etiquette) return null;

  const lieu = {
    lat: resultat.lat,
    lng: resultat.lng,
    // Les règles bornent `name` à 200 caractères : tronquer ici évite un refus
    // d'écriture pour un libellé exceptionnellement long.
    name: etiquette.slice(0, 200)
  };

  if (resultat.commune) lieu.commune = resultat.commune;
  if (resultat.codePostal) lieu.codePostal = resultat.codePostal;

  return lieu;
}

/**
 * Une recherche vaut-elle la peine d'être envoyée ?
 *
 * Nominatim est un service gratuit dont l'usage est plafonné à une requête par
 * seconde. Interroger à chaque frappe le saturerait pour rien : deux lettres ne
 * désignent aucun lieu, et la réponse arriverait après la suivante.
 *
 * @param {string} saisie
 * @returns {boolean}
 */
export function requeteUtile(saisie) {
  return typeof saisie === 'string' && saisie.trim().length >= 3;
}
