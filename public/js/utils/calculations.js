import { resolveIncomeBase, resolveSalaries } from './salaries.js';
import { chargesCommunes } from './perimetre.js';
import { REIMBURSEMENT_DIRECTIONS } from '../config.js';

// ===== FONCTIONS DE CALCUL PURES (testables) =====
// Extraites de summary.js pour permettre les tests unitaires

/**
 * Les deux pourcentages d'un partage personnalisé, jamais NaN
 *
 * Un `splitOverride` partiel — `{ mode: 'custom' }` sans les deux chiffres, ce
 * que les règles acceptent puisqu'elles n'exigent la somme que si les deux
 * clés sont présentes — faisait tomber la lecture sur `customPercents`. Or
 * celui-ci peut être vide : `pcts.vous` valait alors `undefined`, et la part
 * de chacun `NaN`, qui se propageait à tout le bilan.
 *
 * Le repli est le partage en deux : c'est ce que « personnalisé » veut dire
 * quand personne n'a rien personnalisé.
 *
 * @param {Object} charge
 * @param {Object} customPercents - Pourcentages globaux
 * @returns {{vous: number, conjointe: number}}
 */
function pourcentages(charge, customPercents) {
  const source = (charge.splitOverride && charge.splitOverride.vous !== undefined)
    ? charge.splitOverride
    : customPercents;

  const vous = Number(source?.vous);
  const conjointe = Number(source?.conjointe);

  if (!Number.isFinite(vous) || !Number.isFinite(conjointe)) {
    return { vous: 50, conjointe: 50 };
  }
  return { vous, conjointe };
}

/**
 * Calcule la part théorique d'une charge pour chaque personne
 * @param {Object} charge - { amount, splitOverride }
 * @param {string} shareMode - Mode global ('prorata', '50-50', 'custom')
 * @param {Object} salaries - Assiette du prorata { vous, conjointe }, revenus complémentaires compris
 * @param {number} totalSalaries - Total de l'assiette
 * @param {Object} customPercents - { vous, conjointe } pourcentages globaux
 * @returns {{ yourShare: number, partnerShare: number }}
 */
export function calculateChargeShares(charge, shareMode, salaries, totalSalaries, customPercents) {
  const amount = charge.amount;
  const effectiveMode = charge.splitOverride ? charge.splitOverride.mode : shareMode;

  if (effectiveMode === '50-50') {
    return { yourShare: amount * 0.5, partnerShare: amount * 0.5 };
  }

  if (effectiveMode === 'custom') {
    const pcts = pourcentages(charge, customPercents);
    return {
      yourShare: amount * (pcts.vous / 100),
      partnerShare: amount * (pcts.conjointe / 100)
    };
  }

  // prorata
  if (totalSalaries > 0) {
    return {
      yourShare: amount * (salaries.vous / totalSalaries),
      partnerShare: amount * (salaries.conjointe / totalSalaries)
    };
  }

  return { yourShare: amount * 0.5, partnerShare: amount * 0.5 };
}

/**
 * Calcule le paiement réel d'une charge joint
 * @param {Object} charge - { amount, splitOverride }
 * @param {string} shareMode - Mode global
 * @param {Object} salaries - Assiette du prorata { vous, conjointe }, revenus complémentaires compris
 * @param {number} totalSalaries - Total de l'assiette
 * @param {Object} customPercents - { vous, conjointe }
 * @returns {{ yourPayment: number, partnerPayment: number }}
 */
export function calculateJointPayment(charge, shareMode, salaries, totalSalaries, customPercents) {
  const effectiveMode = charge.splitOverride ? charge.splitOverride.mode : shareMode;
  let yourJointRatio = 0.5;

  if (effectiveMode === '50-50') {
    yourJointRatio = 0.5;
  } else if (effectiveMode === 'custom') {
    yourJointRatio = pourcentages(charge, customPercents).vous / 100;
  } else if (totalSalaries > 0) {
    yourJointRatio = salaries.vous / totalSalaries;
  }

  return {
    yourPayment: yourJointRatio * charge.amount,
    partnerPayment: (1 - yourJointRatio) * charge.amount
  };
}

/**
 * Calcule le bilan complet à partir de données pures (sans DOM ni state)
 * @param {Object} params
 * @returns {Object} Résumé du bilan
 */
/**
 * Le mode de partage a-t-il besoin des salaires ?
 *
 * @param {string} shareMode - 'prorata' | '50-50' | 'custom'
 * @returns {boolean}
 */
