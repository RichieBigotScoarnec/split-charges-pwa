/**
 * FairSplit — Reconduction des charges récurrentes
 *
 * Les charges fixes portent depuis toujours un indicateur `recurring`, activé
 * par défaut, et le code savait déjà les recopier d'un mois sur l'autre. Mais
 * rien ne déclenchait jamais cette copie : la bannière censée la proposer
 * n'était affichée par aucun chemin de code, ses boutons appelaient des
 * fonctions inexistantes, et le bouton de reconduction manuelle n'était pas
 * dans le HTML. Chaque mois, il fallait donc ressaisir le loyer.
 *
 * Décider ce qui doit être reconduit est une question de données pures : ce
 * module la traite sans base ni DOM, pour qu'elle soit vérifiable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEPUIS LE LOT P1b : DEUX POCHES, DEUX DÉCISIONS, UNE SEULE RÈGLE
 *
 * Le nœud reçu est FUSIONNÉ : ses collections portent le commun et les poches
 * personnelles qu'on a le droit de lire. Trois conséquences, et aucune ne se
 * déduit des deux autres.
 *
 * 1. **Tout ce qui se compare se compare DANS la poche** — la source comme les
 *    homonymes. Sur le nœud fusionné, un abonnement personnel écarterait le
 *    loyer du même nom, et rien ne le dirait.
 * 2. **Une charge personnelle se reconduit dans la poche de SON
 *    propriétaire**, jamais dans le commun : le chemin se dérive d'elle, comme
 *    partout depuis P1b.
 * 3. **Jamais celle de l'autre.** On n'a aucun droit d'écriture chez lui, et
 *    il reconduira la sienne à sa prochaine ouverture. Ses charges ne sont donc
 *    pas « écartées » : elles ne sont pas de notre ressort.
 *
 * Les deux décisions sont INDÉPENDANTES — deux mois sources peuvent différer,
 * un foyer sans charge fixe commune peut avoir un abonnement personnel
 * mensuel — mais elles passent par la MÊME fabrique, `planDeLaPoche` : la règle
 * de décision est une seule grandeur, et deux rédactions divergeraient au
 * premier correctif.
 *
 * ## L'empreinte, elle aussi, est par poche
 *
 * `periods/$periode/reconductedFrom` marque le mois COMMUN. Elle ne peut pas
 * servir pour le personnel : celui des deux qui ouvre l'application le premier
 * la réserve, et la poche de l'autre ne serait alors jamais reconduite. Chaque
 * poche porte donc la sienne, sous
 * `personnel/{qui}/periods/$periode/reconductedFrom`, écrite par son seul
 * propriétaire. Elle est passée à ce module, qui ne lit pas la base.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEPUIS LE LOT 2 (2026-11-01) : PLUS DE MOIS « DÉJÀ GARNI »
 *
 * Une garde refusait tout mois portant une charge fixe active. Née avec
 * l'empreinte (`b2258cc`), elle tenait lieu de dédoublonnage grossier : faute de
 * reconnaître une charge déjà présente, elle refusait le mois entier. Une seule
 * charge datée d'avance suffisait donc à bloquer ce mois pour toujours — et le
 * mois suivant le prenait pour source, si bien que le loyer disparaissait de
 * toute la suite. Deux règles la remplacent, mesurées en phase A.
 *
 * ## R5 — ce qui peut servir de source
 *
 * Un mois SANS EMPREINTE ne sert de source que si aucun mois antérieur ne porte
 * de charges reconductibles actives : sinon il aurait dû être reconduit, et il
 * ne le dit pas. Le statut présent ou futur du mois ne tranche rien — un mois de
 * démarrage et un mois où traîne une charge posée d'avance ont la même allure ;
 * ce qui les sépare, c'est qu'un mois antérieur avait de quoi remplir le second.
 * Les supprimées ne comptent pas : une charge de 400 € effacée en août ne doit
 * pas disqualifier le mois où le foyer commence pour de bon.
 *
 * ## D2 — ce qui écarte une copie
 *
 * Un homonyme de même poche, même collection, LUI-MÊME reconductible, compté en
 * multiplicité. Pas d'identifiant source : une copie n'en porte aucun, et une
 * saisie à la main n'en a pas. Pas le montant : un loyer augmente.
 *
 * Un homonyme NON reconductible n'écarte rien, et c'est ce qui tient la chaîne :
 * un « Loyer » ponctuel écarterait la mensualité, le mois n'en porterait plus de
 * reconductible, et elle sortirait de la reconduction pour tous les mois
 * suivants. Il est seulement signalé comme doublon possible.
 *
 * ## Tout écarté n'est pas « rien à faire »
 *
 * Le plan existe dès qu'il y a une source, même si aucune copie ne reste à
 * faire : c'est lui qui fait poser l'empreinte. Sans elle, R5 disqualifierait ce
 * mois au tour suivant, et ce qu'on y a saisi sortirait de la chaîne.
 */

