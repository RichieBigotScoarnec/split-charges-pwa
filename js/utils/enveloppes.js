import { parseMontant } from './montant.js';
import { versementMensuelLisible } from './versement-mensuel.js';
import { joursRestantsDansLeMois } from './date.js';
import { plier } from './recherche-texte.js';

/**
 * L'enveloppe transversale, et ce qu'elle n'est pas
 *
 * Une catégorie répond à « qu'est-ce que c'est ? » — des courses, de l'essence.
 * Une enveloppe répond à « à quoi ça se rattache ? » — cette semaine de
 * vacances, ce déménagement, ce chantier. Les deux coexistent sur la même
 * charge : le plein d'essence de la route des vacances reste de l'essence.
 *
 * D'où « transversale » : l'enveloppe traverse les catégories, et traverse
 * aussi les mois. Une semaine de vacances à cheval sur juillet et août est une
 * seule enveloppe, pas deux.
 *
 * Ce qu'une enveloppe ne fait pas, et ne doit jamais faire : changer le solde.
 * Rattacher une charge à « Vacances » ne modifie ni son montant, ni son payeur,
 * ni sa répartition. C'est une étiquette de lecture, pas un mécanisme de
 * partage. `tests/utils/enveloppes.test.js` le vérifie en repassant les mêmes
 * charges dans `computeSummary`, avec et sans enveloppe.
 *
 * Ce fichier ne contient que des fonctions pures : le module `envelopes.js`
 * s'occupe de la base et de l'écran.
 */

/**
 * Les deux natures d'enveloppe, et pourquoi il en faut deux
 *
 * Elles répondent à deux questions différentes, et leur reliquat n'a pas le
 * même statut :
 *
 *   mensuelle — « combien me reste-t-il **ce mois-ci** ? » Se recharge le 1er.
 *               Le reliquat est une *information* : il dit qu'on a bien visé,
 *               pas qu'on a de l'argent en plus. Courses, transports, loisirs.
 *
 *   cagnotte  — « combien ai-je **mis de côté** ? » Ne se recharge pas, traverse
 *               les mois. Le reliquat *est* de l'argent, et doit survivre au
 *               changement de mois. Travaux, Noël, vacances, épargne.
 *
 * Tout ramener à une seule nature perd de l'information dans les deux sens :
 * en tout mensuel, une provision de 28,63 € repart de zéro chaque 1er et
 * disparaît de l'écran ; en tout cumulatif, un budget courses de 600 € affiche
 * le total dépensé depuis toujours, ce qui ne dit jamais si *ce* mois est tenu.
 *
 * **L'absence vaut `cagnotte`**, et ce n'est pas un choix arbitraire : c'est
 * exactement ce que faisait l'enveloppe jusqu'ici — elle traverse les mois et
 * se compare à un budget total. Toutes celles déjà en base gardent donc leur
 * comportement, au centime près.
 */
export const NATURES = Object.freeze({
  MENSUELLE: 'mensuelle',
  CAGNOTTE: 'cagnotte'
});

/**
 * Le rang d'une enveloppe : sa place dans le budget, décidée par son rythme
 *
 * Le classement se fait par rythme de trésorerie, jamais par sujet. « Noël » et
 * « Loisirs » se ressemblent — deux plaisirs — mais leur argent ne se comporte
 * pas pareil : l'un s'accumule vers une date connue, l'autre se dépense dans
 * le mois. Les ranger ensemble, c'est laisser la provision de décembre financer
 * un samedi soir de août.
 */
export const RANGS = Object.freeze({
  FIXE: 'fixe',
  MENSUEL: 'mensuel',
  PROVISION: 'provision',
  EPARGNE: 'epargne',
  RESERVE: 'reserve'
});

/** Les personnes qui peuvent posséder une enveloppe solo */
const PERSONNES = Object.freeze(['vous', 'conjointe']);

