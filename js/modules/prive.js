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
import { priveDisponible } from '../db.js';
import { toast } from '../components/toast.js';
import { escapeHtml, formatCurrency } from '../utils/format.js';
import { log, error as logError } from '../utils/debug.js';
import { dateDuJour, formatDate } from '../utils/date.js';
import { normaliserEmplacement, memberLabel } from '../utils/members.js';
import { teteDuBilan, gabaritDeTete } from '../utils/tete-du-bilan.js';
import { PORTEES } from '../utils/portee.js';
import {
  emplacementOppose,
  normaliserAval,
  normaliserDepensesPrivees,
  depensesActives,
  resumePublie,
  resumeLu,
  depensePriveeEcrivable,
  posturePartage,
  ecrituresDeLaPosture
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
    const { dbSetAbsolu, dbGetAbsolu } = await import('../db.js');

    // La posture est RELUE en base, jamais reprise de l'écran : l'autre
    // appareil a pu la refermer entre-temps, et republier alors rouvrirait un
    // partage que son propriétaire croit clos.
    const posture = posturePartage(await dbGetAbsolu(`${RACINE_AVAL}/${emplacement}`));

    // « Rien » retire le total au lieu d'en écrire un. Sans cela, le réglage ne
    // tiendrait pas une seule saisie : la dépense suivante républierait, et
    // l'écran annoncerait une fermeture démentie par la base.
    await dbSetAbsolu(`${RACINE_TOTAUX}/${emplacement}/${periode}`,
      posture === 'rien' ? null : resumePublie(depenses));
  } catch (erreur) {
    // L'échec ne doit pas faire croire que la dépense n'est pas enregistrée :
    // elle l'est. Seul le chiffre annoncé à l'autre est en retard.
    logError('❌ Publication du total impossible :', erreur);
    toast.error('Dépense enregistrée, mais le total annoncé n\'a pas pu être mis à jour');
  }
}

/**
 * L'espace privé, rendu dans le panneau du bilan
 *
 * ─────────────────────────────────────────────────────────────────────
 * C'ÉTAIT UNE MODALE, ET ELLE EST PARTIE — 2026-09-08
 *
 * `showPrivateExpensesModal` ouvrait une couche par-dessus l'écran. Le
 * sélecteur de portée offrait par ailleurs un segment « Privé » qui ne
 * gouvernait rien. Garder les deux aurait donné **deux surfaces pour le même
 * espace**, et ce n'aurait pas été un simple désaccord d'étiquette comme celui
 * des deux sélecteurs : la modale et la vue lisent la base séparément, donc un
 * partage refermé dans l'une serait resté ouvert dans l'autre. Une divergence
 * sur une frontière de confidentialité coûte plus cher qu'un chiffre affiché
 * deux fois.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LE REMPLISSAGE EST ASYNCHRONE, LE PANNEAU NE L'EST PAS
 *
 * `calculateSummary` est synchrone et écrit tout son panneau d'un coup ; la
 * lecture du privé demande quatre appels à la base. Le panneau pose donc un
 * conteneur vide, et cette fonction le remplit quand elle sait. C'est
 * exactement ce que fait déjà `resume-prive.js` pour son montant masqué.
 *
 * Le conteneur est relu à chaque fois plutôt que retenu : entre deux appels,
 * `calculateSummary` a pu réécrire le panneau, et un nœud gardé en mémoire
 * serait détaché — on écrirait dans un fragment que personne ne voit.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QU'ELLE DIT QUAND LE PRIVÉ N'EST PAS DE CE MONDE-CI
 *
 * Un privé vide dans le bac à sable est indiscernable d'un privé réel qui n'a
 * rien ce mois-ci. C'est une absence qui se lit comme une présence sans
 * contenu — et surtout, elle INVITE À SAISIR : on croit essayer dans un espace
 * jetable, et la garde de `db.js` refusera l'écriture après coup. Le refus
 * arrive donc avant la saisie, et il porte sa raison.
 *
 * Il ne porte AUCUN CHAMP : une explication qui laisse le formulaire ouvert
 * n'empêche rien, et `prive-bac-a-sable.spec.js` tient les deux moitiés
 * séparément — la phrase, et l'absence de saisie.
 *
 * Et il n'a plus de bouton « Fermer ». Il en portait un quand il était une
 * modale ; une vue ne se referme pas — on en sort en choisissant une autre
 * portée, et le sélecteur est juste au-dessus.
 *
 * @returns {Promise<void>}
 */
