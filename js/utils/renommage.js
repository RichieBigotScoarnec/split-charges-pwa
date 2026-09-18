/**
 * FairSplit — Renommer une catégorie ou une destination sans détacher l'histoire
 *
 * Les deux boutons de l'écran annonçaient « Ajouter, renommer ou retirer ».
 * L'écran, lui, ne savait qu'ajouter et retirer : corriger « Restaurent »
 * imposait de supprimer et recréer, ce qui laissait toutes les charges passées
 * rattachées à un libellé qui n'existait plus.
 *
 * Car c'est là le point délicat : une charge ne porte pas l'identifiant de sa
 * catégorie, elle en porte le **libellé** — `charge.category` vaut « Courses »,
 * pas « courses ». Renommer la liste sans toucher aux charges reviendrait donc
 * exactement à la suppression-recréation qu'on veut éviter : le récapitulatif
 * par catégorie, les budgets et les filtres de la carte cesseraient tous de
 * reconnaître l'ancien nom.
 *
 * Ce module décide seule­ment quels chemins réécrire. Il ne touche ni à la base
 * ni au DOM, pour que la décision soit vérifiable — c'est la partie où une
 * erreur coûterait de l'historique.
 *
 * Les enveloppes échappent à tout ceci : une charge y renvoie par identifiant,
 * les renommer n'a donc aucune conséquence sur les charges.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEPUIS LE LOT P1b : DEUX POCHES, ET UN MUR ENTRE ELLES
 *
 * Le nœud reçu est FUSIONNÉ — le commun et les poches personnelles qu'on a le
 * droit de lire, réunis par `poches.js`. Une charge personnelle ne vit donc
 * plus sous `periods/…` : recomposer ce chemin écrirait un fantôme dans le
 * commun en laissant l'original derrière. Le chemin se DÉRIVE de la charge,
 * par la fabrique unique, et ce module ne le compose plus.
 *
 * Et une conséquence qu'aucun chemin ne peut lever : **on n'a pas le droit
 * d'écrire dans la poche de l'autre.** Renommer une catégorie ne peut donc pas
 * suivre les charges personnelles de l'autre personne. Le renommage n'est pas
 * refusé pour autant — ce serait rendre une liste partagée inmodifiable par
 * une donnée qu'on ne voit peut-être même pas. Les charges hors de portée sont
 * COMPTÉES, et `planRattrapage` les reprend chez leur propriétaire, à
 * l'ouverture de son application.
 */

import { cheminDeLaCharge } from '../poches.js';
import { proprietaireDuSolo } from './perimetre.js';
import { racineDepuisLibelle } from './identifiant.js';

/** Les deux collections de charges d'une période */
const COLLECTIONS = ['fixedCharges', 'variableCharges'];

/** Format d'une clé de période : AAAA-MM */
const CLE_PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Toutes les charges du nœud, avec LE CHEMIN OÙ ELLES VIVENT
 *
 * La traversée rend des couples plutôt qu'une liste de chemins recomposés :
 * le chemin vient de la fabrique unique — `poches.js → cheminDeLaCharge` —, et
 * le propriétaire vient avec, parce que c'est lui qui dit si l'on a le droit
 * d'écrire là.
 *
 * @param {Object} periods - Nœud `periods` fusionné, tel que `lirePeriodes` le rend
 * @yields {{chemin: string, charge: Object, proprietaire: string|null}}
 */
function* chargesDuNoeud(periods) {
  for (const [periode, contenu] of Object.entries(periods)) {
    // Le nœud `periods` a hébergé des écritures accidentelles ; les suivre
    // écrirait sous des chemins qui n'ont pas de sens.
    if (!CLE_PERIODE.test(periode) || !contenu || typeof contenu !== 'object') continue;

    for (const collection of COLLECTIONS) {
      const charges = contenu[collection];
      if (!charges || typeof charges !== 'object') continue;

      for (const [cle, charge] of Object.entries(charges)) {
        if (!charge || typeof charge !== 'object') continue;

        yield {
          chemin: cheminDeLaCharge(charge, { periode, collection, id: cle }),
          charge,
          proprietaire: proprietaireDuSolo(charge)
        };
      }
    }
  }
}

