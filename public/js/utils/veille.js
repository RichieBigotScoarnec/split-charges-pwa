/**
 * FairSplit — Ce que l'application remarque d'elle-même
 *
 * L'application répond aux questions qu'on lui pose. Elle ne disait rien de ce
 * qu'elle voit pourtant : qu'une cagnotte arrivée à son terme mérite d'être
 * remise en route pour l'an prochain, qu'un budget part trop vite pour tenir le
 * mois, qu'une charge fixe présente depuis des mois a disparu de celui-ci.
 *
 * Ce sont des observations, pas des prédictions. Chacune se déduit par le
 * calcul de données que le foyer a lui-même saisies, et chacune **dit sur quoi
 * elle se fonde** — c'est le champ `fonde`. Un conseil dont on ne peut pas
 * vérifier l'assise n'est pas un conseil, c'est une injonction.
 *
 * Trois règles tenues sans exception :
 *
 *   1. **Aucun chiffre inventé.** Tout montant remonte à une dépense ou à un
 *      réglage du foyer. L'application ne devine pas ce que devrait coûter des
 *      vacances : elle rappelle ce que les précédentes ont coûté.
 *   2. **Jamais de reproche.** « 1 009,81 € pour 800 € prévus » est un fait
 *      utile ; « vous avez dépassé votre budget » ne sert personne.
 *   3. **Rien à dire vaut mieux qu'un remplissage.** Une liste vide est un
 *      résultat normal, et l'écran doit savoir la traiter.
 *
 * Ce module ne fait que du calcul : aucune base, aucun DOM, aucun réseau.
 */

import { NATURES } from './enveloppes.js';
import { moisRestants, provisionMensuelle } from './provisions.js';
import { reporterDansLaPeriode } from './date.js';
import { estSolo } from './perimetre.js';

/** Une clé de mois */
const CLE_MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Combien de jours doivent s'être écoulés avant de juger d'un rythme
 *
 * Sur deux jours, une seule grosse course projette un dépassement qui n'en est
 * pas un. En dessous de ce seuil, l'application se tait plutôt que d'alerter
 * sur du bruit.
 */
export const JOURS_AVANT_DE_JUGER = 5;

/**
 * Sur combien de mois on cherche une charge devenue absente
 *
 * Deux mois suffisent à établir une habitude, et au-delà de trois on remonte à
 * des charges que le foyer a pu abandonner volontairement il y a longtemps.
 */
const PROFONDEUR_HABITUDE = 3;

/**
 * Le mois qui suit une période
 * @param {string} periode - AAAA-MM
 * @returns {string|null}
 */
export function moisSuivant(periode) {
  const lu = typeof periode === 'string' ? periode.match(CLE_MOIS) : null;
  if (!lu) return null;

  const annee = Number(lu[1]);
  const mois = Number(lu[2]);
  return mois === 12
    ? `${annee + 1}-01`
    : `${annee}-${String(mois + 1).padStart(2, '0')}`;
}

/**
 * La même date, un an plus tard
 *
 * Le quantième est conservé, sauf s'il n'existe pas dans le mois cible — un
 * 29 février devient un 28. `reporterDansLaPeriode` porte déjà cette règle.
 *
 * @param {string} date - AAAA-MM-JJ
 * @returns {string|null}
 */
export function memeDateLAnProchain(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const periodeCible = `${Number(date.slice(0, 4)) + 1}-${date.slice(5, 7)}`;
  return reporterDansLaPeriode(date, periodeCible);
}

/**
 * Le nom de l'enveloppe qui prend la suite, estampillée de son année
 *
 * Renouveler ne peut pas vouloir dire « réutiliser celle-ci ». L'enveloppe
 * existante porte les dépenses de l'année écoulée, et son pot les versements
 * qui les ont financées : repousser simplement son échéance ferait démarrer le
 * nouveau cycle avec 1 009,81 € déjà dépensés. C'est très exactement le défaut
 * que `identifiantEnveloppe` a été écrit pour empêcher, dans l'autre sens.
 *
 * La suivante est donc une enveloppe **neuve et vide**, distinguée par l'année
 * de sa propre échéance. Les deux coexistent : l'ancienne reste consultable,
 * la nouvelle part de zéro.
 *
 * @param {string} label - Libellé de l'enveloppe qui s'achève
 * @param {string} echeance - Nouvelle échéance, AAAA-MM-JJ
 * @returns {string}
 */
