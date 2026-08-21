import { resolveIncomeBase } from './salaries.js';
import { REIMBURSEMENT_DIRECTIONS } from '../config.js';

// ===== FONCTIONS DE CALCUL PURES (testables) =====
// Extraites de summary.js pour permettre les tests unitaires

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
    const pcts = (charge.splitOverride && charge.splitOverride.vous !== undefined)
      ? charge.splitOverride
      : customPercents;
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
    const pcts = (charge.splitOverride && charge.splitOverride.vous !== undefined)
      ? charge.splitOverride
      : customPercents;
    yourJointRatio = pcts.vous / 100;
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
export function computeSummary({ salaries, fixedCharges, variableCharges, reimbursements, shareMode, customPercents, carryOver = 0 }) {
  // Le prorata porte sur l'ensemble des revenus, pas sur le seul salaire :
  // allocations, loyers perçus et activité annexe font partie de ce dont
  // chacun dispose pour payer. Sans revenus complémentaires renseignés,
  // l'assiette se confond avec les salaires et le calcul est inchangé.
  const base = resolveIncomeBase(salaries);
  const totalSalaries = base.total;

  if (totalSalaries === 0) {
    return { total: 0, yourShare: 0, partnerShare: 0, balance: 0, carryOver: 0 };
  }

  const activeFixed = fixedCharges.filter(c => !c.deleted);
  const activeVariable = variableCharges.filter(c => !c.deleted);
  const activeReimbs = reimbursements.filter(r => !r.deleted);

  const allCharges = [...activeFixed, ...activeVariable];
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
  let reimbursementAdjustment = 0;
  activeReimbs.forEach(reimb => {
    if (reimb.direction === REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER) {
      reimbursementAdjustment += reimb.amount;
    } else {
      reimbursementAdjustment -= reimb.amount;
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

  fixedCharges.forEach(charge => {
    const dest = charge.destination || '';
    if (!dest) return;

    const effectiveMode = charge.splitOverride ? charge.splitOverride.mode : shareMode;
    let partnerShare;

    if (effectiveMode === '50-50') {
      partnerShare = charge.amount * 0.5;
    } else if (effectiveMode === 'custom') {
      const pcts = (charge.splitOverride && charge.splitOverride.conjointe !== undefined)
        ? charge.splitOverride
        : customPercents;
      partnerShare = charge.amount * (pcts.conjointe / 100);
    } else {
      partnerShare = totalSalaries > 0
        ? charge.amount * (salaries.conjointe / totalSalaries)
        : charge.amount * 0.5;
    }

    if (!grouped[dest]) {
      grouped[dest] = { destination: dest, charges: [], total: 0 };
    }
    grouped[dest].charges.push({
      description: charge.description,
      amount: charge.amount,
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
    const salaries = normalizePair(period.salaries) || normalizePair(globalSalaries) || { vous: 0, conjointe: 0 };

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

/**
 * Normalise un couple de salaires venant de la base
 * @param {*} raw - Valeur brute
 * @returns {{vous: number, conjointe: number}|null} null si inexploitable
 */
function normalizePair(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const toNumber = (value) => {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return { vous: toNumber(raw.vous), conjointe: toNumber(raw.conjointe) };
}
