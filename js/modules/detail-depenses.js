// ===== MODULE : LE DÉTAIL DERRIÈRE UN CHIFFRE DU BILAN =====
//
// Le bilan annonce « Richard a payé 670,15 € » et « Restaurant : 565,60 € ».
// Deux chiffres justes, et aucun moyen de savoir ce qu'il y a dedans : il
// fallait ouvrir les charges et filtrer de tête.
//
// ## Pourquoi une modale, et pas la recherche
//
// Remplir le champ de recherche aurait été moins de code. Mais sous 900 px, le
// bilan et les charges sont deux ONGLETS distincts : le clic aurait filtré une
// liste que l'écran ne montre pas, et se serait lu comme un bouton mort. Une
// modale répond là où l'on est, et laisse les listes tranquilles.
//
// C'est aussi le patron que l'application a déjà, avec la vue d'enveloppe :
// un titre, un total, les dépenses qui le composent.

import { getState } from '../state.js';
import { showModal, closeModal } from '../components/modal.js';
import { escapeHtml, formatCurrency, formatPaidBy } from '../utils/format.js';
import { formatDate, formatPeriod, dateDeLaCharge } from '../utils/date.js';
import { memberLabel } from '../utils/members.js';
import { resolveShareMode, resolvePercents } from '../utils/calculations.js';
import { detailDuPayeur, detailDeLaCategorie } from '../utils/detail.js';
import { libelleDeLaRepartition } from '../utils/repartition.js';
import { log } from '../utils/debug.js';

/** Identifiant de la modale, créée à la première ouverture */
const ID = 'modalDetailDepenses';

/**
 * Initialise le module
 * @returns {void}
 */
export function initDetailDepenses() {
  window.ouvrirDetailPayeur = ouvrirDetailPayeur;
  window.ouvrirDetailCategorie = ouvrirDetailCategorie;
  log('🔎 Détail des dépenses initialisé');
}

/**
 * Les termes du mois affiché, lus exactement comme le bilan les lit
 *
 * `resolveShareMode` et `resolvePercents` sont les mêmes fabriques que
 * `calculateSummary` : sans elles, la part d'une charge partagée serait
 * calculée sur le réglage du foyer là où l'écran a utilisé celui, figé, du
 * mois — et le détail ne retrouverait pas le chiffre qu'il explique.
 *
 * @returns {Object}
 */
function termesDuMois() {
  return {
    fixedCharges: getState('fixedCharges') || [],
    variableCharges: getState('variableCharges') || [],
    salaries: getState('salaries') || { vous: 0, conjointe: 0 },
    shareMode: resolveShareMode(getState('shareModeDuMois'), getState('shareMode')),
    customPercents: resolvePercents(
      getState('customPercentsDuMois'),
      getState('customPercents') || { vous: 50, conjointe: 50 }
    )
  };
}

/**
 * Ce que quelqu'un a réellement avancé ce mois-ci
 *
 * @param {'vous'|'conjointe'} qui
 * @returns {void}
 */
export function ouvrirDetailPayeur(qui) {
  if (qui !== 'vous' && qui !== 'conjointe') return;

  const { lignes, total } = detailDuPayeur({ ...termesDuMois(), qui });
  const nom = memberLabel(qui, getState('members'));

  rendre({
    titre: `${nom} a payé`,
    total,
    lignes,
    // La part avancée, et non le montant de la charge : c'est ce qui compose
    // le chiffre du bilan.
    surLaPart: true,
    vide: `Aucune dépense avancée par ${nom} ce mois-ci.`
  });
}

/**
 * Ce qu'une catégorie contient ce mois-ci
 *
 * @param {string} categorie
 * @returns {void}
 */
export function ouvrirDetailCategorie(categorie) {
  if (typeof categorie !== 'string' || !categorie) return;

  const { lignes, total } = detailDeLaCategorie({ ...termesDuMois(), categorie });

  rendre({
    titre: categorie,
    total,
    lignes,
    surLaPart: false,
    vide: `Aucune dépense dans « ${categorie} » ce mois-ci.`
  });
}

/**
 * Une dépense de la liste
 *
 * Sur un détail de payeur, une charge partagée n'est comptée que pour la part
 * avancée. Le dire est indispensable : sans cela le lecteur additionne les
 * montants affichés et ne retombe pas sur le total, ce qui fait douter du
 * total plutôt que de la liste.
 *
 * @param {Object} entree - Ligne rendue par `utils/detail.js`
 * @param {boolean} surLaPart
 * @returns {string} Fragment HTML échappé
 */
