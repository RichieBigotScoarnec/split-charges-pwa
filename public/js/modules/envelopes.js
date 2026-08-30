// ===== MODULE : ENVELOPPES TRANSVERSALES =====
//
// Une enveloppe regroupe des dépenses qui vont ensemble sans partager de
// catégorie ni de mois : une semaine de vacances, un déménagement, un chantier.
// Le plein d'essence de la route des vacances reste rangé dans « Essence » ;
// l'enveloppe le rattache en plus au voyage.
//
// L'enveloppe ne touche jamais au solde. Elle n'est ni un payeur, ni une
// répartition : rien de ce que fait ce module n'entre dans `computeSummary`.
// C'est une étiquette de lecture, et le test `tests/utils/enveloppes.test.js`
// le vérifie en repassant les mêmes charges dans le calcul, avec et sans.

import { getState, setState } from '../state.js';
import { toast } from '../components/toast.js';
import { escapeHtml, formatCurrency } from '../utils/format.js';
import { log, error as logError } from '../utils/debug.js';
import { identifiantEnveloppe } from '../utils/identifiant.js';
import { emojisProposes, fusionnerListe } from './custom-lists.js';
import { formatDate, dateDuJour } from '../utils/date.js';
import { normaliserEmplacement, memberLabel } from '../utils/members.js';
import {
  normaliserVersements,
  versementsActifs,
  estAlimentee,
  bilanCagnotte,
  acquisSurObjectif,
  versementEcrivable
} from '../utils/versements.js';
import { etatProvision } from '../utils/provisions.js';
import {
  normaliserEnveloppe,
  normaliserEnveloppes,
  chargesDeLEnveloppeTousMois,
  bilanEnveloppe,
  resteParJour,
  NATURES,
  RANGS,
  enveloppesOuvertes,
  enveloppeParId,
  budgetLisible,
  dateLisible,
  fenetreCoherente,
  totalEnveloppe
} from '../utils/enveloppes.js';

/** Nœud Firebase, sous la racine de l'espace de données */
const CHEMIN = 'envelopes';

/**
 * Nœud des versements, à part de la liste des enveloppes
 *
 * Séparé à dessein : `envelopes` est relu à chaque ouverture de l'application,
 * les versements seulement quand on ouvre le détail d'un pot. Les imbriquer
 * ferait payer à tout le monde, à chaque démarrage, une donnée que presque
 * personne ne regarde.
 */
const CHEMIN_VERSEMENTS = 'versements';

/**
 * Initialise le module des enveloppes
 * @returns {Promise<void>}
 */
export async function initEnvelopes() {
  log('📦 Initialisation module enveloppes');
  window.creerEnveloppeProposee = creerEnveloppeProposee;
  await loadEnvelopes();
  log('✅ Module enveloppes initialisé');
}

/**
 * Qui crée cette enveloppe, et quand
 *
 * Un versement porte un auteur nominatif depuis toujours ; une enveloppe n'en
 * gardait aucun — alors que l'application propose d'en créer une d'un seul
 * geste, depuis une carte qui paraît d'elle-même en tête du bilan. Le foyer a
 * découvert « Vacances 2027 » sans savoir d'où elle sortait, et l'application
 * n'avait rien à répondre : la question n'avait pas de réponse possible.
 *
 * Même fabrique que l'auteur d'un versement : l'emplacement du compte qui tient
 * l'appareil, jamais « vous » en dur — sur le second téléphone, chaque création
 * serait attribuée à l'autre.
 *
 * @returns {{creePar: string, creeLe: number}}
 */
function provenance() {
  return { creePar: auteurParDefaut(), creeLe: Date.now() };
}

/**
 * La forme d'une enveloppe neuve, par la SEULE fabrique qui la connaisse
 *
 * `fusionnerListe` écrit le tableau ENTIER par une transaction. Un champ de
 * plus sur une seule enveloppe — une couleur, une note, un `archive` — tombe
 * donc dans le `$autre: {".validate": false}` des règles, et le serveur refuse
 * l'écriture COMPLÈTE : toutes les enveloppes du foyer, pas seulement la neuve.
 * Le toast dirait « créée », et rien ne serait enregistré.
 *
 * Les deux chemins de création écrivaient chacun leur littéral, tenus à la main
 * en parallèle des règles et l'un de l'autre. Ils passent maintenant par
 * `normaliserEnveloppe`, qui est déjà la fabrique de tout ce que l'application
 * relit : ce qu'elle ne connaît pas n'est pas écrit, et
 * `tests/enveloppe-champs-declares.test.js` compare ses clés à celles que les
 * règles déclarent, dans les deux sens.
 *
 * @param {Object} brouillon - Champs voulus, tels que l'écran les a lus
 * @returns {Object|null} Enveloppe prête à écrire, ou `null` si inexploitable
 */
export function enveloppeNeuve(brouillon) {
  return normaliserEnveloppe({ ...brouillon, ...provenance() });
}

/**
 * Crée la cagnotte qu'une observation propose
 *
 * `anticipation.js` sait dire « cette assurance revient chaque année, mettez
 * 64 € de côté par mois ». Sans ce geste, il fallait lire le montant, ouvrir la
 * gestion des enveloppes et tout ressaisir — l'observation restait un constat.
 *
 * **Le bouton ne porte que la CLÉ de l'observation.** Les libellés viennent des
 * charges saisies par le foyer : faire transiter la proposition entière par un
 * attribut du DOM en ferait une surface d'injection, et rien ne garantirait que
 * ce qu'on écrit est bien ce que l'application a calculé. La proposition est
 * relue dans l'état, là où le calcul l'a laissée.
 *
 * L'application ne déplace pas d'argent : elle ouvre la cagnotte, le foyer
 * l'alimente par des versements. C'est dit à l'écran, dans le message.
 *
 * @param {string} cle - Clé de l'observation
 * @returns {Promise<boolean>} Vrai si l'enveloppe a été créée
 */
export async function creerEnveloppeProposee(cle) {
  const vue = (getState('observations') || []).find(v => v && v.cle === cle);
  if (!vue || !vue.proposition) {
    toast.error('Cette proposition n\'est plus à l\'écran');
    return false;
  }

  const { label, icon, nature, budget, fin, debut } = vue.proposition;

  const libelle = typeof label === 'string' ? label.trim() : '';
  // Les règles plafonnent le libellé à 100 caractères ; un refus après un toast
  // de succès serait pire que ce refus-ci, qui s'explique.
  if (!libelle || libelle.length > 100) {
    toast.error('Le nom de cette proposition ne peut pas être enregistré');
    return false;
  }

  // Le montant est arrondi au centime : un flottant à quinze décimales
  // s'écrirait tel quel et se relirait tel quel.
  const objectif = Number.isFinite(budget) ? Math.round(budget * 100) / 100 : 0;
  if (!(objectif > 0)) {
    toast.error('Cette proposition n\'a pas de montant à mettre de côté');
    return false;
  }

  const existantes = getEnveloppes();
  // `anticiper` écarte déjà les propositions déjà en place. Ce contrôle-ci vaut
  // pour la seconde entre l'affichage et le clic — et pour l'autre téléphone.
  if (existantes.some(e => e.label.toLowerCase() === libelle.toLowerCase())) {
    toast.info(`« ${libelle} » existe déjà`);
    return false;
  }

  // ON DEMANDE AVANT D'ÉCRIRE.
  //
  // Ce bouton vit dans une carte qui paraît d'elle-même, en tête du bilan,
  // au-dessus de tout ce qu'on vient y chercher. Il écrivait sans rien
  // demander, là où supprimer une charge fait confirmer — et une frappe
  // involontaire devenait indiscernable d'une décision. Le foyer a trouvé une
  // enveloppe qu'il ne se souvenait pas d'avoir créée.
  //
  // La question nomme ce qui sera créé ET ce que ça engage : « mettre de côté »
  // n'a de sens que si l'on sait combien, et jusqu'à quand.
  // Le montant est REPRIS de la carte, jamais recalculé : c'est le chiffre que
  // le foyer vient de lire, et le refaire ici en donnerait un second.
  const parMois = Number.isFinite(vue.montant) && vue.montant > 0 ? vue.montant : null;

  const { showConfirmModal } = await import('../components/modal.js');
  const accepte = await showConfirmModal(
    `Créer la cagnotte « ${libelle} » ?`
    + (parMois ? `\n\n${formatCurrency(parMois)} par mois à mettre de côté.` : '')
  );
  if (!accepte) return false;

  const enveloppe = enveloppeNeuve({
    id: identifiantEnveloppe(libelle, existantes),
    label: libelle,
    icon: typeof icon === 'string' && icon ? icon.slice(0, 20) : '🎯',
    budget: objectif,
    debut: typeof debut === 'string' ? debut : null,
    fin: typeof fin === 'string' ? fin : null,
    cloturee: false,
    nature: nature === NATURES.MENSUELLE ? NATURES.MENSUELLE : NATURES.CAGNOTTE,
    // Une cagnotte reporte par nature : le champ n'a de sens que sur une
    // mensuelle, et deux façons de dire la même chose finissent par diverger.
    report: false,
    rang: RANGS.PROVISION,
    perimetre: 'commun',
    proprietaire: null
  });

  if (!enveloppe) {
    toast.error('Cette proposition ne peut pas être enregistrée');
    return false;
  }

  if (!await enregistrer([...existantes, enveloppe], existantes)) return false;

  populateAllEnvelopeSelects();

  // Le solde ne bouge pas — une enveloppe ne pèse jamais dessus — mais la
  // carte qui vient d'être acceptée doit disparaître de la veille.
  //
  // L'historique est relu et REPASSÉ : `calculateSummary()` sans lui fait taire
  // toute la veille, et l'écran perdrait les autres observations au lieu de la
  // seule qu'on vient de traiter. Une lecture pour un geste rare et délibéré.
  try {
    const { dbGet } = await import('../db.js');
    const { calculateSummary } = await import('./summary.js');
    calculateSummary({ historique: await dbGet('periods') });
  } catch (erreur) {
    // L'enveloppe est créée : l'écran en retard vaut mieux qu'un échec annoncé.
    logError('❌ Rafraîchissement du bilan impossible :', erreur);
  }

  // La création fait disparaître la carte : c'est le seul moment où le foyer
  // voit le montant quitter l'écran, donc le moment de dire ce qu'il devient.
  toast.success(`« ${libelle} » créée`
    + (parMois ? ` — ${formatCurrency(parMois)} par mois à mettre de côté` : ''));
  return true;
}