export function libelleRenouvele(label, echeance) {
  const net = String(label || '').trim();
  const annee = String(echeance || '').slice(0, 4);
  if (!annee) return net;

  // Un foyer qui nomme déjà ses enveloppes « Vacances 2027 » ne doit pas
  // obtenir « Vacances 2027 2028 » : l'année qui s'y trouve est remplacée.
  const sansAnnee = net.replace(/\s+\d{4}$/, '');
  return `${sansAnnee} ${annee}`.trim();
}

/**
 * Une cagnotte arrivée à terme mérite-t-elle d'être remise en route ?
 *
 * C'est l'observation qui a motivé ce module. Une enveloppe « Vacances » datée
 * du 29 août, alimentée ou non, sur laquelle le foyer a dépensé : une fois
 * l'échéance atteinte, la question utile n'est plus « où en est-on » mais
 * « combien mettre de côté chaque mois pour que l'an prochain soit déjà payé ».
 *
 * **La base du calcul est ce que le séjour a réellement coûté, pas ce qui
 * avait été prévu.** C'est le seul chiffre qui vaille : un objectif fixé à
 * 800 € pour une dépense de 1 009,81 € a été démenti par les faits, et le
 * reconduire reproduirait l'erreur. L'écart est donné, sans commentaire.
 *
 * La provision démarre le mois qui suit l'échéance : on épargne pour l'an
 * prochain une fois cette année soldée, ce qui donne les douze mois pleins.
 *
 * @param {Object} params
 * @param {Object} params.enveloppe - Enveloppe normalisée
 * @param {number} params.depenseReelle - Total des charges qui lui sont rattachées
 * @param {string} params.moisCourant - AAAA-MM
 * @returns {Object|null} Une observation, ou null si l'enveloppe n'est pas concernée
 */
export function provisionARenouveler({ enveloppe, depenseReelle, moisCourant }) {
  if (!enveloppe || enveloppe.nature === NATURES.MENSUELLE) return null;

  const echeance = typeof enveloppe.fin === 'string' ? enveloppe.fin : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(echeance)) return null;

  const depense = Number.isFinite(depenseReelle) ? depenseReelle : 0;
  if (depense <= 0) return null;

  // L'échéance est-elle atteinte ? `moisRestants` compte le mois de l'échéance,
  // donc 1 veut dire « on y est » et 0 « c'est passé ». Au-delà, la cagnotte
  // court encore et c'est `etatProvision` qui la suit — pas ce module.
  const restants = moisRestants(echeance, moisCourant);
  if (restants > 1) return null;

  const prochaine = memeDateLAnProchain(echeance);
  if (!prochaine) return null;

  const depart = moisSuivant(echeance.slice(0, 7));
  const aVenir = moisRestants(prochaine, depart);
  const parMois = provisionMensuelle(depense, 0, aVenir);

  // Encore dans le mois de l'échéance : d'autres dépenses peuvent tomber, et le
  // dire évite de présenter un total provisoire comme définitif.
  const encoreEnCours = restants === 1;

  const objectifPrevu = Number.isFinite(enveloppe.budget) ? enveloppe.budget : 0;
  const ecart = objectifPrevu > 0 ? depense - objectifPrevu : null;

  return {
    cle: `provision-a-renouveler:${enveloppe.id}`,
    titre: `Remettre « ${enveloppe.label} » en route pour l'an prochain`,
    montant: parMois,
    urgence: 'info',
    detail: `${parMois.toFixed(2)} € par mois pendant ${aVenir} mois, à partir de ${depart}, `
      + `pour disposer de ${depense.toFixed(2)} € au ${prochaine}.`,
    fonde: encoreEnCours
      ? `Sur ${depense.toFixed(2)} € dépensés à ce jour — le mois de l'échéance n'est pas fini.`
      : `Sur ${depense.toFixed(2)} € réellement dépensés.`,
    ecartAuPrevu: ecart,
    proposition: {
      label: libelleRenouvele(enveloppe.label, prochaine),
      icon: enveloppe.icon,
      nature: enveloppe.nature,
      budget: depense,
      fin: prochaine,
      debut: depart ? `${depart}-01` : null
    }
  };
}

