/**
 * FairSplit — Les totaux d'une liste de charges, et ce qu'ils comptent
 *
 * ## Pourquoi ce fichier existe
 *
 * `variable-charges.js` et `fixed-charges.js` portaient chacun une copie
 * mot pour mot de `afficherTotal`. Deux copies d'une règle d'argent, c'est le
 * défaut que ce dépôt paie le plus cher — `normalizePair`, `resolveShareMode`,
 * `ecartAuHabituel` : à chaque fois, deux lectures du même chiffre qui
 * finissent par diverger sans que rien ne le dise.
 *
 * Et il y avait un troisième lecteur, qui n'affichait pas le même chiffre :
 * **la recherche**. Elle masquait les lignes par `style.display` sans jamais
 * toucher aux totaux. Mesuré avant correction : chercher « intermarche »
 * laissait trois lignes valant 294,32 € sous un total resté à 464,32 €, et
 * l'en-tête « Courses » affichait lui aussi le total du mois entier. La
 * question la plus naturelle qu'on pose à une recherche de dépenses — combien
 * je dépense chez cette enseigne — recevait donc une réponse fausse de 170 €,
 * affichée avec le même aplomb qu'une réponse juste.
 *
 * Les trois lecteurs passent désormais par ici.
 *
 * ## Ce que le total compte
 *
 * Il compte **ce que la portée montre**, et il nomme à part **ce qu'elle cache
 * de moi**. Une seule formule pour les deux portées qui filtrent — voir
 * `coupleDeLaPortee`, qui est la pièce à lire avant tout le reste de ce
 * fichier.
 */

import { formatCurrency } from './format.js';
import { chargesSolo, totalDesCharges } from './perimetre.js';
import { grouperParCategorie } from './tri.js';
import { PORTEES, porteeRetenue, chargesDeLaPortee, NATURES_DE_RENVOI } from './portee.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'UN TOTAL ANNONCE : LE MONTRÉ, ET MON PERSONNEL QUE LA PORTÉE CACHE
 *
 * Le lot P2 nourrissait le pied avec les charges affichées et l'en-tête de
 * catégorie avec le groupe ENTIER — deux entrées, choisies chacune pour son
 * effet. Ça tenait sur une seule portée qui filtre. À deux, ça ne tient plus :
 * sous « Moi », le groupe entier porte le commun du foyer, et l'en-tête aurait
 * annoncé « 300,00 € + 45,00 € perso » au-dessus d'une liste qui ne montre que
 * les 45 €. C'est le défaut que P2 a réparé, à l'envers.
 *
 * UNE SEULE FORMULE, et elle donne les deux lectures sans aucune branche par
 * portée :
 *
 *   commun ← le total de ce que la portée MONTRE
 *   solo   ← le total de MES dépenses personnelles qu'elle ne montre PAS
 *
 * Sous « À deux » : montré = le commun, caché de moi = mon personnel entier
 *   → « 300,00 € + 45,00 € perso », l'annotation de P2, à l'identique.
 * Sous « Moi » : montré = mon personnel, caché de moi = rien, il est affiché
 *   → « 45,00 € », sans annotation — il n'y a rien à distinguer.
 * Sous « Privé », qui ne filtre pas : tout est montré, rien n'est caché
 *   → le total simple.
 *
 * L'appartenance se mesure par IDENTITÉ d'objet, pas par identifiant : c'est ce
 * qui rend la formule indifférente au filtre employé. Le jour où une troisième
 * portée filtre autrement, cette fonction n'a pas à le savoir.
 *
 * ## Et elle CORRIGE une imprécision de P2, en passant
 *
 * L'en-tête de P2 annonçait le `solo` du groupe entier — sous un aval actif,
 * celui des DEUX comptes. Le renvoi en pied, lui, ne comptait déjà que le
 * mien. Les deux chiffres pouvaient donc différer sur le même écran, pour la
 * même raison. `chargesSolo(charges, moi)` les met d'accord.
 *
 * @param {Array<Object>} charges - La liste dont on annonce le total
 * @param {*} portee
 * @param {'vous'|'conjointe'} moi - L'emplacement du compte connecté
 * @returns {{commun: number, solo: number}}
 */
