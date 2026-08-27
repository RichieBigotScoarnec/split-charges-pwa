// ===== MODULE : DÉPENSES PRIVÉES ET AVAL =====
//
// Le périmètre « solo » sort une dépense du solde. Il ne la rend pas privée :
// les deux comptes lisent tout `household`, et une dépense perso s'y affiche
// avec son montant et son libellé.
//
// Ce module ouvre le second axe. Une dépense privée vit dans `/prive/{qui}`,
// dont les règles réservent la lecture à son seul propriétaire — le refus vient
// du serveur, pas d'un drapeau. L'écriture, elle, exige l'aval de l'autre, et
// **personne ne peut se l'accorder** : la règle de `/aval/{qui}` demande d'être
// l'autre. Rejoué contre le moteur réel, 22 contrôles dans les deux sens.
//
// Ce que l'autre voit : un total et un compte, jamais un libellé. Et ce total
// est déclaratif — aucune règle ne peut vérifier la somme de ce qu'elle n'a pas
// le droit de lire. C'est inhérent au choix « détail privé, total public », et
// l'écran le dit.

import { getState } from '../state.js';
import { toast } from '../components/toast.js';
import { escapeHtml, formatCurrency } from '../utils/format.js';
import { log, error as logError } from '../utils/debug.js';
import { dateDuJour, formatDate } from '../utils/date.js';
import { normaliserEmplacement, memberLabel } from '../utils/members.js';
import {
  emplacementOppose,
  normaliserAval,
  normaliserDepensesPrivees,
  depensesActives,
  resumePublie,
  resumeLu,
  depensePriveeEcrivable
} from '../utils/confidentialite.js';

/**
 * Les trois racines, hors de `household` et non par commodité
 *
 * `.write` **cascade** dans les règles Firebase : une règle profonde peut
 * élargir un accès, jamais le restreindre. Sous `household`, dont l'écriture
 * est ouverte aux deux comptes, il aurait été impossible d'exiger d'être
 * l'autre pour accorder un aval — l'autorisation du foyer aurait déjà tout
 * ouvert avant qu'on arrive au nœud. D'où trois racines, chacune avec une seule
 * classe d'écrivain.
 */
const RACINE_PRIVE = 'prive';
const RACINE_AVAL = 'aval';
const RACINE_TOTAUX = 'totauxPrives';

/** L'emplacement du compte connecté */
function moi() {
  return normaliserEmplacement(getState('emplacementCourant'));
}

/** Le prénom de l'autre, ou son libellé par défaut */
function prenomDeLAutre() {
  const autre = emplacementOppose(moi());
  if (!autre) return 'l\'autre personne';
  // `memberLabel` retombe déjà sur le libellé par défaut quand aucun prénom
  // n'est saisi : inutile de refaire ce repli ici, il divergerait.
  return memberLabel(autre, getState('members'));
}

/**
 * Lit tout ce que l'écran doit montrer, en une passe
 *
 * Quatre lectures, dont deux que le serveur peut refuser sans que ce soit une
 * erreur : `/prive/{autre}` est illisible par construction, et on ne le demande
 * donc jamais. Ce qu'on demande de l'autre, c'est son résumé publié.
 *
 * @returns {Promise<Object|null>} Null si la lecture échoue
 */
async function lireLEtat() {
  const emplacement = moi();
  const autre = emplacementOppose(emplacement);
  const periode = getState('currentPeriod');

  if (!emplacement || !autre || !periode) return null;

  try {
    const { dbGetAbsolu } = await import('../db.js');

    const [monAval, avalDeLAutre, mesDepenses, sonResume] = await Promise.all([
      // L'aval qu'on m'a accordé, et celui que j'ai accordé : l'écran montre
      // les deux, parce qu'un pacte se lit dans les deux sens.
      dbGetAbsolu(`${RACINE_AVAL}/${emplacement}`),
      dbGetAbsolu(`${RACINE_AVAL}/${autre}`),
      dbGetAbsolu(`${RACINE_PRIVE}/${emplacement}/periods/${periode}/depenses`),
      dbGetAbsolu(`${RACINE_TOTAUX}/${autre}/${periode}`)
    ]);

    return {
      emplacement,
      autre,
      periode,
      monAval: normaliserAval(monAval),
      avalDeLAutre: normaliserAval(avalDeLAutre),
      mesDepenses: normaliserDepensesPrivees(mesDepenses),
      sonResume: resumeLu(sonResume)
    };
  } catch (erreur) {
    logError('❌ Lecture de l\'espace privé impossible :', erreur);
    return null;
  }
}