/**
 * Ce budget mensuel tiendra-t-il jusqu'au bout du mois ?
 *
 * Non pas « avez-vous dépassé » — le dépassement se voit déjà sur la jauge —
 * mais « à ce rythme, allez-vous dépasser ». La projection est la plus simple
 * qui soit : ce qui a été dépensé rapporté aux jours écoulés, étendu au mois
 * entier. Elle ne prétend rien deviner des habitudes du foyer.
 *
 * Elle se tait pendant les premiers jours : sur deux jours, une seule grosse
 * course projette un dépassement qui n'en est pas un.
 *
 * @param {Object} params
 * @param {Object} params.enveloppe - Enveloppe normalisée, de nature mensuelle
 * @param {number} params.depense - Dépensé sur le mois consulté
 * @param {number} params.jourDuMois - Quantième du jour (1-31)
 * @param {number} params.joursDuMois - Nombre de jours du mois
 * @returns {Object|null}
 */
export function rythmeDuBudget({ enveloppe, depense, jourDuMois, joursDuMois, moisCourant, moisReel }) {
  if (!enveloppe || enveloppe.nature !== NATURES.MENSUELLE) return null;

  // ET SEULEMENT LE MOIS QU'ON VIT. `moisCourant` vient du sélecteur,
  // `jourDuMois` de l'horloge : sans ce rapprochement, choisir un mois clos
  // projetait ses dépenses sur les jours écoulés d'aujourd'hui et annonçait
  // qu'un budget déjà soldé « ne tiendra pas le mois ». Même garde que
  // `rythmeDuMois`, pour la même raison.
  //
  // Sans `moisReel`, la mesure se tait : on ne suppose pas que le mois affiché
  // est celui d'aujourd'hui.
  if (!moisReel || moisCourant !== moisReel) return null;

  const budget = Number.isFinite(enveloppe.budget) ? enveloppe.budget : 0;
  const sorti = Number.isFinite(depense) ? depense : 0;
  if (budget <= 0 || sorti <= 0) return null;

  const ecoules = Number.isFinite(jourDuMois) ? jourDuMois : 0;
  const duree = Number.isFinite(joursDuMois) ? joursDuMois : 0;
  if (ecoules < JOURS_AVANT_DE_JUGER || duree <= 0 || ecoules > duree) return null;

  // Déjà dépassé : la jauge le dit, et le dire deux fois n'ajoute rien.
  if (sorti >= budget) return null;

  const projection = sorti * (duree / ecoules);
  if (projection <= budget) return null;

  return {
    cle: `rythme-du-budget:${enveloppe.id}`,
    titre: `« ${enveloppe.label} » ne tiendra pas le mois à ce rythme`,
    montant: projection,
    urgence: 'attention',
    detail: `${projection.toFixed(2)} € à la fin du mois pour un budget de ${budget.toFixed(2)} €.`,
    fonde: `Sur ${sorti.toFixed(2)} € dépensés en ${ecoules} jours, étendus aux ${duree} du mois.`
  };
}

/**
 * Le libellé d'une charge, réduit à ce qui l'identifie d'un mois sur l'autre
 * @param {Object} charge
 * @returns {string}
 */
function empreinte(charge) {
  return typeof charge?.description === 'string'
    ? charge.description.trim().toLowerCase()
    : '';
}

/**
 * Les libellés de charges fixes actives d'un mois
 * @param {Object} periode - Nœud d'une période
 * @returns {Set<string>}
 */
function libellesDuMois(periode) {
  const noeud = periode && periode.fixedCharges;
  if (!noeud || typeof noeud !== 'object') return new Set();

  return new Set(
    Object.values(noeud)
      // Les dépenses solo n'engagent pas le foyer : leur absence ne le regarde pas.
      .filter(charge => charge && !charge.deleted && !estSolo(charge))
      .map(empreinte)
      .filter(Boolean)
  );
}

/**
 * Quelles charges fixes habituelles manquent au mois affiché ?
 *
 * La reconduction recopie les charges fixes au premier du mois. Une charge
 * présente depuis des mois et absente de celui-ci n'est donc pas un oubli de
 * saisie : c'est qu'elle a été supprimée, ou que la reconduction n'a pas eu
 * lieu. Le second cas est une panne que ce dépôt a déjà connue — un loyer
 * disparu d'un mois, en silence, définitivement.
 *
 * Le seuil est l'habitude, pas la présence unique : une charge vue une seule
 * fois le mois dernier ne prouve rien.
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` complet
 * @param {string} params.moisCourant - AAAA-MM
 * @returns {Object|null}
 */