/** Longueur maximale d'un libellé, alignée sur les règles de sécurité */
const LONGUEUR_LIBELLE = 100;

/** Plafond d'un budget d'enveloppe, aligné sur `categoryBudgets` */
const BUDGET_MAX = 10000000;

/** Format d'une date d'enveloppe : AAAA-MM-JJ */
const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Remet une enveloppe lue en base dans une forme exploitable
 *
 * Les données arrivent de Firebase telles qu'elles y ont été écrites, par une
 * version de l'application qui n'est pas forcément celle qui les relit. Une
 * enveloppe sans `id` ou sans `label` ne peut désigner personne : elle est
 * écartée plutôt que rendue à moitié, car une entrée à moitié valide se propage
 * ensuite dans les listes déroulantes et les totaux.
 *
 * Les champs facultatifs absents valent `null`, jamais `undefined` : Firebase
 * refuse `undefined` à l'écriture, et le tri en aurait fait un cas particulier.
 *
 * @param {*} brut - Entrée telle que lue en base
 * @returns {{id: string, label: string, icon: string, budget: number|null, debut: string|null, fin: string|null, cloturee: boolean, creePar: string|null, creeLe: number|null}|null}
 */
export function normaliserEnveloppe(brut) {
  if (!brut || typeof brut !== 'object') return null;

  const id = typeof brut.id === 'string' ? brut.id.trim() : '';
  const label = typeof brut.label === 'string' ? brut.label.trim() : '';
  if (!id || !label) return null;

  // Le périmètre d'abord : le propriétaire n'a de sens que sur une solo, et
  // une solo sans propriétaire lisible n'appartient à personne plutôt qu'à
  // quelqu'un choisi au hasard — la même règle que pour une charge.
  const perimetre = brut.perimetre === 'solo' ? 'solo' : 'commun';
  const proprietaire = perimetre === 'solo' && PERSONNES.includes(brut.proprietaire)
    ? brut.proprietaire
    : null;

  return {
    id,
    label: label.slice(0, LONGUEUR_LIBELLE),
    icon: typeof brut.icon === 'string' && brut.icon ? brut.icon : '🧳',
    budget: budgetLisible(brut.budget),
    debut: dateLisible(brut.debut),
    fin: dateLisible(brut.fin),
    cloturee: brut.cloturee === true,
    // Seule la chaîne exacte bascule en mensuelle : une valeur absente, vide,
    // mal orthographiée ou d'un autre type retombe sur `cagnotte`, qui est le
    // comportement historique.
    nature: brut.nature === NATURES.MENSUELLE ? NATURES.MENSUELLE : NATURES.CAGNOTTE,
    // Le report du non-dépensé, sur une mensuelle seulement. Faux par défaut :
    // c'est la remise à zéro sèche qui fait d'un budget une contrainte. Une
    // cagnotte n'a pas besoin du drapeau — elle reporte par nature.
    report: brut.nature === NATURES.MENSUELLE && brut.report === true,
    rang: Object.values(RANGS).includes(brut.rang) ? brut.rang : null,
    // LE SUJET, distinct du rang qui dit le RYTHME.
    //
    // « Vacances 2026 », « Week-end Bretagne » et « Vacances 2027 » parlent de
    // la même chose sans se suivre. Le rang ne pouvait pas les réunir : il
    // classe par rythme de trésorerie, à dessein — sans quoi la provision de
    // décembre financerait un samedi soir d'août.
    //
    // `null` quand il est absent, comme `proprietaire` et `creePar` : Firebase
    // supprime une clé écrite à `null`, `.validate` n'est alors pas évaluée, et
    // tout l'existant reste valide sans une ligne de migration.
    theme: themeLisible(brut.theme),
    perimetre,
    proprietaire,
    // QUI l'a créée, et QUAND.
    //
    // Un versement exige un auteur nominatif depuis toujours ; une enveloppe
    // n'en gardait aucun — alors que l'application propose d'en créer une d'un
    // seul geste, depuis une carte qui paraît d'elle-même. Le foyer a découvert
    // « Vacances 2027 » sans savoir d'où elle sortait, et l'application n'avait
    // aucune réponse à lui donner : rien n'était enregistré.
    //
    // Absent sur tout l'existant, et c'est normal : `null` se lit « on ne sait
    // pas », jamais « personne ». Une valeur inventée serait pire que le vide.
    creePar: PERSONNES.includes(brut.creePar) ? brut.creePar : null,
    creeLe: Number.isFinite(brut.creeLe) && brut.creeLe > 0 ? brut.creeLe : null,
    // CE QU'ON Y MET CHAQUE MOIS, sans avoir à y penser.
    //
    // `null` quand il est absent, comme `theme` et `creePar` : Firebase
    // supprime une clé écrite à `null`, `.validate` n'est alors pas évaluée, et
    // tout l'existant reste valide sans une ligne de migration.
    //
    // Un réglage à moitié lisible — un montant sans destinataire, ou l'inverse —
    // vaut absence : `versementMensuelLisible` refuse de trancher à la place du
    // foyer, et le mois ne sera simplement pas alimenté.
    versementMensuel: versementMensuelLisible(brut.versementMensuel)
  };
}