export function exigeLesSalaires(shareMode) {
  // Le prorata seul en a besoin : c'est lui qui divise par le total des
  // revenus. Le 50-50 partage en deux, le mode personnalisé applique des
  // pourcentages saisis à la main — ni l'un ni l'autre ne regarde un salaire.
  return shareMode !== '50-50' && shareMode !== 'custom';
}

export function computeSummary({ salaries, fixedCharges, variableCharges, reimbursements, shareMode, customPercents, carryOver = 0 }) {
  // Le prorata porte sur l'ensemble des revenus, pas sur le seul salaire :
  // allocations, loyers perçus et activité annexe font partie de ce dont
  // chacun dispose pour payer. Sans revenus complémentaires renseignés,
  // l'assiette se confond avec les salaires et le calcul est inchangé.
  const base = resolveIncomeBase(salaries);
  const totalSalaries = base.total;

  // La garde ne vaut que pour le prorata.
  //
  // Elle était inconditionnelle : un couple qui choisissait explicitement le
  // 50-50 et ne renseignait aucun salaire voyait « Renseignez vos deux
  // salaires pour obtenir le bilan du mois » — un conseil faux, puisque le
  // 50-50 ne regarde aucun salaire. L'application exigeait donc que les deux
  // se divulguent leurs revenus, ce qui est souvent la raison même du choix.
  if (exigeLesSalaires(shareMode) && totalSalaries === 0) {
    return { total: 0, yourShare: 0, partnerShare: 0, balance: 0, carryOver: 0 };
  }

  // Une dépense solo n'entre pas ici, et la garde est posée dans l'entonnoir
  // plutôt qu'à l'appel.
  //
  // Le filtre existe déjà en amont : les chargeurs rangent les solo dans un
  // état séparé, si bien qu'en usage normal `chargesCommunes` ne retire rien.
  // Il est répété ici parce que `computeSummary` est aussi appelée par
  // `computeBalanceChain`, qui lit `periods` **directement en base** et ne
  // passe par aucun chargeur : sans cette ligne, la chaîne de report compterait
  // les solo que l'écran ignore, et les deux lectures divergeraient d'un mois
  // sur l'autre en s'accumulant. C'est exactement l'écart qu'avait produit
  // `normalizePair` sur les revenus complémentaires — 100 € nés de rien, et
  // cumulés, parce qu'aucun écran ne montrait les deux chiffres côte à côte.
  const activeFixed = chargesCommunes(fixedCharges).filter(c => !c.deleted);
  const activeVariable = chargesCommunes(variableCharges).filter(c => !c.deleted);
  const activeReimbs = reimbursements.filter(r => !r.deleted);

  // Un montant inexploitable vaut zéro, jamais NaN.
  //
  // `sum + undefined` donne NaN, et NaN se propage : mesuré, une seule charge
  // sans montant rendait le bilan entier — total, parts, solde — égal à NaN,
  // c'est-à-dire « NaN € » à l'écran. Les charges variables étaient déjà
  // filtrées au chargement, mais ni les charges fixes ni les remboursements :
  // la garde appartient donc au calcul, qu'ils traversent tous.
  const allCharges = [...activeFixed, ...activeVariable].map(charge => ({
    ...charge,
    amount: Number.isFinite(charge.amount) ? charge.amount : 0
  }));
  const totalCharges = allCharges.reduce((sum, c) => sum + c.amount, 0);

  // Parts théoriques
  let yourTheoricalShare = 0;
  let partnerTheoricalShare = 0;

  allCharges.forEach(charge => {
    const shares = calculateChargeShares(charge, shareMode, base, totalSalaries, customPercents);
    yourTheoricalShare += shares.yourShare;
    partnerTheoricalShare += shares.partnerShare;
  });

  // Paiements réels
  let yourActualPayments = 0;
  let partnerActualPayments = 0;

  allCharges.forEach(charge => {
    if (charge.paidBy === 'vous') {
      yourActualPayments += charge.amount;
    } else if (charge.paidBy === 'conjointe') {
      partnerActualPayments += charge.amount;
    } else {
      const joint = calculateJointPayment(charge, shareMode, base, totalSalaries, customPercents);
      yourActualPayments += joint.yourPayment;
      partnerActualPayments += joint.partnerPayment;
    }
  });

  // Solde
  const balanceBeforeReimbs = yourActualPayments - yourTheoricalShare;

  // Un remboursement est un transfert d'argent déjà effectué, et il déplace le
  // solde dans le sens du transfert :
  //   Vous → Conjointe : vous avez avancé davantage, elle vous doit plus.
  //   Conjointe → Vous : elle s'est acquittée, elle vous doit moins.
  //
  // Les deux branches étaient inversées. Exemple mesuré : loyer de 1 000 €
  // payé par vous, salaires égaux — elle vous doit 500 €. Après qu'elle vous
  // ait remboursé ces 500 €, le solde affichait 1 000 € au lieu de zéro.
  //
  // Le `else` valait pour tout ce qui n'était pas « vous → conjointe » :
  // un champ absent, vide ou mal orthographié était donc compté comme un
  // transfert de la conjointe vers vous. Mesuré : un remboursement de 500 €
  // sans champ `direction` donnait exactement le même solde qu'un
  // « conjointe → vous », soit 1 000 € d'écart avec l'autre lecture possible.
  // Les règles acceptent n'importe quelle chaîne de 30 caractères et
  // n'exigent même pas le champ : la donnée existe donc.
  //
  // Un sens qu'on ne reconnaît pas ne désigne personne : la seule réponse
  // juste est de ne pas déplacer le solde, plutôt que de choisir un camp.
  let reimbursementAdjustment = 0;
  activeReimbs.forEach(reimb => {
    const montant = Number.isFinite(reimb.amount) ? reimb.amount : 0;
    if (reimb.direction === REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER) {
      reimbursementAdjustment += montant;
    } else if (reimb.direction === REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU) {
      reimbursementAdjustment -= montant;
    }
  });

  // Le solde propre au mois : ce que ses seules charges et ses seuls
  // remboursements produisent, indépendamment du passé.
  const ownBalance = balanceBeforeReimbs + reimbursementAdjustment;

  // Le report suit la même convention de signe que le solde : positif, la
  // conjointe reste débitrice du mois précédent. Nul par défaut, l'ajout est
  // donc sans effet tant que le report n'est pas activé.
  // Arrondi au centime : l'argent n'a pas de sens en deçà, et le residu de
  // virgule flottante en avait. Après un règlement de 728,89 sur un solde réel
  // de 728,888…, il restait -0,0011 — assez pour que l'application annonce
  // « Vous devez 0,00 € » et propose de régler une dette inexistante, en
  // boucle.
  const finalBalance = Math.round((ownBalance + carryOver) * 100) / 100;

  return {
    total: totalCharges,
    yourShare: yourTheoricalShare,
    partnerShare: partnerTheoricalShare,
    yourActualPayments,
    partnerActualPayments,
    balanceBeforeReimbs,
    reimbursementAdjustment,
    carryOver,
    ownBalance,
    balance: finalBalance
  };
}

