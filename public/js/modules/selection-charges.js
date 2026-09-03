// ===== MODULE : AGIR SUR PLUSIEURS CHARGES À LA FOIS =====
//
// Chaque ligne portait son crayon et sa corbeille. Ranger six courses saisies
// au fil de la semaine dans la bonne catégorie demandait six ouvertures de
// formulaire ; vider un mois d'essai demandait autant de confirmations qu'il
// contenait de lignes.
//
// ## Ce que ce mode permet, et ce qu'il ne permet pas
//
// Trois gestes : supprimer, ranger dans une catégorie, rattacher à une
// enveloppe. Ils ont en commun de ne PAS toucher au solde — une catégorie et
// une enveloppe sont des étiquettes de lecture, et la suppression est douce
// (`deleted: true`), donc récupérable depuis la corbeille.
//
// La répartition et le périmètre « perso » n'y sont pas, et c'est délibéré.
// Basculer dix charges en perso déplacerait le solde du mois d'un coup, sans
// que l'écran montre l'avant et l'après. Et `perimetreEcrivable` refuse une
// dépense perso dont le payeur est « partagé » : un lot mêlant les deux serait
// à moitié refusé par les règles Firebase, ce qui est le pire moment pour
// découvrir la contrainte. Ces deux gestes-là restent ligne à ligne, où le
// formulaire les explique.
//
// ## Le lot n'échoue pas en bloc
//
// Chaque écriture part pour elle-même et son échec est compté. Une règle qui
// refuse, une charge disparue entre-temps, un réseau qui coupe : le reste
// passe, et le compte rendu dit les deux nombres. Cf. `compteRenduDuLot`.

import { getState, setState } from '../state.js';
import { toast } from '../components/toast.js';
import { showConfirmModal } from '../components/modal.js';
import { formatCurrency } from '../utils/format.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { getCategories, populateCategorySelect } from './custom-lists.js';
import { populateEnvelopeSelect } from './envelopes.js';
import { calculateSummary } from './summary.js';
import {
  basculerDansLaSelection, selectionPurgee, resumeDeLaSelection, compteRenduDuLot
} from '../utils/selection-lot.js';

/**
 * L'état du mode vit dans `state.js`, et non dans une variable de ce fichier
 *
 * `variable-charges.js` doit savoir s'il faut dessiner des cases à cocher, et
 * il importe donc ce module. La dépendance ne va que dans ce sens : ce fichier
 * n'importe `variable-charges.js` qu'à l'exécution, jamais en tête de fichier.
 * Un cycle statique entre les deux serait résolu par les modules ES, mais son
 * comportement dépendrait de l'ordre d'évaluation — c'est-à-dire de qui, du
 * rendu ou de la sélection, se trouve chargé le premier.
 */
const CLE = 'selectionCharges';

/**
 * Le module de rendu, chargé à l'exécution
 *
 * L'import différé n'est pas un détail de style : c'est lui qui garde le graphe
 * acyclique. Le module est mis en cache par le moteur dès le premier appel.
 *
 * @returns {Promise<Object>}
 */
function moduleDesCharges() {
  return import('./variable-charges.js');
}

/** L'état du mode, toujours sous une forme exploitable */
function etat() {
  const brut = getState(CLE);
  return {
    actif: Boolean(brut && brut.actif),
    ids: Array.isArray(brut && brut.ids) ? brut.ids : []
  };
}

/** Écrit l'état, et rien d'autre : le rendu est appelé par les gestes */
function poser({ actif, ids }) {
  setState(CLE, { actif, ids });
}

/**
 * Les charges du mois affiché, telles que la liste les montre
 * @returns {Array<Object>}
 */
function chargesAffichees() {
  return (getState('variableCharges') || []).filter(charge => charge && !charge.deleted);
}

// ===== LECTURES POUR LE RENDU =====

/**
 * Le mode sélection est-il en cours ?
 * @returns {boolean}
 */
export function estEnModeSelection() {
  return etat().actif;
}

/**
 * Cette charge est-elle retenue ?
 * @param {string} id
 * @returns {boolean}
 */
export function estChoisie(id) {
  return etat().ids.includes(id);
}

// ===== LE MODE =====

/**
 * Entre ou sort du mode sélection
 *
 * Sortir vide la sélection : la garder en mémoire ferait réapparaître à la
 * prochaine entrée un lot constitué on ne sait quand, sur un mois peut-être
 * différent.
 *
 * @returns {void}
 */
export function basculerModeSelection() {
  const { actif } = etat();
  poser({ actif: !actif, ids: [] });
  rafraichirLEcran();
}