/**
 * Normalise une liste entière, en écartant les entrées inexploitables
 *
 * @param {*} liste - Nœud `envelopes` tel que lu en base
 * @returns {Array<Object>} Enveloppes exploitables, dans l'ordre d'origine
 */
export function normaliserEnveloppes(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.map(normaliserEnveloppe).filter(Boolean);
}

/**
 * Un budget, s'il en porte un
 *
 * Zéro est une valeur légitime — une enveloppe qu'on veut suivre sans rien y
 * autoriser — mais elle est indiscernable de « pas de budget » une fois écrite.
 * On retient donc `null` pour l'absence et on n'accepte que le strictement
 * positif : une jauge sur zéro n'apprend rien, et « 0 € dépensés sur 0 € »
 * afficherait un dépassement dès le premier centime.
 *
 * @param {*} valeur - Montant saisi ou lu
 * @returns {number|null} Budget exploitable, ou null
 */
export function budgetLisible(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const montant = parseMontant(valeur);
  if (!Number.isFinite(montant) || montant <= 0 || montant > BUDGET_MAX) return null;
  return montant;
}

/**
 * Une date de fenêtre, si elle est écrite au bon format
 *
 * @param {*} valeur - Date lue ou saisie
 * @returns {string|null} AAAA-MM-JJ, ou null
 */
export function dateLisible(valeur) {
  if (typeof valeur !== 'string') return null;
  const propre = valeur.trim();
  return FORMAT_DATE.test(propre) ? propre : null;
}

/**
 * Le libellé d'un thème, tel qu'il sera ÉCRIT
 *
 * Un thème regroupe des enveloppes qui parlent de la même chose sans se
 * suivre : « Vacances 2026 », « Week-end Bretagne », « Vacances 2027 ». Le
 * `rang` ne pouvait pas servir — il dit un rythme de trésorerie, pas un sujet.
 *
 * **Le thème reste une VALEUR, jamais une clé Firebase.** C'est ce qui le
 * sépare de `categoryBudgets`, indexé par libellé, où « Eau/Gaz » rendait
 * *tous* les budgets insauvegardables. Ici « Été/Hiver » s'écrit sans risque,
 * et aucun validateur de caractères n'est nécessaire.
 *
 * Le nettoyage ramène à une espace ce qui est INVISIBLE — caractères de
 * contrôle et de format — plutôt que de le refuser : deux thèmes qui se lisent
 * pareil à l'écran doivent être le même thème. `\p{Cf}` couvre l'espace de
 * largeur nulle et les marques de direction, mais **pas** le liant U+200D, qui
 * tient ensemble les emoji composés : le retirer couperait une famille en trois.
 *
 * @param {*} valeur - Saisie ou valeur lue en base
 * @returns {string|null} Libellé propre, ou null si rien de lisible
 */
