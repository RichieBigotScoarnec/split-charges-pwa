// ===== MODULE : CHOISIR UN LIEU APRÈS COUP =====
//
// Le lieu d'une dépense ne s'écrivait que par le GPS, au moment de la saisie
// rapide. C'est le bon moment quand on paie ; c'est le mauvais dès qu'on note
// la dépense plus tard. Un verre bu hier soir, saisi le lendemain depuis chez
// soi, épinglait le domicile — ou rien du tout si l'on passait par le
// formulaire complet, qui n'a jamais su écrire de lieu.
//
// Ce module ajoute la question inverse : non pas « où suis-je ? » mais « où
// étions-nous ? ». On tape un nom, Nominatim rend une liste, on choisit.

import { toast } from '../components/toast.js';
import { escapeHtml } from '../utils/format.js';
import { log, warn } from '../utils/debug.js';
import { exigerElement } from '../utils/diagnostics.js';
import { getState } from '../state.js';
import { decrireLieu } from '../utils/lieu.js';
import {
  resultatsDeRecherche,
  lieuAEcrire,
  requeteUtile,
  boiteDeRecherche,
  distanceLisible
} from '../utils/recherche-lieu.js';

/**
 * Délai d'attente avant d'interroger Nominatim
 *
 * Son usage est plafonné à une requête par seconde, et une frappe en produit
 * une par lettre. Attendre la fin de la saisie coûte une demi-seconde et évite
 * de saturer un service gratuit pour des requêtes que la suivante périme.
 */
const ATTENTE_FRAPPE = 600;

/**
 * Rayon de la recherche de proximité, en kilomètres
 *
 * Assez large pour couvrir la journée : la côte depuis Argelès, une ville
 * voisine, un col. Assez étroit pour qu'un homonyme d'un autre pays n'y entre
 * pas — ce qui est tout l'objet.
 */
const RAYON_PROXIMITE_KM = 60;

/** Le lieu retenu pour la charge en cours d'édition, ou null */
let _lieuChoisi = null;

/** Minuteur de la frappe en cours */
let _minuteur = null;

/**
 * Numéro de la dernière recherche lancée
 *
 * Deux requêtes parties à la suite peuvent revenir dans le désordre : la
 * réponse d'une saisie abandonnée écraserait alors la liste de la saisie
 * courante. Ne rendre que la plus récente est la seule façon d'y échapper —
 * `fetch` n'annule pas ce qu'il a lancé.
 */
let _rang = 0;

/**
 * Le lieu actuellement retenu
 * @returns {Object|null} Prêt à écrire sur une charge
 */
export function lieuChoisi() {
  return _lieuChoisi;
}

/**
 * Impose un lieu — celui que la charge portait déjà, à la réouverture
 *
 * @param {Object|null} lieu - Champ `location` d'une charge
 * @returns {void}
 */
export function poserLieu(lieu) {
  _lieuChoisi = (lieu && Number.isFinite(lieu.lat) && Number.isFinite(lieu.lng)) ? { ...lieu } : null;
  viderResultats();
  const champ = document.getElementById('variableChargeLieuRecherche');
  if (champ) champ.value = '';
  rendreLieuRetenu();
}

/** Repart de zéro, à l'ouverture d'un ajout */
export function reinitialiserLieu() {
  poserLieu(null);
}

/**
 * Branche le champ de recherche
 *
 * Appelé à chaque connexion : les écouteurs sont posés une seule fois grâce à
 * des gestionnaires de module, comme dans la saisie rapide où l'empilement
 * avait fini par déclencher trois soumissions pour une pression.
 *
 * @returns {void}
 */