/**
 * Publie le total du mois, le seul chiffre qui franchit le mur
 *
 * Appelée après chaque écriture. Un total qui traîne d'un état précédent
 * mentirait à l'autre sans que rien ne le signale — et c'est le seul repère
 * qu'elle ait.
 *
 * @param {string} emplacement
 * @param {string} periode
 * @param {Array<Object>} depenses
 * @returns {Promise<void>}
 */
async function publierLeTotal(emplacement, periode, depenses) {
  try {
    const { dbSetAbsolu } = await import('../db.js');
    await dbSetAbsolu(`${RACINE_TOTAUX}/${emplacement}/${periode}`, resumePublie(depenses));
  } catch (erreur) {
    // L'échec ne doit pas faire croire que la dépense n'est pas enregistrée :
    // elle l'est. Seul le chiffre annoncé à l'autre est en retard.
    logError('❌ Publication du total impossible :', erreur);
    toast.error('Dépense enregistrée, mais le total annoncé n\'a pas pu être mis à jour');
  }
}

/**
 * Ouvre l'écran des dépenses privées
 * @returns {Promise<void>}
 */
async function showPrivateExpensesModal() {
  const etat = await lireLEtat();
  if (!etat) {
    toast.error('Espace privé illisible — réessayez');
    return;
  }

  let modal = document.getElementById('modalPrive');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalPrive';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'priveTitre');
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal prive-modal">
      <h2 class="modal-header" id="priveTitre">🔒 Dépenses privées</h2>

      ${blocAvals(etat)}
      ${blocSaisie(etat)}
      ${blocMesDepenses(etat)}
      ${blocSonTotal(etat)}

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="priveFermer">Fermer</button>
      </div>
    </div>
  `;

  brancherLEcran(modal, etat);

  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('active'));
}

/**
 * L'état des deux avals, et la bascule pour celui qu'on donne
 *
 * On ne peut agir que sur celui qu'on **accorde** : le sien se reçoit, il ne se
 * prend pas. C'est la règle serveur, et l'écran ne propose donc rien d'autre.
 *
 * @param {Object} etat
 * @returns {string} Fragment échappé
 */
function blocAvals(etat) {
  const prenom = prenomDeLAutre();

  const recu = etat.monAval.actif
    ? `<span class="prive-aval-etat prive-aval-etat--actif">accordé</span> par ${escapeHtml(prenom)}`
    : `<span class="prive-aval-etat">non accordé</span> — ${escapeHtml(prenom)} ne vous l'a pas donné`;

  const donne = etat.avalDeLAutre.actif ? 'accordé' : 'non accordé';

  return `
    <div class="prive-avals">
      <div class="prive-aval">
        <div class="prive-aval-titre">Votre accord</div>
        <div class="prive-aval-detail">${recu}</div>
      </div>

      <div class="prive-aval">
        <div class="prive-aval-titre">L'accord que vous donnez à ${escapeHtml(prenom)}</div>
        <div class="prive-aval-ligne">
          <span class="prive-aval-detail">${escapeHtml(donne)}</span>
          <label class="toggle-switch">
            <input type="checkbox" id="priveAvalDonne"${etat.avalDeLAutre.actif ? ' checked' : ''}
                   aria-label="Accorder à ${escapeHtml(prenom)} le droit aux dépenses privées">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <p class="form-aide">Personne ne peut s'accorder cet aval à soi-même : c'est la base de données qui refuse, pas cet écran. Le retirer empêche les saisies futures et n'ouvre jamais celles déjà faites.</p>
    </div>
  `;
}

/**
 * Le formulaire de saisie, ou l'explication de son absence
 *
 * @param {Object} etat
 * @returns {string} Fragment échappé
 */
