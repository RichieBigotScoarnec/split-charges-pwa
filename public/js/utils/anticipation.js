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

import { formatCurrency } from './format.js';
import { estSolo } from './perimetre.js';
import { moisRestants, provisionMensuelle } from './provisions.js';
import { resteAVivre, mediane, moisOrdinaire } from './tendances.js';
import { veiller, moisSuivant, memeDateLAnProchain, JOURS_AVANT_DE_JUGER } from './veille.js';

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
  'abonnements-non-declares': 5,
  'capacite-epargne': 6,
  'depenses-par-lieu': 7
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
  const parCollection = chargesCommunesParCollection(periode);
  return COLLECTIONS.flatMap(collection => parCollection[collection]);
}

/**
 * Les mêmes charges, mais chaque collection à part
 *
 * Une seule mesure a besoin de les distinguer — la projection du mois, où le
 * fixe est déjà entier et le variable seul se cumule. Rendre deux listes plutôt
 * que d'estampiller les charges d'un marqueur : l'instantané `periods` est
 * partagé par tout ce qui lit le mois, et lui poser un champ de travail le
 * ferait voyager jusqu'en base au premier appelant qui le réécrirait.
 *
 * @param {Object} periode
 * @returns {Object<string, Array<Object>>} Indexé par nom de collection
 */