export function themeLisible(valeur) {
  if (typeof valeur !== 'string') return null;

  const propre = valeur
    // Le liant U+200D est ÉCHAPPÉ et non tapé : un caractère invisible dans la
    // source est indétectable à la relecture, et la CI l'a déjà refusé une fois
    // ce jour-là sur les séparateurs de milliers. Une fonction de remplacement
    // plutôt qu'une soustraction d'ensembles `\p{Cf}--[\u200D]` : celle-ci
    // exige le drapeau `v`, trop récent pour être supposé partout.
    .replace(/[\p{Cc}\p{Cf}]/gu, (invisible) => (invisible === '\u200D' ? invisible : ' '))
    .replace(/\s+/g, ' ')
    .trim();

  if (!propre) return null;

  // Retrimé après la coupe : cent caractères peuvent tomber juste après une
  // espace, et un libellé finissant par un blanc n'est pas le même que le
  // même sans — pour `cleDuTheme` non, pour l'affichage si.
  return propre.slice(0, LONGUEUR_LIBELLE).trim();
}

/**
 * La clé sous laquelle deux thèmes sont LE MÊME
 *
 * « Week-end », « week end », « Weekend » et « WEEK END » désignent une seule
 * chose. Sans cette fabrique, ils feraient quatre thèmes, et l'agrégation
 * annuelle serait fausse sans que rien ne le dise — la classe de défaut la plus
 * coûteuse de ce dépôt.
 *
 * Distincte de `themeLisible` **à dessein** : l'une décide de ce qui s'affiche,
 * l'autre de ce qui se compare. Les confondre imposerait au foyer une casse et
 * une orthographe qu'il n'a pas choisies.
 *
 * `racineDepuisLibelle` ne convenait pas : elle garde le tiret, parce qu'un
 * identifiant doit rester lisible. Une clé de regroupement, non.
 *
 * @param {*} valeur
 * @returns {string} Chaîne vide si rien de lisible
 */
export function cleDuTheme(valeur) {
  const propre = themeLisible(valeur);
  if (!propre) return '';

  const plie = plier(propre);

  // Le repli garde son identité à un thème fait d'emoji ou de ponctuation :
  // sans lui, « 🏖️ » et « 🎿 » se confondraient sur la clé vide.
  return plie.replace(/[^\p{L}\p{N}]/gu, '') || plie;
}

/**
 * Les thèmes que les enveloppes du foyer portent déjà
 *
 * L'ensemble des thèmes EST l'ensemble des valeurs en usage : rien n'est stocké
 * à part. Un thème sans enveloppe disparaît, ce qui est juste — il n'a plus
 * rien à regrouper.
 *
 * **Toutes les enveloppes, closes comprises.** `enveloppesOuvertes` vit deux
 * fonctions plus bas et c'est le piège : « Vacances 2026 » est close le jour
 * même où le bilan du thème se lit, et son thème disparaîtrait avec elle.
 *
 * @param {Array<Object>} enveloppes - Enveloppes normalisées
 * @returns {Array<{cle: string, label: string, nombre: number}>} Par ordre alphabétique
 */
export function themesConnus(enveloppes) {
  const parCle = new Map();

  for (const enveloppe of (Array.isArray(enveloppes) ? enveloppes : [])) {
    const label = themeLisible(enveloppe && enveloppe.theme);
    if (!label) continue;

    const cle = cleDuTheme(label);
    // Le premier qui l'a nommé le nomme : l'ordre de la liste est celui de
    // création, `fusionnerListe` ajoutant à la fin.
    if (!parCle.has(cle)) parCle.set(cle, { cle, label, nombre: 0 });
    parCle.get(cle).nombre += 1;
  }

  return [...parCle.values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true }));
}