/**
 * Charge la liste depuis Firebase
 *
 * L'absence d'enveloppe est le cas normal — c'est même l'état de départ du
 * foyer. Contrairement aux catégories, il n'y a donc aucune liste par défaut à
 * recopier : une enveloppe qu'on n'a pas créée n'a pas de sens.
 *
 * @returns {Promise<void>}
 */
export async function loadEnvelopes() {
  try {
    const { dbGet } = await import('../db.js');
    setState('envelopes', normaliserEnveloppes(await dbGet(CHEMIN)));
    log(`📊 ${getEnveloppes().length} enveloppe(s) chargée(s)`);
  } catch (error) {
    logError('❌ Erreur chargement enveloppes :', error);
    // Une lecture qui échoue ne doit pas laisser l'état précédent en place :
    // il appartiendrait éventuellement à un autre compte.
    setState('envelopes', []);
  }
}

/**
 * @returns {Array<Object>} Enveloppes du foyer, closes comprises
 */
export function getEnveloppes() {
  return getState('envelopes') || [];
}

/**
 * Étiquette d'une enveloppe, prête à être insérée dans une liste de charges
 *
 * Rend une chaîne vide quand la charge ne porte pas d'enveloppe, ou quand
 * l'enveloppe désignée n'existe plus : une charge rattachée à une enveloppe
 * supprimée ne doit pas afficher un identifiant technique.
 *
 * @param {Object} charge - Charge fixe ou variable
 * @returns {string} Fragment HTML échappé, ou chaîne vide
 */
export function etiquetteEnveloppe(charge) {
  const enveloppe = enveloppeParId(getEnveloppes(), charge && charge.envelope);
  if (!enveloppe) return '';
  return `<span class="charge-enveloppe">${escapeHtml(enveloppe.icon)} ${escapeHtml(enveloppe.label)}</span>`;
}

/**
 * Écrit la liste, en préservant ce que l'autre téléphone a pu y ajouter
 *
 * @param {Array<Object>} voulue - Liste telle que cette session la veut
 * @param {Array<Object>} base - Liste d'avant la modification locale
 * @returns {Promise<boolean>} Vrai si l'écriture a abouti
 */
async function enregistrer(voulue, base) {
  try {
    setState('envelopes', normaliserEnveloppes(await fusionnerListe(CHEMIN, voulue, base)));
    return true;
  } catch (error) {
    logError('❌ Erreur sauvegarde enveloppes :', error);
    toast.error('Erreur de sauvegarde');
    return false;
  }
}

// ===== LISTES DÉROULANTES =====

/**
 * Peuple un `<select>` d'enveloppes
 *
 * Seules les enveloppes ouvertes sont proposées, plus celle que la charge porte
 * déjà : rouvrir une charge de l'été dernier ne doit pas silencieusement effacer
 * son rattachement sous prétexte que l'enveloppe a été close depuis.
 *
 * @param {string} selectId - Identifiant du select
 * @param {string} [valeurActuelle] - Enveloppe déjà portée par la charge
 * @returns {void}
 */
export function populateEnvelopeSelect(selectId, valeurActuelle = '') {
  const select = document.getElementById(selectId);
  if (!select) return;

  const toutes = getEnveloppes();
  const proposees = enveloppesOuvertes(toutes);

  const portee = enveloppeParId(toutes, valeurActuelle);
  if (portee && !proposees.some(e => e.id === portee.id)) proposees.push(portee);

  select.innerHTML = '';

  const aucune = document.createElement('option');
  aucune.value = '';
  aucune.textContent = '-- Aucune --';
  select.appendChild(aucune);

  proposees.forEach(enveloppe => {
    const option = document.createElement('option');
    option.value = enveloppe.id;
    option.textContent = `${enveloppe.icon} ${enveloppe.label}`;
    select.appendChild(option);
  });

  // Une valeur absente de la liste laisserait le select sur « Aucune » sans
  // rien dire ; elle vient d'être ajoutée juste au-dessus, donc elle y est.
  select.value = valeurActuelle || '';
}

/** Peuple les deux selects d'enveloppe des formulaires de charge */
export function populateAllEnvelopeSelects() {
  populateEnvelopeSelect('variableChargeEnvelope');
  populateEnvelopeSelect('fixedChargeEnvelope');
}

// ===== ÉCRAN DE GESTION =====

/**
 * Rang de l'enveloppe en cours d'édition, ou null
 *
 * Une seule à la fois : deux formulaires ouverts laisseraient croire qu'un seul
 * « Enregistrer » vaut pour les deux.
 */
let _enEdition = null;

/**
 * Charges du mois consulté, fixes et variables confondues
 *
 * Le total affiché à côté de chaque enveloppe ne porte donc que sur ce mois-ci,
 * et l'écran le dit. Une enveloppe traverse les mois : annoncer « 320 € » sans
 * préciser lesquels serait faux pour toutes celles qui durent plus longtemps.
 * Le total complet, tous mois confondus, viendra avec la vue dédiée.
 *
 * @returns {Array<Object>}
 */
function chargesDuMois() {
  // La période est estampillée ici, et ce n'est pas décoratif : `chargesRetenues`
  // cadre une enveloppe mensuelle sur `charge.periode`, que l'état ne porte pas
  // — les charges y sont déjà celles du mois courant, la clé est implicite.
  // Passées telles quelles au bilan, elles seraient toutes écartées et une
  // enveloppe mensuelle afficherait zéro dépense un mois où elle en a. Le piège
  // n'attend que le prochain appelant ; il est refermé à la source.
  const periode = getState('currentPeriod');
  return [
    ...(getState('fixedCharges') || []),
    ...(getState('variableCharges') || [])
  ].map(charge => (charge && charge.periode ? charge : { ...charge, periode }));
}

