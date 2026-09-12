/**
 * FairSplit — Comparer deux textes comme on les prononce
 *
 * La recherche comparait `champ.toLowerCase().includes(requete.toLowerCase())`.
 * En français, cela revient à exiger les accents :
 *
 *   « intermarche » ne trouvait pas « Intermarché »
 *   « electricite » ne trouvait pas « Électricité »
 *   « creche »      ne trouvait pas « Crèche »
 *
 * Sur un clavier de téléphone, l'accent demande un appui long. Personne ne le
 * fait pour chercher : l'application répondait donc « 0 résultat » sur des
 * charges bien présentes, ce qui se lit comme une donnée perdue.
 *
 * Le pliage retire les signes diacritiques par décomposition Unicode : « é »
 * devient « e » suivi d'un accent combinant, que l'on écarte. La longueur du
 * texte est préservée pour les caractères précomposés du français, ce qui
 * permettrait à un surlignage ultérieur de retomber sur ses indices.
 */

/**
 * Plie un texte : minuscules et sans accents
 *
 * Les espaces sont conservés — « chez le boulanger » se cherche tel quel, et
 * les rogner ferait diverger la longueur du texte plié de celle de l'original.
 *
 * @param {*} valeur - Texte supposé
 * @returns {string} Texte pliable, ou chaîne vide si la valeur n'en est pas un
 */
export function plier(valeur) {
  if (typeof valeur !== 'string') return '';

  return valeur
    .normalize('NFD')
    // Bloc « Combining Diacritical Marks » : c'est là que se rangent l'accent
    // aigu, le grave, la cédille et le tréma une fois le caractère décomposé.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Un champ contient-il la requête, accents et casse mis de côté ?
 *
 * Une requête vide ne correspond à rien plutôt qu'à tout : `includes('')` est
 * toujours vrai, et la recherche rendrait la totalité des charges dès que le
 * champ est effacé.
 *
 * @param {*} champ - Valeur affichée à l'écran
 * @param {*} requete - Texte saisi
 * @returns {boolean}
 */
export function contient(champ, requete) {
  const aiguille = plier(requete);
  if (!aiguille) return false;

  return plier(champ).includes(aiguille);
}
