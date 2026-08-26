// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ecouterUneFois, oublierLesEcouteurs } from '../../public/js/utils/ecouteur.js';

/**
 * Un écouteur posé une fois, quel que soit le nombre d'initialisations
 *
 * `initializeAppData()` rejoue en entier à chaque connexion — le drapeau
 * `appInitialized` retombe à `false` à la déconnexion, et il le faut. Mais les
 * éléments du HTML, eux, n'ont pas bougé : chaque module leur reposait un
 * second écouteur.
 */

describe('Poser un écouteur une seule fois', () => {
  let bouton;

  beforeEach(() => {
    document.body.innerHTML = '<button id="b">Ajouter</button>';
    bouton = document.getElementById('b');
  });

  it('pose l\'écouteur la première fois', () => {
    const appele = vi.fn();

    expect(ecouterUneFois(bouton, 'click', appele)).toBe(true);
    bouton.click();

    expect(appele).toHaveBeenCalledTimes(1);
  });

  it('ne le repose pas à la seconde initialisation', () => {
    const appele = vi.fn();

    ecouterUneFois(bouton, 'click', appele);
    expect(ecouterUneFois(bouton, 'click', appele)).toBe(false);
    bouton.click();

    // C'est tout le défaut : deux écouteurs, un seul appui, deux exécutions.
    expect(appele, 'l\'écouteur a été posé deux fois').toHaveBeenCalledTimes(1);
  });

  it('refuse même un gestionnaire différent — c\'est la reprise qu\'on empêche', () => {
    // Les modules recréent leur closure à chaque initialisation : comparer les
    // fonctions ne servirait à rien, elles ne sont jamais identiques.
    const premier = vi.fn();
    const second = vi.fn();

    ecouterUneFois(bouton, 'click', premier);
    ecouterUneFois(bouton, 'click', second);
    bouton.click();

    expect(premier).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('distingue deux types d\'événement sur la même cible', () => {
    const auClic = vi.fn();
    const auClavier = vi.fn();

    ecouterUneFois(bouton, 'click', auClic);
    ecouterUneFois(bouton, 'keydown', auClavier);

    bouton.click();
    bouton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(auClic).toHaveBeenCalledTimes(1);
    expect(auClavier).toHaveBeenCalledTimes(1);
  });

  it('accepte deux écouteurs du même type sous deux noms', () => {
    const premier = vi.fn();
    const second = vi.fn();

    ecouterUneFois(bouton, 'click', premier, 'ouvrir');
    expect(ecouterUneFois(bouton, 'click', second, 'journaliser')).toBe(true);
    bouton.click();

    expect(premier).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('tient deux cibles séparément', () => {
    document.body.innerHTML = '<button id="a"></button><button id="c"></button>';
    const a = document.getElementById('a');
    const c = document.getElementById('c');
    const appele = vi.fn();

    expect(ecouterUneFois(a, 'click', appele)).toBe(true);
    expect(ecouterUneFois(c, 'click', appele)).toBe(true);

    a.click();
    c.click();
    expect(appele).toHaveBeenCalledTimes(2);
  });

  it('ne lève pas sur une cible absente', () => {
    // `document.getElementById` rend `null` quand le balisage a changé : les
    // modules passent ce résultat directement, comme ils le faisaient avec le
    // `if (element)` que cette fonction remplace.
    expect(ecouterUneFois(null, 'click', vi.fn())).toBe(false);
    expect(ecouterUneFois(undefined, 'click', vi.fn())).toBe(false);
    expect(ecouterUneFois({}, 'click', vi.fn())).toBe(false);
  });

  it('accepte document et window, qui n\'ont pas de dataset', () => {
    // C'est la raison du registre hors du DOM : l'idiome précédent posait un
    // attribut sur l'élément, ce qui exclut ces deux cibles-là.
    const appele = vi.fn();

    expect(ecouterUneFois(document, 'visibilitychange', appele)).toBe(true);
    expect(ecouterUneFois(document, 'visibilitychange', appele)).toBe(false);

    oublierLesEcouteurs(document);
  });

  it('repart de zéro après un oubli', () => {
    const appele = vi.fn();

    ecouterUneFois(bouton, 'click', () => appele());
    oublierLesEcouteurs(bouton);

    // L'oubli ne retire pas l'écouteur déjà posé : il autorise seulement à en
    // reposer un. Deux écouteurs, donc deux appels — c'est bien ce qu'on veut
    // constater ici, faute de quoi le test ne prouverait pas grand-chose.
    //
    // Deux fonctions distinctes, et non deux fois la même : `addEventListener`
    // déduplique lui-même un référent identique sur un même type, ce qui
    // masquerait la reprise qu'on cherche justement à observer. C'est aussi
    // pourquoi le registre ne peut pas se contenter de cette déduplication
    // native — les modules recréent leur closure à chaque initialisation.
    expect(ecouterUneFois(bouton, 'click', () => appele())).toBe(true);
    bouton.click();
    expect(appele).toHaveBeenCalledTimes(2);
  });
});