/**
 * L'ordre des rangs, et ce qu'il raconte
 *
 * Ce n'est pas alphabétique : c'est l'ordre dans lequel l'argent quitte le
 * compte le jour de paie. Les charges fixes partent sans décision, les
 * provisions au douzième ensuite, l'épargne avant les enveloppes mensuelles —
 * et ce qui reste après devient le budget du mois. Une épargne alimentée par le
 * reliquat n'est pas une épargne, c'est un hasard heureux, et une liste rangée
 * dans cet ordre le rappelle à chaque ouverture.
 *
 * « À classer » ferme la marche plutôt que d'être caché : une enveloppe sans
 * rang est un choix qui reste à faire, et l'escamoter reviendrait à décider à
 * la place de quelqu'un.
 */
const ORDRE_DES_RANGS = [
  { cle: RANGS.FIXE, titre: 'Fixe', aide: 'montant connu, date connue' },
  { cle: RANGS.PROVISION, titre: 'Provisions', aide: 's\'accumulent vers une date connue' },
  { cle: RANGS.EPARGNE, titre: 'Épargne & projets', aide: 's\'accumulent sans date' },
  { cle: RANGS.MENSUEL, titre: 'Mensuel', aide: 'se rechargent le 1er' },
  { cle: RANGS.RESERVE, titre: 'Réserve', aide: 'pour l\'imprévu' },
  { cle: null, titre: 'À classer', aide: 'sans rang déclaré' }
];

/**
 * Range les enveloppes par rang, en gardant leur position d'origine
 *
 * L'index passé aux boutons doit rester celui de la liste réelle : c'est lui
 * qui désigne l'enveloppe à éditer ou à supprimer. Grouper à l'affichage sans
 * le conserver ferait supprimer la mauvaise.
 *
 * @param {Array<Object>} enveloppes
 * @param {Array<Object>} charges
 * @returns {string} Fragment échappé
 */
function grouperParRang(enveloppes, charges) {
  const avecRang = enveloppes.map((enveloppe, index) => ({ enveloppe, index }));

  return ORDRE_DES_RANGS.map(({ cle, titre, aide }) => {
    const dedans = avecRang.filter(({ enveloppe }) => (enveloppe.rang || null) === cle);
    if (dedans.length === 0) return '';

    const corps = dedans.map(({ enveloppe, index }) => (
      index === _enEdition
        ? formulaireEdition(enveloppe, index)
        : ligneEnveloppe(enveloppe, index, charges)
    )).join('');

    return `
      <div class="envelope-rang">
        <h3 class="envelope-rang-titre">
          ${escapeHtml(titre)}
          <small class="envelope-rang-aide">${escapeHtml(aide)}</small>
        </h3>
        ${corps}
      </div>
    `;
  }).join('');
}

/**
 * Affiche l'écran de gestion des enveloppes
 * @returns {void}
 */
function showManageEnvelopesModal() {
  const enveloppes = getEnveloppes();
  const charges = chargesDuMois();

  let modal = document.getElementById('modalManageEnvelopes');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalManageEnvelopes';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'manageEnvelopesTitle');
    document.body.appendChild(modal);
  }

  const lignes = enveloppes.length === 0
    ? '<p class="empty-state">Aucune enveloppe. Créez-en une pour regrouper des dépenses qui vont ensemble — des vacances, un déménagement.</p>'
    : grouperParRang(enveloppes, charges);

  modal.innerHTML = `
    <div class="modal manage-lists-modal">
      <h2 class="modal-header" id="manageEnvelopesTitle">Gérer les enveloppes</h2>
      <div class="manage-lists-content">
        <p class="manage-lists-aide">
          Une enveloppe regroupe des dépenses par-delà les catégories et les mois.
          Elle ne change ni les montants ni le solde : c'est une étiquette de lecture.
        </p>

        <div id="manageEnvelopeItems" class="manage-list-items">${lignes}</div>

        <!--
          Le bouton vient après tous les champs qu'il envoie.

          Il était placé juste après le nom, avant le budget et les deux dates :
          qui remplissait le nom et appuyait sur « Ajouter » — le geste que la
          disposition appelle — perdait les trois champs suivants sans rien voir.
        -->
        <div class="manage-list-add">
          <div class="manage-add-row">
            <button type="button" id="envelopeEmojiBtn" class="manage-emoji-btn" title="Choisir une image">🧳</button>
            <label class="sr-only" for="envelopeNewLabel">Nom de l'enveloppe</label>
            <input type="text" id="envelopeNewLabel" placeholder="Ex : Vacances été" maxlength="30" />
          </div>
          <div id="envelopeEmojiPicker" class="manage-emoji-picker" style="display:none;">
            ${emojisProposes().map(emoji => `
              <button type="button" class="emoji-pick" data-emoji="${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>
            `).join('')}
          </div>
          <div class="envelope-add-details">
            <div class="envelope-field">
              <label for="envelopeNewNature">Nature</label>
              <select id="envelopeNewNature">
                <option value="cagnotte">Cagnotte — s'accumule</option>
                <option value="mensuelle">Mensuelle — se recharge le 1er</option>
              </select>
            </div>
            <div class="envelope-field">
              <label for="envelopeNewRang">Rang</label>
              <select id="envelopeNewRang">
                <option value="">— à classer —</option>
                <option value="fixe">Fixe</option>
                <option value="mensuel">Mensuel</option>
                <option value="provision">Provision</option>
                <option value="epargne">Épargne</option>
                <option value="reserve">Réserve</option>
              </select>
            </div>
            <div class="envelope-field">
              <label for="envelopeNewBudget" id="envelopeNewBudgetLabel">Objectif (€, facultatif)</label>
              <input type="text" id="envelopeNewBudget" placeholder="Ex : 1200" inputmode="decimal" maxlength="10" />
            </div>
            <div class="envelope-field envelope-field--report" id="envelopeNewReportChamp" hidden>
              <label for="envelopeNewReport">Reporter le non-dépensé</label>
              <select id="envelopeNewReport">
                <option value="non">Non — repart à plein chaque mois</option>
                <option value="oui">Oui — le reliquat s'ajoute</option>
              </select>
            </div>
            <div class="envelope-field">
              <label for="envelopeNewPerimetre">Pour qui</label>
              <select id="envelopeNewPerimetre">
                <option value="commun">Le foyer</option>
                <option value="vous">Moi seul</option>
                <option value="conjointe">Ma conjointe seule</option>
              </select>
            </div>
            <div class="envelope-field">
              <label for="envelopeNewDebut">Du (facultatif)</label>
              <input type="date" id="envelopeNewDebut" />
            </div>
            <div class="envelope-field">
              <label for="envelopeNewFin">Au (facultatif)</label>
              <input type="date" id="envelopeNewFin" />
            </div>
          </div>
          <button type="button" id="envelopeAddBtn" class="btn btn-primary">Ajouter l'enveloppe</button>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="envelopeManageClose">Fermer</button>
      </div>
    </div>
  `;

  brancherEcran(modal);

  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('active'));
}

/**
 * Le formulaire d'édition d'une enveloppe, à la place de sa ligne
 *
 * Une enveloppe se créait, se clôturait, se rouvrait et se supprimait — jamais
 * elle ne se modifiait. Une faute de frappe dans « Vacanes été » ne se réparait
 * donc qu'en supprimant, ce qui détachait toutes les charges rattachées.
 *
 * Contrairement aux catégories, rien n'a besoin d'être reporté : une charge
 * renvoie à son enveloppe par identifiant, que le renommage ne touche pas.
 *
 * @param {Object} enveloppe
 * @param {number} index
 * @returns {string} Fragment HTML échappé
 */