function blocSaisie(etat) {
  if (!etat.monAval.actif) {
    return `<p class="empty-state">Tant que ${escapeHtml(prenomDeLAutre())} ne vous a pas accordé cet aval, vous ne pouvez pas enregistrer de dépense privée. La base de données les refuserait.</p>`;
  }

  return `
    <div class="prive-saisie">
      <div class="prive-saisie-ligne">
        <label class="sr-only" for="priveMontant">Montant</label>
        <input type="text" id="priveMontant" placeholder="Ex : 45" inputmode="decimal" maxlength="10" />

        <label class="sr-only" for="priveDescription">Description</label>
        <input type="text" id="priveDescription" placeholder="Description (facultative)" maxlength="60" />
      </div>
      <div class="prive-saisie-ligne">
        <label class="sr-only" for="priveDate">Date</label>
        <input type="date" id="priveDate" value="${escapeHtml(dateDuJour())}" />

        <button type="button" class="btn btn-primary btn-sm" id="priveAjouter">Enregistrer</button>
      </div>
    </div>
  `;
}

/**
 * Mes dépenses privées du mois
 *
 * @param {Object} etat
 * @returns {string} Fragment échappé
 */
function blocMesDepenses(etat) {
  const actives = depensesActives(etat.mesDepenses);
  const resume = resumePublie(etat.mesDepenses);

  const lignes = actives.length === 0
    ? '<p class="empty-state">Aucune dépense privée ce mois-ci.</p>'
    : actives.map(ligneDepensePrivee).join('');

  return `
    <div class="prive-liste">
      <h3 class="prive-sous-titre">
        Ce mois-ci
        <span class="prive-total">${formatCurrency(resume.montant)}</span>
      </h3>
      ${lignes}
      <p class="form-aide">C'est ce total — et le nombre de dépenses — que ${escapeHtml(prenomDeLAutre())} voit. Jamais les libellés.</p>
    </div>
  `;
}

/**
 * Une ligne de dépense privée
 *
 * @param {Object} depense
 * @returns {string} Fragment échappé
 */
function ligneDepensePrivee(depense) {
  const quand = depense.date ? formatDate(depense.date) : '';

  return `
    <div class="prive-depense">
      <div class="prive-depense-info">
        <span class="prive-depense-titre">${escapeHtml(depense.description || 'Sans description')}</span>
        ${quand ? `<span class="prive-depense-date">${escapeHtml(quand)}</span>` : ''}
      </div>
      <span class="prive-depense-montant">${formatCurrency(depense.montant)}</span>
      <button type="button" class="btn-icon btn-delete prive-retirer"
              data-depense="${escapeHtml(depense.id)}"
              aria-label="Supprimer ${escapeHtml(depense.description || 'cette dépense')}">✕</button>
    </div>
  `;
}

/**
 * Ce que l'autre a publié — un total, jamais un détail
 *
 * L'absence de publication n'est pas « zéro dépense privée » : c'est « on n'en
 * sait rien ». L'écran se tait plutôt que d'affirmer.
 *
 * @param {Object} etat
 * @returns {string} Fragment échappé
 */
function blocSonTotal(etat) {
  const prenom = prenomDeLAutre();

  if (!etat.avalDeLAutre.actif) {
    return `<div class="prive-autre"><p class="empty-state">Vous n'avez pas accordé cet aval à ${escapeHtml(prenom)}.</p></div>`;
  }

  if (!etat.sonResume.publie) {
    return `<div class="prive-autre"><p class="empty-state">${escapeHtml(prenom)} n'a rien publié pour ce mois. Cela ne veut pas dire qu'il n'y a rien : seulement qu'on n'en sait rien.</p></div>`;
  }

  const compte = `${etat.sonResume.nombre} dépense${etat.sonResume.nombre > 1 ? 's' : ''}`;

  return `
    <div class="prive-autre">
      <h3 class="prive-sous-titre">
        Côté ${escapeHtml(prenom)}
        <span class="prive-total">${formatCurrency(etat.sonResume.montant)}</span>
      </h3>
      <p class="form-aide">${escapeHtml(compte)} ce mois-ci. Ce chiffre est déclaré par son application : aucune règle ne peut le vérifier sans lire ce qu'elle n'a pas le droit de lire.</p>
    </div>
  `;
}

