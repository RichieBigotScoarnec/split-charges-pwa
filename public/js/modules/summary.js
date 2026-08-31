// ===== MODULE : GESTION DU BILAN/SUMMARY =====
// Fonctionnalités : calculateSummary, renderSummary

import { getState, setState } from '../state.js';
import { refreshSearchVisibility } from './search.js';
import { formatCurrency, escapeHtml } from '../utils/format.js';
import { suivreLeBilan, CLASSE_REDONDANTE } from '../utils/barre-solde.js';
import { computeSummary, exigeLesSalaires, computeVirementsByDestination, resolveShareMode, resolvePercents } from '../utils/calculations.js';
import { resolveIncomeBase } from '../utils/salaries.js';
import { describeBalance, memberLabel } from '../utils/members.js';
import { previsionnelDuMois } from '../utils/previsionnel.js';
import { anticiper } from '../utils/anticipation.js';
import { rapportDuMois } from '../utils/rapport-mensuel.js';
import { chargesDeLEnveloppeTousMois, totalEnveloppe } from '../utils/enveloppes.js';
import { jourEtMois, getCurrentPeriod } from '../utils/date.js';
import { renderCategoryBudgets } from './category-budgets.js';
import { log, warn } from '../utils/debug.js';
import { parseMontantOu } from '../utils/montant.js';

/**
 * Initialise le module summary
 */
export function initSummary() {
  log('📦 Initialisation module summary/bilan');
  log('✅ Module summary/bilan initialisé');
}

/**
 * N'affiche les tendances que s'il y a quelque chose à analyser
 *
 * Sur une application encore vide, le premier écran proposait « 📈 Tendances
 * sur 6 mois » à côté d'« Enveloppes » et « Privé » — trois commandes au-dessus
 * de zéro donnée. Un état vide est pourtant le seul moment où l'application a
 * l'attention entière de quelqu'un qui ne sait rien : le remplir d'outils
 * inertes gaspille ce moment, et enseigne que la moitié des boutons ne font
 * rien.
 *
 * Le même raisonnement que `refreshSearchVisibility`, et que le bouton de la
 * carte — masqué tant qu'aucune dépense n'est localisée — ou celui du rapport,
 * qui n'est pas rendu sans historique. Ce qui change ici, c'est seulement
 * qu'un dépliant vide se remarque moins qu'un panneau vide : personne ne
 * l'avait vu.
 *
 * Les deux autres commandes restent, elles : « Enveloppes » et « Privé »
 * CRÉENT quelque chose. Les masquer empêcherait d'ouvrir une cagnotte avant
 * d'avoir saisi une dépense, ce qui est un ordre parfaitement légitime.
 */
function refreshTrendsVisibility(historique) {
  const section = document.getElementById('trendsSection');
  if (!section) return;

  const duMois = ['fixedCharges', 'variableCharges']
    .flatMap(cle => getState(cle) || [])
    .some(charge => charge && !charge.deleted);

  // L'historique suffit à justifier le panneau même si le mois affiché est
  // vide : c'est précisément le cas où une tendance se regarde. L'instantané
  // frais d'abord — il fait autorité et arrive avant que l'état ne le porte —,
  // puis celui que l'état a conservé des rendus précédents.
  const rempli = (noeud) => Boolean(
    noeud && typeof noeud === 'object' && Object.keys(noeud).length > 0
  );
  const passe = rempli(historique) || rempli(getState('historiquePourLeRapport'));

  section.hidden = !duMois && !passe;
}

/**
 * Calcule le bilan financier complet
 * @returns {Object} Résumé du bilan
 */