export function initChoixLieu() {
  // `exigerElement` journalise bruyamment un identifiant absent. Sans lui, un
  // champ orphelin — parce que le balisage a bougé, ou parce qu'un service
  // worker sert un HTML et un JavaScript de versions différentes — reste
  // simplement inerte : on tape, on clique, il ne se passe rien, et rien nulle
  // part ne dit pourquoi. C'est exactement ce qui a été signalé.
  const champ = exigerElement('variableChargeLieuRecherche', 'chercher un lieu');
  poserUnique(champ, 'input', surFrappe);
  poserUnique(champ, 'keydown', surEntree);

  poserUnique(exigerElement('variableChargeLieuChercher', 'lancer la recherche de lieu'),
    'click', surBoutonChercher);
  poserUnique(exigerElement('variableChargeLieuIci', 'reprendre la position actuelle'),
    'click', surPositionActuelle);
  poserUnique(exigerElement('variableChargeLieuRetirer', 'retirer le lieu'),
    'click', surRetrait);

  // Marque visible depuis le DOM : elle permet à un test de bout en bout
  // d'affirmer que le branchement a réellement eu lieu, plutôt que de le
  // supposer parce que les éléments existent.
  if (champ) champ.dataset.lieuPret = 'oui';

  log('📦 Module choix du lieu initialisé');
}

/** Le bouton « chercher » : ce que l'utilisateur attendait de 📍 */
function surBoutonChercher() {
  const champ = document.getElementById('variableChargeLieuRecherche');
  const saisie = champ ? champ.value : '';

  if (!requeteUtile(saisie)) {
    // Ne jamais rester muet sur un geste explicite : un bouton qui ne répond
    // pas est indiscernable d'un bouton mort.
    afficherEtat('Tapez au moins trois lettres');
    return;
  }

  if (_minuteur) clearTimeout(_minuteur);
  lancerRecherche(saisie);
}

/**
 * Pose un écouteur en garantissant qu'il n'y en a qu'un
 * @param {Element|null} cible
 * @param {string} type
 * @param {Function} gestionnaire
 * @returns {void}
 */
function poserUnique(cible, type, gestionnaire) {
  if (!cible) return;
  cible.removeEventListener(type, gestionnaire);
  cible.addEventListener(type, gestionnaire);
}

/** Entrée ne doit pas soumettre le formulaire depuis ce champ */
function surEntree(evenement) {
  if (evenement.key !== 'Enter') return;
  evenement.preventDefault();
  lancerRecherche(evenement.target.value);
}

/** La frappe, une fois calmée */
function surFrappe(evenement) {
  const saisie = evenement.target.value;

  if (_minuteur) clearTimeout(_minuteur);

  if (!requeteUtile(saisie)) {
    viderResultats();
    return;
  }

  _minuteur = setTimeout(() => lancerRecherche(saisie), ATTENTE_FRAPPE);
}

/**
 * Où chercher en priorité
 *
 * Trois sources, de la plus sûre à la plus lointaine :
 *
 * 1. La position du téléphone, tenue à jour en arrière-plan par la saisie
 *    rapide. C'est la bonne réponse dans le cas courant — on note le soir
 *    même, depuis chez soi, un verre bu à quelques kilomètres.
 * 2. Le lieu déjà porté par la charge qu'on rouvre : on cherche alors
 *    vraisemblablement dans le même coin.
 * 3. La dernière dépense localisée. Sur un ordinateur, sans GPS, c'est tout ce
 *    qu'on a — et cela vaut infiniment mieux que la planète entière.
 *
 * Aucune n'est vérifiée pour sa fraîcheur : une position d'hier désigne encore
 * la bonne région, et c'est une région qu'on cherche ici, pas une adresse.
 *
 * @returns {{lat: number, lng: number}|null}
 */
function centreDeRecherche() {
  const cache = getState('cachedGpsPosition');
  if (point(cache)) return { lat: cache.lat, lng: cache.lng };

  if (point(_lieuChoisi)) return { lat: _lieuChoisi.lat, lng: _lieuChoisi.lng };

  const charges = getState('variableCharges');
  if (!Array.isArray(charges)) return null;

  let recente = null;
  for (const charge of charges) {
    if (!charge || charge.deleted) continue;
    if (!point(charge.location)) continue;
    const instant = Number.isFinite(charge.timestamp) ? charge.timestamp : 0;
    if (!recente || instant >= recente.instant) {
      recente = { instant, lat: charge.location.lat, lng: charge.location.lng };
    }
  }

  return recente ? { lat: recente.lat, lng: recente.lng } : null;
}

