// ===== MODULE : GESTION DU BILAN/SUMMARY =====
// Fonctionnalités : calculateSummary, renderSummary

import { getState, setState } from '../state.js';
import { refreshSearchVisibility } from './search.js';
import { formatCurrency, escapeHtml } from '../utils/format.js';
import { suivreLeBilan, CLASSE_REDONDANTE } from '../utils/barre-solde.js';
import { computeSummary, exigeLesSalaires, computeVirementsByDestination, resolveShareMode, resolvePercents, computeMoisPersonnel } from '../utils/calculations.js';
import { resolveIncomeBase } from '../utils/salaries.js';
import { describeBalance, memberLabel, normaliserEmplacement } from '../utils/members.js';
import { previsionnelDuMois } from '../utils/previsionnel.js';
import { anticiper, projectionDuMois } from '../utils/anticipation.js';
import { rapportDuMois } from '../utils/rapport-mensuel.js';
import { chargesDeLEnveloppeTousMois, totalEnveloppe } from '../utils/enveloppes.js';
import {
  jourEtMois, dateDuJour, joursDeLaPeriode, etatDuMois, formatPeriod
} from '../utils/date.js';
import { renderCategoryBudgets } from './category-budgets.js';
import { lignePriveeACompter, initResumePrive } from './resume-prive.js';
import { expliquerLeReport } from '../utils/explication-solde.js';
import { log, warn } from '../utils/debug.js';
import { parseMontantOu } from '../utils/montant.js';
import { libelleDeLaRepartition } from '../utils/repartition.js';
import { decomposerParRegle } from '../utils/decomposition.js';
import { PORTEES, porteeRetenue, porteeRappelleLeSolde, porteeMontreLeFoyer } from '../utils/portee.js';
import { marquerLeSoldeDu } from './selecteur-portee.js';
import { remplirLePanneauPrive } from './prive.js';
import { teteDuBilan, gabaritDeTete } from '../utils/tete-du-bilan.js';
import { emplacementOppose } from '../utils/confidentialite.js';

/**
 * Quelle question le résumé affiche
 *
 * ## Pourquoi deux versants
 *
 * L'application répond à DEUX questions, et une seule avait un chiffre :
 * « qui doit combien à qui » (le foyer) et « qu'est-ce que ce mois me coûte »
 * (moi). Les empiler dans une seule carte met deux montants dominants en
 * concurrence et pousse le second sous la ligne de flottaison sur mobile.
 *
 * ## LA COMMANDE N'EST PLUS ICI — 2026-09-08
 *
 * Ce module portait sa propre bascule, `ongletDuResume`, et le sélecteur de
 * portée en portait une seconde. Deux commandes, deux états, une seule
 * grandeur : l'écran annonçait « À deux » en haut et « Moi » plus bas, pour le
 * même mois. C'est la règle 2 dans sa forme la moins visible — **une commande
 * est une fabrique elle aussi.**
 *
 * Le résumé LIT donc `porteeCourante`, et ne l'écrit jamais. `basculerResume`
 * a disparu, y compris de la liste blanche d'`init.js`.
 *
 * ## LES TROIS VERSANTS — 2026-09-08, la dette est fermée
 *
 * « Privé » rendait le panneau du foyer, faute de vue. Elle existe : le
 * troisième versant pose un conteneur que `prive.js` remplit, et le sélecteur
 * gouverne enfin ses trois segments.
 *
 * Le test était `!== SOLO` et jamais `=== DEUX` — c'était la forme prudente de
 * la dette. Il est maintenant exhaustif, et c'est `porteeRetenue` qui garantit
 * qu'une valeur inconnue retombe sur le foyer plutôt que d'ouvrir le privé par
 * accident : le repli n'est jamais « privé », et le raisonnement est dans
 * `utils/portee.js`.
 */
function versantDuResume() {
  return porteeRetenue(getState('porteeCourante'));
}

/**
 * Initialise le module summary
 */
