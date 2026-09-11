/**
 * FairSplit — Ce que la tête du bilan dit, selon la portée
 *
 * ─────────────────────────────────────────────────────────────────────
 * LA PROPRIÉTÉ : LA TÊTE PORTE LE LIBELLÉ DE LA PORTÉE COURANTE
 *
 * Trois portées, trois têtes — et UNE fabrique. La forme tentante était de
 * rédiger chaque tête dans sa branche de rendu : trois gabarits, trois façons
 * de poser un libellé, et le jour où l'un change, les deux autres gardent
 * l'ancien. C'est la règle 2 appliquée à un libellé. Le rendu lit ce
 * descripteur ; il ne rédige rien.
 *
 * Ce que chaque portée met en tête, et c'est la décision des six planches
 * (`CLAUDE.md`, *Design* — la révocation du 2026-09-10) :
 *
 *   À deux — la CRÉANCE, en ambre : « Tu dois 66,94 € à Cindy » ;
 *   Solo   — un total personnel, en encre neutre : personne ne doit rien à
 *            personne dessus ;
 *   Privé  — AUCUN chiffre : une phrase.
 *
 * ─────────────────────────────────────────────────────────────────────
 * « TU », ET QUI EST « TU »
 *
 * La phrase est dite à la personne qui tient le téléphone. `moi` est
 * l'emplacement du compte connecté — `emplacementCourant`, posé par `auth.js`
 * depuis l'adresse du compte. « Tu dois 66,94 € à Cindy » affiché sur le
 * téléphone de Cindy serait faux ; c'est pourquoi le sens vient de
 * `describeBalance`, par l'emplacement du débiteur, et jamais d'un signe relu
 * ici — une seconde lecture de la convention finirait par la contredire.
 *
 * Aucun DOM, aucune base : ce module répond, le rendu affiche.
 */

import { PORTEES, porteeRetenue } from './portee.js';

/** Le libellé de chaque tête, relevé sur les planches 4 et 5 de `mobile.html` */
const LIBELLES = Object.freeze({
  [PORTEES.DEUX]: 'Solde du mois',
  [PORTEES.SOLO]: 'Mes dépenses solo',
  [PORTEES.PRIVE]: 'Mon espace privé'
});

/**
 * Le libellé qui ouvre la tête, pour une portée
 *
 * Une portée inconnue retombe sur « À deux » par `porteeRetenue` — jamais sur
 * « Privé », pour la raison écrite dans `utils/portee.js`.
 *
 * @param {*} portee
 * @returns {string}
 */
export function libelleDeTete(portee) {
  return LIBELLES[porteeRetenue(portee)];
}

/**
 * Ce que la tête du bilan affiche
 *
 * @param {Object} p
 * @param {*} p.portee - La portée courante
 * @param {Object} p.solde - Sortie de `describeBalance` pour le solde du mois
 * @param {number} p.montant - Le solde du mois, signé
 * @param {'vous'|'conjointe'} p.moi - L'emplacement du compte connecté, normalisé
 * @param {number} p.totalSolo - Mes dépenses solo du mois
 * @param {string} p.autre - Le prénom de l'autre personne du foyer
 * @returns {{portee: string, libelle: string, ton: string, avant: string,
 *   montant: number|null, apres: string, note: string}}
 *   `ton` vaut `creance`, `equilibre`, `neutre` ou `aucun-chiffre` ; les textes
 *   sont BRUTS, à échapper par l'appelant.
 */
export function teteDuBilan({ portee, solde, montant, moi, totalSolo, autre }) {
  const retenue = porteeRetenue(portee);
  const base = { portee: retenue, libelle: LIBELLES[retenue] };

  if (retenue === PORTEES.PRIVE) {
    // « Cindy voit un total. Jamais ce que tu as acheté. » est la phrase de la
    // planche — et elle n'est vraie que d'UN des trois réglages de partage. La
    // tête est rendue avant que l'espace privé ne soit lu : elle ne peut dire
    // que ce qui est vrai des trois. Le réglage réel est affiché juste dessous.
    return {
      ...base,
      ton: 'aucun-chiffre',
      avant: `Ce que ${autre} en voit, c'est toi qui le décides.`,
      montant: null,
      apres: '',
      note: 'Hors du solde. Le serveur refuse à tout autre compte ce que tu n\'as pas ouvert.'
    };
  }

  if (retenue === PORTEES.SOLO) {
    return {
      ...base,
      ton: 'neutre',
      avant: '',
      montant: totalSolo,
      apres: '',
      note: 'Ce que tu as payé pour toi seul. Rien de tout cela n\'entre dans le solde : '
        + `personne ne doit rien à personne dessus. Cette liste est visible de ${autre} ; `
        + 'ce qui ne doit pas l\'être va dans Privé.'
    };
  }

  // À deux. À zéro, la tête le DIT : `barre-solde.js` se tait tant que cette
  // carte est à l'écran, et un bilan qui ne porterait plus le solde dans un cas
  // laisserait « Comptes équilibrés » nulle part.
  if (!solde || !solde.emplacementDebiteur) {
    return {
      ...base,
      ton: 'equilibre',
      avant: 'Comptes équilibrés',
      montant: null,
      apres: '',
      note: 'Rien à se rembourser.'
    };
  }

  const jeDois = solde.emplacementDebiteur === moi;
  return {
    ...base,
    ton: 'creance',
    // Le montant est toujours positif : le sens est dans les mots, et un signe
    // moins devant une dette se lirait comme une dette négative.
    avant: jeDois ? 'Tu dois' : `${solde.debiteur} te doit`,
    montant: Math.abs(montant),
    apres: jeDois ? `à ${solde.crediteur}` : '',
    note: ''
  };
}
