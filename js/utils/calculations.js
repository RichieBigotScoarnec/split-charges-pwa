// ===== FONCTIONS DE CALCUL PURES (testables) =====
// Extraites de summary.js pour permettre les tests unitaires

/**
 * Calcule la part théorique d'une charge pour chaque personne
 * @param {Object} charge - { amount, splitOverride }
 * @param {string} shareMode - Mode global ('prorata', '50-50', 'custom')
 * @param {Object} salaries - { vous, conjointe }
 * @param {number} totalSalaries - Total des salaires
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
 * @param {Object} salaries - { vous, conjointe }
 * @param {number} totalSalaries - Total des salaires
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
export function computeSummary({ salaries, fixedCharges, variableCharges, reimbursements, shareMode, customPercents }) {
  const totalSalaries = salaries.vous + salaries.conjointe;

  if (totalSalaries === 0) {
    return { total: 0, yourShare: 0, partnerShare: 0, balance: 0 };
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
    const shares = calculateChargeShares(charge, shareMode, salaries, totalSalaries, customPercents);
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
      const joint = calculateJointPayment(charge, shareMode, salaries, totalSalaries, customPercents);
      yourActualPayments += joint.yourPayment;
      partnerActualPayments += joint.partnerPayment;
    }
  });

  // Solde
  const balanceBeforeReimbs = yourActualPayments - yourTheoricalShare;

  let reimbursementAdjustment = 0;
  activeReimbs.forEach(reimb => {
    if (reimb.direction === 'vous-to-conjointe') {
      reimbursementAdjustment -= reimb.amount;
    } else {
      reimbursementAdjustment += reimb.amount;
    }
  });

  const finalBalance = balanceBeforeReimbs + reimbursementAdjustment;

  return {
    total: totalCharges,
    yourShare: yourTheoricalShare,
    partnerShare: partnerTheoricalShare,
    yourActualPayments,
    partnerActualPayments,
    balanceBeforeReimbs,
    reimbursementAdjustment,
    balance: finalBalance
  };
}

/**
 * Calcule les montants à virer par destination (pur, sans DOM)
 * @param {Array} fixedCharges - Charges fixes actives
 * @param {Object} params - { shareMode, salaries, totalSalaries, customPercents }
 * @returns {Array} Liste triée
 */
export function computeVirementsByDestination(fixedCharges, params) {
  const { shareMode, salaries, totalSalaries, customPercents } = params;
  const grouped = {};

  fixedCharges.forEach(charge => {
    const dest = charge.destination || '';
    if (!dest) return;

    const effectiveMode = charge.splitOverride ? charge.splitOverride.mode : shareMode;
    let partnerShare = 0;

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