function formulaireEdition(enveloppe, index) {
  return `
    <div class="manage-list-item manage-list-item--edition envelope-edition" data-index="${index}">
      <div class="manage-add-row">
        <button type="button" id="envelopeEditEmojiBtn" class="manage-emoji-btn"
                aria-label="Changer l'image">${escapeHtml(enveloppe.icon)}</button>
        <label class="sr-only" for="envelopeEditLabel">Nom de l'enveloppe</label>
        <input type="text" id="envelopeEditLabel" value="${escapeHtml(enveloppe.label)}" maxlength="30" />
      </div>
      <div id="envelopeEditEmojiPicker" class="manage-emoji-picker" style="display:none;">
        ${emojisProposes().map(emoji => `
          <button type="button" class="emoji-pick emoji-pick--edition" data-emoji="${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>
        `).join('')}
      </div>
      <div class="envelope-add-details">
        <div class="envelope-field">
          <label for="envelopeEditNature">Nature</label>
          <select id="envelopeEditNature">
            <option value="cagnotte"${enveloppe.nature === 'cagnotte' ? ' selected' : ''}>Cagnotte — s'accumule</option>
            <option value="mensuelle"${enveloppe.nature === 'mensuelle' ? ' selected' : ''}>Mensuelle — se recharge le 1er</option>
          </select>
        </div>
        <div class="envelope-field">
          <label for="envelopeEditRang">Rang</label>
          <select id="envelopeEditRang">
            ${['', 'fixe', 'mensuel', 'provision', 'epargne', 'reserve'].map(valeur => `
              <option value="${valeur}"${(enveloppe.rang || '') === valeur ? ' selected' : ''}>${
                { '': '— à classer —', fixe: 'Fixe', mensuel: 'Mensuel', provision: 'Provision', epargne: 'Épargne', reserve: 'Réserve' }[valeur]
              }</option>`).join('')}
          </select>
        </div>
        <div class="envelope-field">
          <label for="envelopeEditBudget" id="envelopeEditBudgetLabel">${
            enveloppe.nature === 'mensuelle' ? 'Allocation par mois (€, facultatif)' : 'Objectif (€, facultatif)'
          }</label>
          <input type="text" id="envelopeEditBudget" value="${enveloppe.budget ?? ''}" inputmode="decimal" maxlength="10" />
        </div>
        <div class="envelope-field envelope-field--report" id="envelopeEditReportChamp"${enveloppe.nature === 'mensuelle' ? '' : ' hidden'}>
          <label for="envelopeEditReport">Reporter le non-dépensé</label>
          <select id="envelopeEditReport">
            <option value="non"${enveloppe.report ? '' : ' selected'}>Non — repart à plein chaque mois</option>
            <option value="oui"${enveloppe.report ? ' selected' : ''}>Oui — le reliquat s'ajoute</option>
          </select>
        </div>
        <div class="envelope-field">
          <label for="envelopeEditDebut">Du (facultatif)</label>
          <input type="date" id="envelopeEditDebut" value="${escapeHtml(enveloppe.debut || '')}" />
        </div>
        <div class="envelope-field">
          <label for="envelopeEditFin">Au (facultatif)</label>
          <input type="date" id="envelopeEditFin" value="${escapeHtml(enveloppe.fin || '')}" />
        </div>
      </div>
      <div class="envelope-edition-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="envelopeEditAnnuler">Annuler</button>
        <button type="button" class="btn btn-primary btn-sm" id="envelopeEditValider">Enregistrer</button>
      </div>
    </div>
  `;
}

/**
 * D'où vient cette enveloppe
 *
 * Le foyer a découvert « Vacances 2027 » sans savoir d'où elle sortait, et
 * l'application n'avait aucune réponse : rien n'était enregistré. La ligne
 * n'est rendue que si la provenance est connue — toutes les enveloppes créées
 * avant ce champ n'en portent pas, et inventer un auteur serait pire que le
 * silence.
 *
 * @param {Object} enveloppe
 * @returns {string} Fragment HTML échappé, ou chaîne vide
 */
function blocProvenance(enveloppe) {
  if (!enveloppe.creePar && !enveloppe.creeLe) return '';

  const qui = enveloppe.creePar
    ? memberLabel(enveloppe.creePar, getState('members'))
    : null;
  const quand = enveloppe.creeLe ? formatDate(enveloppe.creeLe) : null;

  const phrase = [
    'Créée',
    qui ? `par ${qui}` : null,
    quand ? `le ${quand}` : null
  ].filter(Boolean).join(' ');

  return `<p class="enveloppe-provenance">${escapeHtml(phrase)}</p>`;
}

/**
 * Ce que la loupe apporte, dit avant de cliquer
 *
 * Une provision — cagnotte, objectif, échéance — y porte le chiffre qu'on
 * vient chercher : combien mettre de côté ce mois-ci. Il ne peut PAS être
 * calculé ici : la liste ne connaît que les charges du mois consulté, pas le
 * contenu du pot, et une provision calculée sans lui serait un second chiffre
 * faux à côté du bon. On dit donc où il est, plutôt que de le refaire.
 *
 * Signalé à l'usage : une fois la cagnotte de l'an prochain créée, la carte de
 * veille disparaît — c'est voulu, elle a été suivie — et rien n'indiquait plus
 * où le montant mensuel avait migré.
 *
 * @param {Object} enveloppe
 * @returns {string} Texte, échappé par l'appelant
 */
function indiceDeLaLoupe(enveloppe) {
  const provision = enveloppe.nature !== NATURES.MENSUELLE
    && Number.isFinite(enveloppe.budget) && enveloppe.budget > 0
    && typeof enveloppe.fin === 'string' && enveloppe.fin;

  return provision
    ? '🔍 pour le total, et ce qu\'il reste à mettre de côté chaque mois'
    : '🔍 pour le total sur toute sa durée';
}

/**
 * Une ligne de la liste de gestion
 *
 * @param {Object} enveloppe
 * @param {number} index
 * @param {Array<Object>} charges - Charges du mois consulté
 * @returns {string} Fragment HTML échappé
 */
function ligneEnveloppe(enveloppe, index, charges) {
  const total = totalEnveloppe(charges, enveloppe.id);
  const mensuelle = enveloppe.nature === NATURES.MENSUELLE;

  // Le budget ne se compare au total du mois que sur une mensuelle : c'est là
  // que l'allocation *est* mensuelle. Sur une cagnotte, le budget est un
  // objectif total — l'afficher à côté d'un mois seul ferait lire « 240 sur
  // 1 200 » comme une marge confortable alors que onze mois manquent au compte.
  const budget = mensuelle && enveloppe.budget
    ? ` / ${formatCurrency(enveloppe.budget)}`
    : '';
  const natureTag = mensuelle
    ? `<span class="envelope-nature">mensuelle${enveloppe.report ? ', reportée' : ''}</span>`
    : '';
  const persoTag = enveloppe.perimetre === 'solo'
    ? '<span class="envelope-perso">perso</span>'
    : '';
  const fenetre = decrireFenetre(enveloppe);

  return `
    <div class="manage-list-item envelope-item${enveloppe.cloturee ? ' envelope-close' : ''}" data-index="${index}">
      <span class="manage-item-icon">${escapeHtml(enveloppe.icon)}</span>
      <span class="manage-item-label">
        ${escapeHtml(enveloppe.label)}${enveloppe.cloturee ? ' <span class="envelope-etat">close</span>' : ''}${natureTag}${persoTag}
        <small class="envelope-detail">${formatCurrency(total)}${budget} ce mois-ci${fenetre}</small>
        <small class="envelope-detail envelope-detail--indice">${indiceDeLaLoupe(enveloppe)}</small>
      </span>
      <button type="button" class="btn-icon envelope-ouvrir" data-index="${index}"
              aria-label="Voir le détail de ${escapeHtml(enveloppe.label)}">🔍</button>
      <button type="button" class="btn-icon envelope-editer" data-index="${index}"
              aria-label="Modifier ${escapeHtml(enveloppe.label)}">✏️</button>
      <button type="button" class="btn-icon envelope-toggle" data-index="${index}"
              aria-label="${enveloppe.cloturee ? 'Rouvrir' : 'Clore'} ${escapeHtml(enveloppe.label)}">
        ${enveloppe.cloturee ? '♻️' : '📥'}
      </button>
      <button type="button" class="btn-icon btn-delete envelope-delete" data-index="${index}"
              aria-label="Supprimer ${escapeHtml(enveloppe.label)}">✕</button>
    </div>
  `;
}

/**
 * Ce qu'il faut mettre de côté chaque mois pour tenir l'échéance
 *
 * Une charge annuelle n'appartient pas au mois où elle tombe : la taxe foncière
 * de 1 200 € payée en octobre appartient aux douze mois qui la précèdent. Sans
 * cette ligne, octobre la portait seul et son bilan cessait de vouloir dire
 * quelque chose.
 *
 * Trois états, et ils ne se disent pas de la même façon : l'objectif atteint se
 * félicite, l'échéance dépassée alerte, et le cas courant donne un chiffre.
 *
 * @param {Object} provision - Sortie de `etatProvision`
 * @returns {string} Fragment échappé, ou chaîne vide si l'enveloppe n'en est pas une
 */