/**
 * Branche les commandes de l'écran
 *
 * Le balisage est reconstruit à chaque ouverture : les écouteurs meurent avec
 * lui, il n'y a rien à retirer.
 *
 * @param {HTMLElement} modal
 * @param {Object} etat
 * @returns {void}
 */
function brancherLEcran(modal, etat) {
  modal.querySelector('#priveFermer').addEventListener('click', () => {
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  });

  // L'aval qu'on accorde à l'autre. Écrit sous SON emplacement : c'est bien son
  // droit à elle qu'on ouvre, et la règle serveur exige que ce soit nous qui
  // l'écrivions.
  const bascule = modal.querySelector('#priveAvalDonne');
  bascule?.addEventListener('change', async () => {
    const actif = bascule.checked;
    try {
      const { dbSetAbsolu } = await import('../db.js');
      await dbSetAbsolu(`${RACINE_AVAL}/${etat.autre}`, {
        actif,
        accordeLe: Date.now(),
        accordePar: etat.emplacement
      });
    } catch (erreur) {
      logError('❌ Écriture de l\'aval impossible :', erreur);
      toast.error('Accord non enregistré');
      bascule.checked = !actif;
      return;
    }

    toast.success(actif
      ? `Accord donné à ${prenomDeLAutre()}`
      : `Accord retiré — les dépenses déjà enregistrées restent illisibles pour vous`);
    await showPrivateExpensesModal();
  });

  const bouton = modal.querySelector('#priveAjouter');
  if (bouton) {
    const champMontant = modal.querySelector('#priveMontant');

    const enregistrer = async () => {
      const verdict = depensePriveeEcrivable(champMontant.value, etat.monAval);
      if (!verdict.valide) {
        toast.error(verdict.erreur);
        champMontant.focus();
        return;
      }

      const chemin = `${RACINE_PRIVE}/${etat.emplacement}/periods/${etat.periode}/depenses`;

      try {
        const { dbPushAbsolu, dbGetAbsolu } = await import('../db.js');
        await dbPushAbsolu(chemin, {
          montant: verdict.montant,
          description: modal.querySelector('#priveDescription').value.trim().slice(0, 200),
          category: '',
          date: modal.querySelector('#priveDate').value || '',
          timestamp: Date.now(),
          deleted: false
        });

        // Le total est republié depuis la base, et non depuis l'état affiché :
        // l'autre appareil a pu écrire entre-temps, et un total calculé sur une
        // liste périmée annoncerait un chiffre faux.
        await publierLeTotal(etat.emplacement, etat.periode,
          normaliserDepensesPrivees(await dbGetAbsolu(chemin)));
      } catch (erreur) {
        logError('❌ Dépense privée non enregistrée :', erreur);
        toast.error('Dépense non enregistrée');
        return;
      }

      toast.success('Dépense privée enregistrée');
      await showPrivateExpensesModal();
    };

    bouton.addEventListener('click', enregistrer);
    champMontant.addEventListener('keydown', evenement => {
      if (evenement.key !== 'Enter') return;
      evenement.preventDefault();
      modal.querySelector('#priveDescription').focus();
    });
  }

  modal.querySelectorAll('.prive-retirer').forEach(croix => {
    croix.addEventListener('click', async () => {
      const id = croix.dataset.depense;
      if (!id) return;

      const chemin = `${RACINE_PRIVE}/${etat.emplacement}/periods/${etat.periode}/depenses`;

      try {
        const { dbUpdateAbsolu, dbGetAbsolu } = await import('../db.js');
        // Suppression douce, comme partout ailleurs.
        await dbUpdateAbsolu(`${chemin}/${id}`, { deleted: true });
        await publierLeTotal(etat.emplacement, etat.periode,
          normaliserDepensesPrivees(await dbGetAbsolu(chemin)));
      } catch (erreur) {
        logError('❌ Suppression impossible :', erreur);
        toast.error('Suppression non enregistrée');
        return;
      }

      toast.success('Dépense supprimée');
      await showPrivateExpensesModal();
    });
  });
}

/**
 * Initialise le module
 * @returns {void}
 */
export function initPrive() {
  log('📦 Module dépenses privées initialisé');
}

window.showPrivateExpensesModal = showPrivateExpensesModal;
export { showPrivateExpensesModal };
