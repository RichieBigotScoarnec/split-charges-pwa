// @vitest-environment jsdom
/**
 * Les messages sont annoncés, pas seulement affichés
 *
 * Le conteneur des toasts ne portait aucune région vivante. Tout le retour de
 * l'application — « Charge enregistrée », « Erreur : impossible de
 * sauvegarder » — passait donc muet pour un lecteur d'écran, alors que chaque
 * bandeau du HTML porte scrupuleusement son `role="status"`. Le seul retour
 * d'une saisie était la fermeture de la modale, qui ne distingue pas la
 * réussite de l'échec.
 */

import { describe, it, expect } from 'vitest';
import { toast } from '../../public/js/components/toast.js';

describe('Annoncer les messages', () => {

  // Le corps n'est pas vidé entre deux cas, et c'est délibéré : le conteneur
  // est mémorisé dans le module, qui ne le recrée que s'il est absent de sa
  // variable — pas de la page. Le détacher laisserait le module écrire dans un
  // nœud hors document, et tous les cas suivants chercheraient dans le vide.
  // Rien ne vide le corps en session ; le nettoyage n'aurait fabriqué qu'un
  // faux échec.

  /** Le conteneur, tel que le module l'a posé */
  const conteneur = () => document.getElementById('toast-container');

  it('pose une région vivante avant tout message', () => {
    toast.success('Charge enregistrée');

    const region = conteneur();
    expect(region, 'aucun conteneur').not.toBeNull();
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  it('ne relit pas le bloc entier à chaque ajout', () => {
    // `aria-atomic="true"` ferait relire tous les messages présents dès qu'un
    // nouveau arrive — deux toasts simultanés, et le premier repasse.
    toast.info('Premier');

    expect(conteneur().getAttribute('aria-atomic')).toBe('false');
  });

  it('met le message dans la région, et non à côté', () => {
    // Une région doit exister dans la page avant que son contenu change :
    // poser l'attribut sur chaque message au lieu du conteneur ne déclencherait
    // aucune annonce.
    toast.success('Charge enregistrée');

    expect(conteneur().textContent).toContain('Charge enregistrée');
  });

  it('fait passer une erreur devant', () => {
    const region = conteneur() || (toast.info('amorce'), conteneur());
    const avant = region.querySelectorAll('.toast').length;

    toast.error('Erreur : impossible de sauvegarder');

    const messages = region.querySelectorAll('.toast');
    expect(messages.length).toBeGreaterThan(avant);

    const erreur = region.querySelector('.toast.error');
    expect(erreur, 'le message d\'erreur est absent').not.toBeNull();
    expect(erreur.getAttribute('role')).toBe('alert');
    expect(erreur.getAttribute('aria-live')).toBe('assertive');
  });

  it('laisse les autres messages attendre leur tour', () => {
    toast.success('Charge enregistrée');

    const reussite = [...conteneur().querySelectorAll('.toast.success')].pop();
    // Pas de `role="alert"` : une confirmation n'a pas à couper la parole.
    expect(reussite.getAttribute('role')).toBeNull();
  });
});