function blocProvision(provision) {
  if (!provision.concernee) return '';

  const quand = formatDate(provision.echeance);

  if (provision.atteinte) {
    return `
      <div class="enveloppe-provision enveloppe-provision--atteinte">
        <div class="provision-titre"><span aria-hidden="true">✅</span> Objectif atteint</div>
        <div class="provision-detail">
          ${formatCurrency(provision.objectif)} réunis pour le ${escapeHtml(quand)} —
          plus rien à mettre de côté.
        </div>
      </div>
    `;
  }

  if (provision.enRetard) {
    return `
      <div class="enveloppe-provision enveloppe-provision--retard">
        <div class="provision-titre"><span aria-hidden="true">⚠️</span> Échéance dépassée</div>
        <div class="provision-detail">
          Le ${escapeHtml(quand)} est passé et il manque
          <strong>${formatCurrency(provision.manque)}</strong>.
        </div>
      </div>
    `;
  }

  const plusieurs = provision.restants > 1;
  const mois = plusieurs ? `${provision.restants} mois` : 'ce mois-ci, dernier délai';

  // « par mois » n'a de sens qu'au pluriel. Au dernier mois, la somme entière
  // est due en une fois : l'annoncer « par mois » la fait lire comme un
  // engagement qui se répète, quand c'est au contraire le dernier versement.
  const cadence = plusieurs ? 'par mois' : 'à mettre ce mois-ci';

  return `
    <div class="enveloppe-provision">
      <div class="provision-titre">
        <span aria-hidden="true">🗓️</span>
        <strong>${formatCurrency(provision.parMois)}</strong> ${cadence}
      </div>
      <div class="provision-detail">
        Il manque ${formatCurrency(provision.manque)} pour le
        ${escapeHtml(quand)} — ${escapeHtml(mois)}.
      </div>
    </div>
  `;
}

/**
 * Décrit la fenêtre de dates d'une enveloppe, si elle en porte une
 * @param {Object} enveloppe
 * @returns {string} Fragment échappé, ou chaîne vide
 */
function decrireFenetre(enveloppe) {
  if (!enveloppe.debut && !enveloppe.fin) return '';

  // En toutes lettres, comme partout ailleurs dans l'application. La ligne
  // affichait « 2026-08-01 → 2026-08-15 » en chasse fixe, au milieu d'un écran
  // qui écrit « 15 août 2026 » : de la donnée brute, là où l'on cherche une
  // date.
  const debut = enveloppe.debut ? formatDate(enveloppe.debut) : '';
  const fin = enveloppe.fin ? formatDate(enveloppe.fin) : '';

  if (debut && fin) return ` · ${escapeHtml(debut)} → ${escapeHtml(fin)}`;
  return debut
    ? ` · à partir du ${escapeHtml(debut)}`
    : ` · jusqu'au ${escapeHtml(fin)}`;
}

/**
 * Branche les commandes de l'écran
 *
 * Le balisage est reconstruit à chaque rendu : les écouteurs posés ici meurent
 * avec lui, il n'y a donc rien à retirer. C'est la raison pour laquelle ce
 * module n'a pas besoin du garde-fou `poserUnique` de la saisie rapide, où les
 * éléments, eux, survivent aux reconstructions.
 *
 * Chaque commande relit l'état courant au moment où on l'actionne, plutôt que
 * de capturer la liste au rendu : entre l'ouverture de l'écran et le clic,
 * l'autre téléphone a pu écrire.
 *
 * @param {HTMLElement} modal
 * @returns {void}
 */