export function calculateSummary({ historique } = {}) {
  // La recherche n'a de sens que s'il existe des charges à filtrer
  refreshSearchVisibility();

  // Les tendances non plus : elles analysent un historique.
  //
  // L'instantané est passé EN PARAMÈTRE, et pas seulement relu dans l'état :
  // `historiquePourLeRapport` n'y est déposé que plus bas, par
  // `historiqueUtilisable`. S'en remettre à l'état seul masquait donc le
  // panneau au PREMIER rendu — celui qui suit la connexion — même sur un foyer
  // de trois ans d'historique, pour ne le faire reparaître qu'au rendu suivant.
  // Douze contrôles de bout en bout l'ont dit ; aucun contrôle unitaire ne
  // pouvait le voir, l'ordre de deux lignes n'étant pas une valeur.
  refreshTrendsVisibility(historique);

  const salaries = getState('salaries') || { vous: 0, conjointe: 0 };
  const fixedCharges = getState('fixedCharges') || [];
  const variableCharges = getState('variableCharges') || [];
  const reimbursements = getState('reimbursements') || [];
  // Le mois affiché peut avoir figé son mode (reconduction) : c'est celui-là
  // qui décide, exactement comme dans `computeBalanceChain`. Même fabrique des
  // deux côtés — sans quoi l'écran et le report annoncent deux chiffres pour
  // le même mois.
  const shareMode = resolveShareMode(getState('shareModeDuMois'), getState('shareMode'));
  // Les pourcentages figés du mois, s'il en a. Figer le mode sans ses
  // paramètres ne protégeait rien sur « custom », le seul mode qui en porte.
  const customPercents = resolvePercents(
    getState('customPercentsDuMois'),
    getState('customPercents') || { vous: 50, conjointe: 50 }
  );

  // Le prorata porte sur l'ensemble des revenus, salaires et revenus
  // complémentaires confondus : c'est cette assiette qui décide des parts.
  const incomeBase = resolveIncomeBase(salaries);
  const totalSalaries = incomeBase.total;

  // Si pas de salaires, impossible de calculer — mais seulement au prorata.
  //
  // La condition était inconditionnelle : choisir le 50-50 et laisser les
  // salaires vides affichait « Renseignez vos deux salaires pour obtenir le
  // bilan du mois », un conseil faux puisque ce mode n'en regarde aucun.
  // L'application obligeait donc deux personnes à se divulguer leurs revenus
  // pour se servir d'un partage à parts égales — souvent la raison même du
  // choix.
  if (exigeLesSalaires(shareMode) && totalSalaries === 0) {
    // Le solde publié dans l'état sert aux rappels, qui ne peuvent pas
    // importer ce module sans créer un cycle.
    setState('dernierSolde', 0);
    // Sans bilan, pas de rapport — et surtout pas celui du mois précédent, que
    // l'état porterait encore. Le bouton n'est de toute façon pas rendu sur ce
    // chemin, mais un état périmé finit toujours par trouver un lecteur.
    setState('rapportDuMois', null);

    const summaryElement = document.getElementById('summarySection');
    if (summaryElement) {
      updateBalanceBar(null, '');
      summaryElement.innerHTML =
        '<div class="empty-state">' +
        '<p>Renseignez vos deux salaires pour obtenir le bilan du mois.</p>' +
        '<button type="button" class="btn btn-primary" data-action="focusSalaries">' +
        'Renseigner les salaires</button>' +
        '</div>';
    }
    return { total: 0, yourShare: 0, partnerShare: 0, balance: 0 };
  }

  // Report du mois précédent : nul tant que la fonction n'est pas activée,
  // l'ajout est donc sans effet sur le comportement historique.
  const carryOver = getState('carryOver') || 0;

  // Calculs purs délégués à utils/calculations.js (couverts par tests unitaires)
  const summary = computeSummary({
    salaries, fixedCharges, variableCharges, reimbursements, shareMode, customPercents, carryOver
  });

  // Publié pour les rappels : eux ne peuvent pas appeler ce module sans créer
  // un cycle d'imports, et le solde est la seule chose qu'ils aient à savoir.
  setState('dernierSolde', summary.balance);

  // Récap virements par destination (charges fixes actives uniquement)
  const activeFixed = fixedCharges.filter(c => !c.deleted);
  const virementsByDestination = computeVirementsByDestination(activeFixed, {
    shareMode, salaries: incomeBase, totalSalaries, customPercents
  });

  // Afficher le résumé
  renderSummary({
    previsionnel: previsionnelDuMois({ fixedCharges, variableCharges }),
    observations: observationsDuMois(historique),
    rapport: rapportDuMoisAffiche(historique, summary, salaries),
    totalCharges: summary.total,
    yourTheoricalShare: summary.yourShare,
    partnerTheoricalShare: summary.partnerShare,
    yourActualPayments: summary.yourActualPayments,
    partnerActualPayments: summary.partnerActualPayments,
    balanceBeforeReimbs: summary.balanceBeforeReimbs,
    reimbursementAdjustment: summary.reimbursementAdjustment,
    carryOver: summary.carryOver,
    finalBalance: summary.balance,
    virementsByDestination
  });

  return {
    total: summary.total,
    yourShare: summary.yourShare,
    partnerShare: summary.partnerShare,
    balance: summary.balance
  };
}