import { proprietaireDuSolo } from './perimetre.js';

/** Format d'une clé de période : AAAA-MM */
const PERIOD_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Un libellé tel qu'on le compare : sans casse ni espaces de bord
 *
 * Une seule rédaction, lue par le dédoublonnage et par `changement-de-mois.js` :
 * deux normalisations finiraient par se contredire sur la même charge.
 *
 * @param {*} texte
 * @returns {string} Vide pour ce qui n'est pas un texte
 */
export function libelleComparable(texte) {
  return typeof texte === 'string' ? texte.trim().toLocaleLowerCase('fr') : '';
}

/**
 * Ne retient d'une collection que les charges d'une poche
 *
 * @param {*} node - Nœud `fixedCharges` ou `variableCharges`, fusionné
 * @param {string|null} poche - `null` pour le commun, sinon un emplacement
 * @returns {Object} Un nœud de même forme, réduit
 */
function deLaPoche(node, poche) {
  if (!node || typeof node !== 'object') return {};

  const retenues = {};
  for (const [cle, charge] of Object.entries(node)) {
    if (!charge || typeof charge !== 'object') continue;
    if (proprietaireDuSolo(charge) !== poche) continue;
    retenues[cle] = charge;
  }
  return retenues;
}

/**
 * Les copies d'une collection — ce qui part, ce qui est écarté, ce qui se signale
 *
 * @param {Object} params
 * @param {Array<Object>} params.aReconduire - Les reconductibles de la source
 * @param {Array<Object>} params.reconductibles - Celles de la destination, MÊME collection
 * @param {Array<Object>} params.autres - Les autres charges actives de la destination
 * @returns {{copies: Array<Object>, ecartees: Array<string>, doublons: Array<string>}}
 */
function trierLesCopies({ aReconduire, reconductibles, autres }) {
  const disponibles = new Map();
  for (const charge of reconductibles) {
    const libelle = libelleComparable(charge.description);
    if (libelle) disponibles.set(libelle, (disponibles.get(libelle) || 0) + 1);
  }

  const presents = new Set(autres.map(charge => libelleComparable(charge.description)));
  const copies = [];
  const ecartees = [];
  const doublons = [];

  for (const charge of aReconduire) {
    const libelle = libelleComparable(charge.description);
    const reste = disponibles.get(libelle) || 0;

    if (reste > 0) {
      disponibles.set(libelle, reste - 1);
      ecartees.push(charge.description.trim());
      continue;
    }

    copies.push(charge);
    if (libelle && presents.has(libelle)) doublons.push(charge.description.trim());
  }

  return { copies, ecartees, doublons };
}

/**
 * Le plan d'UNE poche — la décision, appliquée à un périmètre
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` fusionné
 * @param {string} params.target - Période à remplir
 * @param {*} params.empreinte - Marque de reconduction de CETTE poche
 * @param {string|null} params.poche - `null` pour le commun, sinon un emplacement
 * @param {Object} [params.empreintesPersonnelles] - Par mois, celles de MA poche
 * @returns {{source: string, charges: Array<Object>, variables: Array<Object>,
 *   ecartees: Array<string>, doublonsPossibles: Array<string>}|null}
 */
function planDeLaPoche({ periods, target, empreinte, poche, empreintesPersonnelles }) {
  // Déjà reconduit : l'empreinte fait foi, même si les charges ont depuis été
  // supprimées.
  if (empreinte) return null;

  const source = findSource(periods, target, poche, empreintesPersonnelles);
  if (!source) return null;

  const cible = periods[target] || {};
  const fixesDuMois = activesDe(deLaPoche(cible.fixedCharges, poche));
  const variablesDuMois = activesDe(deLaPoche(cible.variableCharges, poche));

  const fixes = trierLesCopies({
    aReconduire: recurringCharges(deLaPoche(periods[source].fixedCharges, poche)),
    reconductibles: recurringCharges(deLaPoche(cible.fixedCharges, poche)),
    autres: [...fixesDuMois.filter(c => c.recurring === false), ...variablesDuMois]
  });
  const variables = trierLesCopies({
    aReconduire: variablesReconductibles(deLaPoche(periods[source].variableCharges, poche)),
    reconductibles: variablesReconductibles(deLaPoche(cible.variableCharges, poche)),
    autres: [...variablesDuMois.filter(c => c.recurring !== true), ...fixesDuMois]
  });

  return {
    source,
    charges: fixes.copies,
    variables: variables.copies,
    ecartees: [...new Set([...fixes.ecartees, ...variables.ecartees])],
    doublonsPossibles: [...new Set([...fixes.doublons, ...variables.doublons])]
  };
}