function ligneDetail(entree, surLaPart) {
  const montant = surLaPart ? entree.part : entree.amount;

  // `dateDeLaCharge`, comme partout ailleurs : une charge antérieure au champ
  // « date » (2026-08-23) n'a que son `timestamp`, et le repli l'affiche à sa
  // date d'écriture. Sans lui, la modale TRIAIT par ce repli — `trierParDate`
  // le fait — mais n'affichait rien : les lignes paraissaient dans un ordre
  // arbitraire, sans un mot pour l'expliquer.
  const jour = dateDeLaCharge(entree);
  const quand = jour ? formatDate(jour) : '';
  // Sur un détail de payeur, la catégorie situe la dépense ; sur un détail de
  // catégorie, c'est le payeur qui manque. On donne celui qui n'est pas connu
  // d'avance par le titre.
  const situe = surLaPart
    ? (entree.category || 'Sans catégorie')
    : formatPaidBy(entree.paidBy);

  const partielle = surLaPart && entree.partielle
    ? `<span class="detail-part">part de ${formatCurrency(entree.amount)}</span>`
    : '';

  // La quatrième surface de la même grammaire, par la même fabrique.
  //
  // La modale disait déjà la PARTIALITÉ d'une ligne — « part de 1 000,00 € » —
  // sans jamais dire la RÈGLE qui l'a produite. C'est pourtant ici que la
  // question se pose : on vient d'ouvrir un total pour comprendre d'où il sort,
  // et une charge en 50/50 dans un foyer au prorata y entre pour 500,00 € là où
  // la règle commune en donnerait 750,00. Les deux mentions se complètent, elles
  // ne se remplacent pas.
  //
  // `detail.js` pousse la charge ENTIÈRE dans la ligne : `splitOverride` est
  // déjà là, rien n'est relu ni recalculé. Et le prédicat est celui des trois
  // autres surfaces — « la charge porte un `splitOverride` » — y compris sur un
  // détail de catégorie, où le montant est plein : le faire dépendre de
  // `surLaPart` donnerait deux réponses pour la même charge selon le chiffre
  // par lequel on l'a ouverte.
  const repartition = libelleDeLaRepartition(entree.splitOverride);
  const splitTag = repartition
    ? `<span class="charge-split-tag">${escapeHtml(repartition)}</span>`
    : '';

  return `
    <div class="detail-ligne">
      <div class="detail-ligne-titre">
        ${escapeHtml(entree.description || 'Sans description')}
        ${entree.fixe ? '<span class="charge-nature-tag">fixe</span>' : ''}
        ${splitTag}
      </div>
      <div class="detail-ligne-info">
        ${escapeHtml([quand, situe].filter(Boolean).join(' · '))}
      </div>
      <div class="detail-ligne-montant">
        ${formatCurrency(montant)}
        ${partielle}
      </div>
    </div>
  `;
}

/**
 * Peint la modale et l'ouvre
 *
 * @param {Object} vue
 * @returns {void}
 */
function rendre({ titre, total, lignes, surLaPart, vide }) {
  let modal = document.getElementById(ID);

  if (!modal) {
    modal = document.createElement('div');
    modal.id = ID;
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'detailDepensesTitre');
    document.body.appendChild(modal);

    // Le clic sur le voile ferme. `initModals` ne branche que les modales
    // présentes au démarrage : celle-ci naît plus tard, elle se branche donc
    // elle-même. Échap, lui, cherche la modale active au moment de la frappe
    // et fonctionne sans rien ajouter.
    modal.addEventListener('click', evenement => {
      if (evenement.target === modal) closeModal(ID, false);
    });
  }

  const periode = getState('currentPeriod');
  const nombre = lignes.length;

  modal.innerHTML = `
    <div class="modal detail-vue">
      <h2 class="modal-header" id="detailDepensesTitre">${escapeHtml(titre)}</h2>

      <div class="detail-total">
        <div class="detail-total-montant">${formatCurrency(total)}</div>
        <div class="detail-total-info">
          ${nombre} dépense${nombre > 1 ? 's' : ''}${periode ? ` · ${escapeHtml(formatPeriod(periode))}` : ''}
        </div>
      </div>

      <div class="detail-lignes">
        ${nombre === 0
          ? `<p class="empty-state">${escapeHtml(vide)}</p>`
          : lignes.map(entree => ligneDetail(entree, surLaPart)).join('')}
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="detailDepensesFermer">Fermer</button>
      </div>
    </div>
  `;

  modal.querySelector('#detailDepensesFermer')
    .addEventListener('click', () => closeModal(ID, false));

  // `showModal` pose le piège à focus : sans lui, la tabulation sortirait de la
  // modale par-dessous, dans une page qu'un voile rend pourtant inaccessible.
  showModal(ID);
}