/**
 * Quitte le mode sans rien faire
 *
 * Appelée aussi au changement de mois : une sélection faite en août n'a rien à
 * dire de septembre, et ses identifiants n'y désignent personne.
 *
 * @returns {void}
 */
export function quitterLaSelection() {
  if (!etat().actif && etat().ids.length === 0) return;
  poser({ actif: false, ids: [] });
  rafraichirLEcran();
}

/**
 * Ajoute ou retire une charge de la sélection
 * @param {string} id
 * @returns {void}
 */
export function basculerChargeChoisie(id) {
  const { actif, ids } = etat();
  if (!actif) return;

  poser({ actif, ids: basculerDansLaSelection(ids, id) });
  rafraichirLEcran({ rendreLaMainA: id });
}

/**
 * Retient toutes les charges affichées, ou les relâche si tout l'était déjà
 *
 * Un seul bouton pour les deux gestes : « tout » et « rien » sont la même
 * question posée deux fois, et deux boutons dont l'un est toujours inutile
 * encombrent une barre qui doit rester lisible au pouce.
 *
 * @returns {void}
 */
export function toutSelectionner() {
  const { actif, ids } = etat();
  if (!actif) return;

  const affichees = chargesAffichees();
  const toutes = affichees.map(charge => charge.id);

  // Sur la sélection PURGÉE, et non sur `ids` brut : un identifiant retenu
  // peut ne plus désigner personne — l'autre téléphone a supprimé, la liste
  // s'est rechargée. Six identifiants comptés contre trois charges affichées
  // donnaient « tout est déjà coché », et le bouton vidait au lieu de remplir.
  const retenues = selectionPurgee(ids, affichees);
  const dejaTout = toutes.length > 0 && retenues.length >= toutes.length;

  poser({ actif, ids: dejaTout ? [] : toutes });
  rafraichirLEcran();
}

// ===== LES TROIS GESTES DE LOT =====

/**
 * Applique une écriture à chaque charge retenue, une par une
 *
 * Une par une, et non par un `update` multi-chemins : celui-ci est atomique,
 * donc une seule charge refusée par une règle ferait échouer les cinq autres,
 * sans dire laquelle. Le lot vaut mieux partiel qu'annulé — et le compte rendu
 * dit ce qui est passé.
 *
 * @param {Object} params
 * @param {string[]} params.ids - Charges visées
 * @param {Object|Function} params.champs - Ce qu'on écrit, ou une fabrique
 * @returns {Promise<{faites: number, refusees: number, echouees: string[]}>}
 */
async function ecrireSurLeLot({ ids, champs }) {
  const currentPeriod = getState('currentPeriod');
  const { dbUpdate } = await import('../db.js');

  let faites = 0;
  const echouees = [];

  for (const id of ids) {
    try {
      const aEcrire = typeof champs === 'function' ? champs(id) : champs;
      await dbUpdate(`periods/${currentPeriod}/variableCharges/${id}`, aEcrire);
      faites += 1;
    } catch (error) {
      echouees.push(id);
      warn(`[Lot] Charge ${id} non modifiée :`, error?.message || error);
    }
  }

  return { faites, refusees: echouees.length, echouees };
}

/**
 * Ce sur quoi un geste de lot peut porter, ou null s'il n'y a rien à faire
 *
 * La sélection est purgée juste avant le geste, jamais seulement à
 * l'affichage : entre le moment où l'on coche et celui où l'on valide, la liste
 * a pu se recharger — l'autre téléphone, le rejeu de la file hors ligne.
 *
 * @returns {{ids: string[], nombre: number, total: number}|null}
 */
function leLotDuMoment() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return null;
  }

  const charges = chargesAffichees();
  const ids = selectionPurgee(etat().ids, charges);
  if (ids.length === 0) {
    toast.error('Aucune charge sélectionnée');
    return null;
  }

  const { nombre, total } = resumeDeLaSelection(ids, charges);
  return { ids, nombre, total };
}

/**
 * Supprime les charges retenues, en une confirmation au lieu de N
 *
 * La suppression reste douce : `deleted: true`, donc tout reste dans la
 * corbeille. C'est ce qui rend ce geste-ci acceptable en lot — une sélection
 * malheureuse se rattrape, et l'annulation immédiate est offerte en plus.
 *
 * @returns {Promise<void>}
 */