/**
 * Le thème déjà connu qu'une saisie désigne, s'il existe
 *
 * C'est la canonicalisation : taper « vacances » quand « Vacances » existe doit
 * rejoindre le thème existant, pas en créer un jumeau.
 *
 * @param {Array<Object>} themes - Sortie de `themesConnus`
 * @param {*} valeur - Ce que le foyer a tapé
 * @returns {{cle: string, label: string, nombre: number}|null}
 */
export function themeExistant(themes, valeur) {
  const cle = cleDuTheme(valeur);
  if (!cle) return null;
  return (Array.isArray(themes) ? themes : []).find(theme => theme.cle === cle) || null;
}

/**
 * Les enveloppes d'un thème
 *
 * @param {Array<Object>} enveloppes - Enveloppes normalisées
 * @param {*} theme - Libellé ou clé du thème
 * @returns {Array<Object>}
 */
export function enveloppesDuTheme(enveloppes, theme) {
  const cle = cleDuTheme(theme);
  if (!cle) return [];
  return (Array.isArray(enveloppes) ? enveloppes : [])
    .filter(enveloppe => cleDuTheme(enveloppe && enveloppe.theme) === cle);
}

/**
 * Une fenêtre est-elle cohérente ?
 *
 * Une seule des deux bornes suffit : « à partir du 1er juillet » est une
 * intention claire. Les deux à l'envers ne l'est pas, et enfermerait
 * silencieusement l'enveloppe sur un intervalle vide.
 *
 * @param {string|null} debut
 * @param {string|null} fin
 * @returns {boolean}
 */
export function fenetreCoherente(debut, fin) {
  const d = dateLisible(debut);
  const f = dateLisible(fin);
  if (!d || !f) return true;
  return d <= f;
}

/**
 * Les enveloppes encore ouvertes
 *
 * Une enveloppe close reste consultable — les vacances de l'an dernier ont eu
 * lieu — mais n'a plus à encombrer la liste au moment de saisir une dépense.
 * Sans cette distinction, la seule façon de désencombrer serait de supprimer,
 * donc de perdre le rattachement des charges passées.
 *
 * @param {Array<Object>} enveloppes
 * @returns {Array<Object>}
 */
export function enveloppesOuvertes(enveloppes) {
  return (Array.isArray(enveloppes) ? enveloppes : []).filter(e => e && !e.cloturee);
}

/**
 * Retrouve une enveloppe par son identifiant
 *
 * @param {Array<Object>} enveloppes
 * @param {string} id
 * @returns {Object|null}
 */
export function enveloppeParId(enveloppes, id) {
  if (!id) return null;
  return (Array.isArray(enveloppes) ? enveloppes : []).find(e => e && e.id === id) || null;
}

/**
 * Les charges rattachées à une enveloppe
 *
 * Les charges supprimées sont écartées : la suppression est douce, l'entrée
 * reste en base avec `deleted: true` pour la corbeille, mais elle ne doit plus
 * peser dans un total.
 *
 * @param {Array<Object>} charges - Charges fixes et variables confondues
 * @param {string} id - Identifiant d'enveloppe
 * @returns {Array<Object>}
 */
export function chargesDeLEnveloppe(charges, id) {
  if (!id) return [];
  return (Array.isArray(charges) ? charges : [])
    .filter(charge => charge && !charge.deleted && charge.envelope === id);
}

/**
 * Somme des charges rattachées à une enveloppe
 *
 * @param {Array<Object>} charges
 * @param {string} id
 * @returns {number} Total, en euros
 */
export function totalEnveloppe(charges, id) {
  return chargesDeLEnveloppe(charges, id).reduce(
    (somme, charge) => somme + (Number.isFinite(charge.amount) ? charge.amount : 0),
    0
  );
}

