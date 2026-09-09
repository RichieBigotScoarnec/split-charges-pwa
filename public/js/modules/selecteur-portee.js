/**
 * FairSplit — Le sélecteur de portée
 *
 * Trois segments sous le bandeau : « À deux », « Moi », « Privé ». Ils disent
 * sur quel argent l'écran porte, et ils vivent dans `panneauBilan` et
 * `panneauCharges` — **jamais dans `panneauReglages`**, dont les réglages sont
 * ceux du foyer et ne changent pas selon la portée. Le raisonnement est dans
 * `utils/portee.js`, et c'est `panneauPorteLaPortee` qui l'applique : cette
 * liste n'est pas recopiée ici.
 *
 * ## Une seule fabrique, deux panneaux
 *
 * Le balisage est construit ici, une fois, et inséré dans les deux panneaux.
 * L'écrire deux fois dans `FairSplit.html` aurait été plus court le premier
 * jour et aurait divergé au correctif suivant — une copie ne se dégrade pas
 * d'un coup, elle se dégrade au correctif que personne ne reporte.
 *
 * ## Un attribut propre, et pas `data-action`
 *
 * `utils/onglets.js` a tranché exactement ce cas, et son raisonnement est écrit
 * en tête de ce fichier-là : la délégation d'`init.js` résout un nom de
 * fonction sur `window` depuis un attribut du DOM, surface qu'une liste blanche
 * borne précisément ; un onglet « n'a pas besoin de cette
 * puissance ». Un segment de portée non plus — il désigne une valeur
 * d'énumération, que `porteeValide` vérifie avant qu'on agisse. Rien n'entre
 * dans la liste blanche, donc rien de plus n'est atteignable par une injection
 * HTML.
 *
 * Ce raisonnement n'est pas recopié : il est cité, et il vit là-bas.
 *
 * ## La portée est un FILTRE, pas une destination
 *
 * Aucune couche n'est empilée. `utils/onglets.js` en empile une parce qu'un
 * onglet est une **destination** : on y va, et le geste retour doit ramener
 * d'où l'on vient. Une portée ne se quitte pas — elle change ce que l'écran
 * montre, comme un mois, et changer de mois n'empile rien non plus.
 *
 * Empiler ici rendrait le geste retour **inerte pendant autant d'appuis qu'on
 * a comparé de portées**, ce qui est exactement la punition que le lot des
 * onglets a supprimée. `retour-arriere.spec.js` tient « dix allers-retours
 * d'onglet ne coûtent qu'UN retour » ; `portee-selecteur.spec.js` tient son
 * frère, « dix changements de portée ne coûtent AUCUN retour ».
 *
 * ## CE SÉLECTEUR EST LA SEULE COMMANDE DE PORTÉE — 2026-09-08
 *
 * Il ne l'a pas toujours été, et c'est le défaut que ce module a créé sans le
 * voir. Le résumé portait déjà sa propre bascule — « À deux » / « Moi ce
 * mois-ci » — qui écrivait `ongletDuResume`, une variable de module de
 * `summary.js`. Deux commandes, deux états, une seule grandeur : la règle 2,
 * dans sa forme la moins visible.
 *
 * Le lot du sélecteur a mesuré ce qu'il COÛTAIT — sa hauteur, son budget à
 * 320 px, sa cible tactile — et jamais ce qu'il DOUBLAIT. **Une commande est
 * une fabrique elle aussi** : avant d'en ajouter une, chercher qui gouverne
 * déjà cette grandeur.
 *
 * La bascule du résumé a donc été retirée, et `basculerResume` a quitté la
 * liste blanche d'`init.js`. Ce qu'elle portait de nécessaire a suivi ici :
 * le REPÈRE de solde (`marquerLeSoldeDu`), sans lequel passer au suivi
 * personnel ferait disparaître une dette de tout l'écran.
 *
 * `tests/e2e/portee-unique.spec.js` tient la propriété — « l'écran ne montre
 * jamais deux portées différentes en même temps » — sans nommer ni ce module
 * ni celui d'en face : elle survivra à la prochaine commande qu'on ajoutera.
 *
 * ## Ce que ce module ne fait pas ENCORE
 *
 * La portée « Privé » ne change pas encore l'écran : elle rend le panneau du
 * foyer, comme avant. « À deux » et « Moi » gouvernent, elles, le résumé.
 * C'est une dette assumée et bornée au lot suivant.
 */

import { setState, getState } from '../state.js';
import { PORTEES, porteeValide, panneauPorteLaPortee, porteeRetenue } from '../utils/portee.js';
import { log, warn } from '../utils/debug.js';

/** Les panneaux candidats. `panneauPorteLaPortee` tranche, pas cette liste. */
const PANNEAUX = ['panneauBilan', 'panneauCharges', 'panneauReglages'];