export async function remplirLePanneauPrive() {
  const conteneur = document.getElementById('resumePanneauPrive');
  if (!conteneur) return;

  // Le bac à sable n'a pas d'espace privé, et ne touche pas au vrai.
  //
  // La garde dure vit dans `db.js`, sur les quatre accès absolus : c'est elle
  // qui empêche toute lecture et toute écriture, et aucun appelant ne peut la
  // contourner. Ce qui suit ne protège rien — il EXPLIQUE.
  //
  // Sans ce bloc, la lecture rejetait, `lireLEtat` rendait `null`, et l'écran
  // annonçait « Espace privé illisible — réessayez ». Deux fois faux : ce n'est
  // pas illisible, et réessayer ne changera rien. Un refus qui se déguise en
  // panne fait chercher une cause qui n'existe pas.
  if (!priveDisponible()) {
    // Le littéral est écrit ICI plutôt que dans une constante ou une fonction :
    // `tools/plafond-innerhtml.mjs` compte un site d'injection dès qu'il ne
    // peut pas LIRE ce qui est assigné, et le plafond est à 24 avec marge
    // nulle, à dessein. Ce texte n'interpole rien ; la règle doit pouvoir le
    // constater elle-même.
    conteneur.innerHTML = `
    <p class="empty-state">Le bac à sable ne donne pas accès à l'espace privé : le privé vit hors de l'espace d'essai, et rien n'y est ni lu ni écrit ici.</p>

    <p class="form-aide">Vos dépenses privées réelles sont intactes, et elles le restent — elles vous attendent hors du bac à sable.</p>
  `;
    return;
  }

  const etat = await lireLEtat();
  if (!etat) {
    conteneur.innerHTML = '<p class="empty-state">Espace privé illisible — revenez dans un instant.</p>';
    toast.error('Espace privé illisible — réessayez');
    return;
  }

  // Le conteneur est relu ICI, après l'attente : le panneau a pu être réécrit
  // pendant la lecture — un changement de mois, une charge ajoutée — et le nœud
  // d'avant serait alors détaché.
  const cible = document.getElementById('resumePanneauPrive');
  if (!cible) return;

  // La tête d'abord — le titre qui dit la règle, puis les deux faces de la
  // permission —, ensuite ce qu'on fait ici : saisir, relire ses dépenses.
  cible.innerHTML = `
    ${teteDuPrive(etat)}
    ${blocSaisie(etat)}
    ${blocMesDepenses(etat)}
  `;

  brancherLEcran(cible, etat);
}

/**
 * La tête du privé : un titre qui dit la règle, puis les deux faces
 *
 * ─────────────────────────────────────────────────────────────────────
 * PAS DE HÉROS CHIFFRÉ — lot D, 2026-09-11, planche 13
 *
 * La portée vit en mémoire vive pour qu'un rechargement ne rouvre pas cet
 * écran ; un grand chiffre en tête défait cette protection. Le titre vient de
 * `teteDuBilan`, la fabrique des trois têtes, selon ce que l'autre peut
 * RÉELLEMENT lire — la posture relue en base, jamais supposée.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠️ DETTE ÉCRITE, PAS OUBLI : la tête Privé n'affiche pas de rappel du
 * réglage de partage tant que la commande vit sur le même écran.
 *
 * La planche 13 met dans la première face un rappel en lecture seule —
 * « Un total, et un nombre · Réglable dans Réglages · Changer ». Il suppose la
 * commande AILLEURS, dans Réglages. Elle n'y est pas encore : la première face
 * EST donc la commande elle-même, telle quelle, et il n'y a rien à rappeler.
 * Afficher les deux ferait deux fois la même chose à 300 px d'écart. Le rappel
 * arrive avec le déplacement de la commande vers Réglages, au lot suivant.
 *
 * @param {Object} etat
 * @returns {string} Fragment échappé
 */
function teteDuPrive(etat) {
  const tete = teteDuBilan({
    portee: PORTEES.PRIVE,
    posture: posturePartage(etat.monPartage),
    autre: prenomDeLAutre()
  });

  return gabaritDeTete(tete, {
    suite: `<div class="prive-faces">${faceDeMoi(etat)}${faceDeLAutre(etat)}</div>`
  });
}