/**
 * Un objet porte-t-il des coordonnées exploitables ?
 * @param {*} valeur
 * @returns {boolean}
 */
function point(valeur) {
  return Boolean(valeur) && typeof valeur === 'object'
    && Number.isFinite(valeur.lat) && Number.isFinite(valeur.lng);
}

/**
 * Un appel à Nominatim, cadré ou non
 *
 * `bounded=1` transforme `viewbox` d'une préférence en une contrainte. La
 * nuance décide de tout : sans lui, un homonyme mondialement connu reste rendu
 * avant le bar d'à côté, qui n'apparaît alors dans aucune des dix réponses —
 * et aucun tri côté application ne peut classer ce qu'il n'a pas reçu.
 *
 * @param {string} saisie
 * @param {{lat: number, lng: number}|null} centre - null pour chercher partout
 * @returns {Promise<*>} Corps JSON
 */
async function interroger(saisie, centre) {
  const parametres = new URLSearchParams({
    q: saisie.trim(),
    format: 'json',
    addressdetails: '1',
    limit: '10',
    'accept-language': 'fr'
  });

  const boite = centre ? boiteDeRecherche(centre, RAYON_PROXIMITE_KM) : null;
  if (boite) {
    parametres.set('viewbox', boite);
    parametres.set('bounded', '1');
  }

  const reponse = await fetch(`https://nominatim.openstreetmap.org/search?${parametres}`);
  if (!reponse.ok) throw new Error(`Nominatim a répondu ${reponse.status}`);
  return reponse.json();
}

/**
 * Interroge Nominatim et affiche les propositions
 *
 * En deux temps quand on sait où se trouve l'utilisateur : d'abord les
 * environs seuls, puis le monde entier si les environs ne rendent rien. Le
 * second appel n'a lieu que sur un échec, et l'élargissement est annoncé —
 * une liste de villes lointaines présentée sans un mot est exactement ce qui a
 * été signalé à l'usage.
 *
 * Restait un cas que le repli automatique n'attrape pas : le bar des vacances,
 * à deux cents kilomètres, quand une enseigne du même nom existe à côté de
 * chez soi. Les environs répondent, donc rien ne s'élargit, et la bonne
 * réponse n'est jamais demandée. D'où la sortie explicite : `partout`.
 *
 * @param {string} saisie
 * @param {{partout?: boolean}} [options] - `partout` ignore le cadrage
 * @returns {Promise<void>}
 */
async function lancerRecherche(saisie, options = {}) {
  if (!requeteUtile(saisie)) return;

  const mien = ++_rang;
  const centre = centreDeRecherche();
  const cadrer = Boolean(centre) && !options.partout;
  afficherEtat(cadrer ? 'Recherche autour de vous…' : 'Recherche…');

  try {
    let resultats = cadrer
      ? resultatsDeRecherche(await interroger(saisie, centre), { centre })
      : [];

    // Une réponse dépassée ne doit pas relancer un second appel pour rien.
    if (mien !== _rang) return;

    const elargi = cadrer && resultats.length === 0;
    if (resultats.length === 0) {
      resultats = resultatsDeRecherche(await interroger(saisie, null), { centre });
    }

    // Une réponse dépassée ne doit pas écraser la liste courante.
    if (mien !== _rang) return;

    if (resultats.length === 0) {
      afficherEtat('Aucun lieu de ce nom');
      return;
    }

    // La sortie n'est proposée que si le cadrage a effectivement restreint la
    // réponse : après un élargissement, il n'y a plus rien à élargir.
    rendreResultats(resultats, { elargi, cadree: cadrer && !elargi, saisie });
  } catch (erreur) {
    if (mien !== _rang) return;
    // Hors ligne ou service indisponible : le formulaire reste utilisable, la
    // charge s'enregistre sans lieu. Un bandeau d'erreur pour un confort
    // apprendrait à ignorer les bandeaux d'erreur.
    warn('[Lieu] Recherche indisponible :', erreur?.message || erreur);
    afficherEtat('Recherche indisponible');
  }
}

/**
 * Reprend la position du téléphone — utile quand on y est encore
 * @returns {void}
 */