export function initSummary() {
  log('📦 Initialisation module summary/bilan');
  initResumePrive();

  // Franchir 900 px — une tablette qu'on tourne, une fenêtre qu'on
  // redimensionne — réaligne le grand-livre sur la largeur. Sans cet écouteur,
  // il garderait l'état de la largeur d'ouverture jusqu'au rendu suivant.
  // Idempotent : poser deux fois cet écouteur ouvre ou ferme deux fois le même
  // dépliant dans le même sens.
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    window.matchMedia(GRAND_LIVRE_OUVERT_DES).addEventListener('change', (evenement) => {
      const grandLivre = document.querySelector('#summarySection .summary-details');
      if (grandLivre) grandLivre.open = evenement.matches;
    });
  }

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
 * L'autre commande reste, elle : « Enveloppes » CRÉE quelque chose. La masquer
 * empêcherait d'ouvrir une cagnotte avant d'avoir saisi une dépense, ce qui est
 * un ordre parfaitement légitime. « Privé » a quitté cette rangée le
 * 2026-09-08 — c'est une portée — et le même raisonnement vaut pour son
 * segment : il ne se masque pas sur un écran vide.
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
  // LA PORTÉE GOUVERNE TOUT LE PANNEAU BILAN — décision du foyer, 2026-09-11.
  // Le panneau déclare ce qu'il lit ; les cartes qui parlent du foyer se
  // taisent sous une lecture personnelle (summary.css, « La portée gouverne le
  // panneau »). Posé à CHAQUE rendu et AVANT tout chemin de sortie : un rendu
  // qui sortirait tôt laisserait sinon l'état de la portée précédente.
  document.getElementById('panneauBilan')?.setAttribute(
    'data-lecture', porteeMontreLeFoyer(versantDuResume()) ? 'foyer' : 'personnelle'
  );

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
      // Sans bilan, pas de bas de colonne : celui d'un rendu précédent y
      // survivrait sinon, avec les chiffres d'un autre mois.
      poserLeBasDeColonne(null);

      // ── L'ESPACE PRIVÉ NE DEMANDE AUCUN SALAIRE, ET NE DOIT PAS EN
      //    DEMANDER — trouvé le 2026-09-08 en câblant la vue ──
      //
      // Ce chemin sortait avant tout rendu de panneau. La portée « Privé »
      // serait donc restée inatteignable tant que les deux revenus ne sont pas
      // saisis — alors que le privé n'a rien à voir avec le prorata : c'est
      // l'argent de chacun, pas la clé de partage.
      //
      // C'est exactement le défaut que ce bloc a déjà corrigé une fois, deux
      // commentaires plus haut : l'application obligeait deux personnes à se
      // divulguer leurs revenus pour se servir d'un partage à parts égales. Le
      // faire pour l'espace privé serait la même faute, en pire — demander des
      // revenus pour accéder à ce qu'on garde pour soi.
      if (versantDuResume() === PORTEES.PRIVE) {
        summaryElement.innerHTML =
          '<div class="summary-card">'
          + '<div class="resume-panneau" id="resumePanneauPrive">'
          + '<p class="empty-state">Lecture de votre espace privé…</p>'
          + '</div></div>';
        remplirLePanneauPrive();
        return { total: 0, yourShare: 0, partnerShare: 0, balance: 0 };
      }

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

  // Un seul instantané d'historique pour les deux lectures qui en dépendent.
  //
  // `historiqueUtilisable` porte un effet de bord — elle dépose l'instantané
  // frais dans l'état, pour les rendus qui suivront une écriture. L'appeler
  // deux fois n'était pas faux, mais c'était une règle d'ordre à tenir de plus,
  // et ce fichier en a déjà payé une (le panneau des tendances lisait un état
  // que `calculateSummary` ne dépose que plus bas).
  const periods = historiqueUtilisable(historique);

  // Ce que le mois coûte à la personne connectée, et ce qui lui reste.
  //
  // `summary.yourShare` et non un second calcul : la part du commun est déjà
  // établie, et la recalculer ici ouvrirait la porte à deux formules pour un
  // même chiffre — le défaut que ce fichier a déjà payé deux fois (report de
  // solde, mode du mois).
  //
  // LE COMPTE CONNECTÉ, ET NON `vous` — 2026-09-11. Le calcul portait sur
  // `vous` quel que soit le téléphone : sur celui de Cindy, le versant
  // personnel affichait le reste à vivre de Richard, sous « Mes ». Le lot D
  // met ce chiffre en tête du bilan — il fallait qu'il soit celui de la
  // personne qui le lit. Même emplacement que la saisie rapide et le privé.
  const moi = normaliserEmplacement(getState('emplacementCourant'));
  const moisPersonnel = computeMoisPersonnel({
    salaries,
    fixedCharges,
    variableCharges,
    personne: moi,
    partDue: moi === 'conjointe' ? summary.partnerShare : summary.yourShare
  });

  // Afficher le résumé
  renderSummary({
    moi,
    // Le nombre de charges que le total commun additionne, lu sur l'assiette
    // de `computeSummary` : recompter ailleurs donnerait un « sur 3 charges »
    // qui ne décrit pas le total d'à côté.
    nombreDeCharges: (summary.chargesRetenues || []).length,
    moisPersonnel,
    previsionnel: previsionnelDuMois({ fixedCharges, variableCharges }),
    projection: projectionAffichee(periods),
    observations: observationsDuMois(historique),
    rapport: rapportDuMoisAffiche(periods, summary, salaries),
    totalCharges: summary.total,
    yourTheoricalShare: summary.yourShare,
    partnerTheoricalShare: summary.partnerShare,
    yourActualPayments: summary.yourActualPayments,
    partnerActualPayments: summary.partnerActualPayments,
    balanceBeforeReimbs: summary.balanceBeforeReimbs,
    reimbursementAdjustment: summary.reimbursementAdjustment,
    carryOver: summary.carryOver,
    ownBalance: summary.ownBalance,
    finalBalance: summary.balance,
    virementsByDestination,
    // La règle du partage et son assiette, pour le bandeau qui les dit. Les
    // parts des charges, elles, s'écartent de la règle dès qu'une charge
    // porte une répartition dérogatoire : le bandeau dit la RÈGLE.
    regle: { shareMode, incomeBase, customPercents },
    // La décomposition porte sur les charges QUE `computeSummary` a retenues,
    // et elle les reçoit de lui : refaire ici le filtrage des solo, des
    // supprimées et des montants illisibles aurait été une seconde fabrique de
    // l'assiette — et l'écran aurait montré une décomposition dont la somme ne
    // fait pas le total qu'elle explique.
    //
    // Et elle décompose la part de QUI TIENT LE TÉLÉPHONE (2026-09-11) : « Ta
    // part du commun » dans « Moi », « Pourquoi votre part » dans « À deux ».
    decomposition: decomposerParRegle(summary.chargesRetenues, {
      shareMode, salaries: incomeBase, totalSalaries, customPercents, personne: moi
    })
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
 * @param {Object|null} periods - Sortie de `historiqueUtilisable`
 * @param {Object} bilan - Sortie de `computeSummary` pour le mois affiché
 * @param {Object} salaries - Instantané de revenus du mois
 * @returns {Object|null}
 */
function rapportDuMoisAffiche(periods, bilan, salaries) {
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
      moisReel: jourDuCalendrier().moisReel,
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
 * Ce que l'horloge de l'appareil dit du mois en cours
 *
 * Trois grandeurs que deux mesures réclament — la veille et la projection — et
 * qui doivent venir du MÊME instant : lues séparément, elles peuvent enjamber
 * minuit, et le 1ᵉʳ du mois à 00 h 00 la projection s'appliquerait au mois
 * précédent.
 *
 * Une seule lecture d'horloge, donc, et par `dateDuJour`, qui est la fabrique
 * du dépôt pour « aujourd'hui dans le fuseau de l'appareil » — une dépense de
 * 00 h 30 y était datée de la veille tant que le calcul se faisait en UTC.
 * `joursDeLaPeriode` fait le reste : c'est la même qui dit combien de jours il
 * reste à une enveloppe.
 *
 * @returns {{moisReel: string, jourDuMois: number, joursDuMois: number}}
 */
function jourDuCalendrier() {
  const aujourdhui = dateDuJour();
  const moisReel = aujourdhui.slice(0, 7);

  return {
    moisReel,
    jourDuMois: Number(aujourdhui.slice(8, 10)),
    joursDuMois: joursDeLaPeriode(moisReel)
  };
}

/**
 * Où va le mois, si les jours qui restent ressemblent à ceux qui ont passé
 *
 * Le premier écran était RÉTROSPECTIF : il répondait à « qu'est-ce qui s'est
 * passé », jamais à « où va-t-on ». Le calcul existait pourtant — sous forme
 * d'une carte d'alerte qui ne paraissait qu'au-delà d'un seuil, et qui
 * disputait ses trois places à six autres détecteurs. Il est désormais annoncé
 * à chaque ouverture, sous les échéances qu'il complète.
 *
 * Rendue `null` en cas d'échec, comme la veille et le rapport : une projection
 * n'est jamais indispensable, le bilan l'est.
 *
 * @param {Object|null} periods - Sortie de `historiqueUtilisable`
 * @returns {Object|null} Sortie de `projectionDuMois`, ou `null`
 */
function projectionAffichee(periods) {
  if (!periods) return null;

  try {
    return projectionDuMois({
      periods,
      moisCourant: getState('currentPeriod'),
      ...jourDuCalendrier()
    });
  } catch (erreur) {
    warn('⚠️ Projection du mois indisponible :', erreur);
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

    // Rangées dans l'état : le bouton d'une carte ne porte que sa clé, et
    // c'est ici que le gestionnaire retrouve la proposition correspondante.
    const vues = anticiper({
      enveloppes,
      // Ce que le foyer a déjà mis en place ne se propose plus : sans cette
      // liste, la carte reparaîtrait après qu'on l'a acceptée.
      listeEnveloppes: getState('envelopes') || [],
      periods: historique,
      moisCourant: getState('currentPeriod'),
      // Le mois du CALENDRIER, distinct de celui du sélecteur, plus le jour et
      // la durée. Sans ce rapprochement, une mesure de rythme s'appliquerait au
      // mois affiché quel qu'il soit, et jugerait un budget clos depuis trois
      // mois sur les jours écoulés d'aujourd'hui.
      ...jourDuCalendrier()
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
/**
 * Comment nommer le total commun — la troisième carte de tête
 *
 * Le total a quitté la tête du bilan au lot D (2026-09-11) : il est au rang 3,
 * sous « Dépensé à deux », le libellé des planches. Ce qui le nomme n'a pas
 * changé de raison. « Dépensé » n'est vrai que d'un mois commencé : le
 * sélecteur en propose un d'AVANCE — la reconduction peut y avoir inscrit les
 * charges fixes dès le premier — et l'historique en propose des dizaines
 * derrière. Nommer les trois états de la même façon ferait dire au bilan qu'un
 * mois qui n'a pas commencé a déjà coûté 1 717 €.
 *
 * L'état vient d'`etatDuMois`, la fabrique que le rapport lisait déjà : c'est
 * la même question, et deux réponses finiraient par différer.
 *
 * @param {string} mois - AAAA-MM affiché
 * @param {'revolu'|'en-cours'|'a-venir'|null} etat
 * @returns {string} Texte brut, à échapper par l'appelant
 */
function libelleDuTotal(mois, etat) {
  if (etat === 'revolu') return `Dépensé à deux en ${formatPeriod(mois)}`;
  // Un mois à venir ne porte que ce que la reconduction y a posé d'avance :
  // « dépensé » serait faux, « engagé » est exact.
  if (etat === 'a-venir') return `Déjà engagé pour ${formatPeriod(mois)}`;

  // En cours, ou sans repère de calendrier : le libellé des planches, qui ne
  // situe pas le mois — le sélecteur, juste au-dessus, le fait déjà.
  return 'Dépensé à deux';
}

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
/**
 * Pourquoi ma part vaut ce qu'elle vaut
 *
 * ─────────────────────────────────────────────────────────────────────
 * LE SEUL ENDROIT DU CHANTIER QUI AJOUTE DE L'INFORMATION
 *
 * Le dépliant disait « qui a payé quoi ». Il ne disait pas pourquoi ma part
 * vaut ce chiffre-là. Une ligne par RÈGLE appliquée le dit — et pas une ligne
 * par catégorie : une catégorie qui mêle 50/50 et 70/30 ne peut porter aucun
 * pourcentage, donc elle n'explique rien. Le raisonnement complet, avec le jeu
 * d'essai qui l'a tranché, est en tête d'`utils/decomposition.js`.
 *
 * ── UNE SEULE LIGNE NE S'AFFICHE PAS ──
 *
 * Quand tout le mois suit la règle du foyer, la décomposition rend une ligne
 * unique qui répète le montant juste au-dessus. Elle n'apprend rien et coûte
 * 30 px sur l'écran le plus contraint : le bloc entier se tait.
 *
 * @param {Array<Object>} lignes - Sortie de `decomposerParRegle`
 * @returns {string} Fragment échappé
 */
function renderDecomposition(lignes) {
  if (lignes.length < 2) return '';

  return `
        <div class="summary-decomposition">
          <div class="summary-section-label">Pourquoi votre part</div>
          ${lignes.map(ligne => `
          <div class="summary-row summary-row--decompose">
            <span>${ligne.pastille
              ? `<span class="charge-split-tag">${escapeHtml(ligne.pastille)}</span>`
              : escapeHtml(ligne.libelle)}</span>
            <strong>${formatCurrency(ligne.mien)}</strong>
          </div>`).join('')}
        </div>
`;
}

/**
 * La suite de la tête « Moi » : le grand-livre qui rend le reste vérifiable
 *
 * ─────────────────────────────────────────────────────────────────────
 * TROIS SOUSTRACTIONS, ET CE SONT LES SEULES — lot D, 2026-09-11, planche 12
 *
 * Revenus, moins ma part du commun, moins mes dépenses solo : c'est tout ce
 * que l'application connaît de cette portée. Chacune a sa ligne, la part se
 * décompose par règle — la même fabrique que « Pourquoi votre part » —, et le
 * reste se vérifie ligne par ligne. C'est ce qui a manqué une fois au prorata :
 * un chiffre juste qu'on ne pouvait pas refaire.
 *
 * Il n'est PAS replié sous 900 px, à la différence de celui d'« À deux », et ce
 * n'est pas parce qu'il serait court : mesuré au doigt, il fait **300 px à
 * 320**, 240 à 390 — plus que celui d'« À deux » replié. Il est ouvert parce
 * que la planche 16 le montre ouvert à 320, et que la réserve qu'il porte —
 * « un plafond, pas un solde » — ne doit jamais être séparée du chiffre
 * qu'elle qualifie, ni derrière un geste. Le coût est réel ; la décision est à
 * confirmer à l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LE RESTE EXCLUT LES DÉPENSES PRIVÉES — et c'est une décision, deux fois
 *
 *   - la décision du foyer, sur les planches : les inclure ferait du reste un
 *     indice de ce qu'on a dépensé en privé, lisible par-dessus l'épaule ;
 *   - et la raison qui la précédait ici : l'autre connaît ma part, mes charges
 *     solo et les revenus dont le prorata découle — le total privé deviendrait
 *     déductible par soustraction, contre la seule personne pour qui il est
 *     masqué.
 *
 * « Les compter » le dévoile à la demande, pour l'onglet seulement
 * (`resume-prive.js`).
 *
 * @param {Object} moisPersonnel - Sortie de `computeMoisPersonnel`
 * @param {Array<Object>} decomposition - Sortie de `decomposerParRegle`, pour moi
 * @param {string} autre - Le prénom de l'autre personne
 * @returns {string} Fragment échappé
 */
function suiteDeMoi(moisPersonnel, decomposition, autre) {
  // Sans revenus, il n'y a rien à diviser. Le 50-50 et le mode personnalisé
  // n'en demandent aucun : ce versant est le premier écran qui en ait besoin,
  // et il le demande pour lui seul, sans bloquer le reste de l'application.
  if (!moisPersonnel.disponible) {
    return `
        <div class="empty-state">
          <p>Renseignez vos revenus pour connaître votre reste à vivre.</p>
          <button type="button" class="btn btn-primary" data-action="focusSalaries">
            Renseigner les revenus
          </button>
        </div>`;
  }

  const { revenus, partDue, solo, resteAVivre } = moisPersonnel;

  // Une seule règle dans le mois : la sous-ligne répéterait le montant juste
  // au-dessus. Même seuil que « Pourquoi votre part ».
  const sousLignes = decomposition.length < 2 ? '' : decomposition.map(ligne => `
          <div class="summary-row summary-row--decompose grand-livre-sous">
            <span>${ligne.pastille
              ? `<span class="charge-split-tag">${escapeHtml(ligne.pastille)}</span>`
              : escapeHtml(ligne.libelle)}</span>
            <strong>${formatCurrency(ligne.mien)}</strong>
          </div>`).join('');

  return `
        <div class="grand-livre-moi">
          <div class="summary-row grand-livre-base">
            <span>Tes revenus du mois</span>
            <strong>${formatCurrency(revenus)}</strong>
          </div>
          <div class="summary-row grand-livre-retire">
            <span>Ta part du commun</span>
            <strong>−&nbsp;${formatCurrency(partDue)}</strong>
          </div>
          ${sousLignes}
          <div class="summary-row grand-livre-retire">
            <span>Tes dépenses solo</span>
            <strong>−&nbsp;${formatCurrency(solo)}</strong>
          </div>
          <p class="grand-livre-precision">${escapeHtml(autre)} voit tes dépenses solo ; personne ne doit rien dessus.</p>
          <div class="summary-row grand-livre-reste">
            <span>Il te reste</span>
            <strong>${formatCurrency(resteAVivre)}</strong>
          </div>
        </div>
        <p class="grand-livre-note">Tes dépenses privées ne sont pas dans ce calcul. Le montant qui reste est donc un plafond, pas un solde.</p>
        ${lignePriveeACompter(resteAVivre)}`;
}

/**
 * Le grand-livre, ouvert au bureau et replié au téléphone
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE N'EST PAS LA MAQUETTE, ET IL FAUT LE DIRE — 2026-09-11
 *
 * `mobile.html` le montre DÉPLIÉ à 390 comme à 320 px (planches 4, 5 et 6),
 * dans la carte du solde. Le repli sous 900 px est une décision du foyer, prise
 * sur son coût : mesuré à 320 px au doigt, déplier le grand-livre ajoute
 * **250,5 px** (cinq lignes) à **336,7 px** (sept, avec une dérogation) —
 * davantage que tout le chrome au-dessus du premier contenu. Au-delà de
 * 900 px, la place existe : le cacher serait gratuit.
 *
 * Et une précision qui évite de lui prêter un effet qu'il n'a pas : ce repli
 * ne rend RIEN au contrôle `onglets:280`. Celui-ci mesure le haut de la carte
 * du bilan, et le grand-livre vit dedans — 161,5 px replié comme déplié.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LE CHOIX DE LA PERSONNE L'EMPORTE SUR LA LARGEUR, À L'INTÉRIEUR D'UNE VISITE
 *
 * `calculateSummary` réécrit le bilan après chaque écriture. Relire la largeur
 * à chaque rendu rouvrirait le dépliant qu'on vient de fermer — à chaque charge
 * ajoutée. L'état du dépliant en place fait donc autorité ; la largeur ne
 * décide qu'au premier rendu, et quand on franchit 900 px (`initSummary`).
 *
 * `900px` est la rupture principale du dépôt (`responsive.css:222`,
 * `onglets.css`). Ce fichier en est le seul lecteur JavaScript.
 */
const GRAND_LIVRE_OUVERT_DES = '(min-width: 900px)';

function grandLivreOuvert() {
  const enPlace = document.querySelector('#summarySection .summary-details');
  if (enPlace) return enPlace.open;

  return typeof window.matchMedia === 'function'
    && window.matchMedia(GRAND_LIVRE_OUVERT_DES).matches;
}

/**
 * Les deux autres cartes de tête : ce qui me reste, ce que nous avons dépensé
 *
 * Le total commun est le FAIT SYMÉTRIQUE — ce que le foyer a dépensé ensemble.
 * Il ouvrait le bilan du 2026-08-31 au 2026-09-11 ; il est au rang 3, en encre
 * neutre, et c'est la créance, au-dessus, qui porte seule la couleur.
 *
 * Aucun chiffre n'est calculé ici : le reste à vivre et le taux d'effort
 * viennent de `computeMoisPersonnel`, le total et son compte de `computeSummary`.
 *
 * @param {Object} p
 * @returns {string} Fragment échappé
 */
function renderCartesTete({ moisPersonnel, totalCharges, nombreDeCharges, libelleDuCommun }) {
  const reste = moisPersonnel && moisPersonnel.disponible
    ? `<strong class="carte-tete-montant">${formatCurrency(moisPersonnel.resteAVivre)}</strong>
          <span class="carte-tete-pastille">Taux d'effort ${Math.round(moisPersonnel.tauxEffort * 100)}&nbsp;%</span>`
    : '<span class="carte-tete-sous">Revenus non renseignés.</span>';

  const pluriel = nombreDeCharges > 1 ? 's' : '';
  const combien = nombreDeCharges === 0
    ? 'Aucune charge commune.'
    : `Sur ${nombreDeCharges} charge${pluriel} commune${pluriel}.`;

  return `
      <div class="cartes-tete">
        <div class="carte-tete carte-tete--reste">
          <span class="bilan-tete">Reste à vivre hors privé</span>
          ${reste}
        </div>
        <div class="carte-tete carte-tete--commun">
          <span class="bilan-tete">${escapeHtml(libelleDuCommun)}</span>
          <strong class="carte-tete-montant">${formatCurrency(totalCharges)}</strong>
          <span class="carte-tete-sous">${combien}</span>
        </div>
      </div>`;
}

/** Le nom de chaque règle, tel que le bandeau le dit */
const NOM_DE_LA_REGLE = Object.freeze({
  prorata: 'Prorata',
  '50-50': 'Moitié-moitié',
  custom: 'Parts choisies'
});

/**
 * Le bandeau du partage — la règle qui fait les parts, et d'où elle vient
 *
 * Planche 1, au pied de la tête : « ⚖️ Prorata · Richard 71 % · Cindy 29 % ·
 * d'après … de revenus mensuels · Modifier les revenus ». Le lot E a sorti les
 * salaires du tableau de bord ; ce lien les ramène à un geste de l'écran où
 * le chiffre compte, par le chemin de la porte (`focusSalaries`).
 *
 * Il dit la RÈGLE, pas les parts des charges : celles-ci s'en écartent dès
 * qu'une charge porte une répartition dérogatoire, et le grand-livre les
 * donne déjà. L'assiette n'est nommée qu'au prorata — c'est le seul mode où
 * les revenus décident.
 *
 * @param {{ shareMode: string, incomeBase: Object, customPercents: Object }|undefined} regle
 * @param {string} nomVous
 * @param {string} nomConjointe
 * @returns {string} Balisage — les prénoms échappés, le reste numérique
 */
function bandeauDuPartage(regle, nomVous, nomConjointe) {
  if (!regle) return '';
  const { shareMode, incomeBase, customPercents } = regle;

  let vous = 50;
  if (shareMode === 'prorata' && incomeBase?.total > 0) {
    vous = Math.round((incomeBase.vous / incomeBase.total) * 100);
  } else if (shareMode === 'custom' && Number.isFinite(Number(customPercents?.vous))) {
    vous = Math.round(Number(customPercents.vous));
  }
  vous = Math.min(100, Math.max(0, vous));
  const conjointe = 100 - vous;

  const assiette = shareMode === 'prorata' && incomeBase
    ? `<span class="bandeau-partage-assiette">d'après ${formatCurrency(incomeBase.vous)} et ${formatCurrency(incomeBase.conjointe)} de revenus mensuels</span>`
    : '';

  return `
      <div class="bandeau-partage">
        <span class="bandeau-partage-regle"><span aria-hidden="true">⚖️</span> ${NOM_DE_LA_REGLE[shareMode] || NOM_DE_LA_REGLE.prorata}</span>
        <span class="bandeau-partage-parts"><span class="bandeau-partage-jauge" aria-hidden="true"><span style="width: ${vous}%"></span></span>${escapeHtml(nomVous)} ${vous}\u202F% · ${escapeHtml(nomConjointe)} ${conjointe}\u202F%</span>
        ${assiette}
        <button type="button" class="bandeau-partage-lien" data-action="focusSalaries">Modifier les revenus</button>
      </div>`;
}

/**
 * Pose le bas de la colonne des cartes
 *
 * « Le mois en un coup d'œil » et le récap des virements sont rendus avec la
 * tête, dans le même gabarit : ils lisent les mêmes chiffres, et une seconde
 * injection ferait un 25ᵉ site sur un plafond de 24. Ils sont ensuite
 * DÉPLACÉS dans `#bilanBas`, en bas de la colonne des cartes (lot E).
 *
 * Appelée à CHAQUE rendu, y compris ceux qui n'en portent pas : un bas de
 * colonne laissé en place survivrait à un changement de portée ou de mois.
 *
 * @param {Element|null} source - Le bilan fraîchement rendu, ou null pour vider
 */
function poserLeBasDeColonne(source) {
  const bas = document.getElementById('bilanBas');
  if (!bas) return;
  bas.replaceChildren(...(source ? source.querySelectorAll('[data-bas-de-colonne]') : []));
}

function renderSummary(summary) {
  const summaryElement = document.getElementById('summarySection');
  if (!summaryElement) {
    warn('⚠️ Element #summarySection introuvable');
    return;
  }

  const {
    moisPersonnel,
    previsionnel,
    projection,
    observations,
    rapport,
    totalCharges,
    yourTheoricalShare,
    partnerTheoricalShare,
    yourActualPayments,
    partnerActualPayments,
    reimbursementAdjustment,
    carryOver,
    ownBalance,
    finalBalance,
    virementsByDestination,
    decomposition,
    moi,
    nombreDeCharges,
    regle
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

  // LA TÊTE DU BILAN PORTE LA CRÉANCE, ET SEULEMENT SUR « À DEUX » — lot D,
  // 2026-09-11. Ce bloc a défendu l'inverse du 2026-08-31 à ce jour, et sa
  // raison est gardée ici parce que c'est elle qui rend la révocation lisible.
  //
  // Il mettait en tête le TOTAL commun, « Ensemble ce mois », et rangeait
  // l'écart dessous, « À rééquilibrer ». La raison était écrite : une
  // application de couple qui ouvre sur une créance transforme une
  // organisation commune en comptabilité entre deux parties, et c'est celui des
  // deux qui doit qui le lit chaque jour.
  //
  // Cette décision est RÉVOQUÉE (`CLAUDE.md`, *Design*, 2026-09-10). Elle avait
  // été prise sans maquette et avant que la portée existe : son grief supposait
  // un écran unique. Il y en a trois, et la créance n'est en tête que sur l'un
  // d'eux. Solo porte un total en encre neutre, Privé aucun chiffre — la tête
  // vient de `teteDuBilan`, une fabrique pour les trois. Le grief tient encore
  // pour l'écran d'OUVERTURE, « À deux » étant la portée par défaut : c'est un
  // arbitrage assumé, pas un désamorçage.
  //
  // Le fait symétrique n'est pas supprimé : il passe au rang 3, carte
  // « Dépensé à deux », et son mois y est toujours NOMMÉ selon son état —
  // même fabrique que le rapport, `etatDuMois`, la leçon payée en annonçant
  // « 1 090 € de moins qu'un mois ordinaire » pour un mois à venir.
  const moisAffiche = getState('currentPeriod');
  // L'état du mois, lu UNE fois : il nomme le total commun et accorde le verbe
  // du reste dans « Moi ». Deux lectures d'horloge pourraient enjamber minuit.
  const etatAffiche = etatDuMois(moisAffiche, jourDuCalendrier().moisReel);
  const libelleDuCommun = libelleDuTotal(moisAffiche, etatAffiche);

  // La ligne « À rééquilibrer » a disparu avec l'ancienne tête : c'est la tête
  // qui dit le solde, désormais. Sa propriété, elle, a suivi — la tête le dit
  // SANS CONDITION, « Comptes équilibrés » compris (`teteDuBilan`), parce que
  // `barre-solde.js` se tait sur la seule géométrie de `.summary-balance`.

  // Explication du calcul (utilise le solde arrondi pour éviter décalage d'1 centime)
  // Avec un report, « a payé plus que sa part » serait faux : le solde affiché
  // mêle le mois courant et l'ardoise des mois précédents.
  //
  // La phrase disait « dont X que la conjointe devait déjà », sur la seule
  // existence d'un report — sans regarder son sens, ni ce qu'il restait à
  // devoir. Trois de ses quatre cas étaient faux, dont un qui contredisait
  // « Comptes équilibrés » affiché deux lignes plus haut. L'énumération vit
  // maintenant dans `expliquerLeReport`, avec ses contrôles.
  let balanceExplanation = '';
  const duReport = expliquerLeReport({ carryOver, ownBalance, finalBalance });
  if (duReport) {
    balanceExplanation = `<p class="bilan-heros-explication">${escapeHtml(duReport)}</p>`;
  } else if (finalBalance !== 0) {
    const overpayer = soldeDit.crediteur;
    balanceExplanation = `<p class="bilan-heros-explication">${escapeHtml(overpayer)} a payé ${formatCurrency(Math.abs(finalBalance))} de plus que sa part</p>`;
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
  //
  // Et la barre ne paraît que sur les portées qui rappellent le solde commun —
  // « À deux » et « Moi », jamais « Privé ». La règle n'est pas écrite ici :
  // elle est déclarée par `porteeRappelleLeSolde`, et ce rendu la consulte.
  updateBalanceBar(
    porteeRappelleLeSolde(versantDuResume()) ? `<span>${balanceText}</span>` : null,
    balanceClass
  );

  // Les budgets se lisent sur les mêmes charges que le bilan : ils se
  // rafraîchissent au même moment, sans hameçon supplémentaire dans chaque
  // chargeur.
  renderCategoryBudgets();

  // Le repère qui dit qu'un solde reste dû vit sur le segment « À deux » du
  // sélecteur de portée, hors de cette carte. C'est ce qui empêche une dette de
  // disparaître de tout l'écran quand on passe au versant personnel — et le
  // calcul reste ici, chez celui qui l'a fait.
  marquerLeSoldeDu(finalBalance !== 0);

  // Seul le panneau actif est écrit dans le document. C'est ce qui garantit
  // qu'aucun chiffre du foyer ne reste lisible sous le versant personnel — et
  // que `.summary-balance` est absent quand le solde n'est pas à l'écran, ce
  // dont `barre-solde.js` se sert pour reprendre le relais : sans témoin, la
  // barre s'affiche, ce qui est exactement le comportement voulu là.
  //
  // C'est aussi ce qui referme le bloc privé : les lignes dévoilées sont
  // détruites avec le panneau, et `lignePriveeACompter` n'écrit jamais qu'un état
  // masqué. Aucun changement de portée ne peut donc laisser un montant privé
  // derrière lui, et il n'y a pas de second chemin à tenir à jour.
  const versant = versantDuResume();
  const enDuo = versant === PORTEES.DEUX;
  const enPrive = versant === PORTEES.PRIVE;

  const autre = memberLabel(emplacementOppose(moi), membres);
  const tete = teteDuBilan({
    portee: versant,
    solde: soldeDit,
    montant: finalBalance,
    moi,
    moisPersonnel,
    etat: etatAffiche,
    moisNomme: formatPeriod(moisAffiche),
    autre
  });

  // Le grand-livre vit DANS la carte du solde, juste sous la phrase qu'il
  // explique — c'est la place que lui donnent les planches. Ouvert au bureau,
  // replié au téléphone : voir `grandLivreOuvert`.
  const grandLivre = `
      <details class="summary-details"${grandLivreOuvert() ? ' open' : ''}>
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
${renderDecomposition(decomposition)}
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
      </details>`;

  // La tête d'« À deux » et de « Moi » est rendue ici, par le gabarit commun.
  // « À deux » y ajoute le témoin que `barre-solde.js` observe, et ce que la
  // créance appelle — son explication, son grand-livre, le geste qui la règle ;
  // « Moi », le grand-livre qui rend le reste vérifiable.
  //
  // Celle du PRIVÉ n'est pas rendue ici : la règle qu'elle énonce dépend de ce
  // que l'autre peut réellement lire, c'est-à-dire de la posture lue en base.
  // `prive.js` la dessine avec le même gabarit, une fois la lecture faite — la
  // poser d'avance ici lui ferait dire une règle au hasard.
  const optionsDeTete = enDuo
    ? { temoin: `summary-balance ${balanceClass}`, dit: balanceExplanation, suite: `${grandLivre}${settleButton}` }
    : { suite: enPrive ? '' : suiteDeMoi(moisPersonnel, decomposition, autre) };

  summaryElement.innerHTML = `
    <div class="summary-card summary-card--tete">
      ${enPrive ? '' : gabaritDeTete(tete, optionsDeTete)}
      ${enDuo ? `
      <div class="resume-panneau" id="resumePanneauDuo">
      ${renderCartesTete({ moisPersonnel, totalCharges, nombreDeCharges, libelleDuCommun })}
      ${bandeauDuPartage(regle, nomVous, nomConjointe)}
      ${renderPrevisionnel(previsionnel)}
      ${renderProjection(projection)}
      ${renderObservations(observations)}

      ${rapport && !rapport.vide
        ? `<button type="button" class="btn btn-secondary rapport-ouvrir" data-action="ouvrirRapportDuMois" data-bas-de-colonne>
             📄 Le mois en un coup d'œil
           </button>`
        : ''}
      </div>` : enPrive ? `
      <div class="resume-panneau" id="resumePanneauPrive">
        <p class="empty-state">Lecture de votre espace privé…</p>
      </div>` : `
      <div class="resume-panneau" id="resumePanneauSolo"><!-- Rangs 2 et 3 de la planche 12 : lot suivant --></div>`}
    </div>

    ${enDuo ? renderBudgetGauge(totalCharges) : ''}

    ${enDuo && virementsByDestination && virementsByDestination.length > 0 ? `
    <div class="summary-card virements-recap" data-bas-de-colonne>
      <h3>🏦 Récap virements — ${escapeHtml(nomConjointe)}</h3>
      <p class="virements-subtitle">Montants à virer par destination</p>

      ${virementsByDestination.map(group => `
        <div class="virement-group">
          <div class="virement-destination">
            <span class="virement-dest-name">${escapeHtml(group.destination)}</span>
            <strong class="virement-dest-total">${formatCurrency(group.total)}</strong>
          </div>
          <div class="virement-details">
            ${group.charges.map(c => {
    // Même grammaire que les deux listes de charges, par la même fabrique.
    //
    // Ce panneau vit dans l'onglet « Bilan », les listes dans « Charges » :
    // sous 900 px ce sont deux écrans que rien ne relie. La pastille
    // identique est ce qui permet de rapprocher un montant à virer qui
    // surprend de la charge qui l'explique — une charge en 50/50 dans un
    // foyer au prorata réclame 500,00 € là où le prorata en demanderait
    // 272,73, et le chiffre était jusqu'ici le seul indice.
    //
    // Le montant PLEIN de la charge reste hors de la ligne, et c'est mesuré :
    // à 320 px, l'ajouter fait boucler toute ligne dérogatoire, « Loyer »
    // compris. La pastille dit pourquoi le chiffre surprend, pas s'il est
    // exact — cette seconde question a sa réponse dans les listes, où le
    // montant plein est affiché avec cette même pastille.
    const repartition = libelleDeLaRepartition(c.derogation);
    const pastille = repartition
      ? ` <span class="charge-split-tag">${escapeHtml(repartition)}</span>`
      : '';
    return `
              <div class="virement-detail-row">
                <span>${escapeHtml(c.description)}${pastille}</span>
                <span>${formatCurrency(c.partnerShare)}</span>
              </div>
            `;
  }).join('')}
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

  poserLeBasDeColonne(summaryElement);

  // Le bilan vient d'être réécrit : l'élément que la barre observait n'existe
  // plus. Sans ce rappel, l'observation resterait posée sur un nœud détaché —
  // ce qui ne lève rien, mais fige la barre dans son dernier état.
  suivreLeBilan();

  // L'espace privé demande quatre lectures en base ; ce rendu-ci est synchrone.
  // Le conteneur est donc posé vide, et rempli quand la base a répondu.
  //
  // Sans `await` — et il ne faut pas en mettre un : `calculateSummary` est
  // appelée par une trentaine de sites qui ne l'attendent pas, et la rendre
  // asynchrone les obligerait tous. La promesse est laissée à elle-même, et
  // `remplirLePanneauPrive` relit son conteneur après l'attente précisément
  // parce qu'un autre rendu a pu passer entre-temps.
  if (enPrive) remplirLePanneauPrive();
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
 * Où va le mois — la seule ligne prospective du premier écran
 *
 * Tout le reste du bilan est rétrospectif : ce qui a été dépensé, ce qui reste
 * à passer parmi les échéances DÉJÀ inscrites. Aucune ligne ne disait où le
 * mois allait, alors que c'est la question qu'on se pose le 12.
 *
 * **Son propre bloc, et non une ligne du prévisionnel.** Le prévisionnel se
 * peint en vert quand tout est passé — et « ✅ Tout est passé ce mois-ci »
 * suivi de « il reste 21 jours, le mois finira autour de 2 400 € » se serait
 * contredit à l'œil, dans un lavis qui dit que tout va bien. Ce n'est pas un
 * cas dégénéré : c'est le cas courant de la seconde moitié d'un mois, où les
 * charges datées sont toutes derrière.
 *
 * Les deux nombres se raccordent, et la phrase le dit : ce qui est engagé
 * aujourd'hui est le point de départ de la projection, pas un chiffre à côté.
 * « Un chiffre qu'on ne sait pas raccorder au précédent est pire qu'un chiffre
 * absent » — c'est écrit dans le contrôle du prévisionnel.
 *
 * Un seul montant, et le ton porte l'urgence : la carte d'alerte qui disait la
 * même chose en ambre a été retirée de la veille, sans quoi le même nombre
 * aurait paru deux fois sur le même écran.
 *
 * @param {Object|null} projection - Sortie de `projectionDuMois`
 * @returns {string} Fragment HTML, ou chaîne vide
 */
function renderProjection(projection) {
  if (!projection) return '';

  const { projection: fin, ordinaire, surcout, joursRestants, moisCompares, depasse } = projection;

  // `joursRestants` vaut au moins 2 : la fabrique se tait dès que le mois est
  // fini. Le pluriel est donc toujours juste, et une garde au singulier serait
  // une branche que rien ne peut atteindre.
  // Le repère porte sa propre classe : c'est le nombre que le rapport annonce
  // aussi, et la propriété qui les tient ensemble doit pouvoir le LIRE plutôt
  // que d'analyser la phrase — sans quoi elle attraperait le surcoût, qui la
  // précède, et passerait pour la mauvaise raison.
  const habituel = `<span class="projection-ordinaire">${formatCurrency(ordinaire)}</span>`;
  const repere = depasse
    ? `soit ${formatCurrency(surcout)} de plus qu'un mois ordinaire (${habituel})`
    : `un mois ordinaire coûte ${habituel}`;

  return `
    <div class="summary-projection${depasse ? ' summary-projection--attention' : ''}">
      <div class="projection-montant">
        <span aria-hidden="true">📈</span>
        Il reste ${joursRestants} jours — à ce rythme, le mois finira autour de
        <strong>${formatCurrency(fin)}</strong>
      </div>
      <small class="projection-detail">
        ${repere}, sur les ${moisCompares} mois précédents
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