/**
 * Première face : ce que JE partage — la commande, telle quelle
 *
 * On ne peut agir que sur le sien — ouvrir **ses** dépenses à l'autre. Celui
 * qu'on reçoit ne se prend pas : c'est la règle serveur qui l'exige, pas une
 * politesse d'interface. Il vit dans la seconde face.
 *
 * @param {Object} etat
 * @returns {string} Fragment échappé
 */
function faceDeMoi(etat) {
  const prenom = prenomDeLAutre();

  // Deux drapeaux en base, une seule échelle à l'écran : ouvrir le détail sans
  // publier le total n'aurait pas de sens, puisque le détail contient le total.
  const posture = posturePartage(etat.monPartage);

  const cran = (valeur, libelle) => `
    <button type="button" class="prive-posture-cran${posture === valeur ? ' prive-posture-cran--actif' : ''}"
            data-posture="${valeur}" aria-pressed="${posture === valeur}">${escapeHtml(libelle)}</button>`;

  // La portée diffère d'un cran à l'autre, et le taire tromperait : le total se
  // publie mois par mois, l'aval est une permission de lecture GLOBALE. Ouvrir
  // le détail n'ouvre pas « ce mois-ci », mais tout l'espace.
  const aide = {
    rien: `${escapeHtml(prenom)} ne voit rien de ce mois — et son écran ne dit pas qu'il est vide, seulement qu'il n'en sait rien. Les mois déjà publiés gardent leur total : elle les a vus, les réécrire après coup serait réécrire ce qu'elle a lu.`,
    total: `${escapeHtml(prenom)} voit un montant et un nombre de dépenses, mois par mois. Jamais un libellé.`,
    detail: `${escapeHtml(prenom)} peut lire les libellés, et de TOUS les mois — l'accord est une permission de lecture sur l'espace entier, pas sur celui-ci. Révocable à tout moment.`
  }[posture];

  return `
    <div class="prive-face prive-avals">
      <div class="prive-aval">
        <div class="prive-aval-titre">Ce que vous partagez avec ${escapeHtml(prenom)}</div>
        <div class="prive-posture" role="group"
             aria-label="Ce que vous partagez avec ${escapeHtml(prenom)}">
          ${cran('rien', 'Rien')}
          ${cran('total', 'Total seul')}
          ${cran('detail', 'Total + détail')}
        </div>
        <p class="form-aide">${aide}</p>
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
      ${sousTitrePrive('Ce mois-ci',
        `<span class="prive-total">${formatCurrency(resume.montant)}</span>`)}
      ${lignes}
      <p class="form-aide">${etat.monPartage.actif
        ? `${escapeHtml(prenomDeLAutre())} voit ce détail : vous le lui avez ouvert.`
        : `${escapeHtml(prenomDeLAutre())} ne voit que ce total et le nombre de dépenses. Jamais les libellés.`}</p>
    </div>
  `;
}

/**
 * Le sous-titre d'un bloc : un intitulé à gauche, un montant à droite
 *
 * ── UNE SEULE FABRIQUE POUR LES TROIS, ET C'EST LA RAISON DE SON EXISTENCE ──
 *
 * Trois sous-titres portaient ce gabarit, écrit trois fois : « Ce mois-ci »,
 * « Côté X » avec accord, « Côté X » sans. Deux d'entre eux portent un PRÉNOM,
 * et c'est là que la copie coûtait.
 *
 * ── POURQUOI L'INTITULÉ EST ENVELOPPÉ ──
 *
 * `.prive-sous-titre` est un conteneur flex. L'intitulé y était un nœud de
 * texte nu, donc un élément de flex ANONYME — auquel aucune règle CSS ne peut
 * s'adresser. Il ne pouvait ni rétrécir ni se tronquer, et un prénom de
 * 30 caractères insécables — la limite que `#prenomVous` laisse saisir —
 * faisait **déborder le sous-titre de 106 px à 320 px**. Défaut antérieur à ce
 * lot, et mesuré : la réserve ajoutée à côté du chiffre le portait à 153.
 *
 * Enveloppé, il devient un élément nommé : il rétrécit, et se tronque par des
 * points de suspension plutôt que de pousser le chiffre hors de l'écran. Le
 * montant, lui, ne se tronque jamais — `flex-shrink: 0` : un prénom abrégé
 * reste lisible, un montant abrégé serait faux.
 *
 * @param {string} intitule - Déjà échappé par l'appelant
 * @param {string} montant - Fragment HTML du montant, déjà construit
 * @returns {string} Fragment échappé
 */