export function chargesDisparues({ periods, moisCourant }) {
  if (!periods || typeof periods !== 'object' || !CLE_MOIS.test(moisCourant || '')) return null;

  const precedents = Object.keys(periods)
    .filter(cle => CLE_MOIS.test(cle) && cle < moisCourant)
    .sort()
    .slice(-PROFONDEUR_HABITUDE);

  // Une habitude demande au moins deux mois pour s'établir.
  if (precedents.length < 2) return null;

  const presences = new Map();
  for (const mois of precedents) {
    for (const libelle of libellesDuMois(periods[mois])) {
      presences.set(libelle, (presences.get(libelle) || 0) + 1);
    }
  }

  const actuelles = libellesDuMois(periods[moisCourant]);
  const manquantes = [...presences.entries()]
    .filter(([libelle, vues]) => vues >= 2 && !actuelles.has(libelle))
    .map(([libelle]) => libelle)
    .sort();

  if (manquantes.length === 0) return null;

  return {
    cle: 'charges-disparues',
    titre: manquantes.length === 1
      ? 'Une charge fixe habituelle manque à ce mois'
      : `${manquantes.length} charges fixes habituelles manquent à ce mois`,
    montant: null,
    urgence: 'attention',
    detail: manquantes.join(', '),
    fonde: `Présentes sur au moins deux des ${precedents.length} mois précédents, absentes de ${moisCourant}.`
  };
}

/**
 * Tout ce que l'application a remarqué, prêt pour l'écran
 *
 * L'ordre est celui de l'utilité : ce qui appelle une action d'abord, ce qui
 * informe ensuite. Une liste vide est un résultat normal — c'est même le cas
 * courant d'un mois qui se passe bien.
 *
 * @param {Object} params
 * @param {Array<{enveloppe: Object, depense: number}>} [params.enveloppes]
 * @param {Object} [params.periods] - Nœud `periods`, pour les charges disparues
 * @param {string} params.moisCourant - AAAA-MM
 * @param {number} [params.jourDuMois]
 * @param {number} [params.joursDuMois]
 * @returns {Array<Object>} Observations, les plus pressantes d'abord
 */
export function veiller({
  enveloppes = [], periods = null, moisCourant, moisReel, jourDuMois, joursDuMois
}) {
  const vues = [];

  for (const entree of Array.isArray(enveloppes) ? enveloppes : []) {
    if (!entree || !entree.enveloppe) continue;

    // DEUX CHIFFRES, PAS UN. La même entrée alimente deux mesures aux besoins
    // opposés, et leur passer la même valeur produisait une fausse alerte à
    // chaque mois.
    //
    //   `depenseDuMois` — ce que l'enveloppe a coûté sur le MOIS AFFICHÉ. Seul
    //                     chiffre qui ait un sens face à une allocation
    //                     mensuelle : « à ce rythme, tiendra-t-elle le mois ? »
    //   `depense`       — le cumul de TOUS les mois. Ce qu'il faut à la
    //                     provision : un séjour se juge sur ce qu'il a coûté en
    //                     tout, pas sur sa dernière semaine.
    //
    // Mesuré avec le câblage d'avant : un budget « Courses » de 600 €, 200 €
    // en juillet et 150 € en août, au 10 du mois. Le cumul de 350 € projetait
    // 1 085 € et déclenchait « ne tiendra pas le mois » — quand août, seul,
    // projette 465 € et tient largement. La carte criait tous les mois, sur
    // toute enveloppe mensuelle ayant un passé.
    //
    // Une entrée sans `depenseDuMois` fait TAIRE la mesure plutôt que de
    // retomber sur le cumul : le silence, jamais un chiffre faux.
    const rythme = rythmeDuBudget({
      enveloppe: entree.enveloppe,
      depense: entree.depenseDuMois,
      jourDuMois,
      joursDuMois,
      moisCourant,
      moisReel
    });
    if (rythme) vues.push(rythme);

    const provision = provisionARenouveler({
      enveloppe: entree.enveloppe,
      depenseReelle: entree.depense,
      moisCourant
    });
    if (provision) vues.push(provision);
  }

  const disparues = chargesDisparues({ periods, moisCourant });
  if (disparues) vues.push(disparues);

  // Ce qui demande une décision passe devant ce qui informe.
  return vues.sort((a, b) => {
    if (a.urgence !== b.urgence) return a.urgence === 'attention' ? -1 : 1;
    return a.cle.localeCompare(b.cle);
  });
}