function brancherEcran(modal) {
  let emojiChoisi = '🧳';

  // La nature décide de deux choses à l'écran, et il vaut mieux qu'elles
  // suivent le choix plutôt que de rester à côté : le même champ « budget »
  // veut dire « par mois » sur une mensuelle et « en tout » sur une cagnotte,
  // et le report n'a de sens que sur la première.
  const champNature = modal.querySelector('#envelopeNewNature');
  const accorderALaNature = () => {
    const mensuelle = champNature.value === NATURES.MENSUELLE;
    const etiquette = modal.querySelector('#envelopeNewBudgetLabel');
    if (etiquette) {
      etiquette.textContent = mensuelle
        ? 'Allocation par mois (€, facultatif)'
        : 'Objectif (€, facultatif)';
    }
    const champReport = modal.querySelector('#envelopeNewReportChamp');
    if (champReport) champReport.hidden = !mensuelle;
  };
  champNature.addEventListener('change', accorderALaNature);
  accorderALaNature();

  const boutonEmoji = modal.querySelector('#envelopeEmojiBtn');
  const planche = modal.querySelector('#envelopeEmojiPicker');
  const champLibelle = modal.querySelector('#envelopeNewLabel');

  boutonEmoji.addEventListener('click', () => {
    planche.style.display = planche.style.display === 'none' ? 'flex' : 'none';
  });

  modal.querySelectorAll('.emoji-pick').forEach(bouton => {
    bouton.addEventListener('click', () => {
      emojiChoisi = bouton.dataset.emoji;
      boutonEmoji.textContent = emojiChoisi;
      planche.style.display = 'none';
    });
  });

  const ajouter = async () => {
    const libelle = champLibelle.value.trim();
    if (!libelle) {
      toast.error('Nom requis');
      champLibelle.focus();
      return;
    }

    const existantes = getEnveloppes();
    if (existantes.some(e => e.label.toLowerCase() === libelle.toLowerCase())) {
      toast.error('Ce nom existe déjà');
      return;
    }

    const debut = dateLisible(modal.querySelector('#envelopeNewDebut').value);
    const fin = dateLisible(modal.querySelector('#envelopeNewFin').value);
    if (!fenetreCoherente(debut, fin)) {
      toast.error('La date de fin précède celle de début');
      return;
    }

    // Le périmètre et son propriétaire sortent du même select : les deux
    // valeurs nominatives disent à la fois « solo » et « de qui ». Un couple de
    // champs séparés aurait permis « solo » sans propriétaire, que
    // `normaliserEnveloppe` refuse de rattacher à quelqu'un.
    const pourQui = modal.querySelector('#envelopeNewPerimetre').value;
    const nature = modal.querySelector('#envelopeNewNature').value === NATURES.MENSUELLE
      ? NATURES.MENSUELLE
      : NATURES.CAGNOTTE;

    const enveloppe = enveloppeNeuve({
      // `identifiantEnveloppe`, et non `identifiantDepuisLibelle` : un
      // identifiant entièrement dérivé du libellé faisait hériter une
      // « Vacances » recréée de tout ce qui renvoyait à la précédente — ses
      // versements et ses charges. Mesuré : « 300,00 € dans le pot » sur une
      // enveloppe vide.
      id: identifiantEnveloppe(libelle, existantes),
      label: libelle,
      icon: emojiChoisi,
      budget: budgetLisible(modal.querySelector('#envelopeNewBudget').value),
      debut,
      fin,
      cloturee: false,
      nature,
      // Le report n'existe que sur une mensuelle : une cagnotte reporte par
      // nature, et deux façons de dire la même chose finissent par diverger.
      report: nature === NATURES.MENSUELLE
        && modal.querySelector('#envelopeNewReport').value === 'oui',
      rang: modal.querySelector('#envelopeNewRang').value || null,
      perimetre: pourQui === 'commun' ? 'commun' : 'solo',
      proprietaire: pourQui === 'commun' ? null : pourQui
    });

    if (!enveloppe) {
      toast.error('Cette enveloppe ne peut pas être enregistrée');
      champLibelle.focus();
      return;
    }

    if (!await enregistrer([...existantes, enveloppe], existantes)) return;

    toast.success(`Enveloppe "${libelle}" créée`);
    populateAllEnvelopeSelects();
    showManageEnvelopesModal();
  };

  modal.querySelector('#envelopeAddBtn').addEventListener('click', ajouter);

  // Entrée depuis le nom avance au champ suivant, elle ne valide pas.
  //
  // Elle validait — ce qui, avec le bouton placé juste après le nom, formait le
  // même piège au clavier qu'à l'écran : le budget et les deux dates étaient
  // perdus sans un mot. Depuis le budget, en revanche, il ne reste que deux
  // champs facultatifs : Entrée y garde son sens de « c'est fini ».
  champLibelle.addEventListener('keydown', evenement => {
    if (evenement.key !== 'Enter') return;
    evenement.preventDefault();
    modal.querySelector('#envelopeNewBudget').focus();
  });

  modal.querySelector('#envelopeNewBudget').addEventListener('keydown', evenement => {
    if (evenement.key !== 'Enter') return;
    evenement.preventDefault();
    ajouter();
  });

  // Ouvrir le détail d'une enveloppe
  modal.querySelectorAll('.envelope-ouvrir').forEach(bouton => {
    bouton.addEventListener('click', () => {
      const cible = getEnveloppes()[Number(bouton.dataset.index)];
      if (cible) ouvrirLaVueEnveloppe(cible.id);
    });
  });

  // Ouvrir l'édition d'une enveloppe
  modal.querySelectorAll('.envelope-editer').forEach(bouton => {
    bouton.addEventListener('click', () => {
      _enEdition = Number(bouton.dataset.index);
      showManageEnvelopesModal();
      document.getElementById('envelopeEditLabel')?.focus();
    });
  });

  modal.querySelector('#envelopeEditAnnuler')?.addEventListener('click', () => {
    _enEdition = null;
    showManageEnvelopesModal();
  });

  const emojiEdition = modal.querySelector('#envelopeEditEmojiBtn');
  const plancheEdition = modal.querySelector('#envelopeEditEmojiPicker');
  if (emojiEdition && plancheEdition) {
    emojiEdition.addEventListener('click', () => {
      plancheEdition.style.display = plancheEdition.style.display === 'none' ? 'flex' : 'none';
    });
    modal.querySelectorAll('.emoji-pick--edition').forEach(pastille => {
      pastille.addEventListener('click', () => {
        emojiEdition.textContent = pastille.dataset.emoji;
        plancheEdition.style.display = 'none';
      });
    });
  }

  // Le même accord qu'à la création : le champ « budget » veut dire « par
  // mois » ou « en tout » selon la nature, et le report n'existe que sur une
  // mensuelle.
  const natureEdition = modal.querySelector('#envelopeEditNature');
  natureEdition?.addEventListener('change', () => {
    const mensuelle = natureEdition.value === NATURES.MENSUELLE;
    const etiquette = modal.querySelector('#envelopeEditBudgetLabel');
    if (etiquette) {
      etiquette.textContent = mensuelle
        ? 'Allocation par mois (€, facultatif)'
        : 'Objectif (€, facultatif)';
    }
    const champReport = modal.querySelector('#envelopeEditReportChamp');
    if (champReport) champReport.hidden = !mensuelle;
  });

  modal.querySelector('#envelopeEditValider')?.addEventListener('click', async () => {
    const index = _enEdition;
    const avant = getEnveloppes();
    const cible = avant[index];
    if (!cible) return;

    const libelle = modal.querySelector('#envelopeEditLabel').value.trim();
    if (!libelle) {
      toast.error('Nom requis');
      return;
    }

    // La comparaison exclut l'enveloppe éditée : garder son propre nom parce
    // qu'on ne change que le budget ne doit pas se heurter à soi-même.
    const doublon = avant.some((e, rang) =>
      rang !== index && e.label.toLowerCase() === libelle.toLowerCase());
    if (doublon) {
      toast.error('Ce nom existe déjà');
      return;
    }

    const debut = dateLisible(modal.querySelector('#envelopeEditDebut').value);
    const fin = dateLisible(modal.querySelector('#envelopeEditFin').value);
    if (!fenetreCoherente(debut, fin)) {
      toast.error('La date de fin précède celle de début');
      return;
    }

    // Le `...enveloppe` garde ce que le formulaire ne montre pas — le
    // périmètre, le propriétaire, l'état clos. Ce qu'il montre, en revanche,
    // doit être relu : sans ces trois lignes, changer la nature d'une enveloppe
    // aurait été impossible, et le select l'aurait pourtant laissé croire.
    const natureChoisie = modal.querySelector('#envelopeEditNature').value === NATURES.MENSUELLE
      ? NATURES.MENSUELLE
      : NATURES.CAGNOTTE;

    // `normaliserEnveloppe` et non l'objet étalé tel quel : `fusionnerListe`
    // écrit le tableau ENTIER par transaction, et les règles ferment la liste
    // des champs. Un champ de plus posé ici — un `modifieLe`, une couleur —
    // ferait refuser TOUTES les enveloppes du foyer, pas seulement celle qu'on
    // vient d'éditer. Mesuré : l'ajouter laissait les 2 378 contrôles verts.
    //
    // La provenance n'est PAS refaite : éditer n'est pas créer, et
    // `...enveloppe` la porte déjà.
    const apres = avant.map((enveloppe, rang) => (rang === index ? normaliserEnveloppe({
      ...enveloppe,
      label: libelle,
      icon: emojiEdition ? emojiEdition.textContent.trim() : enveloppe.icon,
      budget: budgetLisible(modal.querySelector('#envelopeEditBudget').value),
      debut,
      fin,
      nature: natureChoisie,
      report: natureChoisie === NATURES.MENSUELLE
        && modal.querySelector('#envelopeEditReport').value === 'oui',
      rang: modal.querySelector('#envelopeEditRang').value || null
    }) : enveloppe));

    if (apres.some(entree => !entree)) {
      toast.error('Cette enveloppe ne peut pas être enregistrée');
      return;
    }

    if (!await enregistrer(apres, avant)) return;

    // L'identifiant ne bouge pas : les charges rattachées le restent, sans
    // qu'aucune écriture ne les touche.
    _enEdition = null;
    toast.success(`« ${libelle} » enregistrée`);
    populateAllEnvelopeSelects();
    showManageEnvelopesModal();
  });

  modal.querySelectorAll('.envelope-toggle').forEach(bouton => {
    bouton.addEventListener('click', async () => {
      const index = Number(bouton.dataset.index);
      const avant = getEnveloppes();
      const cible = avant[index];
      if (!cible) return;

      const apres = avant.map((enveloppe, rang) => (
        rang === index
          ? normaliserEnveloppe({ ...enveloppe, cloturee: !enveloppe.cloturee })
          : enveloppe
      ));
      if (apres.some(entree => !entree)) {
        toast.error('Cette enveloppe ne peut pas être enregistrée');
        return;
      }

      if (!await enregistrer(apres, avant)) return;

      toast.success(cible.cloturee ? `"${cible.label}" rouverte` : `"${cible.label}" close`);
      populateAllEnvelopeSelects();
      showManageEnvelopesModal();
    });
  });

  modal.querySelectorAll('.envelope-delete').forEach(bouton => {
    bouton.addEventListener('click', async () => {
      const index = Number(bouton.dataset.index);
      const avant = getEnveloppes();
      const cible = avant[index];
      if (!cible) return;

      // Supprimer une enveloppe laisse `envelope: 'vacances'` sur les charges
      // qui la portaient. Elles restent intactes et continuent de compter dans
      // le solde — seule leur étiquette disparaît de l'affichage. Clore vaut
      // mieux, et l'écran le propose juste à côté.
      const rattachees = chargesDuMois()
        .filter(charge => !charge.deleted && charge.envelope === cible.id).length;

      const { showConfirmModal } = await import('../components/modal.js');
      const question = rattachees > 0
        ? `Supprimer l'enveloppe "${cible.label}" ? ${rattachees} charge(s) de ce mois perdront leur étiquette. Les montants et le solde ne changent pas.`
        : `Supprimer l'enveloppe "${cible.label}" ?`;
      if (!await showConfirmModal(question)) return;

      if (!await enregistrer(avant.filter((_, rang) => rang !== index), avant)) return;

      toast.success(`"${cible.label}" supprimée`);
      populateAllEnvelopeSelects();
      showManageEnvelopesModal();
    });
  });

  modal.querySelector('#envelopeManageClose').addEventListener('click', () => {
    // Sans cela, rouvrir l'écran retrouverait un formulaire ouvert dont plus
    // personne ne se souvient.
    _enEdition = null;
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  });
}

// ===== VUE D'UNE ENVELOPPE, TOUS MOIS CONFONDUS =====

/**
 * L'auteur proposé pour un versement : celui qui tient l'appareil
 *
 * Le même raisonnement que pour le payeur d'une charge : proposer « vous » en
 * dur attribuerait au conjoint chaque versement fait depuis le second
 * téléphone, et le partage « vous avez mis 400, elle 300 » serait faux dès la
 * première saisie.
 *
 * @returns {string} 'vous' ou 'conjointe'
 */