export function coupleDeLaPortee(charges, portee, moi) {
  const liste = (Array.isArray(charges) ? charges : []).filter(c => c && !c.deleted);
  const affichees = chargesDeLaPortee(liste, portee, moi);
  const rendues = new Set(affichees);

  return {
    commun: totalDesCharges(affichees),
    solo: totalDesCharges(chargesSolo(liste, moi).filter(charge => !rendues.has(charge)))
  };
}

/**
 * UNE SEULE FAÇON DE DIRE UN TOTAL QUI PORTE DU PERSONNEL
 *
 * Cette formulation vivait en clair dans `afficherTotalDeListe`, et c'était
 * juste tant que le pied de liste était le seul à la prononcer. Le lot P2 lui a
 * donné un second lecteur — l'en-tête de catégorie, qui doit dire sa part
 * personnelle de la même façon. Deux rédactions du même chiffre divergent au
 * premier correctif, et le symptôme serait deux manières de dire la même chose
 * à deux lignes de distance.
 *
 * Le volet personnel ne paraît QUE s'il existe : sans quoi tous les mois déjà
 * en base changeraient d'apparence, et une mention systématique ferait du bruit
 * sur la majorité des lignes.
 *
 * ## ET IL NE PARAÎT PAS DAVANTAGE S'IL EST SEUL — lot « Moi »
 *
 * « 0,00 € + 45,00 € perso » est le pied que « Moi ce mois » affichait avec la
 * formule d'avant : exact, et illisible. L'annotation existe pour DISTINGUER
 * deux natures dans une même liste ; quand l'une des deux est absente, il n'y a
 * rien à distinguer et le total se dit d'un seul nombre. Les deux clauses sont
 * donc symétriques, et c'est la propriété qu'un contrôle tient :
 * `libelleDuTotal({commun: 0, solo: 45})` et `libelleDuTotal({commun: 45,
 * solo: 0})` rendent la même chose.
 *
 * @param {{commun: number, solo: number}} totaux
 * @returns {string}
 */
export function libelleDuTotal({ commun, solo }) {
  if (!(solo > 0)) return formatCurrency(commun);
  if (!(commun > 0)) return formatCurrency(solo);
  return `${formatCurrency(commun)} + ${formatCurrency(solo)} perso`;
}

/**
 * Le pied de liste : ce que la portée montre, et mon perso caché s'il existe
 *
 * `textContent` et non `innerHTML` : la politique de sécurité du dépôt plafonne
 * les sites d'injection, et un total n'a aucune raison d'en ouvrir un de plus.
 *
 * ## IL NE PORTE PAS L'ANNOTATION, ET C'EST LE POINT D'APPEL QUI LE DÉCIDE
 *
 * Le pied reçoit les charges **affichées**, l'en-tête de catégorie reçoit le
 * groupe **entier**. Même fabrique, deux assiettes — et c'est ce qui produit
 * les deux lectures que l'écran veut : le pied dit le chiffre du bilan, donc
 * sans annotation (`coupleDeLaPortee` ne trouve alors rien de caché, puisque
 * tout ce qu'on lui donne est montré) ; l'en-tête baisse ET dit ce qu'il a
 * retiré. La décision de P2, tenue par `depense-perso.spec.js` : « le pied dit
 * le commun SEUL, et c'est l'en-tête qui nomme le perso ».
 *
 * @param {HTMLElement|null} element - Le `<span>` du total
 * @param {Array<Object>} charges - Les charges dont on annonce le total
 * @param {{portee: *, moi: string}} lecture
 */
export function afficherTotalDeListe(element, charges, { portee, moi } = {}) {
  if (!element) return;
  element.textContent = libelleDuTotal(coupleDeLaPortee(charges, portee, moi));
}