/** Format d'une clé de période : AAAA-MM */
const CLE_PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Rassemble les charges d'une enveloppe sur toute sa durée
 *
 * L'écran de gestion ne comptait que le mois consulté, et le disait
 * honnêtement — « 320 € ce mois-ci ». Mais c'est l'inverse du besoin : une
 * enveloppe existe précisément pour traverser les mois, et le seul chiffre
 * qu'on lui demande — ce qu'ont coûté les vacances en tout — était le seul
 * qu'on ne pouvait pas obtenir. Son budget, comparé à un total mensuel, se
 * mesurait donc au mauvais nombre.
 *
 * Les charges supprimées sont écartées : elles ne comptent pas dans le solde,
 * elles ne doivent pas compter ici non plus.
 *
 * @param {Object} periods - Nœud `periods` complet, tel que lu en base
 * @param {string} id - Identifiant de l'enveloppe
 * @returns {Array<Object>} Charges, chacune portant sa période et son origine
 */
export function chargesDeLEnveloppeTousMois(periods, id) {
  if (!periods || typeof periods !== 'object' || !id) return [];

  const retenues = [];

  for (const [periode, contenu] of Object.entries(periods)) {
    if (!CLE_PERIODE.test(periode) || !contenu || typeof contenu !== 'object') continue;

    for (const collection of ['fixedCharges', 'variableCharges']) {
      const noeud = contenu[collection];
      if (!noeud || typeof noeud !== 'object') continue;

      for (const [cle, charge] of Object.entries(noeud)) {
        if (!charge || typeof charge !== 'object') continue;
        if (charge.deleted) continue;
        if (charge.envelope !== id) continue;

        retenues.push({
          ...charge,
          id: cle,
          periode,
          fixe: collection === 'fixedCharges'
        });
      }
    }
  }

  // Du plus récent au plus ancien : on regarde d'abord ce qu'on vient de
  // dépenser. À défaut de date, la période sert de repère.
  return retenues.sort((a, b) => {
    const cleA = a.date || `${a.periode}-00`;
    const cleB = b.date || `${b.periode}-00`;
    return cleB.localeCompare(cleA);
  });
}

/**
 * Combien de mois séparent deux clés AAAA-MM, bornes comprises
 *
 * Les clés sont comparées par leurs nombres et non par soustraction de dates :
 * une `Date` fabriquée ici introduirait un fuseau dont ce calcul n'a que faire.
 *
 * @param {string} depuis - AAAA-MM ou AAAA-MM-JJ
 * @param {string} jusqua - AAAA-MM ou AAAA-MM-JJ
 * @returns {number} Au moins 1 ; 0 si l'une des bornes est illisible
 */
export function moisEcoules(depuis, jusqua) {
  const lire = valeur => {
    if (typeof valeur !== 'string') return null;
    const trouve = valeur.match(/^(\d{4})-(0[1-9]|1[0-2])/);
    return trouve ? { annee: Number(trouve[1]), mois: Number(trouve[2]) } : null;
  };

  const a = lire(depuis);
  const b = lire(jusqua);
  if (!a || !b) return 0;

  const ecart = (b.annee - a.annee) * 12 + (b.mois - a.mois) + 1;
  return ecart > 0 ? ecart : 1;
}

/**
 * Les charges qui comptent pour l'état courant de l'enveloppe
 *
 * C'est ici que les deux natures divergent, et c'est la divergence qui donne
 * son sens à chacune :
 *
 *   cagnotte              — tout, depuis toujours. Le pot ne se vide pas au
 *                           changement de mois.
 *   mensuelle sans report — le seul mois consulté. Ce qui n'a pas été dépensé
 *                           en août ne rend pas septembre plus riche.
 *   mensuelle avec report — de son début au mois consulté. Le reliquat suit,
 *                           parce que la dépense, elle, est irrégulière.
 *
 * @param {Array<Object>} charges - Charges de l'enveloppe, portant leur `periode`
 * @param {Object} enveloppe - Enveloppe normalisée
 * @param {string} moisConsulte - Clé AAAA-MM du mois affiché
 * @returns {Array<Object>}
 */
