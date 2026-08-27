// ===== MODULE : DÉPENSES PRIVÉES =====
//
// Le périmètre « solo » sort une dépense du solde. Il ne la rend pas privée :
// les deux comptes lisent tout `household`, et une dépense perso s'y affiche
// avec son montant et son libellé.
//
// Ce module ouvre le second axe, et il tient sur une phrase :
//
//     Écrire chez soi ne demande rien. Lire chez l'autre demande son accord.
//
// Une dépense privée vit dans `/prive/{qui}`, écrivable par `{qui}` **sans
// aucune condition** : chacun a le droit d'avoir des dépenses à soi sans avoir
// à les mendier. Ce qui se demande, c'est l'accès au détail de l'autre —
// `/prive/{qui}` n'est lisible que par `{qui}`, sauf si `{qui}` a ouvert son
// espace en posant `/aval/{qui}/actif` à vrai.
//
// **Personne ne peut s'accorder l'accès aux données de l'autre** :
// `/aval/{qui}` n'est écrivable que par `{qui}`. Le refus vient du serveur,
// pas de cet écran.
//
// Sans accord, l'autre voit tout de même un total et un compte, jamais un
// libellé. Ce total est déclaratif — aucune règle ne peut vérifier la somme de
// ce qu'elle n'a pas le droit de lire. C'est inhérent au choix « détail privé,
// total public », et l'écran le dit.

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
 * `.read` comme `.write` **cascadent** dans les règles Firebase : une règle
 * profonde peut élargir un accès, jamais le restreindre. Sous `household`,
 * dont la lecture est ouverte aux deux comptes, il aurait été impossible de
 * réserver `/prive/{qui}` à son propriétaire — l'autorisation du foyer aurait
 * déjà tout ouvert avant qu'on arrive au nœud, et « privé » n'aurait jamais
 * rien voulu dire. D'où trois racines, chacune avec ses propres accès.
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
 * Lit tout ce que l'écran doit montrer
 *
 * Deux passes, et il le faut. La première lit ce qui est toujours lisible :
 * les deux avals, mes dépenses, le total publié par l'autre. La seconde ne
 * part **que** si l'autre m'a ouvert son espace — sinon le serveur refuserait,
 * et un refus attendu dans un `Promise.all` ferait échouer l'écran entier
 * alors que tout va bien.
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

    const [monPartage, sonPartage, mesDepenses, sonResume] = await Promise.all([
      // Ce que **j'ouvre** à l'autre, et ce que l'autre **m'ouvre** : l'écran
      // montre les deux, parce qu'un accord se lit dans les deux sens et
      // qu'aucun des deux n'oblige l'autre.
      dbGetAbsolu(`${RACINE_AVAL}/${emplacement}`),
      dbGetAbsolu(`${RACINE_AVAL}/${autre}`),
      dbGetAbsolu(`${RACINE_PRIVE}/${emplacement}/periods/${periode}/depenses`),
      dbGetAbsolu(`${RACINE_TOTAUX}/${autre}/${periode}`)
    ]);

    const etat = {
      emplacement,
      autre,
      periode,
      monPartage: normaliserAval(monPartage),
      sonPartage: normaliserAval(sonPartage),
      mesDepenses: normaliserDepensesPrivees(mesDepenses),
      sonResume: resumeLu(sonResume),
      sesDepenses: null
    };

    if (etat.sonPartage.actif) {
      try {
        etat.sesDepenses = normaliserDepensesPrivees(
          await dbGetAbsolu(`${RACINE_PRIVE}/${autre}/periods/${periode}/depenses`));
      } catch (erreur) {
        // L'accord vient peut-être d'être retiré depuis l'autre appareil. Le
        // détail retombe alors sur le total publié, sans faire échouer l'écran.
        logError('❌ Détail de l\'autre illisible malgré l\'accord :', erreur);
      }
    }

    return etat;
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

      ${blocPartage(etat)}
      ${blocSaisie(etat)}
      ${blocMesDepenses(etat)}
      ${blocSonCote(etat)}

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
 * Les deux accords : celui qu'on donne, celui qu'on reçoit
 *
 * On ne peut agir que sur le sien — ouvrir **ses** dépenses à l'autre. Celui
 * qu'on reçoit ne se prend pas : c'est la règle serveur qui l'exige, pas une
 * politesse d'interface. Les deux sont affichés parce qu'un accord se lit dans
 * les deux sens, et qu'aucun des deux n'oblige l'autre : ouvrir ne donne aucun
 * droit sur l'espace d'en face.
 *
 * @param {Object} etat
 * @returns {string} Fragment échappé
 */
function blocPartage(etat) {
  const prenom = prenomDeLAutre();

  const recu = etat.sonPartage.actif
    ? `<span class="prive-aval-etat prive-aval-etat--actif">ouvert</span> — vous voyez le détail de ${escapeHtml(prenom)}`
    : `<span class="prive-aval-etat">fermé</span> — vous ne voyez que son total`;

  return `
    <div class="prive-avals">
      <div class="prive-aval">
        <div class="prive-aval-titre">Ce que vous ouvrez à ${escapeHtml(prenom)}</div>
        <div class="prive-aval-ligne">
          <span class="prive-aval-detail">${etat.monPartage.actif ? 'le détail de vos dépenses privées' : 'votre total seulement'}</span>
          <label class="toggle-switch">
            <input type="checkbox" id="privePartage"${etat.monPartage.actif ? ' checked' : ''}
                   aria-label="Ouvrir le détail de mes dépenses privées à ${escapeHtml(prenom)}">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="prive-aval">
        <div class="prive-aval-titre">Ce que ${escapeHtml(prenom)} vous ouvre</div>
        <div class="prive-aval-detail">${recu}</div>
      </div>

      <p class="form-aide">Vos dépenses privées s'enregistrent librement : personne n'a à les autoriser. C'est l'accès au détail de l'autre qui se demande — et personne ne peut se l'accorder soi-même, c'est la base de données qui refuse.</p>
    </div>
  `;
}