/**
 * L'historique sur lequel le rapport peut se fonder
 *
 * `calculateSummary` est appelée depuis treize endroits, et deux seulement lui
 * passent un instantané : le chargement du mois et le règlement du solde. Tous
 * les autres suivent une ÉCRITURE — ajouter une charge, en corriger une, vider
 * la corbeille. Sans cette fabrique, le bouton « Le mois en un coup d'œil »
 * paraissait à l'ouverture puis disparaissait à la première saisie, et ne
 * revenait qu'au changement de mois. Une commande qui va et vient s'apprend
 * comme une commande à laquelle on ne peut pas se fier.
 *
 * Recharger `periods` à chaque rendu était exclu : quatre lectures du nœud
 * entier par ouverture représentaient 96 % de ce que l'application téléchargeait
 * — c'est très exactement ce qu'on vient de corriger.
 *
 * Ce qui est conservé est donc le seul historique, celui des mois RÉVOLUS, que
 * la saisie en cours ne touche jamais. Le mois affiché, lui, est reconstruit à
 * chaque appel depuis l'état vivant : les charges qu'on vient d'écrire. Aucun
 * chiffre périmé ne peut donc entrer dans le rapport — ce qui change est relu,
 * ce qui est conservé ne change pas.
 *
 * @param {Object} [historique] - Instantané frais, quand l'appelant en a un
 * @returns {Object|null} Nœud `periods` utilisable, ou `null`
 */
function historiqueUtilisable(historique) {
  if (historique && typeof historique === 'object') {
    // Un instantané frais fait toujours autorité, et devient la référence des
    // rendus qui suivront cette écriture.
    setState('historiquePourLeRapport', historique);
    return historique;
  }

  const conserve = getState('historiquePourLeRapport');
  if (!conserve || typeof conserve !== 'object') return null;

  const mois = getState('currentPeriod');
  if (!mois) return null;

  const parIdentifiant = (charges) => Object.fromEntries(
    (Array.isArray(charges) ? charges : [])
      .filter(charge => charge && charge.id)
      .map(charge => [charge.id, charge])
  );

  return {
    ...conserve,
    [mois]: {
      ...(conserve[mois] || {}),
      salaries: getState('salaries') || (conserve[mois] || {}).salaries,
      fixedCharges: parIdentifiant(getState('fixedCharges')),
      variableCharges: parIdentifiant(getState('variableCharges'))
    }
  };
}

/**
 * Le rapport du mois, déposé dans l'état pour la modale qui l'ouvrira
 *
 * Le bilan est passé tel quel : ce module ne réadditionne rien. C'est la même
 * règle que partout ailleurs ici — un second calcul du même nombre finit par
 * diverger du premier, et l'écran se met alors à expliquer un chiffre qu'il
 * n'affiche pas.
 *
 * L'historique est OPTIONNEL, comme pour la veille : sans lui il n'y a ni mois
 * ordinaire ni catégorie qui a bougé, c'est-à-dire presque rien à dire. Le
 * rapport vaut alors `null` et le bouton n'est pas rendu — plutôt qu'un bouton
 * qui ouvre une page à moitié vide.
 *
 * @param {Object} [historique] - Nœud `periods`, lu dans le même geste
 * @param {Object} bilan - Sortie de `computeSummary` pour le mois affiché
 * @param {Object} salaries - Instantané de revenus du mois
 * @returns {Object|null}
 */
function rapportDuMoisAffiche(historique, bilan, salaries) {
  const periods = historiqueUtilisable(historique);

  if (!periods) {
    setState('rapportDuMois', null);
    return null;
  }

  try {
    const rapport = rapportDuMois({
      periods,
      mois: getState('currentPeriod'),
      // Le mois du calendrier : c'est lui qui dit si le mois rapporté est
      // encore en cours, donc incomplet, donc incomparable à des mois entiers.
      moisReel: getCurrentPeriod(),
      bilan,
      salaries
    });

    setState('rapportDuMois', rapport);
    return rapport;
  } catch (erreur) {
    // Un rapport n'est jamais indispensable : son échec ne doit pas emporter le
    // bilan, qui, lui, l'est.
    warn('⚠️ Rapport du mois indisponible :', erreur);
    setState('rapportDuMois', null);
    return null;
  }
}