function auteurParDefaut() {
  return normaliserEmplacement(getState('emplacementCourant'));
}

/**
 * La jauge d'une cagnotte alimentée : elle monte
 *
 * L'inverse exact de celle d'un budget, et c'est voulu. Un budget se vide vers
 * zéro ; un pot se remplit vers son objectif. Même widget, sens opposé — la
 * nature de l'enveloppe suffit à savoir lequel lire.
 *
 * @param {Object} pot - Rendu par `bilanCagnotte`
 * @returns {string} Fragment échappé, ou chaîne vide sans objectif
 */
function jaugeCagnotte(pot) {
  if (pot.objectif === null) return '';

  const etat = pot.aDecouvert ? 'depasse' : (pot.atteint ? 'atteint' : 'ok');
  const phrase = pot.aDecouvert
    ? `${formatCurrency(Math.abs(pot.dansLePot))} sortis de plus qu'il n'y en avait`
    : (pot.atteint
      ? `objectif atteint`
      : `${formatCurrency(pot.manque)} avant l'objectif`);

  // À découvert, la barre serait vide et se lirait « rien dedans » plutôt que
  // « vous êtes en dessous de zéro ». Elle est rendue pleine, en rouge — la
  // même parade que sur la jauge de budget en dépassement.
  const largeur = pot.aDecouvert ? 100 : pot.partAtteinte;

  return `
    <div class="enveloppe-jauge enveloppe-jauge--${etat}">
      <div class="enveloppe-jauge-barre" style="width: ${largeur}%"></div>
    </div>
    <div class="enveloppe-jauge-legende">
      ${escapeHtml(phrase)} · objectif ${formatCurrency(pot.objectif)}
    </div>
  `;
}

/**
 * Le bloc « Alimenter » d'une cagnotte : le formulaire et l'historique
 *
 * Absent d'une enveloppe mensuelle : on n'alimente pas un budget, on le fixe.
 *
 * @param {Array<Object>} versements
 * @param {Object} enveloppe
 * @returns {string} Fragment échappé
 */
function blocVersements(versements, enveloppe) {
  const actifs = versementsActifs(versements);
  const auteur = auteurParDefaut();

  const lignes = actifs.length === 0
    ? '<p class="empty-state">Rien versé pour l\'instant. Ce pot se lit encore comme un budget ; dès le premier versement, il dira ce qu\'il contient.</p>'
    : actifs.map(ligneVersement).join('');

  return `
    <div class="enveloppe-versements" data-enveloppe="${escapeHtml(enveloppe.id)}">
      <h3 class="enveloppe-versements-titre">Alimenter le pot</h3>

      <div class="enveloppe-versement-ajout">
        <label class="sr-only" for="versementMontant">Montant du versement</label>
        <input type="text" id="versementMontant" placeholder="Ex : 100" inputmode="decimal" maxlength="10" />

        <label class="sr-only" for="versementAuteur">Qui verse</label>
        <select id="versementAuteur">
          <option value="vous"${auteur === 'vous' ? ' selected' : ''}>Moi</option>
          <option value="conjointe"${auteur === 'conjointe' ? ' selected' : ''}>Ma conjointe</option>
        </select>

        <label class="sr-only" for="versementDate">Date du versement</label>
        <input type="date" id="versementDate" value="${escapeHtml(dateDuJour())}" />

        <button type="button" class="btn btn-primary btn-sm" id="versementAjouter">Verser</button>
      </div>

      <p class="form-aide">Un versement ne touche pas le solde du couple : c'est de l'argent mis de côté, pas une dépense partagée.</p>

      <div class="enveloppe-versements-liste">${lignes}</div>
    </div>
  `;
}

/**
 * Une ligne d'historique de versement
 *
 * @param {Object} versement
 * @returns {string} Fragment échappé
 */
function ligneVersement(versement) {
  const quand = versement.date ? formatDate(versement.date) : '';
  const qui = versement.auteur === 'conjointe'
    ? 'conjointe'
    : (versement.auteur === 'vous' ? 'vous' : 'auteur inconnu');

  return `
    <div class="enveloppe-versement">
      <div class="enveloppe-versement-detail">
        ${escapeHtml(qui)}${quand ? ` · ${escapeHtml(quand)}` : ''}
      </div>
      <div class="enveloppe-versement-montant">+ ${formatCurrency(versement.montant)}</div>
      <button type="button" class="btn-icon btn-delete versement-retirer"
              data-versement="${escapeHtml(versement.id)}"
              aria-label="Retirer ce versement de ${formatCurrency(versement.montant)}">✕</button>
    </div>
  `;
}

/**
 * Ouvre le détail d'une enveloppe
 *
 * L'écran de gestion ne comptait que le mois consulté — « 320 € ce mois-ci » —
 * ce qui est l'inverse du besoin : une enveloppe existe pour traverser les
 * mois, et le seul chiffre qu'on lui demande, ce qu'ont coûté les vacances en
 * tout, était le seul qu'on ne pouvait pas obtenir. Son budget se mesurait donc
 * au mauvais nombre, et rien ne permettait de voir ce qu'elle contient.
 *
 * La lecture du nœud complet ne se fait qu'à l'ouverture de cette vue, jamais
 * au fil de l'écran de gestion : c'est la seule requête coûteuse du module.
 *
 * @param {string} id - Identifiant de l'enveloppe
 * @returns {Promise<void>}
 */