function surPositionActuelle() {
  if (!navigator.geolocation) {
    toast.error('Géolocalisation indisponible');
    return;
  }

  afficherEtat('Position…');

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      try {
        const reponse = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}`
          + '&format=json&addressdetails=1&zoom=18&accept-language=fr'
        );
        const decrit = reponse.ok ? decrireLieu(await reponse.json()) : null;

        _lieuChoisi = lieuAEcrire({
          etiquette: decrit?.etiquette || 'Position',
          commune: decrit?.commune,
          codePostal: decrit?.codePostal,
          lat,
          lng
        });
      } catch {
        // La position vaut sans son nom : elle place quand même le marqueur.
        _lieuChoisi = lieuAEcrire({ etiquette: 'Position', lat, lng });
      }

      viderResultats();
      rendreLieuRetenu();
    },
    () => {
      afficherEtat('Position indisponible');
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

/** Détache le lieu de la charge */
function surRetrait() {
  _lieuChoisi = null;
  rendreLieuRetenu();
}

// ===== RENDU =====

/**
 * Affiche les propositions, chacune cliquable
 *
 * La distance est affichée dès qu'on la connaît. Elle sert deux fois : elle
 * départage deux enseignes du même nom, et elle rend lisible d'un coup d'œil le
 * cas qui a été signalé — « 6 400 km » sous une proposition dit ce qu'aucune
 * liste nue ne disait.
 *
 * @param {Array<Object>} resultats
 * @param {{elargi?: boolean, cadree?: boolean, saisie?: string}} [contexte]
 * @returns {void}
 */
function rendreResultats(resultats, contexte = {}) {
  const liste = document.getElementById('variableChargeLieuResultats');
  if (!liste) return;

  const entete = contexte.elargi
    ? '<p class="lieu-etat">Rien de ce nom près de vous — voici ailleurs</p>'
    : '';

  const sortie = contexte.cadree
    ? '<button type="button" class="lieu-elargir">Ce n\'est pas là ? Chercher plus loin</button>'
    : '';

  liste.innerHTML = entete + resultats.map((resultat, rang) => {
    const distance = distanceLisible(resultat.distanceKm);
    const suffixe = distance
      ? `<span class="lieu-resultat-distance">${escapeHtml(distance)}</span>`
      : '';
    return `
    <button type="button" class="lieu-resultat" data-rang="${rang}">
      <span class="lieu-resultat-nom">${escapeHtml(resultat.etiquette)}</span>
      ${suffixe}
    </button>
  `;
  }).join('') + sortie;

  const elargir = liste.querySelector('.lieu-elargir');
  if (elargir) {
    elargir.addEventListener('click', () => lancerRecherche(contexte.saisie || '', { partout: true }));
  }

  liste.querySelectorAll('.lieu-resultat').forEach(bouton => {
    bouton.addEventListener('click', () => {
      _lieuChoisi = lieuAEcrire(resultats[Number(bouton.dataset.rang)]);
      const champ = document.getElementById('variableChargeLieuRecherche');
      if (champ) champ.value = '';
      viderResultats();
      rendreLieuRetenu();
    });
  });

  liste.hidden = false;
}

/**
 * Affiche un état passager à la place des propositions
 * @param {string} texte
 * @returns {void}
 */
function afficherEtat(texte) {
  const liste = document.getElementById('variableChargeLieuResultats');
  if (!liste) return;
  liste.innerHTML = `<p class="lieu-etat">${escapeHtml(texte)}</p>`;
  liste.hidden = false;
}

/** Efface les propositions */
function viderResultats() {
  const liste = document.getElementById('variableChargeLieuResultats');
  if (!liste) return;
  liste.innerHTML = '';
  liste.hidden = true;
}

/** Affiche le lieu retenu, ou rien */
function rendreLieuRetenu() {
  const zone = document.getElementById('variableChargeLieuRetenu');
  const nom = document.getElementById('variableChargeLieuNom');
  if (!zone || !nom) return;

  if (!_lieuChoisi) {
    zone.hidden = true;
    nom.textContent = '';
    return;
  }

  nom.textContent = _lieuChoisi.name || 'Position';
  zone.hidden = false;
}
