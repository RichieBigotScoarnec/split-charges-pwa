/**
 * FairSplit — Une charge modifiée change de mois quand sa date en change
 *
 * Mesuré le 2026-10-29 sur une sauvegarde réelle : une charge commune de 182 €
 * datée du 2026-11-01 vivait sous `periods/2026-10` et pesait sur le solde
 * d'octobre. L'ajout rangeait par la date (`periodeDeLaDate`), la modification
 * par le mois affiché : deux chemins qui décidaient différemment de la même
 * grandeur (règle 2).
 *
 * ## Le critère, et pourquoi pas l'autre
 *
 * La charge se déplace quand le MOIS DE SA DATE CHANGE — l'ancienne date contre
 * la nouvelle. Pas quand le mois de sa date diffère du mois où elle vit : ce
 * second critère déplacerait toute charge déjà mal rangée au premier montant
 * corrigé, et ce n'est pas le geste qu'on a fait (décision du foyer,
 * 2026-10-29). Les charges déjà mal rangées se relèvent à part —
 * `tools/charges-mal-rangees.mjs`.
 *
 * L'ancienne date se lit par `dateSaisissable`, c'est-à-dire telle que le
 * formulaire l'a MONTRÉE : une charge d'avant le champ s'ouvre à son
 * horodatage, et ne pas y toucher ne doit rien déplacer.
 *
 * ## Ce que la reconduction en pense
 *
 * `planDeLaPoche` refuse un mois « déjà garni » d'une charge fixe : y déplacer
 * une charge fixe avant qu'il soit reconduit l'empêche de l'être jamais. Et un
 * mois déjà reconduit peut porter la copie de la charge qu'on y déplace. Ce
 * module ne répare ni l'un ni l'autre — le défaut existe aussi à l'ajout daté
 * dans le futur, et il se traite dans la reconduction elle-même. Il le DIT,
 * seulement quand c'est vrai.
 *
 * Aucune base, aucun DOM, aucun réseau.
 */

import { dateSaisissable, periodeDeLaDate, formatPeriod } from './date.js';
import { planRecurrence } from './recurrence.js';
import { proprietaireDuSolo } from './perimetre.js';

/**
 * Le mois où une charge modifiée doit vivre
 *
 * @param {Object} params
 * @param {Object} params.ancienne - La charge telle qu'elle est en base
 * @param {string} params.nouvelleDate - La date saisie, AAAA-MM-JJ
 * @param {string} params.periodeActuelle - Le mois où elle vit, AAAA-MM
 * @returns {string} Le mois de destination ; `periodeActuelle` si rien ne bouge
 */
export function periodeDeDestination({ ancienne, nouvelleDate, periodeActuelle }) {
  const apres = periodeDeLaDate(nouvelleDate);
  if (!apres) return periodeActuelle;

  const avant = periodeDeLaDate(dateSaisissable(ancienne || {}));
  return apres === avant ? periodeActuelle : apres;
}

/**
 * Le toast d'un déplacement — il nomme le mois d'arrivée
 *
 * Sans lui, la charge disparaît de la liste affichée et semble ne s'être
 * enregistrée nulle part. Même rédaction que l'ajout daté ailleurs.
 *
 * @param {string} periode - AAAA-MM
 * @returns {string}
 */
export function messageDuDeplacement(periode) {
  return `Charge déplacée en ${formatPeriod(periode)}, sa date`;
}

/** Un mois en tête de phrase : « Novembre 2026 » */
const moisEnTete = (periode) => {
  const texte = formatPeriod(periode);
  return texte.charAt(0).toLocaleUpperCase('fr') + texte.slice(1);
};

/** « de novembre », mais « d'octobre », « d'avril », « d'août » */
const deMois = (periode) => {
  const texte = formatPeriod(periode);
  return /^[aàâeéèêiîoôuy]/i.test(texte) ? `d'${texte}` : `de ${texte}`;
};

/** Un libellé comparable : sans casse ni espaces de bord */
const comparable = (texte) => (typeof texte === 'string' ? texte.trim().toLocaleLowerCase('fr') : '');

/**
 * Ce que le déplacement d'une charge fixe fait à la reconduction, ou rien
 *
 * @param {Object} params
 * @param {Object} params.charge - La charge telle qu'elle sera écrite
 * @param {string} params.id - Son identifiant
 * @param {string} params.origine - Le mois qu'elle quitte
 * @param {string} params.cible - Le mois où elle arrive
 * @param {string} params.moisCourant - Le mois calendaire, AAAA-MM
 * @param {Object} params.periods - Nœud `periods` fusionné, AVANT le déplacement
 * @param {string|null} params.moi - Emplacement du compte connecté
 * @param {*} params.empreintePersonnelle - Marque de reconduction de MA poche, au mois cible
 * @returns {string|null} Une phrase, seulement quand elle est vraie
 */
export function avertissementDeReconduction({
  charge, id, origine, cible, moisCourant, periods, moi, empreintePersonnelle
}) {
  if (!periods || typeof periods !== 'object') return null;

  const poche = proprietaireDuSolo(charge);
  // Une charge personnelle qui n'est pas la mienne ne s'édite pas d'ici.
  if (poche && poche !== moi) return null;

  // BLOCAGE. Le plan se calcule SANS la charge à son origine, et sans elle à
  // la cible : c'est ce que la reconduction aurait fait si elle n'était pas
  // venue garnir le mois. Laisser la charge à son origine ferait annoncer
  // qu'on perd… la charge même qui arrive.
  const sansElle = { ...periods };
  const mois = sansElle[origine];
  if (mois?.fixedCharges && typeof mois.fixedCharges === 'object') {
    const restantes = { ...mois.fixedCharges };
    delete restantes[id];
    sansElle[origine] = { ...mois, fixedCharges: restantes };
  }

  const plan = planRecurrence({
    target: cible, currentMonth: moisCourant, periods: sansElle, moi, empreintePersonnelle
  });
  const planDeSaPoche = poche ? plan?.personnel : plan?.commun;
  if (planDeSaPoche) {
    return `${moisEnTete(cible)} ne recevra pas les charges récurrentes `
      + `${deMois(planDeSaPoche.source)} : la reconduction ne remplit qu'un mois `
      + 'sans charge fixe. Ajoutez-les à la main si besoin.';
  }

  // DOUBLON. Le mois cible a déjà été reconduit dans cette poche, et il porte
  // une charge fixe active du même libellé — vraisemblablement sa copie.
  const arrivee = periods[cible] || {};
  const empreinte = poche ? empreintePersonnelle : arrivee.reconductedFrom;
  if (!empreinte) return null;

  const libelle = comparable(charge?.description);
  if (!libelle) return null;

  const jumelle = Object.entries(arrivee.fixedCharges || {}).some(([cle, autre]) =>
    cle !== id && autre && !autre.deleted
      && proprietaireDuSolo(autre) === poche
      && comparable(autre.description) === libelle);

  return jumelle
    ? `${moisEnTete(cible)} porte déjà une charge « ${charge.description.trim()} » : `
      + 'vérifiez qu\'elle n\'est pas comptée deux fois.'
    : null;
}
