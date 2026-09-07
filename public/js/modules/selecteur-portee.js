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
 * de 43 actions borne précisément ; un onglet « n'a pas besoin de cette
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
 * ## Ce que ce module ne fait pas
 *
 * **Il n'affiche encore rien de différent.** Il pose la portée dans l'état ;
 * ce sont les vues du lot 6 qui la liront pour montrer le solo et le privé.
 * C'est une dette assumée et bornée à un lot : un sélecteur qui ne gouverne
 * rien enseignerait que la moitié des commandes ne font rien — l'argument
 * exact qui l'écarte de Réglages — et il ne doit donc pas rester ainsi.
 */

import { setState, getState } from '../state.js';
import { PORTEES, porteeValide, panneauPorteLaPortee, porteeRetenue } from '../utils/portee.js';
import { log } from '../utils/debug.js';

/** Les panneaux candidats. `panneauPorteLaPortee` tranche, pas cette liste. */
const PANNEAUX = ['panneauBilan', 'panneauCharges', 'panneauReglages'];

/**
 * Les trois segments, dans l'ordre où on les lit
 *
 * Les libellés sont ici et nulle part ailleurs : un intitulé recopié dans le
 * HTML et dans le JS finit par ne plus dire la même chose.
 */
const SEGMENTS = [
  { portee: PORTEES.DEUX, libelle: 'À deux' },
  { portee: PORTEES.SOLO, libelle: 'Moi' },
  { portee: PORTEES.PRIVE, libelle: 'Privé' }
];

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
    groupe.appendChild(segment);
  }

  return groupe;
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
 * @returns {void}
 */
function peindreLEtat() {
  const active = porteeRetenue(getState('porteeCourante'));

  for (const segment of document.querySelectorAll('[data-portee]')) {
    segment.setAttribute('aria-checked', String(segment.dataset.portee === active));
  }
}

/**
 * Applique une portée demandée
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
  peindreLEtat();
}

/**
 * Pose les sélecteurs et branche les gestes
 *
 * @returns {void}
 */
export function initSelecteurPortee() {
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

  peindreLEtat();
  log(`🎯 Sélecteur de portée posé sur ${poses} panneau(x)`);
}
