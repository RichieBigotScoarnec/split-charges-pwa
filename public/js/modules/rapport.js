// ===== MODULE : LE MOIS ÉCOULÉ, EN UNE PAGE =====
//
// L'application savait déjà tout ce qu'il faut pour dire comment un mois s'est
// passé. Elle ne le disait nulle part d'un seul tenant : le total est dans le
// bilan, l'écart au mois ordinaire dans les tendances, le taux d'effort dans un
// troisième panneau. Sous 900 px, ces trois écrans sont deux onglets et une
// modale — la synthèse se faisait de tête.
//
// ## Ce que ce module ne fait pas
//
// Il ne calcule RIEN. `utils/rapport-mensuel.js` compose des chiffres déjà
// produits par `computeSummary` et `tendances.js`, et ce module les peint. La
// tentation était d'additionner ici « ce serait plus simple » : c'est
// exactement ce qu'ont fait `normalizePair` et `resolveShareMode` avant de
// diverger de l'écran qu'ils étaient censés expliquer.
//
// ## Ce qu'il tait
//
// Chaque case peut manquer. Sans trois mois révolus il n'y a pas de « mois
// ordinaire » ; sans revenus, pas de taux d'effort. Une case absente est OMISE,
// jamais rendue par un tiret ou un zéro : un rapport qui aligne des zéros se
// lit comme un rapport en panne.

import { getState } from '../state.js';
import { showModal, closeModal } from '../components/modal.js';
import { escapeHtml, formatCurrency } from '../utils/format.js';
import { formatPeriod } from '../utils/date.js';
import { memberLabel } from '../utils/members.js';
import { log } from '../utils/debug.js';

/** Identifiant de la modale, créée à la première ouverture */
const ID = 'modalRapportMensuel';

/**
 * Initialise le module
 * @returns {void}
 */
export function initRapport() {
  window.ouvrirRapportDuMois = ouvrirRapportDuMois;
  log('📄 Rapport mensuel initialisé');
}

/**
 * Ouvre le rapport du mois affiché
 *
 * Le rapport est déposé dans l'état par `calculateSummary`, qui seul dispose
 * du bilan et de l'historique dans le même geste. Sans lui — bilan calculé
 * sans instantané —, le bouton n'est pas rendu : on n'arrive donc ici que
 * lorsqu'il y a quelque chose à montrer.
 *
 * @returns {void}
 */
export function ouvrirRapportDuMois() {
  const rapport = getState('rapportDuMois');
  if (!rapport) return;

  rendre(rapport);
}

/**
 * Un chiffre et son étiquette
 *
 * Rend une chaîne vide si la valeur manque : la case disparaît de la grille au
 * lieu d'y occuper une place vide.
 *
 * @param {string} etiquette
 * @param {string|null} valeur - Déjà formatée, ou `null` si indisponible
 * @param {string} [precision] - Ce sur quoi le chiffre porte
 * @returns {string} Fragment HTML échappé
 */
function caseChiffre(etiquette, valeur, precision = '') {
  if (valeur === null) return '';

  return `
    <div class="rapport-case">
      <div class="rapport-case-valeur">${escapeHtml(valeur)}</div>
      <div class="rapport-case-etiquette">${escapeHtml(etiquette)}</div>
      ${precision ? `<div class="rapport-case-precision">${escapeHtml(precision)}</div>` : ''}
    </div>
  `;
}

/**
 * La comparaison au mois ordinaire
 *
 * « Ordinaire » est la MÉDIANE des mois révolus, jamais leur moyenne : un mois
 * exceptionnel déplacerait la moyenne, et c'est justement lui qu'on cherche à
 * situer. Le dire à l'écran évite qu'on prenne le repère pour un budget.
 *
 * @param {Object} rapport
 * @returns {string} Fragment HTML échappé, ou chaîne vide
 */
function comparaison(rapport) {
  if (rapport.ordinaire === null) {
    return `<p class="rapport-comparaison rapport-comparaison--muette">
      Il faut trois mois révolus pour dire si celui-ci sort de l'ordinaire.
    </p>`;
  }

  const ecart = rapport.ecart;
  // Un écart de moins d'un euro n'est pas un écart : le dire ferait passer un
  // mois identique pour un mois qui a bougé.
  const sens = Math.abs(ecart) < 1 ? 'egal' : (ecart > 0 ? 'hausse' : 'baisse');

  const phrase = sens === 'egal'
    ? 'Un mois comme les autres'
    : `${formatCurrency(Math.abs(ecart))} de ${sens === 'hausse' ? 'plus' : 'moins'} qu'un mois ordinaire`;

  return `
    <p class="rapport-comparaison rapport-comparaison--${sens}">
      <span class="rapport-comparaison-phrase">${escapeHtml(phrase)}</span>
      <span class="rapport-comparaison-fonde">un mois ordinaire coûte ${escapeHtml(formatCurrency(rapport.ordinaire))}, médiane des mois précédents</span>
    </p>
  `;
}

