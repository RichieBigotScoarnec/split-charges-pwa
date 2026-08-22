/**
 * FairSplit — Ce qu'on retient d'une position
 *
 * Le géocodage inversé ne gardait que le nom de l'enseigne. « Brioche Dorée »
 * désigne des centaines d'établissements : la dépense était donc enregistrée
 * sous un libellé qui ne permet pas de savoir où elle a eu lieu — et sur une
 * carte, un marqueur sans adresse n'apprend rien de plus que sa position.
 *
 * Nominatim renvoie pourtant le code postal et la commune dans le même appel.
 * Encore fallait-il les demander (`addressdetails=1`) et les lire.
 *
 * Le code postal et la commune suffisent à lever l'ambiguïté, et une étiquette
 * se lit dans une liste de charges : la rue n'y est donc pas reprise. Elle sert
 * uniquement de repli quand le lieu n'a pas de nom, faute de quoi l'étiquette
 * se réduirait à une commune, qui n'identifie rien.
 *
 * Ce module ne fait que mettre en forme : il ne touche pas au réseau, ce qui
 * le rend vérifiable sur des réponses réelles enregistrées.
 */

/**
 * Clés sous lesquelles Nominatim range la commune, du plus précis au plus
 * large. Une adresse rurale n'a ni `city` ni `town`, seulement `village`.
 */
const CLES_COMMUNE = ['city', 'town', 'village', 'municipality', 'hamlet'];

/**
 * Clés sous lesquelles Nominatim range le nom du lieu lui-même. Il le place
 * sous la clé de sa classe : une boulangerie arrive sous `shop`, un restaurant
 * sous `amenity`.
 */
const CLES_NOM = ['shop', 'amenity', 'building', 'tourism', 'leisure', 'office'];

/**
 * Premier texte non vide d'une liste
 * @param {Array<*>} valeurs
 * @returns {string} Texte trouvé, chaîne vide sinon
 */
function premierTexte(valeurs) {
  for (const valeur of valeurs) {
    if (typeof valeur === 'string' && valeur.trim()) return valeur.trim();
  }
  return '';
}

/**
 * Met en forme une réponse de géocodage inversé Nominatim.
 *
 * @param {Object|null} reponse - Corps JSON de `/reverse`
 * @returns {{nom: string, commune: string, codePostal: string, ville: string,
 *            etiquette: string, type: string, adresseComplete: string}|null}
 *          null si la réponse ne porte rien d'exploitable
 */
export function decrireLieu(reponse) {
  if (!reponse || typeof reponse !== 'object') return null;

  const adresse = (reponse.address && typeof reponse.address === 'object') ? reponse.address : {};

  const nom = premierTexte([reponse.name, ...CLES_NOM.map(cle => adresse[cle])]);
  const voie = premierTexte([adresse.road, adresse.pedestrian, adresse.footway]);
  const numero = premierTexte([adresse.house_number]);
  const rue = [numero, voie].filter(Boolean).join(' ');

  const commune = premierTexte(CLES_COMMUNE.map(cle => adresse[cle]));
  const codePostal = premierTexte([adresse.postcode]);
  const ville = [codePostal, commune].filter(Boolean).join(' ');

  // La rue ne sert que faute de nom : « 35000 Rennes » seul n'identifierait
  // aucune dépense.
  const etiquette = [nom || rue, ville].filter(Boolean).join(', ');

  if (!etiquette) return null;

  return {
    nom,
    commune,
    codePostal,
    ville,
    etiquette,
    type: premierTexte([reponse.type]),
    adresseComplete: premierTexte([reponse.display_name])
  };
}