/**
 * Calcule les montants à virer par destination (pur, sans DOM)
 * @param {Array} fixedCharges - Charges fixes actives
 * @param {Object} params - { shareMode, salaries, totalSalaries, customPercents }
 *   `salaries` est l'assiette du prorata, revenus complémentaires compris.
 * @returns {Array} Liste triée
 */
export function computeVirementsByDestination(fixedCharges, params) {
  const { shareMode, salaries, totalSalaries, customPercents } = params;
  const grouped = {};

  // Même garde que le bilan, et pour la même raison : ce panneau dit combien
  // virer à sa conjointe. Une dépense solo n'a rien à y faire — elle ne lui
  // doit rien. Le bilan avait déjà été blindé sans que ce calcul le soit, et
  // c'est ce décalage qui avait affiché « NaN € » à virer sous un bilan juste.
  chargesCommunes(fixedCharges).forEach(charge => {
    const dest = charge.destination || '';
    if (!dest) return;

    // Un montant inexploitable vaut zéro, jamais NaN — même règle que
    // `computeSummary`, et pour la même raison. Elle avait été posée là et
    // oubliée ici : mesuré, une seule charge fixe sans montant affichait
    // « NaN € » à virer pendant que le bilan, juste au-dessus, annonçait le
    // bon total. C'est pourtant ce panneau qui dit combien virer.
    const amount = Number.isFinite(charge.amount) ? charge.amount : 0;

    const effectiveMode = charge.splitOverride ? charge.splitOverride.mode : shareMode;
    let partnerShare;

    if (effectiveMode === '50-50') {
      partnerShare = amount * 0.5;
    } else if (effectiveMode === 'custom') {
      const pcts = pourcentages(charge, customPercents);
      partnerShare = amount * (pcts.conjointe / 100);
    } else {
      partnerShare = totalSalaries > 0
        ? amount * (salaries.conjointe / totalSalaries)
        : amount * 0.5;
    }

    if (!grouped[dest]) {
      grouped[dest] = { destination: dest, charges: [], total: 0 };
    }
    grouped[dest].charges.push({
      description: charge.description,
      amount,
      partnerShare
    });
    grouped[dest].total += partnerShare;
  });

  return Object.values(grouped).sort((a, b) => b.total - a.total);
}

