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
 */

/** Les deux collections de charges d'une période */
const COLLECTIONS = ['fixedCharges', 'variableCharges'];

/** Format d'une clé de période : AAAA-MM */
const CLE_PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Les écritures qu'exige un renommage
 *
 * Les charges supprimées sont réécrites elles aussi : la corbeille les affiche,
 * et l'on peut les restaurer. Les laisser derrière rendrait une charge
 * ressuscitée avec un libellé mort.
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` complet, tel que lu en base
 * @param {'category'|'destination'} params.champ - Champ porté par les charges
 * @param {string} params.ancien - Libellé actuel
 * @param {string} params.nouveau - Libellé voulu
 * @returns {{chemins: Object<string, string>, nombre: number}} Chemins relatifs à la racine des données
 */
export function planRenommage({ periods, champ, ancien, nouveau }) {
  const chemins = {};

  const valide = typeof ancien === 'string' && ancien !== ''
    && typeof nouveau === 'string' && nouveau !== ''
    && ancien !== nouveau
    && (champ === 'category' || champ === 'destination')
    && periods && typeof periods === 'object';

  if (!valide) return { chemins, nombre: 0 };

  for (const [periode, contenu] of Object.entries(periods)) {
    // Le nœud `periods` a hébergé des écritures accidentelles ; les suivre
    // écrirait sous des chemins qui n'ont pas de sens.
    if (!CLE_PERIODE.test(periode) || !contenu || typeof contenu !== 'object') continue;

    for (const collection of COLLECTIONS) {
      const charges = contenu[collection];
      if (!charges || typeof charges !== 'object') continue;

      for (const [cle, charge] of Object.entries(charges)) {
        if (!charge || typeof charge !== 'object') continue;
        if (charge[champ] !== ancien) continue;

        chemins[`periods/${periode}/${collection}/${cle}/${champ}`] = nouveau;
      }
    }
  }

  return { chemins, nombre: Object.keys(chemins).length };
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