async function ouvrirLaVueEnveloppe(id) {
  const enveloppe = enveloppeParId(getEnveloppes(), id);
  if (!enveloppe) return;

  let charges;
  let versements;
  try {
    const { dbGet } = await import('../db.js');
    // Les deux lectures ensemble : le détail est la seule vue coûteuse du
    // module, autant n'y revenir qu'une fois.
    const [periods, noeudVersements] = await Promise.all([
      dbGet('periods'),
      dbGet(`${CHEMIN_VERSEMENTS}/${id}`)
    ]);
    charges = chargesDeLEnveloppeTousMois(periods, id);
    versements = normaliserVersements(noeudVersements);
  } catch (erreur) {
    logError('❌ Lecture des dépenses de l\'enveloppe impossible :', erreur);
    toast.error('Dépenses illisibles — réessayez');
    return;
  }

  // Le mois affiché, que la nature de l'enveloppe cadrera : une cagnotte
  // l'ignore et regarde tout, une mensuelle s'y tient.
  const moisConsulte = getState('currentPeriod');
  const bilan = bilanEnveloppe(charges, enveloppe, moisConsulte);

  // Un pot alimenté se lit par son contenu, pas par son objectif.
  //
  // Tant qu'aucun versement n'existe — le cas de toutes les cagnottes déjà en
  // base — la lecture reste celle d'avant : un objectif dont on retranche les
  // dépenses, jauge qui descend. Dès qu'on y met de l'argent, c'est
  // `versé − dépensé` qui fait foi et la jauge monte : un budget se vide, une
  // cagnotte se remplit.
  const cagnotte = enveloppe.nature !== NATURES.MENSUELLE;
  const pot = cagnotte && estAlimentee(versements)
    ? bilanCagnotte(versements, bilan.total, enveloppe.budget)
    : null;

  // Ce qu'il reste à mettre de côté, mois par mois, pour tenir l'échéance.
  //
  // `acquisSurObjectif` porte les deux lectures : le contenu réel du pot quand
  // il est alimenté, le déjà-dépensé quand il ne l'est pas. Ce calcul prenait
  // `dansLePot` dans tous les cas — donc `versé − dépensé`, négatif sur un pot
  // vide —, et réclamait l'objectif PLUS tout le déjà-dépensé.
  const contenu = cagnotte ? acquisSurObjectif(versements, bilan.total) : 0;
  const provision = etatProvision(enveloppe, contenu, moisConsulte);

  let modal = document.getElementById('modalVueEnveloppe');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalVueEnveloppe';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'vueEnveloppeTitre');
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal enveloppe-vue">
      <h2 class="modal-header" id="vueEnveloppeTitre">
        ${escapeHtml(enveloppe.icon)} ${escapeHtml(enveloppe.label)}
      </h2>

      <div class="enveloppe-total">
        <div class="enveloppe-total-montant">${formatCurrency(pot ? pot.dansLePot : bilan.total)}</div>
        <div class="enveloppe-total-detail">${pot ? 'dans le pot' : resumeDuBilan(bilan)}</div>
        ${pot ? jaugeCagnotte(pot) : jaugeBudget(bilan, moisConsulte)}
      </div>

      ${blocProvision(provision)}
      ${blocProvenance(enveloppe)}

      ${cagnotte ? blocVersements(versements, enveloppe) : ''}

      <div class="enveloppe-depenses">
        ${charges.length === 0
          ? '<p class="empty-state">Aucune dépense rattachée pour l\'instant. Choisissez cette enveloppe au moment de saisir une charge.</p>'
          : charges.map(ligneDepense).join('')}
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="vueEnveloppeFermer">Fermer</button>
      </div>
    </div>
  `;

  modal.querySelector('#vueEnveloppeFermer').addEventListener('click', () => {
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  });

  brancherLesVersements(modal, id);

  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('active'));
}

/**
 * Branche « Verser » et le retrait d'un versement
 *
 * Le balisage du détail est reconstruit à chaque ouverture : les écouteurs
 * posés ici meurent avec lui, il n'y a rien à retirer. Chaque commande relit
 * l'état au moment où on l'actionne plutôt que de le capturer au rendu — entre
 * l'ouverture de la vue et le clic, l'autre téléphone a pu écrire.
 *
 * @param {HTMLElement} modal
 * @param {string} id - Identifiant de l'enveloppe
 * @returns {void}
 */
function brancherLesVersements(modal, id) {
  const bouton = modal.querySelector('#versementAjouter');
  if (!bouton) return;

  const champMontant = modal.querySelector('#versementMontant');

  const verser = async () => {
    const auteur = modal.querySelector('#versementAuteur').value;

    // Le même contrôle que les règles Firebase appliquent côté serveur. Les
    // deux existent à dessein : le serveur pour que ce soit vrai, le client
    // pour que le refus s'explique avant l'écriture — sans quoi la saisie
    // partirait grossir la file hors ligne pour échouer plus tard.
    const verdict = versementEcrivable(champMontant.value, auteur);
    if (!verdict.valide) {
      toast.error(verdict.erreur);
      champMontant.focus();
      return;
    }

    try {
      const { dbPush } = await import('../db.js');
      await dbPush(`${CHEMIN_VERSEMENTS}/${id}`, {
        montant: verdict.montant,
        auteur,
        date: dateLisible(modal.querySelector('#versementDate').value) || '',
        timestamp: Date.now(),
        deleted: false
      });
    } catch (erreur) {
      logError('❌ Versement impossible :', erreur);
      toast.error('Versement non enregistré');
      return;
    }

    toast.success(`${formatCurrency(verdict.montant)} versés`);
    await ouvrirLaVueEnveloppe(id);
  };

  bouton.addEventListener('click', verser);

  // Entrée depuis le montant vaut « c'est fini » : il ne reste que deux champs
  // préremplis derrière.
  champMontant.addEventListener('keydown', evenement => {
    if (evenement.key !== 'Enter') return;
    evenement.preventDefault();
    verser();
  });

  modal.querySelectorAll('.versement-retirer').forEach(croix => {
    croix.addEventListener('click', async () => {
      const versement = croix.dataset.versement;
      if (!versement) return;

      // Suppression douce, comme partout ailleurs : l'entrée reste en base et
      // le montant cesse de compter. Rien ne s'efface jamais tout à fait.
      try {
        const { dbUpdate } = await import('../db.js');
        await dbUpdate(`${CHEMIN_VERSEMENTS}/${id}/${versement}`, { deleted: true });
      } catch (erreur) {
        logError('❌ Retrait du versement impossible :', erreur);
        toast.error('Retrait non enregistré');
        return;
      }

      toast.success('Versement retiré');
      await ouvrirLaVueEnveloppe(id);
    });
  });
}

/**
 * La phrase qui accompagne le total
 *
 * @param {Object} bilan - Rendu par `bilanEnveloppe`
 * @returns {string} Fragment échappé
 */
function resumeDuBilan(bilan) {
  const depenses = `${bilan.nombre} dépense${bilan.nombre > 1 ? 's' : ''}`;
  const mois = bilan.mois > 1 ? ` sur ${bilan.mois} mois` : '';
  return escapeHtml(`${depenses}${mois}`);
}

/**
 * La jauge de budget, quand l'enveloppe en porte un
 *
 * @param {Object} bilan
 * @param {number|null} budget
 * @returns {string} Fragment échappé, ou chaîne vide
 */
function jaugeBudget(bilan, moisConsulte) {
  if (bilan.allocation === null) return '';

  const etat = bilan.depasse ? 'depasse' : (bilan.part >= 80 ? 'proche' : 'ok');
  const reste = bilan.depasse
    ? `${formatCurrency(Math.abs(bilan.reste))} de plus que prévu`
    : `${formatCurrency(bilan.reste)} restants`;

  // Le chiffre qui fait ralentir, et le seul.
  //
  // « Il vous reste 180 € » ne dit pas s'il faut lever le pied ; « 20 € par
  // jour pendant 9 jours » le dit. Un pot d'envies vidé le 15 du mois se serait
  // annoncé dès le 8 par ce chiffre. Il ne paraît que sur une mensuelle du mois
  // en cours, où la division a un sens.
  const cadence = resteParJour(bilan, moisConsulte, dateDuJour());
  const ligneCadence = cadence
    ? `<div class="enveloppe-jauge-cadence">${escapeHtml(
        `${formatCurrency(cadence.parJour)} par jour sur les ${cadence.jours} restants`
      )}</div>`
    : '';

  // La barre dit ce qui **reste**, et non ce qui a été dépensé : c'est la
  // différence entre un relevé et un budget. Une exception, et elle compte :
  // en dépassement, `partRestante` vaut 0 et la barre s'effacerait — or une
  // barre vide se lit « pas de données », pas « vous avez dépassé ». Elle est
  // donc rendue pleine, en rouge, où elle ne peut être prise pour rien.
  const largeur = bilan.depasse ? 100 : bilan.partRestante;

  return `
    <div class="enveloppe-jauge enveloppe-jauge--${etat}">
      <div class="enveloppe-jauge-barre" style="width: ${largeur}%"></div>
    </div>
    <div class="enveloppe-jauge-legende">
      ${escapeHtml(reste)} sur ${formatCurrency(bilan.allocation)}
    </div>
    ${ligneCadence}
  `;
}

/**
 * Une dépense de la liste
 *
 * @param {Object} charge - Charge portant sa période
 * @returns {string} Fragment échappé
 */
function ligneDepense(charge) {
  const quand = charge.date ? formatDate(charge.date) : moisLisible(charge.periode);

  return `
    <div class="enveloppe-depense">
      <div class="enveloppe-depense-titre">
        ${escapeHtml(charge.description || 'Sans description')}
        ${charge.fixe ? '<span class="charge-split-tag">fixe</span>' : ''}
      </div>
      <div class="enveloppe-depense-detail">
        ${escapeHtml(quand)}${charge.category ? ` · ${escapeHtml(charge.category)}` : ''}
      </div>
      <div class="enveloppe-depense-montant">${formatCurrency(charge.amount || 0)}</div>
    </div>
  `;
}

/**
 * Un mois écrit en toutes lettres
 *
 * Les dates d'enveloppe s'affichaient en ISO brut — « 2026-08-01 → 2026-08-15 »
 * — au milieu d'une application qui écrit partout ailleurs « 15 août 2026 ».
 *
 * @param {string} periode - Clé AAAA-MM
 * @returns {string}
 */
export function moisLisible(periode) {
  if (typeof periode !== 'string' || !/^\d{4}-\d{2}$/.test(periode)) return '';
  const [annee, mois] = periode.split('-');
  return new Date(Number(annee), Number(mois) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// Joignable depuis le balisage, par la délégation `data-action` de init.js.
// La gestion des catégories et celle des destinations sont restées inatteignables
// des mois durant, exposées sur `window` sans qu'aucun bouton ne les appelle :
// `tests/actions-atteignables.test.js` ferme cette porte pour les trois.
window.showManageEnvelopesModal = showManageEnvelopesModal;