/**
 * Les trois segments, dans l'ordre où on les lit
 *
 * Les libellés sont ici et nulle part ailleurs : un intitulé recopié dans le
 * HTML et dans le JS finit par ne plus dire la même chose.
 *
 * ── « MOI CE MOIS », ET LA MESURE QUI L'A TRANCHÉ ──
 *
 * Le libellé vient de la bascule que ce sélecteur remplace, qui disait « Moi
 * ce mois-ci » : « Moi » seul ne dit pas que la vue porte sur UN mois, et le
 * mois est précisément ce que le bandeau juste au-dessus vient d'annoncer.
 *
 * Il est raccourci d'un mot, et c'est mesuré, pas supposé. À 320 px les trois
 * segments se partagent 99 px chacun (`flex: 1`) :
 *
 *     « Moi »             tient
 *     « Moi ce mois »     tient
 *     « Moi ce mois-ci »  ROGNÉ — `white-space: nowrap`, il déborde
 *
 * Et raccourcir « À deux » ne rendrait rien : les segments se partagent la
 * rangée en parts égales quel que soit leur contenu.
 */
const SEGMENTS = [
  { portee: PORTEES.DEUX, libelle: 'À deux' },
  { portee: PORTEES.SOLO, libelle: 'Moi ce mois' },
  { portee: PORTEES.PRIVE, libelle: 'Privé' }
];

/** Le segment qui porte le repère de solde : celui du foyer, seul à en avoir un. */
const PORTEE_DU_SOLDE = PORTEES.DEUX;

/**
 * Fabrique un sélecteur, prêt à être inséré
 *
 * `role="radiogroup"` et non `tablist` : les trois segments ne mènent nulle
 * part, ils choisissent une valeur. Et `aria-checked` porte l'état actif — la
 * couleur seule ne suffirait pas, WCAG 1.4.1, le même raisonnement que
 * `aria-current` sur la barre d'onglets.
 *
 * @returns {HTMLElement}
 */
function fabriquerSelecteur() {
  const groupe = document.createElement('div');
  groupe.className = 'portee';
  groupe.setAttribute('role', 'radiogroup');
  groupe.setAttribute('aria-label', 'Sur quel argent l\'écran porte');

  for (const { portee, libelle } of SEGMENTS) {
    const segment = document.createElement('button');
    segment.type = 'button';
    segment.className = 'portee-segment';
    segment.setAttribute('role', 'radio');
    segment.dataset.portee = portee;
    // `textContent` et non `innerHTML` : ces libellés sont écrits ici, mais le
    // réflexe se garde là où il ne coûte rien.
    segment.textContent = libelle;

    // Le repère est posé une fois, masqué, plutôt que créé et détruit à chaque
    // rendu : `marquerLeSoldeDu` n'a alors qu'un attribut à basculer, et il ne
    // peut pas en poser deux.
    if (portee === PORTEE_DU_SOLDE) {
      const repere = document.createElement('span');
      repere.className = 'portee-repere';
      repere.setAttribute('aria-label', 'solde à régler');
      repere.textContent = '•';
      repere.hidden = true;
      segment.appendChild(repere);
    }

    groupe.appendChild(segment);
  }

  return groupe;
}

/**
 * Dit — ou tait — qu'un solde reste dû
 *
 * ── POURQUOI CE REPÈRE EXISTE, ET POURQUOI IL A CHANGÉ DE SURFACE ──
 *
 * La propriété qu'il tient n'a pas bougé d'un mot : **le solde reste visible
 * depuis la portée personnelle.** Sans lui, choisir « Moi ce mois » ferait
 * disparaître une dette de tout l'écran — le panneau du foyer n'est plus
 * rendu, et la barre collante ne parle que du panneau qu'elle surplombe.
 *
 * Ce qui a bougé est la SURFACE : il vivait sur l'onglet « À deux » du résumé,
 * il vit maintenant sur le segment du même nom. C'est le seul déplacement que
 * la fusion des deux commandes imposait.
 *
 * ── LE CALCUL RESTE CHEZ CELUI QUI SAIT ──
 *
 * Ce module ne calcule aucun solde et ne doit jamais commencer : `summary.js`
 * en a un, et deux fabriques d'une même grandeur finissent toujours par
 * diverger. Il reçoit un booléen déjà décidé.
 *
 * Sans sélecteur rendu — un contrôle unitaire qui pose `#summarySection` seul
 * — l'appel ne fait rien plutôt que de lever : le repère est un ornement du
 * sélecteur, pas une condition du bilan.
 *
 * @param {boolean} soldeDu - Reste-t-il quelque chose à régler ce mois-ci ?
 * @returns {void}
 */
export function marquerLeSoldeDu(soldeDu) {
  for (const repere of document.querySelectorAll('.portee-repere')) {
    repere.hidden = !soldeDu;
  }
}