export function chargesRetenues(charges, enveloppe, moisConsulte) {
  const liste = Array.isArray(charges) ? charges : [];
  const nature = enveloppe?.nature === NATURES.MENSUELLE ? NATURES.MENSUELLE : NATURES.CAGNOTTE;

  if (nature === NATURES.CAGNOTTE) return liste;
  if (!CLE_PERIODE.test(String(moisConsulte))) return liste;

  if (!enveloppe?.report) {
    return liste.filter(charge => charge?.periode === moisConsulte);
  }

  const depuis = premierMois(enveloppe, liste, moisConsulte);
  return liste.filter(charge =>
    typeof charge?.periode === 'string'
    && charge.periode >= depuis
    && charge.periode <= moisConsulte);
}

/**
 * Depuis quel mois une enveloppe mensuelle à report accumule
 *
 * Sa date de début si elle en déclare une — c'est la seule réponse que
 * l'utilisateur a donnée lui-même. À défaut, le mois de sa plus ancienne
 * dépense : une enveloppe qui a servi en juin existait en juin. À défaut
 * encore, le mois consulté, ce qui la ramène au cas sans report.
 *
 * La conséquence à connaître : sans date de début déclarée, rattacher après
 * coup une dépense plus ancienne recule le point de départ, donc augmente
 * l'allocation cumulée. C'est cohérent — l'enveloppe existait bien — mais cela
 * fait bouger un chiffre sans qu'on ait touché à l'allocation. Déclarer un
 * début fige ce point.
 *
 * @param {Object} enveloppe
 * @param {Array<Object>} charges
 * @param {string} moisConsulte
 * @returns {string} Clé AAAA-MM
 */
function premierMois(enveloppe, charges, moisConsulte) {
  if (typeof enveloppe?.debut === 'string' && /^\d{4}-\d{2}/.test(enveloppe.debut)) {
    return enveloppe.debut.slice(0, 7);
  }

  const periodes = charges
    .map(charge => charge?.periode)
    .filter(periode => typeof periode === 'string' && CLE_PERIODE.test(periode))
    .sort();

  return periodes[0] || moisConsulte;
}

/**
 * Ce que l'enveloppe s'est vu allouer jusqu'au mois consulté
 *
 * Une mensuelle à report a reçu son allocation autant de fois qu'il s'est
 * écoulé de mois : 200 €/mois depuis mars, consultée en août, disposent de
 * 1 200 €. Les deux autres cas n'ont qu'une allocation, celle qui est déclarée.
 *
 * @param {Object} enveloppe - Enveloppe normalisée
 * @param {Array<Object>} charges
 * @param {string} moisConsulte - Clé AAAA-MM
 * @returns {number|null} En euros, ou null si aucune allocation n'est déclarée
 */
export function allocationCumulee(enveloppe, charges, moisConsulte) {
  const budget = Number.isFinite(enveloppe?.budget) && enveloppe.budget > 0
    ? enveloppe.budget
    : null;
  if (budget === null) return null;

  if (enveloppe.nature !== NATURES.MENSUELLE || !enveloppe.report) return budget;
  if (!CLE_PERIODE.test(String(moisConsulte))) return budget;

  const depuis = premierMois(enveloppe, Array.isArray(charges) ? charges : [], moisConsulte);
  return budget * moisEcoules(depuis, moisConsulte);
}

