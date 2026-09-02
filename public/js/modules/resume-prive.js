// ===== MODULE : LE BLOC PRIVÉ DU RÉSUMÉ =====
//
// Le suivi personnel a besoin de ses dépenses privées sous les yeux, et l'écran
// qui les porte est celui qu'on ouvre en public — dans le train, au bureau,
// posé sur la table du salon.
//
// ## Ce que le masquage couvre, et ce qu'il ne couvre pas
//
// Il couvre le COUP D'ŒIL : téléphone posé, aperçu d'application, capture
// d'écran, épaule qui passe. Il ne couvre pas la personne assise à côté — une
// fois affichée, la ligne se lit aussi bien qu'un titre. C'est une politesse,
// pas une serrure, et le mur reste là où il doit être : dans les règles
// Firebase, que ce fichier ne fait qu'habiller.
//
// ## Masqué n'est pas caché : c'est ABSENT
//
// Le montant n'est pas rendu puis dissimulé par du style — il n'est pas lu du
// tout. Rien n'est demandé à la base tant qu'on n'a pas appuyé sur « Afficher ».
// Il n'y a donc rien à sélectionner, rien à copier, rien qu'un lecteur d'écran
// puisse annoncer, et rien dans l'état de l'application qu'une sauvegarde
// pourrait emporter. Un `filter: blur()` n'aurait rien de tout cela.
//
// Le caviardage a une LARGEUR FIXE : 3 € et 3 000 € occupent le même bloc.
// Une largeur proportionnelle rendrait l'ordre de grandeur lisible sans rien
// dévoiler, ce qui est la moitié de l'information.
//
// ## Ce bloc ne porte QUE mes dépenses — décision du 2026-09-02
//
// Une version antérieure y ajoutait une ligne « Publié par {l'autre} ». Elle a
// été retirée, et la raison mérite d'être écrite parce qu'elle ne se redécouvre
// pas : une dépense privée est financée sur la part de son propriétaire, elle
// ne bouge donc AUCUN chiffre dont je sois comptable — ni le solde, ni mon
// reste à vivre. Ce total n'avait aucune fonction sur mon résumé ; il n'y était
// qu'un bulletin mensuel sur quelqu'un d'autre, remis sans avoir été demandé,
// sur l'écran que j'ouvre chaque jour pour autre chose.
//
// L'écran privé (`prive.js`) continue de montrer les deux côtés, et c'est sa
// place : on y va délibérément, et la réciprocité y est le sujet. La différence
// n'est pas la donnée, c'est le geste.
//
// Le défaut retenu est l'absence parce que, dans une application de couple, un
// défaut ne se change pas gratuitement : remettre la ligne n'appelle aucune
// explication, la retirer après des mois en appellerait une.

import { getState } from '../state.js';
import { escapeHtml, formatCurrency } from '../utils/format.js';
import { warn } from '../utils/debug.js';
import { normaliserEmplacement } from '../utils/members.js';
import { normaliserDepensesPrivees, resumePublie } from '../utils/confidentialite.js';

/** La racine hors `household` — même nom que `prive.js` */
const RACINE_PRIVE = 'prive';

/** Ce que la ligne désigne. Une seule : la mienne. */
const LIGNES = Object.freeze(['mien']);

/** Le libellé de la ligne, repris tel quel par les étiquettes d'accessibilité */
const NOM = 'Mes dépenses privées';

/** L'emplacement du compte connecté */
function moi() {
  return normaliserEmplacement(getState('emplacementCourant'));
}

/**
 * Le bloc privé du panneau personnel
 *
 * Rendu masqué, toujours : il n'existe aucun chemin par lequel un montant privé
 * entre dans le document au premier rendu.
 *
 * @returns {string} Fragment échappé
 */
export function blocPriveDuResume() {
  return `
    <div class="resume-prive">
      <div class="resume-prive-titre">Mon espace privé</div>

      <div class="resume-prive-ligne" data-prive="mien">
        <span class="resume-prive-nom">${escapeHtml(NOM)}</span>
        <span class="resume-prive-valeur resume-prive-valeur--masque"
              role="img" aria-label="${escapeHtml(NOM)} : masqué"></span>
        <button type="button" class="resume-prive-bouton"
                data-action="devoilerPrive" data-arg="mien"
                aria-expanded="false"
                aria-label="Afficher ${escapeHtml(NOM.toLowerCase())}">Afficher</button>
      </div>

      <p class="resume-prive-aide">
        Le montant se referme en quittant l'onglet ou l'application.
      </p>

      <button type="button" class="summary-row summary-row--ouvrable"
              data-action="showPrivateExpensesModal">
        <span>Gérer mes dépenses privées et le partage</span>
        <strong>Ouvrir</strong>
      </button>
    </div>`;
}

/**
 * Ce que la ligne doit dire une fois dévoilée
 *
 * @returns {Promise<string>} Texte à afficher
 */