/**
 * Peint l'état actif dans tous les sélecteurs rendus
 *
 * L'état est lu, jamais déduit du clic : un segment peint depuis le geste et
 * un état écrit à côté sont deux sources de la même grandeur, et elles
 * finissent par se contredire. C'est le défaut `normalizePair`, et il coûte
 * plus cher sur une vue que sur un total — l'écran montrerait le solo en
 * annonçant « à deux ».
 *
 * Exportée sous le nom `peindreLaPortee` : c'est le seul moyen de vérifier
 * qu'un segment ne se peint pas depuis le clic. Un contrôle qui écrit l'état
 * puis demande la peinture mesure exactement la dépendance qu'on veut tenir.
 *
 * @returns {void}
 */
export function peindreLaPortee() {
  const active = porteeRetenue(getState('porteeCourante'));

  for (const segment of document.querySelectorAll('[data-portee]')) {
    segment.setAttribute('aria-checked', String(segment.dataset.portee === active));
  }
}

/**
 * Applique une portée demandée
 *
 * ── L'IMPORT EST DYNAMIQUE, ET C'EST CE QUI ÉVITE LE CYCLE ──
 *
 * `summary.js` importe `marquerLeSoldeDu` d'ici, statiquement. Importer
 * `calculateSummary` de là-bas au même titre fermerait la boucle. Le sens qui
 * reste — la commande appelle le rendu — passe donc par `import()`, comme
 * `carry-over.js`, `envelopes.js`, `members.js` et `reconduction.js` le font
 * déjà pour ce même module.
 *
 * Ce module n'a AUCUN registre d'abonnés, et n'en aura pas : `state.js` avait
 * le sien, il n'a jamais eu d'abonné, et il a été retiré. Ici comme ailleurs,
 * celui qui écrit appelle le rendu.
 *
 * @param {string} demandee
 * @returns {void}
 */
function choisirLaPortee(demandee) {
  // Une valeur inconnue ne fait rien du tout, plutôt que de retomber sur « à
  // deux » : ici la demande vient d'un segment que ce module a fabriqué, donc
  // une valeur inconnue signale un balisage forgé, pas un état ancien.
  // `porteeRetenue` a sa place au rendu, où l'entrée est un état ; pas ici.
  if (!porteeValide(demandee)) return;
  if (getState('porteeCourante') === demandee) return;

  setState('porteeCourante', demandee);
  peindreLaPortee();

  // Le rendu suit l'état, il ne le précède pas : le bilan relit
  // `porteeCourante` et décide seul de ce qu'il montre.
  import('./summary.js')
    .then(({ calculateSummary }) => calculateSummary())
    .catch((erreur) => warn('Portée changée, bilan non rafraîchi', erreur));
}

/**
 * Pose les sélecteurs et branche les gestes
 *
 * @returns {void}
 */
export function initSelecteurPortee() {
  // ── LA SEULE ACTION QUE CE MODULE DÉCLARE, ET POURQUOI IL EN FAUT UNE ──
  //
  // Les segments n'en ont pas besoin : ils portent `data-portee`, et l'écouteur
  // est posé sur leur groupe. Mais une commande VIT AILLEURS — la rangée
  // « Gérer mes dépenses privées et le partage », dans le bloc privé du versant
  // personnel — et elle ne peut pas être atteinte par cet écouteur-là.
  //
  // Elle ne pouvait pas non plus disparaître : mesuré, le segment est 415 px
  // plus haut à 320 px une fois qu'on a défilé jusqu'à ce bloc. Elle change
  // donc de destination, et il lui faut un nom déclaré.
  //
  // Élargir l'écouteur à tout `[data-portee]` du document aurait évité la liste
  // blanche, et c'est précisément ce qu'on ne veut pas : n'importe quel balisage
  // injecté porterait alors une commande. Un nom, une entrée, `porteeValide`
  // qui tranche — la surface reste bornée.
  window.allerALaPortee = choisirLaPortee;

  let poses = 0;

  for (const id of PANNEAUX) {
    if (!panneauPorteLaPortee(id)) continue;

    const panneau = document.getElementById(id);
    if (!panneau) continue;
    // Une seconde initialisation ne doit pas poser un second sélecteur :
    // `initializeAppData` rejoue à chaque connexion.
    if (panneau.querySelector('.portee')) continue;

    const selecteur = fabriquerSelecteur();

    // L'écouteur est posé sur le GROUPE, une fois, plutôt que sur chacun des
    // trois : trois écouteurs se rebranchent trois fois, et c'est le genre de
    // détail qui fait exécuter un geste en double.
    selecteur.addEventListener('click', (evenement) => {
      const segment = evenement.target.closest('[data-portee]');
      if (segment && selecteur.contains(segment)) choisirLaPortee(segment.dataset.portee);
    });

    panneau.insertBefore(selecteur, panneau.firstChild);
    poses++;
  }

  peindreLaPortee();
  log(`🎯 Sélecteur de portée posé sur ${poses} panneau(x)`);
}
