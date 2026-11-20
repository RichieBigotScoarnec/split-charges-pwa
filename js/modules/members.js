// ===== MODULE : PRÉNOMS DES MEMBRES =====
//
// Les données du foyer forment un enregistrement unique à emplacements fixes,
// `vous` et `conjointe`, que les deux comptes lisent. L'écran affichait
// pourtant « Votre salaire » : juste pour l'un, faux pour l'autre. Même
// ambiguïté pour « Conjointe vous doit » et « Vous → Conjointe ».
//
// Les prénoms la lèvent sans toucher au stockage.

import { setState, getState } from '../state.js';
import { toast } from '../components/toast.js';
import { normalizeMembers, validateMemberName, hasCustomName } from '../utils/members.js';
import { log, warn, error as logError } from '../utils/debug.js';

/** Chemin en base — global : les prénoms ne changent pas d'un mois à l'autre */
const MEMBERS_PATH = 'members';

/** Les champs de saisie, et l'emplacement qu'ils nomment */
const CHAMPS = [
  { id: 'prenomVous', cle: 'vous' },
  { id: 'prenomConjointe', cle: 'conjointe' }
];

/**
 * Charge les prénoms et met l'écran à jour
 * @returns {Promise<void>}
 */
export async function initMembers() {
  window.saveMembers = saveMembers;

  try {
    const { dbGet } = await import('../db.js');
    setState('members', normalizeMembers(await dbGet(MEMBERS_PATH)));
  } catch (error) {
    // Sans prénoms lisibles, les libellés d'origine restent en place.
    warn('⚠️ Prénoms illisibles, libellés par défaut :', error);
    setState('members', normalizeMembers(null));
  }

  applyMemberNames();
  log('🙋 Prénoms des membres initialisés');
}

/**
 * Reporte les prénoms sur les libellés fixes de l'écran
 *
 * Ces textes vivent dans le HTML et ne passent par aucune fonction de rendu :
 * il faut les reprendre un à un, sans quoi l'interface mêlerait prénoms et
 * anciens libellés.
 */
export function applyMemberNames() {
  const noms = getState('members') || normalizeMembers(null);

  /** @param {string} id @param {string} texte */
  const ecrire = (id, texte) => {
    const el = document.getElementById(id);
    if (el) el.textContent = texte;
  };

  // Sans prénom choisi, les libellés d'origine restent les plus naturels :
  // « Votre salaire » se lit mieux que « Salaire Vous ».
  const nomme1 = hasCustomName('vous', noms);
  const nomme2 = hasCustomName('conjointe', noms);

  ecrire('labelSalaireVous', nomme1 ? `Salaire ${noms.vous} (€)` : 'Votre salaire (€)');
  ecrire('labelSalaireConjointe', nomme2 ? `Salaire ${noms.conjointe} (€)` : 'Salaire conjointe (€)');
  ecrire('labelRevenusVous', nomme1 ? `Autres revenus ${noms.vous} (€)` : 'Vos autres revenus (€)');
  ecrire('labelRevenusConjointe', nomme2 ? `Autres revenus ${noms.conjointe} (€)` : 'Autres revenus conjointe (€)');
  ecrire('labelPartVous', nomme1 ? `Part ${noms.vous} (%)` : 'Votre part (%)');
  ecrire('labelPartConjointe', nomme2 ? `Part ${noms.conjointe} (%)` : 'Part conjointe (%)');

  // Les libellés de payeur, où qu'ils vivent : les <option> des formulaires
  // complets comme les boutons de la saisie rapide. Le sélecteur ne visait que
  // `option`, si bien qu'un nouveau sélecteur de payeur affichait « Vous » et
  // « Conjointe » à côté d'un écran entièrement nommé.
  document.querySelectorAll('[data-member]').forEach(element => {
    element.textContent = element.dataset.member === 'vous' ? noms.vous : noms.conjointe;
  });
  document.querySelectorAll('option[data-direction]').forEach(option => {
    option.textContent = option.dataset.direction === 'vers-conjointe'
      ? `${noms.vous} → ${noms.conjointe}`
      : `${noms.conjointe} → ${noms.vous}`;
  });

  // Les champs de saisie eux-mêmes
  // Le champ reste vide tant qu'aucun prénom n'est choisi : y écrire « Vous »
  // laisserait croire que c'est une saisie.
  CHAMPS.forEach(({ id, cle }) => {
    const input = document.getElementById(id);
    if (input && document.activeElement !== input) {
      input.value = hasCustomName(cle, noms) ? noms[cle] : '';
    }
  });
}

/**
 * Enregistre les prénoms saisis
 *
 * Un champ vide rétablit le libellé d'origine plutôt que d'imposer une saisie.
 *
 * @param {string} _valeur - Valeur transmise par la délégation, inutilisée
 * @param {HTMLElement} [element] - Champ à l'origine du changement
 * @returns {Promise<void>}
 */
export async function saveMembers(_valeur, element = null) {
  // La délégation `data-on-change` transmet la valeur et l'élément, jamais la
  // clé : on la déduit de l'identifiant du champ.
  const cleModifiee = CHAMPS.find(c => c.id === element?.id)?.cle ?? null;

  const saisis = {};

  for (const { id, cle } of CHAMPS) {
    const brut = document.getElementById(id)?.value ?? '';
    const verdict = validateMemberName(brut);
    if (!verdict.valid) {
      toast.error(verdict.error);
      applyMemberNames();
      return;
    }
    saisis[cle] = brut.trim();
  }

  const noms = normalizeMembers(saisis);

  try {
    // N'écrire que le prénom modifié : réécrire les deux d'un bloc effaçait
    // la saisie simultanée de l'autre personne, comme le faisaient les
    // salaires.
    const { dbUpdate } = await import('../db.js');
    await dbUpdate(MEMBERS_PATH, cleModifiee ? { [cleModifiee]: saisis[cleModifiee] } : saisis);
    setState('members', noms);

    applyMemberNames();

    // Le bilan et les listes portent aussi ces noms : les repeindre.
    const { calculateSummary } = await import('./summary.js');
    calculateSummary();
    const { renderReimbursements } = await import('./reimbursements.js');
    renderReimbursements();
    const { renderVariableCharges } = await import('./variable-charges.js');
    renderVariableCharges();
    const { renderFixedCharges } = await import('./fixed-charges.js');
    renderFixedCharges();

    toast.success('Prénoms enregistrés');
  } catch (error) {
    logError('❌ Erreur enregistrement des prénoms :', error);
    toast.error('Enregistrement impossible');
  }
}