/**
 * Ce que l'application remarque, à partir de l'historique qu'on lui confie
 *
 * Le paramètre est OPTIONNEL, comme partout ailleurs dans cette application :
 * `calculateSummary` est appelée depuis une dizaine d'endroits, et la plupart
 * n'ont pas l'historique sous la main. Sans lui, la veille **se tait** — un
 * total d'enveloppe calculé sur le seul mois affiché serait faux pour toute
 * enveloppe qui traverse les mois, ce qui est le cas de celles qui nous
 * intéressent ici.
 *
 * Le mode de dégradation est donc le silence, jamais un chiffre partiel
 * présenté comme complet.
 *
 * @param {Object} [historique] - Nœud `periods`, lu dans le même geste
 * @returns {Array<Object>} Observations, ou liste vide
 */
function observationsDuMois(historique) {
  if (!historique || typeof historique !== 'object') return [];

  try {
    // Deux totaux, parce que deux mesures les attendent et qu'elles ne veulent
    // pas le même. Les confondre faisait projeter le cumul de tous les mois
    // contre une allocation MENSUELLE, et crier « ne tiendra pas le mois » sur
    // une enveloppe qui tenait.
    const duMois = [...(getState('fixedCharges') || []), ...(getState('variableCharges') || [])];

    const enveloppes = (getState('envelopes') || []).map(enveloppe => ({
      enveloppe,
      // Tous mois confondus : ce qu'ont coûté les vacances en tout, et non ce
      // qu'elles ont coûté au mois qu'on regarde. C'est ce dont la provision a
      // besoin.
      depense: totalEnveloppe(chargesDeLEnveloppeTousMois(historique, enveloppe.id), enveloppe.id),
      // Le mois affiché seul : ce qu'attend « à ce rythme, tiendra-t-elle ? ».
      depenseDuMois: totalEnveloppe(duMois, enveloppe.id)
    }));

    const aujourdhui = new Date();
    // Rangées dans l'état : le bouton d'une carte ne porte que sa clé, et
    // c'est ici que le gestionnaire retrouve la proposition correspondante.
    const vues = anticiper({
      enveloppes,
      // Ce que le foyer a déjà mis en place ne se propose plus : sans cette
      // liste, la carte reparaîtrait après qu'on l'a acceptée.
      listeEnveloppes: getState('envelopes') || [],
      periods: historique,
      moisCourant: getState('currentPeriod'),
      // Le mois du CALENDRIER, distinct de celui du sélecteur. Le jour et la
      // durée qui suivent viennent de l'horloge : sans ce rapprochement, la
      // projection du mois s'appliquerait au mois affiché quel qu'il soit, et
      // prévoirait la fin d'un mois clos depuis trois mois.
      moisReel: getCurrentPeriod(),
      jourDuMois: aujourdhui.getDate(),
      joursDuMois: new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() + 1, 0).getDate()
    });

    setState('observations', vues);
    return vues;
  } catch (erreur) {
    // Une observation n'est jamais indispensable : son échec ne doit pas
    // emporter le bilan, qui, lui, l'est.
    warn('⚠️ Veille indisponible :', erreur);
    setState('observations', []);
    return [];
  }
}

/**
 * Ce que l'application a remarqué, rendu à l'écran
 *
 * Chaque observation porte son fondement : le foyer doit pouvoir vérifier d'où
 * sort le chiffre, sinon ce n'est plus un conseil mais une injonction.
 *
 * Rien à dire est le cas courant d'un mois qui se passe bien : on rend une
 * chaîne vide plutôt qu'un encadré « tout va bien », qui deviendrait du bruit.
 *
 * @param {Array<Object>} observations - Sortie de `veiller`
 * @returns {string} Fragment HTML échappé, ou chaîne vide
 */
/**
 * Combien d'observations restent sous le solde
 *
 * Le premier écran appartient au solde. Avec sept détecteurs, tout afficher
 * repousserait le chiffre qu'on vient chercher sous une pile de conseils — et
 * une vraie alerte se lirait comme du décor. Les autres restent atteignables
 * d'un geste, jamais cachées.
 */
const VUES_EN_TETE = 3;

