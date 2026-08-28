/**
 * FairSplit — Ce qui reviendra, et ce qu'il faut mettre de côté pour l'attendre
 *
 * `veille.js` regarde le mois affiché et les enveloppes que le foyer a déjà
 * créées. Ce module-ci regarde **l'historique entier** et cherche ce qui va
 * revenir sans que personne l'ait déclaré : une assurance qui tombe tous les
 * ans, un mois de décembre qui coûte plus cher que les autres, une capacité
 * d'épargne qu'on n'a jamais chiffrée.
 *
 * Il obéit aux trois mêmes règles, et une quatrième s'y ajoute :
 *
 *   1. **Aucun chiffre inventé.** Une provision annuelle vaut ce que la charge
 *      a coûté la dernière fois, jamais ce qu'elle « devrait » coûter.
 *   2. **Jamais de reproche.**
 *   3. **Rien à dire ne produit rien.**
 *   4. **Chaque détecteur porte son exigence d'historique et se tait tant
 *      qu'il ne l'a pas.** Un foyer qui utilise l'application depuis trois
 *      mois ne verra aucune détection annuelle — et c'est correct : rien ne
 *      s'est encore répété. Le détecteur s'allumera de lui-même le jour où un
 *      premier anniversaire sera visible. Aucun réglage à changer.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il ne déplace pas d'argent. L'application n'a pas de lien bancaire : « mettre
 * de côté » ne peut être qu'un conseil, ou une intention suivie dans une
 * cagnotte que le foyer alimente lui-même. Les observations portent donc une
 * `proposition` — l'enveloppe qu'il faudrait créer — et c'est l'écran qui
 * offre de la créer, en un geste explicite.
 *
 * Ce module ne fait que du calcul : aucune base, aucun DOM, aucun réseau.
 */

import { estSolo } from './perimetre.js';
import { moisRestants, provisionMensuelle } from './provisions.js';
import { resteAVivre, mediane } from './tendances.js';
import { veiller, moisSuivant, memeDateLAnProchain } from './veille.js';

/** Une clé de mois */
const CLE_MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Les deux collections de charges d'une période */
const COLLECTIONS = ['fixedCharges', 'variableCharges'];

/**
 * Écart minimal, en mois, entre deux occurrences d'une charge annuelle
 *
 * En dessous, ce n'est pas une échéance annuelle : c'est une charge mensuelle,
 * trimestrielle ou semestrielle, que la reconduction porte déjà et qu'il serait
 * absurde de provisionner.
 */
const ECART_ANNUEL_MIN = 10;

/** Et au-delà duquel la répétition n'est plus un rythme mais une coïncidence */
const ECART_ANNUEL_MAX = 14;

/**
 * Part au-delà de laquelle un mois se distingue vraiment des autres
 *
 * Un mois à 5 % au-dessus de l'ordinaire n'est pas un pic, c'est du bruit.
 * À 20 %, l'écart se voit sur un relevé.
 */
const PART_DU_PIC = 0.2;

/** Combien de mois révolus servent à mesurer la capacité d'épargne */
const PROFONDEUR_EPARGNE = 6;

/** Et combien au minimum : sous trois mois, une médiane ne veut rien dire */
const MINIMUM_EPARGNE = 3;

/** Combien de passages font d'un lieu une habitude plutôt qu'un hasard */
const PASSAGES_POUR_UNE_HABITUDE = 3;

/** Sur combien de mois se lisent les dépenses par lieu */
const FENETRE_ANNUELLE = 12;

/**
 * L'ordre d'affichage, du plus décisif au plus contemplatif
 *
 * Explicite plutôt que déduit d'une urgence : deux observations peuvent être
 * également « info » et n'avoir pas du tout la même valeur. Une échéance qui
 * approche passe avant un total annuel chez un commerçant.
 */
const RANGS = {
  'charges-disparues': 0,
  'rythme-du-budget': 1,
  'provision-a-renouveler': 2,
  'charge-annuelle': 3,
  'pic-saisonnier': 4,
  'capacite-epargne': 5,
  'depenses-par-lieu': 6
};