function chargesCommunesParCollection(periode) {
  const retenues = {};

  for (const collection of COLLECTIONS) {
    retenues[collection] = [];
    const noeud = periode && periode[collection];
    if (!noeud || typeof noeud !== 'object') continue;
    for (const charge of Object.values(noeud)) {
      if (!charge || charge.deleted || estSolo(charge)) continue;
      retenues[collection].push(charge);
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

    // Le compte part du mois où la cagnotte S'OUVRE, pas du mois affiché.
    //
    // La carte divisait par les mois restants depuis `moisCourant` tout en
    // faisant démarrer l'enveloppe le mois SUIVANT : elle comptait donc un mois
    // de plus que l'enveloppe n'en aurait. Mesuré — carte « 400 € par mois
    // pendant 3 mois », enveloppe « 600 € sur 2 mois » pour la même échéance.
    // On ne provisionne pas dans une cagnotte qui n'existe pas encore.
    const depart = moisSuivant(moisCourant);
    const restants = moisRestants(prochaine, depart);
    // Échéance passée, ce mois-ci ou le mois prochain : il n'y a plus de
    // provision à étaler, et `veille.js` suit déjà les enveloppes à terme.
    if (restants <= 1) continue;

    const montant = suivi.derniere.amount;
    const parMois = provisionMensuelle(montant, 0, restants);

    observations.push({
      cle: `charge-annuelle:${suivi.mois[0]}:${empreinte(suivi.derniere)}`,
      titre: `« ${suivi.libelle} » revient chaque année`,
      montant: parMois,
      urgence: 'info',
      detail: `${formatCurrency(parMois)} par mois pendant ${restants} mois `
        + `pour disposer de ${formatCurrency(montant)} au ${prochaine}.`,
      fonde: `Vue ${suivi.mois.length} fois : ${suivi.mois.join(', ')}. `
        + `Montant de la dernière, ${formatCurrency(montant)}.`,
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

  // Le compte de l'ENVELOPPE, pas un second : elle s'ouvre ce mois-ci et court
  // jusqu'au pic, échéance comprise. La carte divisait par `avance` — le nombre
  // de mois qui SÉPARENT du pic — soit un de moins. Mesuré : carte « 150 € par
  // mois pendant 4 mois », enveloppe « 120 € ». Deux chiffres pour la même
  // question, et c'est l'enveloppe qu'on alimente.
  const restants = moisRestants(meilleur.cible, moisCourant);
  const parMois = provisionMensuelle(meilleur.surcout, 0, restants);

  return {
    cle: `pic-saisonnier:${meilleur.cible}`,
    titre: `${nomDuMois(meilleur.cible)} coûte plus cher que les autres mois`,
    montant: parMois,
    urgence: 'info',
    detail: `${formatCurrency(parMois)} par mois pendant ${restants} mois `
      + `pour absorber les ${formatCurrency(meilleur.surcout)} de surcoût.`,
    fonde: `${formatCurrency(meilleur.habituel)} en médiane sur ${meilleur.observees} `
      + `observation${meilleur.observees > 1 ? 's' : ''}, contre ${formatCurrency(ordinaire)} `
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
      : `Vous pourriez mettre jusqu'à ${formatCurrency(disponible)} de côté par mois`,
    montant: disponible,
    // Une somme intenable n'est pas un reproche : c'est un arbitrage à faire,
    // et le taire laisserait accepter trois provisions incompatibles.
    urgence: demande > 0 && !tenable ? 'attention' : 'info',
    detail: demande > 0
      ? `Les propositions ci-dessus demandent ${formatCurrency(demande)} par mois.`
      : 'Une fois les charges communes payées.',
    fonde: `Médiane du reste à vivre sur ${restes.length} mois révolus : `
      + `${formatCurrency(disponible)}.`
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
    titre: `${formatCurrency(tete.total)} chez ${tete.nom} sur douze mois`,
    montant: tete.total,
    urgence: 'info',
    detail: `${formatCurrency((tete.total / tete.passages))} par passage en moyenne.`,
    fonde: `Sur ${tete.passages} dépenses situées, entre ${mois[0]} et ${mois[mois.length - 1]}.`
  };
}

/**
 * Combien de mois consécutifs font un abonnement
 *
 * Deux mois de suite peuvent être une coïncidence — une même course faite deux
 * samedis. Trois, c'est un prélèvement.
 */
const MOIS_POUR_UN_ABONNEMENT = 3;

/** Écart de montant toléré d'un mois sur l'autre, en euros */
const MONTANT_STABLE = 1;

/**
 * Ce qui revient chaque mois sans être déclaré comme charge fixe
 *
 * Le panneau des charges fixes donne déjà leur total mensuel et annuel. Ce
 * détecteur cherche autre chose : les prélèvements que le foyer saisit à la
 * main tous les mois — Netflix, une salle de sport, un abonnement de transport
 * — sans les avoir déclarés récurrents. Ils échappent donc à la reconduction,
 * qu'il faut refaire à la main, et surtout à toute lecture annuelle : 9,99 €
 * ne se remarquent jamais, 119,88 € se discutent.
 *
 * **Il se tait quand il n'a rien à apprendre.** Une charge déjà déclarée fixe
 * figure dans le total du panneau : la répéter ici serait du bruit. C'est ce
 * qui empêche cette observation de devenir un décor permanent.
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` complet
 * @param {string} params.moisCourant - AAAA-MM
 * @returns {Object|null}
 */
export function abonnementsNonDeclares({ periods, moisCourant }) {
  if (!CLE_MOIS.test(moisCourant || '')) return null;

  // Les mois révolus, les plus récents d'abord — le mois courant est partiel,
  // une charge pas encore saisie y ferait croire à un abonnement interrompu.
  // Les trois mois qui précèdent IMMÉDIATEMENT, et non les trois derniers mois
  // connus. La nuance décide de tout : un foyer qui a saisi en novembre, puis
  // en mars, puis en juillet a bien trois mois d'historique, mais une charge
  // présente dans ces trois-là ne « revient » pas chaque mois — on n'en sait
  // rien pour les huit autres. Le titre de l'observation, lui, l'affirmerait.
  //
  // Un trou dans la fenêtre vaut donc silence, comme partout dans ce module.
  if (!periods || typeof periods !== 'object') return null;

  const mois = [];
  for (let rang = MOIS_POUR_UN_ABONNEMENT; rang >= 1; rang--) {
    const cle = decalerDeMois(moisCourant, -rang);
    if (!cle || !periods[cle]) return null;
    mois.push(cle);
  }

  // Chaque libellé, et ce qu'il a coûté chaque mois — en distinguant la
  // collection, parce que c'est elle qui dit s'il est déclaré récurrent.
  const suivis = new Map();

  // Le mois AFFICHÉ est parcouru lui aussi, mais pour la seule question « est-ce
  // déjà déclaré fixe ? ».
  //
  // Sans lui, suivre le conseil ne l'éteignait pas : on ajoutait « Netflix » aux
  // charges fixes du mois, et la carte revenait le mois suivant — la fenêtre ne
  // regarde que les trois mois qui précèdent, où la charge était encore
  // variable. Pire, le panneau des charges fixes affichait alors son coût
  // annuel, et l'observation le répétait : le même montant deux fois sur le
  // même écran. C'est très exactement le décor permanent que l'en-tête du
  // détecteur dit vouloir éviter.
  //
  // Il n'entre PAS dans la fenêtre de stabilité : le mois courant est partiel,
  // et une charge pas encore saisie ferait croire à un abonnement interrompu.
  for (const cle of [...mois, moisCourant]) {
    const periode = periods[cle] || {};
    const pourLeSeulDrapeau = cle === moisCourant;

    for (const collection of COLLECTIONS) {
      const noeud = periode[collection];
      if (!noeud || typeof noeud !== 'object') continue;

      for (const charge of Object.values(noeud)) {
        if (!charge || charge.deleted || estSolo(charge)) continue;
        if (!Number.isFinite(charge.amount) || charge.amount <= 0) continue;

        const nom = empreinte(charge);
        if (!nom) continue;

        if (pourLeSeulDrapeau) {
          if (collection !== 'fixedCharges') continue;
          const connu = suivis.get(nom);
          if (connu) connu.estFixe = true;
          continue;
        }

        const suivi = suivis.get(nom)
          || { libelle: '', montants: new Map(), estFixe: false, payeurs: new Set(), categories: new Set() };
        suivi.libelle = String(charge.description || '').trim();

        // Le payeur et la catégorie de chaque occurrence, pour que le geste qui
        // suit n'ait rien à inventer. On les COLLECTE ; c'est plus bas qu'on
        // décide s'ils sont exploitables.
        if (typeof charge.paidBy === 'string' && charge.paidBy) suivi.payeurs.add(charge.paidBy);
        if (typeof charge.category === 'string' && charge.category) suivi.categories.add(charge.category);
        // On ADDITIONNE les occurrences du mois, on ne garde pas la dernière.
        //
        // Un libellé répété dans le mois est le cas nominal : la saisie rapide
        // sans description reprend le nom de la catégorie, si bien que
        // « Boulangerie » ou « Courses » revient plusieurs fois. Ne garder que
        // la dernière — l'ordre des clés Firebase — faisait comparer trois
        // montants pris au hasard : 5,00, 5,30, 4,80 pour des mois qui pesaient
        // en réalité 14,70, 11,30 et 17,80 €. Le contrôle de stabilité passait,
        // et l'observation annonçait 57,60 € par an là où le foyer en dépensait
        // 529 — avec un fondement affirmant « à montant stable ».
        suivi.montants.set(cle, (suivi.montants.get(cle) || 0) + charge.amount);
        // Déclarée fixe ne serait-ce qu'une fois : le panneau la porte déjà.
        if (collection === 'fixedCharges') suivi.estFixe = true;
        suivis.set(nom, suivi);
      }
    }
  }

  const trouves = [];
  let parMois = 0;

  for (const suivi of suivis.values()) {
    if (suivi.estFixe) continue;
    // Présent à CHAQUE mois de la fenêtre : un trou, et ce n'est pas un
    // prélèvement mais une habitude irrégulière.
    if (suivi.montants.size !== mois.length) continue;

    const valeurs = [...suivi.montants.values()];
    const mini = Math.min(...valeurs);
    const maxi = Math.max(...valeurs);
    // Un montant qui varie n'est pas un abonnement, c'est une dépense
    // régulière — des courses hebdomadaires, par exemple.
    if (maxi - mini > MONTANT_STABLE) continue;

    // Le dernier montant connu : un abonnement réévalué se provisionne à son
    // nouveau prix, pas à celui d'il y a trois mois.
    const dernier = suivi.montants.get(mois[mois.length - 1]);

    // LE PAYEUR N'EST JAMAIS DEVINÉ.
    //
    // C'est la règle que l'import CSV a posée, et elle vaut ici : un
    // prélèvement avancé tantôt par l'un tantôt par l'autre n'a pas de payeur,
    // il en a deux. En choisir un — le dernier vu, le plus fréquent — ferait
    // basculer le solde du foyer sur une déduction que personne n'a validée.
    //
    // Une seule valeur sur toute la fenêtre n'est pas une déduction : c'est une
    // lecture. Sinon, `null`, et l'écran demandera.
    const payeur = suivi.payeurs.size === 1 ? [...suivi.payeurs][0] : null;
    const categorie = suivi.categories.size === 1 ? [...suivi.categories][0] : null;

    trouves.push({ libelle: suivi.libelle, montant: dernier, payeur, categorie });
    parMois += dernier;
  }

  if (trouves.length === 0) return null;

  trouves.sort((a, b) => b.montant - a.montant);
  const parAn = parMois * 12;

  return {
    cle: 'abonnements-non-declares',
    titre: trouves.length === 1
      ? 'Une charge revient chaque mois sans être déclarée fixe'
      : `${trouves.length} charges reviennent chaque mois sans être déclarées fixes`,
    montant: parMois,
    urgence: 'info',
    detail: `${formatCurrency(parMois)} par mois, soit ${formatCurrency(parAn)} sur une année : `
      + trouves.map(t => t.libelle).join(', ') + '.',
    fonde: `Vues aux ${mois.length} derniers mois révolus (${mois.join(', ')}), `
      + 'à montant stable, et absentes des charges fixes.',

    // CE QUI FAIT LA DIFFÉRENCE ENTRE UN CONSTAT ET UN GESTE.
    //
    // Ce détecteur disait « Netflix revient chaque mois sans être déclaré
    // fixe » — et laissait le foyer aller le ressaisir à la main, dans un
    // formulaire à neuf champs, une fois par abonnement. Le conseil coûtait
    // donc plus cher que de ne rien faire, et c'est ainsi qu'une application de
    // budget se fait abandonner en novembre.
    //
    // La proposition porte ce qu'il faut pour écrire, et rien de plus. Le
    // payeur et la catégorie valent `null` quand la fenêtre n'en montre pas
    // une seule : l'écran demandera plutôt que l'application ne décide.
    propositionFixe: {
      charges: trouves.map(({ libelle, montant, payeur, categorie }) => ({
        libelle, montant, payeur, categorie
      })),
      parMois,
      parAn
    }
  };
}

/**
 * À ce rythme, combien coûtera le mois ?
 *
 * `rythmeDuBudget` pose déjà cette question pour une enveloppe. Elle vaut pour
 * le mois entier, et c'est la fonction que les agrégateurs bancaires vendent
 * le plus cher — à cette différence près qu'eux la fondent sur le solde du
 * compte, que cette application ne connaît pas. Ici, la projection ne porte
 * que sur les dépenses saisies, et le `fonde` le dit.
 *
 * ## Elle rend un NOMBRE, jamais un jugement
 *
 * Cette mesure a longtemps vécu sous la forme d'une carte d'alerte, qui ne
 * paraissait qu'au-delà d'un seuil et disputait sa place à six autres
 * détecteurs. Le premier écran restait donc rétrospectif : il disait ce qui
 * avait été dépensé, jamais où le mois allait. La projection est maintenant
 * annoncée à chaque ouverture, sous le prévisionnel ; `depasse` dit seulement
 * si l'écart mérite qu'on hausse le ton, et c'est le rendu qui en décide.
 *
 * ## Le repère vient d'ailleurs, et c'est le sujet
 *
 * « Un mois ordinaire » est fabriqué par `moisOrdinaire`, dans `tendances.js`,
 * avec le panneau des tendances et le rapport mensuel. Cette fonction en
 * calculait autrefois un second, sur une fenêtre de six mois dont elle écartait
 * ceux à zéro là où les deux autres en prenaient cinq sans les écarter. Mesuré
 * sur 600 · 700 · 800 · 900 · 1 000 · 1 100 · 1 200 : **950,00 € annoncés par
 * la carte du bilan, 1 000,00 € par la modale du rapport**, à un bouton de
 * distance. Huitième occurrence du défaut `normalizePair` ; elle se referme ici
 * comme les sept précédentes, en supprimant la seconde fabrique.
 *
 * ## Ce que la projection étend, et ce qu'elle n'étend pas
 *
 * **Les charges fixes ne s'étendent pas.** La reconduction les inscrit toutes
 * dès la première ouverture du mois, chacune à son quantième — `previsionnel.js`
 * existe précisément pour dire que « au 3 du mois, le solde annonce 1 240 €
 * dont 900 ne sont pas encore sortis du compte ». Les multiplier par
 * `duree / ecoules` reviendrait à projeter douze loyers : au 5 d'un mois de 31
 * jours, 900 € de fixe deviendraient 5 580 €, et la ligne annoncerait presque
 * tous les mois un chiffre qui n'a aucun sens.
 *
 * Seules les dépenses variables se cumulent jour après jour. Elles seules sont
 * étendues ; le fixe est ajouté tel quel, une fois. Le repère, lui, reste le
 * total complet d'un mois révolu — les deux grandeurs sont donc comparables.
 *
 * ## Et seulement le mois réellement en cours
 *
 * `moisCourant` est le mois AFFICHÉ, celui du sélecteur ; `jourDuMois` vient de
 * l'horloge. Sans le rapprochement, choisir un mois clos projetait ses 31 jours
 * de dépenses sur les 28 écoulés d'aujourd'hui — une prévision sur un mois
 * terminé depuis trois mois. Un mois révolu n'a rien à projeter : il est connu.
 *
 * Deux silences de plus : les premiers jours, où une seule grosse course
 * projette un dépassement qui n'en est pas un ; et un historique trop court,
 * où « ordinaire » ne veut rien dire — c'est `moisOrdinaire` qui en juge.
 *
 * @param {Object} params
 * @param {Object} params.periods
 * @param {string} params.moisCourant - AAAA-MM, le mois affiché
 * @param {string} params.moisReel - AAAA-MM du calendrier, aujourd'hui
 * @param {number} params.jourDuMois
 * @param {number} params.joursDuMois
 * @returns {{projection: number, ordinaire: number, surcout: number, fixe: number,
 *   variable: number, ecoules: number, duree: number, joursRestants: number,
 *   moisCompares: number, depasse: boolean}|null}
 */
export function projectionDuMois({ periods, moisCourant, moisReel, jourDuMois, joursDuMois }) {
  if (!CLE_MOIS.test(moisCourant || '')) return null;
  // Projeter un mois qu'on ne vit pas n'a pas de sens : le passé est connu,
  // l'avenir est vide.
  if (moisCourant !== moisReel) return null;

  const ecoules = Number.isFinite(jourDuMois) ? jourDuMois : 0;
  const duree = Number.isFinite(joursDuMois) ? joursDuMois : 0;
  if (ecoules < JOURS_AVANT_DE_JUGER || duree <= 0 || ecoules >= duree) return null;

  const sommeDe = (charges) => charges
    .reduce((somme, charge) => somme + (Number.isFinite(charge.amount) ? charge.amount : 0), 0);

  const duMoisCourant = chargesCommunesParCollection(periods && periods[moisCourant]);
  const fixe = sommeDe(duMoisCourant.fixedCharges);
  const variable = sommeDe(duMoisCourant.variableCharges);

  const sorti = fixe + variable;
  if (!(sorti > 0)) return null;

  const habituel = moisOrdinaire({ periods, mois: moisCourant });
  if (!habituel) return null;

  const ordinaire = habituel.reference;

  // Le fixe est déjà entier ; seul le variable se projette.
  const projection = fixe + variable * (duree / ecoules);
  const surcout = projection - ordinaire;

  return {
    projection,
    ordinaire,
    surcout,
    fixe,
    variable,
    ecoules,
    duree,
    // Le jour même compte, comme pour la cadence d'une enveloppe : les deux
    // nombres sont affichés en toutes lettres, et deux comptages séparés
    // auraient dit 22 ici et 21 là le même jour. `ecoules >= duree` étant déjà
    // sorti plus haut, le minimum est 2 — « il reste 1 jour » est donc
    // inatteignable, et c'est juste : le dernier jour, il n'y a plus rien à
    // projeter.
    joursRestants: duree - ecoules + 1,
    moisCompares: habituel.moisCompares,

    // En deçà, la projection ne se distingue pas d'un mois normal — et une
    // projection au dixième de jour près n'a pas cette précision. Le seuil vit
    // ici, avec le nombre qu'il juge : une seule surface le lit, et le jour où
    // il changera, elle changera avec lui.
    depasse: surcout > 0 && surcout >= ordinaire * PART_DU_PIC
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
 * @param {string} params.moisCourant - AAAA-MM, le mois affiché
 * @param {string} [params.moisReel] - AAAA-MM du calendrier, aujourd'hui
 * @param {number} [params.jourDuMois]
 * @param {number} [params.joursDuMois]
 * @returns {Array<Object>} Observations, les plus décisives d'abord
 */
export function anticiper({
  enveloppes = [], listeEnveloppes = [], periods = null,
  moisCourant, moisReel, jourDuMois, joursDuMois
}) {
  const vues = veiller({ enveloppes, periods, moisCourant, moisReel, jourDuMois, joursDuMois });

  vues.push(...chargesAnnuelles({ periods, moisCourant }));

  const pic = picSaisonnier({ periods, moisCourant });
  if (pic) vues.push(pic);

  // La projection du mois N'EST PLUS une observation.
  //
  // Elle a vécu ici sous forme de carte d'alerte, qui ne paraissait qu'au-delà
  // d'un seuil et disputait ses trois places à six autres détecteurs. Elle est
  // désormais annoncée en permanence sous le prévisionnel, par
  // `projectionDuMois` — la même fabrique, une seule surface. L'y laisser
  // aurait mis deux fois le même montant sur le même écran, à quelques lignes
  // d'écart, l'un ambre et l'autre neutre.

  const abonnements = abonnementsNonDeclares({ periods, moisCourant });
  if (abonnements) vues.push(abonnements);

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