/**
 * Les écritures qu'exige un renommage
 *
 * Les charges supprimées sont réécrites elles aussi : la corbeille les affiche,
 * et l'on peut les restaurer. Les laisser derrière rendrait une charge
 * ressuscitée avec un libellé mort.
 *
 * `horsDePortee` compte les charges qu'on voit et qu'on ne peut pas écrire :
 * les personnelles de l'AUTRE, quand un aval les rend lisibles. Ce n'est pas
 * une erreur, et ce n'est pas rien non plus — c'est ce que `planRattrapage`
 * reprendra chez leur propriétaire.
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` fusionné, tel que lu
 * @param {'category'|'destination'} params.champ - Champ porté par les charges
 * @param {string} params.ancien - Libellé actuel
 * @param {string} params.nouveau - Libellé voulu
 * @param {string} [params.moi] - Emplacement du compte connecté
 * @returns {{chemins: Object<string, string>, nombre: number, horsDePortee: number}}
 */
export function planRenommage({ periods, champ, ancien, nouveau, moi }) {
  const chemins = {};
  let horsDePortee = 0;

  const valide = typeof ancien === 'string' && ancien !== ''
    && typeof nouveau === 'string' && nouveau !== ''
    && ancien !== nouveau
    && (champ === 'category' || champ === 'destination')
    && periods && typeof periods === 'object';

  if (!valide) return { chemins, nombre: 0, horsDePortee };

  for (const { chemin, charge, proprietaire } of chargesDuNoeud(periods)) {
    if (charge[champ] !== ancien) continue;

    // La poche de l'autre : lisible sous aval, jamais inscriptible. Y pousser
    // un chemin ferait échouer la mise à jour ENTIÈRE — `update` applique tout
    // ou rien — donc le renommage échouerait pour les charges du foyer aussi.
    if (proprietaire && proprietaire !== moi) {
      horsDePortee += 1;
      continue;
    }

    chemins[`${chemin}/${champ}`] = nouveau;
  }

  return { chemins, nombre: Object.keys(chemins).length, horsDePortee };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CHACUN REPREND DANS SA PROPRE POCHE, À L'OUVERTURE
 *
 * Renommer « Courses » en « Alimentation » suit les charges du foyer et les
 * miennes. Celles de l'autre restent derrière : je n'ai pas le droit d'écrire
 * chez lui, et lui n'a peut-être pas ouvert l'application depuis. Sa liste
 * affiche donc « Alimentation », et ses dépenses personnelles « Courses » — un
 * récapitulatif à deux entrées pour une seule catégorie, chez lui seulement.
 *
 * ## La correspondance est DÉRIVABLE, elle n'est pas devinée
 *
 * Une entrée de liste garde son identifiant à travers un renommage : c'est tout
 * l'intérêt du renommage. Et cet identifiant est la racine de son libellé
 * d'ORIGINE (`identifiant.js → racineDepuisLibelle`). Un libellé de charge
 * absent de la liste dont la racine désigne une entrée existante nomme donc
 * cette entrée, sous son ancien nom.
 *
 * ## Sa limite, dite plutôt que cachée
 *
 * Deux renommages successifs pendant qu'une poche dort — A → B → C — laissent
 * une charge à `B`, dont la racine ne vaut pas l'identifiant (resté `a`). Ce
 * cas n'est PAS repris, et c'est le bon défaut : rien ne le distingue d'un
 * libellé qui n'a jamais appartenu à la liste, et réécrire au hasard changerait
 * la catégorie d'une dépense. La charge garde son libellé — exactement ce qui
 * arrivait à toutes avant P1b.
 *
 * Et la reprise ne touche QUE sa propre poche. Une charge commune au libellé
 * périmé serait un renommage qui a échoué pour les deux : ce n'est pas la même
 * panne, et la réparer ici masquerait la première.
 */

/**
 * Les écritures qui remettent MA poche d'accord avec la liste partagée
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` fusionné, tel que lu
 * @param {string} params.moi - Emplacement du compte connecté
 * @param {'category'|'destination'} params.champ
 * `corrections` rend les objets de charge EUX-MÊMES, pour que l'appelant puisse
 * remettre l'instantané d'accord avec la base après l'écriture. Sans cela le
 * premier rendu de l'ouverture montrerait l'ancien libellé — celui qu'on vient
 * précisément de corriger — et rien ne le referait. Ce module ne mute rien : il
 * dit QUOI muter, comme il dit quoi écrire.
 *
 * @param {Array<Object>} params.entrees - Liste partagée, `{ id, label }`
 * @returns {{chemins: Object<string, string>, nombre: number,
 *   corrections: Array<{charge: Object, champ: string, valeur: string}>}}
 */
export function planRattrapage({ periods, moi, champ, entrees }) {
  const chemins = {};
  const corrections = [];
  const vide = { chemins, nombre: 0, corrections };

  if (!periods || typeof periods !== 'object') return vide;
  if (champ !== 'category' && champ !== 'destination') return vide;
  if (!moi || !Array.isArray(entrees)) return vide;

  const libelles = new Set();
  /** Identifiant → libellé courant, seulement quand il ne prête pas à confusion */
  const parIdentifiant = new Map();

  for (const entree of entrees) {
    if (!entree || typeof entree.label !== 'string' || !entree.label) continue;
    libelles.add(entree.label);
    if (typeof entree.id !== 'string' || !entree.id) continue;
    // Deux entrées de même identifiant ne peuvent pas exister ; par prudence,
    // une collision fait renoncer plutôt que choisir.
    parIdentifiant.set(entree.id, parIdentifiant.has(entree.id) ? null : entree.label);
  }

  for (const { chemin, charge, proprietaire } of chargesDuNoeud(periods)) {
    if (proprietaire !== moi) continue;

    const porte = charge[champ];
    if (typeof porte !== 'string' || !porte) continue;
    if (libelles.has(porte)) continue;

    const courant = parIdentifiant.get(racineDepuisLibelle(porte));
    if (!courant || courant === porte) continue;

    chemins[`${chemin}/${champ}`] = courant;
    corrections.push({ charge, champ, valeur: courant });
  }

  return { chemins, nombre: Object.keys(chemins).length, corrections };
}

/**
 * Le déplacement du budget qu'exige le renommage d'une catégorie
 *
 * `category-budgets.js` indexe les budgets **par libellé** :
 * `categoryBudgets['Courses'] = 600`. La clé EST le nom. Renommer la catégorie
 * déplaçait donc toutes les charges — `planRenommage` s'en charge — mais
 * laissait le budget derrière, sous un nom que plus rien ne porte.
 *
 * Mesuré : budget de 600 € sur « Courses », 450 € dépensés. Après renommage en
 * « Alimentation », l'écran annonçait « 0,00 € dépensés sur 600,00 € budgétés »
 * — et les 600 € restaient orphelins sous l'ancien nom, invisibles et
 * inatteignables.
 *
 * Ce module ne décide que des chemins ; l'appelant les joint à ceux des charges
 * pour n'écrire qu'une fois. Une écriture séparée pourrait échouer à moitié et
 * laisser un budget dupliqué sous deux noms.
 *
 * **La collision ne peut viser qu'un orphelin.** `libelleAcceptable` refuse de
 * renommer vers un libellé déjà dans la liste : si `categoryBudgets[nouveau]`
 * existe malgré tout, c'est un vestige d'un renommage antérieur — donc du
 * défaut qu'on répare ici. Le budget déplacé l'emporte, et c'est le bon choix :
 * il correspond à la catégorie vivante, l'autre à un nom que plus personne ne
 * porte.
 *
 * L'objet reçu n'est jamais modifié : il vient de `state.js`, et une mutation y
 * ferait diverger l'écran de la base au premier échec d'écriture.
 *
 * @param {Object} params
 * @param {Object} params.budgets - Nœud `categoryBudgets`, tel que lu
 * @param {string} params.ancien - Libellé actuel
 * @param {string} params.nouveau - Libellé voulu
 * @returns {{chemins: Object, montant: number|null}} Chemins relatifs à la racine
 */
export function planBudget({ budgets, ancien, nouveau }) {
  const vide = { chemins: {}, montant: null };

  if (!budgets || typeof budgets !== 'object') return vide;
  if (typeof ancien !== 'string' || typeof nouveau !== 'string') return vide;
  if (!ancien || !nouveau || ancien === nouveau) return vide;

  const montant = budgets[ancien];
  // Un budget absent n'a rien à déplacer ; un montant illisible non plus, et le
  // recopier propagerait une valeur que l'écran ne saurait pas afficher.
  if (!Number.isFinite(montant)) return vide;

  return {
    chemins: {
      // `null` supprime la clé. `.validate` n'est jamais évaluée sur une
      // suppression : ce chemin ne peut pas être refusé pour sa valeur.
      [`categoryBudgets/${ancien}`]: null,
      [`categoryBudgets/${nouveau}`]: montant
    },
    montant
  };
}

/**
 * Les six caractères que Realtime Database refuse dans une clé
 *
 * Écrits en toutes lettres plutôt qu'en classe d'expression régulière : une
 * classe s'écrit vite de travers — un tiret mal placé y devient un intervalle,
 * et la règle se met à rejeter l'espace, donc « Frais bancaires ».
 */
const CARACTERES_INTERDITS = ['.', '$', '#', '[', ']', '/'];

/**
 * Le premier caractère interdit d'un libellé, s'il y en a un
 *
 * Les caractères de contrôle sont joints aux six : invisibles à l'écran, ils
 * provoqueraient la même panne sans qu'on puisse la relier au nom saisi. Ils
 * sont rendus comme chaîne vide, faute de pouvoir les montrer.
 *
 * @param {string} texte
 * @returns {string|null} Le caractère fautif, ou null s'il n'y en a pas
 */
function caractereInterdit(texte) {
  for (const caractere of texte) {
    if (CARACTERES_INTERDITS.includes(caractere)) return caractere;
    const point = caractere.codePointAt(0);
    if (point < 0x20 || point === 0x7f) return '';
  }
  return null;
}

/**
 * Le nouveau libellé est-il acceptable ?
 *
 * La comparaison ignore la casse : deux catégories « Courses » et « courses »
 * seraient deux entrées distinctes dans la liste et une seule à l'œil, et les
 * charges de l'une n'apparaîtraient pas sous l'autre.
 *
 * Le libellé n'est pas qu'un affichage : `category-budgets.js` s'en sert comme
 * **clé** de l'objet écrit sous `categoryBudgets`. Or Realtime Database refuse
 * `.` `$` `#` `[` `]` `/` dans une clé, et le SDK lève à l'écriture. Une
 * catégorie nommée « Eau/Gaz » ou « Frais 2.5 % » — rien d'exotique — rendait
 * donc **tous** les budgets insauvegardables, avec pour seul message
 * « Enregistrement impossible » : rien ne reliait la panne au nom choisi.
 * L'identifiant, lui, était nettoyé depuis longtemps ; le libellé ne l'était
 * pas.
 *
 * @param {string} nouveau - Libellé voulu
 * @param {Array<Object>} existants - Entrées de la liste
 * @param {number} index - Rang de l'entrée renommée, exclue de la comparaison
 * @returns {{valide: boolean, erreur?: string}}
 */
export function libelleAcceptable(nouveau, existants, index) {
  const net = typeof nouveau === 'string' ? nouveau.trim() : '';
  if (!net) return { valide: false, erreur: 'Nom requis' };
  if (net.length > 30) return { valide: false, erreur: 'Nom trop long (30 caractères)' };

  const interdit = caractereInterdit(net);
  if (interdit !== null) {
    const montre = interdit ? `« ${interdit} »` : 'un caractère invisible';
    return { valide: false, erreur: `Le nom ne peut pas contenir ${montre} — ni . $ # [ ] /` };
  }

  const liste = Array.isArray(existants) ? existants : [];
  const doublon = liste.some((item, rang) =>
    rang !== index && item && typeof item.label === 'string'
    && item.label.toLowerCase() === net.toLowerCase());

  if (doublon) return { valide: false, erreur: 'Ce nom existe déjà' };

  return { valide: true };
}
