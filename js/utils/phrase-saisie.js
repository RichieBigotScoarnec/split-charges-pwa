/**
 * FairSplit — Ce qui sera enregistré, dit en une phrase
 *
 * La saisie rapide demandait quatre choix empilés : une grille de neuf
 * catégories, une ligne de raccourcis qui en répétait certaines, un choix de
 * payeur, un choix de répartition. Le bloc catégorie occupait à lui seul la
 * majeure partie de la modale, et le payeur — le champ qui décide *qui doit
 * combien*, dans une application dont c'est tout l'objet — se trouvait en
 * dessous. On y arrivait en faisant défiler neuf tuiles, donc en pratique on ne
 * le vérifiait pas.
 *
 * Splitwise, Tricount et Settle Up procèdent tous autrement, et de la même
 * façon : le chemin rapide ne demande que le montant, et chaque autre choix est
 * un défaut énoncé sous forme de phrase qu'on peut toucher. Le gain n'est pas
 * seulement d'épargner des gestes — c'est que la phrase **montre** ce qui sera
 * enregistré. Quatre blocs empilés ne le montrent pas : ils obligent à
 * reconstituer de tête l'état de quatre contrôles.
 *
 * Ce module fabrique cette phrase. Il ne touche à rien : il lit un état et rend
 * des libellés, ce qui le rend vérifiable sans navigateur et sans Firebase.
 */

import { memberLabel } from './members.js';
import { formatDate, dateDuJour, heureValide } from './date.js';

/**
 * Les segments de la phrase, dans l'ordre où ils se lisent
 *
 * L'ordre n'est pas indifférent. Le payeur vient en premier parce que c'est lui
 * qui change la réponse : une dépense attribuée à la mauvaise personne est
 * comptée à l'envers dans le bilan. La date vient en dernier parce qu'elle est
 * juste neuf fois sur dix.
 *
 * @param {Object} etat - `quickAddState` : { paidBy, splitMode, selectedCategory }
 * @param {Object} [options]
 * @param {Object} [options.members] - Prénoms du foyer, pour `memberLabel`
 * @param {string} [options.date] - Date saisie, au format `AAAA-MM-JJ`
 * @param {string} [options.heure] - Heure saisie, au format `HH:MM`
 * @param {string} [options.aujourdhui] - Injectable pour les bancs d'essai
 * @returns {Array<{cle: string, texte: string, panneau: string}>}
 */
export function segmentsDeLaPhrase(etat = {}, options = {}) {
  const members = options.members || null;
  const aujourdhui = options.aujourdhui || dateDuJour();

  const segments = [
    { cle: 'payeur', texte: libellePayeur(etat.paidBy, members), panneau: 'quickAddPanneauPayeur' },
    { cle: 'repartition', texte: libelleRepartition(etat.splitMode), panneau: 'quickAddPanneauRepartition' },
    { cle: 'categorie', texte: libelleCategorie(etat.selectedCategory), panneau: 'quickAddPanneauCategorie' },
    { cle: 'date', texte: libelleDate(options.date, aujourdhui, options.heure), panneau: 'quickAddPanneauDate' }
  ];

  // L'enveloppe, seulement si le foyer en a.
  //
  // Les deux formulaires complets proposaient un rattachement, la saisie rapide
  // non — c'est-à-dire pas au moment où l'on en a le plus besoin : en vacances,
  // en trois gestes. Mais un cinquième segment permanent encombrerait la phrase
  // de tous ceux qui ne s'en servent pas, et l'absence d'enveloppe est l'état
  // de départ du foyer.
  const enveloppes = Array.isArray(options.enveloppes) ? options.enveloppes : [];
  if (enveloppes.length > 0) {
    segments.push({
      cle: 'enveloppe',
      texte: libelleEnveloppe(etat.envelope, enveloppes),
      panneau: 'quickAddPanneauEnveloppe'
    });
  }

  return segments;
}