export async function supprimerLaSelection() {
  const lot = leLotDuMoment();
  if (!lot) return;

  // Le total, et pas seulement le compte : « 6 charges » ne dit pas si l'on
  // s'apprête à effacer 40 € ou 1 400 €.
  const confirme = await showConfirmModal(
    `Supprimer ${lot.nombre} charge${lot.nombre > 1 ? 's' : ''} `
    + `(${formatCurrency(lot.total)}) ? Elles resteront dans la corbeille.`
  );
  if (!confirme) return;

  const currentPeriod = getState('currentPeriod');
  const { faites, refusees, echouees } = await ecrireSurLeLot({
    ids: lot.ids, champs: { deleted: true }
  });

  const { loadVariableCharges } = await moduleDesCharges();
  await loadVariableCharges();
  quitterLaSelection();
  calculateSummary();

  const rendu = compteRenduDuLot({ faites, refusees, geste: 'supprimées' });

  // L'annulation ne rend que ce qui a été retiré. Proposer de restaurer les
  // refusées ferait promettre un geste dont on sait déjà qu'il échouera.
  const rendues = lot.ids.filter(id => !echouees.includes(id));

  if (rendu.complet) {
    toast.success(rendu.texte, {
      onUndo: async () => {
        const { dbUpdate } = await import('../db.js');
        for (const id of rendues) {
          try {
            await dbUpdate(`periods/${currentPeriod}/variableCharges/${id}`, { deleted: false });
          } catch (error) {
            warn(`[Lot] Charge ${id} non restaurée :`, error?.message || error);
          }
        }
        await loadVariableCharges();
        calculateSummary();
        toast.success('Suppression annulée');
      }
    });
  } else {
    toast.warning(rendu.texte);
  }
}

/**
 * Range les charges retenues dans une catégorie
 *
 * Les trois champs sont écrits, et non le seul libellé : `categoryIcon` sert
 * de repli à l'anticipation des abonnements, et le laisser sur l'ancienne
 * catégorie donnerait une ligne cohérente à l'écran et fausse ailleurs.
 *
 * @param {string} label - Libellé de la catégorie, tel que le select le porte
 * @returns {Promise<void>}
 */
export async function appliquerCategorieAuLot(label) {
  const select = document.getElementById('selectionCategorie');
  if (!label) return;

  const categorie = getCategories().find(c => c && c.label === label);
  if (!categorie) {
    toast.error('Catégorie inconnue');
    if (select) select.value = '';
    return;
  }

  const lot = leLotDuMoment();
  if (select) select.value = '';
  if (!lot) return;

  const { faites, refusees } = await ecrireSurLeLot({
    ids: lot.ids,
    champs: {
      category: categorie.label,
      categoryId: categorie.id,
      categoryIcon: categorie.icon
    }
  });

  const { loadVariableCharges } = await moduleDesCharges();
  await loadVariableCharges();
  quitterLaSelection();
  calculateSummary();

  const rendu = compteRenduDuLot({ faites, refusees, geste: `rangées dans « ${categorie.label} »` });
  if (rendu.complet) toast.success(rendu.texte);
  else toast.warning(rendu.texte);
}

/**
 * Rattache les charges retenues à une enveloppe, ou les en détache
 *
 * `null` et non la chaîne vide pour détacher : Firebase supprime la clé, là où
 * une chaîne vide se lirait comme un identifiant d'enveloppe introuvable.
 *
 * @param {string} id - Identifiant d'enveloppe, ou '' pour détacher
 * @returns {Promise<void>}
 */
export async function appliquerEnveloppeAuLot(id) {
  const select = document.getElementById('selectionEnveloppe');

  // Le select porte une option « — Détacher — » de valeur `detacher`, distincte
  // du placeholder vide : sans elle, retirer l'enveloppe d'un lot serait le seul
  // geste que ce panneau ne saurait pas faire.
  if (!id) return;
  const detache = id === 'detacher';

  const lot = leLotDuMoment();
  if (select) select.value = '';
  if (!lot) return;

  const { faites, refusees } = await ecrireSurLeLot({
    ids: lot.ids, champs: { envelope: detache ? null : id }
  });

  const { loadVariableCharges } = await moduleDesCharges();
  await loadVariableCharges();
  quitterLaSelection();
  calculateSummary();

  const rendu = compteRenduDuLot({
    faites, refusees, geste: detache ? 'détachées de leur enveloppe' : 'rattachées'
  });
  if (rendu.complet) toast.success(rendu.texte);
  else toast.warning(rendu.texte);
}

// ===== L'ÉCRAN =====

/**
 * Redessine la liste et la barre
 *
 * La liste d'abord : la barre annonce un compte que la liste doit déjà
 * refléter, sans quoi l'un des deux ment pendant une image.
 *
 * ## Pourquoi le focus doit être rendu à la main
 *
 * Cocher redessine la liste entière, donc détruit la case qu'on vient de
 * toucher. À la souris cela ne se voit pas ; au clavier, le focus retombe sur
 * le corps du document, et cocher trois charges de suite demande de re-tabuler
 * depuis le début de la page à chaque fois. Le geste devient impraticable
 * précisément pour ceux qui n'ont pas d'autre moyen de le faire.
 *
 * @param {Object} [options]
 * @param {string} [options.rendreLaMainA] - Identifiant de la charge dont la
 *        case doit reprendre le focus après le rendu
 * @returns {void}
 */