/**
 * Ce qu'a coûté une enveloppe, et ce qu'il lui reste
 *
 * La lecture est inversée par rapport à ce qu'elle était : la jauge disait
 * combien on avait dépensé, elle dit désormais combien il reste. C'est la
 * différence entre un relevé et un budget — « 480 € dépensés » se constate,
 * « 120 € restants » se décide. `partRestante` est la grandeur à afficher,
 * et elle descend.
 *
 * @param {Array<Object>} charges - Charges de l'enveloppe, tous mois confondus
 * @param {Object} enveloppe - Enveloppe normalisée
 * @param {string} [moisConsulte] - Clé AAAA-MM du mois affiché
 * @returns {{total: number, nombre: number, mois: number, allocation: number|null,
 *   reste: number|null, partRestante: number|null, part: number|null,
 *   depasse: boolean, nature: string, report: boolean}}
 */
export function bilanEnveloppe(charges, enveloppe, moisConsulte) {
  const retenues = chargesRetenues(charges, enveloppe, moisConsulte);

  const total = retenues.reduce(
    (somme, charge) => somme + (Number.isFinite(charge.amount) ? charge.amount : 0),
    0
  );

  const mois = new Set(retenues.map(charge => charge.periode).filter(Boolean)).size;
  const allocation = allocationCumulee(enveloppe, charges, moisConsulte);

  const reste = allocation === null ? null : allocation - total;

  return {
    total,
    nombre: retenues.length,
    mois,
    allocation,
    reste,
    // Ce qu'il reste, en pourcentage de l'allocation. Bornée à [0, 100] : la
    // barre ne doit ni disparaître dans le négatif ni sortir de son cadre —
    // c'est `depasse` qui dit le dépassement, pas une géométrie impossible.
    partRestante: allocation === null
      ? null
      : Math.max(0, Math.min(100, Math.round((reste / allocation) * 100))),
    // La part consommée reste rendue : la couleur de la jauge s'y accroche, et
    // c'est elle qui dit « on approche ».
    part: allocation === null
      ? null
      : Math.min(100, Math.round((total / allocation) * 100)),
    depasse: allocation !== null && total > allocation,
    nature: enveloppe?.nature === NATURES.MENSUELLE ? NATURES.MENSUELLE : NATURES.CAGNOTTE,
    report: enveloppe?.report === true
  };
}

/**
 * Ce qu'il reste par jour jusqu'à la fin du mois
 *
 * Le nombre qui change un comportement, et le seul. « Il vous reste 180 € »
 * ne dit pas s'il faut ralentir ; « 20 € par jour pendant 9 jours » le dit.
 * Un pot d'envies vidé le 15 du mois se serait annoncé dès le 8 par ce chiffre.
 *
 * `null` plutôt que zéro quand il n'y a rien à dire : sans allocation, sur une
 * cagnotte — qui n'a pas d'échéance mensuelle — ou sur un mois révolu, la
 * division n'a pas de sens et un « 0 €/jour » se lirait comme une alerte.
 *
 * @param {Object} bilan - Sortie de `bilanEnveloppe`
 * @param {string} moisConsulte - Clé AAAA-MM
 * @param {string} aujourdhui - AAAA-MM-JJ, le jour de l'appareil
 * @returns {{parJour: number, jours: number}|null}
 */
export function resteParJour(bilan, moisConsulte, aujourdhui) {
  if (!bilan || bilan.reste === null || bilan.nature !== NATURES.MENSUELLE) return null;
  if (!CLE_PERIODE.test(String(moisConsulte))) return null;
  if (typeof aujourdhui !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(aujourdhui)) return null;

  // Le compte des jours restants vit dans `date.js` : la projection du bilan
  // l'affiche elle aussi, en toutes lettres, et deux comptages séparés — l'un
  // inclusif, l'autre non — auraient annoncé 22 et 21 le même jour sur le même
  // écran. Il ne rend rien hors du mois en cours : un mois passé n'a plus de
  // jours devant lui, un mois à venir n'a pas commencé à se dépenser.
  const jours = joursRestantsDansLeMois(moisConsulte, aujourdhui);
  if (jours === null) return null;

  return { parJour: bilan.reste / jours, jours };
}