/**
 * Détermine les charges à reconduire dans une période
 *
 * La reconduction ne s'exécute qu'une fois par mois cible et par poche, et son
 * empreinte est écrite avec les charges : sans cela, supprimer une charge
 * reconduite la ferait réapparaître à chaque ouverture du mois.
 *
 * Elle ne remonte jamais dans le passé. Ouvrir un mois ancien et vide est une
 * consultation, pas une reprise d'activité — y déverser les charges du mois
 * d'avant réécrirait l'histoire.
 *
 * @param {Object} params - Contexte de décision
 * @param {string} params.target - Période à remplir (AAAA-MM)
 * @param {string} params.currentMonth - Mois calendaire courant (AAAA-MM)
 * @param {Object} params.periods - Nœud `periods` fusionné, tel que `lirePeriodes` le rend
 * @param {string} [params.moi] - Emplacement du compte connecté
 * @param {*} [params.empreintePersonnelle] - Marque de reconduction de MA poche
 * @param {Object} [params.empreintesPersonnelles] - Par mois antérieur, les marques
 *   de MA poche que `moisDontLEmpreinteDecide` a demandées
 * @returns {{commun: Object|null, personnel: Object|null}|null}
 *   Les deux plans, ou null s'il n'y a rien à faire ni dans l'une ni dans
 *   l'autre. Chaque plan porte son propre mois source.
 */
export function planRecurrence({
  target, currentMonth, periods, moi, empreintePersonnelle, empreintesPersonnelles = {}
}) {
  if (!PERIOD_KEY.test(target || '')) return null;
  if (!periods || typeof periods !== 'object') return null;

  // Jamais vers le passé.
  if (target < currentMonth) return null;

  const cible = periods[target] || {};

  const commun = planDeLaPoche({
    periods, target, empreinte: cible.reconductedFrom, poche: null
  });

  // Sans emplacement connu, on ne sait pas de qui serait la charge : ne rien
  // reconduire de personnel plutôt que de deviner une poche.
  const personnel = moi
    ? planDeLaPoche({
      periods, target, empreinte: empreintePersonnelle, poche: moi, empreintesPersonnelles
    })
    : null;

  return (commun || personnel) ? { commun, personnel } : null;
}

/**
 * Charges variables actives et **explicitement** marquées à reconduire
 *
 * L'inverse exact de `recurringCharges` sur un point décisif : ici, l'absence
 * de l'indicateur vaut **non**. Une charge fixe sans `recurring` est récurrente
 * — c'est le défaut de son formulaire, et le loyer d'avant l'indicateur doit
 * continuer d'être reconduit. Appliquer la même règle aux variables recopierait
 * d'un coup tout ce que le foyer a jamais saisi : chaque course, chaque
 * restaurant, chaque essence, tous les mois. Il faut donc l'avoir demandé.
 *
 * @param {*} node - Nœud `variableCharges` d'une période
 * @returns {Array<Object>}
 */
function variablesReconductibles(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.values(node)
    .filter(charge => charge && typeof charge === 'object'
      && charge.deleted !== true && charge.recurring === true);
}

/**
 * Les mois antérieurs portant des charges reconductibles ACTIVES, du plus récent
 * au plus ancien
 *
 * Un mois sauté n'interrompt pas la reconduction, et la recherche est faite
 * POCHE PAR POCHE : c'est ce qui rend les deux décisions indépendantes. Un foyer
 * sans aucune charge fixe commune peut avoir un abonnement personnel mensuel, et
 * un mois source commun peut ne rien porter de personnel.
 *
 * @param {Object} periods - Nœud `periods` fusionné
 * @param {string} target - Période cible
 * @param {string|null} poche - `null` pour le commun, sinon un emplacement
 * @returns {Array<string>}
 */
function moisPorteurs(periods, target, poche) {
  return Object.keys(periods)
    .filter(key => PERIOD_KEY.test(key) && key < target)
    .sort()
    .reverse()
    .filter((key) => {
      const mois = periods[key] || {};
      // Un foyer peut n'avoir aucune charge fixe et une essence mensuelle : ne
      // regarder que les fixes lui refuserait la reconduction sans rien dire.
      return recurringCharges(deLaPoche(mois.fixedCharges, poche)).length > 0
        || variablesReconductibles(deLaPoche(mois.variableCharges, poche)).length > 0;
    });
}

