#!/usr/bin/env node
/**
 * Rattrape les charges dont la répartition choisie n'a jamais été appliquée
 *
 * La saisie rapide écrivait `splitMode: '50-50'`. Personne ne lit ce champ :
 * `calculateChargeShares` et `calculateJointPayment` n'interrogent que
 * `splitOverride`, que renseignent les deux formulaires complets. Une charge
 * saisie en « 50-50 » depuis l'écran express restait donc répartie selon le mode
 * du foyer, pendant que le toast de confirmation annonçait « (50-50) ».
 *
 * Le défaut est corrigé pour les nouvelles saisies. Celles déjà enregistrées ne
 * se corrigent pas toutes seules : ce script construit le correctif.
 *
 * Il ne touche à rien. Il lit un vidage et rend la liste des chemins à écrire —
 * c'est le workflow qui décide de l'appliquer ou non. Une migration qui
 * s'exécute au moment où on cherche à savoir ce qu'elle ferait est une
 * migration qu'on n'ose plus lancer.
 *
 * Usage : node tools/migration-repartition.mjs <vidage.json> [correctif.json]
 */

import { readFileSync, writeFileSync } from 'node:fs';

/** Les deux collections où vivent des charges portant une répartition */
const COLLECTIONS = ['variableCharges', 'fixedCharges'];

/**
 * Une charge attend-elle son correctif ?
 *
 * Deux conditions, et la seconde compte autant que la première : une charge qui
 * porte déjà `splitOverride` a été saisie ou corrigée depuis un formulaire
 * complet. La réécrire effacerait une répartition personnalisée — un 70/30
 * deviendrait un 50/50 — c'est-à-dire abîmerait précisément ce qu'on répare.
 *
 * @param {*} charge - Une charge telle qu'elle est en base
 * @returns {boolean}
 */
export function attendSonCorrectif(charge) {
  if (!charge || typeof charge !== 'object') return false;
  if (charge.splitMode !== '50-50') return false;
  return charge.splitOverride === undefined || charge.splitOverride === null;
}

/**
 * Construit le correctif à appliquer, sans rien écrire
 *
 * Les clés sont des chemins relatifs à la racine du foyer, séparés par des
 * barres : c'est la forme qu'attend une écriture multi-chemins de Realtime
 * Database, et elle a l'avantage d'être atomique — tout passe, ou rien.
 *
 * @param {*} vidage - Sous-arbre `household` tel que rendu par la CLI Firebase
 * @returns {{correctif: Object, concernees: Array, ignorees: Array}}
 */
export function planifier(vidage) {
  const correctif = {};
  const concernees = [];
  const ignorees = [];

  const periodes = (vidage && vidage.periods) || {};

  for (const [periode, contenu] of Object.entries(periodes)) {
    if (!contenu || typeof contenu !== 'object') continue;

    for (const collection of COLLECTIONS) {
      const charges = contenu[collection];
      if (!charges || typeof charges !== 'object') continue;

      for (const [id, charge] of Object.entries(charges)) {
        if (!charge || typeof charge !== 'object') continue;

        // Consigné à part : une charge qui porte `splitMode: '50-50'` ET un
        // `splitOverride` n'est pas un cas sain à taire, c'est un cas qu'on a
        // délibérément laissé tel quel. Le résumé doit pouvoir le dire.
        if (charge.splitMode === '50-50' && !attendSonCorrectif(charge)) {
          ignorees.push({
            periode, collection, id,
            description: charge.description,
            motif: 'porte déjà une répartition explicite'
          });
          continue;
        }

        if (!attendSonCorrectif(charge)) continue;

        correctif[`periods/${periode}/${collection}/${id}/splitOverride`] = { mode: '50-50' };
        concernees.push({
          periode, collection, id,
          description: charge.description,
          montant: charge.amount,
          // Une charge à la corbeille ne compte dans aucun bilan. La migrer
          // n'a pas d'effet visible aujourd'hui, mais lui en donnerait un si
          // elle était restaurée : autant qu'elle soit juste dès maintenant.
          supprimee: charge.deleted === true
        });
      }
    }
  }

  return { correctif, concernees, ignorees };
}

