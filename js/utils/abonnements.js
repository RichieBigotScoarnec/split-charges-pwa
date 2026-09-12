/**
 * FairSplit — Déclarer fixe ce qui revenait déjà chaque mois
 *
 * `anticipation.js` sait dire « Netflix et la salle de sport reviennent chaque
 * mois sans être déclarés fixes ». Le constat était juste, et sans suite : il
 * fallait ouvrir la gestion des charges fixes et ressaisir chaque ligne dans un
 * formulaire à neuf champs. Un conseil qui coûte plus cher que de ne rien faire
 * n'est pas un conseil — et c'est ainsi qu'une application de budget se fait
 * abandonner en novembre.
 *
 * Ce module décide de ce qu'il faut écrire. Il ne touche ni à la base ni au
 * DOM : c'est ce qui permet de l'éprouver, et ce qui compte ici, parce que le
 * geste est le seul de l'application qui écrive plusieurs charges d'un coup.
 *
 * ## LE PIÈGE, ET TOUT EST LÀ
 *
 * L'abonnement est peut-être DÉJÀ SAISI dans le mois affiché, en charge
 * variable — c'est même le cas nominal, puisque le détecteur ne se déclenche
 * que sur des libellés que le foyer saisit à la main tous les mois. Écrire la
 * charge fixe sans rien d'autre le compterait alors DEUX FOIS : le mois
 * gagnerait 13,49 € que personne n'a dépensés, et le solde du couple avec.
 *
 * Le plan met donc les variables de même libellé à la corbeille dans la MÊME
 * écriture, et la charge fixe reprend leur montant exact. La dépense ne change
 * pas de valeur, elle change de collection.
 *
 * La propriété se vérifie, et elle l'est :
 *
 *     total du mois APRÈS  ===  total AVANT                (déjà saisie)
 *     total du mois APRÈS  ===  total AVANT + le montant   (pas encore saisie)
 */

import { estSolo } from './perimetre.js';
import { libelleDeLaRepartition } from './repartition.js';

/** Les payeurs qu'une charge commune peut porter */
const PAYEURS = ['vous', 'conjointe', 'partage', 'both'];

/** Une clé de mois */
const CLE_MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Deux libellés désignent-ils la même charge ? */
const empreinte = (texte) => (typeof texte === 'string' ? texte.trim().toLowerCase() : '');

/**
 * Les charges communes actives d'une collection, indexées par libellé
 *
 * @param {Object} noeud - `fixedCharges` ou `variableCharges` d'une période
 * @returns {Map<string, Array<Object>>}
 */
function parLibelle(noeud) {
  const index = new Map();
  if (!noeud || typeof noeud !== 'object') return index;

  for (const [cle, charge] of Object.entries(noeud)) {
    if (!charge || charge.deleted || estSolo(charge)) continue;
    if (!Number.isFinite(charge.amount)) continue;

    const nom = empreinte(charge.description);
    if (!nom) continue;

    index.set(nom, [...(index.get(nom) || []), { ...charge, id: charge.id || cle }]);
  }
  return index;
}

/**
 * Ce qu'il faut écrire pour déclarer ces abonnements fixes
 *
 * ## Ce qui est retenu, et ce qui est écarté
 *
 * Une charge dont la fenêtre ne montre pas UN SEUL payeur est écartée, et
 * nommée. C'est la règle que l'import CSV a posée — **le payeur n'est jamais
 * deviné** — et elle vaut d'autant plus ici que ce geste écrit sans montrer de
 * formulaire : un prélèvement avancé tantôt par l'un tantôt par l'autre n'a pas
 * de payeur, il en a deux, et en choisir un ferait basculer le solde sur une
 * déduction que personne n'a validée.
 *
 * Une charge déjà présente parmi les charges FIXES du mois est écartée aussi :
 * le panneau la porte déjà, l'écrire une seconde fois la doublerait.
 *
 * @param {Object} params
 * @param {Array<Object>} params.charges - `propositionFixe.charges` de l'observation
 * @param {Object} params.periode - Nœud de la période affichée, tel qu'il est en base
 * @param {string} params.mois - AAAA-MM affiché
 * @param {number} params.instant - `Date.now()` de l'appelant : ce module ne lit pas l'horloge
 * @returns {{aEcrire: Array<Object>, aRetirer: Array<Object>, ecartees: Array<Object>, total: number}}
 */
