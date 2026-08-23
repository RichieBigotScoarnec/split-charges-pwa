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
import { decrireLieu } from '../utils/lieu.js';
import { resultatsDeRecherche, lieuAEcrire, requeteUtile } from '../utils/recherche-lieu.js';

/**
 * Délai d'attente avant d'interroger Nominatim
 *
 * Son usage est plafonné à une requête par seconde, et une frappe en produit
 * une par lettre. Attendre la fin de la saisie coûte une demi-seconde et évite
 * de saturer un service gratuit pour des requêtes que la suivante périme.
 */
const ATTENTE_FRAPPE = 600;

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
  poserUnique(document.getElementById('variableChargeLieuRecherche'), 'input', surFrappe);
  poserUnique(document.getElementById('variableChargeLieuRecherche'), 'keydown', surEntree);
  poserUnique(document.getElementById('variableChargeLieuIci'), 'click', surPositionActuelle);
  poserUnique(document.getElementById('variableChargeLieuRetirer'), 'click', surRetrait);
  log('📦 Module choix du lieu initialisé');
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
 * Interroge Nominatim et affiche les propositions
 *
 * @param {string} saisie
 * @returns {Promise<void>}
 */
async function lancerRecherche(saisie) {
  if (!requeteUtile(saisie)) return;

  const mien = ++_rang;
  afficherEtat('Recherche…');

  try {
    const reponse = await fetch(
      'https://nominatim.openstreetmap.org/search'
      + `?q=${encodeURIComponent(saisie.trim())}`
      + '&format=json&addressdetails=1&limit=8&accept-language=fr'
    );
    if (!reponse.ok) throw new Error(`Nominatim a répondu ${reponse.status}`);

    const resultats = resultatsDeRecherche(await reponse.json());

    // Une réponse dépassée ne doit pas écraser la liste courante.
    if (mien !== _rang) return;

    if (resultats.length === 0) {
      afficherEtat('Aucun lieu de ce nom');
      return;
    }

    rendreResultats(resultats);
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
 * @param {Array<Object>} resultats
 * @returns {void}
 */
function rendreResultats(resultats) {
  const liste = document.getElementById('variableChargeLieuResultats');
  if (!liste) return;

  liste.innerHTML = resultats.map((resultat, rang) => `
    <button type="button" class="lieu-resultat" data-rang="${rang}">
      ${escapeHtml(resultat.etiquette)}
    </button>
  `).join('');

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