/**
 * Le formulaire de saisie
 *
 * Toujours présent. Une version antérieure le retirait tant que la conjointe
 * n'avait rien accordé : elle demandait la permission d'avoir des dépenses à
 * soi, ce qui inversait le sujet.
 *
 * @param {Object} etat
 * @returns {string} Fragment échappé
 */
function blocSaisie(etat) {
  void etat;

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
      <p class="form-aide">${etat.monPartage.actif
        ? `${escapeHtml(prenomDeLAutre())} voit ce détail : vous le lui avez ouvert.`
        : `${escapeHtml(prenomDeLAutre())} ne voit que ce total et le nombre de dépenses. Jamais les libellés.`}</p>
    </div>
  `;
}

/**
 * Une ligne de dépense privée
 *
 * `modifiable` est faux pour celles de l'autre : la voir ne donne pas le droit
 * de la retirer, et la règle serveur le refuserait de toute façon. Proposer une
 * croix qui échoue serait promettre ce qu'on ne peut pas tenir.
 *
 * @param {Object} depense
 * @param {{modifiable?: boolean}} [options]
 * @returns {string} Fragment échappé
 */
function ligneDepensePrivee(depense, { modifiable = true } = {}) {
  const quand = depense.date ? formatDate(depense.date) : '';

  return `
    <div class="prive-depense">
      <div class="prive-depense-info">
        <span class="prive-depense-titre">${escapeHtml(depense.description || 'Sans description')}</span>
        ${quand ? `<span class="prive-depense-date">${escapeHtml(quand)}</span>` : ''}
      </div>
      <span class="prive-depense-montant">${formatCurrency(depense.montant)}</span>
      ${modifiable ? `<button type="button" class="btn-icon btn-delete prive-retirer"
              data-depense="${escapeHtml(depense.id)}"
              aria-label="Supprimer ${escapeHtml(depense.description || 'cette dépense')}">✕</button>` : ''}
    </div>
  `;
}

/**
 * Côté l'autre : le détail si elle l'a ouvert, le total sinon
 *
 * Les deux cas sont légitimes et l'écran ne fait pas de l'un le brouillon de
 * l'autre. Sans accord, le total publié suffit à savoir de quoi on parle.
 *
 * L'absence de publication n'est pas « zéro dépense privée » : c'est « on n'en
 * sait rien ». L'écran se tait plutôt que d'affirmer.
 *
 * @param {Object} etat
 * @returns {string} Fragment échappé
 */
function blocSonCote(etat) {
  const prenom = prenomDeLAutre();

  // Accès ouvert : on lit le détail, et le total s'en déduit — plus besoin du
  // chiffre déclaré, ni de la réserve qui l'accompagne.
  if (etat.sonPartage.actif && Array.isArray(etat.sesDepenses)) {
    const actives = depensesActives(etat.sesDepenses);
    const resume = resumePublie(etat.sesDepenses);

    return `
      <div class="prive-autre">
        <h3 class="prive-sous-titre">
          Côté ${escapeHtml(prenom)}
          <span class="prive-total">${formatCurrency(resume.montant)}</span>
        </h3>
        ${actives.length === 0
          ? `<p class="empty-state">Aucune dépense privée ce mois-ci.</p>`
          : actives.map(depense => ligneDepensePrivee(depense, { modifiable: false })).join('')}
        <p class="form-aide">${escapeHtml(prenom)} vous a ouvert son détail. Elle peut le refermer quand elle veut.</p>
      </div>
    `;
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
      <p class="form-aide">${escapeHtml(compte)} ce mois-ci, sans le détail : ${escapeHtml(prenom)} ne l'a pas ouvert, et c'est son droit. Ce chiffre est déclaré par son application — aucune règle ne peut le vérifier sans lire ce qu'elle n'a pas le droit de lire.</p>
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

  // L'accès qu'on ouvre sur SES PROPRES dépenses. Écrit sous notre propre
  // emplacement : c'est notre espace qu'on ouvre, et la règle serveur exige
  // que ce soit nous qui l'écrivions. Écrire sous celui de l'autre reviendrait
  // à s'accorder l'accès à ses données — et la base le refuse.
  const bascule = modal.querySelector('#privePartage');
  bascule?.addEventListener('change', async () => {
    const actif = bascule.checked;
    try {
      const { dbSetAbsolu } = await import('../db.js');
      await dbSetAbsolu(`${RACINE_AVAL}/${etat.emplacement}`, {
        actif,
        accordeLe: Date.now(),
        accordePar: etat.emplacement
      });
    } catch (erreur) {
      logError('❌ Écriture de l\'accord impossible :', erreur);
      toast.error('Accord non enregistré');
      bascule.checked = !actif;
      return;
    }

    toast.success(actif
      ? `${prenomDeLAutre()} voit désormais le détail de vos dépenses privées`
      : `Détail refermé — ${prenomDeLAutre()} ne voit plus que votre total`);
    await showPrivateExpensesModal();
  });

  const bouton = modal.querySelector('#priveAjouter');
  if (bouton) {
    const champMontant = modal.querySelector('#priveMontant');

    const enregistrer = async () => {
      const verdict = depensePriveeEcrivable(champMontant.value);
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