function rafraichirLEcran({ rendreLaMainA } = {}) {
  moduleDesCharges()
    .then(({ renderVariableCharges }) => {
      renderVariableCharges();
      if (!rendreLaMainA) return;

      // Le sélecteur passe par `data-arg`, seul lien entre la case d'avant le
      // rendu et celle d'après : les nœuds, eux, ne sont plus les mêmes.
      const rendue = document.querySelector(
        `.charge-choix[data-arg="${CSS.escape(rendreLaMainA)}"]`
      );
      if (rendue) rendue.focus();
    })
    .catch(error => logError('❌ Rendu des charges impossible :', error));

  rafraichirLaBarre();
}

/**
 * Met la barre d'actions à l'état de la sélection
 * @returns {void}
 */
export function rafraichirLaBarre() {
  const barre = document.getElementById('selectionBarre');
  const bascule = document.getElementById('selectionBasculer');
  const compte = document.getElementById('selectionCompte');
  const { actif, ids } = etat();

  if (bascule) {
    bascule.setAttribute('aria-pressed', String(actif));
    bascule.textContent = actif ? 'Terminer' : 'Sélectionner';
  }

  if (barre) barre.hidden = !actif;
  if (!actif || !compte) return;

  const { nombre, total } = resumeDeLaSelection(ids, chargesAffichees());
  compte.textContent = nombre === 0
    ? 'Touchez les charges à traiter'
    : `${nombre} sélectionnée${nombre > 1 ? 's' : ''} · ${formatCurrency(total)}`;

  // Les gestes n'ont de sens que sur un lot non vide : les laisser actifs
  // ferait porter le refus par un toast là où un bouton grisé le dit d'avance.
  for (const id of ['selectionSupprimer', 'selectionCategorie', 'selectionEnveloppe']) {
    const element = document.getElementById(id);
    if (element) element.disabled = nombre === 0;
  }
}

/**
 * Initialise le mode sélection
 *
 * Idempotente comme les autres `init` : `auth.js` la rappelle à chaque
 * connexion, et les éléments de la barre vivent aussi longtemps que la page.
 *
 * @returns {void}
 */
export function initSelectionCharges() {
  log('📦 Initialisation module sélection multiple');

  poser({ actif: false, ids: [] });

  // Les listes du foyer peuvent avoir changé depuis la session précédente.
  const categorie = document.getElementById('selectionCategorie');
  if (categorie) {
    populateCategorySelect('selectionCategorie', {
      placeholder: '↦ Ranger dans…',
      // « Gérer les catégories… » ouvrirait un écran par-dessus une sélection en
      // cours, qu'il faudrait ensuite retrouver. Ce n'est pas le moment.
      addManageOption: false
    });
  }

  rafraichirLesEnveloppes();
  rafraichirLaBarre();

  window.basculerModeSelection = basculerModeSelection;
  window.basculerChargeChoisie = basculerChargeChoisie;
  window.toutSelectionner = toutSelectionner;
  window.supprimerLaSelection = supprimerLaSelection;
  window.appliquerCategorieAuLot = appliquerCategorieAuLot;
  window.appliquerEnveloppeAuLot = appliquerEnveloppeAuLot;

  log('✅ Module sélection multiple initialisé');
}

/**
 * Repeuple le choix d'enveloppes, avec l'option de détachement
 *
 * `populateEnvelopeSelect` ne connaît pas le détachement : sur un formulaire de
 * charge, l'absence d'enveloppe EST le placeholder. Sur un lot, le placeholder
 * veut dire « ne rien faire », et il faut donc un choix distinct pour « retirer
 * l'enveloppe ».
 *
 * @returns {void}
 */
function rafraichirLesEnveloppes() {
  const select = document.getElementById('selectionEnveloppe');
  if (!select) return;

  populateEnvelopeSelect('selectionEnveloppe', '');

  // Le placeholder posé par `populateEnvelopeSelect` dit « aucune enveloppe »,
  // ce qui est faux ici : il veut dire « ne rien changer ».
  const placeholder = select.querySelector('option[value=""]');
  if (placeholder) placeholder.textContent = '✉ Rattacher à…';

  if (!select.querySelector('option[value="detacher"]')) {
    const detacher = document.createElement('option');
    detacher.value = 'detacher';
    detacher.textContent = '— Retirer l\'enveloppe —';
    select.appendChild(detacher);
  }
}