/**
 * Une observation, avec le geste qu'elle propose s'il y en a un
 *
 * Le bouton ne porte que la CLÉ de l'observation, jamais sa proposition : les
 * libellés viennent des charges saisies par le foyer, et faire transiter un
 * objet par un attribut du DOM en ferait une surface d'injection. Le
 * gestionnaire relit la proposition dans l'état.
 *
 * @param {Object} vue
 * @returns {string} Fragment HTML échappé
 */
function ligneObservation(vue) {
  // Deux gestes possibles, jamais les deux : une échéance se PROVISIONNE, un
  // abonnement se DÉCLARE. Un détecteur qui porterait les deux propositions
  // offrirait deux boutons pour une seule décision.
  let action = '';

  if (vue.proposition) {
    action = `<button type="button" class="btn btn-secondary veille-action"
         data-action="creerEnveloppeProposee" data-arg="${escapeHtml(vue.cle)}">
         Mettre de côté pour ça
       </button>`;
  } else if (vue.propositionFixe) {
    // Le constat devient un geste. Sans lui, « Netflix revient chaque mois »
    // envoyait ressaisir la charge à la main, dans un formulaire à neuf champs
    // — un conseil plus coûteux que de ne rien faire.
    action = `<button type="button" class="btn btn-secondary veille-action"
         data-action="declarerAbonnementsProposes" data-arg="${escapeHtml(vue.cle)}">
         ${vue.propositionFixe.charges.length === 1
    ? 'Déclarer en charge fixe' : 'Déclarer en charges fixes'}
       </button>`;
  }

  return `
    <li class="veille-item veille-item--${escapeHtml(vue.urgence)}">
      <span class="veille-icone" aria-hidden="true">${vue.urgence === 'attention' ? '⚠️' : '💡'}</span>
      <span class="veille-corps">
        <span class="veille-titre">${escapeHtml(vue.titre)}</span>
        <span class="veille-detail">${escapeHtml(vue.detail)}</span>
        <span class="veille-fonde">${escapeHtml(vue.fonde)}</span>
        ${action}
      </span>
    </li>
  `;
}

function renderObservations(observations) {
  const vues = Array.isArray(observations) ? observations : [];
  if (vues.length === 0) return '';

  const tete = vues.slice(0, VUES_EN_TETE).map(ligneObservation).join('');
  const reste = vues.slice(VUES_EN_TETE);

  const suite = reste.length === 0 ? '' : `
    <details class="veille-reste">
      <summary>${reste.length} autre${reste.length > 1 ? 's' : ''}</summary>
      <ul class="veille-liste">${reste.map(ligneObservation).join('')}</ul>
    </details>
  `;

  return `
    <section class="summary-veille" aria-label="Ce que l'application a remarqué">
      <ul class="veille-liste">${tete}</ul>
      ${suite}
    </section>
  `;
}

/**
 * Assemble la phrase du solde autour du montant
 *
 * Le montant est mis en évidence ; le reste vient de describeBalance, qui
 * accorde la conjugaison au sujet.
 *
 * @param {Object} solde - Sortie de describeBalance
 * @param {number} montant - Solde du mois
 * @returns {string} Fragment HTML
 */
function phraseSolde(solde, montant) {
  const somme = `<strong>${formatCurrency(Math.abs(montant))}</strong>`;
  return solde.suffixe
    ? `${escapeHtml(solde.prefixe)} ${somme} ${escapeHtml(solde.suffixe)}`
    : `${escapeHtml(solde.prefixe)} ${somme}`;
}

/**
 * Affiche le bilan dans le DOM
 * @param {Object} summary - Résumé calculé
 */