function sousTitrePrive(intitule, montant) {
  return `
    <h3 class="prive-sous-titre">
      <span class="prive-sous-titre-nom">${intitule}</span>
      ${montant}
    </h3>`;
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
 * Seconde face : ce que l'AUTRE m'ouvre — dans ses trois états (planche 14)
 *
 * Les états ne sont pas des brouillons l'un de l'autre, et chacun dit ce qu'il
 * est, sous un repère qui le nomme :
 *
 *   Ouvert             — le détail, lu ligne par ligne : le total s'en déduit,
 *                        il n'est plus déclaratif ;
 *   Fermé, total publié — le total et sa réserve, dans la même ligne ;
 *   Rien publié        — la carte se TAIT. L'absence de publication n'est pas
 *                        « zéro dépense privée » : c'est « on n'en sait rien »,
 *                        et 0,00 € affirmerait ce qu'on ne sait pas.
 *
 * Elle réunit ce qui vivait en deux endroits — la ligne « fermé / ouvert » de
 * l'ancien bloc des accords, et le bloc « Côté X » en bas de l'écran. Les
 * garder séparés aurait dit l'état de l'accord à un endroit et son effet à
 * un autre.
 *
 * @param {Object} etat
 * @returns {string} Fragment échappé
 */
function faceDeLAutre(etat) {
  const prenom = prenomDeLAutre();
  const entete = (etatAccord, libelle, nom) => `
        <div class="prive-aval-titre">Ce que ${escapeHtml(prenom)} vous ouvre</div>
        <div class="prive-face-entete">
          <span class="prive-face-etat prive-face-etat--${etatAccord}">${libelle}</span>
          <span class="prive-face-nom">${nom}</span>
        </div>`;

  // Accès ouvert : on lit le détail, et le total s'en déduit — plus besoin du
  // chiffre déclaré, ni de la réserve qui l'accompagne.
  if (etat.sonPartage.actif && Array.isArray(etat.sesDepenses)) {
    const actives = depensesActives(etat.sesDepenses);
    const resume = resumePublie(etat.sesDepenses);

    return `
      <div class="prive-face prive-autre">
        ${entete('ouvert', 'Ouvert', 'Son détail')}
        ${sousTitrePrive(`Côté ${escapeHtml(prenom)}`,
          `<span class="prive-total">${formatCurrency(resume.montant)}</span>`)}
        ${actives.length === 0
          ? `<p class="empty-state">Aucune dépense privée ce mois-ci.</p>`
          : actives.map(depense => ligneDepensePrivee(depense, { modifiable: false })).join('')}
        <p class="form-aide">${escapeHtml(prenom)} vous a ouvert son détail : ce total est lu ligne par ligne, il n'est plus déclaratif. Elle peut le refermer quand elle veut.</p>
      </div>
    `;
  }

  if (!etat.sonResume.publie) {
    return `
      <div class="prive-face prive-autre">
        ${entete('rien', 'Rien', 'On n\'en sait rien')}
        <p class="empty-state">${escapeHtml(prenom)} n'a rien publié pour ce mois. Cela ne veut pas dire qu'il n'y a rien : seulement qu'on n'en sait rien.</p>
      </div>
    `;
  }

  const compte = `${etat.sonResume.nombre} dépense${etat.sonResume.nombre > 1 ? 's' : ''}`;

  // ── LA RÉSERVE ENTRE DANS LA LIGNE DU CHIFFRE — 2026-09-08 ──
  //
  // Elle vivait dans le seul paragraphe ci-dessous, à 4 px sous le montant,
  // dans le même bloc. C'était insuffisant, et mesuré insuffisant : **le bord
  // de l'écran passait entre les deux.** Sur un balayage complet du défilement,
  // une position tous les 20 px, le montant se lisait SEUL dans 7 des 8
  // configurations de largeur et de longueur éprouvées — à 320 comme à 390 px.
  //
  // Quelqu'un qui lit « 340,00 € » sans sa réserve le prend pour un chiffre
  // vérifié. Aucune règle ne peut le vérifier : le serveur n'a pas le droit de
  // lire ce dont il faudrait faire la somme.
  //
  // Le remède n'est pas de remonter le bloc — ça ne dirait rien des autres
  // positions de défilement, et ça ferait ouvrir l'écran privé sur le total de
  // quelqu'un d'autre. C'est de rendre le couple INDIVISIBLE : le mot entre
  // dans la même boîte de ligne que le chiffre, en `nowrap`. Un bord d'écran
  // ne peut plus passer entre les deux sans couper le chiffre lui-même.
  //
  // La phrase entière reste dessous : le mot signale, la phrase explique.
  // Mesuré : à 320 px le sous-titre passe de une à deux lignes (24 → 42 px),
  // sans rien rogner ; à 390 il tient sur une seule.
  return `
    <div class="prive-face prive-autre">
      ${entete('ferme', 'Fermé', 'Son total seulement')}
      ${sousTitrePrive(`Côté ${escapeHtml(prenom)}`,
        `<span class="prive-total">${formatCurrency(etat.sonResume.montant)} <span class="prive-declare">déclaré</span></span>`)}
      <p class="form-aide"><strong class="prive-declaratif">Chiffre déclaratif.</strong> ${escapeHtml(compte)} ce mois-ci, sans le détail : ${escapeHtml(prenom)} ne l'a pas ouvert, et c'est son droit. Ce chiffre est déclaré par son application — aucune règle ne peut le vérifier sans lire ce qu'elle n'a pas le droit de lire.</p>
    </div>
  `;
}

/**
 * Branche les commandes de l'écran
 *
 * Le balisage est reconstruit à chaque rendu : les écouteurs meurent avec lui,
 * il n'y a rien à retirer.
 *
 * @param {HTMLElement} ecran - Le conteneur de la vue
 * @param {Object} etat
 * @returns {void}
 */
function brancherLEcran(modal, etat) {

  // L'accès qu'on ouvre sur SES PROPRES dépenses. Écrit sous notre propre
  // emplacement : c'est notre espace qu'on ouvre, et la règle serveur exige
  // que ce soit nous qui l'écrivions. Écrire sous celui de l'autre reviendrait
  // à s'accorder l'accès à ses données — et la base le refuse.
  const annonces = {
    rien: prenom => `Partage fermé — ${prenom} ne voit plus rien de ce mois`,
    total: prenom => `${prenom} voit désormais votre total, jamais les libellés`,
    detail: prenom => `${prenom} voit désormais le détail de vos dépenses privées`
  };

  modal.querySelectorAll('.prive-posture-cran').forEach(cran => {
    cran.addEventListener('click', async () => {
      const voulue = cran.dataset.posture;
      const ecritures = ecrituresDeLaPosture(voulue, etat.emplacement);
      // Une valeur que le modèle ne connaît pas n'écrit rien : mieux vaut un
      // bouton inerte qu'un partage choisi au hasard.
      if (!ecritures) return;

      try {
        const { dbSetAbsolu, dbGetAbsolu } = await import('../db.js');

        // Les deux drapeaux partent ensemble, en une écriture : séparés, un
        // échec entre les deux laisserait une base dans un état que l'échelle
        // ne sait pas afficher.
        await dbSetAbsolu(`${RACINE_AVAL}/${etat.emplacement}`, ecritures.aval);

        // Le mois affiché est aligné aussitôt. `publierLeTotal` relit la posture
        // qu'on vient d'écrire : elle publie ou retire, sans qu'on ait à le lui
        // redire ici.
        const chemin = `${RACINE_PRIVE}/${etat.emplacement}/periods/${etat.periode}/depenses`;
        await publierLeTotal(etat.emplacement, etat.periode,
          normaliserDepensesPrivees(await dbGetAbsolu(chemin)));
      } catch (erreur) {
        logError('❌ Écriture du partage impossible :', erreur);
        toast.error('Partage non enregistré');
        return;
      }

      toast.success(annonces[voulue](prenomDeLAutre()));
      await remplirLePanneauPrive();
    });
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
      await remplirLePanneauPrive();
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
      await remplirLePanneauPrive();
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