export function planDeclarationFixe({ charges, periode, mois, instant }) {
  const vide = { aEcrire: [], aRetirer: [], ecartees: [], total: 0 };

  if (!Array.isArray(charges) || charges.length === 0) return vide;
  if (!CLE_MOIS.test(mois || '')) return vide;
  if (!Number.isFinite(instant) || instant <= 0) return vide;

  const noeud = periode && typeof periode === 'object' ? periode : {};
  const fixes = parLibelle(noeud.fixedCharges);
  const variables = parLibelle(noeud.variableCharges);

  const aEcrire = [];
  const aRetirer = [];
  const ecartees = [];
  let total = 0;

  for (const proposee of charges) {
    const libelle = typeof proposee?.libelle === 'string' ? proposee.libelle.trim() : '';
    const nom = empreinte(libelle);
    if (!libelle) continue;

    if (fixes.has(nom)) {
      ecartees.push({ libelle, motif: 'déjà déclarée fixe ce mois-ci' });
      continue;
    }

    if (!PAYEURS.includes(proposee?.payeur)) {
      ecartees.push({ libelle, motif: 'payeur variable d\'un mois sur l\'autre' });
      continue;
    }

    // Les occurrences DÉJÀ SAISIES ce mois-ci, s'il y en a. Leur somme fait le
    // montant de la charge fixe : c'est ce qui garde le total du mois intact.
    const dejaLa = variables.get(nom) || [];
    const montant = dejaLa.length > 0
      ? dejaLa.reduce((somme, charge) => somme + charge.amount, 0)
      : Number(proposee?.montant);

    if (!Number.isFinite(montant) || montant <= 0) {
      ecartees.push({ libelle, motif: 'montant inexploitable' });
      continue;
    }

    // La date et l'enveloppe de ce qui existe déjà sont conservées : la charge
    // change de collection, elle ne se réinvente pas. `previsionnel.js` lit
    // cette date pour dire ce qui reste à passer.
    const source = dejaLa[0] || null;

    aEcrire.push({
      description: libelle,
      amount: Math.round(montant * 100) / 100,
      category: typeof proposee?.categorie === 'string' && proposee.categorie
        ? proposee.categorie
        : (source?.category || 'Autre'),
      paidBy: proposee.payeur,
      perimetre: 'commun',
      destination: source?.destination || '',
      envelope: source?.envelope || '',
      date: source?.date || `${mois}-01`,
      // C'est tout l'objet du geste : la reconduction la portera désormais.
      recurring: true,
      splitOverride: source?.splitOverride || null,
      timestamp: instant,
      deleted: false
    });

    for (const charge of dejaLa) aRetirer.push({ id: charge.id, description: charge.description });
    total += montant;
  }

  return { aEcrire, aRetirer, ecartees, total: Math.round(total * 100) / 100 };
}