/**
 * Le rang d'affichage d'une observation, d'après sa famille
 * @param {Object} vue
 * @returns {number}
 */
function rangDe(vue) {
  const famille = String(vue?.cle || '').split(':')[0];
  return famille in RANGS ? RANGS[famille] : 99;
}

/**
 * Le libellé d'une charge, réduit à ce qui l'identifie d'une année sur l'autre
 * @param {Object} charge
 * @returns {string}
 */
function empreinte(charge) {
  return typeof charge?.description === 'string'
    ? charge.description.trim().toLowerCase()
    : '';
}

/**
 * Les mois de l'historique, triés, sans les clés parasites
 *
 * Le nœud `periods` a hébergé des écritures accidentelles : les suivre ferait
 * compter des mois qui n'existent pas.
 *
 * @param {Object} periods
 * @returns {Array<string>}
 */
function moisConnus(periods) {
  if (!periods || typeof periods !== 'object') return [];
  return Object.keys(periods).filter(cle => CLE_MOIS.test(cle)).sort();
}

/**
 * Toutes les charges communes d'un mois, les deux collections réunies
 *
 * Les dépenses solo sont écartées partout dans ce module : elles n'engagent pas
 * le foyer, et provisionner pour la salle de sport de l'un au nom des deux
 * serait exactement le défaut que `perimetre.js` existe pour empêcher.
 *
 * @param {Object} periode
 * @returns {Array<Object>}
 */
function chargesCommunesDuMois(periode) {
  const retenues = [];
  for (const collection of COLLECTIONS) {
    const noeud = periode && periode[collection];
    if (!noeud || typeof noeud !== 'object') continue;
    for (const charge of Object.values(noeud)) {
      if (!charge || charge.deleted || estSolo(charge)) continue;
      retenues.push(charge);
    }
  }
  return retenues;
}

/**
 * L'écart en mois entre deux clés de période
 * @param {string} depuis - AAAA-MM
 * @param {string} jusqua - AAAA-MM
 * @returns {number}
 */