/**
 * La catégorie qui a le plus bougé
 *
 * Dans un sens ou dans l'autre : une dépense qui disparaît est une variation,
 * et souvent la plus parlante des deux.
 *
 * @param {Object} rapport
 * @returns {string} Fragment HTML échappé, ou chaîne vide
 */
function ceQuiABouge(rapport) {
  if (!rapport.categorieQuiABouge) return '';

  const { categorie, variation } = rapport.categorieQuiABouge;
  const monte = variation > 0;

  return `
    <div class="rapport-bloc">
      <h3 class="rapport-bloc-titre">Ce qui a le plus bougé</h3>
      <p class="rapport-bouge rapport-bouge--${monte ? 'hausse' : 'baisse'}">
        <strong>${escapeHtml(categorie)}</strong>
        ${monte ? '+' : '−'}${escapeHtml(formatCurrency(Math.abs(variation)))}
        <span class="rapport-bouge-fonde">par rapport à ${escapeHtml(formatPeriod(rapport.comparee))}</span>
      </p>
    </div>
  `;
}

/**
 * Le solde du mois, dit avec les prénoms du foyer
 *
 * @param {Object} rapport
 * @returns {string} Fragment HTML échappé, ou chaîne vide
 */
function soldeDuMois(rapport) {
  if (rapport.solde === null) return '';

  if (rapport.soldeRegle) {
    return `<p class="rapport-solde rapport-solde--regle">Le mois est équilibré : personne ne doit rien.</p>`;
  }

  const membres = getState('members');
  // Un solde positif signifie que la conjointe doit — même convention que le
  // bilan, dont ce chiffre vient directement.
  const phrase = rapport.solde > 0
    ? `${memberLabel('conjointe', membres)} doit ${formatCurrency(rapport.solde)}`
    : `Vous devez ${formatCurrency(Math.abs(rapport.solde))} à ${memberLabel('conjointe', membres)}`;

  return `<p class="rapport-solde">${escapeHtml(phrase)}</p>`;
}

/**
 * Peint la modale et l'ouvre
 *
 * @param {Object} rapport - Sortie de `rapportDuMois`
 * @returns {void}
 */
function rendre(rapport) {
  let modal = document.getElementById(ID);

  if (!modal) {
    modal = document.createElement('div');
    modal.id = ID;
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'rapportTitre');
    document.body.appendChild(modal);

    // Le clic sur le voile ferme. `initModals` ne branche que les modales
    // présentes au démarrage : celle-ci naît plus tard, elle se branche donc
    // elle-même.
    modal.addEventListener('click', evenement => {
      if (evenement.target === modal) closeModal(ID, false);
    });
  }

  const titre = `Rapport — ${formatPeriod(rapport.mois)}`;

  const corps = rapport.vide
    ? `<p class="empty-state">Rien n'a été saisi ce mois-ci : il n'y a pas encore de quoi faire un rapport.</p>`
    : `
      <div class="rapport-tete">
        <div class="rapport-total">${escapeHtml(formatCurrency(rapport.total))}</div>
        <div class="rapport-total-info">
          ${rapport.nombre} dépense${rapport.nombre > 1 ? 's' : ''} du foyer
        </div>
      </div>

      ${comparaison(rapport)}
      ${soldeDuMois(rapport)}

      <div class="rapport-grille">
        ${caseChiffre(
          'Taux d\'effort',
          rapport.tauxDEffort === null ? null : `${rapport.tauxDEffort.toFixed(1)} %`,
          'des revenus du foyer'
        )}
        ${caseChiffre(
          'Reste à vivre',
          rapport.resteAVivre === null ? null : formatCurrency(rapport.resteAVivre),
          'revenus moins charges'
        )}
        ${caseChiffre(
          'Part du fixe',
          rapport.partFixe === null ? null : `${rapport.partFixe.toFixed(0)} %`,
          'charges fixes sur le total'
        )}
      </div>

      ${ceQuiABouge(rapport)}
    `;

  modal.innerHTML = `
    <div class="modal rapport-vue">
      <h2 class="modal-header" id="rapportTitre">${escapeHtml(titre)}</h2>
      ${corps}
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="rapportFermer">Fermer</button>
      </div>
    </div>
  `;

  modal.querySelector('#rapportFermer')
    .addEventListener('click', () => closeModal(ID, false));

  // `showModal` pose le piège à focus : sans lui, la tabulation sortirait de la
  // modale par-dessous, dans une page qu'un voile rend pourtant inaccessible.
  showModal(ID);
}