/**
 * La phrase qui demande confirmation
 *
 * Elle nomme ce qui sera créé ET ce que ça engage, comme celle de la cagnotte :
 * « mettre en charge fixe » n'a de sens que si l'on sait laquelle, pour combien,
 * et que ça reviendra tous les mois sans qu'on le redemande.
 *
 * ## Et la répartition héritée, parce qu'on ne l'a pas choisie pour ça
 *
 * `planDeclarationFixe` reprend le `splitOverride` de la saisie source (`:150`),
 * et c'est la bonne règle — la charge change de collection, elle ne se réinvente
 * pas. Mais l'utilisateur avait choisi ce 70/30 pour UNE dépense ponctuelle ; le
 * reconduire tous les mois est une autre décision, et elle se prenait ici sans
 * qu'un mot la nomme. Le défaut n'était pas l'héritage : c'était qu'il soit
 * invisible au moment de l'accepter.
 *
 * **La source est `dejaLa[0]`** — la première occurrence saisie du mois, pas la
 * plus récente ni la répartition dominante. Raison de plus pour la dire.
 *
 * ## Pourquoi « la saisie qu'elle remplace » et pas sa date
 *
 * La date est disponible (`aEcrire[i].date`), et elle n'est pas toujours celle
 * de la source : les règles acceptent `date: ""` et n'exigent que `amount`
 * (`database.rules.json:323`), auquel cas `:147` retombe sur le premier du mois.
 * Mesuré. Nommer une date fabriquée dans le dialogue même qui demande un
 * consentement affirmerait ce que la donnée ne dit pas.
 *
 * « La saisie qu'elle remplace » tient par invariant : un `splitOverride` non
 * nul implique une source, donc une occurrence dans `aRetirer` — la phrase du
 * déplacement est toujours là, juste au-dessus, et sert de référent.
 *
 * @param {{aEcrire: Array<Object>, aRetirer: Array<Object>, total: number}} plan
 * @param {(montant: number) => string} formatMontant - `formatCurrency`, injecté
 * @returns {string}
 */
export function questionDeConfirmation(plan, formatMontant) {
  const noms = plan.aEcrire.map(charge => `« ${charge.description} »`).join(', ');
  const combien = plan.aEcrire.length === 1
    ? `Déclarer ${noms} en charge fixe ?`
    : `Déclarer ${plan.aEcrire.length} charges fixes : ${noms} ?`;

  const engage = `\n\n${formatMontant(plan.total)} par mois, reconduits automatiquement.`;

  // Le déplacement se dit : sans cela, voir une charge quitter la liste des
  // variables ressemblerait à une suppression.
  //
  // L'article et le verbe sont DANS le ternaire : ils en étaient sortis, et le
  // cas à une saisie — le nominal, puisque le détecteur ne se déclenche que sur
  // des libellés saisis une fois par mois — rendait « Les saisie … passent ».
  const deplace = plan.aRetirer.length > 0
    ? (plan.aRetirer.length === 1
      ? '\n\nLa saisie de ce mois passe'
      : `\n\nLes ${plan.aRetirer.length} saisies de ce mois passent`)
      + ' en charges fixes : le total du mois ne change pas.'
    : '';

  // Le prédicat est celui des quatre autres surfaces, par la même fabrique :
  // un libellé non vide. `prorata` n'en produit aucun et ne s'écarte de rien.
  const derogations = plan.aEcrire
    .map(charge => ({ nom: charge.description, libelle: libelleDeLaRepartition(charge.splitOverride) }))
    .filter(derogation => derogation.libelle);

  let reparti = '';
  if (derogations.length === 1 && plan.aEcrire.length === 1) {
    // La charge vient d'être nommée à la première ligne : la renommer ici
    // n'ajouterait rien.
    reparti = `\n\nRépartition ${derogations[0].libelle}, reprise de la saisie qu'elle remplace.`;
  } else if (derogations.length > 0) {
    const detail = derogations.map(d => `« ${d.nom} » en ${d.libelle}`).join(', ');
    reparti = derogations.length === 1
      ? `\n\nRépartition reprise de la saisie qu'elle remplace : ${detail}.`
      : `\n\nRépartitions reprises des saisies qu'elles remplacent : ${detail}.`;
  }

  // La répartition en dernier : c'est le bloc le plus proche des boutons, et
  // « la saisie qu'elle remplace » a besoin que le déplacement soit déjà dit.
  return combien + engage + deplace + reparti;
}
