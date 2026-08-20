/**
 * FairSplit - Résolution des salaires d'une période
 *
 * Les salaires étaient stockés globalement, alors que toute l'application
 * calcule un prorata historique mois par mois : consulter le bilan de mars
 * le recalculait avec les salaires d'aujourd'hui. Une augmentation réécrivait
 * silencieusement l'historique de toutes les périodes archivées, pourtant
 * annoncées « lecture seule ».
 *
 * Chaque période porte désormais son propre instantané de salaires
 * (periods/{uid}/{YYYY-MM}/salaries). Le nœud global salaries/{uid} reste la
 * valeur courante, servant de défaut aux périodes qui n'ont pas encore
 * d'instantané.
 */

/**
 * Normalise un couple de salaires en nombres finis positifs
 *
 * Les revenus complémentaires — allocations, loyers perçus, activité annexe —
 * sont portés par le même instantané que les salaires : ils appartiennent au
 * même mois et se lisent d'un seul coup. Absents des données antérieures, ils
 * valent zéro, ce qui laisse le calcul inchangé.
 *
 * @param {*} raw - Valeur brute (peut venir de Firebase, donc non fiable)
 * @returns {{vous: number, conjointe: number, extraVous: number, extraConjointe: number}|null} null si inexploitable
 */
export function normalizeSalaries(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const toNumber = (value) => {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  return {
    vous: toNumber(raw.vous),
    conjointe: toNumber(raw.conjointe),
    extraVous: toNumber(raw.extraVous),
    extraConjointe: toNumber(raw.extraConjointe)
  };
}

/**
 * Assiette du prorata : ce dont chacun dispose réellement pour payer
 *
 * Le partage au prorata répond à une question de capacité contributive. Un
 * conjoint au salaire modeste mais percevant des allocations conséquentes se
 * voyait attribuer une part trop faible, parce que seul le salaire comptait.
 *
 * @param {*} salaries - Instantané de revenus, éventuellement partiel
 * @returns {{vous: number, conjointe: number, total: number}} Assiette par personne
 */
export function resolveIncomeBase(salaries) {
  const toNumber = (value) => {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const vous = toNumber(salaries?.vous) + toNumber(salaries?.extraVous);
  const conjointe = toNumber(salaries?.conjointe) + toNumber(salaries?.extraConjointe);

  return { vous, conjointe, total: vous + conjointe };
}

/**
 * Détermine les salaires applicables à une période
 *
 * L'instantané de la période fait foi dès qu'il existe. À défaut, on retombe
 * sur les salaires globaux courants — cas d'une période créée avant la mise
 * en place des instantanés, ou d'un mois encore vierge.
 *
 * @param {*} periodSalaries - Instantané lu sous periods/{période}/salaries
 * @param {*} globalSalaries - Salaires globaux courants
 * @returns {{salaries: {vous: number, conjointe: number}, fromSnapshot: boolean}}
 */
export function resolveSalaries(periodSalaries, globalSalaries) {
  const snapshot = normalizeSalaries(periodSalaries);

  if (snapshot) {
    return { salaries: snapshot, fromSnapshot: true };
  }

  return {
    // Forme complète même en dernier recours : un consommateur qui déstructure
    // extraVous ne doit pas recevoir undefined selon le chemin emprunté.
    salaries: normalizeSalaries(globalSalaries) || { vous: 0, conjointe: 0, extraVous: 0, extraConjointe: 0 },
    fromSnapshot: false
  };
}