/**
 * Convertit un nœud Firebase en tableau exploitable
 *
 * Realtime Database stocke les collections comme des objets indexés par clé
 * poussée, jamais comme des tableaux. Une valeur absente vaut `null`.
 *
 * @param {*} node - Nœud brut lu en base
 * @returns {Array<Object>} Les entrées, avec leur clé reportée en `id`
 */
function toEntries(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).map(([id, value]) => ({ id, ...value }));
}

/** Format d'une clé de période : AAAA-MM */
const PERIOD_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Calcule le solde cumulé de chaque période, mois par mois.
 *
 * Sans report, un mois non soldé disparaît : août se termine avec 500 € dus,
 * septembre repart de zéro et la dette n'est plus nulle part. Le report la
 * fait traverser les mois jusqu'à ce qu'elle soit réglée.
 *
 * Le cumul est un simple report en avant : le total d'un mois devient le
 * report du suivant, ce qui revient à la somme des soldes propres depuis le
 * premier mois. Régler un mois ramène son total à zéro, donc le report du
 * mois suivant aussi — la chaîne se referme d'elle-même.
 *
 * Les clés hors format AAAA-MM sont ignorées : le nœud `periods` a hébergé
 * des écritures accidentelles (`periods/undefined`) qui ne doivent pas
 * fausser le cumul.
 *
 * @param {Object} periods - Nœud `periods` complet, tel que lu en base
 * @param {Object} context - Contexte de calcul
 * @param {string} context.shareMode - Mode de partage courant
 * @param {Object} context.customPercents - Pourcentages personnalisés
 * @param {Object} context.globalSalaries - Salaires courants, défaut des mois sans instantané
 * @returns {Map<string, {own: number, carry: number, total: number}>} Par période, dans l'ordre chronologique
 */
export function computeBalanceChain(periods, { shareMode, customPercents, globalSalaries }) {
  const chain = new Map();
  if (!periods || typeof periods !== 'object') return chain;

  const keys = Object.keys(periods).filter(key => PERIOD_KEY.test(key)).sort();

  let carry = 0;
  for (const key of keys) {
    const period = periods[key] || {};

    // L'instantané de la période fait foi ; à défaut, les salaires courants.
    //
    // `resolveSalaries`, et non une normalisation locale : la chaîne lisait
    // `vous` et `conjointe` seulement, quand l'écran passe par
    // `resolveIncomeBase`, qui ajoute les revenus complémentaires. Deux
    // formules pour un même chiffre, donc deux réponses. Mesuré : mêmes
    // données, l'écran annonçait 400 € et le report en inscrivait 500 —
    // 100 € nés de rien, et cumulés chaque mois puisque la chaîne repart de
    // son propre total. Aucun écran ne montrant les deux côte à côte, l'écart
    // n'avait aucun moyen d'être remarqué.
    const { salaries } = resolveSalaries(period.salaries, globalSalaries);

    const { balance: own } = computeSummary({
      salaries,
      fixedCharges: toEntries(period.fixedCharges),
      variableCharges: toEntries(period.variableCharges),
      reimbursements: toEntries(period.reimbursements),
      // Un mois peut avoir figé son propre mode de partage (reconduction).
      shareMode: period.shareMode || shareMode,
      customPercents
    });

    const total = own + carry;
    chain.set(key, { own, carry, total });
    carry = total;
  }

  return chain;
}

// `normalizePair` vivait ici : une seconde lecture des revenus, qui ignorait
// `extraVous` et `extraConjointe`. C'est par elle que la chaîne de report
// divergeait de l'écran. Une seule fabrique d'assiette désormais —
// `resolveSalaries` puis `resolveIncomeBase` — et `tests/utils/report-solde.js`
// verrouille l'égalité des deux chiffres.