/**
 * Cherche le mois source, selon R5
 *
 * Le plus récent des mois qui portent leur empreinte ; à défaut, le plus ancien
 * porteur, qui n'a rien à prouver : aucun mois avant lui ne peut le disqualifier.
 *
 * @param {Object} periods - Nœud `periods` fusionné
 * @param {string} target - Période cible
 * @param {string|null} poche - `null` pour le commun, sinon un emplacement
 * @param {Object} [empreintesPersonnelles] - Par mois, celles de MA poche
 * @returns {string|null} Clé de la période source
 */
function findSource(periods, target, poche, empreintesPersonnelles = {}) {
  const porteurs = moisPorteurs(periods, target, poche);

  // La fusion ne remonte que les collections de charges : l'empreinte d'une
  // poche personnelle n'est PAS dans le nœud reçu.
  const empreinteDe = (mois) => (poche
    ? empreintesPersonnelles[mois]
    : periods[mois]?.reconductedFrom);

  const dernier = porteurs.length - 1;
  return porteurs.find(mois => empreinteDe(mois)) || porteurs[dernier] || null;
}

/**
 * Les mois dont il faut lire l'empreinte personnelle pour trancher R5
 *
 * Elles vivent hors du nœud fusionné, et les lire toutes reviendrait à relire la
 * poche à chaque ouverture — `lecture-unique.spec.js` tient ce prix. Il suffit
 * de les demander dans CET ordre et de s'arrêter à la première trouvée : une
 * poche reconduite le mois dernier ne coûte qu'une lecture, une fois par mois.
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` fusionné
 * @param {string} params.target - Période à remplir
 * @param {string} params.currentMonth - Mois calendaire courant
 * @param {string} [params.moi] - Emplacement du compte connecté
 * @returns {Array<string>} Du plus récent au plus ancien, sans le plus ancien
 */
export function moisDontLEmpreinteDecide({ periods, target, currentMonth, moi }) {
  if (!moi || !periods || typeof periods !== 'object') return [];
  if (target < currentMonth) return [];

  return moisPorteurs(periods, target, moi).slice(0, -1);
}

/**
 * Le message d'une reconduction : ce qui est parti, et ce qui ne l'est pas
 *
 * Une reconduction qui écarte une charge sans le dire se lit comme une charge
 * perdue ; un doublon possible qu'on ne nomme pas se lit dans le bilan, un mois
 * plus tard, comme une dépense de trop.
 *
 * @param {Object} params
 * @param {number} params.nombre - Charges fixes copiées
 * @param {string|null} params.depuis - Le mois source en toutes lettres, s'il est unique
 * @param {Array<string>} params.ecartees
 * @param {Array<string>} params.doublonsPossibles
 * @returns {string}
 */
export function messageDeReconduction({ nombre, depuis, ecartees, doublonsPossibles }) {
  const pluriel = nombre > 1 ? 's' : '';
  const tete = `${nombre > 0 ? nombre : 'Aucune'} charge${pluriel} fixe${pluriel} `
    + `reconduite${pluriel}`
    + (depuis ? ` depuis ${depuis}` : '');

  const phrases = [tete];
  if (ecartees.length > 0) {
    phrases.push(ecartees.length > 1
      ? `Déjà présentes, non recopiées : ${ecartees.join(', ')}`
      : `Déjà présente, non recopiée : ${ecartees[0]}`);
  }
  if (doublonsPossibles.length > 0) {
    phrases.push(doublonsPossibles.length > 1
      ? `Doublons possibles, à vérifier : ${doublonsPossibles.join(', ')}`
      : `Doublon possible, à vérifier : ${doublonsPossibles[0]}`);
  }

  return phrases.length > 1 ? `${phrases.join('. ')}.` : tete;
}

/**
 * Charges fixes actives et marquées récurrentes
 *
 * `recurring` absent vaut récurrent : c'est le défaut du formulaire, et les
 * charges créées avant l'indicateur doivent suivre la même règle.
 *
 * @param {*} node - Nœud fixedCharges d'une période
 * @returns {Array<Object>} Les charges à reconduire
 */
function recurringCharges(node) {
  if (!node || typeof node !== 'object') return [];

  return Object.values(node).filter(
    charge => charge && !charge.deleted && charge.recurring !== false
  );
}

/**
 * Les charges encore actives d'une collection
 * @param {*} node - Nœud d'une collection
 * @returns {Array<Object>} Les charges non supprimées
 */
function activesDe(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.values(node).filter(charge => charge && !charge.deleted);
}