/**
 * Accorde les sous-totaux de catégorie aux charges réellement affichées
 *
 * Chaque bloc `.charge-category` porte le libellé de sa catégorie en
 * `data-categorie` — posé au rendu, plutôt que relu depuis l'en-tête, qui
 * mêle l'emoji, le nom et le montant dans le même nœud de texte.
 *
 * Une catégorie dont plus aucune charge n'est affichée retombe à zéro plutôt
 * que de garder son ancien montant : pendant une recherche, `hideEmptyCategories`
 * la masque de toute façon, mais un bloc laissé avec un total périmé
 * réapparaîtrait faux au premier caractère effacé.
 *
 * @param {HTMLElement|null} listeElement - Le conteneur de la liste
 * @param {Array<Object>} charges - Les charges du mois, ou d'une recherche
 * @param {{portee: *, moi: string}} lecture
 */
export function accorderLesSousTotaux(listeElement, charges, { portee, moi } = {}) {
  if (!listeElement) return;

  const groupes = new Map(
    grouperParCategorie(Array.isArray(charges) ? charges : [])
      .map(groupe => [groupe.categorie, groupe.charges])
  );

  for (const bloc of listeElement.querySelectorAll('.charge-category')) {
    const span = bloc.querySelector('.category-total');
    if (!span) continue;
    // La MÊME fabrique que le pied, sur le même couple : c'est le même chiffre
    // dit de la même façon, au rendu comme sous une recherche.
    span.textContent = libelleDuTotal(
      coupleDeLaPortee(groupes.get(bloc.dataset.categorie) || [], portee, moi)
    );
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉTAT VIDE D'UNE LISTE — une fabrique, six rédactions, zéro `innerHTML`
 *
 * Le lot P2 a écrit quatre littéraux en clair, deux par module de liste. Le lot
 * « Moi » en demande deux de plus, et six rédactions du même patron dans deux
 * fichiers seraient la règle 4 à l'état pur : la première qu'on corrige laisse
 * les cinq autres derrière elle.
 *
 * ## POURQUOI ELLE CONSTRUIT LE DOM PLUTÔT QUE DE RENDRE UNE CHAÎNE
 *
 * Mesuré : `tools/plafond-innerhtml.mjs` est à **24 sur 24, marge nulle**, et
 * les quatre littéraux de P2 n'y comptent pas — `no-unsanitized` ne voit un
 * littéral que littéral. Une fabrique qui rendrait une chaîne assignée à
 * `innerHTML` en ferait **26**, sur deux phrases qui n'interpolent rien : CI
 * rouge pour un ajout qui n'ouvre aucune surface. Construire les nœuds coûte
 * zéro, et le précédent est `afficherLeRenvoi`, plus bas dans ce fichier, posé
 * pour cette raison exacte.
 *
 * ## CE QUE CHAQUE PHRASE DOIT DIRE
 *
 * `tout` — le mois est vraiment vide : la section explique ce qu'elle attend.
 * `commun` — le filtre a retiré mon personnel : le mois n'est PAS vide, et la
 *   phrase ne peut pas le prétendre. C'est la propriété que P2 a établie.
 * `perso` — sous « Moi », je n'ai rien saisi de personnel. **C'est le cas
 *   nominal** : relevé sur la base réelle le 2026-09-17, zéro charge fixe
 *   personnelle contre trois variables. La phrase doit donc lever l'ambiguïté
 *   qu'une section vide installe — « je n'en ai pas » ou « l'application ne me
 *   les montre pas ? » — et dire laquelle des deux.
 */
const ETATS_VIDES = Object.freeze({
  variableCharges: Object.freeze({
    tout: ['Aucune charge variable pour cette période',
      'Les dépenses du quotidien, dont le montant change : courses, essence, restaurant.'],
    commun: ['Aucune dépense commune ce mois-ci',
      'Le mois n\'est pas vide pour autant : vos dépenses perso sont rangées à part.'],
    perso: ['Aucune dépense perso ce mois-ci',
      'Une dépense cochée « perso » apparaîtrait ici, et elle ne pèserait sur le solde de personne. Tu n\'en as aucune ce mois-ci.']
  }),
  fixedCharges: Object.freeze({
    tout: ['Aucune charge fixe pour cette période',
      'Ce qui revient chaque mois pour le même montant : loyer, assurance, abonnements.'
      + ' Elles sont reportées automatiquement d\'un mois sur l\'autre.'],
    commun: ['Aucune charge fixe commune ce mois-ci',
      'Le mois n\'est pas vide pour autant : vos charges perso sont rangées à part.'],
    perso: ['Aucune charge fixe perso ce mois-ci',
      'Un abonnement à toi seul apparaîtrait ici. Tu n\'en as aucun : ce n\'est pas l\'application qui le cache.']
  })
});

/**
 * Laquelle des trois phrases cette liste vide doit dire
 *
 * Sous « Moi », la liste ne montre que mon personnel : vide, c'est que je n'en
 * ai pas. Sous toute autre portée, c'est le renvoi qui dit si le filtre a
 * retiré quelque chose — et une portée qui ne filtre pas n'a pas de renvoi,
 * donc retombe sur `tout`.
 *
 * @param {*} portee
 * @param {{nature: string|null}} renvoi
 * @returns {'tout'|'commun'|'perso'}
 */
function casDeLEtatVide(portee, renvoi) {
  if (porteeRetenue(portee) === PORTEES.SOLO) return 'perso';
  return renvoi && renvoi.nature === NATURES_DE_RENVOI.MON_PERSONNEL ? 'commun' : 'tout';
}

/**
 * Pose l'état vide d'une liste
 *
 * @param {HTMLElement|null} element - Le conteneur de la liste, déjà vidé
 * @param {Object} lecture
 * @param {'variableCharges'|'fixedCharges'} lecture.collection
 * @param {*} lecture.portee
 * @param {{nature: string|null}} lecture.renvoi
 */
export function afficherEtatVide(element, { collection, portee, renvoi }) {
  if (!element) return;

  const phrases = ETATS_VIDES[collection];
  if (!phrases) return;
  const [titre, aide] = phrases[casDeLEtatVide(portee, renvoi)];

  const bloc = document.createElement('p');
  bloc.className = 'empty-state';
  bloc.append(titre);

  const precision = document.createElement('small');
  precision.textContent = aide;
  bloc.append(precision);

  element.replaceChildren(bloc);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RENVOI : OÙ EST PASSÉ CE QUE LA PORTÉE VIENT DE RETIRER
 *
 * Avant le lot P2, « À deux » montrait le commun ET le personnel : rien à
 * chercher, tout était là. Filtrer répare la commande, et crée le défaut
 * qu'aucun filtre ne peut éviter — **une dépense saisie devient
 * introuvable**. On la saisit, on coche « perso », elle disparaît de l'écran
 * où on vient de la voir, et rien ne dit où elle est allée.
 *
 * Le renvoi est ce qui referme ça. Il ne se contente pas d'annoncer un chiffre
 * comme le pied : il NOMME sa destination, et le nom vient de
 * `utils/portee.js` — celui du segment, pour qu'on puisse le chercher à
 * l'écran.
 *
 * ## IL A DEUX NATURES, ET UNE SEULE PORTE UN CHIFFRE
 *
 * Sous « À deux », ce qui est parti est mon personnel : compté et chiffré.
 * Sous « Moi », c'est le commun — et son montant est déjà à l'écran, dans le
 * grand-livre, deux cartes plus haut. Ce qui manquait n'était pas un chiffre :
 * c'était une ADRESSE. La rédaction se choisit donc sur la NATURE, jamais sur
 * un compte — sans quoi « rien à annoncer » et « le commun est ailleurs » se
 * confondraient, tous deux à zéro.
 *
 * ## Il corrige aussi une affirmation FAUSSE
 *
 * Un mois qui ne porte que du personnel affichait « Aucune charge variable
 * pour cette période » sous « À deux ». C'est faux — il y en a, elles sont
 * ailleurs. La propriété à tenir : **l'écran ne prétend jamais qu'un mois est
 * vide quand il ne l'est pas.** C'est `afficherEtatVide` qui la porte, sur le
 * renvoi que ce bloc fabrique.
 *
 * ## `textContent`, et un BOUTON NU
 *
 * Pas d'`aria-checked`, `aria-selected` ni `aria-current` sur la commande :
 * `tests/e2e/portee-unique.spec.js` relève tout élément visible portant l'un
 * des trois dont le texte contient « moi » — ou « à deux » —, et le compterait
 * comme une SECONDE annonce de portée, sur l'écran dont il tient qu'il n'en
 * annonce qu'une.
 */

/** La phrase de chaque nature. `null` n'en a aucune, par construction. */
const PHRASE_DU_RENVOI = Object.freeze({
  [NATURES_DE_RENVOI.MON_PERSONNEL]: ({ nombre, total }) => {
    // UN SEUL `nombre > 1` pour les deux accords : le nom et le participe.
    // Écrits séparément, le participe est resté au pluriel sur une dépense
    // unique — « 1 dépense perso … rangées dans » — et c'est le cas le plus
    // fréquent du renvoi, puisqu'on coche « perso » une dépense à la fois.
    const pluriel = nombre > 1;
    return `${nombre} dépense${pluriel ? 's' : ''} perso (${formatCurrency(total)})`
      + ` — rangée${pluriel ? 's' : ''} dans`;
  },
  // Aucun nombre. Le montant est dans le grand-livre, à deux cartes d'ici.
  [NATURES_DE_RENVOI.LE_COMMUN]: () => 'Les dépenses communes ne sont pas dans cette liste, elles sont dans'
});

/**
 * La phrase du renvoi, ou `''` quand il n'y a rien à annoncer
 *
 * Elle s'arrête avant le nom de la destination : celui-ci est porté par le
 * bouton, qui est la commande. Une phrase qui le répéterait le dirait deux fois
 * à deux mots d'écart.
 *
 * ⚠️ **C'est donc le bouton qui doit porter un NOM, pas un verbe.** Il a
 * d'abord porté « Voir « À deux » », et la phrase se lisait alors *« …elles
 * sont dans Voir « À deux » »* — vu à l'écran. Les deux moitiés étaient justes
 * séparément : la phrase s'arrête bien sur « dans », et « Voir X » est une
 * étiquette de commande correcte. C'est leur ASSEMBLAGE qui ne se lisait plus,
 * et rien dans ce fichier ne pouvait le dire : la phrase ne sait pas ce que le
 * bouton écrit, et le bouton ne sait pas qu'il termine une phrase.
 *
 * La contrainte à retenir, parce qu'elle ne se voit qu'à l'écran : **les deux
 * textes forment UNE phrase**, et le second en est le complément.
 *
 * @param {{nature: string|null, nombre: number, total: number}} renvoi
 * @returns {string}
 */
export function libelleDuRenvoi(renvoi) {
  const phrase = renvoi && PHRASE_DU_RENVOI[renvoi.nature];
  if (!phrase) return '';
  if (renvoi.nature === NATURES_DE_RENVOI.MON_PERSONNEL && !(renvoi.nombre > 0)) return '';
  return phrase(renvoi);
}

/**
 * Pose le renvoi sous une liste, ou l'efface
 *
 * @param {HTMLElement|null} element - Le conteneur du renvoi
 * @param {{nature: string|null, nombre: number, total: number,
 *   libelle: string, versLaPortee: string}} renvoi
 */
export function afficherLeRenvoi(element, renvoi) {
  if (!element) return;

  const phrase = libelleDuRenvoi(renvoi);
  element.replaceChildren();

  if (!phrase) {
    element.hidden = true;
    return;
  }

  element.hidden = false;

  const texte = document.createElement('span');
  texte.className = 'list-renvoi-texte';
  texte.textContent = phrase;

  // Un bouton NU : aucun attribut d'état ARIA. Voir l'en-tête de ce bloc.
  const bouton = document.createElement('button');
  bouton.type = 'button';
  // `.btn-link` — l'action en ligne du dépôt, et non une seconde rédaction :
  // celle-ci avait été écrite, et son survol mesurait 2,58:1 en thème sombre.
  bouton.className = 'btn-link';
  bouton.dataset.action = 'allerALaPortee';
  bouton.dataset.arg = renvoi.versLaPortee;
  // Le NOM du segment, et non « Voir X » : les deux textes forment une phrase,
  // et c'est le nom qui la termine. Voir `libelleDuRenvoi`.
  bouton.textContent = `« ${renvoi.libelle} »`;

  element.append(texte, bouton);
}