/**
 * À quelle enveloppe la dépense se rattache
 *
 * @param {string|null} id - Enveloppe choisie
 * @param {Array<Object>} enveloppes - Enveloppes proposables
 * @returns {string}
 */
export function libelleEnveloppe(id, enveloppes) {
  const trouvee = (Array.isArray(enveloppes) ? enveloppes : []).find(e => e && e.id === id);
  // « Sans enveloppe » plutôt qu'un segment vide : le bouton doit dire ce qu'il
  // ouvre, y compris à la synthèse vocale, où il n'a pas la phrase autour.
  return trouvee ? `${trouvee.icon} ${trouvee.label}` : 'Sans enveloppe';
}

/**
 * Qui a payé
 *
 * « Payé par » est répété dans chaque segment plutôt que sorti en préfixe : les
 * segments sont des boutons, et un bouton dont le libellé est « Vous » seul ne
 * dit rien à qui l'atteint à la synthèse vocale, où il n'a pas la phrase autour.
 *
 * @param {string} paidBy - 'vous' | 'conjointe' | 'partage'
 * @param {Object|null} members
 * @returns {string}
 */
export function libellePayeur(paidBy, members) {
  if (paidBy === 'partage') return 'Payé à deux';

  const cle = paidBy === 'conjointe' ? 'conjointe' : 'vous';
  const nom = members ? memberLabel(cle, members) : (cle === 'conjointe' ? 'Conjointe' : 'Vous');

  return `Payé par ${nom}`;
}

/**
 * Comment la dépense se partage
 * @param {string} splitMode - 'prorata' | '50-50'
 * @returns {string}
 */
export function libelleRepartition(splitMode) {
  // « Perso » n'est pas une répartition mais son absence, et la phrase doit le
  // dire en toutes lettres : c'est le seul choix des trois qui retire la
  // dépense du solde, et le seul dont l'effet est invisible ailleurs.
  if (splitMode === 'perso') return 'Perso, hors solde';
  return splitMode === '50-50' ? 'Partagé 50-50' : 'Au prorata';
}

/**
 * La catégorie, ou son absence
 *
 * Sans catégorie, le segment ne dit pas « aucune » : il dit ce qu'il faut
 * faire. C'est le seul champ que la soumission exige, et un segment qui invite
 * vaut mieux qu'un bouton désactivé — lequel n'émet rien au toucher et laisse
 * croire à une panne.
 *
 * @param {Object|null} categorie - { icon, label }
 * @returns {string}
 */
export function libelleCategorie(categorie) {
  if (!categorie || !categorie.label) return 'Choisir une catégorie';

  return categorie.icon ? `${categorie.icon} ${categorie.label}` : categorie.label;
}

/**
 * La date de la dépense
 *
 * « Aujourd'hui » plutôt que la date du jour écrite en clair : c'est le cas de
 * loin le plus fréquent, et le mot se lit sans être déchiffré. Une date
 * différente s'écrit en entier, puisque c'est justement elle qu'on veut
 * vérifier.
 *
 * L'heure s'y ajoute quand il y en a une. Elle allonge le segment de six
 * caractères, et c'est le prix à payer : la phrase est le seul endroit qui dise
 * ce qui sera enregistré, et une heure tue s'inscrirait sans que personne ne
 * l'ait vue passer.
 *
 * @param {string} date - Format `AAAA-MM-JJ`
 * @param {string} aujourdhui - Format `AAAA-MM-JJ`
 * @param {string} [heure] - Format `HH:MM` ; le segment s'en passe si elle manque
 * @returns {string}
 */
export function libelleDate(date, aujourdhui, heure) {
  const jour = (!date || date === aujourdhui)
    ? "Aujourd'hui"
    : (formatDate(date) || "Aujourd'hui");

  const moment = heureValide(heure);
  return moment ? `${jour} à ${moment}` : jour;
}
