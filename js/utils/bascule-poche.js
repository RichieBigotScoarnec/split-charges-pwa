/**
 * Changer une charge de poche : la question qu'on pose avant de le faire
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE GESTE SE DEMANDE, QUAND AUCUN AUTRE NE SE DEMANDE
 *
 * Éditer une charge ne demande rien, et c'est juste : corriger un montant ou un
 * libellé ne change que ce qu'on voit. Cocher ou décocher « perso », depuis le
 * lot P1b, change la POCHE — donc le chemin en base, donc qui a le droit de
 * lire la dépense.
 *
 * Le sens qui coûte est **décocher** : la charge quitte la poche personnelle
 * pour le commun, et devient lisible par l'autre. Une case décochée par mégarde
 * PUBLIE une dépense, et rien à l'écran ne le dirait — la liste s'allonge d'une
 * ligne chez l'autre, c'est tout.
 *
 * L'autre sens coûte moins, mais il coûte : la charge disparaît de la liste que
 * l'autre regarde, et le solde ne bouge pas pour autant — une charge personnelle
 * n'a jamais pesé dessus. Le dire évite de chercher où elle est passée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE SEULE RÉDACTION POUR LES DEUX LISTES
 *
 * Les charges fixes et variables posent la même question. Deux rédactions
 * divergeraient au premier correctif — et la moins à jour serait celle qui
 * décrit mal une frontière de confidentialité.
 */

import { formatCurrency } from './format.js';
import { memberLabel } from './members.js';

/**
 * La question à poser avant de changer une charge de poche
 *
 * @param {Object} params
 * @param {boolean} params.versLePersonnel - `true` si la charge devient personnelle
 * @param {string} params.autre - Emplacement de l'autre personne du foyer
 * @param {Object} params.members - Table des prénoms, telle que l'état la porte
 * @param {string} [params.description] - Libellé de la charge
 * @param {number} [params.montant]
 * @returns {string} Question complète, prête pour la modale de confirmation
 */
export function questionDeBascule({ versLePersonnel, autre, members, description, montant }) {
  const nom = memberLabel(autre, members);
  const libelle = description && String(description).trim()
    ? `« ${String(description).trim()} »`
    : 'cette charge';
  const chiffre = Number.isFinite(montant) ? ` (${formatCurrency(montant)})` : '';

  if (versLePersonnel) {
    return `Rendre ${libelle}${chiffre} personnelle ? Elle quittera la liste `
      + `commune : ${nom} ne la verra plus. Le solde ne change pas — une dépense `
      + 'personnelle n\'y a jamais pesé.';
  }

  return `Rendre ${libelle}${chiffre} commune ? Elle deviendra VISIBLE par `
    + `${nom}, et entrera dans le partage. C'est la seule façon pour elle de `
    + 'sortir de votre poche personnelle.';
}
