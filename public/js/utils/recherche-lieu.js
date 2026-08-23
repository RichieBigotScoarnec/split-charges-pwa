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
 * Ce module ne touche pas au réseau : il met en forme une réponse déjà reçue,
 * ce qui le rend vérifiable sur des réponses réelles enregistrées.
 */

/** Au-delà, la liste ne se lit plus : elle se subit */
const MAXIMUM = 5;

/**
 * Met en forme une réponse de recherche Nominatim
 *
 * Les résultats sans coordonnées exploitables sont écartés : un lieu qu'on ne
 * peut pas placer sur la carte n'a pas sa place dans une liste dont c'est
 * l'objet. Les doublons d'étiquette le sont aussi — Nominatim rend volontiers
 * plusieurs entrées pour un même établissement, et deux lignes identiques
 * obligent à choisir sans rien pour départager.
 *
 * @param {*} reponse - Corps JSON de `/search`, un tableau
 * @returns {Array<{etiquette: string, nom: string, commune: string, codePostal: string, lat: number, lng: number}>}
 */
export function resultatsDeRecherche(reponse) {
  if (!Array.isArray(reponse)) return [];

  const vues = new Set();
  const resultats = [];

  for (const brut of reponse) {
    if (!brut || typeof brut !== 'object') continue;

    const lat = Number.parseFloat(brut.lat);
    const lng = Number.parseFloat(brut.lon);
    if (!coordonneeValide(lat, 90) || !coordonneeValide(lng, 180)) continue;

    const decrit = decrireLieu(brut);
    if (!decrit) continue;

    if (vues.has(decrit.etiquette)) continue;
    vues.add(decrit.etiquette);

    resultats.push({
      etiquette: decrit.etiquette,
      nom: decrit.nom,
      commune: decrit.commune,
      codePostal: decrit.codePostal,
      lat,
      lng
    });

    if (resultats.length >= MAXIMUM) break;
  }

  return resultats;
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