async function valeurDeLaLigne() {
  const emplacement = moi();
  const periode = getState('currentPeriod');

  if (!emplacement || !periode) return 'indisponible';

  const { dbGetAbsolu } = await import('../db.js');
  const resume = resumePublie(normaliserDepensesPrivees(
    await dbGetAbsolu(`${RACINE_PRIVE}/${emplacement}/periods/${periode}/depenses`)));

  if (resume.nombre === 0) return 'aucune ce mois-ci';
  return `${formatCurrency(resume.montant)} · ${resume.nombre} dépense${resume.nombre > 1 ? 's' : ''}`;
}

/**
 * Le jeton qui rend une lecture périmable
 *
 * `aria-expanded` ne peut pas jouer ce rôle : il vaut `false` aussi bien pour
 * une ligne jamais ouverte que pour une ligne refermée pendant que la base
 * répondait. Les deux cas se ressemblent, et l'un des deux fait apparaître un
 * montant sur un écran que son propriétaire croit fermé.
 *
 * Un jeton par ligne, renouvelé à chaque geste : la réponse qui revient n'écrit
 * que si personne n'a rien fait entre-temps.
 */
let compteur = 0;

function jetonNeuf(ligne) {
  compteur += 1;
  ligne.dataset.jeton = String(compteur);
  return ligne.dataset.jeton;
}

/** Remet une ligne dans son état masqué */
function remasquer(ligne) {
  jetonNeuf(ligne);
  const valeur = ligne.querySelector('.resume-prive-valeur');
  const bouton = ligne.querySelector('.resume-prive-bouton');
  const nom = ligne.querySelector('.resume-prive-nom')?.textContent || '';
  if (!valeur || !bouton) return;

  // Le texte est RETIRÉ, pas caché : la valeur quitte le document.
  valeur.textContent = '';
  valeur.classList.add('resume-prive-valeur--masque');
  valeur.setAttribute('role', 'img');
  valeur.setAttribute('aria-label', `${nom} : masqué`);
  bouton.textContent = 'Afficher';
  bouton.setAttribute('aria-expanded', 'false');
  bouton.setAttribute('aria-label', `Afficher ${nom.toLowerCase()}`);
}

/**
 * Referme le bloc
 *
 * Appelée quand l'application passe en arrière-plan — c'est le moment exact où
 * l'écran devient une vignette dans le sélecteur d'applications, et où un
 * montant affiché survivrait à l'attention de son propriétaire.
 *
 * @returns {void}
 */
export function masquerLePrive() {
  document.querySelectorAll('.resume-prive-ligne').forEach(remasquer);
}

/**
 * Dévoile la ligne, ou la referme si elle l'est déjà
 *
 * La lecture n'a lieu qu'ici : tant que personne n'a appuyé, rien n'a été
 * demandé à la base.
 *
 * @param {'mien'} quoi
 * @returns {Promise<void>}
 */
export async function devoilerPrive(quoi) {
  if (!LIGNES.includes(quoi)) return;

  const ligne = document.querySelector(`.resume-prive-ligne[data-prive="${quoi}"]`);
  if (!ligne) return;

  const valeur = ligne.querySelector('.resume-prive-valeur');
  const bouton = ligne.querySelector('.resume-prive-bouton');
  const nom = ligne.querySelector('.resume-prive-nom')?.textContent || '';
  if (!valeur || !bouton) return;

  if (bouton.getAttribute('aria-expanded') === 'true') {
    remasquer(ligne);
    return;
  }

  const jeton = jetonNeuf(ligne);

  let texte;
  try {
    texte = await valeurDeLaLigne();
  } catch (erreur) {
    // Un échec de lecture ne doit pas ressembler à une absence de dépenses :
    // la ligne dit qu'elle n'a pas pu lire, ce qui est une troisième chose.
    warn('⚠️ Ligne privée illisible :', erreur);
    texte = 'lecture impossible';
  }

  // La ligne a pu être refermée pendant la lecture — passage en arrière-plan,
  // bascule d'onglet, second appui. Écrire la valeur maintenant la ferait
  // apparaître sur un écran que son propriétaire croit fermé.
  if (ligne.dataset.jeton !== jeton || !ligne.isConnected) return;

  valeur.textContent = texte;
  valeur.classList.remove('resume-prive-valeur--masque');
  valeur.removeAttribute('role');
  valeur.removeAttribute('aria-label');
  bouton.textContent = 'Masquer';
  bouton.setAttribute('aria-expanded', 'true');
  bouton.setAttribute('aria-label', `Masquer ${nom.toLowerCase()}`);
}

/** Un seul écouteur, quel que soit le nombre de rendus */
let ecouteurPose = false;

/**
 * Initialise le module
 * @returns {void}
 */
export function initResumePrive() {
  window.devoilerPrive = devoilerPrive;

  if (ecouteurPose || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) masquerLePrive();
  });
  ecouteurPose = true;
}