function renderSummary(summary) {
  const summaryElement = document.getElementById('summarySection');
  if (!summaryElement) {
    warn('⚠️ Element #summarySection introuvable');
    return;
  }

  const {
    previsionnel,
    observations,
    rapport,
    totalCharges,
    yourTheoricalShare,
    partnerTheoricalShare,
    yourActualPayments,
    partnerActualPayments,
    reimbursementAdjustment,
    carryOver,
    finalBalance,
    virementsByDestination
  } = summary;

  // Calculer les pourcentages de répartition
  const yourPercent = totalCharges > 0 ? Math.round((yourTheoricalShare / totalCharges) * 100) : 50;
  const partnerPercent = totalCharges > 0 ? 100 - yourPercent : 50;

  // Déterminer qui doit à qui
  const membres = getState('members');
  const nomVous = memberLabel('vous', membres);
  const nomConjointe = memberLabel('conjointe', membres);
  const soldeDit = describeBalance(finalBalance, membres);

  let balanceText;
  let balanceClass;

  if (finalBalance > 0) {
    balanceText = phraseSolde(soldeDit, finalBalance);
    balanceClass = 'balance-positive';
  } else if (finalBalance < 0) {
    balanceText = phraseSolde(soldeDit, finalBalance);
    balanceClass = 'balance-negative';
  } else {
    balanceText = `<strong>Comptes équilibrés</strong> — rien à se rembourser`;
    balanceClass = 'balance-zero';
  }

  // Explication du calcul (utilise le solde arrondi pour éviter décalage d'1 centime)
  let balanceExplanation = '';
  if (carryOver !== 0) {
    // Avec un report, « a payé plus que sa part » serait faux : le solde
    // affiché mêle le mois courant et l'ardoise des mois précédents. On dit
    // donc explicitement quelle part vient du passé.
    const debiteur = carryOver > 0 ? 'la conjointe devait' : 'vous deviez';
    balanceExplanation = `<small>dont ${formatCurrency(Math.abs(carryOver))} que ${debiteur} déjà au titre des mois précédents</small>`;
  } else if (finalBalance !== 0) {
    const overpayer = soldeDit.crediteur;
    balanceExplanation = `<small>${escapeHtml(overpayer)} a payé ${formatCurrency(Math.abs(finalBalance))} de plus que sa part</small>`;
  }

  // L'action n'a de sens que s'il reste quelque chose à régler, et elle vit
  // dans le bilan — pas dans la barre.
  //
  // Elle a été dans la barre tant que celle-ci restait visible en permanence :
  // c'était là qu'on lisait le solde. Depuis que la barre s'efface tant que le
  // bilan dit la même chose, l'y laisser rendait le bouton inatteignable
  // précisément sur le premier écran, celui où l'on décide de solder. Sept
  // contrôles de bout en bout l'ont dit avant qu'on ne s'en aperçoive à
  // l'usage.
  //
  // Le bilan porte le montant, son explication et maintenant son geste. La
  // barre redevient ce qu'elle prétend être : un rappel pendant qu'on parcourt
  // les charges, qui invite à remonter.
  const settleButton = finalBalance !== 0
    ? '<button type="button" class="btn-settle" data-action="settleBalance">Régler ce solde</button>'
    : '';

  // Le texte est enveloppé : sans cela, la mise en page flex de la barre
  // scinderait « Conjointe vous doit » et le montant en deux éléments séparés
  // par un intervalle.
  // Même texte que le bilan : une seule source, pas de calcul dupliqué
  updateBalanceBar(`<span>${balanceText}</span>`, balanceClass);

  // Les budgets se lisent sur les mêmes charges que le bilan : ils se
  // rafraîchissent au même moment, sans hameçon supplémentaire dans chaque
  // chargeur.
  renderCategoryBudgets();

  summaryElement.innerHTML = `
    <div class="summary-card">
      <div class="summary-balance ${balanceClass}">
        ${balanceText}
        ${balanceExplanation}
        ${settleButton}
      </div>

      ${renderPrevisionnel(previsionnel)}
      ${renderObservations(observations)}

      <details class="summary-details">
        <summary>Voir le détail</summary>

        <div class="summary-row summary-total-row">
          <span>Total des charges</span>
          <strong>${formatCurrency(totalCharges)}</strong>
        </div>

        <div class="summary-divider"></div>

        <div class="summary-section-label">Répartition à payer</div>
        <div class="summary-row">
          <span>${escapeHtml(nomVous)} <span class="summary-percent">${yourPercent}%</span></span>
          <strong>${formatCurrency(yourTheoricalShare)}</strong>
        </div>
        <div class="summary-row">
          <span>${escapeHtml(nomConjointe)} <span class="summary-percent">${partnerPercent}%</span></span>
          <strong>${formatCurrency(partnerTheoricalShare)}</strong>
        </div>

        <div class="summary-divider"></div>

        <div class="summary-section-label">Paiements réels</div>
        <button type="button" class="summary-row summary-row--ouvrable"
                data-action="ouvrirDetailPayeur" data-arg="vous">
          <span>${escapeHtml(nomVous)} a payé</span>
          <strong>${formatCurrency(yourActualPayments)}</strong>
        </button>
        <button type="button" class="summary-row summary-row--ouvrable"
                data-action="ouvrirDetailPayeur" data-arg="conjointe">
          <span>${escapeHtml(memberLabel('conjointe', getState('members')))} a payé</span>
          <strong>${formatCurrency(partnerActualPayments)}</strong>
        </button>

        ${reimbursementAdjustment !== 0 ? `
          <div class="summary-divider"></div>
          <div class="summary-row">
            <span>Remboursements effectués</span>
            <strong class="${reimbursementAdjustment > 0 ? 'positive' : 'negative'}">${reimbursementAdjustment > 0 ? '+' : ''}${formatCurrency(reimbursementAdjustment)}</strong>
          </div>
        ` : ''}
      </details>

      ${rapport && !rapport.vide
        ? `<button type="button" class="btn btn-secondary rapport-ouvrir" data-action="ouvrirRapportDuMois">
             📄 Le mois en un coup d'œil
           </button>`
        : ''}
    </div>

    ${renderBudgetGauge(totalCharges)}

    ${virementsByDestination && virementsByDestination.length > 0 ? `
    <div class="summary-card virements-recap">
      <h3>🏦 Récap virements — ${escapeHtml(nomConjointe)}</h3>
      <p class="virements-subtitle">Montants à virer par destination</p>

      ${virementsByDestination.map(group => `
        <div class="virement-group">
          <div class="virement-destination">
            <span class="virement-dest-name">${escapeHtml(group.destination)}</span>
            <strong class="virement-dest-total">${formatCurrency(group.total)}</strong>
          </div>
          <div class="virement-details">
            ${group.charges.map(c => `
              <div class="virement-detail-row">
                <span>${escapeHtml(c.description)}</span>
                <span>${formatCurrency(c.partnerShare)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}

      <div class="summary-divider"></div>
      <div class="summary-row virement-grand-total">
        <span>Total virements :</span>
        <strong>${formatCurrency(virementsByDestination.reduce((sum, g) => sum + g.total, 0))}</strong>
      </div>
    </div>
    ` : ''}
  `;

  // Le bilan vient d'être réécrit : l'élément que la barre observait n'existe
  // plus. Sans ce rappel, l'observation resterait posée sur un nœud détaché —
  // ce qui ne lève rien, mais fige la barre dans son dernier état.
  suivreLeBilan();
}

/**
 * Reflète le solde net dans la barre collante
 *
 * L'application répond à une question — qui doit combien à qui — et il fallait
 * faire défiler jusqu'au bilan pour la lire. La barre reprend le texte déjà
 * produit pour le bilan : aucune logique de calcul n'est dupliquée.
 *
 * @param {string|null} html - Texte du solde, déjà échappé ; null pour masquer
 * @param {string} cssClass - balance-positive | balance-negative | balance-zero
 */
function updateBalanceBar(html, cssClass) {
  const bar = document.getElementById('balanceBar');
  if (!bar) return;

  if (!html) {
    bar.hidden = true;
    bar.innerHTML = '';
    // La classe s'en va avec le contenu : la garder ferait qu'un solde
    // redevenu calculable ressusciterait la barre déjà repliée, sans que le
    // bilan ait rien à voir avec cet état.
    bar.classList.remove(CLASSE_REDONDANTE);
    return;
  }

  bar.className = `balance-bar ${cssClass}`;
  bar.innerHTML = html;
  bar.hidden = false;
}

/**
 * Annonce ce qui reste à passer ce mois-ci
 *
 * Le bilan répond à « combien avons-nous dépensé », jamais à « combien
 * reste-t-il à passer » — alors que la donnée est là depuis la reconduction :
 * au premier du mois, les charges fixes récurrentes sont déjà inscrites,
 * chacune à son quantième. Au 3 du mois, le solde annonce donc un total dont
 * les trois quarts ne sont pas encore sortis du compte.
 *
 * La dernière phrase n'est pas une politesse : sans elle, ce bloc semblerait
 * contredire le solde juste au-dessus, qui compte déjà ces montants. Un
 * chiffre qu'on ne sait pas raccorder au précédent est pire qu'un chiffre
 * absent.
 *
 * Rien à annoncer quand tout est passé — fin de mois, ou mois révolu : le bloc
 * disparaît au lieu d'afficher un zéro qui n'apprend rien.
 *
 * @param {Object|null} previsionnel - Sortie de `previsionnelDuMois`
 * @returns {string} Fragment HTML, ou chaîne vide
 */
function renderPrevisionnel(previsionnel) {
  if (!previsionnel) return '';

  const { aVenir, total, nombreAVenir, prochaines, datees } = previsionnel;

  // Rien devant, mais on sait pourquoi : le dire, plutôt que disparaître.
  //
  // Le panneau se taisait dès que tout était passé. Le 25 du mois, avec des
  // charges datées du 3 et du 12, il ne montrait donc rien — et un panneau
  // absent est indiscernable d'une fonctionnalité en panne. C'est ainsi qu'il a
  // été signalé. Une ligne coûte moins qu'un doute.
  if (nombreAVenir === 0) {
    // Sans aucune date, on ne sait pas : affirmer que tout est passé serait
    // inventer. Là, le silence est la seule réponse honnête.
    if (datees === 0) return '';

    return `
      <div class="summary-previsionnel previsionnel-solde">
        <div class="previsionnel-montant">
          <span aria-hidden="true">✅</span>
          Tout est passé ce mois-ci
          <span class="previsionnel-sur">${formatCurrency(total)} au total</span>
        </div>
      </div>
    `;
  }

  // Les libellés viennent du foyer : ils passent par `escapeHtml`, comme
  // partout où du contenu saisi entre dans du HTML.
  const nommees = prochaines.map(charge => {
    const quand = jourEtMois(charge.date);
    const libelle = escapeHtml(charge.description || 'Sans libellé');
    return quand ? `${libelle} le ${escapeHtml(quand)}` : libelle;
  });

  // « …le 3 sept., 1 autre » se lit comme une quatrième échéance nommée « 1 ».
  // La conjonction dit ce que la virgule laissait deviner de travers.
  const reste = nombreAVenir - prochaines.length;
  const liste = reste > 0
    ? `${nommees.join(', ')} et ${reste} autre${reste > 1 ? 's' : ''}`
    : nommees.join(', ');

  return `
    <div class="summary-previsionnel">
      <div class="previsionnel-montant">
        <span aria-hidden="true">⏳</span>
        <strong>${formatCurrency(aVenir)}</strong> encore à passer
        <span class="previsionnel-sur">sur ${formatCurrency(total)}</span>
      </div>
      <small class="previsionnel-detail">
        ${liste} — déjà comptés dans le solde ci-dessus
      </small>
    </div>
  `;
}

/**
 * Génère le HTML de la jauge budget si le budget est activé
 * @param {number} totalCharges - Total des charges du mois
 * @returns {string} HTML de la jauge ou chaîne vide
 */
function renderBudgetGauge(totalCharges) {
  const budgetToggle = document.getElementById('reminderBudget');
  const budgetInput = document.getElementById('budgetAmount');

  if (!budgetToggle || !budgetToggle.checked || !budgetInput) return '';

  const budgetLimit = parseMontantOu(budgetInput.value);
  if (budgetLimit <= 0) return '';

  const percentage = Math.min((totalCharges / budgetLimit) * 100, 100);
  const remaining = budgetLimit - totalCharges;

  let statusClass = 'budget-ok';
  let statusIcon = '✅';
  let statusText = `Reste ${formatCurrency(remaining)}`;

  if (percentage >= 100) {
    statusClass = 'budget-over';
    statusIcon = '🚨';
    statusText = `Dépassé de ${formatCurrency(Math.abs(remaining))}`;
  } else if (percentage >= 80) {
    statusClass = 'budget-warning';
    statusIcon = '⚠️';
    statusText = `Reste ${formatCurrency(remaining)}`;
  }

  return `
    <div class="summary-card budget-gauge ${statusClass}">
      <h3>${statusIcon} Budget mensuel</h3>
      <div class="budget-progress-container">
        <div class="budget-progress-bar">
          <div class="budget-progress-fill ${statusClass}" style="width: ${percentage}%"></div>
        </div>
        <div class="budget-progress-labels">
          <span>${formatCurrency(totalCharges)}</span>
          <span>${formatCurrency(budgetLimit)}</span>
        </div>
      </div>
      <div class="budget-status">
        <span class="budget-percentage">${Math.round(percentage)}%</span>
        <span class="budget-remaining">${statusText}</span>
      </div>
    </div>
  `;
}

// Note : La reconduction de période est gérée par le module reconduction.js