/**
 * Ce que la migration déplace dans le solde d'une période
 *
 * Une migration de comptes qui ne dit pas de combien elle déplace les comptes
 * demande une confiance qu'elle n'a pas méritée. Ce total n'est pas le solde
 * recalculé — il faudrait les salaires de chaque période pour cela — mais le
 * montant total des charges dont la répartition change, période par période.
 * C'est l'ordre de grandeur de ce qui est en jeu.
 *
 * @param {Array} concernees - Sortie de `planifier`
 * @returns {Object} Montant concerné par période
 */
export function montantsParPeriode(concernees) {
  const totaux = {};
  for (const charge of concernees) {
    if (charge.supprimee) continue;
    const montant = typeof charge.montant === 'number' ? charge.montant : 0;
    totaux[charge.periode] = Math.round(((totaux[charge.periode] || 0) + montant) * 100) / 100;
  }
  return totaux;
}

/**
 * Contrôle l'état de la base après écriture
 *
 * L'écriture passe par une mise à jour multi-chemins : les clés du correctif
 * sont des chemins séparés par des barres, que Realtime Database est censé
 * interpréter comme une descente dans l'arbre. Si cette interprétation n'avait
 * pas lieu, la base se retrouverait avec des clés littérales nommées
 * « periods/2026-07/… » à la racine du foyer — dégât visible, réparable, mais
 * qu'il vaut mieux constater tout de suite que le mois suivant.
 *
 * Ce contrôle ne suppose donc rien : il relit et vérifie les deux choses.
 *
 * @param {*} vidage - Sous-arbre `household` relu après écriture
 * @returns {string[]} Anomalies constatées, vide si tout est en ordre
 */
export function verifier(vidage) {
  const anomalies = [];

  const clesLitterales = Object.keys(vidage || {}).filter(cle => cle.includes('/'));
  if (clesLitterales.length > 0) {
    anomalies.push(
      `${clesLitterales.length} clé(s) littérale(s) créée(s) à la racine — `
      + `les chemins n'ont pas été interprétés : ${clesLitterales.slice(0, 3).join(', ')}`
    );
  }

  const { concernees } = planifier(vidage);
  if (concernees.length > 0) {
    anomalies.push(
      `${concernees.length} charge(s) attendent encore leur correctif — l'écriture n'a pas pris`
    );
  }

  return anomalies;
}

// ===== EXÉCUTION =====
const appeleDirectement = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());

if (appeleDirectement) {
  const [, , entree, sortie] = process.argv;

  if (!entree) {
    console.error('Usage : node tools/migration-repartition.mjs <vidage.json> [correctif.json]');
    console.error('        node tools/migration-repartition.mjs --verifier <vidage-relu.json>');
    process.exit(2);
  }

  if (entree === '--verifier') {
    const relu = JSON.parse(readFileSync(sortie, 'utf8'));
    const anomalies = verifier(relu);

    if (anomalies.length > 0) {
      console.error('Migration à contrôler — la base n\'est pas dans l\'état attendu :');
      for (const anomalie of anomalies) console.error(`  • ${anomalie}`);
      console.error('La sauvegarde prise avant écriture est déposée en artefact.');
      process.exit(1);
    }

    console.log('Contrôle après écriture : aucune anomalie, plus aucune charge en attente.');
    process.exit(0);
  }

  const vidage = JSON.parse(readFileSync(entree, 'utf8'));

  // Le même contrôle de vraisemblance que la sauvegarde : sur un vidage vide,
  // le plan serait vide lui aussi, et « rien à migrer » se confondrait avec
  // « je n'ai rien pu lire ».
  if (!vidage || typeof vidage !== 'object' || !vidage.periods) {
    console.error('Migration refusée : le vidage est vide ou illisible.');
    console.error('« Rien à migrer » et « rien n\'a été lu » se ressemblent trop pour être confondus.');
    process.exit(1);
  }

  const { correctif, concernees, ignorees } = planifier(vidage);
  const totaux = montantsParPeriode(concernees);

  if (sortie) writeFileSync(sortie, JSON.stringify(correctif, null, 2));

  console.log(`Charges à migrer : ${concernees.length}`);
  console.log(`Charges laissées telles quelles : ${ignorees.length}`);
  for (const [periode, montant] of Object.entries(totaux)) {
    console.log(`  ${periode} : ${montant.toFixed(2)} € de charges changent de répartition`);
  }
}