function ecartEnMois(depuis, jusqua) {
  const a = depuis.match(CLE_MOIS);
  const b = jusqua.match(CLE_MOIS);
  if (!a || !b) return 0;
  return (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
}

/**
 * Les charges qui reviennent tous les ans
 *
 * Une assurance, une taxe foncière, une révision, un abonnement annuel : elles
 * tombent d'un coup, sur un mois qui n'a rien demandé. Le foyer les subit au
 * lieu de les attendre, et c'est le cas d'usage que ce module sert d'abord.
 *
 * **La détection exige DEUX occurrences.** Une charge vue une seule fois il y a
 * onze mois pourrait revenir — ou ne jamais revenir. Annoncer une échéance sur
 * cette base serait inventer un chiffre, ce que la règle 1 interdit. Le foyer
 * qui n'a pas encore un an d'historique ne verra donc rien ici, et le détecteur
 * s'allumera tout seul.
 *
 * Le montant retenu est celui de la **dernière** occurrence : une assurance
 * augmente, et provisionner sur le prix d'il y a deux ans manquerait la cible.
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` complet
 * @param {string} params.moisCourant - AAAA-MM
 * @returns {Array<Object>} Observations, une par charge annuelle repérée
 */
export function chargesAnnuelles({ periods, moisCourant }) {
  if (!CLE_MOIS.test(moisCourant || '')) return [];

  const mois = moisConnus(periods);
  if (mois.length === 0) return [];

  // Chaque libellé, et les mois où il a été vu, avec la charge la plus récente.
  const vues = new Map();
  for (const cle of mois) {
    for (const charge of chargesCommunesDuMois(periods[cle])) {
      const nom = empreinte(charge);
      if (!nom || !Number.isFinite(charge.amount) || charge.amount <= 0) continue;

      const suivi = vues.get(nom) || { mois: [], derniere: null, libelle: '' };
      if (suivi.mois[suivi.mois.length - 1] !== cle) suivi.mois.push(cle);
      suivi.derniere = charge;
      suivi.libelle = String(charge.description || '').trim();
      vues.set(nom, suivi);
    }
  }

  const observations = [];

  for (const suivi of vues.values()) {
    if (suivi.mois.length < 2) continue;

    // TOUS les écarts doivent être annuels : une charge vue en janvier, février
    // et janvier suivant est mensuelle avec des trous, pas annuelle.
    const ecarts = suivi.mois.slice(1).map((cle, i) => ecartEnMois(suivi.mois[i], cle));
    const annuelle = ecarts.every(e => e >= ECART_ANNUEL_MIN && e <= ECART_ANNUEL_MAX);
    if (!annuelle) continue;

    const dernierMois = suivi.mois[suivi.mois.length - 1];
    // Le quantième vient de la charge quand elle en porte un ; sinon le premier
    // du mois, qui est le pire cas honnête — l'échéance ne sera pas ratée.
    const dateDerniere = typeof suivi.derniere.date === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(suivi.derniere.date)
      ? suivi.derniere.date
      : `${dernierMois}-01`;

    const prochaine = memeDateLAnProchain(dateDerniere);
    if (!prochaine) continue;

    const restants = moisRestants(prochaine, moisCourant);
    // Échéance passée ou dans le mois : il n'y a plus de provision à étaler,
    // et `veille.js` suit déjà les enveloppes arrivées à terme.
    if (restants <= 1) continue;

    const montant = suivi.derniere.amount;
    const parMois = provisionMensuelle(montant, 0, restants);
    const depart = moisSuivant(moisCourant);

    observations.push({
      cle: `charge-annuelle:${suivi.mois[0]}:${empreinte(suivi.derniere)}`,
      titre: `« ${suivi.libelle} » revient chaque année`,
      montant: parMois,
      urgence: 'info',
      detail: `${parMois.toFixed(2)} € par mois pendant ${restants} mois `
        + `pour disposer de ${montant.toFixed(2)} € au ${prochaine}.`,
      fonde: `Vue ${suivi.mois.length} fois : ${suivi.mois.join(', ')}. `
        + `Montant de la dernière, ${montant.toFixed(2)} €.`,
      proposition: {
        label: suivi.libelle,
        icon: typeof suivi.derniere.categoryIcon === 'string' ? suivi.derniere.categoryIcon : '📅',
        nature: 'cagnotte',
        budget: montant,
        fin: prochaine,
        debut: depart ? `${depart}-01` : null
      }
    });
  }

  return observations;
}

/**
 * Le mois de l'année qui coûte régulièrement plus cher que les autres
 *
 * Noël, la rentrée, les vacances : ils reviennent au même moment et pèsent
 * d'un coup. À la différence d'une charge annuelle, aucune ligne ne les porte
 * — c'est le mois entier qui gonfle. On ne peut donc pas nommer une échéance,
 * seulement un surcoût, et le lisser.
 *
 * **La comparaison se fait à un mois ORDINAIRE, pas à la moyenne.** La moyenne
 * intègre le pic qu'on cherche à mesurer : décembre se comparerait à lui-même,
 * et l'écart serait mécaniquement sous-estimé. La médiane, elle, décrit le mois
 * courant du foyer — c'est le même raisonnement que `tendances.js`.
 *
 * Exige treize mois : sans cela, aucun mois de l'année n'a de point de
 * comparaison qui lui soit propre.
 *
 * @param {Object} params
 * @param {Object} params.periods
 * @param {string} params.moisCourant - AAAA-MM
 * @returns {Object|null}
 */
export function picSaisonnier({ periods, moisCourant }) {
  if (!CLE_MOIS.test(moisCourant || '')) return null;

  const mois = moisConnus(periods).filter(cle => cle < moisCourant);
  // Douze mois révolus, plus celui qu'on compare : treize.
  if (mois.length < 12) return null;

  const totaux = new Map();
  for (const cle of mois) {
    const somme = chargesCommunesDuMois(periods[cle])
      .reduce((total, charge) => total + (Number.isFinite(charge.amount) ? charge.amount : 0), 0);
    if (somme > 0) totaux.set(cle, somme);
  }
  if (totaux.size < 12) return null;

  const ordinaire = mediane([...totaux.values()]);
  if (!(ordinaire > 0)) return null;

  // Chaque mois de l'année, et ce qu'il a coûté les fois où on l'a vu.
  const parQuantieme = new Map();
  for (const [cle, somme] of totaux) {
    const quantieme = cle.slice(5, 7);
    const liste = parQuantieme.get(quantieme) || [];
    liste.push(somme);
    parQuantieme.set(quantieme, liste);
  }

  // Le prochain pic dans les douze mois à venir, le plus coûteux d'abord.
  let meilleur = null;
  for (let avance = 1; avance <= 12; avance++) {
    const cible = decalerDeMois(moisCourant, avance);
    if (!cible) continue;

    const observees = parQuantieme.get(cible.slice(5, 7));
    if (!observees || observees.length === 0) continue;

    const habituel = mediane(observees);
    const surcout = habituel - ordinaire;
    if (surcout <= 0 || surcout < ordinaire * PART_DU_PIC) continue;

    if (!meilleur || surcout > meilleur.surcout) {
      meilleur = { cible, surcout, habituel, observees: observees.length, restants: avance };
    }
  }

  if (!meilleur) return null;

  const parMois = provisionMensuelle(meilleur.surcout, 0, meilleur.restants);

  return {
    cle: `pic-saisonnier:${meilleur.cible}`,
    titre: `${nomDuMois(meilleur.cible)} coûte plus cher que les autres mois`,
    montant: parMois,
    urgence: 'info',
    detail: `${parMois.toFixed(2)} € par mois pendant ${meilleur.restants} mois `
      + `pour absorber les ${meilleur.surcout.toFixed(2)} € de surcoût.`,
    fonde: `${meilleur.habituel.toFixed(2)} € en médiane sur ${meilleur.observees} `
      + `observation${meilleur.observees > 1 ? 's' : ''}, contre ${ordinaire.toFixed(2)} € `
      + 'pour un mois ordinaire.',
    proposition: {
      label: `${nomDuMois(meilleur.cible)} ${meilleur.cible.slice(0, 4)}`,
      icon: '📈',
      nature: 'cagnotte',
      budget: meilleur.surcout,
      fin: `${meilleur.cible}-01`,
      debut: `${moisCourant}-01`
    }
  };
}

/**
 * Une période décalée de N mois
 * @param {string} periode - AAAA-MM
 * @param {number} avance
 * @returns {string|null}
 */
function decalerDeMois(periode, avance) {
  const lu = typeof periode === 'string' ? periode.match(CLE_MOIS) : null;
  if (!lu || !Number.isFinite(avance)) return null;

  const total = Number(lu[1]) * 12 + (Number(lu[2]) - 1) + avance;
  const annee = Math.floor(total / 12);
  const mois = (total % 12) + 1;
  return `${annee}-${String(mois).padStart(2, '0')}`;
}

/** Les douze mois, pour qu'une observation se lise en français */
const NOMS_DE_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

/**
 * Le nom d'un mois, sans son année
 * @param {string} periode - AAAA-MM
 * @returns {string}
 */
function nomDuMois(periode) {
  const lu = typeof periode === 'string' ? periode.match(CLE_MOIS) : null;
  return lu ? NOMS_DE_MOIS[Number(lu[2]) - 1] : '';
}

/**
 * Ce que le foyer peut mettre de côté, et ce que ses provisions lui demandent
 *
 * Sans ce chiffre, l'application pourrait proposer trois provisions dont la
 * somme dépasse ce qui reste chaque mois — des conseils justes un par un, et
 * intenables ensemble. C'est la seule observation qui regarde les autres.
 *
 * La médiane, et non la moyenne : un mois exceptionnel ne doit pas décider de
 * ce qu'on croit pouvoir épargner. Le mois courant est écarté, il est partiel.
 *
 * @param {Object} params
 * @param {Object} params.periods
 * @param {string} params.moisCourant - AAAA-MM
 * @param {number} [params.demandeMensuelle] - Somme des provisions proposées
 * @returns {Object|null}
 */
export function capaciteDEpargne({ periods, moisCourant, demandeMensuelle = 0 }) {
  if (!CLE_MOIS.test(moisCourant || '')) return null;

  const mois = moisConnus(periods)
    .filter(cle => cle < moisCourant)
    .slice(-PROFONDEUR_EPARGNE);

  if (mois.length < MINIMUM_EPARGNE) return null;

  const restes = [];
  for (const cle of mois) {
    const periode = periods[cle];
    const total = chargesCommunesDuMois(periode)
      .reduce((somme, charge) => somme + (Number.isFinite(charge.amount) ? charge.amount : 0), 0);

    const reste = resteAVivre(total, periode && periode.salaries);
    if (reste !== null) restes.push(reste);
  }

  if (restes.length < MINIMUM_EPARGNE) return null;

  const disponible = mediane(restes);
  if (!(disponible > 0)) return null;

  const demande = Number.isFinite(demandeMensuelle) && demandeMensuelle > 0 ? demandeMensuelle : 0;
  const tenable = demande <= disponible;

  return {
    cle: 'capacite-epargne',
    titre: demande > 0 && !tenable
      ? 'Les provisions proposées dépassent ce qui reste chaque mois'
      : `Vous pourriez mettre jusqu'à ${disponible.toFixed(2)} € de côté par mois`,
    montant: disponible,
    // Une somme intenable n'est pas un reproche : c'est un arbitrage à faire,
    // et le taire laisserait accepter trois provisions incompatibles.
    urgence: demande > 0 && !tenable ? 'attention' : 'info',
    detail: demande > 0
      ? `Les propositions ci-dessus demandent ${demande.toFixed(2)} € par mois.`
      : 'Une fois les charges communes payées.',
    fonde: `Médiane du reste à vivre sur ${restes.length} mois révolus : `
      + `${disponible.toFixed(2)} €.`
  };
}

/**
 * Le lieu où le foyer a le plus dépensé sur douze mois
 *
 * **Sans proposition, et à dessein.** Des courses ne se provisionnent pas :
 * elles se budgètent. Cette observation n'appelle pas à mettre de côté, elle
 * donne un ordre de grandeur qu'aucun écran ne montrait — un total annuel chez
 * un commerçant se remarque là où douze tickets passent inaperçus.
 *
 * Elle exige plusieurs passages : un lieu vu une fois est un souvenir, pas une
 * habitude, et son total n'apprend rien.
 *
 * @param {Object} params
 * @param {Object} params.periods
 * @param {string} params.moisCourant - AAAA-MM
 * @returns {Object|null}
 */
export function depensesParLieu({ periods, moisCourant }) {
  if (!CLE_MOIS.test(moisCourant || '')) return null;

  const debut = decalerDeMois(moisCourant, -(FENETRE_ANNUELLE - 1));
  if (!debut) return null;

  const mois = moisConnus(periods).filter(cle => cle >= debut && cle <= moisCourant);
  if (mois.length === 0) return null;

  const parLieu = new Map();
  for (const cle of mois) {
    for (const charge of chargesCommunesDuMois(periods[cle])) {
      const nom = typeof charge.location?.name === 'string' ? charge.location.name.trim() : '';
      if (!nom || !Number.isFinite(charge.amount) || charge.amount <= 0) continue;

      const suivi = parLieu.get(nom) || { total: 0, passages: 0 };
      suivi.total += charge.amount;
      suivi.passages += 1;
      parLieu.set(nom, suivi);
    }
  }

  let tete = null;
  for (const [nom, suivi] of parLieu) {
    if (suivi.passages < PASSAGES_POUR_UNE_HABITUDE) continue;
    if (!tete || suivi.total > tete.total) tete = { nom, ...suivi };
  }

  if (!tete) return null;

  return {
    cle: `depenses-par-lieu:${tete.nom.toLowerCase()}`,
    titre: `${tete.total.toFixed(2)} € chez ${tete.nom} sur douze mois`,
    montant: tete.total,
    urgence: 'info',
    detail: `${(tete.total / tete.passages).toFixed(2)} € par passage en moyenne.`,
    fonde: `Sur ${tete.passages} dépenses situées, entre ${mois[0]} et ${mois[mois.length - 1]}.`
  };
}

/**
 * Le libellé d'une enveloppe, réduit pour la comparaison
 * @param {*} valeur
 * @returns {string}
 */
function libelleCompare(valeur) {
  return typeof valeur === 'string' ? valeur.trim().toLowerCase() : '';
}

/**
 * Tout ce que l'application a remarqué, l'historique compris
 *
 * Réunit les observations du mois affiché (`veiller`) et celles que
 * l'historique révèle. L'ordre est explicite — voir `RANGS` — parce que deux
 * observations également « info » n'ont pas la même valeur.
 *
 * **Une proposition dont l'enveloppe existe déjà est retirée.** Sans cela, la
 * carte reparaîtrait indéfiniment après qu'on l'a acceptée : le geste n'aurait
 * servi à rien, et l'écran répéterait un conseil déjà suivi.
 *
 * @param {Object} params
 * @param {Array<{enveloppe: Object, depense: number}>} [params.enveloppes]
 * @param {Array<Object>} [params.listeEnveloppes] - Enveloppes existantes
 * @param {Object} [params.periods]
 * @param {string} params.moisCourant - AAAA-MM
 * @param {number} [params.jourDuMois]
 * @param {number} [params.joursDuMois]
 * @returns {Array<Object>} Observations, les plus décisives d'abord
 */
export function anticiper({
  enveloppes = [], listeEnveloppes = [], periods = null,
  moisCourant, jourDuMois, joursDuMois
}) {
  const vues = veiller({ enveloppes, periods, moisCourant, jourDuMois, joursDuMois });

  vues.push(...chargesAnnuelles({ periods, moisCourant }));

  const pic = picSaisonnier({ periods, moisCourant });
  if (pic) vues.push(pic);

  const lieu = depensesParLieu({ periods, moisCourant });
  if (lieu) vues.push(lieu);

  // Ce que le foyer a déjà mis en place ne se propose plus.
  const dejaLa = new Set(
    (Array.isArray(listeEnveloppes) ? listeEnveloppes : [])
      .map(enveloppe => libelleCompare(enveloppe && enveloppe.label))
      .filter(Boolean)
  );

  const retenues = vues.filter(vue =>
    !vue.proposition || !dejaLa.has(libelleCompare(vue.proposition.label)));

  // La capacité vient EN DERNIER lieu du calcul, parce qu'elle regarde ce que
  // les autres demandent — mais elle se range à sa place comme les autres.
  const demande = retenues
    .filter(vue => vue.proposition && Number.isFinite(vue.montant))
    .reduce((somme, vue) => somme + vue.montant, 0);

  const capacite = capaciteDEpargne({ periods, moisCourant, demandeMensuelle: demande });
  if (capacite) retenues.push(capacite);

  return retenues.sort((a, b) => {
    const rang = rangDe(a) - rangDe(b);
    if (rang !== 0) return rang;
    // À rang égal, le plus gros montant d'abord : c'est celui qui pèse.
    const montantA = Number.isFinite(a.montant) ? a.montant : 0;
    const montantB = Number.isFinite(b.montant) ? b.montant : 0;
    if (montantA !== montantB) return montantB - montantA;
    return String(a.cle).localeCompare(String(b.cle));
  });
}
