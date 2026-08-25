import { describe, it, expect } from 'vitest';
import { actionDemandee, ouvreLaSaisieRapide, urlSansAction, ACTIONS } from '../../public/js/utils/raccourci.js';

/**
 * Ce que l'URL demande à l'ouverture
 *
 * Le manifeste déclare un raccourci : un appui long sur l'icône propose
 * « ⚡ Saisie rapide », qui ouvre `?action=quick-add`. La même URL peut être
 * posée sur l'écran d'accueil comme seconde icône — celle-là s'ouvre d'un seul
 * appui, ce que le menu contextuel ne permet pas.
 *
 * Un vrai widget Android reste hors de portée : il exige un
 * `AppWidgetProvider`, donc une application native.
 */

describe('L\'action demandée', () => {
  it('reconnaît la saisie rapide', () => {
    expect(actionDemandee('?action=quick-add')).toBe(ACTIONS.SAISIE_RAPIDE);
    expect(ouvreLaSaisieRapide('?action=quick-add')).toBe(true);
  });

  it('la reconnaît au milieu d\'autres paramètres', () => {
    expect(ouvreLaSaisieRapide('?sandbox=1&action=quick-add&diag=1')).toBe(true);
  });

  it('ignore une action inconnue plutôt que de s\'en plaindre', () => {
    // L'URL peut venir d'un raccourci créé par une version antérieure, ou
    // d'un lien recopié à la main : ouvrir normalement est le bon réflexe.
    expect(actionDemandee('?action=fantaisie')).toBeNull();
    expect(ouvreLaSaisieRapide('?action=fantaisie')).toBe(false);
  });

  it('ne voit rien dans une URL ordinaire', () => {
    expect(actionDemandee('')).toBeNull();
    expect(actionDemandee('?sandbox=1')).toBeNull();
    expect(ouvreLaSaisieRapide(null)).toBe(false);
  });
});

describe('Le nettoyage de l\'URL', () => {
  it('retire l\'action une fois honorée', () => {
    // Sans cela, un rafraîchissement rouvrirait la modale sans qu'on l'ait
    // demandé, et le lien mis en favori emporterait l'intention avec lui.
    expect(urlSansAction('https://exemple.fr/FairSplit.html?action=quick-add'))
      .toBe('https://exemple.fr/FairSplit.html');
  });

  it('laisse les paramètres qui décrivent le mode d\'exécution', () => {
    // `?sandbox=1`, `?diag=1` et `?emulator=1` doivent survivre au
    // rafraîchissement : ils ne décrivent pas une intention ponctuelle.
    expect(urlSansAction('https://exemple.fr/FairSplit.html?sandbox=1&action=quick-add&diag=1'))
      .toBe('https://exemple.fr/FairSplit.html?sandbox=1&diag=1');
  });

  it('conserve l\'ancre', () => {
    expect(urlSansAction('https://exemple.fr/FairSplit.html?action=quick-add#bilan'))
      .toBe('https://exemple.fr/FairSplit.html#bilan');
  });

  it('ne rend rien quand il n\'y a rien à retirer', () => {
    // `replaceState` n'a alors pas lieu d'être appelé.
    expect(urlSansAction('https://exemple.fr/FairSplit.html')).toBeNull();
    expect(urlSansAction('https://exemple.fr/FairSplit.html?sandbox=1')).toBeNull();
    expect(urlSansAction('pas une url')).toBeNull();
  });
});
